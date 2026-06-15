from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LearningEvent, LearningSession, QuizType, Question, UserProgress, Word
from .behavior_service import BehaviorService
from .chinese_metadata_service import ChineseMetadataService
from .event_service import LearningEventService
from .priority_service import extract_features, priority_score
from .repair_service import RepairService
from .retrieval_ladder_service import describe_level
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
        progress = SRSService(self.db).update_from_answer(user_id, question, correct, confidence, latency_ms)
        event = LearningEventService(self.db).record_quiz_answer(
            user_id,
            question,
            correct,
            confidence,
            latency_ms,
            error_tag,
            session_id=session_id,
            item_type=item_type,
            selected_index=selected_index,
        )
        self.db.commit()
        self.db.refresh(event)
        return {
            "event_id": event.id,
            "question_id": question.id,
            "correct": correct,
            "correct_index": question.correct_index,
            "explanation": question.explanation or "",
            "error_tag": event.error_tag,
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
        repair_plan = RepairService(self.db).build_repair_plan(user_id)
        # Khi có lỗi gần đây, ưu tiên dạng bài sửa đúng loại lỗi chủ đạo
        # (trừ khi hành vi buộc phiên micro nhẹ).
        if repair_plan and not behavior.force_micro:
            quiz_type = repair_plan["quiz_type"]
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
            "missions": self._missions(answered, accuracy, due_count, weak_count, new_count, focus_words, behavior, repair_plan),
            "repair_plan": repair_plan,
            "reason": behavior.reason or self._reason(answered, due_count, weak_count, new_count, quiz_type),
        }

    def _quiz_type_for_state(self, behavior_state: str, weak_count: int, mode: str) -> QuizType:
        if behavior_state == "ready_deep" or mode == "deep":
            return QuizType.listening
        if weak_count:
            return QuizType.vocab
        return QuizType.vocab

    def _recent_error_counts(self, user_id: str, word_ids: list[int], days: int = 7) -> dict[int, int]:
        """Số lần sai gần đây (trong ``days`` ngày) của riêng từng từ."""
        if not word_ids:
            return {}
        since = datetime.utcnow() - timedelta(days=days)
        rows = self.db.execute(
            select(LearningEvent.word_id, func.count())
            .where(
                LearningEvent.user_id == user_id,
                LearningEvent.correct == 0,
                LearningEvent.word_id.in_(word_ids),
                LearningEvent.created_at >= since,
            )
            .group_by(LearningEvent.word_id)
        ).all()
        return {wid: cnt for wid, cnt in rows}

    def _focus_words(self, user_id: str, due_rows: list[UserProgress], weak_rows: list[UserProgress], focus_level: int) -> list[dict]:
        progress_by_word = {row.word_id: row for row in [*due_rows, *weak_rows]}
        word_ids = list(progress_by_word.keys())[:12]
        if not word_ids:
            return []
        words = self.db.scalars(select(Word).where(Word.id.in_(word_ids))).all()
        metadata_service = ChineseMetadataService(self.db)
        error_counts = self._recent_error_counts(user_id, word_ids)
        now = datetime.utcnow()
        rows = []
        for word in words:
            progress = progress_by_word.get(word.id)
            if not progress:
                continue
            metadata = metadata_service.enrich_word(word)
            seen = progress.seen or 0
            accuracy = round(((progress.correct or 0) / max(1, seen)) * 100)

            elapsed_days = (now - progress.last_seen_at).total_seconds() / 86400 if progress.last_seen_at else None
            overdue_days = (now - progress.next_review_at).total_seconds() / 86400 if progress.next_review_at else None
            features = extract_features(
                seen=seen,
                wrong=progress.wrong or 0,
                interval_days=progress.interval_days or 1,
                elapsed_days=elapsed_days,
                overdue_days=overdue_days,
                recent_error_count=error_counts.get(word.id, 0),
                word_level=word.hsk_level or focus_level,
                focus_level=focus_level,
                frequency_band=metadata["frequency_band"],
            )
            score = priority_score(features.as_dict())
            retrieval = describe_level(
                interval_days=progress.interval_days or 0,
                repetition=progress.repetition or 0,
                mastery=progress.mastery or 0,
                accuracy_pct=accuracy,
                recent_error_count=error_counts.get(word.id, 0),
                context_score=progress.context_score or 0,
                production_score=progress.production_score or 0,
            )
            rows.append({
                "word_id": word.id,
                "level": word.hsk_level or focus_level,
                "hanzi": word.hanzi,
                "pinyin": word.pinyin or "",
                "meaning_vi": word.meaning_vi or "",
                "accuracy": accuracy,
                "priority": round(score, 4),
                "retrieval": retrieval,
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
        return sorted(rows, key=lambda item: -item["priority"])[:6]

    def _missions(self, answered: int, accuracy: int, due_count: int, weak_count: int, new_count: int, focus_words: list[dict], behavior, repair_plan: dict | None = None) -> list[dict]:
        if repair_plan:
            repair_value = f"{repair_plan['error_count']} lỗi · {repair_plan['label']}"
            repair_focus = repair_plan.get("focus_words") or []
            repair_detail = (
                f"{repair_plan['method']}. Ưu tiên: "
                + ", ".join(item["hanzi"] for item in repair_focus[:3])
            ) if repair_focus else repair_plan["method"]
            repair_tone = repair_plan.get("tone", "cinnabar")
        else:
            repair_value = f"{weak_count} từ" if weak_count else "Chưa có"
            repair_detail = (
                ", ".join(item["hanzi"] for item in focus_words[:3])
                if weak_count else "Lỗi sai sẽ được gom tại đây sau mỗi phiên."
            )
            repair_tone = "cinnabar" if weak_count else "jade"
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
                "value": repair_value,
                "detail": repair_detail,
                "tone": repair_tone,
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
