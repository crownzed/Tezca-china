"""
Phoneme Verifier — acoustic validation of ASR-transcribed pinyin.

Catches Gemini ASR hallucinations by comparing measured formant signatures
against published Mandarin phonetic norms. When ASR says "zhōng" but F2/F3
pattern matches "zōng" (retroflex vs dental), this agent flags low confidence.

Uses parselmouth for formant extraction (Burg method) and energy envelope
analysis for inserted/deleted syllable detection. No ML model — purely
signal-based verification against phonetic priors.

This agent is the only one that can say "the ASR was wrong about what was said."
"""
from __future__ import annotations

import logging
import re
from typing import TypedDict

logger = logging.getLogger(__name__)


class PhonemeVerifyOutput(TypedDict):
    """Output of phoneme verification."""
    verified_pinyin: list[str]          # corrected pinyin (may == asr_pinyin)
    per_syllable_confidence: list[float]  # 0-1 per syllable
    corrections: list[dict]             # [{pos, original, corrected, reason}]
    phoneme_score: float                # 0-1, proportion of syllables confirmed


# ---------------------------------------------------------------------------
# Mandarin formant lookup table
# ---------------------------------------------------------------------------
# Based on published Mandarin phonetic norms (Zhu 2015, Duanmu 2007).
# Format: initial -> (F1_lo, F1_hi, F2_lo, F2_hi) in Hz at vowel nucleus.
# These are APPROXIMATE ranges for adult speakers; we use wide bounds to avoid
# false positives. The key discriminators are:
#   - Retroflex (zh/ch/sh/r): lower F2 than dental (z/c/s)
#   - Palatal (j/q/x): higher F2 than velar (g/k/h)
#   - Labial (b/p/m/f): F2 transition patterns

_INITIAL_FORMANT_RANGES: dict[str, tuple[float, float, float, float]] = {
    # Retroflex initials — F2 typically 1200-1800 Hz at vowel onset
    "zh": (200, 600, 1100, 1900),
    "ch": (200, 600, 1100, 1900),
    "sh": (200, 600, 1100, 1900),
    "r":  (200, 600, 1100, 1900),
    # Dental sibilants — F2 typically 1800-2600 Hz
    "z":  (200, 600, 1700, 2700),
    "c":  (200, 600, 1700, 2700),
    "s":  (200, 600, 1700, 2700),
    # Palatals — high F2 (2000-3000 Hz)
    "j":  (200, 600, 2000, 3100),
    "q":  (200, 600, 2000, 3100),
    "x":  (200, 600, 2000, 3100),
    # Velars — mid F2
    "g":  (200, 600, 1200, 2200),
    "k":  (200, 600, 1200, 2200),
    "h":  (200, 600, 1200, 2200),
    # Labials
    "b":  (200, 600, 1000, 2400),
    "p":  (200, 600, 1000, 2400),
    "m":  (200, 600, 800, 2000),
    "f":  (200, 600, 1200, 2400),
    # Alveolars
    "d":  (200, 600, 1400, 2400),
    "t":  (200, 600, 1400, 2400),
    "n":  (200, 600, 1200, 2200),
    "l":  (200, 600, 1200, 2400),
    # Zero initial (vowel-only syllables like "a", "o", "e")
    "":   (200, 800, 800, 2800),
}

# Confusable pairs: (initial_a, initial_b) that ASR commonly confuses.
# We check these specifically when confidence is borderline.
_CONFUSABLE_PAIRS: list[tuple[str, str]] = [
    ("zh", "z"), ("ch", "c"), ("sh", "s"),
    ("j", "zh"), ("q", "ch"), ("x", "sh"),
    ("n", "l"), ("r", "l"),
    ("h", "f"), ("g", "k"),
]


def _extract_initial(pinyin: str) -> str:
    """Extract the initial consonant from a pinyin syllable (tone-stripped)."""
    syl = re.sub(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]", lambda m: {
        "ā": "a", "á": "a", "ǎ": "a", "à": "a",
        "ē": "e", "é": "e", "ě": "e", "è": "e",
        "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
        "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
        "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
        "ǖ": "ü", "ǘ": "ü", "ǚ": "ü", "ǜ": "ü",
    }[m.group()], pinyin.lower())
    syl = re.sub(r"[1-5]$", "", syl)

    # Two-char initials first
    for init in ("zh", "ch", "sh"):
        if syl.startswith(init):
            return init
    # Single-char initials
    single = "bpmfdtnlgkhjqxrzcsyw"
    if syl and syl[0] in single:
        return syl[0]
    return ""


