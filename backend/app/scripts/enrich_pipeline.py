"""Pipeline enrich câu ví dụ HSK 1-4, bền với teardown session.

Khác ``enrich_examples`` (chạy 1 lượt, dừng theo cây process của Claude): script
này tự-LOOP tới khi mọi từ HSK 1-4 đủ câu ví dụ, và được thiết kế để chạy như
process HĐH ĐỘC LẬP (detached) — teardown session không giết được nó.

    python -m app.scripts.enrich_pipeline

Bền vững:
  - Idempotent: cổng ``words_needing_enrichment`` bỏ qua từ đã đủ câu, nên mỗi
    vòng chỉ xử lý phần còn thiếu. Chạy lại từ đâu cũng an toàn, không tạo trùng.
  - Tự retry: mỗi level lặp tối đa MAX_PASSES vòng; vài từ luôn fail validation
    (LLM trả câu không đạt cap) sẽ không làm treo — thoát khi hết tiến triển.
  - Ghi log + marker ra file để theo dõi từ ngoài (tail log, đọc marker khi xong).
"""
from __future__ import annotations

import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.services.enrichment_service import enrich_words, words_needing_enrichment
from app.settings import NO_LLM_KEY_MESSAGE, settings

LEVELS = (1, 2, 3, 4)
MAX_PASSES = 4  # mỗi level: dừng sau ngần này vòng dù còn sót (tránh treo vô hạn)

_LOG_DIR = Path(__file__).resolve().parents[2] / "data"
LOG_PATH = _LOG_DIR / "enrich_pipeline.log"
MARKER_PATH = _LOG_DIR / "enrich_pipeline.done"


def _log(msg: str) -> None:
    line = f"[{datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def main() -> None:
    if not settings.llm_keys_list:
        _log(f"ERROR: {NO_LLM_KEY_MESSAGE} Thoát.")
        return

    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    MARKER_PATH.unlink(missing_ok=True)
    grand = {"examples_added": 0, "confusables_added": 0, "words_done": 0}

    for level in LEVELS:
        for pass_no in range(1, MAX_PASSES + 1):
            db = SessionLocal()
            try:
                words = words_needing_enrichment(db, level)
                remaining = len(words)
                if remaining == 0:
                    _log(f"HSK{level}: đã đủ câu ví dụ, bỏ qua.")
                    break
                _log(f"HSK{level} vòng {pass_no}: {remaining} từ cần enrich...")
                stats = enrich_words(db, words)
            finally:
                db.close()

            for key in grand:
                grand[key] += stats[key]
            _log(
                f"HSK{level} vòng {pass_no} xong: +{stats['examples_added']} ví dụ, "
                f"+{stats['confusables_added']} distractor, {stats['words_done']} từ."
            )
            # Hết tiến triển (không từ nào được enrich thêm) → không lặp vô ích.
            if stats["words_done"] == 0:
                _log(f"HSK{level}: không còn tiến triển, chuyển level.")
                break
            time.sleep(2)

    _log(
        f"TỔNG: +{grand['examples_added']} ví dụ, +{grand['confusables_added']} "
        f"distractor, {grand['words_done']} từ (HSK 1-4)."
    )

    # Sinh lại câu hỏi từ pool đã mở rộng (giống enrich_examples).
    if grand["examples_added"] or grand["confusables_added"]:
        _log("Sinh lại bank câu hỏi từ pool đã mở rộng...")
        from app.scripts.pregenerate_questions import pregenerate_questions

        db = SessionLocal()
        try:
            qstats = pregenerate_questions(db)
            db.commit()
            _log(f"Bank câu hỏi: {sum(qstats.values())} câu.")
        finally:
            db.close()

    MARKER_PATH.write_text(
        f"done {datetime.now():%Y-%m-%d %H:%M:%S}\n"
        f"examples={grand['examples_added']} confusables={grand['confusables_added']} "
        f"words={grand['words_done']}\n",
        encoding="utf-8",
    )
    _log("MARKER ghi xong — pipeline hoàn tất.")


if __name__ == "__main__":
    main()
