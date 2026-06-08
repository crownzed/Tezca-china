from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import LearningSession, QuizType, Question, UserProgress, Word
from .behavior_service import BehaviorService
from .chinese_metadata_service import ChineseMetadataService
from .event_service import LearningEventService
from .learning_utils import infer_error_tag
from .srs_service import SRSService


MODE_CONFIG = {
    "micro": {"minutes": 5, "limit": 5, "new_count": 0, "label": "Ôn nhanh"},
    "standard": {"minutes": 20, "limit": 10, "new_count": 6, "label": "Học hôm nay"},
    "deep": {"minutes": 45, "limit": 16, "new_count": 8, "label": "Học sâu"},
}


class SessionService:
    def __init__(self, db: Session):
        self.db = db

    def start(
        self,
        user_id: str,
        session_type: str,
        behavior_state: str,
        estimated_minutes: int,
        target_words_json: list[dict],
        target_skills_json: list[str],
        reason: str,
    ) -> LearningSession:
        session = LearningSession(
            user_id=user_id,
            session_type=session_type,
            behavior_state=behavior_state,
            estimated_minutes=estimated_minutes,
            target_words_json=target_words_json,
            target_skills_json=target_skills_json,
            reason=reason,
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def record_event(
        self,
        user_id: str,
        question_id: int,
        selected_index: int,
        confidence: int | None = None,
        latency_ms: int | None = None,
        error_tag: str | None = None,
        session_id: int | None = None,
        item_type: str = "quiz",
    ) -> dict:
        question = self.db.scalar(select(Question).where(Question.id == question_id))
        if not question:
            raise ValueError("question_not_found")

        correct = selected_index == question.correct_index
        resolved_error_tag = infer_error_tag(correct, question.quiz_type, error_tag)
        progress = SRSService(self.db).update_from_answer(user_id, question, correct, confidence, latency_ms)
        event = LearningEventService(self.db).record_quiz_answer(
            user_id,
            question,
            correct,
            confidence,
            latency_ms,
            resolved_error_tag,
            session_id=session_id,
            item_type=item_type,
        )
        self.db.commit()
        self.db.refresh(event)
        return {
            "event_id": event.id,
            "question_id": question.id,
            "correct": correct,
            "correct_index": question.correct_index,
            "explanation": question.explanation or "",
            "error_tag": resolved_error_tag,
            "next_review_at": progress.next_review_at.isoformat() if progress and progress.next_review_at else None,
        }

    def complete(self, user_id: str, session_id: int) -> LearningSession:
        session = self.db.scalar(
            select(LearningSession).where(LearningSession.id == session_id, LearningSession.user_id == user_id)
        )
        if not session:
            raise ValueError("session_not_found")
        session.completed_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(session)
        return session

    def today(self, user_id: str, focus_level: int = 1, mode: str = "standard") -> dict:
        now = datetime.utcnow()
        progress_rows = self.db.scalars(select(UserProgress).where(UserProgress.user_id == user_id)).all()
        answered = sum(row.seen or 0 for row in progress_rows)
        correct = sum(row.correct or 0 for row in progress_rows)
        accuracy = round((correct / answered) * 100) if answered else 0

        due_rows = [row for row in progress_rows if row.seen > 0 and (row.next_review_at is None or row.next_review_at <= now)]
        weak_rows = [row for row in progress_rows if row.seen > 0 and (row.correct or 0) / max(1, row.seen or 1) < 0.6]
        behavior = BehaviorService(self.db).infer(
            user_id=user_id,
            progress_rows=progress_rows,
            due_count=len(due_rows),
            weak_count=len(weak_rows),
            selected_mode=mode,
            now=now,
        )
        effective_mode = "micro" if behavior.force_micro else mode
        config = MODE_CONFIG.get(effective_mode, MODE_CONFIG["standard"])
        block_new = behavior.block_new_words
        new_count = 0 if block_new else config["new_count"]
        quiz_type = self._quiz_type_for_state(behavior.state, len(weak_rows), effective_mode)
        focus_words = self._focus_words(user_id, due_rows, weak_rows, focus_level)
        due_count = min(len(due_rows), config["limit"])
        weak_count = min(len(weak_rows), 8 if effective_mode == "deep" else 5)

        return {
            "session_type": effective_mode,
            "behavior_state": behavior.state,
            "behavior_label": behavior.label,
            "behavior_reason": behavior.reason,
            "nudge": behavior.nudge,
            "force_micro": behavior.force_micro,
            "block_new_words": behavior.block_new_words,
            "reduce_difficulty": behavior.reduce_difficulty,
            "allow_stretch": behavior.allow_stretch,
            "behavior_metrics": {
                "ewma_accuracy": behavior.ewma_accuracy,
                "ewma_confidence": behavior.ewma_confidence,
                "ewma_latency_ms": behavior.ewma_latency_ms,
                "completion_rate": behavior.completion_rate,
                "wrong_streak": behavior.wrong_streak,
            },
            "estimated_minutes": config["minutes"],
            "level": focus_words[0]["level"] if focus_words else focus_level,
            "quiz_type": quiz_type,
            "limit": config["limit"],
            "due_count": due_count,
            "weak_count": weak_count,
            "new_count": new_count,
            "target_skills": [self._skill_for_quiz_type(quiz_type)],
            "focus_words": focus_words,
            "missions": self._missions(answered, accuracy, due_count, weak_count, new_count, focus_words, behavior),
            "reason": behavior.reason or self._reason(answered, due_count, weak_count, new_count, quiz_type),
        }

    def _quiz_type_for_state(self, behavior_state: str, weak_count: int, mode: str) -> QuizType:
        if behavior_state == "ready_deep" or mode == "deep":
            return QuizType.listening
        if weak_count:
            return QuizType.vocab
        return QuizType.vocab

    def _focus_words(self, user_id: str, due_rows: list[UserProgress], weak_rows: list[UserProgress], focus_level: int) -> list[dict]:
        progress_by_word = {row.word_id: row for row in [*due_rows, *weak_rows]}
        word_ids = list(progress_by_word.keys())[:8]
        if not word_ids:
            return []
        words = self.db.scalars(select(Word).where(Word.id.in_(word_ids))).all()
        metadata_service = ChineseMetadataService(self.db)
        rows = []
        for word in words:
            progress = progress_by_word.get(word.id)
            if not progress:
                continue
            metadata = metadata_service.enrich_word(word)
            accuracy = round(((progress.correct or 0) / max(1, progress.seen or 1)) * 100)
            rows.append({
                "word_id": word.id,
                "level": word.hsk_level or focus_level,
                "hanzi": word.hanzi,
                "pinyin": word.pinyin or "",
                "meaning_vi": word.meaning_vi or "",
                "accuracy": accuracy,
                "next_review_at": progress.next_review_at.isoformat() if progress.next_review_at else None,
                "tone_pattern": metadata["tone_pattern"],
                "character_family": metadata["character_family"],
                "component_hint": metadata["component_hint"],
                "collocations": metadata["collocations"],
                "confusable_words": metadata["confusable_words"],
                "topic": metadata["topic"],
                "frequency_band": metadata["frequency_band"],
            })
        self.db.commit()
        return sorted(rows, key=lambda item: (item["accuracy"], item["level"]))[:6]

    def _missions(self, answered: int, accuracy: int, due_count: int, weak_count: int, new_count: int, focus_words: list[dict], behavior) -> list[dict]:
        return [
            {
                "key": "due",
                "label": "Cần ôn",
                "value": f"{due_count} mục" if answered else "Tạo nền",
                "detail": "Ưu tiên phần dễ quên trước khi thêm mới." if answered else "Bắt đầu bằng phiên nhẹ để tạo dữ liệu.",
                "tone": "gold",
            },
            {
                "key": "repair",
                "label": "Sửa lỗi",
                "value": f"{weak_count} từ" if weak_count else "Chưa có",
                "detail": ", ".join(item["hanzi"] for item in focus_words[:3]) if weak_count else "Lỗi sai sẽ được gom tại đây sau mỗi phiên.",
                "tone": "cinnabar" if weak_count else "jade",
            },
            {
                "key": "new",
                "label": "Từ mới",
                "value": f"{new_count} từ" if new_count else "Tạm khóa",
                "detail": "Thêm từ mới vừa sức." if new_count else "Phiên ngắn hoặc còn nhiều mục cần ôn.",
                "tone": "jade" if new_count else "blue",
            },
            {
                "key": "stability",
                "label": "Trạng thái",
                "value": behavior.label,
                "detail": behavior.nudge,
                "tone": "jade" if behavior.state in {"ready_deep", "maintenance"} else "gold" if behavior.state in {"ready_short", "habit_building", "returning"} else "cinnabar",
            },
        ]

    def _reason(self, answered: int, due_count: int, weak_count: int, new_count: int, quiz_type: QuizType) -> str:
        if not answered:
            return "Chưa đủ dữ liệu, nên bắt đầu bằng phiên nhẹ để tạo đường chuẩn."
        if due_count and not new_count:
            return "Còn từ đến hạn, hệ thống tạm khóa từ mới để bảo vệ trí nhớ."
        if weak_count:
            return "Có nhóm từ độ chính xác thấp, nên ưu tiên sửa lỗi trước."
        return f"Nền ổn định, có thể luyện {quiz_type.value} và thêm từ mới vừa sức."

    def _skill_for_quiz_type(self, quiz_type: QuizType) -> str:
        if quiz_type in (QuizType.listening, QuizType.dialogue):
            return "listening"
        if quiz_type in (QuizType.reading, QuizType.translation, QuizType.cloze):
            return "context"
        return "recognition"
