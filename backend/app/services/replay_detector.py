"""
Replay Detector — acoustic fingerprint-based replay attack detection.

Prevents adaptive tone profiles from being poisoned by replayed audio.
Compares MFCC fingerprints of incoming audio against recent submissions
from the same speaker. If similarity exceeds threshold, flags as replay
and skips adaptive profile update (scoring still proceeds normally).

Design choices:
- In-memory LRU cache per speaker (no DB dependency)
- Cosine similarity on MFCC features (robust to minor noise variations)
- Does NOT block scoring — only prevents adaptive calibration corruption
- TTL-based expiry: fingerprints auto-expire after window_minutes
"""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from typing import TypedDict

logger = logging.getLogger(__name__)


class ReplayDetectOutput(TypedDict):
    is_replay: bool
    max_similarity: float
    reason: str


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_MFCC_COEFFS = 13          # number of MFCC coefficients
_MFCC_FRAMES = 20          # target number of frames for fingerprint
_SIMILARITY_THRESHOLD = 0.95  # cosine similarity above this → replay
_MAX_FINGERPRINTS_PER_SPEAKER = 100
_DEFAULT_WINDOW_MINUTES = 30
_MAX_SPEAKERS = 1000       # global cap on distinct speaker keys (v2.1 audit fix)


# ---------------------------------------------------------------------------
# In-memory fingerprint store (thread-safe)
# ---------------------------------------------------------------------------

_lock = threading.Lock()
# {speaker_id: OrderedDict{unique_key: (mfcc_vector, timestamp)}}
_store: dict[str, OrderedDict] = {}
_fp_counter = 0  # monotonic counter for unique fingerprint keys


def _prune_expired(speaker_id: str, now: float, window_sec: float) -> None:
    """Remove fingerprints older than window_sec."""
    if speaker_id not in _store:
        return
    od = _store[speaker_id]
    cutoff = now - window_sec
    while od:
        _, ts = next(iter(od.values()))
        if ts < cutoff:
            od.popitem(last=False)
        else:
            break
    # Remove empty speaker entries to free memory
    if not od:
        del _store[speaker_id]


def _evict_oldest_speaker() -> None:
    """Evict the least-recently-used speaker when _store exceeds _MAX_SPEAKERS.

    Called inside _lock — must NOT acquire _lock again.
    """
    if len(_store) <= _MAX_SPEAKERS:
        return
    # Find speaker with oldest most-recent fingerprint (LRU by last activity)
    oldest_speaker = None
    oldest_ts = float("inf")
    for sid, od in _store.items():
        if od:
            _, last_ts = next(reversed(od.values()))
            if last_ts < oldest_ts:
                oldest_ts = last_ts
                oldest_speaker = sid
    if oldest_speaker:
        del _store[oldest_speaker]


def _store_fingerprint(
    speaker_id: str, fp: list[float], now: float
) -> None:
    """Store a fingerprint with LRU eviction."""
    global _fp_counter
    with _lock:
        if speaker_id not in _store:
            _store[speaker_id] = OrderedDict()
            # Evict oldest speaker if at capacity
            _evict_oldest_speaker()
        od = _store[speaker_id]
        # Use monotonic counter to guarantee unique keys (v2.1 audit fix)
        _fp_counter += 1
        key = f"{now:.6f}_{_fp_counter}"
        od[key] = (fp, now)
        od.move_to_end(key)
        # Evict oldest if over limit
        while len(od) > _MAX_FINGERPRINTS_PER_SPEAKER:
            od.popitem(last=False)


def _get_recent_fingerprints(
    speaker_id: str, now: float, window_sec: float
) -> list[list[float]]:
    """Get all non-expired fingerprints for a speaker."""
    with _lock:
        _prune_expired(speaker_id, now, window_sec)
        if speaker_id not in _store:
            return []
        return [fp for fp, _ in _store[speaker_id].values()]


# ---------------------------------------------------------------------------
# Spectral fingerprint extraction (numpy-based, no Praat MFCC dependency)
# ---------------------------------------------------------------------------

