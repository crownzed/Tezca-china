"""Nâng cấp ngân hàng câu hỏi trong DB bằng LLM, không đổi runtime quiz.

Chạy từ thư mục backend:
  python -m app.scripts.upgrade_quiz_bank_ai --levels 1 2 3 4 5 6 --count 20
"""

import argparse
import logging
import sys

from sqlalchemy import func, select

from ..db import SessionLocal
from ..models import Question, QuizType, Word
from ..services.exam_passage_service import (
    QUESTION_SUBTYPE_GUIDED_CLOZE,
    QUESTION_SUBTYPE_READING_COMP,
)
from ..services.llm_generator_service import API_QUIZ_TYPES, _validate_api_quiz_question, generate_quiz_bundle_for_hsk
from ..settings import settings

logger = logging.getLogger(__name__)
SOURCE = "ai_bank_upgrade_llm"

# question_subtype gắn cho câu do script này ghi vào bank. cloze/reading dùng
# subtype của ngân hàng đoạn văn chuẩn đề thi (选词填空 / 阅读理解) vì prompt LLM
# trong llm_generator_service đã được nâng lên đúng khuôn đó.
SUBTYPES = {
    "vocab": "meaning",
    "listening": "sentence",
    "reading": QUESTION_SUBTYPE_READING_COMP,
    "translation": "paragraph",
    "cloze": QUESTION_SUBTYPE_GUIDED_CLOZE,
    "drag_drop": "drag_drop",
}


def source_count(level: int, quiz_type: str) -> int:
    with SessionLocal() as db:
        rows = db.scalars(
            select(Question).where(Question.level == level, Question.quiz_type == QuizType(quiz_type))
        ).all()
        return sum(1 for row in rows if (row.metadata_json or {}).get("source") == SOURCE)


def audit_bank(levels: list[int], quiz_types: list[str]) -> tuple[int, list[str]]:
    errors: list[str] = []
    checked = 0
    with SessionLocal() as db:
        rows = db.scalars(
            select(Question).where(Question.level.in_(levels), Question.quiz_type.in_([QuizType(t) for t in quiz_types]))
        ).all()
        for row in rows:
            if (row.metadata_json or {}).get("source") != SOURCE:
                continue
            payload = {
                "target_hanzi": (row.metadata_json or {}).get("target_hanzi", ""),
                "prompt": row.prompt,
                "options": row.options,
                "correct_index": row.correct_index,
                "explanation": row.explanation,
                "audio_text": row.audio_text,
                "metadata": row.metadata_json or {},
            }
            ok, reason = _validate_api_quiz_question(payload, row.quiz_type.value)
            checked += 1
            if not ok:
                errors.append(f"question_id={row.id}: {reason}")
    return checked, errors


