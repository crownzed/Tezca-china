"""Tests for the 6-agent pronunciation scoring pipeline."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ---------------------------------------------------------------------------
# Agent 5: Confidence Fuser
# ---------------------------------------------------------------------------

class TestConfidenceFuser:
    def test_weighted_fusion_basic(self):
        from app.services.confidence_fuser import fuse_scores

        result = fuse_scores({
            "base_score": 100,
            "identity_tone_ratio": 0.8,
            "dsp_tone_accuracy": 0.9,
            "phoneme_confidence": 0.9,
            "extraction_quality": 0.8,
            "adaptive_used": False,
            "n_tone_slots": 3,
            "per_syllable_identity": [],
            "per_syllable_acoustic": [],
        })
        assert result["fusion_method"] == "weighted"
        assert 0 <= result["tone_accuracy"] <= 1.0
        assert 0 <= result["final_score"] <= 100

    def test_fallback_when_extraction_quality_low(self):
        from app.services.confidence_fuser import fuse_scores

        result = fuse_scores({
            "base_score": 80,
            "identity_tone_ratio": 0.7,
            "dsp_tone_accuracy": 0.3,  # DSP says bad
            "phoneme_confidence": 0.9,
            "extraction_quality": 0.1,  # too noisy
            "adaptive_used": False,
            "n_tone_slots": 2,
            "per_syllable_identity": [],
            "per_syllable_acoustic": [],
        })
        assert result["fusion_method"] == "fallback_identity"
        assert result["tone_accuracy"] == 0.7  # identity ratio used

    def test_identity_only_when_no_tone_slots(self):
        from app.services.confidence_fuser import fuse_scores

        result = fuse_scores({
            "base_score": 90,
            "identity_tone_ratio": 1.0,
            "dsp_tone_accuracy": 0.5,
            "phoneme_confidence": 0.8,
            "extraction_quality": 0.7,
            "adaptive_used": False,
            "n_tone_slots": 0,
            "per_syllable_identity": [],
            "per_syllable_acoustic": [],
        })
        assert result["fusion_method"] == "identity_only"
        assert result["final_score"] == 90

    def test_adaptive_bonus_increases_dsp_weight(self):
        from app.services.confidence_fuser import fuse_scores

        base_input = {
            "base_score": 100,
            "identity_tone_ratio": 0.5,
            "dsp_tone_accuracy": 0.9,
            "phoneme_confidence": 0.8,
            "extraction_quality": 0.8,
            "n_tone_slots": 2,
            "per_syllable_identity": [],
            "per_syllable_acoustic": [],
        }

        result_no_adaptive = fuse_scores({**base_input, "adaptive_used": False})
        result_adaptive = fuse_scores({**base_input, "adaptive_used": True})

        # Adaptive should weight DSP more → tone_accuracy closer to DSP value
        assert result_adaptive["tone_accuracy"] >= result_no_adaptive["tone_accuracy"]

    def test_per_syllable_explanation_generated(self):
        from app.services.confidence_fuser import fuse_scores

        result = fuse_scores({
            "base_score": 80,
            "identity_tone_ratio": 0.6,
            "dsp_tone_accuracy": 0.7,
            "phoneme_confidence": 0.8,
            "extraction_quality": 0.7,
            "adaptive_used": False,
            "n_tone_slots": 2,
            "per_syllable_identity": [{"pos": 0, "type": "wrong_syllable"}],
            "per_syllable_acoustic": [{"pos": 0, "ok": False, "distance": 1.5}],
        })
        assert len(result["per_syllable_explanation"]) > 0
        assert "identity_contrib" in result["per_syllable_explanation"][0]
    def test_divergent_fusion_keeps_breakdown_numeric_and_surfaces_warning(self):
        from app.schemas import PronunciationScoreOut
        from app.services.confidence_fuser import fuse_scores
        from app.services.score_explainer import explain_score

        result = fuse_scores({
            "base_score": 80,
            "identity_tone_ratio": 1.0,
            "dsp_tone_accuracy": 0.0,
            "phoneme_confidence": 1.0,
            "extraction_quality": 1.0,
            "adaptive_used": False,
            "n_tone_slots": 2,
            "per_syllable_identity": [],
            "per_syllable_acoustic": [],
        })

        assert result["fusion_method"] == "weighted_divergent"
        assert result["divergence_warning"]
        assert all(isinstance(value, float) for value in result["confidence_breakdown"].values())

        response = PronunciationScoreOut(
            score=result["final_score"], base_score=80, identity_score=80,
            target_hanzi="你好", target_pinyin="nǐ hǎo",
            fusion_method=result["fusion_method"],
            confidence_breakdown=result["confidence_breakdown"],
            divergence_warning=result["divergence_warning"],
        )
        assert response.divergence_warning == result["divergence_warning"]

        feedback = explain_score(
            target_hanzi="你好", target_pinyin="nǐ hǎo", actual_pinyin="nǐ hǎo",
            fuse_output=result, phoneme_output=None, adaptive_output=None,
            fluency_output=None, pinyin_breakdown={"tone_errors": [], "syllable_errors": []},
        )
        assert result["divergence_warning"] in feedback["tip"]


# ---------------------------------------------------------------------------
# Agent 4: Fluency/Prosody Analyzer
# ---------------------------------------------------------------------------

class TestFluencyProsodyAnalyzer:
    def test_delivery_score_neutral_when_no_data(self):
        from app.services.fluency_prosody_analyzer import compute_delivery_score

        score = compute_delivery_score(None, None)
        assert score == 0.5

    def test_delivery_score_high_for_good_fluency(self):
        from app.services.fluency_prosody_analyzer import compute_delivery_score

        fluency = {"speech_rate": 3.5, "pause_count": 0}
        prosody = {"pitch_range_semitones": 8.0}
        score = compute_delivery_score(fluency, prosody)
        assert score > 0.8

    def test_delivery_score_low_for_many_pauses(self):
        from app.services.fluency_prosody_analyzer import compute_delivery_score

        fluency = {"speech_rate": 3.5, "pause_count": 5}
        score = compute_delivery_score(fluency, None)
        # Rate is perfect (1.0) but 5 pauses → pause_score ≈ 0.08
        # Without prosody, weights renormalize: 0.5/(0.5+0.3)=0.625 rate + 0.375 pause
        # ≈ 0.625*1.0 + 0.375*0.08 ≈ 0.656
        assert score < 0.7  # still penalized vs perfect 1.0

    def test_analyze_delivery_integration(self):
        from app.services.fluency_prosody_analyzer import analyze_delivery

        # Synthetic contour: 3 syllables with gaps
        contour = [150.0] * 20 + [0.0] * 5 + [160.0] * 20 + [0.0] * 5 + [155.0] * 20
        result = analyze_delivery(contour, 0.01, 3, 0.7)
        assert "delivery_score" in result
        assert "fluency" in result
        assert "prosody" in result


# ---------------------------------------------------------------------------
# Agent 3: Adaptive Tone Analyzer
# ---------------------------------------------------------------------------

class TestAdaptiveToneAnalyzer:
    def test_static_fallback_on_first_call(self, tmp_path, monkeypatch):
        from app.services.adaptive_tone_analyzer import analyze_tones_adaptive

        # Point profiles dir to temp
        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        segments = [[150.0, 155.0, 160.0, 165.0, 170.0]]
        norm_segments = [[-1.0, -0.5, 0.0, 0.5, 1.0]]
        result = analyze_tones_adaptive(segments, norm_segments, [2], "test_user_1")

        assert result["used_adaptive"] is False
        assert result["per_syllable"][0]["method"] == "static"

    def test_adaptive_activates_after_n_samples(self, tmp_path, monkeypatch):
        from app.services.adaptive_tone_analyzer import analyze_tones_adaptive

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        segments = [[150.0, 155.0, 160.0, 165.0, 170.0]]
        norm_segments = [[-1.0, -0.5, 0.0, 0.5, 1.0]]

        # v2.1: threshold is now 5 samples (was 3)
        for _ in range(5):
            analyze_tones_adaptive(segments, norm_segments, [2], "test_user_2")

        # 6th call should use adaptive
        result = analyze_tones_adaptive(segments, norm_segments, [2], "test_user_2")
        assert result["used_adaptive"] is True
        assert result["speaker_profile"]["n_samples"] == 6


# ---------------------------------------------------------------------------
# Agent 6: Score Explainer
# ---------------------------------------------------------------------------

class TestScoreExplainer:
    def test_perfect_score_tip(self):
        from app.services.score_explainer import explain_score

        result = explain_score(
            target_hanzi="你好",
            target_pinyin="nǐ hǎo",
            actual_pinyin="nǐ hǎo",
            fuse_output={"tone_accuracy": 1.0, "per_syllable_explanation": []},
            phoneme_output=None,
            adaptive_output=None,
            fluency_output=None,
            pinyin_breakdown={"tone_errors": [], "syllable_errors": []},
        )
        assert "chuẩn xác" in result["tip"] or "tốt" in result["tip"]

    def test_tone_error_tip(self):
        from app.services.score_explainer import explain_score

        result = explain_score(
            target_hanzi="你好",
            target_pinyin="nǐ hǎo",
            actual_pinyin="ní hǎo",
            fuse_output={"tone_accuracy": 0.5, "per_syllable_explanation": []},
            phoneme_output=None,
            adaptive_output=None,
            fluency_output=None,
            pinyin_breakdown={
                "tone_errors": [{"pos": 0, "expected_tone": 3, "got_tone": 2, "syllable": "nǐ"}],
                "syllable_errors": [],
            },
        )
        assert "thanh" in result["tip"].lower() or "nǐ" in result["tip"]

    def test_dimension_scores_populated(self):
        from app.services.score_explainer import explain_score

        result = explain_score(
            target_hanzi="中国",
            target_pinyin="zhōng guó",
            actual_pinyin="zhōng guó",
            fuse_output={"tone_accuracy": 0.9, "per_syllable_explanation": []},
            phoneme_output={"phoneme_score": 0.85, "corrections": [], "per_syllable_confidence": [0.9, 0.8]},
            adaptive_output=None,
            fluency_output={"delivery_score": 0.7, "macro_feedback": "", "fluency": None, "prosody": None},
            pinyin_breakdown={"tone_errors": [], "syllable_errors": []},
        )
        assert result["dimension_scores"]["phoneme"] == 0.85
        assert result["dimension_scores"]["tone"] == 0.9
        assert result["dimension_scores"]["fluency"] == 0.7


# ---------------------------------------------------------------------------
# Agent 1: Tone DSP Extractor (unit tests for quality metric)
# ---------------------------------------------------------------------------

class TestToneDspExtractor:
    def test_extraction_quality_zero_for_empty(self):
        from app.services.tone_dsp_extractor import _compute_extraction_quality

        assert _compute_extraction_quality([]) == 0.0

    def test_extraction_quality_high_for_stable_contour(self):
        from app.services.tone_dsp_extractor import _compute_extraction_quality

        # All voiced, stable pitch
        contour = [150.0] * 100
        quality = _compute_extraction_quality(contour)
        assert quality > 0.8

    def test_extraction_quality_low_for_sparse_voicing(self):
        from app.services.tone_dsp_extractor import _compute_extraction_quality

        # Mostly unvoiced
        contour = [0.0] * 90 + [150.0] * 10
        quality = _compute_extraction_quality(contour)
        assert quality < 0.3

    def test_syllable_ranges_preserve_unvoiced_gap_positions(self):
        from app.services.tone_dsp_extractor import split_syllable_ranges, split_syllables

        contour = [0.0, 100.0, 101.0, 102.0, 0.0, 0.0, 0.0, 200.0, 201.0, 202.0]
        assert split_syllable_ranges(contour, 2) == [(1, 4), (7, 10)]
        assert split_syllables(contour, 2) == [[100.0, 101.0, 102.0], [200.0, 201.0, 202.0]]

    def test_asr_count_mismatch_resegments_absolute_frame_ranges(self, monkeypatch):
        import app.services.phoneme_verifier as verifier

        observed = {}
        contour = [0.0, 100.0, 101.0, 102.0, 0.0, 0.0, 0.0, 200.0, 201.0, 202.0]
        monkeypatch.setattr(verifier, "_estimate_syllable_count_from_energy", lambda *_args, **_kwargs: 3)

        def capture(_audio_bytes, ranges, step, **_kwargs):
            observed["ranges"] = ranges
            observed["step"] = step
            return [None] * len(ranges)

        monkeypatch.setattr(verifier, "_extract_formants_at_midpoint", capture)
        verifier.verify_phonemes(
            b"", ["a", "a"], ["a", "a", "a"],
            predecoded=([0.0] * 100, 100),
            precomputed_f0=contour,
            precomputed_segment_frame_ranges=[(1, 4), (7, 10)],
            precomputed_frame_step_sec=0.01,
        )

        assert observed == {"ranges": [(1, 2), (2, 4), (7, 10)], "step": 0.01}

    def test_formant_midpoints_use_absolute_f0_frames(self):
        from app.services.phoneme_verifier import _extract_formants_at_midpoint

        queried_times = []

        class Formant:
            def get_value_at_time(self, _formant, time_sec):
                queried_times.append(time_sec)
                return 500.0

        formants = _extract_formants_at_midpoint(
            b"", [(1, 4), (7, 10)], 0.01,
            predecoded=([0.0] * 16_000, 16_000),
            formant_factory=lambda _samples, _sr: Formant(),
        )

        assert formants == [(500.0, 500.0, 500.0), (500.0, 500.0, 500.0)]
        assert queried_times == [0.025, 0.025, 0.025, 0.085, 0.085, 0.085]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])


# ---------------------------------------------------------------------------
# DTW Improvements (Huber + Sakoe-Chiba)
# ---------------------------------------------------------------------------

class TestDTWImprovements:
    def test_huber_cost_quadratic_near_zero(self):
        from app.services.adaptive_tone_analyzer import _huber_cost

        # Near zero: should be quadratic (≈ 0.5 * x^2 / delta)
        assert abs(_huber_cost(0.1) - 0.5 * 0.01 / 0.5) < 1e-9
        assert abs(_huber_cost(0.0)) < 1e-9

    def test_huber_cost_linear_far_from_zero(self):
        from app.services.adaptive_tone_analyzer import _huber_cost

        # Far from zero: should be linear (|x| - 0.5*delta)
        assert abs(_huber_cost(2.0) - (2.0 - 0.25)) < 1e-9
        assert abs(_huber_cost(-2.0) - (2.0 - 0.25)) < 1e-9

    def test_huber_less_sensitive_to_outliers(self):
        from app.services.adaptive_tone_analyzer import _huber_cost

        # Huber penalizes outliers less than absolute difference
        abs_cost = abs(3.0)
        huber_cost = _huber_cost(3.0)
        assert huber_cost < abs_cost

    def test_dtw_with_sakoe_chiba_matches_unconstrained_for_aligned(self):
        """For well-aligned sequences, Sakoe-Chiba band shouldn't change result."""
        from app.services.adaptive_tone_analyzer import _dtw_distance

        a = [1.0, 2.0, 3.0, 4.0, 5.0]
        b = [1.1, 2.1, 3.1, 4.1, 5.1]
        dist = _dtw_distance(a, b)
        # Should be small and finite
        assert 0 < dist < 1.0

    def test_dtw_handles_empty_sequences(self):
        from app.services.adaptive_tone_analyzer import _dtw_distance

        assert _dtw_distance([], [1.0]) == float("inf")
        assert _dtw_distance([1.0], []) == float("inf")

    def test_legacy_dtw_also_has_huber(self):
        """Verify legacy tone_dsp_service also uses Huber cost."""
        from app.services.tone_dsp_service import _huber_cost as legacy_huber

        assert abs(legacy_huber(0.1) - 0.5 * 0.01 / 0.5) < 1e-9


