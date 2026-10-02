"""
Score Explainer — post-scoring feedback generation for pronunciation scoring.

Translates numerical results from all upstream agents into actionable Vietnamese
pedagogical feedback. NEVER modifies scores — read-only consumer of agent outputs.

Feedback priority order:
  1. Phoneme correction (from phoneme_verifier)
  2. Tone error (from adaptive/legacy DSP)
  3. Adaptive contour note (from adaptive_tone_analyzer)
  4. Fluency/prosody (from fluency_prosody_analyzer)

Replaces ``_generate_phonetic_tip`` and ``_pronunciation_tip`` in
speech_ai_service.py when the new pipeline is active.
"""
from __future__ import annotations

import logging
from typing import TypedDict

logger = logging.getLogger(__name__)


class ScoreExplainOutput(TypedDict):
    """Output of score explanation."""
    tip: str                        # Vietnamese pedagogical feedback (≤2 sentences)
    per_syllable_detail: list[dict] # [{pos, hanzi, target_pinyin, actual_pinyin,
                                    #   phoneme_ok, tone_ok, tone_distance,
                                    #   identity_contrib, acoustic_contrib,
                                    #   feedback_vi}]
    dimension_scores: dict          # {phoneme, tone, fluency, prosody}
    macro_feedback: str


# ---------------------------------------------------------------------------
# Tone practice tips (same as speech_ai_service._TONE_PRACTICE_TIPS)
# ---------------------------------------------------------------------------

