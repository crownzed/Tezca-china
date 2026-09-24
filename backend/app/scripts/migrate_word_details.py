"""Thêm 4 cột detail enrichment vào bảng words (idempotent).

Chạy một lần sau khi deploy code mới:
    python -m app.scripts.migrate_word_details

SQLite tự động bỏ qua ADD COLUMN nếu cột đã tồn tại (try/except),
nên chạy lại an toàn.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import text

from app.db import engine


COLUMNS = [
    ("semantic_notes", "TEXT DEFAULT ''"),
    ("usage_notes", "TEXT DEFAULT ''"),
    ("usage_patterns_json", "JSON DEFAULT '[]'"),
    ("character_analysis", "TEXT DEFAULT ''"),
]


def main() -> None:
    with engine.begin() as conn:
        for col_name, col_def in COLUMNS:
            try:
                conn.execute(text(f"ALTER TABLE words ADD COLUMN {col_name} {col_def}"))
                print(f"  + Added column: {col_name}")
            except Exception as exc:
                # SQLite ném OperationalError nếu cột đã tồn tại;
                # PostgreSQL ném ProgrammingError. Cả hai đều an toàn bỏ qua.
                err = str(exc).lower()
                if "duplicate" in err or "already exists" in err or "duplicate column" in err:
                    print(f"  ~ Column already exists: {col_name}")
                else:
                    print(f"  ! Warning adding {col_name}: {exc}")
    print("Done. Bảng words đã sẵn sàng cho detail enrichment.")


if __name__ == "__main__":
    main()
