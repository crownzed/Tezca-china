from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .services.auth_service import AuthService

# Chỉ ghi last_seen_at khi mốc cũ đã quá ngưỡng này — tránh UPDATE users mỗi
# request (mỗi lần bấm là vài request). "Đang trực tuyến" trên admin suy ra từ
# last_seen_at nên độ trễ tối đa 60s là chấp nhận được.
_HEARTBEAT_THROTTLE = timedelta(seconds=60)


def _touch_last_seen(db: Session, user: User) -> None:
    now = datetime.utcnow()
    if user.last_seen_at is not None and now - user.last_seen_at < _HEARTBEAT_THROTTLE:
        return
    user.last_seen_at = now
    db.commit()


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    user_id = AuthService.decode_token(token)
    if not user_id:
        return None
    user = AuthService(db).get_user_by_id(user_id)
    if user:
        _touch_last_seen(db, user)
    return user


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def resolve_user_id(current_user: User = Depends(get_current_user)) -> str:
    """ID của người dùng đã xác thực.

    Trước đây cho phép fallback về query param ``user_id`` khi không có token —
    cho phép caller ẩn danh đọc/ghi dữ liệu của bất kỳ ai (IDOR). Giờ luôn yêu
    cầu đăng nhập và chỉ trả về id của chính người dùng đó.
    """
    return current_user.id
