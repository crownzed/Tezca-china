"""Nhúng token vào prompt của các câu drag_drop do LLM sinh.

LLM để nguyên câu lệnh chung ("Kéo các từ vào đúng vị trí…") làm prompt cho mọi
câu drag_drop, nên 115 dòng trong bank chỉ có vài prompt phân biệt. Hai hệ quả:

1. ``upgrade_quiz_bank_ai`` dedup theo (level, quiz_type, prompt) nên mọi câu
   drag_drop sinh sau đều bị coi là trùng -> created=0 vĩnh viễn.
2. Đề không đọc được nếu client không lấy ``metadata_json.segments``.

Các dòng viết tay đã dùng định dạng "Sắp xếp từ thành câu đúng: A · B · C";
script này đưa dòng AI về cùng định dạng, lấy token từ ``metadata.segments`` sẵn
có nên không cần gọi lại API. Chỉ sửa cột ``prompt``, không đụng segments/
correct_order để thứ tự đúng và lời giải giữ nguyên.
"""

from __future__ import annotations

import argparse
import logging

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Question, QuizType

logger = logging.getLogger("backfill_drag_prompts")

PREFIX = "Sắp xếp từ thành câu đúng: "
SEPARATOR = " · "


def build_prompt(segments: list[str]) -> str:
    return PREFIX + SEPARATOR.join(segments)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Chỉ in thay đổi, không ghi DB")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    changed = skipped_no_segments = already_ok = 0
    collisions = 0

    with SessionLocal() as db:
        rows = db.scalars(
            select(Question).where(Question.quiz_type == QuizType.drag_drop)
        ).all()
        # Prompt đã tồn tại theo (level, type) để backfill không tạo ra hai dòng
        # cùng khóa dedup — trùng thì giữ nguyên prompt cũ và báo cáo.
        seen: set[tuple[int, str]] = set()
        for row in rows:
            if str(row.prompt or "").startswith(PREFIX):
                seen.add((row.level, str(row.prompt).strip()))

        for row in rows:
            prompt = str(row.prompt or "").strip()
            if prompt.startswith(PREFIX):
                already_ok += 1
                continue
            metadata = row.metadata_json or {}
            segments = [str(token).strip() for token in metadata.get("segments") or [] if str(token).strip()]
            if len(segments) < 2:
                skipped_no_segments += 1
                logger.warning("id=%s thiếu segments, giữ nguyên prompt", row.id)
                continue
            new_prompt = build_prompt(segments)
            key = (row.level, new_prompt)
            if key in seen:
                collisions += 1
                logger.warning("id=%s prompt mới đã tồn tại ở HSK%s, giữ nguyên", row.id, row.level)
                continue
            seen.add(key)
            if args.dry_run:
                logger.info("id=%s HSK%s\n  cũ : %s\n  mới: %s", row.id, row.level, prompt, new_prompt)
            else:
                row.prompt = new_prompt
            changed += 1

        if args.dry_run:
            db.rollback()
        else:
            db.commit()

    logger.info(
        "%s: changed=%s already_ok=%s no_segments=%s collisions=%s",
        "DRY-RUN" if args.dry_run else "APPLIED",
        changed,
        already_ok,
        skipped_no_segments,
        collisions,
    )


if __name__ == "__main__":
    main()
