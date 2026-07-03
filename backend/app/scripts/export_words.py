"""Xuất toàn bộ bảng ``words`` (+ ``examples``) ra JSON để commit & đưa lên prod.

``dev.db`` bị gitignore (không commit DB nhị phân), nên 5.7k từ đã dịch cần một
kênh khác để lên Postgres prod. Script này kết xuất ra
``backend/app/data/words_export.json`` — file text, review được, DB-agnostic.
Cặp với ``load_words.py`` (nạp JSON vào bất kỳ DATABASE_URL nào, idempotent).

Chỉ xuất từ ĐÃ CÓ ``meaning_vi`` (bỏ từ đang chờ dịch) để prod không nhận thẻ
thiếu nghĩa. Khóa định danh khi nạp là (hanzi, hsk_level) — trùng với ràng buộc
``uq_word_hanzi_hsk``.

Dùng:  python -m app.scripts.export_words        (từ thư mục backend/)
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models import Word

OUT_PATH = Path(__file__).resolve().parents[1] / "data" / "words_export.json"


def _has_meaning():
    return func.coalesce(func.trim(Word.meaning_vi), "") != ""


def export() -> dict:
    db = SessionLocal()
    try:
        words = db.scalars(
            select(Word)
            .where(_has_meaning())
            .options(selectinload(Word.examples))
            .order_by(Word.hsk_level, Word.id)
        ).all()

        rows = []
        example_count = 0
        for w in words:
            examples = [
                {"cn": e.sentence_cn, "vi": e.sentence_vi or "", "source": e.source or "tatoeba"}
                for e in w.examples
                if (e.sentence_cn or "").strip()
            ]
            example_count += len(examples)
            rows.append({
                "hanzi": w.hanzi,
                "pinyin": w.pinyin or "",
                "meaning_vi": w.meaning_vi or "",
                "meaning_en": w.meaning_en or "",
                "hsk_level": w.hsk_level,
                "pos": w.pos or "",
                "character_family": w.character_family or "",
                "component_hint": w.component_hint or "",
                "collocations": list(w.collocations_json or []),
                "confusable_words": list(w.confusable_words_json or []),
                "source": w.source or "seed",
                "topic": w.topic or "core",
                "frequency_band": w.frequency_band or "core_hsk",
                "examples": examples,
            })

        payload = {
            "version": 1,
            "word_count": len(rows),
            "example_count": example_count,
            "words": rows,
        }
        return payload
    finally:
        db.close()


def main() -> None:
    payload = export()
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    size_kb = OUT_PATH.stat().st_size // 1024
    print(
        f"Exported {payload['word_count']} words, {payload['example_count']} examples "
        f"-> {OUT_PATH} ({size_kb} KB)"
    )


if __name__ == "__main__":
    main()
