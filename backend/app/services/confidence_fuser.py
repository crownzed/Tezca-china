"""
Confidence Fuser — weighted fusion of identity and acoustic pronunciation scores.

Replaces the hard ``min()`` veto at speech_ai_service.py:273 with a calibrated,
confidence-weighted fusion. When extraction quality is low, degrades gracefully
to identity-only scoring. When phoneme confidence is low for a syllable, that
syllable's identity vote is down-weighted.

All arithmetic is deterministic scalar/numpy math — no LLM, no learned
parameters, no randomness. This module is the SINGLE point where "how much do
we trust each layer" is decided.
"""
from __future__ import annotations

import logging
from typing import TypedDict

logger = logging.getLogger(__name__)


class ConfidenceFuseInput(TypedDict):
    """Inputs to the score fusion."""
    base_score: float               # 0-100, syllable identity from pinyin_scorer
    identity_tone_ratio: float      # 0-1, Gemini tone-correct ratio
    dsp_tone_accuracy: float        # 0-1, from adaptive or legacy DSP
    phoneme_confidence: float       # 0-1, from phoneme_verifier
    extraction_quality: float       # 0-1, from tone_dsp_extractor
    adaptive_used: bool             # whether adaptive analyzer had enough data
    n_tone_slots: int               # number of scorable tone slots
    per_syllable_identity: list[dict]   # syllable errors from pinyin_scorer
    per_syllable_acoustic: list[dict]   # per-syllable from tone analyzer


class ConfidenceFuseOutput(TypedDict):
    """Output of score fusion."""
    final_score: int                # 0-100
    tone_accuracy: float            # 0-1, the fused tone component
    per_syllable_explanation: list[dict]  # [{pos, identity_contrib, acoustic_contrib, weight, reason}]
    fusion_method: str              # "weighted" | "fallback_identity" | "identity_only"
    confidence_breakdown: dict      # numeric {asr_weight, dsp_weight, adaptive_bonus, divergence}
    divergence_warning: str         # human-readable ASR/acoustic mismatch warning


# ---------------------------------------------------------------------------
# Core fusion logic
# ---------------------------------------------------------------------------

_EPSILON = 1e-6

# Extraction quality below this → DSP unreliable, use identity only
_EXTRACTION_QUALITY_FLOOR = 0.3

# Adaptive mode bonus multiplier on DSP weight
_ADAPTIVE_BONUS = 1.2


