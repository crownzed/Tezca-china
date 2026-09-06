from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import client_ip, get_current_user
from ..models import User
from ..schemas import AuthResponse, ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, MessageResponse, ProfileOut, ProfileStatsOut, RegisterRequest, ResetPasswordRequest, TitleOut, UpdateProfileRequest, UserOut
from ..services.auth_service import AuthService
from ..services.email_service import EmailService
from ..services.profile_service import ProfileService
from ..services.rate_limiter import RateLimiter
from ..settings import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Chống brute-force / spam trên bề mặt mật khẩu. Giới hạn theo IP; login còn
# giới hạn thêm theo tài khoản để một IP không thể dò mật khẩu nhiều tài khoản.
#
# Khoá IP lấy từ ``deps.client_ip``, KHÔNG phải helper riêng của file này nữa.
# Bản cũ ở đây đọc thẳng ``X-Forwarded-For`` phần tử đầu — header mà client GỬI
# ĐƯỢC và Fly chỉ nối thêm chứ không xoá — nên cả bốn limiter dưới đây có thể bị
# vượt vô hạn bằng cách xoay vòng một header. ``deps.client_ip`` ưu tiên
# ``Fly-Client-IP`` (Fly tự ghi đè, không giả mạo được). Bản fix đó đã có từ
# trước nhưng không được lan sang file này; đây là chỗ bị bỏ sót.
_login_ip_limiter = RateLimiter(max_hits=10, window_seconds=300)
_login_account_limiter = RateLimiter(max_hits=5, window_seconds=300)
_forgot_ip_limiter = RateLimiter(max_hits=5, window_seconds=900)
_reset_ip_limiter = RateLimiter(max_hits=10, window_seconds=900)


def _enforce(limiter: RateLimiter, key: str) -> None:
    if not limiter.allow(key):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu, vui lòng thử lại sau.")


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
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    _enforce(_login_ip_limiter, client_ip(request))
    _enforce(_login_account_limiter, payload.login.strip().lower())
    service = AuthService(db)
    try:
        user = service.login(payload.login, payload.password)
    except ValueError as exc:
        if str(exc) == "account_locked":
            raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa") from exc
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
    try:
        user = AuthService(db).update_profile(
            current_user,
            display_name=payload.display_name,
            email=payload.email,
            leaderboard_opt_in=payload.leaderboard_opt_in,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "invalid_email":
            raise HTTPException(status_code=400, detail="Email không hợp lệ") from exc
        if code == "email_taken":
            raise HTTPException(status_code=409, detail="Email đã được dùng bởi tài khoản khác") from exc
        raise
    return _user_out(user)


@router.post("/change-password", response_model=UserOut)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user = AuthService(db).change_password(
            current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "wrong_password":
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng") from exc
        if code == "password_too_short":
            raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự") from exc
        raise
    return _user_out(user)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    # Luôn trả cùng một thông điệp bất kể email có tồn tại hay không, để không
    # tiết lộ email nào đã đăng ký (chống enumeration). Chỉ khi tìm được user
    # mới thực sự sinh token + gửi mail.
    _enforce(_forgot_ip_limiter, client_ip(request))
    service = AuthService(db)
    # Chỉ tra theo email (không theo username) — tránh gửi link reset qua username
    # và giảm bề mặt enumeration.
    user = service.get_user_by_email(payload.email)
    if user:
        token = service.create_reset_token(user)
        reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        EmailService.send_password_reset(
            user.email, reset_link, settings.password_reset_expire_minutes
        )
    return MessageResponse(
        message="Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu."
    )


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    _enforce(_reset_ip_limiter, client_ip(request))
    try:
        AuthService(db).reset_password(payload.token, payload.new_password)
    except ValueError as exc:
        code = str(exc)
        if code == "invalid_token":
            raise HTTPException(status_code=400, detail="Liên kết không hợp lệ hoặc đã hết hạn") from exc
        if code == "password_too_short":
            raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 6 ký tự") from exc
        raise
    return MessageResponse(message="Đã đặt lại mật khẩu. Bạn có thể đăng nhập ngay.")


@router.delete("/me")
def delete_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuthService(db).delete_account(current_user)
    return {"ok": True}
