"""
Normalize pinyin format in the database: ensure spaces between all syllables.

Also generates pinyin for words that are missing it, using pypinyin.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Word

try:
    from pypinyin import lazy_pinyin, Style
    HAS_PYPINYIN = True
except ImportError:
    HAS_PYPINYIN = False


def normalize_spacing(pinyin: str, hanzi: str) -> str:
    """Insert spaces between syllables based on hanzi character count.

    If pinyin already has spaces, verify and fix partial spacing.
    If no spaces, use pypinyin to regenerate.
    """
    if not pinyin or not pinyin.strip():
        if HAS_PYPINYIN:
            return " ".join(lazy_pinyin(hanzi, style=Style.TONE, neutral_tone_with_five=True))
        return ""

    clean = pinyin.strip()
    parts = clean.split()
    hanzi_len = len(hanzi)

    # Already correctly spaced
    if len(parts) == hanzi_len:
        return clean

    # Partially spaced — some tokens have multiple syllables
    if HAS_PYPINYIN:
        # Regenerate from hanzi for consistency
        return " ".join(lazy_pinyin(hanzi, style=Style.TONE, neutral_tone_with_five=True))

    return clean


def main():
    print("=" * 50)
    print("Normalizing pinyin format...")
    print("=" * 50)

    if not HAS_PYPINYIN:
        print("⚠ pypinyin not installed — can't fully normalize")
        print("  Install: pip install pypinyin")
        sys.exit(1)

    with SessionLocal() as db:
        words = db.scalars(select(Word)).all()
        fixed_count = 0
        missing_filled = 0

        for w in words:
            original = (w.pinyin or "").strip()
            hanzi = w.hanzi
            hanzi_len = len(hanzi)

            if not original:
                # Generate missing pinyin
                w.pinyin = " ".join(
                    lazy_pinyin(hanzi, style=Style.TONE, neutral_tone_with_five=True)
                )
                missing_filled += 1
                fixed_count += 1
                continue

            parts = original.split()

            # Single hanzi — no spacing needed, just verify
            if hanzi_len == 1:
                continue

            # Multi-hanzi — ensure space-separated
            if len(parts) != hanzi_len:
                w.pinyin = normalize_spacing(original, hanzi)
                fixed_count += 1
                print(f"  Fixed: {hanzi} | {original} → {w.pinyin}")

        if fixed_count:
            db.commit()

        print(f"\nDone. Fixed {fixed_count} words ({missing_filled} missing pinyin filled).")


if __name__ == "__main__":
    main()
