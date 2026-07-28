"""Tạo tài khoản cố định trong dev.db (local) và mirror sang Turso (remote).

Chạy từ thư mục backend/ với venv của backend:
    ./.venv/Scripts/python.exe create_fixed_account.py

- Tạo/cập nhật user trong dev.db qua AuthService (hash bcrypt chuẩn).
- Đảm bảo bảng `users` tồn tại trên Turso rồi UPSERT đúng hàng đó qua HTTP pipeline.
"""
from __future__ import annotations

import json
import urllib.request

from app.db import SessionLocal, init_db
from app.models import User
from app.services.auth_service import AuthService
from app.settings import settings

USERNAME = "tezca"
EMAIL = "tezca@tezca.com"
PASSWORD = "123456"


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


def create_local() -> User:
    init_db()
    with SessionLocal() as db:
        auth = AuthService(db)
        existing = auth.get_user_by_login(USERNAME) or auth.get_user_by_login(EMAIL)
        if existing:
            print(f"[dev.db] User đã tồn tại (id={existing.id}), cập nhật mật khẩu.")
            existing.password_hash = AuthService.hash_password(PASSWORD)
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing
        user = auth.register(USERNAME, EMAIL, PASSWORD, display_name="Tezca")
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
    user = create_local()
    mirror_to_turso(user)
    print("Hoàn tất.")
    print(f"  username: {USERNAME}")
    print(f"  email:    {EMAIL}")
    print(f"  password: {PASSWORD}")


if __name__ == "__main__":
    main()
