from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, get_optional_user
from ..models import User
from ..schemas import LeaderboardEntryOut, LeaderboardOut
from ..services.leaderboard_service import LeaderboardService

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=LeaderboardOut)
def leaderboard(
    period: str = Query(default="all_time", pattern="^(all_time|weekly)$"),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    service = LeaderboardService(db)
    entries = service.get_leaderboard(period=period, limit=limit)
    me = None
    if current_user:
        me_data = service.get_user_rank(current_user.id, period=period)
        if me_data:
            me = LeaderboardEntryOut(**me_data)
    return LeaderboardOut(
        period=period,
        entries=[LeaderboardEntryOut(**row) for row in entries],
        me=me,
    )


@router.get("/me", response_model=LeaderboardEntryOut)
def my_rank(
    period: str = Query(default="all_time", pattern="^(all_time|weekly)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = LeaderboardService(db)
    data = service.get_user_rank(current_user.id, period=period)
    return LeaderboardEntryOut(**data)
