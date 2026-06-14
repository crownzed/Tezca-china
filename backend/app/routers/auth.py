from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import AuthResponse, LoginRequest, ProfileOut, ProfileStatsOut, RegisterRequest, TitleOut, UpdateProfileRequest, UserOut
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
