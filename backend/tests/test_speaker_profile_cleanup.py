"""Regression tests for speaker profile cleanup/write coordination."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone


def _profile(updated_at: str, n_samples: int) -> dict:
    return {
        "pitch_mean": 5.0,
        "pitch_std": 0.5,
        "contour_amplitudes": {"1": 1.0},
        "n_samples": n_samples,
        "updated_at": updated_at,
    }


def test_cleanup_rechecks_current_profile_while_holding_writer_lock(tmp_path, monkeypatch):
    import app.scripts.cleanup_speaker_profiles as cleanup_module
    import app.services.adaptive_tone_analyzer as analyzer

    old = _profile((datetime.now(timezone.utc) - timedelta(days=100)).isoformat(), 3)
    fresh = _profile(datetime.now(timezone.utc).isoformat(), 4)
    path = tmp_path / "learner.json"
    path.write_text(json.dumps(old), encoding="utf-8")

    monkeypatch.setattr(analyzer, "_PROFILES_DIR", tmp_path)
    monkeypatch.setattr(cleanup_module, "_PROFILES_DIR", tmp_path)

    # Simulate the historical race exactly: cleanup enumerated a stale file,
    # then a live scorer completed an atomic replacement before cleanup acquired
    # the shared lock. Cleanup must reread fresh JSON under the lock and keep it.
    analyzer._save_profile("learner", fresh)
    result = cleanup_module.cleanup()

    assert result == {"deleted": 0, "kept": 1, "errors": 0}
    assert json.loads(path.read_text(encoding="utf-8"))["n_samples"] == 4

def test_cleanup_does_not_delete_writer_replacement_after_lock_handoff(tmp_path, monkeypatch):
    import app.scripts.cleanup_speaker_profiles as cleanup_module
    import app.services.adaptive_tone_analyzer as analyzer

    path = tmp_path / "handoff.json"
    path.write_text(
        json.dumps(_profile((datetime.now(timezone.utc) - timedelta(days=100)).isoformat(), 3)),
        encoding="utf-8",
    )
    monkeypatch.setattr(analyzer, "_PROFILES_DIR", tmp_path)
    monkeypatch.setattr(cleanup_module, "_PROFILES_DIR", tmp_path)

    entered = threading.Event()
    release = threading.Event()
    original_lock = cleanup_module.profile_lock

    def cleanup_lock(candidate):
        manager = original_lock(candidate)

        class PausedLock:
            def __enter__(self):
                entered.set()
                release.wait(timeout=2)
                return manager.__enter__()

            def __exit__(self, *args):
                return manager.__exit__(*args)

        return PausedLock()

    monkeypatch.setattr(cleanup_module, "profile_lock", cleanup_lock)
    worker = threading.Thread(target=cleanup_module.cleanup)
    worker.start()
    assert entered.wait(timeout=2)

    analyzer._save_profile("handoff", _profile(datetime.now(timezone.utc).isoformat(), 9))
    release.set()
    worker.join(timeout=2)

    assert not worker.is_alive()
    assert json.loads(path.read_text(encoding="utf-8"))["n_samples"] == 9


def test_cleanup_deletes_expired_profile_under_the_same_lock(tmp_path, monkeypatch):
    import app.scripts.cleanup_speaker_profiles as cleanup_module
    import app.services.adaptive_tone_analyzer as analyzer

    path = tmp_path / "expired.json"
    path.write_text(
        json.dumps(_profile((datetime.now(timezone.utc) - timedelta(days=100)).isoformat(), 3)),
        encoding="utf-8",
    )
    monkeypatch.setattr(analyzer, "_PROFILES_DIR", tmp_path)
    monkeypatch.setattr(cleanup_module, "_PROFILES_DIR", tmp_path)

    assert cleanup_module.cleanup() == {"deleted": 1, "kept": 0, "errors": 0}
    assert not path.exists()
