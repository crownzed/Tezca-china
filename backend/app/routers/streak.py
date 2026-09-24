"""API endpoints cho hệ thống streak (chuỗi ngày học liên tiếp)."""
import asyncio
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, get_optional_user, get_user_from_token_query
from ..models import User
from ..schemas import StreakCurrentOut, StreakEntryOut, StreakLeaderboardOut
from ..services.streak_service import StreakService

router = APIRouter(prefix="/api/streak", tags=["streak"])


@router.get("/current", response_model=StreakCurrentOut)
def get_current_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lấy thông tin streak hiện tại của user đang đăng nhập."""
    service = StreakService(db)
    data = service.get_current(current_user.id)
    # M9: Include user timezone in response
    data["timezone"] = current_user.timezone or "Asia/Shanghai"
    return StreakCurrentOut(**data)


@router.get("/leaderboard", response_model=StreakLeaderboardOut)
def get_streak_leaderboard(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Lấy bảng xếp hạng streak cao nhất.

    - `limit`: số lượng entry tối đa (mặc định 50, tối đa 100).
    - Nếu có user đăng nhập, trả thêm vị trí của họ trong `me`.
    """
    service = StreakService(db)
    entries = service.get_leaderboard(limit=limit)
    me = None
    if current_user:
        me_data = service.get_user_rank(current_user.id)
        if me_data:
            me = StreakEntryOut(**me_data)
    return StreakLeaderboardOut(
        entries=[StreakEntryOut(**row) for row in entries],
        me=me,
        total=len(entries),
    )


@router.get("/stream")
async def streak_stream(
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """M8: SSE endpoint — push streak updates real-time.

    EventSource không gửi custom headers nên auth qua query param `?token=<jwt>`.
    Poll DB mỗi 30s, gửi event nếu data thay đổi.

    Format: `data: {"current_streak":5,...}\\n\\n`
    """
    user = get_user_from_token_query(token, db)
    if not user:
        # Gửi error event rồi đóng stream
        async def error_gen():
            yield f"data: {json.dumps({'error': 'unauthorized'})}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    user_id = user.id
    tz_str = user.timezone or "Asia/Shanghai"

    async def event_generator():
        last_data = None
        try:
            while True:
                # Tạo DB session mới cho mỗi poll cycle (async context)
                service = StreakService(db)
                data = service.get_current(user_id)
                data["timezone"] = tz_str

                # Chỉ gửi khi data thay đổi
                data_key = json.dumps(data, sort_keys=True)
                if data_key != last_data:
                    last_data = data_key
                    yield f"data: {json.dumps(data)}\n\n"

                await asyncio.sleep(30)
        except asyncio.CancelledError:
            pass  # Client disconnected

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/freeze")
def use_streak_freeze(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """S3: Dùng 1 lượt freeze để bảo vệ streak hôm nay.

    Mỗi user có 1 lượt freeze/tháng. Freeze cập nhật last_active_date
    thành hôm nay, giữ streak không bị gãy dù chưa học thật.
    """
    service = StreakService(db)
    result = service.use_freeze(current_user.id)
    if not result["success"]:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["message"])
    return result
