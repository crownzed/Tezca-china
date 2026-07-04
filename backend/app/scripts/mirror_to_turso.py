"""Mirror ``dev.db`` (SQLite) lên Turso (libSQL) qua HTTP pipeline API.

Driver ``sqlalchemy-libsql`` cần build Rust nên fail trên Python 3.13; nhưng
Turso có HTTP API (``/v2/pipeline``) gọi bằng ``urllib`` thuần là đủ để nạp dữ
liệu. Script dùng ``sqlite3.iterdump()`` (built-in) lấy toàn bộ DDL + INSERT của
``dev.db`` rồi đẩy lên Turso theo lô.

Đọc TURSO_DATABASE_URL + TURSO_AUTH_TOKEN từ settings/env. URL dạng
``libsql://<host>`` được đổi sang ``https://<host>/v2/pipeline`` khi gọi.

Dùng:
    python -m app.scripts.mirror_to_turso              # mirror (giữ dữ liệu cũ)
    python -m app.scripts.mirror_to_turso --reset      # DROP bảng trước khi nạp
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import urllib.request
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

DEV_DB = Path(__file__).resolve().parents[2] / "dev.db"
STMTS_PER_REQUEST = 100          # số câu SQL mỗi lần gọi pipeline
# Bảng mirror (bỏ bảng runtime/nhật ký người dùng để prod sạch).
TABLES = ["words", "examples", "questions"]


def _http_url(raw: str) -> str:
    """libsql://host  ->  https://host/v2/pipeline (HTTP API endpoint)."""
    url = raw.strip()
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    elif url.startswith("wss://"):
        url = "https://" + url[len("wss://"):]
    return url.rstrip("/") + "/v2/pipeline"


def _pipeline(url: str, token: str, sqls: list[str]) -> None:
    """Gửi 1 lô câu SQL trong một transaction; ném lỗi nếu Turso trả error."""
    requests = [{"type": "execute", "stmt": {"sql": s}} for s in sqls]
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
            raise RuntimeError(f"Turso lỗi ở câu #{i}: {err.get('message')}\nSQL: {sqls[i][:200]}")


def _dump_statements(reset: bool) -> list[str]:
    """Lấy DDL + INSERT từ dev.db qua iterdump, lọc lệnh không hợp cho Turso.

    Sắp xếp lại theo phụ thuộc: iterdump có thể phát bảng ``examples`` (FK tới
    ``words``) TRƯỚC khi ``words`` được tạo. Ta gom riêng CREATE / INSERT / INDEX
    rồi phát theo đúng thứ tự TABLES (words -> examples -> questions) để INSERT
    không vấp ràng buộc khóa ngoại.
    """
    conn = sqlite3.connect(str(DEV_DB))

    def _match_table(s: str, verb: str) -> str | None:
        for t in TABLES:
            if s.startswith(f'{verb} "{t}"') or s.startswith(f"{verb} {t}"):
                return t
        return None

    creates: dict[str, str] = {}
    inserts: dict[str, list[str]] = {t: [] for t in TABLES}
    indexes: list[str] = []

    for line in conn.iterdump():
        s = line.strip()
        up = s.upper()
        if up in ("BEGIN TRANSACTION;", "COMMIT;") or up.startswith("PRAGMA"):
            continue
        if "SQLITE_SEQUENCE" in up:
            continue
        t = _match_table(s, "CREATE TABLE")
        if t:
            creates[t] = s
            continue
        t = _match_table(s, "INSERT INTO")
        if t:
            inserts[t].append(s)
            continue
        if up.startswith("CREATE INDEX") or up.startswith("CREATE UNIQUE INDEX"):
            if any(tbl in s for tbl in TABLES):
                indexes.append(s)
    conn.close()

    stmts: list[str] = []
    if reset:
        # DROP theo thứ tự ngược để không vấp FK (examples/questions trước words).
        for t in reversed(TABLES):
            stmts.append(f"DROP TABLE IF EXISTS {t};")
    # 1) Tạo tất cả bảng theo thứ tự phụ thuộc, 2) INSERT, 3) index.
    for t in TABLES:
        if t in creates:
            stmts.append(creates[t])
    for t in TABLES:
        stmts.extend(inserts[t])
    stmts.extend(indexes)
    return stmts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="DROP các bảng mirror trước khi nạp")
    args = parser.parse_args()

    from app.settings import settings
    raw_url = os.getenv("TURSO_DATABASE_URL") or getattr(settings, "turso_database_url", "")
    token = os.getenv("TURSO_AUTH_TOKEN") or getattr(settings, "turso_auth_token", "")
    if not raw_url or not token:
        raise SystemExit("Thiếu TURSO_DATABASE_URL / TURSO_AUTH_TOKEN trong .env")
    if not DEV_DB.exists():
        raise SystemExit(f"Không thấy {DEV_DB}")

    url = _http_url(raw_url)
    stmts = _dump_statements(args.reset)
    print(f"Mirror {len(stmts)} câu SQL lên Turso ({url})...")

    for start in range(0, len(stmts), STMTS_PER_REQUEST):
        batch = stmts[start:start + STMTS_PER_REQUEST]
        _pipeline(url, token, batch)
        print(f"  {min(start + len(batch), len(stmts))}/{len(stmts)}")

    # Xác minh số dòng trên Turso.
    counts = {}
    for t in TABLES:
        requests = [{"type": "execute", "stmt": {"sql": f"SELECT COUNT(*) FROM {t}"}}, {"type": "close"}]
        body = json.dumps({"requests": requests}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        rows = data["results"][0]["response"]["result"]["rows"]
        counts[t] = rows[0][0]["value"]
    print("Xong. Số dòng trên Turso:", counts)


if __name__ == "__main__":
    main()
