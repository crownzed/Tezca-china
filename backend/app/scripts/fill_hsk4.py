"""Fill HSK 4 vocabulary to 600 words — gọi LLM qua provider đang cấu hình."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Word
from app.services.llm_generator_service import _call_api
from sqlalchemy import func, select


def ask(prompt):
    # _call_api lo chọn provider + xoay vòng key + retry + bóc markdown fence.
    # Trước đây script tự gọi ai-box/DeepSeek; provider đó đã bị bỏ khỏi cấu hình.
    try:
        return _call_api(prompt)
    except Exception as e:
        print(f"  LLM fail: {str(e)[:120]}")
        time.sleep(2)
        return {}


def main():
    db = SessionLocal()
    ex = set(w.hanzi for w in db.scalars(select(Word).where(Word.hsk_level == 4)).all())
    print(f"Existing HSK 4: {len(ex)}")

    added = 0
    target = 600
    batch = 10

    for i in range(0, target - len(ex), batch):
        n = min(batch, target - len(ex))
        prompt = (
            f"List {n} HSK 4 Chinese words. Skip words already known. "
            "Output JSON: {\"words\":[{\"hanzi\":\"..\",\"pinyin\":\"..\",\"meaning_vi\":\"..\",\"pos\":\"..\"}]}. "
            "Pinyin MUST have tone marks. Only real HSK 4 words. ONLY valid JSON, no explanation."
        )

        data = ask(prompt)
        words = data.get("words", [])
        for w in words:
            h = (w.get("hanzi") or "").strip()
            if not h or not w.get("pinyin") or h in ex:
                continue
            ex.add(h)
            db.add(Word(
                hanzi=h, pinyin=w.get("pinyin", ""),
                meaning_vi=w.get("meaning_vi", ""),
                hsk_level=4, pos=w.get("pos", ""), source="deepseek-hsk4"
            ))
            added += 1

        db.commit()
        print(f"  +{added} ({len(ex)}/{target})")
        if len(ex) >= target:
            break
        time.sleep(1.5)

    db.close()
    print(f"Done: +{added}, HSK 4 = {len(ex)}")


if __name__ == "__main__":
    main()