def fuse_scores(input: ConfidenceFuseInput) -> ConfidenceFuseOutput:
    """Fuse identity and acoustic scores with confidence weighting.

    Replaces the old ``min(dsp_tone_accuracy, gemini_tone_ratio)`` with:

        asr_w = phoneme_confidence × extraction_quality
        dsp_w = extraction_quality × (1.2 if adaptive else 1.0)
        tone_accuracy = (identity_ratio × asr_w + dsp_accuracy × dsp_w) / (asr_w + dsp_w)

    Graceful degradation paths:
      - extraction_quality < 0.3 → identity-only (DSP too noisy)
      - no tone slots → base_score alone
      - all weights zero → identity-only fallback
    """
    base_score = input["base_score"]
    identity_ratio = input["identity_tone_ratio"]
    dsp_accuracy = input["dsp_tone_accuracy"]
    phoneme_conf = input["phoneme_confidence"]
    ext_quality = input["extraction_quality"]
    adaptive_used = input["adaptive_used"]
    n_tone_slots = input["n_tone_slots"]

    # No tone slots to score → pure identity
    if n_tone_slots <= 0:
        return ConfidenceFuseOutput(
            final_score=round(base_score),
            tone_accuracy=identity_ratio,
            per_syllable_explanation=[],
            fusion_method="identity_only",
            confidence_breakdown={"asr_weight": 0.0, "dsp_weight": 0.0, "adaptive_bonus": 0.0},
            divergence_warning="",
        )

    # Compute weights
    asr_w = phoneme_conf * ext_quality
    adaptive_bonus = _ADAPTIVE_BONUS if adaptive_used else 1.0
    dsp_w = ext_quality * adaptive_bonus
    divergence = 0.0  # set in weighted path only

    # Determine fusion method
    if ext_quality < _EXTRACTION_QUALITY_FLOOR:
        # DSP too noisy — identity only
        tone_accuracy = identity_ratio
        method = "fallback_identity"
    elif (asr_w + dsp_w) < _EPSILON:
        # Both weights effectively zero
        tone_accuracy = identity_ratio
        method = "fallback_identity"
    else:
        # Weighted fusion
        denom = asr_w + dsp_w + _EPSILON
        tone_accuracy = (identity_ratio * asr_w + dsp_accuracy * dsp_w) / denom
        method = "weighted"

        # Divergence safety valve: flag when ASR and acoustic strongly disagree.
        # A divergence > 0.5 means one layer says "correct" while the other says
        # "wrong" — the average hides this contradiction. We flag it in metadata
        # so score_explainer can generate appropriate feedback, but we do NOT
        # override the score calculation (backward compatible).
        divergence = abs(identity_ratio - dsp_accuracy)
        if divergence > 0.5:
            method = "weighted_divergent"

    # Clamp tone_accuracy to [0, 1]
    tone_accuracy = max(0.0, min(1.0, tone_accuracy))

    # Final composite: same 60/40 weighting as before
    final_score = round(base_score * 0.6 + tone_accuracy * 100 * 0.4)
    final_score = max(0, min(100, final_score))

    # Build per-syllable explanation
    explanations = _build_per_syllable_explanation(
        input["per_syllable_identity"],
        input["per_syllable_acoustic"],
        asr_w,
        dsp_w,
        method,
    )

    return ConfidenceFuseOutput(
        final_score=final_score,
        tone_accuracy=round(tone_accuracy, 3),
        per_syllable_explanation=explanations,
        fusion_method=method,
        confidence_breakdown={
            "asr_weight": round(asr_w, 3),
            "dsp_weight": round(dsp_w, 3),
            "adaptive_bonus": round(adaptive_bonus, 1),
            **({"divergence": round(divergence, 3)} if method == "weighted_divergent" else {}),
        },
        divergence_warning=(
            f"ASR và acoustic chênh lệch {divergence:.0%} — kết quả có thể không chính xác"
            if method == "weighted_divergent" else ""
        ),
    )


def _build_per_syllable_explanation(
    identity_errors: list[dict],
    acoustic_details: list[dict],
    asr_w: float,
    dsp_w: float,
    method: str,
) -> list[dict]:
    """Build per-syllable contribution breakdown for explainability."""
    explanations: list[dict] = []

    # Index identity errors by position
    error_positions: set[int] = set()
    for err in identity_errors:
        pos = err.get("pos", -1)
        if pos >= 0:
            error_positions.add(pos)

    # Index acoustic details by position
    acoustic_by_pos: dict[int, dict] = {}
    for detail in acoustic_details:
        pos = detail.get("pos", -1)
        if pos >= 0:
            acoustic_by_pos[pos] = detail

    # Determine max position
    all_positions = set(error_positions) | set(acoustic_by_pos.keys())
    if not all_positions:
        return explanations

    total_w = asr_w + dsp_w + _EPSILON

    for pos in sorted(all_positions):
        has_identity_error = pos in error_positions
        acoustic = acoustic_by_pos.get(pos)

        # Identity contribution: 1.0 if correct, 0.0 if error
        id_contrib = 0.0 if has_identity_error else 1.0

        # Acoustic contribution from distance/ok
        if acoustic and acoustic.get("distance") is not None:
            ac_contrib = 1.0 if acoustic.get("ok", False) else 0.0
        else:
            ac_contrib = 0.5  # unknown

        # Weight attribution
        if method == "identity_only" or method == "fallback_identity":
            reason = "DSP không đủ tin cậy, chỉ dùng nhận diện"
        elif has_identity_error:
            reason = f"Lỗi âm tiết (ASR), trọng số ASR={asr_w:.2f}"
        elif acoustic and not acoustic.get("ok", True):
            reason = f"Lỗi thanh điệu (acoustic), trọng số DSP={dsp_w:.2f}"
        else:
            reason = f"Khớp cả hai tầng, ASR={asr_w:.2f} DSP={dsp_w:.2f}"

        explanations.append({
            "pos": pos,
            "identity_contrib": round(id_contrib, 2),
            "acoustic_contrib": round(ac_contrib, 2),
            "weight": round((asr_w * id_contrib + dsp_w * ac_contrib) / total_w, 3) if total_w > 0 else 0.0,
            "reason": reason,
        })

    return explanations
