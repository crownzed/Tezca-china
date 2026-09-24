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
    contour_distance as _contour_distance,
    decode_wav as _decode_wav,
    dtw_distance as _dtw_distance,
    extract_f0 as _extract_f0,
    frame_step_sec as _frame_step_sec,
    huber_cost as _huber_cost,
    net_slope as _net_slope,
    resample_linear as _resample_linear,
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
# DTW and scoring thresholds
# ---------------------------------------------------------------------------

# A syllable whose mean DTW distance (in Chao levels) is below this is treated
# as a correctly realized tone. ~0.9 ≈ off by under one whole Chao level on
# average, which is within natural speaker variation.
_TONE_OK_DIST = 0.9
# Distance at/above which a tone counts as fully wrong, for the 0-1 accuracy map.
_TONE_MAX_DIST = 2.2

# ---------------------------------------------------------------------------
# DTW and scoring — canonical implementations now live in tone_dsp_extractor.
# Private aliases kept so internal callers (score_tones, _tone_feedback) work
# unchanged. The _SLOPE_WEIGHT alias is also kept for any legacy external refs.
# ---------------------------------------------------------------------------

_SLOPE_WEIGHT = 0.6


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
