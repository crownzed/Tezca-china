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

Signal extraction (decode, F0, segmentation, normalization) lives in
``tone_dsp_extractor`` — this module owns only SCORING logic (DTW, templates,
accuracy mapping, feedback). The split lets downstream agents (adaptive
analyzer, phoneme verifier) reuse extraction without pulling in scoring.

Heavy deps (parselmouth/numpy) are imported lazily inside functions so the
module can be imported on a memory-constrained host without paying the cost
until a scoring request actually arrives.

No ffmpeg dependency: the client encodes WAV PCM directly (Web Audio), and we
decode with the stdlib ``wave`` module.
"""
from __future__ import annotations

import logging

# Re-export extraction primitives from the dedicated extractor module.
# tone_dsp_service.py used to own these; they now live in tone_dsp_extractor
# for reuse by adaptive_tone_analyzer, phoneme_verifier, etc. This module
# keeps thin private aliases so existing internal callers (score_tones below)
# continue to work unchanged.
from .tone_dsp_extractor import (
    CHAO_LOG_UNIT as _CHAO_LOG_UNIT,
    MIN_VOICED_FRAMES as _MIN_VOICED_FRAMES,
    ToneDspExtractorError,
    center_template as _center_template,
    decode_wav as _decode_wav,
    extract_f0 as _extract_f0,
    frame_step_sec as _frame_step_sec,
    shape_normalize as _shape_normalize,
    split_syllables as _split_syllables,
)

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

# Pitch tracking bounds — kept as aliases for any legacy callers that import
# them from this module. Canonical definitions live in tone_dsp_extractor.
_F0_FLOOR = 70.0
_F0_CEILING = 400.0
_PASS2_FLOOR_FACTOR = 0.75
_PASS2_CEIL_FACTOR = 1.5
_OCTAVE_JUMP_RATIO = 1.8


class ToneDspError(ToneDspExtractorError):
    """Raised when audio cannot be processed into a usable F0 contour.

    Subclass of ToneDspExtractorError for backward compatibility — existing
    ``except ToneDspError`` clauses in speech_ai_service.py still catch.
    """


# ---------------------------------------------------------------------------
# DTW and scoring (these stay here — they are SCORING logic, not extraction)
# ---------------------------------------------------------------------------

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


def _huber_cost(diff: float, delta: float = 0.5) -> float:
    """Huber loss: quadratic near 0, linear for |diff| > delta.

    Robust to outlier F0 points — prevents single noisy frame from dominating
    the DTW alignment cost. Delta=0.5 Chao levels ≈ transition zone between
    in-tune and noticeably off.
    """
    ad = abs(diff)
    if ad <= delta:
        return 0.5 * diff * diff / delta
    return ad - 0.5 * delta


def _dtw_distance(a: list[float], b: list[float]) -> float:
    """Dynamic Time Warping with Huber cost and Sakoe-Chiba band constraint.

    v2.1 improvements over plain DTW:
    - Huber cost replaces absolute difference (robust to F0 outliers)
    - Sakoe-Chiba band limits warping path to ±w of the diagonal (prevents
      pathological alignments and reduces O(N×M) → O(N×w))

    The band is centered on the proportional diagonal j ≈ i * m/n so it works
    correctly for sequences of very different lengths (e.g., 3-point template
    vs 20-point segment). Without this scaling, a fixed-width band around j=i
    can make cost[n,m] unreachable when |n-m| > w.
    """
    import numpy as np

    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return float("inf")
    # Sakoe-Chiba band width: scaled to handle length mismatches
    w = max(max(n, m) // 3, abs(n - m) + 2)
    cost = np.full((n + 1, m + 1), np.inf)
    cost[0, 0] = 0.0
    for i in range(1, n + 1):
        ai = a[i - 1]
        # Center band on proportional diagonal position
        j_center = int(round(i * m / n))
        j_min = max(1, j_center - w)
        j_max = min(m, j_center + w)
        for j in range(j_min, j_max + 1):
            d = _huber_cost(ai - b[j - 1])
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


# ---------------------------------------------------------------------------
# Macro-level: fluency + sentence prosody -------------------------------
# These now live in ``fluency_prosody_analyzer`` for reuse by the new scoring
# pipeline. We import them here so ``score_tones()`` continues to work.
# ---------------------------------------------------------------------------

from .fluency_prosody_analyzer import (
    analyze_fluency as _analyze_fluency,
    analyze_prosody as _analyze_prosody,
)

# Constants kept as aliases for any legacy callers.
_PAUSE_MIN_SEC = 0.25
_RATE_SLOW = 2.0
_RATE_FAST = 6.0
_PROSODY_FLAT_ST = 3.0
_PROSODY_WIDE_ST = 16.0


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

    # Use the centralized extractor — same logic as before, just delegated.
    from .tone_dsp_extractor import extract_tone_features

    try:
        features = extract_tone_features(audio_bytes, len(target_tones))
    except ToneDspExtractorError as e:
        raise ToneDspError(str(e)) from e

    contour = features["f0_contour"]
    segments = features["segments"]

    per_syllable: list[dict] = []
    accuracies: list[float] = []
    feedback_lines: list[str] = []

    for pos, tone in enumerate(target_tones):
        if pos >= len(segments):
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": False,
                "feedback": "Không nghe rõ âm tiết này (thiếu giọng).",
            })
            accuracies.append(0.0)
            feedback_lines.append(f"Âm tiết {pos + 1}: chưa phát âm rõ.")
            continue

        if tone == 5:
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": True,
                "feedback": "",
            })
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

    import numpy as np

    if not accuracies:
        raise ToneDspError("Không có thanh điệu xác định để chấm (toàn thanh nhẹ).")

    tone_accuracy = float(np.mean(accuracies))

    # Macro layer: reuse the same contour for delivery-level diagnostics.
    fluency = _analyze_fluency(contour, features["frame_step_sec"], len(target_tones))
    prosody = _analyze_prosody(contour)

    macro_lines = [
        d["feedback"] for d in (fluency, prosody) if d and d["feedback"]
    ]

    return {
        "tone_accuracy": round(tone_accuracy, 3),
        "per_syllable": per_syllable,
        "user_f0_contour": contour,
        "feedback": " ".join(feedback_lines),
        "fluency": fluency,
        "prosody": prosody,
        "macro_feedback": " ".join(macro_lines),
    }
