"""M9 + S3: Thêm cột timezone và streak freeze vào bảng users/user_streaks (idempotent).

Chạy một lần sau khi deploy code mới:
    python -m app.scripts.migrate_user_timezone

SQLite/PostgreSQL đều an toàn khi chạy lại — try/except bỏ qua nếu cột đã tồn tại.
Default 'Asia/Shanghai' cho Chinese learners; user có thể đổi qua profile settings.
S3: Freeze columns bảo vệ streak 1 ngày/tháng.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import text

from app.db import engine


def _add_column(conn, table: str, col_name: str, col_def: str, dialect: str) -> None:
    """Add column idempotently across SQLite and PostgreSQL."""
    if dialect == "sqlite":
        try:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
            print(f"  + Added {table}.{col_name}")
        except Exception as exc:
            err = str(exc).lower()
            if "duplicate" in err or "already exists" in err:
                print(f"  ~ {table}.{col_name} already exists")
            else:
                raise
    else:
        try:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_name} {col_def}"
            ))
            print(f"  + Added {table}.{col_name} ({dialect})")
        except Exception as exc:
            err = str(exc).lower()
            if "already exists" in err or "duplicate" in err:
                print(f"  ~ {table}.{col_name} already exists")
            else:
                raise


def main() -> None:
    with engine.begin() as conn:
        dialect = conn.dialect.name

        # M9: Timezone column on users
        _add_column(conn, "users", "timezone", "VARCHAR(64) DEFAULT 'Asia/Shanghai'", dialect)

        # Backfill timezone
        result = conn.execute(text(
            "UPDATE users SET timezone = 'Asia/Shanghai' WHERE timezone IS NULL"
        ))
        if result.rowcount:
            print(f"  + Backfilled {result.rowcount} users with default timezone")

        # S3: Streak freeze columns on user_streaks
        _add_column(conn, "user_streaks", "freezes_remaining", "INTEGER DEFAULT 1", dialect)
        _add_column(conn, "user_streaks", "last_freeze_date", "DATETIME", dialect)
        _add_column(conn, "user_streaks", "freeze_month", "VARCHAR(7) DEFAULT ''", dialect)

    print("\n✅ Migration complete.")
    print("   M9: Users can set timezone via profile.")
    print("   S3: Streak freeze available (1/month).")


if __name__ == "__main__":
    main()
