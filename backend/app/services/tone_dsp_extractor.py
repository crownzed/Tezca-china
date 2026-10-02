"""
Tone DSP Extractor — pure signal extraction layer for pronunciation scoring.

Separated from scoring logic so it can serve both adaptive and fallback paths.
This module owns: WAV decoding, F0 tracking, syllable segmentation, and
shape normalization. It NEVER sees target tones — that boundary is what makes
downstream agents (adaptive analyzer, phoneme verifier) possible.

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
from typing import TypedDict

logger = logging.getLogger(__name__)


class ToneExtractOutput(TypedDict):
    """Output of tone feature extraction."""
    f0_contour: list[float]           # raw Hz, 0 = unvoiced
    segments: list[list[float]]       # per-syllable voiced segments (raw Hz)
    segment_frame_ranges: list[tuple[int, int]]  # [start, end) positions in f0_contour
    normalized_segments: list[list[float]]  # shape-normalized (Chao units)
    frame_step_sec: float             # seconds per F0 frame
    duration_sec: float               # total clip duration
    extraction_quality: float         # 0-1, based on voiced-frame ratio + stability


class ToneDspExtractorError(RuntimeError):
    """Raised when audio cannot be processed into a usable F0 contour."""


# ---------------------------------------------------------------------------
# Constants (moved from tone_dsp_service.py for single-source-of-truth)
# ---------------------------------------------------------------------------

# Pitch tracking bounds (Hz). Wide enough for both male and female learners.
F0_FLOOR = 70.0
F0_CEILING = 400.0
MIN_VOICED_FRAMES = 3

# Two-pass pitch floor/ceiling factors (Hirst's method).
PASS2_FLOOR_FACTOR = 0.75
PASS2_CEIL_FACTOR = 1.5

# An adjacent-frame jump beyond this ratio is treated as an octave artifact.
OCTAVE_JUMP_RATIO = 1.8

# One Chao tone level corresponds to roughly this much log-F0.
CHAO_LOG_UNIT = 0.147


# ---------------------------------------------------------------------------
# WAV decoding
# ---------------------------------------------------------------------------

def decode_wav(audio_bytes: bytes) -> tuple[list[float], int]:
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
        raise ToneDspExtractorError(f"Không đọc được WAV: {e}") from e

    if sample_width != 2:
        raise ToneDspExtractorError(f"Chỉ hỗ trợ WAV PCM 16-bit, nhận {sample_width * 8}-bit.")
    if framerate <= 0:
        raise ToneDspExtractorError("Sample rate không hợp lệ.")

    import numpy as np

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)
    samples /= 32768.0  # normalize to [-1, 1]
    return samples.tolist(), framerate


# ---------------------------------------------------------------------------
# F0 extraction
# ---------------------------------------------------------------------------

def _median3(contour: list[float]) -> list[float]:
    """3-point median filter over voiced frames only.

    Removes single-frame F0 spikes without smearing genuine tone movement.
    Unvoiced frames (0.0) are left as gaps.
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
    """Pull back frames that halved/doubled relative to a stable neighbour."""
    out = list(contour)
    prev = 0.0
    for i, v in enumerate(out):
        if v <= 0:
            prev = 0.0
            continue
        if prev > 0:
            ratio = v / prev
            if ratio >= OCTAVE_JUMP_RATIO and abs(v / 2 - prev) < abs(v - prev):
                out[i] = v / 2
            elif ratio <= 1 / OCTAVE_JUMP_RATIO and abs(v * 2 - prev) < abs(v - prev):
                out[i] = v * 2
        prev = out[i]
    return out


def extract_f0(samples: list[float], framerate: int) -> list[float]:
    """Extract a cleaned F0 contour (Hz) via a two-pass Praat track.

    Pass 1 (wide bounds) measures the speaker's own pitch distribution; pass 2
    re-tracks between q15/q85 percentiles so the tracker searches the RIGHT
    range for this speaker. The result is octave-corrected and median filtered.
    Unvoiced frames (Praat returns 0) are kept as 0 gaps.
    """
    import numpy as np
    import parselmouth  # type: ignore[import-untyped]

    sound = parselmouth.Sound(
        np.asarray(samples, dtype=np.float64),
        sampling_frequency=framerate,
    )

    # Pass 1 — wide bounds, just to learn this speaker's range.
    pitch1 = sound.to_pitch_ac(pitch_floor=F0_FLOOR, pitch_ceiling=F0_CEILING)
    f0 = pitch1.selected_array["frequency"]
    voiced1 = f0[f0 > 0]

    # Pass 2 — re-track within the speaker's own range.
    if voiced1.size >= MIN_VOICED_FRAMES:
        q15, q85 = np.percentile(voiced1, [15, 85])
        floor = max(F0_FLOOR, float(q15) * PASS2_FLOOR_FACTOR)
        ceil = min(F0_CEILING, float(q85) * PASS2_CEIL_FACTOR)
        if ceil - floor >= 20:
            pitch2 = sound.to_pitch_ac(pitch_floor=floor, pitch_ceiling=ceil)
            f0 = pitch2.selected_array["frequency"]

    contour = [float(v) for v in f0]
    contour = _fix_octave_jumps(contour)
    contour = _median3(contour)
    return contour


