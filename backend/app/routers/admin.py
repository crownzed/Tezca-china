from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, union_all
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import LearningEvent, QuizAttempt, User
from ..schemas import (
    AdminConfigOut,
    AdminConfigUpdateRequest,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminUserOut,
    AdminUsersOut,
    AdminUserUpdateRequest,
)
from ..services.admin_service import (
    apply_config_updates,
    create_admin_token,
    get_public_config,
    require_admin,
    verify_admin_credentials,
)
from ..services.auth_service import AuthService

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _last_active_map(db: Session) -> dict[str, datetime]:
    """MAX(created_at) mỗi user, gộp từ quiz_attempts + learning_events.

    Một query duy nhất cho mọi user (tránh N+1). UNION ALL hai bảng rồi
    GROUP BY user_id lấy mốc mới nhất — đây là "hoạt động học thật", khác
    last_seen_at (chỉ cần mở app kèm token là tính).
    """
    activity = union_all(
        select(QuizAttempt.user_id.label("uid"), QuizAttempt.created_at.label("ts")),
        select(LearningEvent.user_id.label("uid"), LearningEvent.created_at.label("ts")),
    ).subquery()
    rows = db.execute(
        select(activity.c.uid, func.max(activity.c.ts)).group_by(activity.c.uid)
    ).all()
    return {uid: ts for uid, ts in rows if uid is not None and ts is not None}


def _admin_user_out(user: User, last_active_at: datetime | None = None) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
        last_active_at=last_active_at.isoformat() if last_active_at else None,
    )


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest):
    # Chưa cấu hình admin -> 503 (đồng nhất với require_admin), tránh lộ việc
    # admin có tồn tại hay không qua thông báo lỗi khác nhau.
    from ..settings import settings

    if not settings.admin_configured:
        raise HTTPException(status_code=503, detail="admin not configured")
    if not verify_admin_credentials(payload.email, payload.password):
        raise HTTPException(status_code=401, detail="Sai thông tin đăng nhập quản trị")
    return AdminLoginResponse(token=create_admin_token(), email=settings.admin_email.strip().lower())


@router.get("/users", response_model=AdminUsersOut, dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    active_map = _last_active_map(db)
    return AdminUsersOut(users=[_admin_user_out(user, active_map.get(user.id)) for user in users])


@router.patch("/users/{user_id}", response_model=AdminUserOut, dependencies=[Depends(require_admin)])
def set_user_active(user_id: str, payload: AdminUserUpdateRequest, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return _admin_user_out(user, _last_active_map(db).get(user.id))


@router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: str, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    # Dùng lại delete_account để dọn sạch dữ liệu học liên quan (không cascade).
    AuthService(db).delete_account(user)
    return {"ok": True}


@router.get("/config", response_model=AdminConfigOut, dependencies=[Depends(require_admin)])
def get_config():
    return AdminConfigOut(config=get_public_config())


@router.patch("/config", response_model=AdminConfigOut, dependencies=[Depends(require_admin)])
def update_config(payload: AdminConfigUpdateRequest):
    return AdminConfigOut(config=apply_config_updates(payload.updates))
