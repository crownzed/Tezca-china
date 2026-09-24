"""
Fluency & Prosody Analyzer — delivery-level diagnostics for pronunciation scoring.

Measures HOW the utterance was delivered (rhythm, pauses, intonation range) as
an independent dimension from per-syllable tone accuracy. A learner can have
perfect tones but terrible rhythm, or natural flow with wrong tones — these are
orthogonal axes that must be scored and fed back separately.

This module reuses the SAME F0 contour the tone scorer already computes — no
extra audio pass, no new dependency. It adds a ``delivery_score`` (0-1) that
enters the composite as a bonus/penalty modifier (±5 points max).
"""
from __future__ import annotations

import logging
import math
from typing import TypedDict

logger = logging.getLogger(__name__)


class FluencyProsodyOutput(TypedDict):
    """Output of fluency/prosody analysis."""
    fluency: dict | None       # {speech_rate, pause_count, total_pause_sec, span_sec, feedback}
    prosody: dict | None       # {pitch_range_semitones, declination_semitones, feedback}
    delivery_score: float      # 0-1, composite of fluency + prosody
    macro_feedback: str        # joined feedback string


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# An interior unvoiced gap longer than this (seconds) counts as a hesitation
# pause. Short gaps between syllables (stops/aspiration) are normal speech.
_PAUSE_MIN_SEC = 0.25

# Comfortable Mandarin reading rate is ~3-5 syllables/sec. Outside this band
# the delivery is either halting or rushed. Used to phrase feedback AND to
# compute delivery_score.
_RATE_SLOW = 2.0
_RATE_FAST = 6.0
_RATE_OPTIMAL = 3.5   # center of comfortable range
_RATE_SIGMA = 1.0     # Gaussian width for rate normality

# Whole-utterance pitch span (semitones) below this reads as flat/monotone;
# above the high mark it is unusually wide.
_PROSODY_FLAT_ST = 3.0
_PROSODY_WIDE_ST = 16.0
_PROSODY_OPTIMAL_ST = 8.0  # center for prosody normality

# Minimum voiced frames needed for any analysis.
_MIN_VOICED_FRAMES = 3


# ---------------------------------------------------------------------------
# Fluency analysis
# ---------------------------------------------------------------------------

def analyze_fluency(
    contour: list[float],
    frame_step: float,
    n_syllables: int,
) -> dict | None:
    """Speech rate + hesitation pauses from the voiced/unvoiced pattern.

    speech_rate is syllables per second over the *spoken span* (first voiced
    frame to last), so leading/trailing silence never deflates it. Pauses are
    interior unvoiced runs longer than _PAUSE_MIN_SEC.
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


# ---------------------------------------------------------------------------
# Prosody analysis
# ---------------------------------------------------------------------------

def analyze_prosody(contour: list[float]) -> dict | None:
    """Whole-sentence intonation: pitch range + overall declination.

    Uses 10th/90th percentiles of voiced F0 for a robust range (semitones), and
    the net drift from the first third to the last third to detect the natural
    downward declination of a statement.
    """
    voiced = [v for v in contour if v > 0]
    if len(voiced) < _MIN_VOICED_FRAMES:
        return None

    import numpy as np

    arr = np.asarray(voiced, dtype=np.float64)
    lo, hi = np.percentile(arr, [10, 90])
    pitch_range_st = float(12.0 * np.log2(hi / lo)) if lo > 0 else 0.0

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


# ---------------------------------------------------------------------------
# Delivery score computation
# ---------------------------------------------------------------------------

def _rate_normality(speech_rate: float) -> float:
    """Gaussian normality around optimal speech rate. 1.0 at optimal, decays."""
    return math.exp(-0.5 * ((speech_rate - _RATE_OPTIMAL) / _RATE_SIGMA) ** 2)


def _pause_score(pause_count: int) -> float:
    """Exponential decay per pause. 0 pauses = 1.0, each pause costs ~40%."""
    return math.exp(-pause_count * 0.5)


def _prosody_normality(pitch_range_st: float) -> float:
    """How close pitch range is to optimal. 1.0 at optimal, linear decay."""
    diff = abs(pitch_range_st - _PROSODY_OPTIMAL_ST)
    return max(0.0, min(1.0, 1.0 - diff / _PROSODY_OPTIMAL_ST))


def compute_delivery_score(
    fluency: dict | None,
    prosody: dict | None,
) -> float:
    """Compute a 0-1 delivery score from fluency and prosody metrics.

    Weighted combination:
      50% rate normality (how close to comfortable reading speed)
      30% pause score (fewer pauses = better)
      20% prosody normality (natural intonation range)

    Returns 0.5 if neither fluency nor prosody data is available (neutral).
    """
    components: list[tuple[float, float]] = []

    if fluency:
        rate = fluency.get("speech_rate", _RATE_OPTIMAL)
        pauses = fluency.get("pause_count", 0)
        components.append((0.5, _rate_normality(rate)))
        components.append((0.3, _pause_score(pauses)))

    if prosody:
        pr = prosody.get("pitch_range_semitones", _PROSODY_OPTIMAL_ST)
        components.append((0.2, _prosody_normality(pr)))

    if not components:
        return 0.5  # neutral when no data

    total_weight = sum(w for w, _ in components)
    if total_weight <= 0:
        return 0.5

    score = sum(w * v for w, v in components) / total_weight
    return max(0.0, min(1.0, round(score, 3)))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze_delivery(
    f0_contour: list[float],
    frame_step_sec: float,
    n_syllables: int,
    duration_sec: float,
) -> FluencyProsodyOutput:
    """Analyze delivery quality from an F0 contour.

    This is the single entry point for downstream agents. It runs fluency and
    prosody analysis, computes a delivery score, and joins feedback.
    """
    fluency = analyze_fluency(f0_contour, frame_step_sec, n_syllables)
    prosody = analyze_prosody(f0_contour)
    delivery_score = compute_delivery_score(fluency, prosody)

    macro_lines = [
        d["feedback"] for d in (fluency, prosody) if d and d.get("feedback")
    ]

    return FluencyProsodyOutput(
        fluency=fluency,
        prosody=prosody,
        delivery_score=delivery_score,
        macro_feedback=" ".join(macro_lines),
    )
