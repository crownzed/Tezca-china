"""
Adaptive Tone Analyzer — speaker-adaptive tone contour analysis.

Replaces static Chao template matching with templates that adapt to each
learner's pitch range and contour style over time. First call for a speaker
falls back to current Chao-template DTW (backward compatible). On subsequent
calls, builds a per-speaker pitch profile using exponential moving average
stored in a lightweight JSON file.

Templates are warped: a speaker whose T2 consistently rises only 2 Chao levels
instead of 3 gets a scaled template. The DTW distance threshold is also adapted
per-speaker based on their historical variance.

All computation is numpy/parselmouth — no neural network.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict

from .speaker_profile_lock import profile_lock

logger = logging.getLogger(__name__)


class AdaptiveToneOutput(TypedDict):
    """Output of adaptive tone analysis."""
    adaptive_accuracy: float        # 0-1, replaces raw DTW accuracy
    per_syllable: list[dict]        # [{pos, tone, distance, ok, feedback, method}]
    speaker_profile: dict           # {pitch_mean, pitch_std, contour_bias}
    used_adaptive: bool             # True if enough history existed


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Canonical Chao templates (same as tone_dsp_service.py)
_TONE_TEMPLATES: dict[int, list[float]] = {
    1: [5.0, 5.0, 5.0],
    2: [3.0, 4.0, 5.0],
    3: [2.0, 1.0, 1.0, 4.0],
    4: [5.0, 3.0, 1.0],
    5: [3.0, 3.0],
}

# Canonical amplitude per tone (max - min in Chao levels)
_CANONICAL_AMPLITUDE: dict[int, float] = {
    1: 0.0,   # flat
    2: 2.0,   # rising 3->5
    3: 3.0,   # dipping 2->1->4
    4: 4.0,   # falling 5->1
}

# Scoring thresholds (same defaults as tone_dsp_service.py)
_TONE_OK_DIST = 0.9
_TONE_MAX_DIST = 2.2

# Minimum samples before adaptive mode activates.
# v2.1: tăng từ 3 → 5 để tránh hội tụ vào outlier contours quá sớm.
_MIN_SAMPLES_FOR_ADAPTIVE = 5

# EMA smoothing factor.
# v2.1: giảm từ 0.3 → 0.20 để profile ổn định hơn, ít nhạy cảm với single noisy session.
_EMA_ALPHA = 0.20

# Phase-gated thresholds for adaptive modeling.
_SILENT_ADAPTATION_START = 5   # n_samples >= 5: bắt đầu warp template (widen threshold)
_FULL_PERSONALIZATION_START = 30  # n_samples >= 30: full personalization (normal threshold)

# Speaker profiles storage directory
_PROFILES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "speaker_profiles"


# ---------------------------------------------------------------------------
# Speaker profile persistence
# ---------------------------------------------------------------------------

# Profile TTL: profiles older than this are auto-expired (v2.1 privacy).
_PROFILE_TTL_DAYS = 90
_DEMO_PROFILE_TTL_DAYS = 7  # demo profiles expire faster


def _profile_path(speaker_id: str) -> Path:
    """Get the JSON file path for a speaker's profile."""
    # Sanitize speaker_id to prevent path traversal
    safe_id = "".join(c for c in speaker_id if c.isalnum() or c in "-_")
    return _PROFILES_DIR / f"{safe_id}.json"


def _read_profile(path: Path, speaker_id: str) -> dict | None:
    """Read one profile while its caller holds ``profile_lock``."""
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load speaker profile %s: %s", speaker_id, e)
        return None


def _load_profile(speaker_id: str) -> dict | None:
    """Load a speaker's profile from disk. Returns None if not found or expired."""
    path = _profile_path(speaker_id)
    with profile_lock(path):
        profile = _read_profile(path, speaker_id)
        if profile is None:
            return None

        # TTL check: auto-expire stale profiles (v2.1 privacy compliance).
        # The same per-profile lock is used by cleanup and writes, so this delete
        # cannot race an atomic replacement made by a live scoring request.
        ttl_days = _DEMO_PROFILE_TTL_DAYS if speaker_id.startswith("demo_") else _PROFILE_TTL_DAYS
        updated_str = profile.get("updated_at", "")
        if updated_str:
            try:
                updated = datetime.fromisoformat(updated_str)
                if (datetime.now(timezone.utc) - updated).days > ttl_days:
                    logger.info(
                        "Speaker profile %s expired (%d days old), deleting",
                        speaker_id[:8], (datetime.now(timezone.utc) - updated).days,
                    )
                    path.unlink(missing_ok=True)
                    return None
            except ValueError:
                pass  # invalid date format, keep profile

        return profile


