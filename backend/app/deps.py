from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .services.auth_service import AuthService

# Chỉ ghi last_seen_at khi mốc cũ đã quá ngưỡng này — tránh UPDATE users mỗi
# request (mỗi lần bấm là vài request). "Đang trực tuyến" trên admin suy ra từ
# last_seen_at nên độ trễ tối đa 60s là chấp nhận được.
_HEARTBEAT_THROTTLE = timedelta(seconds=60)


def client_ip(request: Request) -> str:
    """IP người gọi, dùng làm khoá rate-limit cho các endpoint không có user id.

    Thứ tự ưu tiên có lý do bảo mật, không phải tuỳ ý:

    1. ``Fly-Client-IP`` — Fly Proxy TỰ đặt header này và ghi đè giá trị client
       gửi lên, nên trên production nó là nguồn duy nhất không giả mạo được.
    2. ``X-Forwarded-For`` — client GỬI ĐƯỢC. Fly nối IP thật vào danh sách chứ
       không xoá phần client tự khai, nên phần tử đầu tiên có thể là do kẻ gọi
       tự bịa: ai muốn vượt rate-limit chỉ cần xoay vòng header này. Giữ lại vì
       môi trường không-Fly (dev, proxy khác) cần nó, nhưng luôn xếp SAU (1).
    3. Peer TCP thật.

    Trước đây helper này (bản cũ trong ``routers/speech.py``) đọc thẳng
    ``X-Forwarded-For`` đầu tiên, nên rate-limit 3-lượt/IP của
    ``/demo-pronunciation`` có thể bị vượt vô hạn chỉ bằng cách đổi header.
    """
    fly_ip = request.headers.get("fly-client-ip", "").strip()
    if fly_ip:
        return fly_ip
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_loopback_request(request: Request) -> bool:
    """True khi peer TCP là chính máy này.

    Dùng để miễn rate-limit cho ``scripts/generate-audio.mjs``: script build kho
    audio gọi ``/tts`` hàng nghìn lượt từ ``127.0.0.1`` và sẽ chết ngay với bất
    kỳ hạn mức hợp lý nào cho người dùng thật.

    Kiểm PEER thật (``request.client.host``) chứ KHÔNG dùng ``client_ip`` ở trên:
    ``client_ip`` có thể đọc từ header, nên miễn trừ theo nó tương đương mở cửa
    cho mọi ai gửi ``X-Forwarded-For: 127.0.0.1``. Trên Fly, peer luôn là địa
    chỉ nội bộ của proxy nên nhánh này không bao giờ đúng ở production.
    """
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


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
    if not user:
        return None
    # Tài khoản bị admin khoá phải mất quyền NGAY, không đợi token hết hạn.
    #
    # Trước đây ``is_active`` chỉ được đọc ở đường đăng nhập (auth_service), nên
    # ``PATCH /api/admin/users/{id}`` đặt is_active=False chỉ chặn lần đăng nhập
    # SAU: token đã phát vẫn gọi được mọi route đã xác thực trong phần TTL còn lại
    # — mặc định 168 giờ. Biện pháp khoá của admin do đó chỉ có tác dụng hình thức.
    #
    # Viết ``is False`` chứ KHÔNG ``not user.is_active`` là có chủ ý. Schema do
    # SQLAlchemy dựng có NOT NULL trên cột này, nhưng đó không phải đường duy nhất
    # dữ liệu đi vào: ``create_fixed_account.py`` tạo bảng ``users`` trên Turso bằng
    # DDL viết tay ``is_active BOOLEAN DEFAULT 1`` — KHÔNG có NOT NULL. Hàng ghi qua
    # đường đó có thể mang NULL -> Python None, và ``not None`` là True, tức sẽ đăng
    # xuất những người dùng đó dù chưa ai khoá họ. So sánh identity chỉ từ chối đúng
    # người bị khoá tường minh (False, hoặc 0 sau khi SQLAlchemy chuyển kiểu).
    if user.is_active is False:
        return None
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
