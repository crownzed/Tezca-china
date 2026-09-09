"""Generate HSK 5 vocabulary using the configured LLM relay.

Creates words with pinyin, meaning, POS, and example sentences.
Then seeds them into the database and generates questions.
"""
from __future__ import annotations

import time
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Example, Word
from app.services.llm_generator_service import _call_api
from app.settings import NO_LLM_KEY_MESSAGE, settings

BATCH_SIZE = 30  # words per API call
TOTAL_TARGET = 300  # target HSK 5 words


def _call_llm(prompt: str) -> dict:
    # Dùng chung _call_api thay vì gọi thẳng provider cũ: provider đó đã bị bỏ
    # khỏi cấu hình, và _call_api lo sẵn việc chọn provider (primary/relay/custom
    # theo settings.llm_provider), xoay vòng key, retry, bóc markdown fence.
    return _call_api(prompt)


def generate_hsk5_batch(offset: int, count: int = BATCH_SIZE) -> list[dict]:
    prompt = f"""You are creating vocabulary for a Chinese learning app. Generate {count} HSK 5 level Chinese words with FULL details.

HSK 5 is upper-intermediate. Words should cover: abstract concepts, professional terms, emotions, formal expressions, academic vocabulary.

For each word, output:
- hanzi: the Chinese characters
- pinyin: accurate pinyin with tone marks (NOT tone numbers)
- meaning_vi: Vietnamese meaning
- meaning_en: English meaning
- pos: part of speech (n/v/adj/adv/prep/conj/measure)
- example_cn: a natural, realistic Chinese sentence using the word
- example_vi: Vietnamese translation of the example sentence

Output as JSON:
{{
  "words": [
    {{
      "hanzi": "..."",
      "pinyin": "...",
      "meaning_vi": "...",
      "meaning_en": "...",
      "pos": "...",
      "example_cn": "...",
      "example_vi": "..."
    }}
  ]
}}

RULES:
1. All words MUST be real HSK 5 level (upper-intermediate, NOT basic)
2. Pinyin MUST have tone marks (e.g. "xuĕxí" NOT "xue2xi2")
3. Example sentences must be natural and 5-15 characters
4. Vietnamese meaning must be accurate
5. Do NOT include words that are in HSK 1-4
6. No duplicates within this batch
7. ONLY output JSON, no explanation"""

    for attempt in range(3):
        try:
            data = _call_llm(prompt)
            words = data.get("words", [])
            valid = [w for w in words if w.get("hanzi") and w.get("pinyin") and w.get("meaning_vi") and w.get("example_cn")]
            if valid:
                return valid
        except Exception as e:
            print(f"  Retry {attempt+1}: {e}")
            time.sleep(3)
    return []


def import_words_into_db(words: list[dict]) -> int:
    db = SessionLocal()
    added = 0
    from sqlalchemy import select

    for w in words:
        hanzi = w["hanzi"].strip()
        existing = db.scalar(select(Word).where(Word.hanzi == hanzi))
        if existing:
            continue
        word = Word(
            hanzi=hanzi,
            pinyin=w.get("pinyin", ""),
            meaning_vi=w.get("meaning_vi", ""),
            meaning_en=w.get("meaning_en", ""),
            hsk_level=5,
            pos=w.get("pos", ""),
            source="deepseek-generated",
            topic="hsk5"
        )
        db.add(word)
        db.flush()
        if w.get("example_cn") and w.get("example_vi"):
            db.add(Example(
                word_id=word.id,
                sentence_cn=w["example_cn"],
                sentence_vi=w["example_vi"],
            ))
        added += 1

    db.commit()
    db.close()
    return added


def main():
    if not settings.llm_keys_list:
        print(f"ERROR: {NO_LLM_KEY_MESSAGE}")
        return

    db = SessionLocal()
    from sqlalchemy import func, select
    existing = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level == 5)) or 0
    db.close()

    needed = max(0, TOTAL_TARGET - existing)
    if needed <= 0:
        print(f"Already have {existing} HSK 5 words. Done.")
        return

    print(f"HSK 5: {existing} existing, generating {needed} more...")

    total_added = 0
    for offset in range(0, needed, BATCH_SIZE):
        batch_count = min(BATCH_SIZE, needed - offset)
        print(f"  Generating batch {offset//BATCH_SIZE + 1} ({batch_count} words)...")
        words = generate_hsk5_batch(offset, batch_count)
        if words:
            added = import_words_into_db(words)
            total_added += added
            print(f"  Added {added} new words (total: {total_added + existing})")
        time.sleep(2)

    # Regenerate questions
    print("Regenerating question bank...")
    from app.scripts.pregenerate_questions import pregenerate_questions
    db = SessionLocal()
    stats = pregenerate_questions(db)
    db.commit()
    total_qs = sum(stats.values())
    db.close()
    print(f"Done. {total_added} new words, {total_qs} total questions.")


if __name__ == "__main__":
    main()
