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
from ..settings import NO_LLM_KEY_MESSAGE, settings

logger = logging.getLogger(__name__)
SOURCE = "ai_bank_upgrade_llm"

# Trần cho ``--count`` (số câu mỗi cặp level/type). Trước đây là 20 và bank đã
# chạm đúng mốc đó ở cả 36 cặp, nên không thể xây thêm mà không nới trần. Đây
# chỉ là giới hạn của script batch: mỗi lượt gọi LLM vẫn tối đa 5 câu/dạng
# (``per_call``), và vòng lặp dừng ngay khi cặp nào đã đủ ``--count``.
MAX_COUNT = 200

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


def source_counts(levels: list[int], quiz_types: list[str]) -> dict[tuple[int, str], int]:
    """Đếm câu do script này sinh, cho MỌI cặp (level, type) trong một query.

    Trước đây mỗi cặp là một lần ``select(Question)`` tải full ORM object rồi
    đếm trong Python; vòng lặp chính gọi lại cho cả 36 cặp sau mỗi bundle nên
    chi phí tăng theo (số bundle × số cặp × kích thước bank). Ở đây chỉ lấy 3
    cột cần thiết và trả về toàn bộ bảng đếm một lượt.

    ``source`` nằm trong ``metadata_json`` nên vẫn phải lọc ở Python: filter
    JSON trong SQL không portable giữa SQLite (local) và Turso (mirror).
    """
    counts = {(level, kind): 0 for level in levels for kind in quiz_types}
    if not levels or not quiz_types:
        return counts
    with SessionLocal() as db:
        rows = db.execute(
            select(Question.level, Question.quiz_type, Question.metadata_json).where(
                Question.level.in_(levels),
                Question.quiz_type.in_([QuizType(kind) for kind in quiz_types]),
            )
        ).all()
    for level, quiz_type, metadata in rows:
        if (metadata or {}).get("source") != SOURCE:
            continue
        key = (level, quiz_type.value if hasattr(quiz_type, "value") else str(quiz_type))
        if key in counts:
            counts[key] += 1
    return counts


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
        # Nội dung đã có trong bank cho đúng các dạng đang xin. Relay trả output
        # gần tất định với cùng input, nên không gửi kèm danh sách này thì lượt
        # sau sinh lại y nguyên câu cũ -> reused=100%, bank không bao giờ đủ.
        #
        # Với listening phải gửi ``audio_text``, không phải ``prompt``: prompt của
        # nó chỉ là câu lệnh chung chung ("Nghe và chọn nghĩa đúng") vì spec cấm
        # lộ câu cần nghe. Gửi prompt thì model nhận được danh sách 24 câu lệnh
        # gần trùng nhau và không biết ĐÃ sinh những câu nghe nào — đúng phần
        # thông tin cần để tránh lặp thì bị bỏ mất.
        avoid_rows = db.execute(
            select(Question.quiz_type, Question.prompt, Question.audio_text)
            .where(
                Question.level == level,
                Question.quiz_type.in_([QuizType(kind) for kind in distribution]),
            )
            .order_by(Question.id.desc())
            .limit(24)
        ).all()
        avoid = []
        for quiz_type_value, existing_prompt, existing_audio in avoid_rows:
            kind = quiz_type_value.value if hasattr(quiz_type_value, "value") else str(quiz_type_value)
            text = existing_audio if kind == "listening" and existing_audio else existing_prompt
            if text and str(text).strip():
                avoid.append(str(text).strip())
        result = generate_quiz_bundle_for_hsk(
            level, distribution, vocabulary, avoid_prompts=list(avoid)
        )
        # ``_quality`` chứa lý do loại từng câu, nhưng generator chỉ raise khi
        # CẢ bundle rỗng. Bundle chấp nhận một phần (5 hợp lệ / 5 bị loại) vẫn
        # báo thành công, nên không log ở đây thì không có cách nào biết dạng
        # nào đang bị loại và vì sao — chỉ thấy created thấp hơn mong đợi.
        quality = result.get("_quality") or {}
        if quality.get("rejected"):
            logger.warning(
                "HSK%s bundle loại %s/%s câu; thiếu=%s; lý do=%s",
                level,
                quality["rejected"],
                quality["rejected"] + quality.get("accepted", 0),
                quality.get("missing") or {},
                quality.get("reasons") or [],
            )
        created = reused = 0
        # Khóa trùng của các row ghi trong CHÍNH lượt này. Truy vấn ``existing``
        # dưới đây chỉ thấy row đã commit (autoflush=False), nên 5 câu listening
        # cùng bundle dùng chung một prompt chung chung sẽ lọt hết vào DB.
        seen_in_batch: set[tuple[str, str]] = set()

        for row in result["questions"]:
            quiz_type = str(row["quiz_type"])
            prompt = str(row["prompt"]).strip()
            audio_text = str(row.get("audio_text", "")).strip()
            # listening cố ý KHÔNG đặt nội dung vào prompt (spec cấm lộ câu cần
            # nghe), nên prompt chỉ là câu lệnh chung chung: "Nghe và chọn nghĩa
            # đúng". Khóa theo prompt vừa cho trùng trong cùng bundle, vừa loại
            # oan câu mới ở lượt sau — đo trên bank: 200 câu listening chỉ có
            # 135 prompt khác nhau nhưng 200 audio_text khác nhau, và 136/200 sẽ
            # bị chặn oan. Với listening, danh tính câu hỏi là audio_text.
            by_audio = quiz_type == "listening" and bool(audio_text)
            identity = audio_text if by_audio else prompt
            if (quiz_type, identity) in seen_in_batch:
                reused += 1
                continue
            column = Question.audio_text if by_audio else Question.prompt
            existing = db.scalar(
                select(Question.id).where(
                    Question.level == level,
                    Question.quiz_type == QuizType(quiz_type),
                    column == identity,
                )
            )
            if existing:
                reused += 1
                continue
            seen_in_batch.add((quiz_type, identity))

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
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help=f"Số câu mỗi level/type (1-{MAX_COUNT})",
    )
    args = parser.parse_args()

    invalid_levels = [level for level in args.levels if level not in range(1, 7)]
    invalid_types = [kind for kind in args.types if kind not in API_QUIZ_TYPES]
    if invalid_levels or invalid_types:
        parser.error(f"Giá trị không hợp lệ: levels={invalid_levels}, types={invalid_types}")
    if not 1 <= args.count <= MAX_COUNT:
        parser.error(f"--count phải trong khoảng 1..{MAX_COUNT}")
    if not settings.llm_keys_list:
        # Nêu đủ ba biến theo đúng thứ tự ưu tiên: chỉ dặn GEMINI_API_KEYS thì
        # người chạy đặt vào nhánh dự phòng, còn StepFun vẫn là nhánh được chọn.
        parser.error(NO_LLM_KEY_MESSAGE)

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
                # MỘT query lấy bảng đếm cho mọi (level, type): dùng cho cả
                # ``remaining`` của bundle này và dòng tiến độ tổng ở cuối vòng,
                # thay cho 1 + 36 lần scan bảng như trước.
                counts = source_counts(args.levels, args.types)
                remaining = {kind: max(0, args.count - counts[(level, kind)]) for kind in kinds}
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
                # counts đọc ở đầu vòng nên chưa gồm ``created`` vừa ghi; cộng
                # bù để dòng tiến độ không tụt lại một bundle so với DB.
                completed = min(
                    len(args.levels) * len(args.types) * args.count,
                    sum(min(args.count, value) for value in counts.values()) + created,
                )
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