def _extract_mfcc_fingerprint(audio_bytes: bytes) -> list[float] | None:
    """Extract a compact spectral fingerprint from audio bytes.

    Uses log-mel-energy spectrogram features computed with numpy FFT.
    Returns a flattened vector of shape (_MFCC_COEFFS * _MFCC_FRAMES,)
    or None if extraction fails.

    This avoids Praat's MFCC API which has parameter sensitivity issues and
    can segfault on edge cases. The spectral fingerprint serves the same
    purpose for replay detection — capturing the acoustic signature.
    """
    try:
        import numpy as np

        from .tone_dsp_extractor import decode_wav

        samples, sr = decode_wav(audio_bytes)
        if len(samples) < sr * 0.1:  # need at least 100ms
            return None

        x = np.asarray(samples, dtype=np.float64)

        # Frame parameters
        frame_len = int(0.025 * sr)   # 25ms window
        hop_len = int(0.010 * sr)     # 10ms hop
        n_fft = max(512, frame_len)

        # Extract frames
        n_frames_total = max(1, (len(x) - frame_len) // hop_len + 1)
        frames = np.zeros((n_frames_total, frame_len))
        for i in range(n_frames_total):
            start = i * hop_len
            end = start + frame_len
            if end <= len(x):
                frames[i] = x[start:end]

        # Apply Hann window
        window = np.hanning(frame_len)
        frames *= window

        # Compute magnitude spectrum via FFT
        spectra = np.abs(np.fft.rfft(frames, n=n_fft))[:, :n_fft // 2]

        # Log-energy (add epsilon to avoid log(0))
        log_energy = np.log(spectra + 1e-10)

        # Resample to fixed number of frequency bins × time frames
        target_freq_bins = _MFCC_COEFFS
        target_time_frames = _MFCC_FRAMES

        # Bin frequency axis
        freq_resampled = np.zeros((n_frames_total, target_freq_bins))
        for i in range(n_frames_total):
            indices = np.linspace(0, log_energy.shape[1] - 1, target_freq_bins)
            freq_resampled[i] = np.interp(indices, np.arange(log_energy.shape[1]), log_energy[i])

        # Bin time axis
        coeffs = []
        time_indices = np.linspace(0, n_frames_total - 1, min(target_time_frames, n_frames_total))
        for ti in time_indices:
            idx = int(round(ti))
            idx = min(idx, n_frames_total - 1)
            coeffs.extend(freq_resampled[idx].tolist())

        # Pad if fewer frames than target
        target_len = _MFCC_COEFFS * _MFCC_FRAMES
        if len(coeffs) < target_len:
            coeffs.extend([0.0] * (target_len - len(coeffs)))

        return coeffs[:target_len]

    except Exception as e:
        logger.debug("Spectral fingerprint extraction failed: %s", e)
        return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    import numpy as np

    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a < 1e-10 or norm_b < 1e-10:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_replay(
    audio_bytes: bytes,
    speaker_id: str,
    window_minutes: int = _DEFAULT_WINDOW_MINUTES,
) -> ReplayDetectOutput:
    """Check if audio is suspiciously similar to recent submissions.

    Returns is_replay=True if cosine similarity with any recent fingerprint
    exceeds threshold. Always stores the current fingerprint for future checks
    (unless it's flagged as replay — replays don't update the store).
    """
    result: ReplayDetectOutput = {
        "is_replay": False,
        "max_similarity": 0.0,
        "reason": "",
    }

    if not speaker_id:
        return result

    fp = _extract_mfcc_fingerprint(audio_bytes)
    if fp is None:
        result["reason"] = "fingerprint_extraction_failed"
        return result

    now = time.time()
    window_sec = window_minutes * 60
    recent = _get_recent_fingerprints(speaker_id, now, window_sec)

    if not recent:
        # First submission in window — store and return clean
        _store_fingerprint(speaker_id, fp, now)
        result["reason"] = "first_in_window"
        return result

    # Compare against all recent fingerprints
    max_sim = 0.0
    for old_fp in recent:
        sim = _cosine_similarity(fp, old_fp)
        max_sim = max(max_sim, sim)

    result["max_similarity"] = round(max_sim, 4)

    if max_sim >= _SIMILARITY_THRESHOLD:
        result["is_replay"] = True
        result["reason"] = f"similarity={max_sim:.3f}>={_SIMILARITY_THRESHOLD}"
        logger.warning(
            "Replay detected for speaker %s: similarity=%.3f",
            speaker_id[:8], max_sim,
        )
        # Do NOT store replay fingerprint — would poison future comparisons
        return result

    # Not a replay — store for future comparisons
    _store_fingerprint(speaker_id, fp, now)
    result["reason"] = "clean"
    return result


def clear_speaker_fingerprints(speaker_id: str) -> int:
    """Clear all stored fingerprints for a speaker. Returns count removed."""
    with _lock:
        if speaker_id in _store:
            count = len(_store[speaker_id])
            del _store[speaker_id]
            return count
    return 0
