"""
Pinyin Scorer — evaluates user-submitted pinyin against a target.

Returns detailed scoring breakdown including:
  - Overall score (0-100)
  - Tone errors (position, expected/got)
  - Syllable errors (missing, extra, wrong)
  - Base accuracy (ignoring tones)
"""
from __future__ import annotations

import re
from typing import TypedDict


class ToneError(TypedDict):
    pos: int
    expected_tone: int
    got_tone: int
    syllable: str


class SyllableError(TypedDict):
    pos: int
    type: str  # 'missing', 'extra', 'wrong_syllable'
    expected: str | None
    got: str | None


class PinyinScore(TypedDict):
    score: int
    base_score: int  # score ignoring tones
    tone_errors: list[ToneError]
    syllable_errors: list[SyllableError]
    target: str
    actual: str


_TONE_MAP: dict[str, int] = {}
for _tones, _num in [
    ("āēīōūǖĀĒĪŌŪǕ", 1),
    ("áéíóúǘÁÉÍÓÚǗ", 2),
    ("ǎěǐǒǔǚǍĚǏǑǓǙ", 3),
    ("àèìòùǜÀÈÌÒÙǛ", 4),
]:
    for _ch in _tones:
        _TONE_MAP[_ch] = _num

_TONE_BASE: dict[str, str] = {}
for _marks, _base_char in [
    ("āáǎà", "a"), ("ĀÁǍÀ", "A"),
    ("ēéěè", "e"), ("ĒÉĚÈ", "E"),
    ("īíǐì", "i"), ("ĪÍǏÌ", "I"),
    ("ōóǒò", "o"), ("ŌÓǑÒ", "O"),
    ("ūúǔù", "u"), ("ŪÚǓÙ", "U"),
    ("ǖǘǚǜ", "ü"), ("ǕǗǙǛ", "Ü"),
]:
    for _ch in _marks:
        _TONE_BASE[_ch] = _base_char


def _extract_tone(syl: str) -> int:
    for ch in syl:
        if ch in _TONE_MAP:
            return _TONE_MAP[ch]
    m = re.search(r"[1-5]$", syl)
    if m:
        return int(m.group())
    return 5


def _strip_tone(syl: str) -> str:
    """Remove tone marks and numbers, return base syllable."""
    result = []
    for ch in syl:
        result.append(_TONE_BASE.get(ch, ch))
    base = "".join(result)
    base = re.sub(r"[1-5]$", "", base)
    return base


def score_pinyin(target: str, actual: str) -> PinyinScore:
    """Score user-submitted pinyin against target.

    Args:
        target: Correct pinyin (space-separated syllables with tone marks)
        actual: User-submitted pinyin

    Returns:
        PinyinScore with detailed breakdown
    """
    target_syls = [s for s in target.strip().split() if s]
    actual_syls = [s for s in actual.strip().split() if s]

    if not actual_syls:
        return PinyinScore(
            score=0,
            base_score=0,
            tone_errors=[],
            syllable_errors=[SyllableError(pos=0, type="missing", expected=target, got="")],
            target=target,
            actual=actual,
        )

    max_len = max(len(target_syls), len(actual_syls))
    tone_errors: list[ToneError] = []
    syllable_errors: list[SyllableError] = []

    for i in range(max_len):
        t_syl = target_syls[i] if i < len(target_syls) else None
        a_syl = actual_syls[i] if i < len(actual_syls) else None

        if t_syl is None:
            syllable_errors.append(SyllableError(
                pos=i, type="extra", expected=None, got=a_syl,
            ))
            continue
        if a_syl is None:
            syllable_errors.append(SyllableError(
                pos=i, type="missing", expected=t_syl, got=None,
            ))
            continue

        t_base = _strip_tone(t_syl)
        a_base = _strip_tone(a_syl)
        t_tone = _extract_tone(t_syl)
        a_tone = _extract_tone(a_syl)

        if t_base.lower() != a_base.lower():
            syllable_errors.append(SyllableError(
                pos=i, type="wrong_syllable", expected=t_syl, got=a_syl,
            ))
        elif t_tone != a_tone and t_tone != 5 and a_tone != 5:
            # Only flag tone error if both have explicit tones
            tone_errors.append(ToneError(
                pos=i, expected_tone=t_tone, got_tone=a_tone, syllable=t_syl,
            ))

    # Scoring
    total_base = max_len
    total_tone = max_len
    base_correct = total_base - len(syllable_errors)
    tone_correct = total_tone - len(tone_errors) - len(syllable_errors)

    base_score = max(0, round((base_correct / total_base) * 100))
    score = max(0, round(((base_correct * 0.6 + tone_correct * 0.4) / total_base) * 100))

    return PinyinScore(
        score=score,
        base_score=base_score,
        tone_errors=tone_errors,
        syllable_errors=syllable_errors,
        target=target,
        actual=actual,
    )
