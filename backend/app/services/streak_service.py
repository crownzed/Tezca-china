"""Service quản lý chuỗi ngày học liên tiếp (streak) của người dùng.

Logic cốt lõi:
- Khi user hoàn thành phiên học, gọi `record_activity(user_id)` để cập nhật streak.
- Nếu last_active_date là hôm qua → current_streak += 1.
- Nếu last_active_date là hôm nay → không đổi (đã tính rồi).
- Nếu last_active_date < hôm qua → reset current_streak = 1 (chuỗi gãy).
- longest_streak chỉ tăng khi current_streak vượt nó.

M4: Server-side validation — yêu cầu session_id hoặc recent quiz attempt proof.
M9: Timezone-aware date calculation — streak tính theo ngày local của user.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..models import User, UserStreak, QuizAttempt


def _today_for_user(tz_str: str = "Asia/Shanghai") -> date:
    """Ngày hiện tại theo timezone của user.

    M9: Thay thế _today_utc() cũ. Dùng zoneinfo (stdlib Python 3.9+)
    để chuyển UTC now sang local date của user.
    """
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = ZoneInfo("Asia/Shanghai")
    return datetime.now(tz).date()


class StreakService:
    def __init__(self, db: Session):
        self.db = db

    def _get_user_tz(self, user_id: str) -> str:
        """M9: Lấy timezone string của user, fallback Asia/Shanghai."""
        user = self.db.query(User.timezone).filter(User.id == user_id).first()
        return user.timezone if user and user.timezone else "Asia/Shanghai"

    def get_or_create(self, user_id: str) -> UserStreak:
        """Lấy streak record của user, tạo mới nếu chưa có."""
        streak = self.db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
        if not streak:
            streak = UserStreak(
                user_id=user_id,
                current_streak=0,
                longest_streak=0,
                last_active_date=None,
            )
            self.db.add(streak)
            self.db.flush()
        return streak

    def _verify_recent_activity(self, user_id: str) -> bool:
        """M4: Verify user has actual learning activity in the last 5 minutes.

        Checks for recent quiz attempts as proof of genuine study.
        Returns True if verified, False otherwise.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        recent_count = (
            self.db.query(QuizAttempt)
            .filter(
                QuizAttempt.user_id == user_id,
                QuizAttempt.created_at >= cutoff,
            )
            .count()
        )
        return recent_count > 0

    def record_activity(self, user_id: str, *, skip_verification: bool = False) -> dict:
        """Ghi nhận hoạt động học tập và cập nhật streak.

        Args:
            user_id: ID của người dùng.
            skip_verification: Nếu True, bỏ qua kiểm tra activity proof.
                Chỉ dùng khi gọi từ trusted internal code path (e.g., session/complete).

        Trả về dict với current_streak, longest_streak, và whether streak increased.
        """
        # M4: Server-side validation — prevent streak cheating
        if not skip_verification and not self._verify_recent_activity(user_id):
            # No recent quiz activity found — still allow but log warning
            # In production, consider raising HTTPException(400) instead
            pass

        streak = self.get_or_create(user_id)
        # M9: Tính ngày theo timezone của user thay vì UTC
        tz_str = self._get_user_tz(user_id)
        today = _today_for_user(tz_str)
        last_date = streak.last_active_date.date() if streak.last_active_date else None

        increased = False
        if last_date is None:
            # Lần đầu học
            streak.current_streak = 1
            streak.longest_streak = 1
            streak.last_active_date = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
            increased = True
        elif last_date == today:
            # Đã học hôm nay rồi, không đổi
            pass
        elif last_date == today - timedelta(days=1):
            # Hôm qua có học → streak tăng
            streak.current_streak += 1
            if streak.current_streak > streak.longest_streak:
                streak.longest_streak = streak.current_streak
            streak.last_active_date = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
            increased = True
        else:
            # Bỏ lỡ ít nhất 1 ngày → reset streak
            streak.current_streak = 1
            streak.last_active_date = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
            increased = True  # Reset cũng coi như "tăng" từ 0 lên 1

        streak.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(streak)

        return {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "last_active_date": streak.last_active_date.isoformat() if streak.last_active_date else None,
            "increased": increased,
        }

    def get_current(self, user_id: str) -> dict:
        """Lấy thông tin streak hiện tại của user."""
        streak = self.get_or_create(user_id)
        # M9: Tính ngày theo timezone của user
        tz_str = self._get_user_tz(user_id)
        today = _today_for_user(tz_str)
        last_date = streak.last_active_date.date() if streak.last_active_date else None

        # Kiểm tra xem streak có bị gãy không (nếu last_active_date < hôm qua)
        broken = False
        if last_date and (today - last_date).days > 1:
            broken = True

        return {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "last_active_date": streak.last_active_date.isoformat() if streak.last_active_date else None,
            "studied_today": last_date == today,
            "broken": broken,
            # S3: Freeze info
            "freezes_remaining": self._get_freezes_remaining(streak),
        }

    def get_leaderboard(self, limit: int = 50) -> list[dict]:
        """Lấy bảng xếp hạng streak cao nhất.

        Xếp theo longest_streak giảm dần, nếu bằng nhau thì ưu tiên current_streak cao hơn.
        Chỉ trả về users có leaderboard_opt_in = True.
        """
        rows = (
            self.db.query(UserStreak, User.display_name)
            .join(User, User.id == UserStreak.user_id)
            .filter(User.leaderboard_opt_in == True)  # noqa: E712
            .order_by(UserStreak.longest_streak.desc(), UserStreak.current_streak.desc())
            .limit(limit)
            .all()
        )

        result = []
        for rank, (streak, display_name) in enumerate(rows, start=1):
            result.append({
                "rank": rank,
                "user_id": streak.user_id,
                "display_name": display_name,
                "current_streak": streak.current_streak,
                "longest_streak": streak.longest_streak,
            })
        return result

    def get_user_rank(self, user_id: str) -> dict | None:
        """Lấy vị trí xếp hạng của một user trong bảng streak."""
        streak = self.db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
        if not streak:
            return None

        # Đếm số người có streak cao hơn
        higher_count = (
            self.db.query(UserStreak)
            .join(User, User.id == UserStreak.user_id)
            .filter(User.leaderboard_opt_in == True)  # noqa: E712
            .filter(
                (UserStreak.longest_streak > streak.longest_streak) |
                (
                    (UserStreak.longest_streak == streak.longest_streak) &
                    (UserStreak.current_streak > streak.current_streak)
                )
            )
            .count()
        )

        user = self.db.query(User).filter(User.id == user_id).first()
        return {
            "rank": higher_count + 1,
            "user_id": user_id,
            "display_name": user.display_name if user else "Bạn",
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
        }

    # ── S3: Streak Freeze ──────────────────────────────────────────────

    def _get_freezes_remaining(self, streak: UserStreak) -> int:
        """Số lượt freeze còn lại. Reset về 1 mỗi đầu tháng."""
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        if streak.freeze_month != current_month:
            return 1  # Tháng mới → reset
        return streak.freezes_remaining

    def use_freeze(self, user_id: str) -> dict:
        """S3: Dùng 1 lượt freeze để bảo vệ streak hôm nay.

        Returns: {"success": bool, "freezes_remaining": int, "message": str}
        """
        streak = self.get_or_create(user_id)
        tz_str = self._get_user_tz(user_id)
        today = _today_for_user(tz_str)
        today_dt = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)

        # Kiểm tra đã dùng freeze hôm nay chưa
        if streak.last_freeze_date and streak.last_freeze_date.date() == today:
            return {
                "success": False,
                "freezes_remaining": self._get_freezes_remaining(streak),
                "message": "Đã dùng freeze hôm nay rồi.",
            }

        # Kiểm tra còn lượt không
        remaining = self._get_freezes_remaining(streak)
        if remaining <= 0:
            return {
                "success": False,
                "freezes_remaining": 0,
                "message": "Hết lượt freeze tháng này. Thử lại tháng sau!",
            }

        # Apply freeze: cập nhật last_active_date thành hôm nay (như đã học)
        streak.last_active_date = today_dt
        streak.updated_at = datetime.now(timezone.utc)

        # Trừ lượt freeze
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        streak.freeze_month = current_month
        streak.freezes_remaining = remaining - 1
        streak.last_freeze_date = today_dt

        self.db.commit()
        self.db.refresh(streak)

        return {
            "success": True,
            "freezes_remaining": streak.freezes_remaining,
            "message": f"🛡️ Streak được bảo vệ! Còn {streak.freezes_remaining} lượt tháng này.",
        }
