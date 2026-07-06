"""
Tone DSP service — acoustic scoring of Mandarin tones from raw audio.

This is the *acoustic* half of pronunciation scoring (the other half is identity
scoring in ``pinyin_scorer``). It answers "was the tone CONTOUR realized
correctly", which an LLM transcription cannot verify — only the actual pitch
track can.

Pipeline:
  WAV PCM bytes -> parselmouth F0 contour (Praat pitch tracker)
    -> split into voiced syllable segments (count aligned to target syllables)
    -> Log-Z-Score normalize (cancels speaker pitch-range differences)
    -> per syllable: DTW-align against the expected Chao tone template
    -> tone score from the DTW alignment distance

Heavy deps (parselmouth/numpy) are imported lazily inside functions so the
module can be imported on a memory-constrained host without paying the cost
until a scoring request actually arrives.

No ffmpeg dependency: the client encodes WAV PCM directly (Web Audio), and we
decode with the stdlib ``wave`` module.
"""
from __future__ import annotations

import io
import logging
import wave

logger = logging.getLogger(__name__)

# Chao 5-level tone letters for the four Mandarin tones (+ neutral). These are
# the canonical pitch targets used in phonetics; values are on a 1..5 scale.
# Reference contours are sampled from these so we need NO native-speaker data.
_TONE_TEMPLATES: dict[int, list[float]] = {
    1: [5.0, 5.0, 5.0],        # high level   (55)
    2: [3.0, 4.0, 5.0],        # rising       (35)
    3: [2.0, 1.0, 1.0, 4.0],   # dipping      (214)
    4: [5.0, 3.0, 1.0],        # falling      (51)
    5: [3.0, 3.0],             # neutral      (mid, light)
}

# Pitch tracking bounds (Hz). Wide enough for both male and female learners.
# These are the WIDE first-pass bounds; the second pass narrows around the
# speaker's own measured range (see _extract_f0).
_F0_FLOOR = 70.0
_F0_CEILING = 400.0
_MIN_VOICED_FRAMES = 3

# Two-pass pitch floor/ceiling factors (Hirst's method): after a wide first pass,
# re-track between q15 * this_low and q85 * this_high of the speaker's own pitch
# distribution. This cuts octave errors far better than fixed global bounds.
_PASS2_FLOOR_FACTOR = 0.75
_PASS2_CEIL_FACTOR = 1.5
# An adjacent-frame jump beyond this ratio (in either direction) is treated as a
# pitch-halving/doubling artifact and pulled back toward its neighbours.
_OCTAVE_JUMP_RATIO = 1.8


class ToneDspError(RuntimeError):
    """Raised when audio cannot be processed into a usable F0 contour."""


def _decode_wav(audio_bytes: bytes) -> tuple[list[float], int]:
    """Decode 16-bit PCM WAV bytes to a mono float sample list + sample rate.

    Uses the stdlib ``wave`` module (no ffmpeg). Stereo is downmixed to mono.
    """
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)
    except (wave.Error, EOFError) as e:
        raise ToneDspError(f"Không đọc được WAV: {e}") from e

    if sample_width != 2:
        raise ToneDspError(f"Chỉ hỗ trợ WAV PCM 16-bit, nhận {sample_width * 8}-bit.")
    if framerate <= 0:
        raise ToneDspError("Sample rate không hợp lệ.")

    import numpy as np

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)
    samples /= 32768.0  # normalize to [-1, 1]
    return samples.tolist(), framerate


def _median3(contour: list[float]) -> list[float]:
    """3-point median filter over voiced frames only.

    Removes single-frame F0 spikes (a classic tracker artifact) without
    smearing genuine tone movement. Unvoiced frames (0.0) are left as gaps and
    never pulled into the median so voiced/unvoiced boundaries stay sharp.
    """
    n = len(contour)
    if n < 3:
        return contour
    out = list(contour)
    for i in range(1, n - 1):
        a, b, c = contour[i - 1], contour[i], contour[i + 1]
        if a > 0 and b > 0 and c > 0:
            out[i] = sorted((a, b, c))[1]
    return out


