"""Cân bằng lại vị trí đáp án đúng của các câu trắc nghiệm trong bank.

Chạy từ thư mục backend:
  python -m app.scripts.rebalance_answer_positions --dry-run
  python -m app.scripts.rebalance_answer_positions

Lý do: LLM gần như luôn đặt đáp án đúng ở vị trí đầu. Đo trên bank sinh bằng
relay: 73% câu có ``correct_index=0`` (riêng cloze 94%). Người học chỉ cần luôn
chọn A là đúng phần lớn, nên điểm số không còn phản ánh năng lực.

``llm_generator_service._shuffle_options`` đã chặn việc này cho câu sinh MỚI;
script này xử lý các câu ĐÃ ghi vào DB trước khi có bước đó.

An toàn: chỉ đổi thứ tự phần tử trong ``options`` và ``correct_index`` tương ứng
— nội dung câu, đáp án đúng và explanation không thay đổi. ``option_word_ids``
được hoán vị cùng để không lệch khỏi options.

Bỏ qua drag_drop: options của nó là placeholder (``__drag_1__``…), frontend đọc
``metadata_json.segments`` chứ không đọc options.
"""

import argparse
import logging
import random
import sys
from collections import Counter

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Question, QuizType

logger = logging.getLogger(__name__)

# options là placeholder, không phải lựa chọn thật -> xáo sẽ vô nghĩa.
SKIP_TYPES = {QuizType.drag_drop}


def _permutation(question: Question) -> list[int] | None:
    """Hoán vị 4 vị trí, seed theo nội dung câu nên chạy lại cho kết quả y hệt."""
    options = question.options
    if not isinstance(options, list) or len(options) != 4:
        return None
    ci = question.correct_index
    if not isinstance(ci, int) or not 0 <= ci < 4:
        return None
    indices = [0, 1, 2, 3]
    rng = random.Random(f"{question.prompt}|{'|'.join(map(str, options))}")
    rng.shuffle(indices)
    return indices


def rebalance(dry_run: bool, only_ai: bool) -> tuple[int, int, Counter, Counter]:
    changed = skipped = 0
    before: Counter = Counter()
    after: Counter = Counter()

    with SessionLocal() as db:
        rows = db.scalars(select(Question)).all()
        for row in rows:
            if row.quiz_type in SKIP_TYPES:
                continue
            metadata = row.metadata_json or {}
            if only_ai and not str(metadata.get("source", "")).startswith("ai_"):
                continue

            indices = _permutation(row)
            if indices is None:
                skipped += 1
                continue

            options = list(row.options)
            answer = options[row.correct_index]
            before[row.correct_index] += 1

            reordered = [options[i] for i in indices]
            new_ci = reordered.index(answer)
            after[new_ci] += 1

            if reordered == options:
                continue

            if not dry_run:
                row.options = reordered
                row.correct_index = new_ci
                # option_word_ids song song với options: không hoán vị cùng thì
                # distractor policy sẽ tra sai từ cho từng lựa chọn.
                word_ids = metadata.get("option_word_ids")
                if isinstance(word_ids, list) and len(word_ids) == 4:
                    updated = dict(metadata)
                    updated["option_word_ids"] = [word_ids[i] for i in indices]
                    row.metadata_json = updated
            changed += 1

        if not dry_run:
            db.commit()

    return changed, skipped, before, after


def _fmt(dist: Counter) -> str:
    total = sum(dist.values()) or 1
    return "  ".join(f"{i}:{dist.get(i, 0)} ({dist.get(i, 0) * 100 // total}%)" for i in range(4))


def main() -> None:
    parser = argparse.ArgumentParser(description="Cân bằng vị trí đáp án đúng trong question bank")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ báo cáo, không ghi DB")
    parser.add_argument(
        "--all-sources",
        action="store_true",
        help="Xử lý cả câu template (mặc định chỉ câu có source bắt đầu bằng 'ai_')",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout, force=True)

    changed, skipped, before, after = rebalance(args.dry_run, only_ai=not args.all_sources)
    logger.info("Trước: %s", _fmt(before))
    logger.info("Sau  : %s", _fmt(after))
    logger.info(
        "%s %s câu (bỏ qua %s câu không đủ 4 lựa chọn)",
        "Sẽ đổi" if args.dry_run else "Đã đổi",
        changed,
        skipped,
    )
    if args.dry_run:
        logger.info("Chạy lại không có --dry-run để ghi vào DB.")


if __name__ == "__main__":
    main()
