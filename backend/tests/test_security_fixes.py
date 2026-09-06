"""Test khoá hành vi cho các bản sửa bảo mật (SECURITY-AUDIT.md: H1, H4, H5, H6, M7).

Chạy: cd backend && python -m pytest tests/test_security_fixes.py

Mỗi lớp dưới đây khoá một thuộc tính mà nếu mất đi thì lỗ hổng gốc mở lại y như
cũ, nên chúng được viết theo hướng "chứng minh đường khai thác đã chết", không
phải "gọi hàm xem có chạy".
"""

import logging
import unittest
from contextlib import ExitStack
from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import MaxBodySizeMiddleware
from app.models import User
from app.routers import admin as admin_module
from app.routers.admin import router as admin_router
from app.services.auth_service import AuthService
from app.services.email_service import EmailService
from app.settings import settings as app_settings

_LIMIT = 2048


def _app_with_body_limit(*, with_cors: bool = False) -> FastAPI:
    app = FastAPI()

    @app.post("/echo")
    async def echo(payload: dict):
        return {"got": len(payload.get("blob", ""))}

    # Thứ tự PHẢI khớp main.py: trần body đăng ký TRƯỚC, CORS SAU, để CORS nằm
    # ngoài và gắn được header vào chính phản hồi 413.
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=_LIMIT)
    if with_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["https://example.test"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    return app


class MaxBodySizeTest(unittest.TestCase):
    """H6 — body vượt trần bị chặn TRƯỚC khi vào RAM."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(_app_with_body_limit())

    def test_body_under_limit_passes(self):
        res = self.client.post("/echo", json={"blob": "x" * 100})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["got"], 100)

    def test_declared_content_length_over_limit_is_413(self):
        res = self.client.post("/echo", json={"blob": "x" * (_LIMIT * 4)})
        self.assertEqual(res.status_code, 413, res.text)
        self.assertIn("vượt trần", res.json()["detail"])

    def test_chunked_body_over_limit_is_413(self):
        """Không có Content-Length thì phải đếm khi stream.

        Nếu chỉ tin Content-Length, kẻ tấn công bỏ header đó (hoặc khai thấp) là
        vượt được — đúng cái mà H6 nói tới, vì OOM xảy ra ở tầng đọc body.
        """

        def chunks():
            for _ in range(8):
                yield b"a" * 1024

        res = self.client.post(
            "/echo",
            content=chunks(),
            headers={"content-type": "application/json"},
        )
        self.assertEqual(res.status_code, 413, res.text)

    def test_handler_never_runs_for_oversized_body(self):
        """Chặn phải xảy ra TRƯỚC route, không phải sau khi đã đọc xong."""
        seen = []
        app = FastAPI()

        @app.post("/spy")
        async def spy(payload: dict):
            seen.append(len(payload.get("blob", "")))
            return {"ok": True}

        app.add_middleware(MaxBodySizeMiddleware, max_bytes=_LIMIT)
        client = TestClient(app)
        res = client.post("/spy", json={"blob": "x" * (_LIMIT * 4)})
        self.assertEqual(res.status_code, 413)
        self.assertEqual(seen, [])

    def test_413_carries_cors_headers(self):
        """CORS phải nằm NGOÀI trần body.

        Nếu ngược lại, browser của người dùng thật gửi audio quá lớn sẽ thấy một
        lỗi CORS mờ mịt thay vì 413 đọc được — và người sửa sẽ đi tìm sai chỗ.
        """
        client = TestClient(_app_with_body_limit(with_cors=True))
        res = client.post(
            "/echo",
            json={"blob": "x" * (_LIMIT * 4)},
            headers={"origin": "https://example.test"},
        )
        self.assertEqual(res.status_code, 413, res.text)
        self.assertEqual(
            res.headers.get("access-control-allow-origin"), "https://example.test"
        )


class AdminLoginRateLimitTest(unittest.TestCase):
    """H4 — /api/admin/login có trần theo IP và trần toàn cục."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(admin_router)
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        admin_module._admin_login_ip_limiter._hits.clear()
        admin_module._admin_login_global_limiter._hits.clear()

    def _login(self, ip: str):
        return self.client.post(
            "/api/admin/login",
            json={"email": "who@example.test", "password": "khong-dung"},
            headers={"fly-client-ip": ip},
        )

    def test_blocks_after_limit_from_one_ip(self):
        limit = admin_module._admin_login_ip_limiter.max_hits
        with patch.object(admin_module, "verify_admin_credentials", return_value=False):
            allowed = [self._login("198.51.100.5").status_code for _ in range(limit)]
            over = self._login("198.51.100.5")
        self.assertNotIn(429, allowed)
        self.assertEqual(over.status_code, 429, over.text)

    def test_limiter_runs_before_bcrypt(self):
        """Trần phải chặn TRƯỚC verify: bcrypt cost 12 (~219ms) chính là vector
        đốt CPU trên shared-cpu-1x, nên đếm sau khi verify là vô nghĩa."""
        limit = admin_module._admin_login_ip_limiter.max_hits
        with ExitStack() as stack:
            stack.enter_context(patch.object(app_settings, "admin_email", "a@b.test"))
            stack.enter_context(patch.object(app_settings, "admin_password_hash", "x"))
            verify = stack.enter_context(
                patch.object(admin_module, "verify_admin_credentials", return_value=False)
            )
            for _ in range(limit):
                self.assertEqual(self._login("198.51.100.6").status_code, 401)
            self.assertEqual(verify.call_count, limit)
            self.assertEqual(self._login("198.51.100.6").status_code, 429)
            # Lượt bị 429 KHÔNG được chạm tới bcrypt.
            self.assertEqual(verify.call_count, limit)

    def test_forged_forwarded_for_cannot_reset_the_counter(self):
        """M7 cùng lớp lỗi: khoá phải là Fly-Client-IP, không phải header client gửi."""
        limit = admin_module._admin_login_ip_limiter.max_hits
        with patch.object(admin_module, "verify_admin_credentials", return_value=False):
            allowed = []
            for i in range(limit):
                res = self.client.post(
                    "/api/admin/login",
                    json={"email": "who@example.test", "password": "sai"},
                    headers={"fly-client-ip": "198.51.100.8", "x-forwarded-for": f"10.0.0.{i}"},
                )
                allowed.append(res.status_code)
            over = self.client.post(
                "/api/admin/login",
                json={"email": "who@example.test", "password": "sai"},
                headers={"fly-client-ip": "198.51.100.8", "x-forwarded-for": "10.0.0.99"},
            )
        self.assertNotIn(429, allowed)
        self.assertEqual(over.status_code, 429, over.text)

    def test_global_cap_blocks_distributed_guessing(self):
        """Đổi IP mỗi lượt vẫn phải dừng ở trần toàn cục — admin là tài khoản duy
        nhất nên trần global không ảnh hưởng người dùng thường."""
        cap = admin_module._admin_login_global_limiter.max_hits
        with patch.object(admin_module, "verify_admin_credentials", return_value=False):
            statuses = [self._login(f"198.51.100.{i % 250}").status_code for i in range(cap + 1)]
        self.assertEqual(statuses[-1], 429)
        self.assertNotIn(429, statuses[:cap])


class BannedUserTokenTest(unittest.TestCase):
    """H5 — khoá tài khoản phải có tác dụng NGAY, không đợi token hết hạn (168h)."""

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

        with cls.Session() as db:
            user = AuthService(db).register("nguoihoc", "nguoihoc@example.test", "matkhau123")
            cls.user_id = user.id
        cls.token = AuthService.create_token(cls.user_id)

        app = FastAPI()

        @app.get("/me")
        def me(current=Depends(get_current_user)):
            return {"id": current.id}

        app.dependency_overrides[get_db] = cls._override_db
        cls.client = TestClient(app)

    @classmethod
    def _override_db(cls):
        db = cls.Session()
        try:
            yield db
        finally:
            db.close()

    def _set_active(self, value):
        with self.Session() as db:
            user = db.get(User, self.user_id)
            user.is_active = value
            db.commit()

    def _call(self):
        return self.client.get("/me", headers={"Authorization": f"Bearer {self.token}"})

    def test_active_user_passes(self):
        self._set_active(True)
        res = self._call()
        self.assertEqual(res.status_code, 200, res.text)

    def test_banned_user_token_is_rejected(self):
        """Trước bản sửa: is_active chỉ được đọc ở đường đăng nhập, nên token đã
        phát vẫn gọi được mọi route đã xác thực suốt phần TTL còn lại."""
        self._set_active(False)
        try:
            res = self._call()
        finally:
            self._set_active(True)
        self.assertEqual(res.status_code, 401, res.text)

    def test_null_is_active_is_not_treated_as_banned(self):
        """Cột này NOT NULL trong schema do SQLAlchemy dựng, nhưng KHÔNG phải ở mọi
        nơi dữ liệu đi vào: ``create_fixed_account.py`` tạo bảng ``users`` trên Turso
        bằng DDL viết tay ``is_active BOOLEAN DEFAULT 1`` — không có NOT NULL. Một
        hàng ghi qua đường đó (hoặc qua bất kỳ client SQL nào) có thể mang NULL.

        Viết ``not user.is_active`` sẽ đăng xuất đúng những hàng đó dù chưa ai khoá
        họ — "sửa sai làm khoá người dùng thật ra ngoài". Phải là so sánh identity
        với False. Test này dựng lại chính DDL permissive kia để chứng minh.
        """
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        with engine.begin() as conn:
            # Khớp DDL trong create_fixed_account.mirror_to_turso: is_active KHÔNG NOT NULL.
            conn.execute(
                text(
                    "CREATE TABLE users ("
                    "id VARCHAR(36) PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL, "
                    "email VARCHAR(128) UNIQUE NOT NULL, password_hash VARCHAR(256) NOT NULL, "
                    "display_name VARCHAR(64) NOT NULL, leaderboard_opt_in BOOLEAN DEFAULT 1, "
                    "is_active BOOLEAN DEFAULT 1, last_seen_at DATETIME, created_at DATETIME)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO users (id, username, email, password_hash, display_name, "
                    "leaderboard_opt_in, is_active, last_seen_at, created_at) VALUES "
                    "('u-null', 'nullactive', 'nullactive@example.test', 'x', 'Null', 1, NULL, "
                    "NULL, '2026-01-01 00:00:00')"
                )
            )
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

        app = FastAPI()

        @app.get("/me")
        def me(current=Depends(get_current_user)):
            return {"id": current.id}

        def _db():
            db = Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _db
        client = TestClient(app)
        res = client.get(
            "/me", headers={"Authorization": f"Bearer {AuthService.create_token('u-null')}"}
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["id"], "u-null")


class ResetLinkLoggingTest(unittest.TestCase):
    """H1 — link đặt lại mật khẩu không được rơi vào log theo mặc định."""

    _BODY = "Đặt lại: https://app.test/reset-password?token=TOKEN-BI-MAT-123456"

    def _send(self, *, env: str, debug_log: bool):
        with ExitStack() as stack:
            stack.enter_context(patch.object(app_settings, "smtp_host", ""))
            stack.enter_context(patch.object(app_settings, "smtp_from", ""))
            stack.enter_context(patch.object(app_settings, "smtp_user", ""))
            stack.enter_context(patch.object(app_settings, "env", env))
            stack.enter_context(patch.object(app_settings, "email_debug_log", debug_log))
            with self.assertLogs("app.services.email_service", level="INFO") as captured:
                sent = EmailService.send("ai@example.test", "Đặt lại mật khẩu", self._BODY)
        self.assertFalse(sent)
        return "\n".join(captured.output)

    def test_token_not_logged_in_development_by_default(self):
        """Ca hồi quy quan trọng nhất.

        Điều kiện cũ là ``not is_production``, và vì ENV không được đặt ở đâu cả
        thì máy production THẬT cũng đi vào đúng nhánh này — tức link reset còn
        hiệu lực 30 phút bị đổ vào log stream của Fly.
        """
        output = self._send(env="development", debug_log=False)
        self.assertNotIn("TOKEN-BI-MAT-123456", output)
        self.assertNotIn(self._BODY, output)
        self.assertIn("body_hash=", output)

    def test_token_not_logged_in_production(self):
        output = self._send(env="production", debug_log=False)
        self.assertNotIn("TOKEN-BI-MAT-123456", output)

    def test_debug_flag_opts_in_explicitly(self):
        """Máy dev vẫn phải lấy được link, nhưng chỉ khi bật tường minh."""
        output = self._send(env="development", debug_log=True)
        self.assertIn("TOKEN-BI-MAT-123456", output)

    def test_flag_does_not_depend_on_env(self):
        """Cờ là mốc DUY NHẤT: đặt sai/thiếu ENV không được mở lại lỗ rò."""
        self.assertNotIn("TOKEN-BI-MAT-123456", self._send(env="prodution", debug_log=False))


if __name__ == "__main__":
    unittest.main()