def _fix_octave_jumps(contour: list[float]) -> list[float]:
    """Pull back frames that halved/doubled relative to a stable neighbour.

    Praat occasionally locks onto twice or half the true F0 for a frame or two.
    When a voiced frame differs from the previous voiced frame by more than
    _OCTAVE_JUMP_RATIO and multiplying/dividing by 2 lands it back near that
    neighbour, we treat it as an octave error and correct it.
    """
    out = list(contour)
    prev = 0.0
    for i, v in enumerate(out):
        if v <= 0:
            # Reset across unvoiced gaps: a pitch reset between two syllables is
            # genuine, not an octave artifact, so never compare frames from
            # different voiced runs.
            prev = 0.0
            continue
        if prev > 0:
            ratio = v / prev
            if ratio >= _OCTAVE_JUMP_RATIO and abs(v / 2 - prev) < abs(v - prev):
                out[i] = v / 2
            elif ratio <= 1 / _OCTAVE_JUMP_RATIO and abs(v * 2 - prev) < abs(v - prev):
                out[i] = v * 2
        prev = out[i]
    return out


def _extract_f0(samples: list[float], framerate: int) -> list[float]:
    """Extract a cleaned F0 contour (Hz) via a two-pass Praat track.

    Pass 1 (wide bounds) measures the speaker's own pitch distribution; pass 2
    re-tracks between q15/q85 percentiles (scaled by _PASS2_* factors) so the
    tracker searches the RIGHT range for this speaker — the single biggest lever
    against octave errors. The result is then octave-corrected and median
    filtered. Unvoiced frames (Praat returns 0) are kept as 0 gaps.
    """
    import numpy as np
    import parselmouth

    sound = parselmouth.Sound(np.asarray(samples, dtype=np.float64), sampling_frequency=framerate)

    # Pass 1 — wide bounds, just to learn this speaker's range.
    pitch1 = sound.to_pitch_ac(pitch_floor=_F0_FLOOR, pitch_ceiling=_F0_CEILING)
    f0 = pitch1.selected_array["frequency"]  # default: keep pass-1 track
    voiced1 = f0[f0 > 0]

    # Pass 2 — re-track within the speaker's own range, but only when pass 1 saw
    # enough voiced frames to estimate it and the derived band is non-degenerate.
    if voiced1.size >= _MIN_VOICED_FRAMES:
        q15, q85 = np.percentile(voiced1, [15, 85])
        floor = max(_F0_FLOOR, float(q15) * _PASS2_FLOOR_FACTOR)
        ceil = min(_F0_CEILING, float(q85) * _PASS2_CEIL_FACTOR)
        if ceil - floor >= 20:
            pitch2 = sound.to_pitch_ac(pitch_floor=floor, pitch_ceiling=ceil)
            f0 = pitch2.selected_array["frequency"]

    contour = [float(v) for v in f0]
    contour = _fix_octave_jumps(contour)
    contour = _median3(contour)
    return contour


def _split_syllables(contour: list[float], n_syllables: int) -> list[list[float]]:
    """Split a full F0 contour into ``n_syllables`` voiced segments.

    Mandarin syllables are separated by short unvoiced gaps. We segment on runs
    of voiced frames, then merge/split so the segment count matches the target
    syllable count (best-effort; alignment downstream tolerates small errors).
    """
    # 1) group consecutive voiced frames into runs
    runs: list[list[float]] = []
    current: list[float] = []
    for v in contour:
        if v > 0:
            current.append(v)
        elif current:
            if len(current) >= _MIN_VOICED_FRAMES:
                runs.append(current)
            current = []
    if len(current) >= _MIN_VOICED_FRAMES:
        runs.append(current)

    if not runs:
        return []

    # 2) reconcile run count with the expected syllable count
    if len(runs) == n_syllables:
        return runs
    if len(runs) > n_syllables:
        # merge the shortest-adjacent runs until counts match
        while len(runs) > n_syllables:
            idx = min(range(len(runs) - 1), key=lambda i: len(runs[i]) + len(runs[i + 1]))
            runs[idx] = runs[idx] + runs[idx + 1]
            del runs[idx + 1]
        return runs
    # fewer runs than syllables: split the longest runs evenly
    while len(runs) < n_syllables:
        idx = max(range(len(runs)), key=lambda i: len(runs[i]))
        seg = runs[idx]
        if len(seg) < 2:
            break
        mid = len(seg) // 2
        runs[idx : idx + 1] = [seg[:mid], seg[mid:]]
    return runs


