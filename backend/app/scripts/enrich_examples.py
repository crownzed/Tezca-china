"""Làm giàu pool dữ liệu câu hỏi bằng AI (offline), rồi bake vào bank câu hỏi.

Chạy THỦ CÔNG / lúc deploy, KHÔNG nằm trong đường request:

    python -m app.scripts.enrich_examples

Với mỗi cấp HSK 1-6: tìm các từ còn thiếu câu ví dụ AI (``words_needing_enrichment``),
gọi LLM sinh thêm câu ví dụ tự nhiên + distractor dễ nhầm, ghi vào DB. Cuối cùng
re-run ``pregenerate_questions`` để sinh câu hỏi mới từ pool đã mở rộng.

Idempotent: chạy lại gần như miễn phí (cổng ``words_needing_enrichment`` + bỏ trùng).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.services.enrichment_service import enrich_words, words_needing_enrichment
from app.settings import settings


def main() -> None:
    if not settings.llm_keys_list:
        print("ERROR: chưa cấu hình GEMINI_API_KEYS — bỏ qua enrichment.")
        return

    grand = {"examples_added": 0, "confusables_added": 0, "words_done": 0}
    db = SessionLocal()
    try:
        for level in range(1, 7):
            words = words_needing_enrichment(db, level)
            print(f"HSK {level}: {len(words)} từ cần enrich...")
            if not words:
                continue
            stats = enrich_words(db, words)
            print(
                f"  +{stats['examples_added']} câu ví dụ, "
                f"+{stats['confusables_added']} distractor "
                f"({stats['words_done']} từ)"
            )
            for key in grand:
                grand[key] += stats[key]
    finally:
        db.close()

    print(
        f"\nTổng: +{grand['examples_added']} câu ví dụ, "
        f"+{grand['confusables_added']} distractor, {grand['words_done']} từ."
    )

    if grand["examples_added"] or grand["confusables_added"]:
        print("Sinh lại câu hỏi từ pool đã mở rộng...")
        from app.scripts.pregenerate_questions import pregenerate_questions

        db = SessionLocal()
        try:
            stats = pregenerate_questions(db)
            db.commit()
            print(f"Bank câu hỏi: {sum(stats.values())} câu.")
        finally:
            db.close()


if __name__ == "__main__":
    main()