def _in_formant_range(
    f1: float, f2: float,
    expected: tuple[float, float, float, float],
) -> bool:
    """Check if measured F1/F2 falls within expected range."""
    f1_lo, f1_hi, f2_lo, f2_hi = expected
    return f1_lo <= f1 <= f1_hi and f2_lo <= f2 <= f2_hi


# ---------------------------------------------------------------------------
# Formant extraction
# ---------------------------------------------------------------------------

def _extract_formants_at_midpoint(
    audio_bytes: bytes,
    segment_indices: list[tuple[int, int]],
    framerate: int,
    *,
    predecoded: tuple[list[float], int] | None = None,
) -> list[tuple[float, float, float] | None]:
    """Extract F1, F2, F3 at the temporal midpoint of each syllable segment.

    Returns list of (F1, F2, F3) tuples, or None if formant tracking failed
    for that segment. Uses Burg method via parselmouth.

    Args:
        audio_bytes: WAV PCM bytes (used only if predecoded is None).
        segment_indices: (start_sample, end_sample) pairs per syllable.
        framerate: Sample rate in Hz (used only if predecoded is None).
        predecoded: Optional (samples, sr) tuple to skip redundant WAV decode.
    """
    import numpy as np
    import parselmouth  # type: ignore[import-untyped]

    if predecoded is not None:
        samples, sr = predecoded
    else:
        from .tone_dsp_extractor import decode_wav

        try:
            samples, sr = decode_wav(audio_bytes)
        except Exception:
            return [None] * len(segment_indices)
        # Use the passed framerate if decode didn't provide sr
        if sr <= 0:
            sr = framerate

    sound = parselmouth.Sound(np.asarray(samples, dtype=np.float64), sampling_frequency=sr)
    formant = sound.to_formant_burg()

    results: list[tuple[float, float, float] | None] = []
    for start_idx, end_idx in segment_indices:
        mid_idx = (start_idx + end_idx) // 2
        time_sec = mid_idx / sr
        try:
            f1 = formant.get_value_at_time(1, time_sec)
            f2 = formant.get_value_at_time(2, time_sec)
            f3 = formant.get_value_at_time(3, time_sec)
            if f1 is not None and f2 is not None and f1 > 0 and f2 > 0:
                results.append((float(f1), float(f2), float(f3 or 0)))
            else:
                results.append(None)
        except Exception:
            results.append(None)

    return results


# ---------------------------------------------------------------------------
# Energy-based syllable count verification
# ---------------------------------------------------------------------------

