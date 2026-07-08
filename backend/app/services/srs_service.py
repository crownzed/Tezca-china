from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Question, UserProgress
from .learning_utils import skill_for_quiz_type


class SRSService:
    def __init__(self, db: Session):
        self.db = db

    def update_from_answer(
        self,
        user_id: str,
        question: Question,
        correct: bool,
        confidence: int | None = None,
        latency_ms: int | None = None,
    ) -> UserProgress | None:
        if not question.word_id:
            return None
        progress = self.db.scalar(
            select(UserProgress).where(UserProgress.user_id == user_id, UserProgress.word_id == question.word_id)
        )
        if not progress:
            progress = UserProgress(user_id=user_id, word_id=question.word_id, seen=0, correct=0, wrong=0, mastery=0)
            self.db.add(progress)

        seen_before = progress.seen or 0
        progress.seen = seen_before + 1
        progress.correct = (progress.correct or 0) + (1 if correct else 0)
        progress.wrong = (progress.wrong or 0) + (0 if correct else 1)
        progress.last_seen_at = datetime.utcnow()

        quality = self._quality(correct, confidence, latency_ms)
        self._update_interval(progress, quality)
        self._update_skill_score(progress, skill_for_quiz_type(question.quiz_type), correct)
        self._update_confidence_latency(progress, seen_before, confidence, latency_ms)

        raw_mastery = max(0, (progress.mastery or 0) + (12 if correct else -18))
        progress.mastery = min(self._mastery_cap(progress), raw_mastery)
        return progress

    def _quality(self, correct: bool, confidence: int | None, latency_ms: int | None) -> int:
        confidence = max(1, min(4, int(confidence or (3 if correct else 1))))
        if not correct:
            return 1 if confidence >= 3 else 2
        if confidence <= 2:
            return 3
        if confidence >= 4 and (latency_ms is None or latency_ms <= 5000):
            return 5
        return 4

    def _update_interval(self, progress: UserProgress, quality: int) -> None:
        ease = float(progress.ease or 2.5)
        repetition = int(progress.repetition or 0)
        interval = int(progress.interval_days or 0)

        if quality < 3:
            repetition = 0
            interval = 1
            progress.lapses = (progress.lapses or 0) + 1
        else:
            if repetition == 0:
                interval = 3 if quality == 5 else 1
            elif repetition == 1:
                # Kế thừa interval rep0 (nhân ease) thay vì hardcode 3, để bonus
                # quality-5 ở rep0 (interval=3) không bị xóa: 3→~8 thay vì 3→3.
                # Lần đầu chưa hoàn hảo (interval=1) vẫn cho ~3, giữ cửa sổ hợp lý.
                interval = max(3, round(interval * ease))
            elif repetition == 2:
                interval = max(7, round(interval * ease))
            else:
                interval = max(1, round(interval * ease))
            repetition += 1

        ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        progress.ease = max(1.3, min(3.2, ease))
        progress.repetition = repetition
        progress.interval_days = min(interval, 45)
        progress.next_review_at = datetime.utcnow() + timedelta(days=progress.interval_days)

    def _update_skill_score(self, progress: UserProgress, skill: str, correct: bool) -> None:
        field = {
            "listening": "listening_score",
            "context": "context_score",
            "production": "production_score",
        }.get(skill, "recognition_score")
        current = int(getattr(progress, field) or 0)
        setattr(progress, field, max(0, min(100, current + (14 if correct else -18))))

    def _mastery_cap(self, progress: UserProgress) -> int:
        cap = 100
        if (progress.listening_score or 0) <= 0:
            cap = min(cap, 82)
        if (progress.context_score or 0) <= 0:
            cap = min(cap, 82)
        if (progress.production_score or 0) <= 0:
            cap = min(cap, 75)
        return cap

    def _update_confidence_latency(
        self,
        progress: UserProgress,
        seen_before: int,
        confidence: int | None,
        latency_ms: int | None,
    ) -> None:
        if confidence is not None:
            confidence = max(1, min(4, int(confidence)))
            progress.confidence_avg = ((float(progress.confidence_avg or 0) * seen_before) + confidence) / (seen_before + 1)
        if latency_ms is not None and latency_ms >= 0:
            progress.latency_avg = round(((int(progress.latency_avg or 0) * seen_before) + int(latency_ms)) / (seen_before + 1))