def _save_profile(speaker_id: str, profile: dict) -> None:
    """Save a speaker's profile to disk atomically.

    Writes to a temp file first, then renames — prevents partial writes from
    corrupting the profile if the process is killed mid-write (v2.1 audit fix).
    """
    import os
    import tempfile

    try:
        _PROFILES_DIR.mkdir(parents=True, exist_ok=True)
        path = _profile_path(speaker_id)
        with profile_lock(path):
            # Write to temp file in same directory (same filesystem → atomic rename)
            fd, tmp_path = tempfile.mkstemp(
                suffix=".tmp", prefix=f"{path.stem}_", dir=str(_PROFILES_DIR),
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(profile, f, indent=2, ensure_ascii=False)
                os.replace(tmp_path, str(path))  # atomic on POSIX and Windows
            except BaseException:
                # Clean up temp file on any failure
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise
    except OSError as e:
        logger.warning("Failed to save speaker profile %s: %s", speaker_id, e)


def _new_profile() -> dict:
    """Create a fresh speaker profile."""
    return {
        "pitch_mean": 0.0,
        "pitch_std": 0.0,
        "contour_amplitudes": {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0},
        "n_samples": 0,
        "updated_at": "",
    }


def _ema(old: float, new: float, alpha: float = _EMA_ALPHA) -> float:
    """Exponential moving average update."""
    return alpha * new + (1 - alpha) * old


# ---------------------------------------------------------------------------
# DTW and scoring — canonical implementations live in tone_dsp_extractor.
# Private aliases kept so internal callers work unchanged.
# ---------------------------------------------------------------------------

from .tone_dsp_extractor import (
    SLOPE_WEIGHT as _SLOPE_WEIGHT,
    contour_distance as _contour_distance,
    dtw_distance as _dtw_distance,
    huber_cost as _huber_cost,
    net_slope as _net_slope,
    resample_linear as _resample_linear,
)


def _dist_to_accuracy(dist: float, ok_thresh: float = _TONE_OK_DIST, max_thresh: float = _TONE_MAX_DIST) -> float:
    """Map one syllable's Chao-level distance to a 0-1 accuracy."""
    span = max(max_thresh - ok_thresh, 1e-6)
    return max(0.0, min(1.0, 1.0 - (dist - ok_thresh) / span))


# ---------------------------------------------------------------------------
# Template warping
# ---------------------------------------------------------------------------

def _warp_template(template: list[float], canonical_amp: float, actual_amp: float) -> list[float]:
    """Scale a template's amplitude to match the speaker's typical realization.

    If a speaker consistently produces T2 with amplitude 1.5 instead of
    canonical 2.0, we scale the template so their "normal" T2 scores well
    rather than being penalized for not matching the textbook ideal.
    """
    if canonical_amp <= 0 or actual_amp <= 0:
        return template

    ratio = actual_amp / canonical_amp
    # Clamp ratio to avoid extreme warping
    ratio = max(0.5, min(1.5, ratio))

    mean = sum(template) / len(template)
    return [mean + (v - mean) * ratio for v in template]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze_tones_adaptive(
    segments: list[list[float]],
    normalized_segments: list[list[float]],
    target_tones: list[int],
    speaker_id: str,
) -> AdaptiveToneOutput:
    """Analyze tones with speaker-adaptive templates.

    Args:
        segments: Raw Hz segments from tone_dsp_extractor.
        normalized_segments: Shape-normalized (Chao units) segments.
        target_tones: Expected tone number (1-5) per syllable.
        speaker_id: User ID for per-speaker state tracking.

    Returns:
        AdaptiveToneOutput with adaptive accuracy and per-syllable details.
    """
    import numpy as np

    from .tone_dsp_extractor import center_template, shape_normalize

    # Load or create speaker profile
    profile = _load_profile(speaker_id)
    if profile is None:
        profile = _new_profile()

    use_adaptive = profile["n_samples"] >= _MIN_SAMPLES_FOR_ADAPTIVE

    # Compute current utterance statistics for profile update
    all_voiced: list[float] = []
    for seg in segments:
        all_voiced.extend(v for v in seg if v > 0)

    current_pitch_mean = 0.0
    current_pitch_std = 0.0
    if all_voiced:
        arr = np.log(np.asarray(all_voiced, dtype=np.float64))
        current_pitch_mean = float(arr.mean())
        current_pitch_std = float(arr.std())

    # Measure current contour amplitudes per tone
    current_amplitudes: dict[str, float] = {}
    for pos, tone in enumerate(target_tones):
        if tone == 5 or pos >= len(normalized_segments):
            continue
        seg = normalized_segments[pos]
        if seg:
            amp = max(seg) - min(seg)
            current_amplitudes[str(tone)] = amp

    # Score each syllable
    per_syllable: list[dict] = []
    accuracies: list[float] = []

    # Adaptive threshold: widen if speaker has high variance
    ok_thresh = _TONE_OK_DIST
    max_thresh = _TONE_MAX_DIST
    n_samples = profile.get("n_samples", 0)
    if use_adaptive and profile.get("pitch_std", 0) > 0:
        # Speakers with higher pitch variability get slightly wider thresholds
        variance_bonus = min(0.3, profile["pitch_std"] * 0.5)
        # Phase-gated: silent adaptation (5-30 samples) gets extra widening
        if n_samples < _FULL_PERSONALIZATION_START:
            variance_bonus += 0.15
        ok_thresh = _TONE_OK_DIST + variance_bonus
        max_thresh = _TONE_MAX_DIST + variance_bonus

    for pos, tone in enumerate(target_tones):
        if pos >= len(normalized_segments):
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": False,
                "feedback": "Không nghe rõ âm tiết này (thiếu giọng).",
                "method": "missing",
            })
            accuracies.append(0.0)
            continue

        if tone == 5:
            per_syllable.append({
                "pos": pos, "tone": tone, "distance": None, "ok": True,
                "feedback": "",
                "method": "neutral_skip",
            })
            continue

        seg_norm = normalized_segments[pos]
        base_template = _TONE_TEMPLATES.get(tone, _TONE_TEMPLATES[5])

        # Warp template if adaptive mode is active
        if use_adaptive and str(tone) in profile.get("contour_amplitudes", {}):
            speaker_amp = profile["contour_amplitudes"][str(tone)]
            canonical_amp = _CANONICAL_AMPLITUDE.get(tone, 0)
            if canonical_amp > 0 and speaker_amp > 0:
                warped = _warp_template(base_template, canonical_amp, speaker_amp)
                template = center_template(warped)
                method = "adaptive"
            else:
                template = center_template(base_template)
                method = "static"
        else:
            template = center_template(base_template)
            method = "static"

        dist = _contour_distance(seg_norm, template)
        acc = _dist_to_accuracy(dist, ok_thresh, max_thresh)
        accuracies.append(acc)

        ok = dist < ok_thresh
        fb = None
        if not ok:
            # Generate feedback based on the contour shape
            if seg_norm:
                start, end = seg_norm[0], seg_norm[-1]
                lowest = min(seg_norm)
                if tone == 1:
                    fb = "Thanh 1 cần giữ cao và ĐỀU; bạn để cao độ trôi lên/xuống."
                elif tone == 2:
                    if end - start < 1.0:
                        fb = "Thanh 2 phải ĐI LÊN rõ ở cuối; bạn chưa kéo cao độ lên."
                    else:
                        fb = "Thanh 2 cần lên dứt khoát hơn ở cuối âm tiết."
                elif tone == 3:
                    if lowest > -1.0:
                        fb = "Thanh 3 phần đáy chưa xuống đủ THẤP; hãy hạ giọng sâu hơn rồi mới nhấc lên."
                    else:
                        fb = "Thanh 3 cần hình võng (xuống thấp rồi lên) rõ hơn."
                elif tone == 4:
                    if start - end < 1.0:
                        fb = "Thanh 4 phải ĐỔ XUỐNG mạnh từ cao; bạn chưa hạ cao độ dứt khoát."
                    else:
                        fb = "Thanh 4 cần dốc xuống mạnh và nhanh hơn."

        per_syllable.append({
            "pos": pos, "tone": tone, "distance": round(dist, 3),
            "ok": ok, "feedback": fb, "method": method,
        })

    # Compute overall accuracy
    if not accuracies:
        adaptive_accuracy = 0.0
    else:
        adaptive_accuracy = float(np.mean(accuracies))

    # Update speaker profile with EMA (phase-gated + anomaly check)
    # Skip update entirely for all-neutral-tone utterances — they have no real
    # tone signal and would corrupt running stats with a false 0.0 score.
    has_scored_tones = bool(accuracies)
    if all_voiced and has_scored_tones:
        current_score_pct = adaptive_accuracy * 100

        # CUSUM-style anomaly detection: skip EMA update nếu score nhảy > 2σ.
        # Cold-start guard: don't check anomaly until we have enough samples to
        # establish a meaningful baseline (v2.1 audit fix). Before that, just
        # accumulate data without gating.
        n_samples_before = profile["n_samples"]
        is_anomaly = False
        if n_samples_before >= _MIN_SAMPLES_FOR_ADAPTIVE + 3:
            # Enough history for reliable running stats
            running_mean = profile.get("running_mean", current_score_pct)
            running_std = profile.get("running_std", 15.0)
            if abs(current_score_pct - running_mean) > 2 * max(running_std, 5.0):
                is_anomaly = True
                logger.info(
                    "Adaptive: anomaly detected for speaker %s "
                    "(score=%.1f vs mean=%.1f±%.1f), skipping EMA update",
                    speaker_id[:8], current_score_pct, running_mean, running_std,
                )
        elif n_samples_before < _MIN_SAMPLES_FOR_ADAPTIVE:
            # During warm-up: initialize running stats from actual scores so
            # they reflect the speaker's true level instead of default 50.0.
            if "running_mean" not in profile:
                profile["running_mean"] = current_score_pct
                profile["running_std"] = 15.0
            else:
                # Simple average during warm-up (more stable than EMA with few pts)
                old_mean = profile["running_mean"]
                profile["running_mean"] = old_mean + (current_score_pct - old_mean) / (n_samples_before + 1)

        if not is_anomaly:
            profile["pitch_mean"] = _ema(profile["pitch_mean"], current_pitch_mean)
            profile["pitch_std"] = _ema(profile["pitch_std"], current_pitch_std)
            for tone_str, amp in current_amplitudes.items():
                old_amp = profile["contour_amplitudes"].get(tone_str, 0.0)
                if old_amp == 0:
                    # First observation for this tone — initialize directly
                    profile["contour_amplitudes"][tone_str] = amp
                else:
                    profile["contour_amplitudes"][tone_str] = _ema(old_amp, amp)

            # Update running stats for anomaly detection
            alpha_stats = 0.1  # slower EMA for running stats
            running_mean = profile.get("running_mean", current_score_pct)
            profile["running_mean"] = _ema(running_mean, current_score_pct, alpha_stats)
            new_var = _ema(
                profile.get("running_std", 15.0) ** 2,
                (current_score_pct - running_mean) ** 2,
                alpha_stats,
            )
            profile["running_std"] = max(1.0, new_var ** 0.5)

        profile["n_samples"] += 1
        profile["updated_at"] = datetime.now(timezone.utc).isoformat()
        # Consent metadata default (v2.1 privacy compliance)
        if "consent_level" not in profile:
            profile["consent_level"] = "baseline"
            profile["consent_updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_profile(speaker_id, profile)

    return AdaptiveToneOutput(
        adaptive_accuracy=round(adaptive_accuracy, 3),
        per_syllable=per_syllable,
        speaker_profile={
            "pitch_mean": round(profile["pitch_mean"], 3),
            "pitch_std": round(profile["pitch_std"], 3),
            "n_samples": profile["n_samples"],
        },
        used_adaptive=use_adaptive,
    )
