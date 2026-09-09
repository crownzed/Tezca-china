from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt

from ..settings import settings

# Prefix subject của token admin. UUID user không bao giờ chứa ':' nên token
# admin và token user không thể lẫn nhau dù dùng chung jwt_secret + decode.
_ADMIN_SUBJECT_PREFIX = "admin:"


def verify_admin_credentials(email: str, password: str) -> bool:
    """Đúng khi email trùng ADMIN_EMAIL và password khớp ADMIN_PASSWORD_HASH.

    Dùng lại passlib context của auth_service (bcrypt) — không thêm thư viện hash
    thứ hai. So sánh email không phân biệt hoa/thường + cắt khoảng trắng.
    """
    from .auth_service import AuthService

    if not settings.admin_configured:
        return False
    if email.strip().lower() != settings.admin_email.strip().lower():
        return False
    return AuthService.verify_password(password, settings.admin_password_hash)


def create_admin_token() -> str:
    """Token admin dùng chung cơ chế JWT hiện có (jwt_secret + HS256 + exp)."""
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    subject = f"{_ADMIN_SUBJECT_PREFIX}{settings.admin_email.strip().lower()}"
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _decode_admin_email(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        return None
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.startswith(_ADMIN_SUBJECT_PREFIX):
        return None
    return subject[len(_ADMIN_SUBJECT_PREFIX):]


def require_admin(authorization: str | None = Header(default=None)) -> str:
    """Dependency gác mọi route /admin/*.

    - Chưa cấu hình admin (thiếu ADMIN_EMAIL/ADMIN_PASSWORD_HASH) -> 503.
    - Không có/sai token, hoặc email trong token không trùng ADMIN_EMAIL -> 403.
    Trả về email admin để route dùng nếu cần.
    """
    if not settings.admin_configured:
        raise HTTPException(status_code=503, detail="admin not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Forbidden")
    token = authorization.removeprefix("Bearer ").strip()
    email = _decode_admin_email(token)
    if not email or email.strip().lower() != settings.admin_email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden")
    return email


# Danh sách field cấu hình CHO PHÉP đọc/ghi qua /admin/config. CHỈ gồm field
# non-secret đã tồn tại trong settings.py — mọi secret/API key (jwt_secret,
# *_api_keys, *_auth_token, admin_*, smtp_password, database_url...) cố tình bị
# loại. Không có field nào ngoài danh sách này -> không thể bịa field mới.
_CONFIG_ALLOWED_FIELDS = (
    "app_name",
    "jwt_expire_hours",
    # Primary LLM là provider đang hoạt động, nên hai field này mới là thứ sửa
    # được từ admin có tác dụng thật; relay/fallback bên dưới chỉ còn ảnh hưởng khi
    # primary keys trống (xem llm_provider trong settings.py).
    "stepfun_chat_url",
    "stepfun_chat_model",
    "gemini_api_url",
    "gemini_model",
    "gemini_tts_model",
    "gemini_tts_voice",
    "gemini_native_url",
    "gemini_native_model",
    "elevenlabs_model",
    "elevenlabs_voice_id",
    "elevenlabs_feedback_voice_id",
    "frontend_url",
    "password_reset_expire_minutes",
)


def get_public_config() -> dict[str, str | int]:
    return {name: getattr(settings, name) for name in _CONFIG_ALLOWED_FIELDS}


def apply_config_updates(updates: dict[str, str | int]) -> dict[str, str | int]:
    """Cập nhật runtime các field non-secret trong allowlist.

    Chỉ sửa singleton ``settings`` trong bộ nhớ tiến trình — KHÔNG ghi .env, nên
    thay đổi mất khi restart (chấp nhận được với phạm vi này; .env là nguồn sự
    thật). Field ngoài allowlist -> 400. Giá trị được ép về đúng kiểu hiện tại
    của field (int/str) để không phá kiểu settings.
    """
    for name in updates:
        if name not in _CONFIG_ALLOWED_FIELDS:
            raise HTTPException(status_code=400, detail=f"unknown or protected field: {name}")
    for name, value in updates.items():
        current = getattr(settings, name)
        try:
            coerced = int(value) if isinstance(current, int) and not isinstance(current, bool) else str(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"invalid value for {name}") from exc
        setattr(settings, name, coerced)
    return get_public_config()
