"""Acquisition Stage Engine — trục thụ đắc tự nhiên (SPEC v2, mục 1 & 3.2).

Thay trục "HSK level 1-6" bằng **trạng thái thụ đắc per-word**, tiến hóa theo
mức người học thực sự DÙNG ĐƯỢC từ, không theo lịch thi:

    UNKNOWN → RECOGNIZED → UNDERSTOOD → USABLE → MASTERED
     (chưa)    (nhận ra)    (hiểu nghĩa)  (tự dùng) (thuần thục)

Nguyên tắc "tập nói như trẻ con" (SPEC v2 mục 1):
- Nghe/nhận diện TRƯỚC (recognition + listening) → RECOGNIZED.
- Hiểu nghĩa + gợi nhớ chủ động (recall + context) → UNDERSTOOD.
- Tự sản sinh có hướng dẫn (production khởi đầu) → USABLE.
- Sản sinh tự do, ổn định trí nhớ cao → MASTERED.

Ánh xạ tự nhiên vào retrieval ladder L1-L8 (engine C):
    RECOGNIZED  ~ L1-L3   UNDERSTOOD ~ L4-L5
    USABLE      ~ L6-L7   MASTERED   ~ L8

Hàm tính là **thuần** (không chạm DB) → test tất định, giống pattern
engine B (priority) / C (ladder).
"""

from __future__ import annotations

from dataclasses import dataclass

from .tuning import ACQUISITION_THRESHOLDS

# Thứ tự thụ đắc (index dùng để so sánh tiến/lùi).
STAGES = ("UNKNOWN", "RECOGNIZED", "UNDERSTOOD", "USABLE", "MASTERED")
_STAGE_INDEX = {name: i for i, name in enumerate(STAGES)}

# Nhãn tiếng Việt cho frontend (5 nấc "trẻ con").
STAGE_LABELS = {
    "UNKNOWN": "Chưa biết",
    "RECOGNIZED": "Nhận ra",
    "UNDERSTOOD": "Hiểu nghĩa",
    "USABLE": "Dùng được",
    "MASTERED": "Thuần thục",
}

# Nguồn duy nhất: ``tuning.ACQUISITION_THRESHOLDS`` (giữ alias để tham chiếu nội bộ).
THRESHOLDS = ACQUISITION_THRESHOLDS


@dataclass(frozen=True)
class AcquisitionState:
    stage: str
    label: str
    index: int
    # progress trong nấc hiện tại tiến tới nấc kế (0-100), để vẽ thanh tiến độ.
    progress_to_next: int
    is_productive: bool  # đã ở mức tự sản sinh (USABLE+)?

    def as_dict(self) -> dict:
        return {
            "stage": self.stage,
            "label": self.label,
            "index": self.index,
            "progress_to_next": self.progress_to_next,
            "is_productive": self.is_productive,
        }


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def acquisition_stage(
    *,
    seen: int,
    recognition_score: int,
    listening_score: int,
    context_score: int,
    production_score: int,
    mastery: int,
) -> str:
    """Map các điểm kỹ năng của một từ → 1 trong 5 stage.

    Đánh giá từ cao xuống thấp: đạt nấc cao nhất thỏa điều kiện thì dừng.
    `recall_signal` gộp nhận diện + nghe (kỹ năng tiếp nhận).
    """
    seen = max(0, int(seen or 0))
    recognition = _clamp(recognition_score or 0)
    listening = _clamp(listening_score or 0)
    context = _clamp(context_score or 0)
    production = _clamp(production_score or 0)
    mastery = _clamp(mastery or 0)

    # Kỹ năng tiếp nhận = max(nhận diện, nghe) — trẻ con nhận ra qua bất kỳ kênh nào.
    recall_signal = max(recognition, listening)

    # MASTERED: sản sinh tự do vững + trí nhớ ổn định cao. MASTERED phải BAO HÀM
    # điều kiện của USABLE (context đủ) — không thể "thuần thục" một từ mà chưa
    # từng hiểu nó trong ngữ cảnh. Nếu không, một từ production/mastery cao nhưng
    # context=0 sẽ nhảy thẳng lên MASTERED, bỏ qua USABLE (ngữ nghĩa nấc sai).
    if (
        production >= THRESHOLDS["mastered_production"]
        and mastery >= THRESHOLDS["mastered_mastery"]
        and context >= THRESHOLDS["usable_context"]
    ):
        return "MASTERED"

    # USABLE: bắt đầu tự sản sinh có hướng dẫn + hiểu ngữ cảnh đủ.
    if production >= THRESHOLDS["usable_production"] and context >= THRESHOLDS["usable_context"]:
        return "USABLE"

    # UNDERSTOOD: gợi nhớ nghĩa ổn + hiểu trong ngữ cảnh.
    if recall_signal >= THRESHOLDS["understood_recall"] and context >= THRESHOLDS["understood_context"]:
        return "UNDERSTOOD"

    # RECOGNIZED: đã gặp + bắt đầu nhận diện được.
    if seen >= THRESHOLDS["recognized_seen"] and recall_signal >= THRESHOLDS["recognized_recall"]:
        return "RECOGNIZED"

    return "UNKNOWN"


def _progress_to_next(
    stage: str,
    *,
    recall_signal: float,
    context: float,
    production: float,
    mastery: float,
) -> int:
    """Ước lượng % tiến tới nấc kế tiếp, để frontend vẽ thanh tiến độ.

    Mỗi nấc đo theo tín hiệu "ghế cửa" của nấc kế. MASTERED đã là đỉnh → 100.
    """
    if stage == "UNKNOWN":
        # tiến tới RECOGNIZED đo bằng recall_signal / ngưỡng nhận diện.
        return int(_clamp(recall_signal / THRESHOLDS["recognized_recall"] * 100))
    if stage == "RECOGNIZED":
        # cần recall đủ cao + context lên — lấy trung bình tiến độ 2 trục.
        recall_p = recall_signal / THRESHOLDS["understood_recall"]
        ctx_p = context / THRESHOLDS["understood_context"]
        return int(_clamp(min(recall_p, ctx_p) * 100))
    if stage == "UNDERSTOOD":
        prod_p = production / THRESHOLDS["usable_production"]
        ctx_p = context / THRESHOLDS["usable_context"]
        return int(_clamp(min(prod_p, ctx_p) * 100))
    if stage == "USABLE":
        prod_p = production / THRESHOLDS["mastered_production"]
        mast_p = mastery / THRESHOLDS["mastered_mastery"]
        return int(_clamp(min(prod_p, mast_p) * 100))
    return 100  # MASTERED


def describe_acquisition(
    *,
    seen: int,
    recognition_score: int,
    listening_score: int,
    context_score: int,
    production_score: int,
    mastery: int,
) -> dict:
    """Trả stage + nhãn + tiến độ để gắn vào focus_word (schema frontend)."""
    stage = acquisition_stage(
        seen=seen,
        recognition_score=recognition_score,
        listening_score=listening_score,
        context_score=context_score,
        production_score=production_score,
        mastery=mastery,
    )
    recall_signal = max(_clamp(recognition_score or 0), _clamp(listening_score or 0))
    progress = _progress_to_next(
        stage,
        recall_signal=recall_signal,
        context=_clamp(context_score or 0),
        production=_clamp(production_score or 0),
        mastery=_clamp(mastery or 0),
    )
    return AcquisitionState(
        stage=stage,
        label=STAGE_LABELS[stage],
        index=_STAGE_INDEX[stage],
        progress_to_next=progress,
        is_productive=_STAGE_INDEX[stage] >= _STAGE_INDEX["USABLE"],
    ).as_dict()
