from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import LearningEvent, UserProgress, Word


class OutputService:
    def __init__(self, db: Session):
        self.db = db

    def submit(
        self,
        user_id: str,
        response_text: str,
        target_word: str,
        session_id: int | None = None,
        word_id: int | None = None,
        prompt: str = "",
    ) -> dict:
        word = self._resolve_word(word_id, target_word)
        normalized = (response_text or "").strip()
        target = target_word or (word.hanzi if word else "")
        assessment = self._assess_output(normalized, target)
        contains_target = assessment["used_target"]
        enough_context = assessment["enough_context"]
        score = assessment["score"]
        correct = assessment["correct"]
        error_tag = "" if correct else assessment["error_tag"]
        progress = self._update_production_progress(user_id, word, correct, error_tag)

        event = LearningEvent(
            user_id=user_id,
            word_id=word.id if word else None,
            question_id=None,
            session_id=session_id,
            item_type="guided_output",
            skill="production",
            prompt_modality="text",
            response_modality="text",
            correct=1 if correct else 0,
            confidence=None,
            latency_ms=None,
            error_tag=error_tag,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)

        return {
            "event_id": event.id,
            "correct": correct,
            "score": score,
            "target_word": target or "",
            "used_target": contains_target,
            "production_score": progress.production_score if progress else score,
            "feedback": self._feedback(correct, contains_target, enough_context, target, assessment),
            "next_practice_at": progress.next_review_at.isoformat() if progress and progress.next_review_at else None,
        }

    def _assess_output(self, text: str, target: str | None) -> dict:
        target = target or ""
        chinese_chars = [char for char in text if "\u3400" <= char <= "\u9fff"]
        chinese_only = "".join(chinese_chars)
        contains_target = bool(target and target in text)
        enough_context = len(chinese_chars) >= max(4, len(target) + 2)
        has_sentence_shape = any(mark in text for mark in "。！？!?") or len(chinese_chars) >= max(6, len(target) + 4)
        only_target = bool(target and chinese_only == target)
        score = min(
            100,
            (45 if contains_target else 0)
            + (15 if chinese_chars else 0)
            + (22 if enough_context else 0)
            + (10 if has_sentence_shape else 0)
            + (8 if not any(char.isascii() and char.isalpha() for char in text) or len(chinese_chars) >= 4 else 0),
        )
        error_tag = "production_error"
        if not text:
            error_tag = "empty_output"
        elif not chinese_chars:
            error_tag = "script_error"
        elif not contains_target:
            error_tag = "missing_target"
        elif only_target or not enough_context:
            error_tag = "context_too_short"
        elif not has_sentence_shape:
            error_tag = "sentence_shape"
        return {
            "correct": contains_target and bool(chinese_chars) and enough_context and has_sentence_shape and not only_target,
            "score": score,
            "used_target": contains_target,
            "enough_context": enough_context,
            "has_sentence_shape": has_sentence_shape,
            "only_target": only_target,
            "error_tag": error_tag,
        }

    def _resolve_word(self, word_id: int | None, target_word: str) -> Word | None:
        if word_id:
            word = self.db.scalar(select(Word).where(Word.id == word_id))
            if word:
                return word
        if target_word:
            return self.db.scalar(select(Word).where(Word.hanzi == target_word).limit(1))
        return None

    def _update_production_progress(self, user_id: str, word: Word | None, correct: bool, error_tag: str) -> UserProgress | None:
        if not word:
            return None
        progress = self.db.scalar(
            select(UserProgress).where(UserProgress.user_id == user_id, UserProgress.word_id == word.id)
        )
        if not progress:
            progress = UserProgress(user_id=user_id, word_id=word.id, seen=0, correct=0, wrong=0, mastery=0)
            self.db.add(progress)
        current = int(progress.production_score or 0)
        progress.production_score = max(0, min(100, current + (16 if correct else -12)))
        if not correct:
            errors = dict(progress.error_json or {})
            errors[error_tag] = int(errors.get(error_tag, 0)) + 1
            progress.error_json = errors
            if not progress.next_review_at or progress.next_review_at > datetime.utcnow() + timedelta(days=1):
                progress.next_review_at = datetime.utcnow() + timedelta(days=1)
        progress.last_seen_at = datetime.utcnow()
        return progress

    def _feedback(self, correct: bool, contains_target: bool, enough_context: bool, target: str | None, assessment: dict) -> str:
        if correct:
            return f"Đã dùng {target} trong câu tiếng Trung có ngữ cảnh. Production score tăng."
        if not contains_target:
            return f"Câu chưa dùng từ mục tiêu {target}. Từ này sẽ quay lại ở production practice."
        if assessment.get("only_target") or not enough_context:
            return f"Mới có {target}, chưa thành câu. Hãy thêm chủ ngữ, hành động hoặc tình huống."
        if not assessment.get("has_sentence_shape"):
            return "Câu còn cụt, hãy thêm kết thúc câu hoặc ngữ cảnh rõ hơn."
        return "Câu còn quá ngắn, hãy đặt vào một tình huống rõ hơn."
