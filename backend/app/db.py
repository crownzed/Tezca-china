from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .settings import settings


def _normalize_database_url(url: str) -> str:
    """Force the psycopg3 driver for Postgres URLs.

    Managed providers (Neon, Supabase, Cloud SQL) hand out URLs like
    ``postgres://`` or ``postgresql://``, which SQLAlchemy maps to the
    psycopg2 driver. Only psycopg3 (``psycopg[binary]``) is installed, so we
    rewrite the scheme to ``postgresql+psycopg://`` to avoid a boot-time
    ImportError. Leaves sqlite and already-qualified URLs untouched.
    """
    if url.startswith("postgresql+") or url.startswith("postgres+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


database_url = _normalize_database_url(settings.database_url)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
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
    if settings.database_url.startswith("sqlite"):
        _ensure_sqlite_word_columns()
        _ensure_sqlite_user_progress_columns()


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
