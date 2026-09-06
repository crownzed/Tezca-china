"""Quick fill HSK vocabulary gaps — gọi LLM qua provider đang cấu hình."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Word, Example
from app.services.llm_generator_service import _call_api
from sqlalchemy import func, select


def call_api(prompt):
    # _call_api đã lo chọn provider + xoay vòng key + retry + bóc markdown
    # fence. Trước đây script tự gọi ai-box/DeepSeek; provider đó đã bị bỏ.
    # Trả {} khi hết key để vòng lặp gọi tiếp tục như hành vi cũ.
    try:
        return _call_api(prompt)
    except Exception as e:
        print(f"  LLM fail: {str(e)[:120]}")
        time.sleep(3)
        return {}


def main():
    db = SessionLocal()
    # Conservative targets - fill what's reasonable
    targets = {1: 150, 2: 150, 3: 300, 4: 300, 5: 250, 6: 100}
    BATCH = 25

    for lvl in [1, 2, 3, 4, 5, 6]:
        existing = db.scalar(select(func.count()).select_from(Word).where(Word.hsk_level == lvl)) or 0
        needed = max(0, targets[lvl] - existing)
        if needed <= 0:
            print(f"HSK {lvl}: {existing} complete")
            continue

        print(f"HSK {lvl}: {existing} -> {targets[lvl]} (+{needed})")
        added = 0

        for offset in range(0, needed, BATCH):
            n = min(BATCH, needed - offset)
            idx = existing + offset + 1
            prompt = (
                f"List {n} words from the OFFICIAL HSK {lvl} list (starting from #{idx}). "
                f'Output JSON: {{"words":[{{"hanzi":"..","pinyin":"..","meaning_vi":"..","pos":"..",'
                f'"example_cn":"..","example_vi":".."}}]}}. '
                f"Pinyin MUST use tone marks not numbers. ONLY JSON."
            )
            data = call_api(prompt)
            words = data.get("words", [])

            for w in words:
                h = (w.get("hanzi") or "").strip()
                if not h or not w.get("pinyin"):
                    continue
                if db.scalar(select(Word).where(Word.hanzi == h, Word.hsk_level == lvl)):
                    continue
                word = Word(
                    hanzi=h, pinyin=w.get("pinyin", ""),
                    meaning_vi=w.get("meaning_vi", ""),
                    hsk_level=lvl, pos=w.get("pos", ""),
                    source="deepseek-pro", topic=f"hsk{lvl}"
                )
                db.add(word); db.flush()
                if w.get("example_cn") and w.get("example_vi"):
                    db.add(Example(word_id=word.id, sentence_cn=w["example_cn"], sentence_vi=w["example_vi"]))
                added += 1

            db.commit()
            pct = min(100, (offset + n) * 100 // needed)
            print(f"  {pct}% +{len(words)} words (total {existing+added})")
            time.sleep(1.5)

        print(f"  HSK {lvl} done: +{added} = {existing+added} total")

    db.close()
    print("\nAll done!")


if __name__ == "__main__":
    main()
