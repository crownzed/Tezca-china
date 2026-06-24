"""Quick fill HSK vocabulary gaps using DeepSeek v4 Pro."""
import sys, time, json, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Word, Example
from app.settings import settings
from sqlalchemy import func, select

API_URL = "https://api.ai-box.vn/v1/chat/completions"
KEY = settings.deepseek_api_key
HEADERS = {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"}


def call_api(prompt):
    data = {
        "model": "deepseek-v4-pro",
        "messages": [
            {"role": "system", "content": "You are a Chinese language database. Output ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5,
        "max_tokens": 8000,
        "response_format": {"type": "json_object"}
    }
    req = urllib.request.Request(API_URL, data=json.dumps(data).encode(), headers=HEADERS, method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                c = json.loads(r.read())["choices"][0]["message"]["content"].strip()
                if c.startswith("```"): c = c.split("\n", 1)[1]
                if c.endswith("```"): c = c[:-3]
                return json.loads(c)
        except Exception as e:
            print(f"  retry {attempt+1}: {str(e)[:80]}")
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
