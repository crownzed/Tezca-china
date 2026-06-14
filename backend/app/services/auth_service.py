import re
import uuid
from datetime import datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models import User
from ..settings import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        return pwd_context.verify(password, password_hash)

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