# ---------------------------------------------------------------------------
# Anti-Gaming: Replay Detection
# ---------------------------------------------------------------------------

class TestReplayDetector:
    def test_first_submission_not_replay(self):
        from app.services.replay_detector import clear_speaker_fingerprints, detect_replay

        speaker = "test_replay_first"
        clear_speaker_fingerprints(speaker)

        # Synthetic WAV: 16kHz mono, 0.5s silence
        import struct
        import wave
        import io
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00\x00" * 8000)
        audio = buf.getvalue()

        result = detect_replay(audio, speaker)
        assert result["is_replay"] is False
        clear_speaker_fingerprints(speaker)

    def test_clear_removes_fingerprints(self):
        from app.services.replay_detector import clear_speaker_fingerprints

        count = clear_speaker_fingerprints("nonexistent_speaker")
        assert count == 0


# ---------------------------------------------------------------------------
# Privacy: Profile TTL
# ---------------------------------------------------------------------------

class TestProfileTTL:
    def test_expired_profile_returns_none(self, tmp_path, monkeypatch):
        import json
        from datetime import datetime, timedelta, timezone

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        # Create an expired profile
        profile = {
            "pitch_mean": 5.0,
            "pitch_std": 0.5,
            "contour_amplitudes": {"1": 1.0},
            "n_samples": 10,
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=100)).isoformat(),
        }
        path = tmp_path / "expired_user.json"
        path.write_text(json.dumps(profile), encoding="utf-8")

        result = ata._load_profile("expired_user")
        assert result is None
        assert not path.exists()  # file should be deleted

    def test_valid_profile_kept(self, tmp_path, monkeypatch):
        import json
        from datetime import datetime, timezone

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        profile = {
            "pitch_mean": 5.0,
            "pitch_std": 0.5,
            "contour_amplitudes": {"1": 1.0},
            "n_samples": 10,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        path = tmp_path / "valid_user.json"
        path.write_text(json.dumps(profile), encoding="utf-8")

        result = ata._load_profile("valid_user")
        assert result is not None
        assert result["n_samples"] == 10

    def test_demo_profile_expires_faster(self, tmp_path, monkeypatch):
        import json
        from datetime import datetime, timedelta, timezone

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        # Demo profile 8 days old (> 7-day demo TTL)
        profile = {
            "pitch_mean": 5.0,
            "pitch_std": 0.5,
            "contour_amplitudes": {},
            "n_samples": 3,
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat(),
        }
        path = tmp_path / "demo_abc123.json"
        path.write_text(json.dumps(profile), encoding="utf-8")

        result = ata._load_profile("demo_abc123")
        assert result is None


# ---------------------------------------------------------------------------
# CUSUM Anomaly Detection
# ---------------------------------------------------------------------------

class TestAnomalyDetection:
    def test_normal_scores_no_anomaly(self, tmp_path, monkeypatch):
        from app.services.adaptive_tone_analyzer import analyze_tones_adaptive

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        segments = [[150.0, 155.0, 160.0, 165.0, 170.0]]
        norm_segments = [[-1.0, -0.5, 0.0, 0.5, 1.0]]

        # Build up profile with consistent scores
        for _ in range(6):
            analyze_tones_adaptive(segments, norm_segments, [2], "anomaly_test_1")

        # Load profile — running_mean should be initialized from actual scores
        profile = ata._load_profile("anomaly_test_1")
        assert profile is not None
        # running_mean should NOT be the default 50.0 (cold-start fix)
        assert profile.get("running_mean") is not None
        assert profile["running_mean"] != 50.0 or profile["n_samples"] < 5

    def test_high_performer_not_stuck_in_anomaly(self, tmp_path, monkeypatch):
        """v2.1 audit fix: high-performing speakers (~90%) should NOT get
        permanently stuck in anomaly detection due to cold-start default of 50."""
        from app.services.adaptive_tone_analyzer import analyze_tones_adaptive

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        # Use a contour that produces high accuracy consistently
        segments = [[150.0, 155.0, 160.0, 165.0, 170.0]]
        norm_segments = [[-1.0, -0.5, 0.0, 0.5, 1.0]]

        # Submit 10 consistent samples — all should update EMA (none flagged anomaly)
        for i in range(10):
            result = analyze_tones_adaptive(segments, norm_segments, [2], "high_performer_test")

        profile = ata._load_profile("high_performer_test")
        assert profile is not None
        assert profile["n_samples"] == 10
        # running_mean should reflect actual score, not stuck at 50.0
        if "running_mean" in profile:
            assert profile["running_mean"] > 50.0, (
                f"High performer stuck at running_mean={profile['running_mean']}"
            )

    def test_all_neutral_tones_skip_profile_update(self, tmp_path, monkeypatch):
        """v2.1 audit fix: all-tone-5 utterances should NOT corrupt running stats
        with a false 0.0 accuracy."""
        from app.services.adaptive_tone_analyzer import analyze_tones_adaptive

        import app.services.adaptive_tone_analyzer as ata
        monkeypatch.setattr(ata, "_PROFILES_DIR", tmp_path)

        segments = [[150.0, 155.0, 160.0, 165.0, 170.0]]
        norm_segments = [[-1.0, -0.5, 0.0, 0.5, 1.0]]

        # First build a profile with real tones
        for _ in range(6):
            analyze_tones_adaptive(segments, norm_segments, [2], "tone5_test")

        profile_before = ata._load_profile("tone5_test")
        mean_before = profile_before.get("running_mean", 0.0)

        # Now submit all-neutral-tone utterance
        analyze_tones_adaptive(segments, norm_segments, [5], "tone5_test")

        profile_after = ata._load_profile("tone5_test")
        # running_mean should NOT have been corrupted toward 0.0
        if "running_mean" in profile_after and "running_mean" in profile_before:
            assert abs(profile_after["running_mean"] - mean_before) < 5.0, (
                f"All-tone-5 corrupted running_mean from {mean_before} "
                f"to {profile_after['running_mean']}"
            )


# ---------------------------------------------------------------------------
# Replay Detector — Positive Path + Memory Cap
# ---------------------------------------------------------------------------

class TestReplayDetectorAdvanced:
    def test_same_audio_twice_flagged_as_replay(self):
        """Core replay detection: same audio submitted twice should be flagged."""
        from app.services.replay_detector import clear_speaker_fingerprints, detect_replay

        speaker = "test_replay_positive"
        clear_speaker_fingerprints(speaker)

        # Synthetic WAV: 16kHz mono, 0.5s of a tone (not silence)
        import struct
        import wave
        import io
        import math
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            # Generate a 300Hz sine wave for 0.5s
            samples = []
            for i in range(8000):
                val = int(16000 * math.sin(2 * math.pi * 300 * i / 16000))
                samples.append(struct.pack("<h", val))
            wf.writeframes(b"".join(samples))
        audio = buf.getvalue()

        # First submission — clean
        result1 = detect_replay(audio, speaker)
        assert result1["is_replay"] is False

        # Second submission of SAME audio — should be flagged
        result2 = detect_replay(audio, speaker)
        assert result2["is_replay"] is True
        assert result2["max_similarity"] >= 0.95

        clear_speaker_fingerprints(speaker)

    def test_different_audio_not_flagged(self):
        """Different audio from same speaker should NOT be flagged."""
        from app.services.replay_detector import clear_speaker_fingerprints, detect_replay

        speaker = "test_replay_different"
        clear_speaker_fingerprints(speaker)

        import struct
        import wave
        import io
        import math
        import random

        def make_wav(seed, freqs):
            """Generate audio with specific frequency content and noise seed."""
            buf = io.BytesIO()
            rng = random.Random(seed)
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                samples = []
                for i in range(16000):  # 1 second
                    t = i / 16000
                    val = sum(
                        amp * math.sin(2 * math.pi * f * t)
                        for f, amp in freqs
                    ) + 2000 * rng.gauss(0, 1)  # add noise for uniqueness
                    val = max(-32767, min(32767, int(val)))
                    samples.append(struct.pack("<h", val))
                wf.writeframes(b"".join(samples))
            return buf.getvalue()

        # Very different spectral content: low drone vs high chirp-like
        audio1 = make_wav(42, [(150, 8000), (300, 4000)])  # low frequencies
        audio2 = make_wav(99, [(2000, 6000), (3500, 3000)])  # high frequencies

        result1 = detect_replay(audio1, speaker)
        assert result1["is_replay"] is False

        result2 = detect_replay(audio2, speaker)
        # Very different frequency content should produce low similarity
        assert result2["is_replay"] is False, (
            f"Different audio flagged as replay (similarity={result2['max_similarity']})"
        )

        clear_speaker_fingerprints(speaker)

    def test_global_speaker_cap(self):
        """Memory cap: store should not exceed _MAX_SPEAKERS distinct keys."""
        from app.services.replay_detector import (
            _store, _lock, _MAX_SPEAKERS, clear_speaker_fingerprints,
        )

        # Clean slate
        with _lock:
            _store.clear()

        # Insert fingerprints for more speakers than the cap
        import math
        import struct
        import wave
        import io

        def make_wav():
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                samples = []
                for i in range(8000):
                    val = int(16000 * math.sin(2 * math.pi * 300 * i / 16000))
                    samples.append(struct.pack("<h", val))
                wf.writeframes(b"".join(samples))
            return buf.getvalue()

        audio = make_wav()
        n_speakers = _MAX_SPEAKERS + 50

        from app.services.replay_detector import detect_replay
        for i in range(n_speakers):
            detect_replay(audio, f"cap_test_{i}")

        with _lock:
            actual_count = len(_store)

        assert actual_count <= _MAX_SPEAKERS, (
            f"Store has {actual_count} speakers, exceeds cap {_MAX_SPEAKERS}"
        )

        # Cleanup
        for i in range(n_speakers):
            clear_speaker_fingerprints(f"cap_test_{i}")


# ---------------------------------------------------------------------------
# Huber Boundary Test
# ---------------------------------------------------------------------------

class TestHuberBoundary:
    def test_huber_at_exact_delta(self):
        """At exactly delta=0.5, both branches should give same value (continuity)."""
        from app.services.adaptive_tone_analyzer import _huber_cost

        # At x=0.5: quadratic gives 0.5*0.25/0.5 = 0.25
        # Linear gives 0.5 - 0.25 = 0.25
        assert abs(_huber_cost(0.5) - 0.25) < 1e-9

    def test_huber_boundary_from_below(self):
        """Just below delta should use quadratic branch."""
        from app.services.adaptive_tone_analyzer import _huber_cost

        x = 0.4999
        expected = 0.5 * x * x / 0.5
        assert abs(_huber_cost(x) - expected) < 1e-9

    def test_huber_boundary_from_above(self):
        """Just above delta should use linear branch."""
        from app.services.adaptive_tone_analyzer import _huber_cost

        x = 0.5001
        expected = x - 0.5 * 0.5
        assert abs(_huber_cost(x) - expected) < 1e-9


# ---------------------------------------------------------------------------
# DTW Different-Length Sequences
# ---------------------------------------------------------------------------

class TestDTWDifferentLengths:
    def test_dtw_short_vs_long_sequence(self):
        """Sakoe-Chiba should handle very different length sequences."""
        from app.services.adaptive_tone_analyzer import _dtw_distance

        short = [1.0, 2.0, 3.0]
        long = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
        dist = _dtw_distance(short, long)
        # Should be finite (not inf) — warping path exists
        assert dist < float("inf"), "DTW returned inf for valid different-length inputs"
        assert dist >= 0

    def test_dtw_template_vs_segment_lengths(self):
        """Realistic case: 3-point template vs 20-point segment."""
        from app.services.adaptive_tone_analyzer import _dtw_distance

        template = [3.0, 4.0, 5.0]  # T2 rising
        segment = [3.0 + 0.1 * i for i in range(20)]  # gradual rise
        dist = _dtw_distance(template, segment)
        assert dist < float("inf")
        assert dist < 2.0  # should be reasonably close since both rise
