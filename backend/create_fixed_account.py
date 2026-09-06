"""Tạo tài khoản cố định trong dev.db (local) và mirror sang Turso (remote).

Thông tin đăng nhập KHÔNG được hardcode trong file này. Trước đây `USERNAME`,
`EMAIL`, `PASSWORD` là hằng số ngay trong file (và file này được git track), nên
bất kỳ ai đọc repo là có một cặp đăng nhập hợp lệ trên DB production — script
UPSERT thẳng hàng đó sang Turso. Giờ cả ba đọc từ môi trường/argv.

Chạy từ thư mục backend/ với venv của backend:
    FIXED_ACCOUNT_USERNAME=... FIXED_ACCOUNT_EMAIL=... FIXED_ACCOUNT_PASSWORD=... \
        ./.venv/Scripts/python.exe create_fixed_account.py

hoặc để trống PASSWORD rồi nhập khi được hỏi:
    ./.venv/Scripts/python.exe create_fixed_account.py --username ... --email ...

Mật khẩu CHỈ nhận qua biến môi trường hoặc prompt ẩn, có chủ ý không nhận qua
argv: tham số dòng lệnh nằm trong shell history và trong danh sách tiến trình mà
mọi user trên máy đọc được.

- Tạo/cập nhật user trong dev.db qua AuthService (hash bcrypt chuẩn).
- Đảm bảo bảng `users` tồn tại trên Turso rồi UPSERT đúng hàng đó qua HTTP pipeline.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.request

from app.db import SessionLocal, init_db
from app.models import User
from app.services.auth_service import AuthService
from app.settings import settings

# Trần khớp schemas.RegisterRequest để script không tạo được hàng mà API từ chối.
_MIN_PASSWORD_LEN = 6


def _resolve_credentials() -> tuple[str, str, str, str | None, bool]:
    """(username, email, password, display_name, reactivate) từ env/argv/prompt."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--username", default=os.getenv("FIXED_ACCOUNT_USERNAME", "").strip())
    parser.add_argument("--email", default=os.getenv("FIXED_ACCOUNT_EMAIL", "").strip())
    parser.add_argument(
        "--display-name", default=os.getenv("FIXED_ACCOUNT_DISPLAY_NAME", "").strip() or None
    )
    parser.add_argument(
        "--reactivate",
        action="store_true",
        help=(
            "Đặt lại is_active=True cho tài khoản đã tồn tại. Mặc định KHÔNG làm: "
            "bản cũ luôn force is_active=True, nên admin khoá tài khoản xong chỉ cần "
            "ai chạy lại script là mở lại tài khoản đó."
        ),
    )
    args = parser.parse_args()

    missing = [
        name
        for name, value in (("FIXED_ACCOUNT_USERNAME", args.username), ("FIXED_ACCOUNT_EMAIL", args.email))
        if not value
    ]
    if missing:
        parser.error(
            "thiếu " + ", ".join(missing) + " (đặt biến môi trường, hoặc dùng --username/--email)"
        )

    password = os.getenv("FIXED_ACCOUNT_PASSWORD", "")
    if not password:
        password = getpass.getpass("Mật khẩu cho tài khoản này (không hiện lên màn hình): ")
    if len(password) < _MIN_PASSWORD_LEN:
        print(f"Mật khẩu phải dài ít nhất {_MIN_PASSWORD_LEN} ký tự.", file=sys.stderr)
        raise SystemExit(2)

    return args.username, args.email, password, args.display_name, args.reactivate


def _turso_http_url(raw: str) -> str:
    url = raw.strip()
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    elif url.startswith("wss://"):
        url = "https://" + url[len("wss://"):]
    return url.rstrip("/") + "/v2/pipeline"


