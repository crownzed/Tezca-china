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

        quiz_where = [QuizAttempt.created_at >= since] if since else []
        quiz_sub = (
            select(
                QuizAttempt.user_id.label("user_id"),
                func.coalesce(func.sum(QuizAttempt.score), 0).label("quiz_score"),
                func.count(QuizAttempt.id).label("quiz_count"),
            )
            .where(*quiz_where)
            .group_by(QuizAttempt.user_id)
            .subquery()
        )

        session_where = [LearningSession.completed_at.isnot(None)]
        if since:
            session_where.append(LearningSession.completed_at >= since)
        session_sub = (
            select(
                LearningSession.user_id.label("user_id"),
                func.count(LearningSession.id).label("session_count"),
            )
            .where(*session_where)
            .group_by(LearningSession.user_id)
            .subquery()
        )

        mastery_sub = (
            select(
                UserProgress.user_id.label("user_id"),
                func.count(UserProgress.id).label("mastery_count"),
            )
            .where(UserProgress.mastery >= 80)
            .group_by(UserProgress.user_id)
            .subquery()
        )

        result = self.db.execute(
            select(
                User.id,
                User.display_name,
                func.coalesce(quiz_sub.c.quiz_score, 0),
                func.coalesce(quiz_sub.c.quiz_count, 0),
                func.coalesce(session_sub.c.session_count, 0),
                func.coalesce(mastery_sub.c.mastery_count, 0),
            )
            .where(User.leaderboard_opt_in.is_(True))
            .outerjoin(quiz_sub, quiz_sub.c.user_id == User.id)
            .outerjoin(session_sub, session_sub.c.user_id == User.id)
            .outerjoin(mastery_sub, mastery_sub.c.user_id == User.id)
        ).all()

        rows = []
        for user_id, display_name, quiz_score, quiz_count, session_count, mastery_count in result:
            points = int(quiz_score) * 10 + int(session_count) * 50 + int(mastery_count) * 25
            if points <= 0:
                continue
            rows.append({
                "user_id": user_id,
                "display_name": display_name,
                "points": points,
                "quiz_count": int(quiz_count),
                "session_count": int(session_count),
                "mastery_count": int(mastery_count),
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
