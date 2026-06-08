from sqlalchemy.orm import Session

from ..models import LearningEvent, Question
from .learning_utils import infer_error_tag, prompt_modality_for_quiz_type, skill_for_quiz_type


class LearningEventService:
    def __init__(self, db: Session):
        self.db = db

    def record_quiz_answer(
        self,
        user_id: str,
        question: Question,
        correct: bool,
        confidence: int | None = None,
        latency_ms: int | None = None,
        error_tag: str | None = None,
        session_id: int | None = None,
        item_type: str = "quiz",
    ) -> LearningEvent:
        inferred_error_tag = infer_error_tag(correct, question.quiz_type, error_tag)
        event = LearningEvent(
            user_id=user_id,
            word_id=question.word_id,
            question_id=question.id,
            session_id=session_id,
            item_type=item_type,
            skill=skill_for_quiz_type(question.quiz_type),
            prompt_modality=prompt_modality_for_quiz_type(question.quiz_type),
            response_modality="choice",
            correct=1 if correct else 0,
            confidence=confidence,
            latency_ms=latency_ms,
            error_tag=inferred_error_tag,
        )
        self.db.add(event)
        return event
