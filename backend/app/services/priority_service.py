"""Priority Engine — Weighted Priority Queue cho Session Planner.

Hiện thực công thức trọng số trong tài liệu chiến lược (mục 4.7):

    priority = due_urgency        * 0.35
             + forgetting_risk    * 0.20
             + error_need         * 0.20
             + goal_relevance     * 0.10
             + novelty_need       * 0.05
             + habit_fit          * 0.05
             - recent_repeat_penalty * 0.05

Trước đây ``session_service._focus_words`` chỉ sort thô theo ``(accuracy,
level)``. Service này thay bằng điểm ưu tiên có cơ sở, trong đó
``forgetting_risk`` lấy từ **đường cong quên FSRS** (power-law), dùng
``interval_days`` làm proxy cho *stability* và thời gian từ ``last_seen_at``
làm *elapsed*. Đây là "FSRS-lite": mượn mô hình retrievability để diệt
"ease hell" của SM-2 thuần, nhưng không cần 21 tham số huấn luyện.

Toàn bộ hàm tính điểm là **thuần** (không chạm DB) để test tất định.
"""

from __future__ import annotations

from dataclasses import dataclass

# Trọng số lấy nguyên từ tài liệu mục 4.7.
WEIGHTS = {
    "due_urgency": 0.35,
    "forgetting_risk": 0.20,
    "error_need": 0.20,
    "goal_relevance": 0.10,
    "novelty_need": 0.05,
    "habit_fit": 0.05,
    "recent_repeat_penalty": -0.05,
}

# Hằng số đường cong FSRS: R = (1 + t/(F·S))^(-1), F = 9 cho mục tiêu R≈90%.
_FSRS_FACTOR = 9.0


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def retrievability(stability_days: float, elapsed_days: float) -> float:
    """Xác suất nhớ tại thời điểm hiện tại theo đường cong quên FSRS.

    ``stability_days`` càng lớn → quên càng chậm. ``elapsed_days`` là số ngày
    kể từ lần ôn gần nhất. Trả về trong [0, 1].
    """
    stability = max(0.1, float(stability_days))
    elapsed = max(0.0, float(elapsed_days))
    return (1.0 + elapsed / (_FSRS_FACTOR * stability)) ** -1.0


def priority_score(features: dict) -> float:
    """Tổng hợp điểm ưu tiên từ các đặc trưng đã chuẩn hóa [0, 1]."""
    return sum(WEIGHTS[name] * float(features.get(name, 0.0)) for name in WEIGHTS)


@dataclass
class WordFeatures:
    due_urgency: float
    forgetting_risk: float
    error_need: float
    goal_relevance: float
    novelty_need: float
    habit_fit: float
    recent_repeat_penalty: float

    def as_dict(self) -> dict:
        return {
            "due_urgency": self.due_urgency,
            "forgetting_risk": self.forgetting_risk,
            "error_need": self.error_need,
            "goal_relevance": self.goal_relevance,
            "novelty_need": self.novelty_need,
            "habit_fit": self.habit_fit,
            "recent_repeat_penalty": self.recent_repeat_penalty,
        }


def extract_features(
    *,
    seen: int,
    wrong: int,
    interval_days: int,
    elapsed_days: float | None,
    overdue_days: float | None,
    recent_error_count: int,
    word_level: int,
    focus_level: int,
    frequency_band: str,
) -> WordFeatures:
    """Suy ra 7 đặc trưng chuẩn hóa từ trạng thái một từ.

    - ``elapsed_days``: số ngày từ lần gặp gần nhất (None nếu chưa từng gặp).
    - ``overdue_days``: số ngày quá hạn ôn (âm nếu chưa tới hạn, None nếu chưa lên lịch).
    - ``recent_error_count``: số lần sai gần đây của riêng từ này.
    """
    seen = max(0, int(seen))
    interval = max(1, int(interval_days or 1))

    # due_urgency: tỉ lệ quá hạn so với khoảng ôn. Đúng hạn → 1, chưa tới → <1.
    if overdue_days is None or elapsed_days is None:
        due_urgency = 0.0
    else:
        due_urgency = _clamp(elapsed_days / interval)

    # forgetting_risk = 1 - R(stability=interval, elapsed).
    if elapsed_days is None:
        forgetting_risk = 0.0
    else:
        forgetting_risk = _clamp(1.0 - retrievability(interval, elapsed_days))

    # error_need: pha trộn tỉ lệ sai tích lũy và số lỗi gần đây.
    error_rate = (wrong / seen) if seen else 0.0
    error_need = _clamp(0.6 * error_rate + 0.4 * _clamp(recent_error_count / 3.0))

    # goal_relevance: khớp cấp HSK mục tiêu.
    diff = abs(int(word_level or focus_level) - int(focus_level))
    goal_relevance = 1.0 if diff == 0 else 0.5 if diff == 1 else 0.2

    # novelty_need: từ mới/ít gặp được ưu tiên đưa vào.
    novelty_need = _clamp((3 - seen) / 3.0)

    # habit_fit: từ lõi HSK hợp với thói quen học hằng ngày.
    habit_fit = 1.0 if (frequency_band or "core_hsk") == "core_hsk" else 0.5

    # recent_repeat_penalty: vừa gặp trong ~6h thì hạ ưu tiên, tránh lặp ngay.
    if elapsed_days is None:
        recent_repeat_penalty = 0.0
    else:
        recent_repeat_penalty = _clamp((0.25 - elapsed_days) / 0.25)

    return WordFeatures(
        due_urgency=due_urgency,
        forgetting_risk=forgetting_risk,
        error_need=error_need,
        goal_relevance=goal_relevance,
        novelty_need=novelty_need,
        habit_fit=habit_fit,
        recent_repeat_penalty=recent_repeat_penalty,
    )
