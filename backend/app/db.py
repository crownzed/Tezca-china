from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .settings import settings


def _is_turso(url: str) -> bool:
    """URL trỏ tới Turso/libSQL remote (không phải sqlite file local)."""
    return url.startswith("libsql://") or url.startswith("sqlite+libsql://")


def _normalize_database_url(url: str) -> str:
    """Chuẩn hóa scheme để khớp driver đã cài.

    - Postgres: các provider (Neon, Supabase, Cloud SQL) trả ``postgres://`` /
      ``postgresql://`` → SQLAlchemy map sang psycopg2, nhưng chỉ có psycopg3
      (``psycopg[binary]``). Rewrite sang ``postgresql+psycopg://``.
    - Turso/libSQL: ``libsql://host`` → ``sqlite+libsql://host?secure=true``
      (scheme của dialect ``sqlalchemy-libsql``; ``secure=true`` bật TLS remote).
      Auth token KHÔNG nhét vào URL mà truyền qua connect_args (xem _connect_args).
    - Còn lại (sqlite file, URL đã đủ scheme): giữ nguyên.
    """
    if _is_turso(url):
        host = url.split("://", 1)[1].split("?", 1)[0].rstrip("/")
        return f"sqlite+libsql://{host}?secure=true"
    if url.startswith("postgresql+") or url.startswith("postgres+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def _connect_args(raw_url: str, normalized_url: str) -> dict:
    if _is_turso(raw_url):
        # Dialect libSQL nhận auth_token qua connect_args. Không đặt
        # check_same_thread (kết nối remote, không phải sqlite file cục bộ).
        token = settings.turso_auth_token
        return {"auth_token": token} if token else {}
    if normalized_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


database_url = _normalize_database_url(settings.database_url)
connect_args = _connect_args(settings.database_url, database_url)
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    # Turso/libSQL là họ sqlite (hỗ trợ PRAGMA) nên dùng chung nhánh ensure cột.
    if settings.database_url.startswith("sqlite") or _is_turso(settings.database_url):
        _ensure_sqlite_word_columns()
        _ensure_sqlite_user_progress_columns()
    _ensure_user_columns()
    _ensure_indexes()


def _ensure_indexes() -> None:
    """Tạo index bổ sung trên DB đã tồn tại.

    ``create_all`` chỉ thêm index cho bảng MỚI, không ALTER bảng cũ. Các index
    dưới đây được thêm sau khi model đã deploy nên phải tạo bằng DDL riêng.
    ``CREATE INDEX IF NOT EXISTS`` được cả SQLite lẫn PostgreSQL hỗ trợ.
    """
    statements = [
        "CREATE INDEX IF NOT EXISTS ix_examples_source ON examples (source)",
        "CREATE INDEX IF NOT EXISTS ix_quiz_attempts_user_level_type_created "
        "ON quiz_attempts (user_id, level, quiz_type, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_questions_level_type_created "
        "ON questions (level, quiz_type, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_quiz_attempts_user_created "
        "ON quiz_attempts (user_id, created_at)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _ensure_sqlite_word_columns() -> None:
    columns = {
        "tone_pattern": "VARCHAR(32) DEFAULT ''",
        "character_family": "VARCHAR(32) DEFAULT ''",
        "component_hint": "TEXT DEFAULT ''",
        "collocations_json": "JSON DEFAULT '[]'",
        "confusable_words_json": "JSON DEFAULT '[]'",
        "topic": "VARCHAR(64) DEFAULT 'core'",
        "frequency_band": "VARCHAR(32) DEFAULT 'core_hsk'",
    }
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(words)"))}
        for name, ddl in columns.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE words ADD COLUMN {name} {ddl}"))

def _ensure_user_columns() -> None:
    """Thêm cột ``is_active`` và ``last_seen_at`` vào bảng ``users`` đã tồn tại.

    ``create_all`` không ALTER bảng cũ, nên user đã đăng ký trước khi có cột này
    sẽ thiếu cột -> mọi query User vỡ. SQLite/libSQL không hỗ trợ
    ``ADD COLUMN IF NOT EXISTS`` nên phải kiểm tra qua PRAGMA; Postgres hỗ trợ
    trực tiếp. ``is_active`` mặc định 1 (true) để user hiện có vẫn đăng nhập được
    sau migrate; ``last_seen_at`` để NULL (chưa từng thấy online sau khi thêm cột).
    """
    if settings.database_url.startswith("sqlite") or _is_turso(settings.database_url):
        with engine.begin() as conn:
            existing = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
            if "is_active" not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
            if "last_seen_at" not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_seen_at DATETIME"))
    else:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP"
            ))


def _ensure_sqlite_user_progress_columns() -> None:
    columns = {
        "ease": "FLOAT DEFAULT 2.5",
        "interval_days": "INTEGER DEFAULT 0",
        "repetition": "INTEGER DEFAULT 0",
        "lapses": "INTEGER DEFAULT 0",
        "next_review_at": "DATETIME",
        "recognition_score": "INTEGER DEFAULT 0",
        "listening_score": "INTEGER DEFAULT 0",
        "context_score": "INTEGER DEFAULT 0",
        "production_score": "INTEGER DEFAULT 0",
        "confidence_avg": "FLOAT DEFAULT 0",
        "latency_avg": "INTEGER DEFAULT 0",
        "error_json": "JSON DEFAULT '{}'",
    }
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(user_progress)"))}
        for name, ddl in columns.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE user_progress ADD COLUMN {name} {ddl}"))
