"""Distractor Policy Engine — chọn distractor "vừa đủ khó" theo nấc thụ đắc (#2).

``confusable_words_json`` đã được ``enrichment_service.confusable_hanzi`` xếp sẵn
theo độ dễ nhầm GIẢM DẦN (mạnh nhất đứng đầu: đồng âm khác thanh > đồng âm >
gần âm > chung chữ > gần nghĩa). Việc luôn lấy phần đầu (gần đáp án nhất) là
quá khó cho người mới: distractor đồng âm khác thanh khiến câu gần như đoán mò
với ai mới RECOGNIZED → nản, sai vì lý do sai (chưa phân biệt nổi) thay vì vì
chưa thuộc.

Nguyên tắc (đúng tinh thần "tập nói như trẻ con" + desirable difficulty):
- Mới nhận ra (RECOGNIZED): distractor XA đáp án (dễ loại trừ) → xây tự tin.
- Càng lên cao: cửa sổ trượt dần về phía distractor GẦN (buộc phân biệt tinh).
- MASTERED: distractor gần nhất (đồng âm/đồng tự) → kiểm tra phân biệt thật.

Toàn bộ là **thuần** (không chạm DB): nhận danh sách confusable đã xếp hạng +
stage, trả lại thứ tự ưu tiên distractor mong muốn. Service chỉ việc theo thứ
tự đó khi dựng câu, vẫn bù bằng pool ngẫu nhiên khi thiếu (giữ nguyên hành vi
fallback cũ).
"""

from __future__ import annotations

# Thứ tự nấc thụ đắc (đồng bộ với acquisition_service.STAGES).
_STAGE_ORDER = ("UNKNOWN", "RECOGNIZED", "UNDERSTOOD", "USABLE", "MASTERED")
_STAGE_INDEX = {name: i for i, name in enumerate(_STAGE_ORDER)}

# Số nấc "sản sinh" (USABLE+) — mốc để biết người học đã cần phân biệt tinh.
_MAX_INDEX = len(_STAGE_ORDER) - 1


def _stage_index(stage: str | None) -> int:
    """Map stage → index, mặc định UNKNOWN (0) khi không nhận diện được."""
    return _STAGE_INDEX.get((stage or "").upper(), 0)


def difficulty_bias(stage: str | None) -> float:
    """Mức "muốn distractor gần" theo stage, trong [0, 1].

    0.0 = ưu tiên distractor xa nhất (người mới); 1.0 = gần nhất (thuần thục).
    Tuyến tính theo index nấc để dễ giải thích và test.
    """
    return _stage_index(stage) / _MAX_INDEX


def order_distractors_by_stage(ranked_confusables: list, stage: str | None) -> list:
    """Sắp lại confusable (đã xếp gần→xa) theo độ khó mong muốn của ``stage``.

    KHÔNG loại phần tử nào — chỉ đổi THỨ TỰ ưu tiên, để service vẫn có đủ ứng
    viên và hành vi fallback (bù bằng pool ngẫu nhiên) không đổi.

    - Stage cao (bias→1): giữ nguyên thứ tự gốc (gần nhất trước).
    - Stage thấp (bias→0): đảo lại (xa nhất trước) để người mới được loại trừ
      dễ trước, các confusable mạnh lùi về sau.
    - Ở giữa: nội suy — vẫn ưu tiên vùng "vừa tầm" trước hai cực.
    """
    items = list(ranked_confusables)
    n = len(items)
    if n <= 1:
        return items

    bias = difficulty_bias(stage)
    # Vị trí "neo" mong muốn trong dải [0, n-1]: bias cao → neo về đầu (gần),
    # bias thấp → neo về cuối (xa).
    anchor = (1.0 - bias) * (n - 1)

    # Xếp theo khoảng cách tới neo: phần tử gần vị trí mong muốn lên trước.
    # Hoà thì giữ ổn định theo index gốc (gần đáp án hơn thắng).
    order = sorted(range(n), key=lambda i: (abs(i - anchor), i))
    return [items[i] for i in order]