# One Chao tone level corresponds to roughly this much log-F0. A strong tone
# (e.g. T4 falling 5->1, four Chao levels) spans about a 1.8x pitch ratio in
# citation speech: log(1.8)/4 ≈ 0.147. Used to put user log-F0 and the Chao
# templates into the SAME unit so DTW distances are interpretable.
_CHAO_LOG_UNIT = 0.147

# A syllable whose mean DTW distance (in Chao levels) is below this is treated
# as a correctly realized tone. ~0.9 ≈ off by under one whole Chao level on
# average, which is within natural speaker variation.
_TONE_OK_DIST = 0.9
# Distance at/above which a tone counts as fully wrong, for the 0-1 accuracy map.
_TONE_MAX_DIST = 2.2
# Weight on the slope-direction term added to the DTW shape cost. DTW alone
# warps away wrong-direction errors (a rising contour vs a flat template), so a
# net-slope penalty (in Chao levels) is what enforces the defining direction of
# each tone. ~0.6 makes a full one-level wrong direction cost about that much.
_SLOPE_WEIGHT = 0.6


def _shape_normalize(values: list[float]) -> list[float]:
    """Normalize an F0 segment to mean-centered Chao units (shape comparison).

    We take log(F0) — pitch is perceived multiplicatively — then subtract the
    segment mean. This removes the speaker's absolute pitch height (a low male
    and a high female reading the same contour land on the same shape) WITHOUT
    forcing unit variance. Crucially, a genuinely flat tone stays flat (values
    near 0) instead of having measurement jitter amplified into a fake wobble,
    which is exactly what a z-score (divide-by-std) normalization did wrong.

    Dividing by ``_CHAO_LOG_UNIT`` expresses the result in Chao levels, so it
    is directly comparable to the centered tone templates.
    """
    import numpy as np

    arr = np.log(np.asarray(values, dtype=np.float64))
    arr = arr - arr.mean()
    return (arr / _CHAO_LOG_UNIT).tolist()


def _center_template(template: list[float]) -> list[float]:
    """Mean-center a Chao template (1-5 scale) so it lives in the same
    mean-centered Chao space as the normalized user contour."""
    import numpy as np

    arr = np.asarray(template, dtype=np.float64)
    return (arr - arr.mean()).tolist()


def _dtw_distance(a: list[float], b: list[float]) -> float:
    """Dynamic Time Warping distance between two 1-D sequences.

    Hand-rolled (no extra dependency). Returns the accumulated cost along the
    optimal alignment path, normalized by path length so segment-length
    differences don't inflate the score.
    """
    import numpy as np

    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return float("inf")
    cost = np.full((n + 1, m + 1), np.inf)
    cost[0, 0] = 0.0
    for i in range(1, n + 1):
        ai = a[i - 1]
        for j in range(1, m + 1):
            d = abs(ai - b[j - 1])
            cost[i, j] = d + min(cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1])
    # backtrack to get path length for normalization
    i, j, steps = n, m, 0
    while i > 0 and j > 0:
        steps += 1
        diag, up, left = cost[i - 1, j - 1], cost[i - 1, j], cost[i, j - 1]
        m_ = min(diag, up, left)
        if m_ == diag:
            i, j = i - 1, j - 1
        elif m_ == up:
            i -= 1
        else:
            j -= 1
    steps += i + j
    return float(cost[n, m] / max(steps, 1))


