"""Phủ bank câu hỏi lên TOÀN BỘ từ vựng HSK của từng cấp.

Chạy từ thư mục backend:
    python -m app.scripts.cover_hsk_vocab --report
    python -m app.scripts.cover_hsk_vocab --dry-run
    python -m app.scripts.cover_hsk_vocab
    python -m app.scripts.cover_hsk_vocab --level 5 --level 6 --type vocab

Vấn đề script này giải quyết: ``pregenerate_questions`` chỉ đảm bảo MỖI
(cấp, dạng) có ít nhất ``TARGET_PER_TYPE`` câu, không quan tâm các câu đó thuộc
từ nào. Cộng thêm việc pool nguồn cũ dùng ``limit(n)`` không kèm ``order by``
(luôn trả n từ đầu bảng theo primary key), bank thực tế chỉ bám vào phần đầu bộ
từ mỗi cấp: HSK5 có 1.734 từ nhưng chỉ ~230 từ từng xuất hiện trong câu hỏi.

Ở đây coverage (số TỪ được phủ) mới là mục tiêu: mỗi vòng gọi
``QuestionGeneratorService.ensure_coverage`` để sinh câu cho các từ chưa có câu
nào ở dạng đó, lặp tới khi hết từ hoặc hết tiến triển.

Idempotent + resumable: chạy lại chỉ nhặt phần còn thiếu (không tạo trùng), nên
có thể dừng giữa chừng rồi chạy tiếp. Không gọi LLM — chỉ dùng template engine
sẵn có, nên không tốn quota.

Lưu ý về mẫu số: cloze/drag_drop cần câu ví dụ CHỨA chính từ đích,
translation/dialogue cần cặp câu CN-VI. Từ chưa có ví dụ phù hợp KHÔNG thể phủ ở
các dạng đó — hãy chạy ``app.scripts.enrich_examples`` trước để mở rộng pool ví
dụ. Cột "phủ được" trong báo cáo chính là mẫu số thực tế này.
"""

from __future__ import annotations

import argparse
import logging
import sys

from ..db import SessionLocal
from ..models import QuizType
from ..services.question_generator import QuestionGeneratorService

logger = logging.getLogger(__name__)

LEVELS = (1, 2, 3, 4, 5, 6)

# Các dạng sinh được từ template per-word. Bỏ voice (tự đánh giá, không có đáp
# án đúng để phủ theo từ) và các dạng chưa có generator (error_fix, matching,
# reading_comp) — chúng không đi qua ``_get_or_create_question``.
COVERABLE_TYPES = (
    QuizType.vocab,
    QuizType.listening,
    QuizType.cloze,
    QuizType.translation,
    QuizType.drag_drop,
    QuizType.reading,
    QuizType.dialogue,
)

BATCH = 200  # số từ mỗi vòng: đủ lớn để đi nhanh, đủ nhỏ để commit thường xuyên
MAX_PASSES = 40  # trần vòng lặp mỗi (cấp, dạng) — chặn treo khi hết tiến triển


def _parse_types(values: list[str] | None) -> tuple[QuizType, ...]:
    if not values:
        return COVERABLE_TYPES
    chosen: list[QuizType] = []
    for value in values:
        try:
            quiz_type = QuizType(value)
        except ValueError:
            raise SystemExit(f"Dạng không hợp lệ: {value}. Hợp lệ: {', '.join(t.value for t in COVERABLE_TYPES)}")
        if quiz_type not in COVERABLE_TYPES:
            raise SystemExit(f"Dạng {value} không sinh được theo từ (không có template per-word).")
        chosen.append(quiz_type)
    return tuple(chosen)


def report(levels: tuple[int, ...], types: tuple[QuizType, ...]) -> None:
    """In bảng coverage hiện tại: đã phủ / phủ được, theo (cấp, dạng)."""
    with SessionLocal() as db:
        gen = QuestionGeneratorService(db)
        for level in levels:
            logger.info("HSK %s", level)
            for quiz_type in types:
                done, total = gen.coverage(level, quiz_type)
                pct = round(done * 100 / total) if total else 0
                logger.info("  %-12s %5d / %-5d (%3d%%)", quiz_type.value, done, total, pct)


def cover(levels: tuple[int, ...], types: tuple[QuizType, ...], dry_run: bool) -> int:
    """Phủ bank cho từng (cấp, dạng); trả về tổng số từ được phủ thêm."""
    grand = 0
    for level in levels:
        for quiz_type in types:
            with SessionLocal() as db:
                gen = QuestionGeneratorService(db)
                done, total = gen.coverage(level, quiz_type)
            missing = max(0, total - done)
            if not missing:
                logger.info("HSK%s %-12s đã phủ đủ %s từ.", level, quiz_type.value, total)
                continue
            if dry_run:
                logger.info(
                    "HSK%s %-12s sẽ phủ thêm tối đa %s từ (hiện %s/%s).",
                    level, quiz_type.value, missing, done, total,
                )
                continue

            added_here = 0
            for pass_no in range(1, MAX_PASSES + 1):
                # Session mới mỗi vòng: cache Example/pool trong service chỉ hữu
                # ích trong một lô, giữ mãi sẽ phình RAM khi đi qua ngàn từ.
                with SessionLocal() as db:
                    added = QuestionGeneratorService(db).ensure_coverage(level, quiz_type, BATCH)
                if not added:
                    logger.info(
                        "HSK%s %-12s hết tiến triển ở vòng %s (các từ còn lại không sinh được câu).",
                        level, quiz_type.value, pass_no,
                    )
                    break
                added_here += added
                logger.info(
                    "HSK%s %-12s vòng %s: +%s từ (tổng +%s)",
                    level, quiz_type.value, pass_no, added, added_here,
                )

            with SessionLocal() as db:
                done_after, total_after = QuestionGeneratorService(db).coverage(level, quiz_type)
            pct = round(done_after * 100 / total_after) if total_after else 0
            logger.info(
                "HSK%s %-12s xong: %s/%s từ (%s%%), +%s từ lần này.",
                level, quiz_type.value, done_after, total_after, pct, added_here,
            )
            grand += added_here
    return grand


def main() -> None:
    parser = argparse.ArgumentParser(description="Phủ bank câu hỏi lên toàn bộ từ vựng HSK theo từng cấp")
    parser.add_argument("--level", type=int, action="append", choices=LEVELS, help="Chỉ xử lý cấp này (lặp được)")
    parser.add_argument("--type", action="append", help="Chỉ xử lý dạng này (lặp được)")
    parser.add_argument("--report", action="store_true", help="Chỉ in bảng coverage rồi thoát")
    parser.add_argument("--dry-run", action="store_true", help="Báo cáo phần còn thiếu, không ghi DB")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout, force=True)

    levels = tuple(dict.fromkeys(args.level)) if args.level else LEVELS
    types = _parse_types(args.type)

    if args.report:
        report(levels, types)
        return

    total_added = cover(levels, types, args.dry_run)
    if args.dry_run:
        logger.info("Dry-run: chạy lại không có --dry-run để ghi vào DB.")
        return
    logger.info("TỔNG: phủ thêm %s từ.", total_added)
    logger.info("Bảng coverage sau khi chạy:")
    report(levels, types)


if __name__ == "__main__":
    main()
