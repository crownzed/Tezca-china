import re
import uuid
from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models import User
from ..settings import settings

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# bcrypt chỉ xử lý tối đa 72 byte; cắt thủ công để tránh ValueError ở bcrypt 4.x.
BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def hash_password(password: str) -> str:
        return bcrypt.hashpw(_to_bcrypt_bytes(password), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(_to_bcrypt_bytes(password), password_hash.encode("utf-8"))
        except (ValueError, TypeError):
            return False

    @staticmethod
    def create_token(user_id: str) -> str:
        expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
        payload = {"sub": user_id, "exp": expire}
        return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

    @staticmethod
    def decode_token(token: str) -> str | None:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
            user_id = payload.get("sub")
            return user_id if isinstance(user_id, str) else None
        except JWTError:
            return None

    def get_user_by_id(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_user_by_login(self, login: str) -> User | None:
        login = login.strip().lower()
        return self.db.scalar(
            select(User).where(or_(User.username == login, User.email == login))
        )

    def register(self, username: str, email: str, password: str, display_name: str | None = None) -> User:
        username = username.strip().lower()
        email = email.strip().lower()
        if len(username) < 3:
            raise ValueError("username_too_short")
        if len(password) < 6:
            raise ValueError("password_too_short")
        if not EMAIL_PATTERN.match(email):
            raise ValueError("invalid_email")
        if self.get_user_by_login(username) or self.get_user_by_login(email):
            raise ValueError("user_exists")

        user = User(
            id=str(uuid.uuid4()),
            username=username,
            email=email,
            password_hash=self.hash_password(password),
            display_name=(display_name or username).strip()[:64],
            leaderboard_opt_in=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, login: str, password: str) -> User:
        user = self.get_user_by_login(login)
        if not user or not self.verify_password(password, user.password_hash):
            raise ValueError("invalid_credentials")
        return user

    def update_profile(
        self,
        user: User,
        display_name: str | None = None,
        leaderboard_opt_in: bool | None = None,
    ) -> User:
        if display_name is not None:
            user.display_name = display_name.strip()[:64] or user.display_name
        if leaderboard_opt_in is not None:
            user.leaderboard_opt_in = leaderboard_opt_in
        self.db.commit()
        self.db.refresh(user)
        return user

    def change_password(self, user: User, old_password: str, new_password: str) -> None:
        if not self.verify_password(old_password, user.password_hash):
            raise ValueError("wrong_password")
        if len(new_password) < 6:
            raise ValueError("password_too_short")
        user.password_hash = self.hash_password(new_password)
        self.db.commit()

    def list_users(self) -> list[User]:
        return list(self.db.scalars(select(User).order_by(User.created_at)))

    def set_role(self, target: User, role: str) -> User:
        if role not in ("user", "admin"):
            raise ValueError("invalid_role")
        target.role = role
        self.db.commit()
        self.db.refresh(target)
        return target

    def set_active(self, target: User, is_active: bool) -> User:
        target.is_active = is_active
        self.db.commit()
        self.db.refresh(target)
        return target

    def admin_reset_password(self, target: User, new_password: str) -> None:
        if len(new_password) < 6:
            raise ValueError("password_too_short")
        target.password_hash = self.hash_password(new_password)
        self.db.commit()
