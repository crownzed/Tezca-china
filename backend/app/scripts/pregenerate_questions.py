"""Pre-generate a diverse question bank for all levels and quiz types.

Run at startup to ensure every level+type has a usable baseline of questions.

Chỉ đảm bảo NGƯỠNG SÀN (``TARGET_PER_TYPE`` câu mỗi cấp/dạng) để app chạy được
ngay sau khi seed. Muốn bank phủ TOÀN BỘ từ vựng của từng cấp thì chạy
``python -m app.scripts.cover_hsk_vocab`` — script đó lấy coverage theo TỪ làm
mục tiêu, còn hàm này chỉ đếm số câu.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models import QuizType

logger = logging.getLogger(__name__)

ALL_QUIZ_TYPES = [
    QuizType.vocab,
    QuizType.listening,
    QuizType.cloze,
    QuizType.translation,
    QuizType.drag_drop,
    QuizType.reading,
    QuizType.dialogue,
]

TARGET_PER_TYPE = 20  # questions per quiz_type per level


def pregenerate_questions(db: Session) -> dict[str, int]:
    """Ensure every level+type has at least TARGET_PER_TYPE questions."""
    from ..services.question_generator import QuestionGeneratorService

    gen = QuestionGeneratorService(db)
    stats = {}

    for level in range(1, 7):  # HSK 1-6
        for quiz_type in ALL_QUIZ_TYPES:
            key = f"HSK{level}_{quiz_type.value}"
            try:
                questions = gen.ensure_questions(level, quiz_type, TARGET_PER_TYPE)
                db.commit()
                stats[key] = len(questions)
            except Exception as exc:
                logger.warning(f"Skip {key}: {exc}")
                db.rollback()
                stats[key] = 0

    total = sum(stats.values())
    logger.info(f"Question bank: {total} questions across {len(stats)} type×level combos")
    return stats
