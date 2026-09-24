"""Pipeline enrich chi tiết từ vựng (dual-professor) cho HSK 1-4.

Chạy OFFLINE để sinh ngữ nghĩa, lưu ý, cách dùng, phân tích chữ Hán:
    python -m app.scripts.enrich_word_details

Idempotent: chỉ xử lý từ chưa có semantic_notes. Chạy lại an toàn.
"""
from __future__ import annotations

import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.services.enrichment_service import enrich_word_details, words_needing_detail_enrichment
from app.settings import NO_LLM_KEY_MESSAGE, settings

LEVELS = (1, 2, 3, 4)
MAX_PASSES = 6  # mỗi level: dừng sau ngần này vòng dù còn sót
BATCH_SIZE = 5  # số từ mỗi lần gọi dual-professor

_LOG_DIR = Path(__file__).resolve().parents[2] / "data"
LOG_PATH = _LOG_DIR / "enrich_word_details.log"
MARKER_PATH = _LOG_DIR / "enrich_word_details.done"


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

    total_done = 0
    total_errors = 0

    for level in LEVELS:
        _log(f"=== HSK {level} ===")
        passes = 0
        while passes < MAX_PASSES:
            passes += 1
            db = SessionLocal()
            try:
                remaining = len(words_needing_detail_enrichment(db, level=level, limit=1))
                if remaining == 0:
                    _log(f"  HSK {level}: done (pass {passes})")
                    break

                stats = enrich_word_details(db, batch_size=BATCH_SIZE)
                done = stats["words_done"]
                errors = stats["errors"]
                total_done += done
                total_errors += errors
                _log(f"  Pass {passes}: {done} words enriched, {errors} errors")

                if done == 0 and errors == 0:
                    _log(f"  HSK {level}: no progress, stopping")
                    break

                time.sleep(2.0)
            except Exception as exc:
                _log(f"  Pass {passes} FAILED: {exc}")
                total_errors += 1
                time.sleep(5.0)
            finally:
                db.close()

    _log(f"TOTAL: {total_done} words enriched, {total_errors} errors")
    MARKER_PATH.write_text(
        f"done={total_done} errors={total_errors} at={datetime.now():%Y-%m-%dT%H:%M:%S}\n"
    )


if __name__ == "__main__":
    main()
