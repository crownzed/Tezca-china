"""Luyện dịch câu hai chiều (VI↔CN).

Hai endpoint có mức bảo vệ KHÁC NHAU, có chủ ý:

  - ``/items`` gọi LLM -> tiêu quota chung với /tts, /pronunciation, /chat và mọi
    endpoint sinh nội dung khác. Yêu cầu đăng nhập + rate limit theo user id.
  - ``/grade`` chỉ so khớp chuỗi trong bộ nhớ, không gọi LLM. Vẫn yêu cầu đăng
    nhập (ghi LearningEvent theo user) nhưng KHÔNG rate-limit: người học nộp bài
    liên tục là hành vi bình thường và chặn ở đây chỉ làm hỏng phiên luyện.

Rate limit khoá theo user id, KHÔNG theo IP: cả lớp học sau một NAT dùng chung IP
thì khoá theo IP sẽ chặn oan lẫn nhau (cùng lý do đã ghi ở ``speech.py``).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import LearningEvent, User
from ..schemas import (
    TranslationGradeOut,
    TranslationGradeRequest,
    TranslationItemsOut,
    TranslationItemsRequest,
)
from ..services.rate_limiter import RateLimiter
from ..services.translation_exercise_service import grade, take_items

router = APIRouter(prefix="/api/translation", tags=["translation"])
logger = logging.getLogger(__name__)

# 20 lượt / 10 phút. Nới hơn /chat (30/60s) là không cần: mỗi lượt trả về tới 15
# câu và pool giữ lại để dùng lại, nên một người học thật chỉ cần vài lượt mỗi
# phiên. Trần này chặn vòng lặp đốt quota mà không chạm luồng học bình thường.
_items_limiter = RateLimiter(max_hits=20, window_seconds=600)


@router.post("/items", response_model=TranslationItemsOut)
def items(
    request: TranslationItemsRequest,
    current_user: User = Depends(get_current_user),
):
    """Lấy các cặp câu để luyện dịch, ưu tiên pool và chỉ gọi LLM khi còn thiếu."""
    if not _items_limiter.allow(f"translation:{current_user.id}"):
        raise HTTPException(
            status_code=429,
            detail="Bạn đang tạo câu quá nhanh. Chờ một chút rồi thử lại nhé.",
        )
    try:
        picked = take_items(request.hsk_level, request.count, exclude=request.exclude)
    except RuntimeError as exc:
        logger.warning(f"Translation items generation failed: {exc}")
        raise HTTPException(status_code=502, detail="Không tạo được câu để dịch, thử lại sau.") from exc
    except Exception as exc:
        logger.error(f"Translation items error: {exc}")
        raise HTTPException(status_code=500, detail="Lỗi máy chủ, thử lại sau.") from exc

    if not picked:
        raise HTTPException(status_code=502, detail="Chưa có câu nào để luyện dịch, thử lại sau.")
    return TranslationItemsOut(items=picked, hsk_level=request.hsk_level)


@router.post("/grade", response_model=TranslationGradeOut)
def grade_answer(
    request: TranslationGradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chấm một câu dịch bằng so khớp đáp án mẫu, rồi ghi lại một LearningEvent.

    KHÔNG cập nhật ``UserProgress``: bảng đó khoá theo ``word_id`` (uq_progress_user_word)
    mà câu do AI sinh không gắn với hàng ``Word`` nào — gán bừa một word_id sẽ làm
    lệch ``production_score`` của một từ không liên quan. LearningEvent với
    ``word_id=None`` là chỗ đúng để ghi tín hiệu này.
    """
    result = grade(request.user_answer, request.item.model_dump(), request.direction)

    event_id = None
    try:
        event = LearningEvent(
            user_id=current_user.id,
            word_id=None,
            question_id=None,
            session_id=request.session_id,
            item_type="translation",
            skill="production",
            prompt_modality="text",
            response_modality="typing",
            correct=1 if result["correct"] else 0,
            latency_ms=request.latency_ms,
            error_tag=result["error_tag"],
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        event_id = event.id
    except Exception as exc:
        # Chấm đã xong và không phụ thuộc DB. Mất một dòng thống kê không được làm
        # người học mất phản hồi cho câu vừa nộp.
        db.rollback()
        logger.warning(f"Translation event not recorded: {exc}")

    return TranslationGradeOut(**result, event_id=event_id)
