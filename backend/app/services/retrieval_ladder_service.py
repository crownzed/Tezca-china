"""Retrieval Ladder Engine — thang truy hồi L1–L8 (doc mục 4.5, 3.2).

Doc định nghĩa 8 bậc truy hồi tăng dần độ khó:

    L1  hanzi → nghĩa            (nhận diện, dễ nhất)
    L2  audio → nghĩa            (nghe)
    L3  pinyin → hanzi           (nhận diện ngược)
    L4  nghĩa → hanzi/pinyin     (gợi nhớ chủ động)
    L5  cloze trong câu          (ngữ cảnh)
    L6  nghe hội thoại → ý chính (nghe + ngữ cảnh)
    L7  gõ pinyin / nói câu      (sản sinh)
    L8  tạo câu ngắn             (sản sinh tự do, khó nhất)

Nguyên tắc cốt lõi (doc mục 3.2 "retrieval over exposure" + desirable
difficulty): KHÔNG để người học mãi ở mức nhận diện thụ động. Khi một từ
ổn định dần (stability tăng) thì leo bậc, ép truy hồi khó hơn để khắc sâu.
Nhưng leo có kiểm soát:

- **Gate theo kỹ năng nền**: chưa vững nhận diện/ngữ cảnh thì chưa lên sản sinh.
- **Hạ bậc khi yếu** (doc mục 5.3 "sai → cue dễ hơn"): từ đang sai nhiều /
  độ chính xác thấp bị kéo xuống 1–2 bậc, tránh biến phiên học thành nản chí.

Toàn bộ hàm tính bậc là **thuần** (không chạm DB) để test tất định.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..models import QuizType

# Kênh sản sinh không phải QuizType trắc nghiệm — xử lý qua output_service.
PRODUCTION_CHANNEL = "guided_output"


@dataclass(frozen=True)
class LadderRung:
    level: int
    label: str
    # quiz_type generator sinh được, hoặc PRODUCTION_CHANNEL cho bậc sản sinh.
    mode: str
    skill: str


# Map 8 bậc → dạng bài hệ thống thực sự phục vụ được.
# L3 (pinyin→hanzi) tái dùng vocab vì cùng kênh nhận diện trắc nghiệm;
# L7/L8 là sản sinh, đi qua output_service chứ không phải trắc nghiệm.
LADDER: tuple[LadderRung, ...] = (
    LadderRung(1, "Hán tự → nghĩa", QuizType.vocab.value, "recognition"),
    LadderRung(2, "Âm thanh → nghĩa", QuizType.listening.value, "listening"),
    LadderRung(3, "Pinyin → Hán tự", QuizType.vocab.value, "recognition"),
    LadderRung(4, "Nghĩa → Hán tự", QuizType.translation.value, "recall"),
    LadderRung(5, "Điền khuyết trong câu", QuizType.cloze.value, "context"),
    LadderRung(6, "Nghe hội thoại → ý chính", QuizType.dialogue.value, "listening"),
    LadderRung(7, "Gõ pinyin / nói câu", PRODUCTION_CHANNEL, "production"),
    LadderRung(8, "Tạo câu ngắn", PRODUCTION_CHANNEL, "production"),
)

_RUNG_BY_LEVEL = {rung.level: rung for rung in LADDER}

# Bậc cao nhất mà generator trắc nghiệm phục vụ được (L7/L8 là sản sinh).
MAX_QUIZ_LEVEL = 6


def rung_for_level(level: int) -> LadderRung:
    level = max(1, min(8, int(level)))
    return _RUNG_BY_LEVEL[level]


def _base_level_from_stability(interval_days: int, repetition: int) -> int:
    """Bậc nền theo độ ổn định trí nhớ (stability proxy = interval_days).

    Từ mới / chưa ôn lần nào ở bậc thấp; càng giãn cách dài (nhớ càng bền)
    càng leo cao.
    """
    interval = max(0, int(interval_days or 0))
    repetition = max(0, int(repetition or 0))
    if repetition == 0 or interval <= 1:
        return 1
    if interval <= 3:
        return 2
    if interval <= 7:
        return 3
    if interval <= 14:
        return 4
    if interval <= 21:
        return 5
    if interval <= 30:
        return 6
    if interval <= 42:
        return 7
    return 8


def retrieval_level(
    *,
    interval_days: int,
    repetition: int,
    mastery: int,
    accuracy_pct: int,
    recent_error_count: int,
    context_score: int,
    production_score: int,
) -> int:
    """Bậc truy hồi đề xuất cho một từ, trong [1, 8].

    Leo theo stability, chặn trần theo kỹ năng nền, rồi hạ bậc nếu đang yếu.
    """
    base = _base_level_from_stability(interval_days, repetition)

    # Trần theo kỹ năng nền: chưa vững thì chưa đẩy lên bậc khó.
    cap = 8
    if (mastery or 0) < 75 or (production_score or 0) < 40:
        cap = min(cap, 6)  # chưa sẵn sàng sản sinh (L7/L8)
    if (mastery or 0) < 55 or (context_score or 0) < 30:
        cap = min(cap, 4)  # chưa sẵn sàng ngữ cảnh/hội thoại (L5/L6)
    level = min(base, cap)

    # Hạ bậc khi yếu — doc 5.3: sau khi sai cho cue dễ hơn.
    if (recent_error_count or 0) >= 2 or (accuracy_pct or 0) < 50:
        level = max(1, level - 2)
    elif (accuracy_pct or 0) < 70:
        level = max(1, level - 1)

    return max(1, min(8, level))


def describe_level(
    *,
    interval_days: int,
    repetition: int,
    mastery: int,
    accuracy_pct: int,
    recent_error_count: int,
    context_score: int,
    production_score: int,
) -> dict:
    """Trả bậc + nhãn + dạng bài để gắn vào focus_word."""
    level = retrieval_level(
        interval_days=interval_days,
        repetition=repetition,
        mastery=mastery,
        accuracy_pct=accuracy_pct,
        recent_error_count=recent_error_count,
        context_score=context_score,
        production_score=production_score,
    )
    rung = rung_for_level(level)
    return {
        "level": rung.level,
        "label": rung.label,
        "mode": rung.mode,
        "skill": rung.skill,
        "is_production": rung.mode == PRODUCTION_CHANNEL,
    }