_TONE_PRACTICE_TIPS: dict[int, str] = {
    1: "Thanh 1 cần giữ cao độ ổn định và bằng phẳng ở âm vực cao (55), không hạ giọng cuối âm.",
    2: "Thanh 2 cần vuốt giọng từ tầm trung lên cao dứt khoát (35), tương tự dấu sắc tiếng Việt nhưng ngân vang hơn.",
    3: "Thanh 3 cần hạ giọng thật sâu xuống đáy âm vực (21) rồi mới nhả nhẹ (4), tránh đọc nông như dấu hỏi.",
    4: "Thanh 4 cần bắt đầu từ âm vực cao nhất rồi giáng nhanh và dứt khoát xuống thấp (51), không kéo dài.",
    5: "Thanh nhẹ cần phát âm ngắn, nhẹ và lướt qua nhanh.",
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def explain_score(
    target_hanzi: str,
    target_pinyin: str,
    actual_pinyin: str,
    fuse_output: dict,
    phoneme_output: dict | None,
    adaptive_output: dict | None,
    fluency_output: dict | None,
    pinyin_breakdown: dict,
) -> ScoreExplainOutput:
    """Generate pedagogical feedback from all upstream agent outputs.

    Args:
        target_hanzi: Target Chinese characters.
        target_pinyin: Target pinyin with tone marks.
        actual_pinyin: ASR-transcribed pinyin.
        fuse_output: Output from confidence_fuser.fuse_scores().
        phoneme_output: Output from phoneme_verifier.verify_phonemes() or None.
        adaptive_output: Output from adaptive_tone_analyzer or None.
        fluency_output: Output from fluency_prosody_analyzer or None.
        pinyin_breakdown: Output from pinyin_scorer.score_pinyin().

    Returns:
        ScoreExplainOutput with tip, per-syllable details, and dimension scores.
    """
    # Extract key data from each agent output
    tone_errors = pinyin_breakdown.get("tone_errors", [])
    syllable_errors = pinyin_breakdown.get("syllable_errors", [])

    # Build dimension scores
    dimension_scores = _build_dimension_scores(
        phoneme_output, fuse_output, fluency_output,
    )

    # Build per-syllable detail
    per_syllable = _build_per_syllable_detail(
        target_hanzi, target_pinyin, actual_pinyin,
        phoneme_output, adaptive_output, fuse_output,
        pinyin_breakdown,
    )

    # Generate tip (priority-ordered feedback)
    tip = _generate_tip(
        target_hanzi, pinyin_breakdown,
        phoneme_output, adaptive_output, fluency_output, fuse_output,
    )

    # Macro feedback
    macro_parts: list[str] = []
    if fluency_output:
        mf = fluency_output.get("macro_feedback", "")
        if mf:
            macro_parts.append(mf)
    macro_feedback = " ".join(macro_parts)

    return ScoreExplainOutput(
        tip=tip,
        per_syllable_detail=per_syllable,
        dimension_scores=dimension_scores,
        macro_feedback=macro_feedback,
    )


def _build_dimension_scores(
    phoneme_output: dict | None,
    fuse_output: dict,
    fluency_output: dict | None,
) -> dict:
    """Build per-dimension score summary."""
    scores: dict[str, float | None] = {
        "phoneme": None,
        "tone": None,
        "fluency": None,
        "prosody": None,
    }

    if phoneme_output:
        scores["phoneme"] = phoneme_output.get("phoneme_score")

    scores["tone"] = fuse_output.get("tone_accuracy")

    if fluency_output:
        scores["fluency"] = fluency_output.get("delivery_score")
        # Prosody sub-score from pitch range normality
        prosody = fluency_output.get("prosody")
        if prosody:
            pr = prosody.get("pitch_range_semitones", 8.0)
            # Simple normality: 1 - |pr - 8| / 8, clamped
            scores["prosody"] = max(0.0, min(1.0, 1.0 - abs(pr - 8.0) / 8.0))

    return scores


def _build_per_syllable_detail(
    target_hanzi: str,
    target_pinyin: str,
    actual_pinyin: str,
    phoneme_output: dict | None,
    adaptive_output: dict | None,
    fuse_output: dict,
    pinyin_breakdown: dict,
) -> list[dict]:
    """Build detailed per-syllable breakdown."""
    target_syls = [s for s in target_pinyin.strip().split() if s]
    actual_syls = [s for s in actual_pinyin.strip().split() if s]
    hanzi_chars = list(target_hanzi)

    # Get per-syllable explanations from fuser
    fuse_explanations = {
        e["pos"]: e for e in fuse_output.get("per_syllable_explanation", [])
    }

    # Get phoneme confidence per syllable
    phoneme_conf = []
    if phoneme_output:
        phoneme_conf = phoneme_output.get("per_syllable_confidence", [])

    # Get acoustic per-syllable from adaptive
    acoustic_by_pos: dict[int, dict] = {}
    if adaptive_output:
        for item in adaptive_output.get("per_syllable", []):
            acoustic_by_pos[item.get("pos", -1)] = item

    n = max(len(target_syls), len(actual_syls))
    details: list[dict] = []

    for i in range(n):
        t_syl = target_syls[i] if i < len(target_syls) else ""
        a_syl = actual_syls[i] if i < len(actual_syls) else ""
        hz = hanzi_chars[i] if i < len(hanzi_chars) else ""

        # Phoneme confidence
        p_conf = phoneme_conf[i] if i < len(phoneme_conf) else 0.7
        phoneme_ok = p_conf >= 0.6

        # Tone info from acoustic
        acoustic = acoustic_by_pos.get(i)
        tone_ok = acoustic.get("ok", True) if acoustic else True
        tone_dist = acoustic.get("distance") if acoustic else None

        # Fuse explanation
        expl = fuse_explanations.get(i, {})

        details.append({
            "pos": i,
            "hanzi": hz,
            "target_pinyin": t_syl,
            "actual_pinyin": a_syl,
            "phoneme_ok": phoneme_ok,
            "phoneme_confidence": round(p_conf, 2),
            "tone_ok": tone_ok,
            "tone_distance": tone_dist,
            "identity_contrib": expl.get("identity_contrib"),
            "acoustic_contrib": expl.get("acoustic_contrib"),
            "feedback_vi": acoustic.get("feedback", "") if acoustic else "",
        })

    return details


def _generate_tip(
    target_hanzi: str,
    pinyin_breakdown: dict,
    phoneme_output: dict | None,
    adaptive_output: dict | None,
    fluency_output: dict | None,
    fuse_output: dict | None = None,
) -> str:
    """Generate concise Vietnamese pedagogical feedback (≤2 sentences).

    Priority order:
      1. Phoneme correction
      2. Syllable error
      3. Tone error
      4. Adaptive contour note
      5. Fluency/prosody
      6. Divergence warning (ASR vs acoustic mismatch)
      7. Perfect score message
    """
    tone_errors = pinyin_breakdown.get("tone_errors", [])
    syllable_errors = pinyin_breakdown.get("syllable_errors", [])

    parts: list[str] = []

    # 1. Phoneme corrections (highest priority)
    if phoneme_output:
        corrections = phoneme_output.get("corrections", [])
        if corrections and len(parts) < 2:
            c = corrections[0]
            orig = c.get("original", "")
            corr = c.get("corrected", "")
            reason = c.get("reason", "")
            parts.append(f"Âm '{orig}' nghe giống '{corr}' hơn ({reason}). Hãy chú ý vị trí lưỡi.")

    # 2. Syllable errors
    if syllable_errors and len(parts) < 2:
        err = syllable_errors[0]
        exp = err.get("expected", "")
        got = err.get("got", "")
        parts.append(f"Từ '{exp}' bạn đọc thành '{got}', hãy chú ý phát âm chuẩn phụ âm đầu và phần vần.")

    # 3. Tone errors
    if tone_errors and len(parts) < 2:
        err = tone_errors[0]
        syl = err.get("syllable", "")
        exp_t = err.get("expected_tone", 0)
        got_t = err.get("got_tone", 0)
        advice = _TONE_PRACTICE_TIPS.get(exp_t, "")
        parts.append(f"Âm tiết '{syl}' đọc nhầm thành thanh {got_t}. {advice}")

    # 4. Adaptive/acoustic tone feedback
    if adaptive_output and len(parts) < 2:
        for syl_detail in adaptive_output.get("per_syllable", []):
            fb = syl_detail.get("feedback")
            if fb and not syl_detail.get("ok", True):
                parts.append(fb)
                break

    # 5. Fluency/prosody feedback
    if fluency_output and len(parts) < 2:
        macro = fluency_output.get("macro_feedback", "")
        if macro:
            parts.append(macro)

    # 6. Divergence warning (ASR vs acoustic mismatch)
    if fuse_output and len(parts) < 2:
        div_warning = fuse_output.get("divergence_warning", "")
        if not div_warning:
            legacy_breakdown = fuse_output.get("confidence_breakdown", {})
            candidate = legacy_breakdown.get("divergence_warning")
            div_warning = candidate if isinstance(candidate, str) else ""
        if div_warning:
            parts.append(div_warning)

    # 7. Perfect score
    if not parts:
        return "Phát âm chuẩn xác, cao độ và thanh điệu rất tốt, hãy giữ vững phong độ!"

    return " ".join(parts[:2])
