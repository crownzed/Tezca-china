from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import LearningEvent, LearningSession, UserProgress
from .tuning import EWMA_ALPHA


@dataclass(frozen=True)
class BehaviorDecision:
    state: str
    label: str
    reason: str
    nudge: str
    force_micro: bool
    block_new_words: bool
    reduce_difficulty: bool
    allow_stretch: bool
    ewma_accuracy: int
    ewma_confidence: float
    ewma_latency_ms: int
    completion_rate: int
    wrong_streak: int


class BehaviorService:
    def __init__(self, db: Session):
        self.db = db

    def infer(
        self,
        user_id: str,
        progress_rows: list[UserProgress],
        due_count: int,
        weak_count: int,
        selected_mode: str,
        now: datetime | None = None,
    ) -> BehaviorDecision:
        now = now or datetime.utcnow()
        recent_events = self.db.scalars(
            select(LearningEvent)
            .where(LearningEvent.user_id == user_id)
            .order_by(LearningEvent.created_at.desc())
            .limit(40)
        ).all()
        recent_sessions = self.db.scalars(
            select(LearningSession)
            .where(LearningSession.user_id == user_id)
            .order_by(LearningSession.started_at.desc())
            .limit(10)
        ).all()

        answered = sum(row.seen or 0 for row in progress_rows)
        correct = sum(row.correct or 0 for row in progress_rows)
        baseline_accuracy = round((correct / answered) * 100) if answered else 0
        accuracy_ewma = self._ewma([100 if event.correct else 0 for event in reversed(recent_events)], baseline_accuracy)
        confidence_values = [event.confidence for event in reversed(recent_events) if event.confidence]
        latency_values = [event.latency_ms for event in reversed(recent_events) if event.latency_ms is not None]
        confidence_ewma = self._ewma(confidence_values, self._progress_avg(progress_rows, "confidence_avg"))
        latency_ewma = self._ewma(latency_values, self._progress_avg(progress_rows, "latency_avg"))
        wrong_streak = self._wrong_streak(recent_events)
        completion_rate = self._completion_rate(recent_sessions)
        latest_activity = self._latest_activity(progress_rows, recent_events, recent_sessions)

        state = "maintenance"
        if not answered and not recent_events:
            state = "habit_building"
        elif latest_activity and latest_activity < now - timedelta(days=3):
            state = "returning"
        elif wrong_streak >= 3 or (confidence_ewma and confidence_ewma < 2.4) or weak_count >= 4 or accuracy_ewma < 55:
            state = "fragile"
        elif latency_ewma >= 12000 and accuracy_ewma < 72:
            state = "overloaded"
        elif selected_mode == "micro":
            state = "ready_short"
        elif completion_rate >= 75 and accuracy_ewma >= 75 and due_count <= 5 and weak_count <= 1:
            state = "ready_deep"

        return BehaviorDecision(
            state=state,
            label=self._label(state),
            reason=self._reason(state, due_count, weak_count, wrong_streak, accuracy_ewma, confidence_ewma, latency_ewma),
            nudge=self._nudge(state, due_count),
            force_micro=state in {"returning", "overloaded"},
            block_new_words=state in {"returning", "overloaded", "fragile", "ready_short"} or due_count > 30,
            reduce_difficulty=state in {"fragile", "overloaded", "returning"},
            allow_stretch=state == "ready_deep",
            ewma_accuracy=round(accuracy_ewma),
            ewma_confidence=round(confidence_ewma, 2) if confidence_ewma else 0,
            ewma_latency_ms=round(latency_ewma),
            completion_rate=round(completion_rate),
            wrong_streak=wrong_streak,
        )

    def _ewma(self, values: list[int | float], fallback: int | float, alpha: float = EWMA_ALPHA) -> float:
        if not values:
            return float(fallback or 0)
        current = float(values[0])
        for value in values[1:]:
            current = alpha * float(value) + (1 - alpha) * current
        return current

    def _progress_avg(self, rows: list[UserProgress], field: str) -> float:
        values = [float(getattr(row, field) or 0) for row in rows if getattr(row, field) or 0]
        return sum(values) / len(values) if values else 0

    def _wrong_streak(self, events: list[LearningEvent]) -> int:
        streak = 0
        for event in events:
            if event.correct:
                break
            streak += 1
        return streak

    def _completion_rate(self, sessions: list[LearningSession]) -> float:
        if not sessions:
            return 0
        completed = sum(1 for session in sessions if session.completed_at)
        return (completed / len(sessions)) * 100

    def _latest_activity(
        self,
        progress_rows: list[UserProgress],
        events: list[LearningEvent],
        sessions: list[LearningSession],
    ) -> datetime | None:
        dates = [row.last_seen_at for row in progress_rows if row.last_seen_at]
        dates.extend(event.created_at for event in events if event.created_at)
        dates.extend(session.started_at for session in sessions if session.started_at)
        return max(dates) if dates else None

    def _label(self, state: str) -> str:
        return {
            "ready_deep": "Sẵn sàng học sâu",
            "ready_short": "Phiên ngắn",
            "fragile": "Cần củng cố nhẹ",
            "overloaded": "Giảm tải",
            "returning": "Khởi động lại",
            "habit_building": "Xây thói quen",
            "maintenance": "Duy trì",
        }.get(state, "Duy trì")

    def _reason(
        self,
        state: str,
        due_count: int,
        weak_count: int,
        wrong_streak: int,
        accuracy: float,
        confidence: float,
        latency_ms: float,
    ) -> str:
        if state == "returning":
            return "Bạn quay lại sau vài ngày, nên phiên này chỉ gom phần cần giữ."
        if state == "fragile":
            return f"Có {weak_count} nhóm yếu hoặc {wrong_streak} câu sai liên tiếp, nên giảm độ khó."
        if state == "overloaded":
            return f"Tốc độ trả lời đang chậm ({round(latency_ms / 1000)}s) và độ chính xác chưa ổn."
        if state == "ready_short":
            return "Bạn chọn phiên ngắn, hệ thống ưu tiên giữ lịch ôn."
        if state == "ready_deep":
            return f"EWMA chính xác {round(accuracy)}%, confidence {round(confidence, 1)}, backlog thấp."
        if state == "habit_building":
            return "Chưa có nhiều dữ liệu, nên bắt đầu bằng phiên nhỏ dễ hoàn thành."
        if due_count:
            return f"Có {due_count} mục đến hạn, nên bảo vệ trí nhớ trước."
        return "Nhịp học ổn, tiếp tục phiên cân bằng."

    def _nudge(self, state: str, due_count: int) -> str:
        if state == "returning":
            return "Khởi động lại bằng 5 phút. Hôm nay chỉ cần giữ những từ đến hạn."
        if state == "fragile":
            return "Giảm nhịp một chút: gặp lại câu dễ hơn trước khi thêm từ mới."
        if state == "overloaded":
            return "Dừng thêm tải mới. Làm ít câu hơn để giữ độ chính xác."
        if state == "ready_short":
            return f"{due_count or 3} mục ôn là đủ cho phiên ngắn hôm nay."
        if state == "ready_deep":
            return "Nền đang ổn. Có thể thêm nghe/ngữ cảnh nếu còn thời gian."
        if state == "habit_building":
            return "Hoàn thành một phiên nhỏ để hệ thống tạo lịch ôn đầu tiên."
        return "Học hôm nay theo nhịp vừa sức, có thể tắt nhắc nhở bất cứ lúc nào."