def _net_slope(seq: list[float]) -> float:
    """Net rise/fall of a sequence in Chao levels (end region minus start region).

    Uses the mean of the first/last thirds rather than raw endpoints so a single
    jittery frame can't flip the sign. Positive = rising, negative = falling.
    """
    n = len(seq)
    if n < 2:
        return 0.0
    k = max(1, n // 3)
    head = sum(seq[:k]) / k
    tail = sum(seq[-k:]) / k
    return tail - head


def _resample_linear(seq: list[float], length: int) -> list[float]:
    """Linearly resample ``seq`` to exactly ``length`` points."""
    n = len(seq)
    if n == 0 or length <= 0:
        return []
    if n == length:
        return list(seq)
    if length == 1:
        return [sum(seq) / n]
    if n == 1:
        return [seq[0]] * length
    out = [0.0] * length
    for i in range(length):
        pos = i * (n - 1) / (length - 1)
        i0 = int(pos)
        i1 = min(i0 + 1, n - 1)
        frac = pos - i0
        out[i] = seq[i0] * (1 - frac) + seq[i1] * frac
    return out


def _contour_distance(seg_norm: list[float], template: list[float]) -> float:
    """Combined tone distance: DTW shape cost + a slope-direction penalty.

    DTW alone tolerates time-warping, which can mask a wrong *direction* (e.g. a
    clearly rising contour scored against a flat T1 template still warps cheaply).
    Tones are defined by direction + slope, so we add the absolute difference in
    net slope between the user's syllable and the template. This is what catches
    "said with the wrong tone contour" that DTW by itself lets through.

    The slope term compares net rise/fall, but ``_net_slope`` averages over the
    first/last thirds — so a 3-point template and a 40-point syllable measure
    slope over very different fractions of their span, inflating the gap for a
    correctly-realized tone. We resample the template to the segment's length
    first so both slopes are measured on the same footing. (DTW is unaffected —
    it already warps across length differences.)
    """
    shape = _dtw_distance(seg_norm, template)
    tpl_for_slope = _resample_linear(template, len(seg_norm)) if seg_norm else template
    slope_gap = abs(_net_slope(seg_norm) - _net_slope(tpl_for_slope))
    return shape + _SLOPE_WEIGHT * slope_gap


def _dist_to_accuracy(dist: float) -> float:
    """Map one syllable's Chao-level distance to a 0-1 accuracy.

    Below _TONE_OK_DIST is ~perfect (1.0), at/above _TONE_MAX_DIST is fully wrong
    (0.0), linear in between. Applied PER SYLLABLE (then averaged) so a single
    badly-missed tone can't drag the whole utterance below what its own map
    allows — and, conversely, so a real miss can't be hidden by averaging its raw
    (unbounded) distance against near-zero distances from correct syllables.
    """
    span = max(_TONE_MAX_DIST - _TONE_OK_DIST, 1e-6)
    return max(0.0, min(1.0, 1.0 - (dist - _TONE_OK_DIST) / span))


def _tone_feedback(tone: int, dist: float, user_seg_norm: list[float]) -> str | None:
    """Rule-based diagnosis for a mis-realized tone, in Vietnamese.

    Only fires when the DTW distance indicates a real problem; compares the
    user's normalized shape against the tone's defining feature.
    """
    # Distances are in mean-centered Chao levels: ~0 perfect, ~1.0 means off by
    # roughly one whole tone level on average. Only diagnose a real miss.
    if dist < _TONE_OK_DIST:
        return None
    if not user_seg_norm:
        return None
    start, end = user_seg_norm[0], user_seg_norm[-1]
    lowest = min(user_seg_norm)
    span = max(user_seg_norm) - lowest
    if tone == 1:
        return "Thanh 1 cần giữ cao và ĐỀU; bạn để cao độ trôi lên/xuống."
    if tone == 2:
        if end - start < 1.0:
            return "Thanh 2 phải ĐI LÊN rõ ở cuối; bạn chưa kéo cao độ lên."
        return "Thanh 2 cần lên dứt khoát hơn ở cuối âm tiết."
    if tone == 3:
        if lowest > -1.0:
            return "Thanh 3 phần đáy chưa xuống đủ THẤP; hãy hạ giọng sâu hơn rồi mới nhấc lên."
        return "Thanh 3 cần hình võng (xuống thấp rồi lên) rõ hơn."
    if tone == 4:
        if start - end < 1.0:
            return "Thanh 4 phải ĐỔ XUỐNG mạnh từ cao; bạn chưa hạ cao độ dứt khoát."
        return "Thanh 4 cần dốc xuống mạnh và nhanh hơn."
    if tone == 5 and span > 1.5:
        return "Thanh nhẹ nên ngắn và bằng; bạn đang lên/xuống quá nhiều."
    return None


# --- Macro-level: fluency + sentence prosody -------------------------------
# These reuse the SAME F0 contour the tone scorer already computes — no extra
# audio pass, no new dependency. They answer "how was the delivery" (rhythm,
# hesitation, intonation range) rather than "was each tone right".

# An interior unvoiced gap longer than this (seconds) counts as a hesitation
# pause. Short gaps between syllables (stops/aspiration) are normal speech and
# must NOT be counted, or every utterance would look halting.
_PAUSE_MIN_SEC = 0.25
# Comfortable Mandarin reading rate is ~3-5 syllables/sec. Outside this band the
# delivery is either halting or rushed. Used only to phrase feedback, not to
# score — rate depends on sentence length and is diagnostic, not a grade.
_RATE_SLOW = 2.0
_RATE_FAST = 6.0
# Whole-utterance pitch span (semitones) below this reads as flat/monotone;
# above the high mark it is unusually wide (often octave-jump artifacts or
# over-acting). 10th/90th percentiles are used so a single bad frame can't
# widen the span.
_PROSODY_FLAT_ST = 3.0
_PROSODY_WIDE_ST = 16.0


def _frame_step_sec(duration_sec: float, n_frames: int) -> float:
    """Seconds per F0 frame, derived from clip duration / frame count.

    Deriving it this way (instead of reading parselmouth's internal time step)
    keeps the two-pass re-tracking transparent to callers: however many frames
    the tracker returned, they span the whole clip uniformly.
    """
    if n_frames <= 0:
        return 0.0
    return duration_sec / n_frames


def _analyze_fluency(contour: list[float], frame_step: float, n_syllables: int) -> dict | None:
    """Speech rate + hesitation pauses from the voiced/unvoiced pattern.

    speech_rate is syllables per second over the *spoken span* (first voiced
    frame to last), so leading/trailing silence never deflates it. Pauses are
    interior unvoiced runs longer than _PAUSE_MIN_SEC — genuine hesitations,
    not the short gaps that separate every syllable.
    """
    if frame_step <= 0 or n_syllables <= 0:
        return None

    voiced_idx = [i for i, v in enumerate(contour) if v > 0]
    if len(voiced_idx) < _MIN_VOICED_FRAMES:
        return None

    first, last = voiced_idx[0], voiced_idx[-1]
    span_sec = (last - first + 1) * frame_step
    if span_sec <= 0:
        return None
    speech_rate = n_syllables / span_sec

    # Interior unvoiced runs (between first and last voiced frame).
    pause_count = 0
    total_pause_sec = 0.0
    gap = 0
    for i in range(first, last + 1):
        if contour[i] <= 0:
            gap += 1
        elif gap:
            gap_sec = gap * frame_step
            if gap_sec >= _PAUSE_MIN_SEC:
                pause_count += 1
                total_pause_sec += gap_sec
            gap = 0

    lines: list[str] = []
    if speech_rate < _RATE_SLOW:
        lines.append("Bạn đọc hơi chậm và ngập ngừng; hãy nối các âm tiết liền mạch hơn.")
    elif speech_rate > _RATE_FAST:
        lines.append("Bạn đọc hơi nhanh; chậm lại một chút để phát âm rõ từng âm tiết.")
    if pause_count:
        lines.append(f"Có {pause_count} lần ngắt nghỉ giữa câu; cố gắng đọc trôi chảy một hơi.")

    return {
        "speech_rate": round(speech_rate, 2),
        "pause_count": pause_count,
        "total_pause_sec": round(total_pause_sec, 2),
        "span_sec": round(span_sec, 2),
        "feedback": " ".join(lines),
    }


def _analyze_prosody(contour: list[float]) -> dict | None:
    """Whole-sentence intonation: pitch range + overall declination.

    Uses 10th/90th percentiles of voiced F0 for a robust range (semitones), and
    the net drift from the first third to the last third to detect the natural
    downward declination of a statement. Flags a flat/monotone delivery, which
    is the most common Vietnamese-learner intonation issue.
    """
    voiced = [v for v in contour if v > 0]
    if len(voiced) < _MIN_VOICED_FRAMES:
        return None

    import numpy as np

    arr = np.asarray(voiced, dtype=np.float64)
    lo, hi = np.percentile(arr, [10, 90])
    pitch_range_st = float(12.0 * np.log2(hi / lo)) if lo > 0 else 0.0

    # Overall rise/fall across the utterance in semitones (relative to median).
    k = max(1, len(arr) // 3)
    head = float(np.median(arr[:k]))
    tail = float(np.median(arr[-k:]))
    declination_st = float(12.0 * np.log2(tail / head)) if head > 0 else 0.0

    lines: list[str] = []
    if pitch_range_st < _PROSODY_FLAT_ST:
        lines.append("Ngữ điệu cả câu khá phẳng; hãy lên/xuống giọng rõ hơn theo thanh điệu.")
    elif pitch_range_st > _PROSODY_WIDE_ST:
        lines.append("Cao độ dao động quá rộng; giữ giọng ổn định hơn để nghe tự nhiên.")

    return {
        "pitch_range_semitones": round(pitch_range_st, 1),
        "declination_semitones": round(declination_st, 1),
        "feedback": " ".join(lines),
    }


def score_tones(audio_bytes: bytes, target_tones: list[int]) -> dict:
    """Acoustic tone scoring for one utterance.

    Args:
        audio_bytes: WAV PCM 16-bit mono/stereo bytes.
        target_tones: expected tone number (1-5) per target syllable.

    Returns dict with: tone_accuracy (0-1), per_syllable [{pos, tone, distance,
    ok, feedback}], user_f0_contour (raw Hz), and feedback (joined diagnosis).
    """
    if not target_tones:
        raise ToneDspError("Thiếu thông tin thanh điệu mục tiêu.")

    samples, framerate = _decode_wav(audio_bytes)
    if len(samples) < framerate // 10:  # < 100ms of audio
        raise ToneDspError("Đoạn ghi âm quá ngắn để phân tích.")

    contour = _extract_f0(samples, framerate)
    voiced = [v for v in contour if v > 0]
    if len(voiced) < _MIN_VOICED_FRAMES:
        raise ToneDspError("Không phát hiện được giọng nói rõ (F0) trong đoạn ghi âm.")

    segments = _split_syllables(contour, len(target_tones))
    if not segments:
        raise ToneDspError("Không tách được âm tiết từ đường F0.")

    per_syllable: list[dict] = []
    accuracies: list[float] = []
    feedback_lines: list[str] = []

    for pos, tone in enumerate(target_tones):
        if pos >= len(segments):
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": False,
                "feedback": "Không nghe rõ âm tiết này (thiếu giọng).",
            })
            accuracies.append(0.0)  # missing syllable = fully wrong for this slot
            feedback_lines.append(f"Âm tiết {pos + 1}: chưa phát âm rõ.")
            continue

        seg_norm = _shape_normalize(segments[pos])
        template = _center_template(_TONE_TEMPLATES.get(tone, _TONE_TEMPLATES[5]))
        dist = _contour_distance(seg_norm, template)
        accuracies.append(_dist_to_accuracy(dist))
        fb = _tone_feedback(tone, dist, seg_norm)
        ok = dist < _TONE_OK_DIST
        per_syllable.append({
            "pos": pos, "tone": tone, "distance": round(dist, 3),
            "ok": ok, "feedback": fb,
        })
        if fb:
            feedback_lines.append(f"Âm tiết {pos + 1} (thanh {tone}): {fb}")

    # Average PER-SYLLABLE accuracy (each already clamped to [0,1]) rather than
    # mapping a mean raw distance — the latter let one unbounded miss dominate and
    # could hide a moderate miss behind near-perfect neighbours.
    import numpy as np

    tone_accuracy = float(np.mean(accuracies)) if accuracies else 0.0

    # Macro layer: reuse the same contour for delivery-level diagnostics.
    frame_step = _frame_step_sec(len(samples) / framerate, len(contour))
    fluency = _analyze_fluency(contour, frame_step, len(target_tones))
    prosody = _analyze_prosody(contour)

    macro_lines = [
        d["feedback"] for d in (fluency, prosody) if d and d["feedback"]
    ]

    return {
        "tone_accuracy": round(tone_accuracy, 3),
        "per_syllable": per_syllable,
        "user_f0_contour": [round(v, 1) for v in contour],
        "feedback": " ".join(feedback_lines),
        "fluency": fluency,
        "prosody": prosody,
        "macro_feedback": " ".join(macro_lines),
    }
