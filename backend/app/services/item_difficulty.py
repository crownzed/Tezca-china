"""Item Difficulty Engine — chọn câu theo ĐỘ KHÓ THỰC NGHIỆM (#1).

Thay cho việc lọc câu bằng marker chuỗi cứng (``len(prompt) >= 90``,
``RICH_PARAGRAPH_MARKERS``) vốn dính trục HSK và không phản ánh độ khó thật,
module này tính **độ khó thực nghiệm** của mỗi câu từ dữ liệu trả lời toàn hệ
(p-value: tỉ lệ trả lời đúng) rồi ưu tiên câu có độ khó *vừa đủ* cho người học
theo luật 85% (tái dùng ``difficulty_service.desirable_difficulty``).

Toàn bộ hàm là **thuần** (không chạm DB) để test tất định — service gọi sẽ gom
thống kê (correct/total mỗi câu) rồi truyền vào đây.

Cơ sở:
- **Classical Test Theory — facility index**: p = số đúng / tổng lượt. p cao
  = câu dễ, p thấp = câu khó.
- **Bayesian shrinkage**: câu có ít lượt làm thì p thô rất nhiễu (1/1 = 100%).
  Kéo p về một prior trung tính theo số lượt, để câu mới không bị thiên lệch.
- **Luật 85%** (Wilson 2019): tốc độ học tối ưu khi xác suất đúng ~0.85.
"""

from __future__ import annotations

from .difficulty_service import desirable_difficulty
from .learning_utils import clamp
from .tuning import (
    ITEM_DIFFICULTY_PRIOR_P,
    ITEM_DIFFICULTY_PRIOR_WEIGHT,
    TARGET_RETRIEVABILITY,
)


def empirical_p_correct(
    correct: int,
    total: int,
    prior_p: float = ITEM_DIFFICULTY_PRIOR_P,
    prior_weight: float = ITEM_DIFFICULTY_PRIOR_WEIGHT,
) -> float:
    """Tỉ lệ trả lời đúng đã làm trơn (Bayesian shrinkage) trong [0, 1].

    Câu chưa ai làm (``total == 0``) trả về đúng ``prior_p`` (giả định trung
    tính), để không bị loại oan cũng không được ưu ái. Càng nhiều lượt, p càng
    tiến về tỉ lệ thô thực tế.
    """
    correct = max(0, int(correct))
    total = max(0, int(total))
    if total == 0 and prior_weight <= 0:
        return clamp(prior_p)
    numerator = correct + prior_p * prior_weight
    denominator = total + prior_weight
    return clamp(numerator / denominator) if denominator > 0 else clamp(prior_p)


def difficulty_fit(
    correct: int,
    total: int,
    target: float = TARGET_RETRIEVABILITY,
) -> float:
    """Điểm khớp [0, 1]: cao nhất khi độ khó câu ~ mục tiêu (luật 85%).

    Dùng ``empirical_p_correct`` làm xác suất thành công kỳ vọng, rồi chấm theo
    ``desirable_difficulty`` (đỉnh tại ``target``). Câu quá dễ (p≈1) hay quá khó
    (p≈0) đều bị hạ điểm.
    """
    p = empirical_p_correct(correct, total)
    return desirable_difficulty(p, target)


def is_low_quality(
    correct: int,
    total: int,
    min_attempts: int = 8,
    too_easy: float = 0.95,
    too_hard: float = 0.25,
) -> bool:
    """Quality gate (#4 nhẹ): câu có ĐỦ dữ liệu nhưng độ khó lệch hẳn.

    Chỉ phán xét khi đã có ``min_attempts`` lượt (tránh loại oan câu mới). Câu
    quá dễ (gần như ai cũng đúng) ít giá trị học; câu quá khó (gần như sai hết)
    thường là nhiễu/lỗi. Trả ``True`` để service có thể hạ ưu tiên.
    """
    total = max(0, int(total))
    if total < max(1, int(min_attempts)):
        return False
    p = empirical_p_correct(correct, total)
    return p >= too_easy or p <= too_hard


def difficulty_label(correct: int, total: int) -> str:
    """Nhãn mô tả độ khó để debug/hiển thị (không ảnh hưởng logic)."""
    p = empirical_p_correct(correct, total)
    if p >= 0.85:
        return "easy"
    if p >= 0.6:
        return "medium"
    if p >= 0.4:
        return "hard"
    return "very_hard"
