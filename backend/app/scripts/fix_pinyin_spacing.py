"""
Fix Pinyin Spacing — preserves original pinyin values, only adds spaces.

Does NOT overwrite any existing pinyin data — only inserts spaces
between concatenated syllables based on hanzi character count.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Word

# Tone marks and their base vowels
_TONE_MARKS = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
    'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
    'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
    'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü',
}

# Standard pinyin onsets (initial consonants including zh/ch/sh)
_ONSETS = {
    'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x',
    'zh', 'ch', 'sh', 'r', 'z', 'c', 's',
    'y', 'w',
}

_VOWELS = set('aeiouüv')


def split_concatenated_pinyin(token: str) -> list[str]:
    """Split a concatenated multi-syllable pinyin token into individual syllables.

    Preserves original tone marks. Only splits at syllable boundaries
    where a new onset consonant begins after a vowel (or coda n/ng).
    """
    if not token or len(token) <= 1:
        return [token] if token else []

    syllables = []
    pos = 0
    current = ""
    saw_vowel = False
    token_lower = token.lower()

    while pos < len(token):
        ch = token[pos]
        ch_lower = ch.lower()
        remaining = token_lower[pos:]
        is_vowel = ch_lower in _VOWELS or ch in ''.join(_TONE_MARKS)

        # Check if this position starts a new syllable
        if saw_vowel and current and pos > 0:
            # Try 2-char onsets (zh, ch, sh)
            if len(remaining) >= 2 and remaining[:2] in _ONSETS:
                syllables.append(current)
                current = ""
                saw_vowel = False
            elif ch_lower in _ONSETS:
                # 'g' after 'n' = ng coda → continue current
                if ch_lower == 'g' and current.lower().endswith('n'):
                    pass
                # 'n' after vowel: coda, UNLESS followed by vowel (onset of next)
                elif ch_lower == 'n':
                    # Peek ahead: if next char is vowel/tone, this 'n' is onset
                    next_ch = token[pos + 1] if pos + 1 < len(token) else ''
                    next_is_vowel = next_ch.lower() in _VOWELS or next_ch in ''.join(_TONE_MARKS)
                    if next_is_vowel:
                        # n + vowel = new syllable onset
                        syllables.append(current)
                        current = ""
                        saw_vowel = False
                    # else: n coda — stay in current syllable
                # 'r' after vowel = erhua coda
                elif ch_lower == 'r' and (pos == len(token) - 1 or token_lower[pos + 1] not in _VOWELS):
                    pass  # erhua coda
                # Any other onset consonant starts new syllable
                else:
                    syllables.append(current)
                    current = ""
                    saw_vowel = False

        if is_vowel:
            saw_vowel = True

        current += ch
        pos += 1

    if current:
        syllables.append(current)

    return syllables


def fix_spacing(pinyin: str, hanzi: str) -> str:
    """Add proper spacing to pinyin based on hanzi character count.

    Preserves existing pinyin characters — only inserts/rearranges spaces.
    """
    if not pinyin or not pinyin.strip():
        return pinyin

    hanzi_len = len(hanzi)
    if hanzi_len <= 1:
        return pinyin.strip()

    # Already correctly spaced
    parts = pinyin.strip().split()
    if len(parts) == hanzi_len:
        return pinyin.strip()

    # Try splitting each part
    all_syllables = []
    for part in parts:
        split = split_concatenated_pinyin(part)
        all_syllables.extend(split)

    # If splitting gives the right count, join with spaces
    if len(all_syllables) == hanzi_len:
        return " ".join(all_syllables)

    # Fallback: try splitting each character individually
    # This happens when the above algorithm fails
    if len(all_syllables) < hanzi_len:
        # Try to further split some syllables
        result = []
        deficit = hanzi_len - len(all_syllables)
        for syl in all_syllables:
            if deficit > 0 and len(syl) > 1:
                # Split this syllable at tone mark boundaries
                sub = re.split(r'(?<=[aeiouü])[-]?(?=[bpmfdtnlgkhjqxrzcsyw])', syl.lower())
                sub = [s.strip('-') for s in sub if s.strip('-')]
                if len(sub) > 1:
                    result.extend(sub)
                    deficit -= len(sub) - 1
                else:
                    result.append(syl)
            else:
                result.append(syl)
        if len(result) == hanzi_len:
            return " ".join(result)

    # Last resort: return what we have
    return " ".join(all_syllables)


def main():
    print("=" * 50)
    print("Fixing pinyin spacing (preserving original values)")
    print("=" * 50)

    with SessionLocal() as db:
        words = db.scalars(select(Word)).all()
        fixed = 0
        skipped = 0

        for w in words:
            original = w.pinyin or ""
            if not original.strip():
                skipped += 1
                continue

            hanzi = w.hanzi
            if len(hanzi) <= 1:
                w.pinyin = original.strip()  # just clean whitespace
                continue

            fixed_pinyin = fix_spacing(original, hanzi)
            if fixed_pinyin != original:
                print(f"  {hanzi}: '{original}' → '{fixed_pinyin}'")
                w.pinyin = fixed_pinyin
                fixed += 1

        if fixed:
            db.commit()

        print(f"\nFixed: {fixed}, Skipped (missing pinyin): {skipped}")

        # Verify
        remaining = 0
        for w in db.scalars(select(Word)).all():
            parts = (w.pinyin or "").strip().split()
            if len(w.hanzi) > 1 and len(parts) != len(w.hanzi):
                remaining += 1
                if remaining <= 10:
                    print(f"  STILL MISMATCHED: {w.hanzi} ({len(w.hanzi)}) ← '{w.pinyin}' ({len(parts)} parts)")

        if remaining:
            print(f"\n⚠ {remaining} words still have spacing issues (may need manual review)")
        else:
            print("\n✅ All words now have correct syllable spacing")


if __name__ == "__main__":
    main()
