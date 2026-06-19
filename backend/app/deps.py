from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .services.auth_service import AuthService


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
    return AuthService(db).get_user_by_id(user_id)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa. Liên hệ quản trị viên.")
    return user

def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền quản trị viên.")
    return user


def resolve_user_id(
    user_id: str = Query(default="local-user"),
    current_user: User | None = Depends(get_optional_user),
) -> str:
    if current_user:
        return current_user.id
    return user_id
