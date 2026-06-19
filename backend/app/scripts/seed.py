import json
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import Example, Word
from app.services.enrichment_service import (
    character_family,
    component_hint,
    confusable_hanzi,
    tone_pattern,
    topic,
)

RAW_DIR = Path(__file__).resolve().parents[2] / "raw_data"


def load_json(name: str, fallback):
    path = RAW_DIR / name
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def seed_words(db):
    hsk_words = load_json("hsk.json", [])
    cedict = {item.get("simplified"): item for item in load_json("cedict.json", [])}

    defaults = [
        {"hanzi": "我", "pinyin": "wǒ", "meaning_vi": "tôi", "hsk_level": 1},
        {"hanzi": "你", "pinyin": "nǐ", "meaning_vi": "bạn", "hsk_level": 1},
        {"hanzi": "好", "pinyin": "hǎo", "meaning_vi": "tốt", "hsk_level": 1},
        {"hanzi": "学习", "pinyin": "xuéxí", "meaning_vi": "học tập", "hsk_level": 1},
        {"hanzi": "中国", "pinyin": "Zhōngguó", "meaning_vi": "Trung Quốc", "hsk_level": 1},
        {"hanzi": "朋友", "pinyin": "péngyou", "meaning_vi": "bạn bè", "hsk_level": 2},
        {"hanzi": "因为", "pinyin": "yīnwèi", "meaning_vi": "bởi vì", "hsk_level": 2},
        {"hanzi": "虽然", "pinyin": "suīrán", "meaning_vi": "tuy rằng", "hsk_level": 3},
    ]
    rows = hsk_words or defaults
    seen_keys = set()
    for row in rows:
        hanzi = row.get("hanzi") or row.get("word") or row.get("simplified")
        if not hanzi:
            continue
        entry = cedict.get(hanzi, {})
        level = int(row.get("hsk_level") or row.get("level") or 1)
        key = (hanzi, level)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        word = db.scalar(select(Word).where(Word.hanzi == hanzi, Word.hsk_level == level))
        if word:
            word.pinyin = word.pinyin or row.get("pinyin") or entry.get("pinyin") or ""
            word.meaning_vi = word.meaning_vi or row.get("meaning_vi") or row.get("meaning") or ""
            word.meaning_en = word.meaning_en or row.get("meaning_en") or entry.get("definition") or ""
            continue
        db.add(Word(
            hanzi=hanzi,
            pinyin=row.get("pinyin") or entry.get("pinyin") or "",
            meaning_vi=row.get("meaning_vi") or row.get("meaning") or "",
            meaning_en=row.get("meaning_en") or entry.get("definition") or "",
            hsk_level=level,
            source="hsk+cedict",
        ))
    db.commit()

def seed_hsk_examples(db):
    hsk_words = load_json("hsk.json", [])
    for row in hsk_words:
        hanzi = row.get("hanzi") or row.get("word") or row.get("simplified")
        sentence = row.get("example_sentence") or row.get("exampleSentence") or row.get("sentence_cn")
        if not hanzi or not sentence:
            continue
        word = db.scalar(select(Word).where(Word.hanzi == hanzi, Word.hsk_level == int(row.get("hsk_level") or row.get("level") or 1)))
        if not word:
            continue
        exists = db.scalar(select(Example).where(Example.word_id == word.id, Example.sentence_cn == sentence))
        if exists:
            continue
        db.add(Example(
            word_id=word.id,
            sentence_cn=sentence,
            sentence_vi=row.get("example_vi") or row.get("exampleVi") or row.get("sentence_vi") or "",
            source="hsk-bank",
        ))
    db.commit()


def seed_examples(db):
    examples = load_json("tatoeba.json", [])
    if not examples:
        examples = [
            {"word": "学习", "sentence_cn": "我在学习中文。", "sentence_vi": "Tôi đang học tiếng Trung."},
            {"word": "朋友", "sentence_cn": "他是我的朋友。", "sentence_vi": "Anh ấy là bạn của tôi."},
        ]
    for row in examples:
        word = db.scalar(select(Word).where(Word.hanzi == row.get("word")))
        if not word:
            continue
        exists = db.scalar(select(Example).where(Example.word_id == word.id, Example.sentence_cn == row.get("sentence_cn")))
        if exists:
            continue
        db.add(Example(word_id=word.id, sentence_cn=row.get("sentence_cn", ""), sentence_vi=row.get("sentence_vi", "")))
    db.commit()


def enrich_words(db):
    """Tính các thuộc tính chiều sâu cho mọi từ (idempotent).

    Chạy lại nhiều lần cho cùng kết quả: tone_pattern/character_family/
    component_hint/confusables đều suy ra tất định từ dữ liệu
    có sẵn nên ghi đè an toàn.
    """
    raw = load_json("hsk.json", [])
    meta_by_key = {}
    for row in raw:
        hanzi = row.get("hanzi") or row.get("word") or row.get("simplified")
        if not hanzi:
            continue
        level = int(row.get("hsk_level") or row.get("level") or 1)
        meta_by_key[(hanzi, level)] = row

    words = db.scalars(select(Word)).all()
    if not words:
        return

    all_hanzi = {w.hanzi for w in words}
    corpus = [
        {
            "hanzi": w.hanzi,
            "pinyin": w.pinyin,
            "meaning_vi": w.meaning_vi,
            "meaning_en": w.meaning_en,
        }
        for w in words
    ]

    for word in words:
        meta = meta_by_key.get((word.hanzi, word.hsk_level), {})
        target = {
            "hanzi": word.hanzi,
            "pinyin": word.pinyin,
            "meaning_vi": word.meaning_vi,
            "meaning_en": word.meaning_en,
        }
        word.tone_pattern = tone_pattern(word.pinyin or "")
        word.character_family = character_family(word.hanzi, all_hanzi)
        word.component_hint = component_hint(
            word.hanzi,
            meta.get("category") or "",
            meta.get("stroke_count"),
        )
        # Shape canonical: list[str] hanzi (khớp schema + frontend).
        word.confusable_words_json = confusable_hanzi(target, corpus)
        if not word.topic or word.topic == "core":
            word.topic = topic(word.hanzi, word.meaning_vi or "", word.meaning_en or "")
    db.commit()


def main():
    init_db()
    with SessionLocal() as db:
        seed_words(db)
        seed_hsk_examples(db)
        seed_examples(db)
        enrich_words(db)


if __name__ == "__main__":
    main()
