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
_F0_FLOOR = 70.0
_F0_CEILING = 400.0
_MIN_VOICED_FRAMES = 3


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


def _extract_f0(samples: list[float], framerate: int) -> list[float]:
    """Extract the F0 contour (Hz) using parselmouth/Praat, voiced frames only.

    Unvoiced frames (Praat returns 0) are dropped — tones live on voiced
    portions. Returns the raw Hz contour for the whole utterance.
    """
    import numpy as np
    import parselmouth

    sound = parselmouth.Sound(np.asarray(samples, dtype=np.float64), sampling_frequency=framerate)
    pitch = sound.to_pitch(pitch_floor=_F0_FLOOR, pitch_ceiling=_F0_CEILING)
    f0 = pitch.selected_array["frequency"]  # 0.0 where unvoiced
    return [float(v) for v in f0]


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


def _contour_distance(seg_norm: list[float], template: list[float]) -> float:
    """Combined tone distance: DTW shape cost + a slope-direction penalty.

    DTW alone tolerates time-warping, which can mask a wrong *direction* (e.g. a
    clearly rising contour scored against a flat T1 template still warps cheaply).
    Tones are defined by direction + slope, so we add the absolute difference in
    net slope between the user's syllable and the template. This is what catches
    "said with the wrong tone contour" that DTW by itself lets through.
    """
    shape = _dtw_distance(seg_norm, template)
    slope_gap = abs(_net_slope(seg_norm) - _net_slope(template))
    return shape + _SLOPE_WEIGHT * slope_gap


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
    distances: list[float] = []
    feedback_lines: list[str] = []

    for pos, tone in enumerate(target_tones):
        if pos >= len(segments):
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": False,
                "feedback": "Không nghe rõ âm tiết này (thiếu giọng).",
            })
            distances.append(2.0)  # max-ish penalty
            feedback_lines.append(f"Âm tiết {pos + 1}: chưa phát âm rõ.")
            continue

        seg_norm = _shape_normalize(segments[pos])
        template = _center_template(_TONE_TEMPLATES.get(tone, _TONE_TEMPLATES[5]))
        dist = _contour_distance(seg_norm, template)
        distances.append(dist)
        fb = _tone_feedback(tone, dist, seg_norm)
        ok = dist < _TONE_OK_DIST
        per_syllable.append({
            "pos": pos, "tone": tone, "distance": round(dist, 3),
            "ok": ok, "feedback": fb,
        })
        if fb:
            feedback_lines.append(f"Âm tiết {pos + 1} (thanh {tone}): {fb}")

    # Map mean DTW distance (Chao levels) to 0-1 accuracy: at/below _TONE_OK_DIST
    # is ~perfect, at/above _TONE_MAX_DIST is fully wrong, linear in between.
    import numpy as np

    mean_dist = float(np.mean(distances)) if distances else _TONE_MAX_DIST
    span = max(_TONE_MAX_DIST - _TONE_OK_DIST, 1e-6)
    tone_accuracy = max(0.0, min(1.0, 1.0 - (mean_dist - _TONE_OK_DIST) / span))

    return {
        "tone_accuracy": round(tone_accuracy, 3),
        "per_syllable": per_syllable,
        "user_f0_contour": [round(v, 1) for v in contour],
        "feedback": " ".join(feedback_lines),
    }
