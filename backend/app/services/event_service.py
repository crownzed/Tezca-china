from sqlalchemy.orm import Session

from ..models import LearningEvent, Question, Word
from .enrichment_service import classify_error
from .learning_utils import infer_error_tag, prompt_modality_for_quiz_type, skill_for_quiz_type


def _word_payload(word: Word | None) -> dict:
    if not word:
        return {}
    return {
        "hanzi": word.hanzi,
        "pinyin": word.pinyin,
        "meaning_vi": word.meaning_vi,
        "meaning_en": word.meaning_en,
    }


class LearningEventService:
    def __init__(self, db: Session):
        self.db = db

    def _selected_word(self, question: Question, selected_index: int | None) -> Word | None:
        """Suy ra Word đứng sau đáp án người học chọn, qua map đã lưu khi sinh câu."""
        if selected_index is None:
            return None
        meta = question.metadata_json or {}
        option_word_ids = meta.get("option_word_ids") or []
        if not (0 <= selected_index < len(option_word_ids)):
            return None
        wid = option_word_ids[selected_index]
        if wid is None:
            return None
        return self.db.get(Word, wid)

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
        selected_index: int | None = None,
    ) -> LearningEvent:
        skill = skill_for_quiz_type(question.quiz_type)
        error_detail: dict = {}
        if correct:
            resolved_error_tag = error_tag or ""
        elif error_tag:
            # Tag do client cung cấp được tôn trọng (vd lỗi production).
            resolved_error_tag = error_tag
        else:
            selected_word = self._selected_word(question, selected_index)
            classified = classify_error(
                _word_payload(question.word),
                _word_payload(selected_word),
                skill=skill,
            )
            resolved_error_tag = classified["error_tag"]
            error_detail = {
                k: v for k, v in classified.items() if k != "error_tag" and v
            }
        event = LearningEvent(
            user_id=user_id,
            word_id=question.word_id,
            question_id=question.id,
            session_id=session_id,
            item_type=item_type,
            skill=skill,
            prompt_modality=prompt_modality_for_quiz_type(question.quiz_type),
            response_modality="choice",
            correct=1 if correct else 0,
            confidence=confidence,
            latency_ms=latency_ms,
            error_tag=resolved_error_tag,
            error_detail=error_detail,
        )
        self.db.add(event)
        return event
