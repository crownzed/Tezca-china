"""Cleanup expired speaker profiles.

Usage:
    python -m app.scripts.cleanup_speaker_profiles [--dry-run] [--max-age-days N]

Deletes speaker profile JSON files that haven't been updated within the TTL.
Demo profiles (prefix "demo_") expire after 7 days by default; regular profiles
after 90 days. Pass --max-age-days to override both thresholds.

This script is safe to run while the backend is serving — it only deletes files
that _load_profile() would already treat as expired.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from ..services.adaptive_tone_analyzer import (
    _DEMO_PROFILE_TTL_DAYS,
    _PROFILE_TTL_DAYS,
    _PROFILES_DIR,
)
from ..services.speaker_profile_lock import profile_lock


def cleanup(
    dry_run: bool = False,
    max_age_days: int | None = None,
) -> dict:
    """Delete expired speaker profiles. Returns summary stats."""
    if not _PROFILES_DIR.exists():
        print(f"Profiles directory does not exist: {_PROFILES_DIR}")
        return {"deleted": 0, "kept": 0, "errors": 0}

    now = datetime.now(timezone.utc)
    deleted = 0
    kept = 0
    errors = 0

    for path in sorted(_PROFILES_DIR.glob("*.json")):
        # The cleanup decision and unlink must share the writer's lock. Reading
        # before entering this block would let a fresh os.replace happen between
        # the TTL decision and deletion.
        try:
            with profile_lock(path):
                if not path.exists():
                    continue
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        profile = json.load(f)
                except (json.JSONDecodeError, OSError) as e:
                    print(f"  ERROR reading {path.name}: {e}")
                    errors += 1
                    continue

                updated_str = profile.get("updated_at", "")
                if not updated_str:
                    if dry_run:
                        print(f"  [DRY-RUN] Would delete {path.name} (no updated_at)")
                    else:
                        path.unlink(missing_ok=True)
                        print(f"  Deleted {path.name} (no updated_at)")
                    deleted += 1
                    continue

                try:
                    updated = datetime.fromisoformat(updated_str)
                except ValueError:
                    print(f"  ERROR invalid date in {path.name}: {updated_str}")
                    errors += 1
                    continue

                age_days = (now - updated).days
                is_demo = path.stem.startswith("demo_")
                ttl = (
                    max_age_days
                    if max_age_days is not None
                    else (_DEMO_PROFILE_TTL_DAYS if is_demo else _PROFILE_TTL_DAYS)
                )

                if age_days > ttl:
                    label = "demo" if is_demo else "regular"
                    if dry_run:
                        print(f"  [DRY-RUN] Would delete {path.name} ({label}, {age_days}d old, TTL={ttl}d)")
                    else:
                        path.unlink(missing_ok=True)
                        print(f"  Deleted {path.name} ({label}, {age_days}d old, TTL={ttl}d)")
                    deleted += 1
                else:
                    kept += 1
        except OSError as e:
            print(f"  ERROR locking {path.name}: {e}")
            errors += 1

    return {"deleted": deleted, "kept": kept, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup expired speaker profiles")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    parser.add_argument("--max-age-days", type=int, default=None, help="Override TTL for all profiles")
    args = parser.parse_args()

    print(f"Speaker profiles directory: {_PROFILES_DIR}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    result = cleanup(dry_run=args.dry_run, max_age_days=args.max_age_days)

    print()
    print(f"Summary: {result['deleted']} deleted, {result['kept']} kept, {result['errors']} errors")


if __name__ == "__main__":
    main()
