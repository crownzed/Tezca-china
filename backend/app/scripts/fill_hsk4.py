"""Fill HSK 4 vocabulary to 600 words using DeepSeek v4 Pro."""
import sys, json, time, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Word
from app.settings import settings
from sqlalchemy import func, select

API = "https://api.ai-box.vn/v1/chat/completions"
KEY = settings.deepseek_api_key
H = {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"}


def ask(prompt):
    d = {"model": "deepseek-v4-pro", "messages": [
        {"role": "system", "content": "Output ONLY valid JSON, no markdown."},
        {"role": "user", "content": prompt}
    ], "temperature": 0.3, "max_tokens": 4000}
    for _ in range(3):
        try:
            req = urllib.request.Request(API, data=json.dumps(d).encode(), headers=H, method="POST")
            with urllib.request.urlopen(req, timeout=90) as r:
                c = json.loads(r.read())["choices"][0]["message"]["content"].strip()
                if c.startswith("```"):
                    c = c.split("\n", 1)[1]
                if c.endswith("```"):
                    c = c[:-3]
                return json.loads(c)
        except Exception as e:
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
