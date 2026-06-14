from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import LearningEvent, LearningSession, QuizAttempt, UserProgress
from .leaderboard_service import LeaderboardService

BADGE_DEFS: list[dict] = [
    {"id": "first_quiz", "label": "Bước đầu", "description": "Hoàn thành 1 bài luyện"},
    {"id": "quiz_10", "label": "Cần cù", "description": "Hoàn thành 10 bài luyện"},
    {"id": "streak_3", "label": "Ba ngày liên tiếp", "description": "Học liên tục 3 ngày"},
    {"id": "streak_7", "label": "Tuần vàng", "description": "Học liên tục 7 ngày"},
    {"id": "streak_30", "label": "Tháng sắt", "description": "Học liên tục 30 ngày"},
    {"id": "days_7", "label": "Khám phá", "description": "Học trong 7 ngày khác nhau"},
    {"id": "days_30", "label": "Người ham học", "description": "Học trong 30 ngày khác nhau"},
    {"id": "mastery_10", "label": "Từ vựng tinh", "description": "Thuộc 10 từ (mastery ≥ 80)"},
    {"id": "mastery_50", "label": "Từ điển sống", "description": "Thuộc 50 từ (mastery ≥ 80)"},
    {"id": "session_5", "label": "Phiên học đều", "description": "Hoàn thành 5 phiên học"},
    {"id": "points_500", "label": "500 điểm", "description": "Đạt 500 điểm xếp hạng"},
    {"id": "points_2000", "label": "Cao thủ", "description": "Đạt 2000 điểm xếp hạng"},
]


def compute_streaks(active_dates: set[date]) -> tuple[int, int, int, bool]:
    study_days = len(active_dates)
    if not active_dates:
        return 0, 0, 0, False

    today = date.today()
    yesterday = today - timedelta(days=1)
    studied_today = today in active_dates

    current = 0
    anchor = today if studied_today else (yesterday if yesterday in active_dates else None)
    if anchor:
        cursor = anchor
        while cursor in active_dates:
            current += 1
            cursor -= timedelta(days=1)

    longest = 1
    run = 1
    sorted_dates = sorted(active_dates)
    for index in range(1, len(sorted_dates)):
        if (sorted_dates[index] - sorted_dates[index - 1]).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    return study_days, current, longest, studied_today


def build_titles(metrics: dict) -> list[dict]:
    checks = {
        "first_quiz": metrics["quiz_count"] >= 1,
        "quiz_10": metrics["quiz_count"] >= 10,
        "streak_3": metrics["longest_streak"] >= 3,
        "streak_7": metrics["longest_streak"] >= 7,
        "streak_30": metrics["longest_streak"] >= 30,
        "days_7": metrics["study_days"] >= 7,
        "days_30": metrics["study_days"] >= 30,
        "mastery_10": metrics["mastery_count"] >= 10,
        "mastery_50": metrics["mastery_count"] >= 50,
        "session_5": metrics["session_count"] >= 5,
        "points_500": metrics["points"] >= 500,
        "points_2000": metrics["points"] >= 2000,
    }
    titles = []
    for badge in BADGE_DEFS:
        earned = checks.get(badge["id"], False)
        titles.append({**badge, "earned": earned})
    return titles


class ProfileService:
    def __init__(self, db: Session):
        self.db = db

    def _collect_active_dates(self, user_id: str) -> set[date]:
        dates: set[date] = set()
        sources = [
            select(QuizAttempt.created_at).where(QuizAttempt.user_id == user_id),
            select(LearningEvent.created_at).where(LearningEvent.user_id == user_id),
            select(LearningSession.started_at).where(LearningSession.user_id == user_id),
        ]
        for query in sources:
            for timestamp in self.db.scalars(query).all():
                if timestamp:
                    dates.add(timestamp.date())
        return dates

    def get_stats(self, user_id: str) -> dict:
        active_dates = self._collect_active_dates(user_id)
        study_days, current_streak, longest_streak, studied_today = compute_streaks(active_dates)
        points_data = LeaderboardService(self.db).compute_points(user_id)

        answered = self.db.scalar(
            select(func.coalesce(func.sum(UserProgress.seen), 0)).where(UserProgress.user_id == user_id)
        ) or 0
        correct = self.db.scalar(
            select(func.coalesce(func.sum(UserProgress.correct), 0)).where(UserProgress.user_id == user_id)
        ) or 0
        accuracy = round((correct / answered) * 100) if answered else 0

        metrics = {
            "study_days": study_days,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "studied_today": studied_today,
            "quiz_count": points_data["quiz_count"],
            "session_count": points_data["session_count"],
            "mastery_count": points_data["mastery_count"],
            "points": points_data["points"],
            "accuracy": accuracy,
        }
        metrics["titles"] = build_titles(metrics)
        metrics["earned_titles"] = sum(1 for title in metrics["titles"] if title["earned"])
        return metrics