# ---------------------------------------------------------------------------
# Syllable segmentation
# ---------------------------------------------------------------------------

def split_syllable_ranges(contour: list[float], n_syllables: int) -> list[tuple[int, int]]:
    """Split an F0 contour into absolute [start_frame, end_frame) syllable ranges.

    Ranges retain their position in the original contour, including unvoiced gaps.
    That identity is required by consumers such as formant extraction; summing
    voiced-frame lengths cannot reconstruct an audio timestamp after gaps were
    removed. The reconciliation policy intentionally matches ``split_syllables``.
    """
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, value in enumerate(contour):
        if value > 0:
            if start is None:
                start = index
        elif start is not None:
            if index - start >= MIN_VOICED_FRAMES:
                runs.append((start, index))
            start = None
    if start is not None and len(contour) - start >= MIN_VOICED_FRAMES:
        runs.append((start, len(contour)))

    if not runs:
        return []

    if len(runs) > n_syllables:
        while len(runs) > n_syllables:
            index = min(
                range(len(runs) - 1),
                key=lambda i: (runs[i][1] - runs[i][0]) + (runs[i + 1][1] - runs[i + 1][0]),
            )
            runs[index : index + 2] = [(runs[index][0], runs[index + 1][1])]
    elif len(runs) < n_syllables:
        while len(runs) < n_syllables:
            index = max(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
            start, end = runs[index]
            if end - start < 2:
                break
            midpoint = start + (end - start) // 2
            runs[index : index + 1] = [(start, midpoint), (midpoint, end)]

    return runs


def split_syllables(contour: list[float], n_syllables: int) -> list[list[float]]:
    """Split a full F0 contour into ``n_syllables`` voiced segments.

    Mandarin syllables are separated by short unvoiced gaps. We segment on runs
    of voiced frames, then merge/split so the segment count matches the target
    syllable count (best-effort). Use ``split_syllable_ranges`` when the caller
    also needs the segments' absolute time positions.
    """
    return [
        [value for value in contour[start:end] if value > 0]
        for start, end in split_syllable_ranges(contour, n_syllables)
    ]


# ---------------------------------------------------------------------------
# Shape normalization
# ---------------------------------------------------------------------------

def shape_normalize(values: list[float]) -> list[float]:
    """Normalize an F0 segment to mean-centered Chao units (shape comparison).

    Takes log(F0), subtracts the segment mean (removes absolute pitch height),
    and divides by CHAO_LOG_UNIT to express in Chao levels. A genuinely flat
    tone stays flat instead of having jitter amplified.
    """
    import numpy as np

    arr = np.log(np.asarray(values, dtype=np.float64))
    arr = arr - arr.mean()
    return (arr / CHAO_LOG_UNIT).tolist()


def center_template(template: list[float]) -> list[float]:
    """Mean-center a Chao template so it lives in the same space as
    shape-normalized user contours."""
    import numpy as np

    arr = np.asarray(template, dtype=np.float64)
    return (arr - arr.mean()).tolist()


# ---------------------------------------------------------------------------
# Extraction quality metric
# ---------------------------------------------------------------------------

def _compute_extraction_quality(contour: list[float]) -> float:
    """Compute a 0-1 quality score for the extracted F0 contour.

    Based on:
      1. Voiced-frame ratio (more voiced = better signal)
      2. Inverse coefficient of variation of voiced F0 (stable pitch = cleaner)

    Clamped to [0, 1]. A quality below ~0.3 means the acoustic signal is too
    noisy or sparse for reliable tone scoring.
    """
    import numpy as np

    if not contour:
        return 0.0

    total = len(contour)
    voiced = [v for v in contour if v > 0]
    n_voiced = len(voiced)

    if n_voiced < MIN_VOICED_FRAMES:
        return 0.0

    # Component 1: voiced frame ratio
    voiced_ratio = n_voiced / total

    # Component 2: stability (inverse CV)
    arr = np.asarray(voiced, dtype=np.float64)
    mean_f0 = float(arr.mean())
    std_f0 = float(arr.std())
    if mean_f0 > 0:
        cv = std_f0 / mean_f0
        # Typical CV for speech is 0.1-0.3; above 0.5 is very unstable
        stability = max(0.0, 1.0 - cv * 2.0)
    else:
        stability = 0.0

    quality = voiced_ratio * stability
    return max(0.0, min(1.0, quality))


# ---------------------------------------------------------------------------
# Frame step computation
# ---------------------------------------------------------------------------

def frame_step_sec(duration_sec: float, n_frames: int) -> float:
    """Seconds per F0 frame, derived from clip duration / frame count."""
    if n_frames <= 0:
        return 0.0
    return duration_sec / n_frames


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def extract_tone_features(
    audio_bytes: bytes,
    n_target_syllables: int,
) -> ToneExtractOutput:
    """Extract all tone-related features from a WAV audio clip.

    This is the single entry point for downstream agents. It decodes the audio,
    extracts F0, segments into syllables, normalizes shapes, and computes a
    quality metric. It does NOT score anything — that's downstream.

    Raises ToneDspExtractorError if audio is undecodable or has no usable F0.
    """
    samples, framerate = decode_wav(audio_bytes)
    return extract_tone_features_from_samples(samples, framerate, n_target_syllables)


def extract_tone_features_from_samples(
    samples: list[float],
    framerate: int,
    n_target_syllables: int,
) -> ToneExtractOutput:
    """Same as extract_tone_features but accepts pre-decoded samples.

    Avoids redundant WAV decoding when the caller already decoded the audio
    (e.g., for passing to multiple agents).
    """
    if len(samples) < framerate // 10:  # < 100ms
        raise ToneDspExtractorError("Đoạn ghi âm quá ngắn để phân tích.")

    duration_sec = len(samples) / framerate
    contour = extract_f0(samples, framerate)

    voiced = [v for v in contour if v > 0]
    if len(voiced) < MIN_VOICED_FRAMES:
        raise ToneDspExtractorError("Không phát hiện được giọng nói rõ (F0) trong đoạn ghi âm.")

    segment_frame_ranges = split_syllable_ranges(contour, n_target_syllables)
    segments = [
        [value for value in contour[start:end] if value > 0]
        for start, end in segment_frame_ranges
    ]
    if not segments or len(segments) != len(segment_frame_ranges):
        raise ToneDspExtractorError("Không tách được âm tiết từ đường F0.")

    normalized_segments = [shape_normalize(seg) for seg in segments]

    fs = frame_step_sec(duration_sec, len(contour))
    quality = _compute_extraction_quality(contour)

    return ToneExtractOutput(
        f0_contour=[round(v, 1) for v in contour],
        segments=segments,
        segment_frame_ranges=segment_frame_ranges,
        normalized_segments=normalized_segments,
        frame_step_sec=fs,
        duration_sec=duration_sec,
        extraction_quality=round(quality, 3),
    )


# ---------------------------------------------------------------------------
# Shared DTW / scoring primitives
# ---------------------------------------------------------------------------
# Canonical implementations of Huber cost, DTW with Sakoe-Chiba band, net
# slope, linear resampling, and combined contour distance. Both
# ``tone_dsp_service`` and ``adaptive_tone_analyzer`` import from here so
# there is a single source of truth — fixing a bug in one place fixes both.

SLOPE_WEIGHT = 0.6
"""Weight on the slope-direction term added to DTW shape cost."""


def huber_cost(diff: float, delta: float = 0.5) -> float:
    """Huber loss: quadratic near 0, linear for |diff| > delta.

    Robust to outlier F0 points — prevents single noisy frame from dominating
    the DTW alignment cost. Delta=0.5 Chao levels ≈ transition zone between
    in-tune and noticeably off.
    """
    ad = abs(diff)
    if ad <= delta:
        return 0.5 * diff * diff / delta
    return ad - 0.5 * delta


def dtw_distance(a: list[float], b: list[float]) -> float:
    """Dynamic Time Warping with Huber cost and Sakoe-Chiba band constraint.

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
            d = huber_cost(ai - b[j - 1])
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


def net_slope(seq: list[float]) -> float:
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


def resample_linear(seq: list[float], length: int) -> list[float]:
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


def contour_distance(seg_norm: list[float], template: list[float]) -> float:
    """Combined tone distance: DTW shape cost + slope-direction penalty.

    DTW alone tolerates time-warping, which can mask a wrong *direction* (e.g. a
    clearly rising contour scored against a flat T1 template still warps cheaply).
    Tones are defined by direction + slope, so we add the absolute difference in
    net slope between the user's syllable and the template. This is what catches
    "said with the wrong tone contour" that DTW by itself lets through.

    The slope term compares net rise/fall, but ``net_slope`` averages over the
    first/last thirds — so a 3-point template and a 40-point syllable measure
    slope over very different fractions of their span, inflating the gap for a
    correctly-realized tone. We resample the template to the segment's length
    first so both slopes are measured on the same footing. (DTW is unaffected —
    it already warps across length differences.)
    """
    shape = dtw_distance(seg_norm, template)
    tpl_for_slope = resample_linear(template, len(seg_norm)) if seg_norm else template
    slope_gap = abs(net_slope(seg_norm) - net_slope(tpl_for_slope))
    return shape + SLOPE_WEIGHT * slope_gap
