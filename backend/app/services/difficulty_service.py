"""Difficulty Engine — xếp câu theo 'độ khó mong muốn' (desirable difficulty).

Thay cho heuristic bucket thô (``knowledge_rank`` 0/1/2/4) trong
``quiz_service._rank_questions``. Mô hình cũ phân loại câu bằng ngưỡng cứng
(``mastery >= 70``, ``accuracy < 0.75``) — KHÔNG phản ánh xác suất nhớ thực tế
và bỏ qua thời gian trôi từ lần ôn gần nhất, nên một từ vừa ôn xong và một từ
sắp quên có thể rơi vào cùng một bucket.

Phương án mới dựa trên hai cơ sở khoa học học tập:

1. **Desirable difficulty** (Bjork & Bjork): việc truy hồi tạo ra ghi nhớ bền
   nhất khi nó *vừa đủ khó* — phải gắng sức nhưng vẫn thành công.
2. **Luật 85%** (Wilson et al., 2019, *Nature Communications*): tốc độ học tối
   ưu đạt được khi tỉ lệ đúng quanh ~85%. Quá dễ (≈100%) thì lãng phí lượt ôn;
   quá khó (≈chance) thì nản và không củng cố được gì.

Cách tính: dự đoán xác suất nhớ lại ``R`` cho từ mục tiêu bằng đường cong quên
FSRS-lite (tái dùng ``priority_service.retrievability``: R = (1 + t/(9S))^-1,
với S ≈ ``interval_days``, t = số ngày từ lần gặp gần nhất). Câu nào có ``R``
gần mục tiêu (~0.85) thì giá trị truy hồi cao nhất; câu vừa ôn (R≈1) giá trị
thấp; câu đã quá hạn (R<0.85) vẫn ưu tiên cao vì là rủi ro quên.

Toàn bộ hàm là **thuần** (không chạm DB) để test tất định.
"""

from __future__ import annotations

from .priority_service import retrievability
from .learning_utils import clamp
from .tuning import NEW_WORD_VALUE, TARGET_RETRIEVABILITY as _TARGET_RETRIEVABILITY

# Nguồn duy nhất: ``tuning`` (giữ alias để tham chiếu nội bộ + API công khai).
TARGET_RETRIEVABILITY = _TARGET_RETRIEVABILITY
_NEW_WORD_VALUE = NEW_WORD_VALUE


# Nguồn duy nhất: ``learning_utils.clamp`` (giữ alias để tham chiếu nội bộ).
_clamp = clamp


def desirable_difficulty(r: float, target: float = TARGET_RETRIEVABILITY) -> float:
    """Điểm [0,1] đạt đỉnh khi ``R == target``, giảm dần về hai phía.

    Chuẩn hóa theo khoảng cách tối đa có thể tới ``target`` để cả hai phía
    (quá dễ / quá khó) được phạt cân xứng theo tỉ lệ.
    """
    spread = max(target, 1.0 - target)
    return _clamp(1.0 - abs(_clamp(r) - target) / spread)


def test_value(
    *,
    has_progress: bool,
    interval_days: int,
    elapsed_days: float | None,
    due: bool,
) -> float:
    """Giá trị truy hồi của một câu (cao = nên kiểm tra sớm).

    - Từ mới (``has_progress`` False): trả ``_NEW_WORD_VALUE``.
    - Từ đã/đang đến hạn (``due``): rủi ro quên, ưu tiên cao 0.85→1.0 tăng dần
      khi ``R`` càng tụt (càng quá hạn).
    - Từ chưa tới hạn: dùng đường cong desirable difficulty — câu vừa ôn (R≈1)
      giá trị thấp, câu đang tiến về hạn (R→target) giá trị tăng dần tới 1.0.
    """
    if not has_progress or elapsed_days is None:
        return _NEW_WORD_VALUE

    r = retrievability(max(1, int(interval_days or 1)), elapsed_days)
    if due:
        # Đã tới/quá hạn: R <= target. Càng quên nhiều càng gấp.
        return _clamp(TARGET_RETRIEVABILITY + (1.0 - r) * (1.0 - TARGET_RETRIEVABILITY) / TARGET_RETRIEVABILITY)
    # Chưa tới hạn: thưởng cho câu tiệm cận vùng tối ưu, phạt câu vừa ôn xong.
    return desirable_difficulty(r)


def predicted_retrievability(interval_days: int, elapsed_days: float | None) -> float | None:
    """Tiện ích: R dự đoán cho từ đã có tiến trình (None nếu chưa gặp)."""
    if elapsed_days is None:
        return None
    return retrievability(max(1, int(interval_days or 1)), elapsed_days)
