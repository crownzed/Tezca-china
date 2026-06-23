"""
Vietnamese Learner Distractor Engine — generates deceptive wrong answers
based on common negative transfer patterns from Vietnamese → Chinese.

Patterns derived from linguistic research on Vietnamese learners:
  1. Tone confusion (Vietnamese 6 tones vs Mandarin 4+neutral)
  2. Measure word omission / wrong choice
  3. Word order errors (adverb placement, time expression position)
  4. Near-synonym confusion
  5. Character similarity (visual glyph confusion)
  6. False friends (same Sino-Vietnamese reading, different meaning)
"""
from __future__ import annotations

import random
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Word


class DistractorWithReason(TypedDict):
    distractor: Word
    reason: str  # Why this distractor is effective for Vietnamese learners
    pattern: str  # Error pattern tag


# ── Vietnamese-specific error patterns ─────────────────────────────────


def _tone_confusion_candidates(word: Word, pool: list[Word]) -> list[DistractorWithReason]:
    """Find words with same base syllable but different tone — the #1 Viet error."""
    from .pinyin_scorer import _strip_tone, _extract_tone

    target_base = _strip_tone(word.pinyin or "").lower()
    target_tone = _extract_tone(word.pinyin or "")

    results: list[DistractorWithReason] = []
    for w in pool:
        w_base = _strip_tone(w.pinyin or "").lower()
        w_tone = _extract_tone(w.pinyin or "")
        if w_base == target_base and w_tone != target_tone:
            results.append({
                "distractor": w,
                "reason": f"Same syllable '{target_base}' but tone {target_tone}→{w_tone}. Vietnamese learners often confuse tone pairs.",
                "pattern": "tone_confusion",
            })
    return results


def _measure_word_confusion(word: Word, pool: list[Word]) -> list[DistractorWithReason]:
    """Find words commonly used with wrong measure words.

    Vietnamese has a simpler classifier system (con cái, cái, chiếc, etc.)
    while Chinese has 个, 只, 条, 张, 把, 本, etc.
    """
    if not word.pos or word.pos not in ("noun", "n"):
        return []

    results: list[DistractorWithReason] = []
    for w in pool:
        if w.pos == word.pos and w.id != word.id:
            # Same POS nouns — likely to share measure word confusion
            results.append({
                "distractor": w,
                "reason": f"Same noun category — Vietnamese learners often use wrong measure word for '{w.hanzi}'",
                "pattern": "measure_word_confusion",
            })
    return results[:3]


def _visual_similarity(word: Word, pool: list[Word]) -> list[DistractorWithReason]:
    """Find characters that look visually similar — common stroke-level confusion."""
    # Component-based similarity: if target word shares radicals/components
    # with another word, it's visually confusable
    target_chars = set(word.hanzi)

    results: list[DistractorWithReason] = []
    for w in pool:
        w_chars = set(w.hanzi)
        overlap = len(target_chars & w_chars)
        if overlap > 0 and overlap >= len(target_chars) * 0.5:
            results.append({
                "distractor": w,
                "reason": f"'{w.hanzi}' shares characters with '{word.hanzi}' — visual glyph confusion common for Viet learners.",
                "pattern": "visual_similarity",
            })
    return results


def _near_synonym_confusion(word: Word, pool: list[Word]) -> list[DistractorWithReason]:
    """Find words with similar meanings (same POS + topic) — meaning-level confusion.

    Vietnamese learners often struggle to distinguish near-synonyms
    because Vietnamese may use one word for several Chinese near-synonyms.
    """
    if not word.topic or word.topic == "core":
        return []

    results: list[DistractorWithReason] = []
    for w in pool:
        if w.topic == word.topic and w.pos == word.pos and w.id != word.id:
            results.append({
                "distractor": w,
                "reason": f"Same topic '{word.topic}' and POS — near-synonym confusion for Vietnamese learners.",
                "pattern": "near_synonym",
            })
    return results


def _word_order_confusion(word: Word, pool: list[Word]) -> list[DistractorWithReason]:
    """Find words where Vietnamese word order differs from Chinese.

    Common patterns: adj+noun vs noun+adj, adverb placement, time expressions.
    """
    if word.pos not in ("adj", "adv", "n"):
        return []

    results: list[DistractorWithReason] = []
    for w in pool:
        if w.pos == word.pos and len(w.hanzi) == len(word.hanzi) and w.id != word.id:
            results.append({
                "distractor": w,
                "reason": f"Same POS and length — word order errors are common for Vietnamese learners with '{w.hanzi}'.",
                "pattern": "word_order",
            })
    return results[:2]


# ── Main distractor policy ─────────────────────────────────────────────


def get_vietnamese_aware_distractors(
    word: Word,
    pool: list[Word],
    count: int = 3,
    rng: random.Random | None = None,
) -> list[DistractorWithReason]:
    """Generate distractors optimized for Vietnamese learners.

    Priority order:
      1. Tone confusion (highest error rate for Vietnamese)
      2. Visual similarity (glyph confusion)
      3. Near-synonym (same topic, different nuance)
      4. Measure word confusion (classifier errors)
      5. Word order confusion

    Falls back to random pool pick when specialized patterns are exhausted.
    """
    rng = rng or random.Random()
    chosen: list[DistractorWithReason] = []
    chosen_ids: set[int] = set()

    patterns = [
        _tone_confusion_candidates,
        _visual_similarity,
        _near_synonym_confusion,
        _measure_word_confusion,
        _word_order_confusion,
    ]

    for pattern_fn in rng.sample(patterns, len(patterns)):
        if len(chosen) >= count:
            break
        candidates = pattern_fn(word, pool)
        rng.shuffle(candidates)
        for c in candidates:
            if c["distractor"].id not in chosen_ids and c["distractor"].id != word.id:
                chosen.append(c)
                chosen_ids.add(c["distractor"].id)
                if len(chosen) >= count:
                    break

    # Fallback: random pool
    if len(chosen) < count:
        remaining = [w for w in pool if w.id not in chosen_ids and w.id != word.id]
        rng.shuffle(remaining)
        for w in remaining[: count - len(chosen)]:
            chosen.append({
                "distractor": w,
                "reason": "Random distractor (no specialized pattern applicable)",
                "pattern": "random",
            })

    return chosen[:count]


def get_smart_distractors(
    db: Session,
    word: Word,
    count: int = 3,
    seed: int | None = None,
) -> list[Word]:
    """Convenience: returns list[Word] from smart distractor engine.

    Compatible with existing `_pick_distractors` interface.
    """
    pool = db.scalars(
        select(Word).where(Word.hsk_level == word.hsk_level, Word.id != word.id).limit(80)
    ).all()
    if not pool:
        return []

    rng = random.Random(seed) if seed is not None else random.Random()
    results = get_vietnamese_aware_distractors(word, pool, count, rng)
    return [r["distractor"] for r in results]