def upgrade_bundle(level: int, distribution: dict[str, int]) -> tuple[int, int]:
    """Sinh nhiều loại trong một API call và ghi atomically vào DB."""
    with SessionLocal() as db:
        words = db.scalars(
            select(Word).where(Word.hsk_level == level).order_by(func.random()).limit(40)
        ).all()
        if not words:
            logger.warning("HSK %s không có từ trong DB", level)
            return 0, 0

        vocabulary = [
            {
                "hanzi": word.hanzi,
                "pinyin": word.pinyin,
                "meaning_vi": word.meaning_vi,
                "pos": word.pos,
            }
            for word in words
        ]
        word_by_hanzi = {word.hanzi: word for word in words}
        # Prompt đã có trong bank cho đúng các dạng đang xin. Relay trả output
        # gần tất định với cùng input, nên không gửi kèm danh sách này thì lượt
        # sau sinh lại y nguyên câu cũ -> reused=100%, bank không bao giờ đủ.
        avoid = db.scalars(
            select(Question.prompt)
            .where(
                Question.level == level,
                Question.quiz_type.in_([QuizType(kind) for kind in distribution]),
            )
            .order_by(Question.id.desc())
            .limit(24)
        ).all()
        result = generate_quiz_bundle_for_hsk(
            level, distribution, vocabulary, avoid_prompts=list(avoid)
        )
        created = reused = 0

        for row in result["questions"]:
            quiz_type = str(row["quiz_type"])
            prompt = str(row["prompt"]).strip()
            existing = db.scalar(
                select(Question).where(
                    Question.level == level,
                    Question.quiz_type == QuizType(quiz_type),
                    Question.prompt == prompt,
                )
            )
            if existing:
                reused += 1
                continue

            target = str(row.get("target_hanzi", "")).strip()
            word = word_by_hanzi.get(target)
            metadata = dict(row.get("metadata") or {})
            metadata.update(
                {
                    "source": SOURCE,
                    "generator": settings.llm_model_effective,
                    "hsk_level": level,
                    "target_hanzi": target,
                    "question_subtype": SUBTYPES[quiz_type],
                    "option_word_ids": [
                        word.id if word and index == row["correct_index"] else None
                        for index in range(4)
                    ],
                }
            )
            db.add(
                Question(
                    word_id=word.id if word else None,
                    level=level,
                    quiz_type=QuizType(quiz_type),
                    prompt=prompt,
                    options=[str(option).strip() for option in row["options"]],
                    correct_index=row["correct_index"],
                    explanation=str(row["explanation"]).strip(),
                    audio_text=str(row.get("audio_text", "")).strip(),
                    metadata_json=metadata,
                )
            )
            created += 1

        db.commit()
        return created, reused


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch nâng cấp question bank bằng API")
    parser.add_argument("--levels", nargs="+", type=int, default=[1, 2, 3, 4, 5, 6])
    parser.add_argument("--types", nargs="+", default=sorted(API_QUIZ_TYPES))
    parser.add_argument("--count", type=int, default=20, help="Số câu mỗi level/type (1-20)")
    args = parser.parse_args()

    invalid_levels = [level for level in args.levels if level not in range(1, 7)]
    invalid_types = [kind for kind in args.types if kind not in API_QUIZ_TYPES]
    if invalid_levels or invalid_types:
        parser.error(f"Giá trị không hợp lệ: levels={invalid_levels}, types={invalid_types}")
    if not 1 <= args.count <= 20:
        parser.error("--count phải trong khoảng 1..20")
    if not settings.llm_keys_list:
        parser.error("Chưa cấu hình GEMINI_API_KEYS trong environment")

    log_file = logging.FileHandler("quiz-bank-progress.log", encoding="utf-8")
    log_file.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), log_file],
        force=True,
    )
    total_created = total_reused = 0
    total_failed = 0
    # 2 dạng × 5 câu giữ response đủ nhỏ cho relay, nhưng vẫn gộp nhiều câu
    # trong một lượt và giảm đáng kể overhead so với gọi từng câu.
    bundle_size = 2
    per_call = min(args.count, 5)
    bundles = [args.types[i:i + bundle_size] for i in range(0, len(args.types), bundle_size)]
    total_jobs = len(args.levels) * len(bundles) * ((args.count + per_call - 1) // per_call)
    job = 0
    for level in args.levels:
        for kinds in bundles:
            failures = 0
            while True:
                remaining = {kind: max(0, args.count - source_count(level, kind)) for kind in kinds}
                distribution = {kind: min(per_call, count) for kind, count in remaining.items() if count > 0}
                if not distribution:
                    break
                job += 1
                logger.info("[%s/%s] HSK%s bundle %s...", job, total_jobs, level, distribution)
                try:
                    created, reused = upgrade_bundle(level, distribution)
                except Exception as exc:
                    failures += 1
                    total_failed += 1
                    logger.error("HSK%s bundle %s THẤT BẠI (%s/3): %s", level, distribution, failures, exc)
                    if failures >= 3:
                        logger.error("Bỏ qua bundle sau 3 lần lỗi liên tiếp để tiếp tục phần còn lại.")
                        break
                    continue
                # created == 0 nghĩa là lượt gọi không thêm được row nào (mọi câu
                # trùng prompt đã có, hoặc chỉ dạng khác trong bundle được lấp).
                # Không raise nên phải tự đếm: nếu ``remaining`` vẫn > 0 mà lượt
                # nào cũng không tiến triển thì vòng while sẽ quay vô hạn.
                if created == 0:
                    failures += 1
                    logger.warning(
                        "HSK%s bundle %s không thêm được câu mới (%s/3)",
                        level, distribution, failures,
                    )
                    if failures >= 3:
                        logger.error("Bỏ qua bundle sau 3 lượt không tiến triển.")
                        break
                else:
                    failures = 0
                total_created += created
                total_reused += reused
                completed = sum(min(args.count, source_count(lvl, kind)) for lvl in args.levels for kind in args.types)
                target = len(args.levels) * len(args.types) * args.count
                percent = round(completed * 100 / target)
                logger.info("[%s%%] HSK%s bundle xong: created=%s reused=%s; tổng=%s/%s", percent, level, created, reused, completed, target)
    checked, audit_errors = audit_bank(args.levels, args.types)
    logger.info("Audit DB: checked=%s valid=%s invalid=%s", checked, checked - len(audit_errors), len(audit_errors))
    for error in audit_errors[:20]:
        logger.error("AUDIT %s", error)
    logger.info("Hoàn tất: created=%s reused=%s failed_batches=%s", total_created, total_reused, total_failed)


if __name__ == "__main__":
    main()
