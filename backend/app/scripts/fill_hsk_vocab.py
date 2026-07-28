"""Generate complete HSK vocabulary lists using the configured LLM.

The AI knows the official HSK word lists. We ask it to output
all words for a given level with pinyin, meaning, and example sentences.
"""
from __future__ import annotations

import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Example, Word
from app.services.llm_generator_service import _call_api
from app.settings import settings
from sqlalchemy import func, select

# Official HSK 2.0 word counts
HSK_TARGETS = {1: 150, 2: 150, 3: 300, 4: 600, 5: 1300, 6: 2500}
# How many to generate per API call
WORDS_PER_CALL = 50


def _call_llm(prompt: str) -> dict:
    # Dùng chung _call_api (relay vilao.ai) thay vì gọi thẳng ai-box/DeepSeek:
    # provider đó đã bị bỏ khỏi cấu hình, và _call_api lo sẵn xoay vòng key,
    # retry, bóc markdown fence.
    return _call_api(prompt)


def generate_hsk_words(level: int, start_index: int, count: int) -> list[dict]:
    """Generate a batch of HSK words at the given level."""
    prompt = f"""List {count} words from the official HSK {level} vocabulary list, starting from word #{start_index + 1}.

For EACH word, output exactly these fields:
- hanzi: Chinese characters (simplified)
- pinyin: with tone MARKS (not numbers), e.g. "xuéxí" not "xue2xi2"
- meaning_vi: Vietnamese meaning
- pos: part of speech (n/v/adj/adv/prep/conj/measure/pron/num/part)
- example_cn: a short natural Chinese sentence (5-15 chars)
- example_vi: Vietnamese translation of example

Output as JSON object with a "words" array:
{{
  "words": [
    {{"hanzi": "...", "pinyin": "...", "meaning_vi": "...", "pos": "...", "example_cn": "...", "example_vi": "..."}}
  ]
}}

Rules:
1. WORDS MUST BE FROM THE OFFICIAL HSK {level} LIST — not made up
2. All fields required for every word
3. Pinyin MUST use tone marks (ā á ǎ à ē é ě è etc), NEVER tone numbers
4. Skip words already listed in previous batches
5. ONLY output JSON, no explanation"""

    for attempt in range(3):
        try:
            data = _call_llm(prompt)
            words = data.get("words", [])
            valid = [w for w in words if w.get("hanzi") and w.get("pinyin") and len(w.get("hanzi","")) >= 1]
            if valid:
                return valid
        except Exception as e:
            print(f"    Retry {attempt+1}: {str(e)[:100]}")
            time.sleep(3)
    return []


def import_words(words: list[dict], level: int) -> int:
    db = SessionLocal()
    added = 0
    skipped = 0
    for w in words:
        hanzi = w["hanzi"].strip()
        if db.scalar(select(Word).where(Word.hanzi == hanzi, Word.hsk_level == level)):
            skipped += 1
            continue
        word = Word(
            hanzi=hanzi,
            pinyin=w.get("pinyin", ""),
            meaning_vi=w.get("meaning_vi", ""),
            meaning_en=w.get("meaning_en", ""),
            hsk_level=level,
            pos=w.get("pos", ""),
            source="deepseek-hsk-list",
            topic=f"hsk{level}"
        )
        db.add(word)
        db.flush()
        if w.get("example_cn") and w.get("example_vi"):
            db.add(Example(word_id=word.id, sentence_cn=w["example_cn"], sentence_vi=w["example_vi"]))
        added += 1
    db.commit()
    db.close()
    if skipped: print(f"    Skipped {skipped} duplicates")
    return added


def fill_level(level: int) -> int:
    db = SessionLocal()
    existing = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level == level)) or 0
    db.close()

    target = HSK_TARGETS.get(level, existing + 200)
    needed = max(0, target - existing)
    if needed <= 0:
        print(f"  HSK {level}: {existing} words (target ✓)")
        return 0

    print(f"  HSK {level}: {existing} existing, generating {needed}...")
    total_added = 0

    for offset in range(0, needed, WORDS_PER_CALL):
        batch_count = min(WORDS_PER_CALL, needed - offset)
        words = generate_hsk_words(level, existing + offset, batch_count)
        if words:
            added = import_words(words, level)
            total_added += added
            print(f"    +{added} (batch {offset//WORDS_PER_CALL + 1})")
        time.sleep(1.5)

    return total_added


def main():
    if not settings.llm_keys_list:
        print("ERROR: GEMINI_API_KEYS not set")
        return

    # Check current state
    db = SessionLocal()
    print("Current vocabulary:")
    for lvl in range(1, 7):
        w = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level == lvl))
        target = HSK_TARGETS.get(lvl, "?")
        print(f"  HSK {lvl}: {w} / {target}")
    db.close()

    print("\nFilling gaps...")
    total_added = 0
    for level in [1, 2, 3, 4, 5, 6]:
        added = fill_level(level)
        total_added += added

    print(f"\nTotal new words: {total_added}")

    if total_added > 0:
        print("Regenerating questions...")
        from app.scripts.pregenerate_questions import pregenerate_questions
        db = SessionLocal()
        stats = pregenerate_questions(db)
        db.commit()
        db.close()
        print(f"Questions: {sum(stats.values())}")


if __name__ == "__main__":
    main()
