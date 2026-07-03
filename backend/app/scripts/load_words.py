"""Nạp ``words_export.json`` vào DB hiện hành (SQLite dev hoặc Postgres prod).

Cặp với ``export_words.py``. Đọc ``DATABASE_URL`` từ settings/env, nên để đẩy
lên prod chỉ cần set biến môi trường rồi chạy:

    DATABASE_URL=postgresql://...  python -m app.scripts.load_words

Đặc tính:
- Idempotent theo khóa (hanzi, hsk_level) = ràng buộc ``uq_word_hanzi_hsk``:
    * Từ chưa có -> chèn mới kèm examples.
    * Từ đã có   -> cập nhật meaning_vi/pinyin/pos... nếu ô đích đang rỗng
                    (KHÔNG đè dữ liệu curated đã có), và thêm example còn thiếu
                    (so trùng theo sentence_cn).
- Commit theo lô để lần chạy dở vẫn giữ được phần đã nạp.
- ``--overwrite`` ép ghi đè meaning_vi/pinyin/pos kể cả khi đích đã có (dùng khi
  muốn đồng bộ hẳn theo bản export).

Dùng:
    python -m app.scripts.load_words                 # nạp, không đè ô đã có
    python -m app.scripts.load_words --overwrite     # đồng bộ hẳn theo export
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import SessionLocal, init_db
from app.models import Example, Word

IN_PATH = Path(__file__).resolve().parents[1] / "data" / "words_export.json"
COMMIT_EVERY = 200


def _load_payload() -> dict:
    if not IN_PATH.exists():
        raise SystemExit(f"Không thấy {IN_PATH}. Chạy export_words trước.")
    return json.loads(IN_PATH.read_text(encoding="utf-8"))


def _apply_word(db: Session, row: dict, overwrite: bool, stats: dict) -> None:
    hanzi = (row.get("hanzi") or "").strip()
    level = int(row.get("hsk_level") or 0)
    if not hanzi or not level:
        stats["skipped"] += 1
        return

    existing = db.scalar(
        select(Word)
        .where(Word.hanzi == hanzi, Word.hsk_level == level)
        .options(selectinload(Word.examples))
    )

    if existing is None:
        word = Word(
            hanzi=hanzi,
            pinyin=row.get("pinyin", ""),
            meaning_vi=row.get("meaning_vi", ""),
            meaning_en=row.get("meaning_en", ""),
            hsk_level=level,
            pos=row.get("pos", ""),
            character_family=row.get("character_family", ""),
            component_hint=row.get("component_hint", ""),
            collocations_json=list(row.get("collocations") or []),
            confusable_words_json=list(row.get("confusable_words") or []),
            source=row.get("source", "seed"),
            topic=row.get("topic", "core"),
            frequency_band=row.get("frequency_band", "core_hsk"),
        )
        db.add(word)
        db.flush()
        _add_examples(db, word, row.get("examples") or [], existing_cn=set())
        stats["inserted"] += 1
        return

    # Cập nhật: chỉ điền ô rỗng, trừ khi --overwrite.
    def maybe_set(attr: str, value: str) -> bool:
        if not value:
            return False
        current = (getattr(existing, attr) or "").strip()
        if current and not overwrite:
            return False
        if current == value:
            return False
        setattr(existing, attr, value)
        return True

    changed = False
    changed |= maybe_set("meaning_vi", row.get("meaning_vi", ""))
    changed |= maybe_set("pinyin", row.get("pinyin", ""))
    changed |= maybe_set("meaning_en", row.get("meaning_en", ""))
    changed |= maybe_set("pos", row.get("pos", ""))
    changed |= maybe_set("character_family", row.get("character_family", ""))

    existing_cn = {e.sentence_cn.strip() for e in existing.examples if e.sentence_cn}
    added_ex = _add_examples(db, existing, row.get("examples") or [], existing_cn)

    if changed or added_ex:
        stats["updated"] += 1
    else:
        stats["unchanged"] += 1


def _add_examples(db: Session, word: Word, examples: list[dict], existing_cn: set[str]) -> int:
    added = 0
    for ex in examples:
        cn = (ex.get("cn") or "").strip()
        if not cn or cn in existing_cn:
            continue
        db.add(Example(
            word_id=word.id,
            sentence_cn=cn,
            sentence_vi=(ex.get("vi") or "").strip(),
            source=ex.get("source", "tatoeba"),
        ))
        existing_cn.add(cn)
        added += 1
    return added


def load(overwrite: bool = False) -> dict:
    """Nạp export vào DB hiện hành. Trả stats. An toàn gọi từ startup (không
    đụng argparse/sys.argv)."""
    payload = _load_payload()
    rows = payload.get("words") or []
    print(f"Nạp {len(rows)} từ từ {IN_PATH.name} (overwrite={overwrite})...")

    init_db()
    db = SessionLocal()
    stats = {"inserted": 0, "updated": 0, "unchanged": 0, "skipped": 0}
    try:
        for i, row in enumerate(rows, 1):
            _apply_word(db, row, overwrite, stats)
            if i % COMMIT_EVERY == 0:
                db.commit()
                print(f"  {i}/{len(rows)}...")
        db.commit()
    finally:
        db.close()

    print(
        f"Xong. inserted={stats['inserted']} updated={stats['updated']} "
        f"unchanged={stats['unchanged']} skipped={stats['skipped']}"
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--overwrite", action="store_true", help="Ghi đè meaning_vi/pinyin/pos kể cả khi đích đã có")
    args = parser.parse_args()
    load(overwrite=args.overwrite)


if __name__ == "__main__":
    main()
