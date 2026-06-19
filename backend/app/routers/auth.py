from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_admin, get_current_user
from ..models import User
from ..schemas import (
    AdminResetPasswordRequest,
    AdminSetActiveRequest,
    AdminSetRoleRequest,
    AdminUserListOut,
    AdminUserOut,
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    ProfileOut,
    ProfileStatsOut,
    RegisterRequest,
    TitleOut,
    UpdateProfileRequest,
    UserOut,
)
from ..services.auth_service import AuthService
from ..services.profile_service import ProfileService

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        leaderboard_opt_in=user.leaderboard_opt_in,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    try:
        user = service.register(
            username=payload.username,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "user_exists":
            raise HTTPException(status_code=409, detail="Tài khoản hoặc email đã tồn tại") from exc
        if code == "username_too_short":
            raise HTTPException(status_code=400, detail="Tên đăng nhập phải có ít nhất 3 ký tự") from exc
        if code == "password_too_short":
            raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự") from exc
        if code == "invalid_email":
            raise HTTPException(status_code=400, detail="Email không hợp lệ") from exc
        raise
    token = service.create_token(user.id)
    return AuthResponse(token=token, user=_user_out(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    service = AuthService(db)
    try:
        user = service.login(payload.login, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu") from exc
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa. Liên hệ quản trị viên.")
    token = service.create_token(user.id)
    return AuthResponse(token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.get("/profile", response_model=ProfileOut)
def profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stats = ProfileService(db).get_stats(current_user.id)
    return ProfileOut(
        user=_user_out(current_user),
        stats=ProfileStatsOut(
            **{key: stats[key] for key in (
                "study_days", "current_streak", "longest_streak", "studied_today",
                "quiz_count", "session_count", "mastery_count", "points", "accuracy", "earned_titles",
            )},
            titles=[TitleOut(**title) for title in stats["titles"]],
        ),
    )


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = AuthService(db).update_profile(
        current_user,
        display_name=payload.display_name,
        leaderboard_opt_in=payload.leaderboard_opt_in,
    )
    return _user_out(user)

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = AuthService(db)
    try:
        service.change_password(current_user, payload.old_password, payload.new_password)
    except ValueError as exc:
        code = str(exc)
        if code == "wrong_password":
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng") from exc
        if code == "password_too_short":
            raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự") from exc
        raise
    return {"status": "ok"}

# ---- Admin endpoints (yêu cầu role=admin) ----

def _admin_user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )

@router.get("/admin/users", response_model=AdminUserListOut)
def admin_list_users(
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    users = AuthService(db).list_users()
    return AdminUserListOut(users=[_admin_user_out(u) for u in users], total=len(users))

@router.patch("/admin/users/{user_id}/role", response_model=AdminUserOut)
def admin_set_role(
    user_id: str,
    payload: AdminSetRoleRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    service = AuthService(db)
    target = service.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if target.id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Không thể tự gỡ quyền admin của chính mình")
    try:
        target = service.set_role(target, payload.role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ") from exc
    return _admin_user_out(target)

@router.patch("/admin/users/{user_id}/active", response_model=AdminUserOut)
def admin_set_active(
    user_id: str,
    payload: AdminSetActiveRequest,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    service = AuthService(db)
    target = service.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if target.id == admin.id and not payload.is_active:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản của chính mình")
    target = service.set_active(target, payload.is_active)
    return _admin_user_out(target)

@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: str,
    payload: AdminResetPasswordRequest,
    _admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    service = AuthService(db)
    target = service.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    try:
        service.admin_reset_password(target, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự") from exc
    return {"status": "ok"}