def _turso_execute(url: str, token: str, statements: list[dict]) -> list[dict]:
    requests = list(statements)
    requests.append({"type": "close"})
    body = json.dumps({"requests": requests}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    for i, result in enumerate(data.get("results", [])):
        if result.get("type") == "error":
            err = result.get("error", {})
            raise RuntimeError(f"Turso lỗi ở câu #{i}: {err.get('message')}")
    return data.get("results", [])


def _named_arg(name: str, value):
    if value is None:
        return {"name": name, "value": {"type": "null"}}
    if isinstance(value, bool):
        return {"name": name, "value": {"type": "integer", "value": "1" if value else "0"}}
    if isinstance(value, int):
        return {"name": name, "value": {"type": "integer", "value": str(value)}}
    return {"name": name, "value": {"type": "text", "value": str(value)}}


def create_local(
    username: str,
    email: str,
    password: str,
    display_name: str | None = None,
    reactivate: bool = False,
) -> User:
    init_db()
    with SessionLocal() as db:
        auth = AuthService(db)
        existing = auth.get_user_by_login(username) or auth.get_user_by_login(email)
        if existing:
            print(f"[dev.db] User đã tồn tại (id={existing.id}), cập nhật mật khẩu.")
            existing.password_hash = AuthService.hash_password(password)
            # Chỉ mở lại tài khoản khi được yêu cầu tường minh. Bản cũ luôn ghi
            # is_active = True, nên script này vô hiệu hoá thao tác khoá của admin.
            if reactivate:
                existing.is_active = True
            elif existing.is_active is False:
                print("[dev.db] Tài khoản đang bị khoá — giữ nguyên. Thêm --reactivate để mở.")
            db.commit()
            db.refresh(existing)
            return existing
        user = auth.register(username, email, password, display_name=display_name or username)
        print(f"[dev.db] Đã tạo user id={user.id}")
        return user


def mirror_to_turso(user: User) -> None:
    raw_url = settings.turso_database_url
    token = settings.turso_auth_token
    if not raw_url or not token:
        print("[turso] Thiếu TURSO_DATABASE_URL / TURSO_AUTH_TOKEN — bỏ qua mirror.")
        return
    url = _turso_http_url(raw_url)

    # 1) Đảm bảo bảng users tồn tại (schema khớp models.User).
    create_users = {
        "type": "execute",
        "stmt": {
            "sql": (
                "CREATE TABLE IF NOT EXISTS users ("
                "id VARCHAR(36) PRIMARY KEY, "
                "username VARCHAR(64) UNIQUE NOT NULL, "
                "email VARCHAR(128) UNIQUE NOT NULL, "
                "password_hash VARCHAR(256) NOT NULL, "
                "display_name VARCHAR(64) NOT NULL, "
                "leaderboard_opt_in BOOLEAN DEFAULT 1, "
                "is_active BOOLEAN DEFAULT 1, "
                "last_seen_at DATETIME, "
                "created_at DATETIME"
                ")"
            )
        },
    }
    _turso_execute(url, token, [create_users])

    # 2) UPSERT theo id — ghi đè nếu đã có, tránh trùng.
    upsert = {
        "type": "execute",
        "stmt": {
            "sql": (
                "INSERT INTO users "
                "(id, username, email, password_hash, display_name, leaderboard_opt_in, is_active, last_seen_at, created_at) "
                "VALUES (:id, :username, :email, :password_hash, :display_name, :leaderboard_opt_in, :is_active, :last_seen_at, :created_at) "
                "ON CONFLICT(id) DO UPDATE SET "
                "username=excluded.username, email=excluded.email, password_hash=excluded.password_hash, "
                "display_name=excluded.display_name, is_active=excluded.is_active"
            ),
            "named_args": [
                _named_arg("id", user.id),
                _named_arg("username", user.username),
                _named_arg("email", user.email),
                _named_arg("password_hash", user.password_hash),
                _named_arg("display_name", user.display_name),
                _named_arg("leaderboard_opt_in", user.leaderboard_opt_in),
                _named_arg("is_active", user.is_active),
                _named_arg("last_seen_at", None),
                _named_arg("created_at", user.created_at.isoformat() if user.created_at else None),
            ],
        },
    }
    _turso_execute(url, token, [upsert])

    # 3) Xác minh.
    verify = {"type": "execute", "stmt": {"sql": "SELECT id, username, email FROM users WHERE id = :id",
                                          "named_args": [_named_arg("id", user.id)]}}
    results = _turso_execute(url, token, [verify])
    rows = results[0]["response"]["result"]["rows"]
    print(f"[turso] Đã ghi user, xác minh: {rows}")


def main() -> None:
    username, email, password, display_name, reactivate = _resolve_credentials()
    user = create_local(username, email, password, display_name, reactivate)
    mirror_to_turso(user)
    print("Hoàn tất.")
    print(f"  username: {user.username}")
    print(f"  email:    {user.email}")
    # KHÔNG in mật khẩu: output của script này hay bị dán vào chat/issue/CI log.
    print("  password: (đã đặt — không in ra)")


if __name__ == "__main__":
    main()