def _estimate_syllable_count_from_energy(
    audio_bytes: bytes,
    *,
    predecoded: tuple[list[float], int] | None = None,
) -> int:
    """Estimate syllable count from energy envelope peaks.

    Each Mandarin syllable has a distinct energy peak. Count peaks above a
    threshold to get a rough syllable count for cross-checking ASR output.

    Args:
        predecoded: Optional (samples, sr) tuple to skip redundant WAV decode.
    """
    import numpy as np

    if predecoded is not None:
        samples, sr = predecoded
    else:
        from .tone_dsp_extractor import decode_wav

        try:
            samples, sr = decode_wav(audio_bytes)
        except Exception:
            return 0

    arr = np.asarray(samples, dtype=np.float64)
    # Compute RMS energy in 20ms windows
    window_size = max(1, sr // 50)
    n_windows = len(arr) // window_size
    if n_windows < 3:
        return 0

    energy = np.array([
        np.sqrt(np.mean(arr[i * window_size : (i + 1) * window_size] ** 2))
        for i in range(n_windows)
    ])

    # Adaptive threshold: mean + 0.3 * std
    threshold = float(energy.mean() + 0.3 * energy.std())
    above = energy > threshold

    # Count contiguous above-threshold runs
    peaks = 0
    in_peak = False
    for v in above:
        if v and not in_peak:
            peaks += 1
            in_peak = True
        elif not v:
            in_peak = False

    return max(1, peaks)


# ---------------------------------------------------------------------------
# Main verification function
# ---------------------------------------------------------------------------

def verify_phonemes(
    audio_bytes: bytes,
    target_pinyin: list[str],
    asr_pinyin: list[str],
    *,
    predecoded: tuple[list[float], int] | None = None,
    precomputed_f0: list[float] | None = None,
    precomputed_segments: list[list[float]] | None = None,
) -> PhonemeVerifyOutput:
    """Verify ASR transcription against acoustic evidence.

    Args:
        audio_bytes: WAV PCM 16-bit audio (used only if predecoded is None).
        target_pinyin: Expected pinyin syllables (with tone marks).
        asr_pinyin: ASR-transcribed pinyin syllables.
        predecoded: Optional (samples, sr) tuple to skip redundant WAV decode.
        precomputed_f0: Optional F0 contour from prior extraction (skips Praat).
        precomputed_segments: Optional syllable segments from prior extraction.

    Returns:
        PhonemeVerifyOutput with per-syllable confidence and corrections.
    """
    if not asr_pinyin:
        return PhonemeVerifyOutput(
            verified_pinyin=[],
            per_syllable_confidence=[],
            corrections=[],
            phoneme_score=0.0,
        )

    # Step 1: Energy-based syllable count cross-check
    estimated_count = _estimate_syllable_count_from_energy(audio_bytes, predecoded=predecoded)
    count_mismatch = abs(len(asr_pinyin) - estimated_count) > 1

    # Step 2: Extract F0 segments to know where syllables are temporally.
    # Reuse precomputed F0/segments if available (avoids redundant Praat call).
    from .tone_dsp_extractor import extract_f0, decode_wav, split_syllables

    try:
        if precomputed_f0 is not None and precomputed_segments is not None:
            contour = precomputed_f0
            segments = precomputed_segments
            # Need samples/sr for formant extraction
            if predecoded is not None:
                samples, sr = predecoded
            else:
                samples, sr = decode_wav(audio_bytes)
        else:
            if predecoded is not None:
                samples, sr = predecoded
            else:
                samples, sr = decode_wav(audio_bytes)
            contour = extract_f0(samples, sr)
            segments = split_syllables(contour, len(asr_pinyin))
    except Exception:
        # If extraction fails, trust ASR fully
        return PhonemeVerifyOutput(
            verified_pinyin=list(asr_pinyin),
            per_syllable_confidence=[0.7] * len(asr_pinyin),
            corrections=[],
            phoneme_score=0.7,
        )

    # Build segment index ranges for formant extraction
    seg_indices: list[tuple[int, int]] = []
    pos = 0
    for seg in segments:
        seg_indices.append((pos, pos + len(seg)))
        pos += len(seg)

    # Pad if fewer segments than syllables
    while len(seg_indices) < len(asr_pinyin):
        seg_indices.append((0, 0))

    # Step 3: Extract formants at each syllable midpoint
    formants = _extract_formants_at_midpoint(
        audio_bytes, seg_indices[:len(asr_pinyin)], sr, predecoded=predecoded,
    )

    # Step 4: Compare against expected formant ranges
    per_syllable_confidence: list[float] = []
    corrections: list[dict] = []
    verified = list(asr_pinyin)

    for i, syl in enumerate(asr_pinyin):
        initial = _extract_initial(syl)
        fm = formants[i] if i < len(formants) else None

        if fm is None:
            # No formant data — moderate confidence (can't verify)
            conf = 0.6
        elif initial in _INITIAL_FORMANT_RANGES:
            expected = _INITIAL_FORMANT_RANGES[initial]
            f1, f2, _f3 = fm
            if _in_formant_range(f1, f2, expected):
                conf = 0.95  # formants match expected initial
            else:
                # Check if it matches a confusable pair
                conf = 0.5
                for a, b in _CONFUSABLE_PAIRS:
                    if initial == a and b in _INITIAL_FORMANT_RANGES:
                        alt_range = _INITIAL_FORMANT_RANGES[b]
                        if _in_formant_range(f1, f2, alt_range):
                            corrections.append({
                                "pos": i,
                                "original": syl,
                                "corrected": syl.replace(a, b, 1),
                                "reason": f"Formant F2={f2:.0f}Hz phù hợp '{b}' hơn '{a}'",
                            })
                            conf = 0.4
                            break
                    elif initial == b and a in _INITIAL_FORMANT_RANGES:
                        alt_range = _INITIAL_FORMANT_RANGES[a]
                        if _in_formant_range(f1, f2, alt_range):
                            corrections.append({
                                "pos": i,
                                "original": syl,
                                "corrected": syl.replace(b, a, 1),
                                "reason": f"Formant F2={f2:.0f}Hz phù hợp '{a}' hơn '{b}'",
                            })
                            conf = 0.4
                            break
        else:
            # Unknown initial — moderate confidence
            conf = 0.7

        # Penalize if syllable count mismatch
        if count_mismatch:
            conf *= 0.8

        per_syllable_confidence.append(round(conf, 3))

    # Apply corrections to verified pinyin
    for c in corrections:
        pos = c["pos"]
        if pos < len(verified):
            verified[pos] = c["corrected"]

    phoneme_score = sum(per_syllable_confidence) / len(per_syllable_confidence) if per_syllable_confidence else 0.0

    return PhonemeVerifyOutput(
        verified_pinyin=verified,
        per_syllable_confidence=per_syllable_confidence,
        corrections=corrections,
        phoneme_score=round(phoneme_score, 3),
    )
