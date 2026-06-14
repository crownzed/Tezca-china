from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LearningSession, QuizAttempt, User, UserProgress


class LeaderboardService:
    def __init__(self, db: Session):
        self.db = db

    def _since(self, period: str) -> datetime | None:
        if period == "weekly":
            return datetime.utcnow() - timedelta(days=7)
        return None

    def compute_points(self, user_id: str, since: datetime | None = None) -> dict:
        quiz_query = select(
            func.coalesce(func.sum(QuizAttempt.score), 0),
            func.count(QuizAttempt.id),
        ).where(QuizAttempt.user_id == user_id)
        if since:
            quiz_query = quiz_query.where(QuizAttempt.created_at >= since)
        quiz_score, quiz_count = self.db.execute(quiz_query).one()

        session_query = select(func.count(LearningSession.id)).where(
            LearningSession.user_id == user_id,
            LearningSession.completed_at.isnot(None),
        )
        if since:
            session_query = session_query.where(LearningSession.completed_at >= since)
        session_count = self.db.scalar(session_query) or 0

        mastery_query = select(func.count(UserProgress.id)).where(
            UserProgress.user_id == user_id,
            UserProgress.mastery >= 80,
        )
        mastery_count = self.db.scalar(mastery_query) or 0

        quiz_points = int(quiz_score or 0) * 10
        session_points = int(session_count) * 50
        mastery_points = int(mastery_count) * 25
        total = quiz_points + session_points + mastery_points

        return {
            "points": total,
            "quiz_points": quiz_points,
            "session_points": session_points,
            "mastery_points": mastery_points,
            "quiz_count": int(quiz_count or 0),
            "session_count": int(session_count),
            "mastery_count": int(mastery_count),
        }

    def get_leaderboard(self, period: str = "all_time", limit: int = 50) -> list[dict]:
        since = self._since(period)
        users = self.db.scalars(
            select(User).where(User.leaderboard_opt_in.is_(True)).order_by(User.created_at.asc())
        ).all()

        rows = []
        for user in users:
            stats = self.compute_points(user.id, since)
            if stats["points"] <= 0:
                continue
            rows.append({
                "user_id": user.id,
                "display_name": user.display_name,
                "points": stats["points"],
                "quiz_count": stats["quiz_count"],
                "session_count": stats["session_count"],
                "mastery_count": stats["mastery_count"],
            })

        rows.sort(key=lambda item: (-item["points"], item["display_name"].lower()))
        for index, row in enumerate(rows[:limit], start=1):
            row["rank"] = index
        return rows[:limit]

    def get_user_rank(self, user_id: str, period: str = "all_time") -> dict | None:
        board = self.get_leaderboard(period=period, limit=10_000)
        for row in board:
            if row["user_id"] == user_id:
                return row
        user = self.db.get(User, user_id)
        if not user:
            return None
        stats = self.compute_points(user_id, self._since(period))
        return {
            "user_id": user_id,
            "display_name": user.display_name,
            "points": stats["points"],
            "quiz_count": stats["quiz_count"],
            "session_count": stats["session_count"],
            "mastery_count": stats["mastery_count"],
            "rank": None,
        }
