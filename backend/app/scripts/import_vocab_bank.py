"""Import HSK 3-5 vocabulary from frontend vocab-bank.js into the database."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # backend/app/scripts -> project root
VOCAB_BANK = ROOT / "src" / "vocab-bank.js"


def extract_words() -> list[dict]:
    """Run a Node script to extract HSK words from vocab-bank.js."""
    script = f"""
    import('./src/vocab-bank.js').then(m => {{
        const result = [];
        for (const key of ['hsk3','hsk4','hsk5']) {{
            const arr = m[key] || [];
            for (const row of arr) {{
                if (row && row.character) {{
                    result.push({{
                        hanzi: row.character,
                        pinyin: row.pinyin || '',
                        meaning_vi: row.meaning || '',
                        hsk_level: row.hskLevel || Number(key.replace('hsk','')),
                        pos: row.category || '',
                        example_cn: row.exampleSentence || '',
                        example_py: row.examplePinyin || '',
                        example_vi: row.exampleVi || '',
                    }});
                }}
            }}
        }}
        console.log(JSON.stringify(result));
    }}).catch(e => console.error(e.message));
    """
    proc = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, cwd=str(ROOT),
        timeout=60,
    )
    if proc.returncode != 0:
        print("Node error:", proc.stderr[:200])
        return []
    return json.loads(proc.stdout)


def main() -> None:
    from app.db import SessionLocal
    from app.models import Example, Word
    from sqlalchemy import select

    words_data = extract_words()
    if not words_data:
        print("No words extracted from vocab-bank.js")
        return

    db = SessionLocal()
    added_words = 0
    added_examples = 0

    for row in words_data:
        hanzi = row["hanzi"]
        level = int(row["hsk_level"])
        existing = db.scalar(
            select(Word).where(Word.hanzi == hanzi, Word.hsk_level == level)
        )
        if existing:
            if not existing.meaning_vi and row["meaning_vi"]:
                existing.meaning_vi = row["meaning_vi"]
            continue

        word = Word(
            hanzi=hanzi,
            pinyin=row.get("pinyin", ""),
            meaning_vi=row.get("meaning_vi", ""),
            hsk_level=level,
            source="vocab-bank",
            pos=row.get("pos", ""),
        )
        db.add(word)
        db.flush()
        added_words += 1

        if row.get("example_cn") and row.get("example_vi"):
            db.add(Example(
                word_id=word.id,
                sentence_cn=row["example_cn"],
                sentence_vi=row["example_vi"],
            ))
            added_examples += 1

    db.commit()
    print(f"Imported: {added_words} words, {added_examples} examples")
    db.close()


if __name__ == "__main__":
    main()
