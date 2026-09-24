#!/usr/bin/env python3
"""Quản lý GEMINI_NATIVE_API_KEYS trong backend/.env

Cách dùng:
  python scripts/import_gemini_keys.py add KEY1 KEY2 ...   # Thêm key mới
  python scripts/import_gemini_keys.py remove KEY1 ...     # Xóa key
  python scripts/import_gemini_keys.py list                # Liệt kê key hiện có
  python scripts/import_gemini_keys.py set KEY1,KEY2,...   # Thay thế toàn bộ
  python scripts/import_gemini_keys.py validate            # Kiểm tra format key

Key hợp lệ bắt đầu bằng "AIzaSy" (40 ký tự) hoặc "AQ.Ab8" (OAuth token).
"""
import re
import sys
from pathlib import Path

# .env nằm trong backend/, script này nằm trong scripts/
ENV_FILE = Path(__file__).resolve().parent.parent / "backend" / ".env"
KEY_NAME = "GEMINI_NATIVE_API_KEYS"

# Pattern nhận diện key Gemini hợp lệ
VALID_KEY_PATTERNS = [
    r"^AIzaSy[A-Za-z0-9_-]{33}$",      # API key chuẩn (40 ký tự)
    r"^AQ\.Ab8[A-Za-z0-9_-]+$",         # OAuth access token
]


def parse_env() -> dict[str, str]:
    """Đọc .env thành dict, giữ nguyên comment và thứ tự."""
    if not ENV_FILE.exists():
        return {}
    result = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip()
    return result


def write_env_key(key: str, value: str) -> None:
    """Cập nhật hoặc thêm một biến vào .env, giữ nguyên các dòng khác."""
    lines = []
    found = False
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith(f"{key}="):
                lines.append(f"{key}={value}")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def get_current_keys() -> list[str]:
    """Trả danh sách key hiện tại từ .env."""
    env = parse_env()
    raw = env.get(KEY_NAME, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


def is_valid_key(key: str) -> bool:
    """Kiểm tra format key Gemini."""
    return any(re.match(p, key) for p in VALID_KEY_PATTERNS)


def cmd_list() -> None:
    keys = get_current_keys()
    if not keys:
        print("Chưa có key nào.")
        return
    print(f"Đang có {len(keys)} key(s):")
    for i, k in enumerate(keys, 1):
        masked = k[:8] + "..." + k[-4:] if len(k) > 12 else k
        valid = "✓" if is_valid_key(k) else "✗ INVALID"
        print(f"  {i}. {masked} {valid}")


def cmd_validate(keys: list[str]) -> None:
    if not keys:
        print("Không có key nào để kiểm tra.")
        return
    ok = 0
    bad = 0
    for k in keys:
        if is_valid_key(k):
            print(f"  ✓ {k[:8]}...{k[-4:]}")
            ok += 1
        else:
            print(f"  ✗ {k} — KHÔNG HỢP LỆ")
            bad += 1
    print(f"\nKết quả: {ok} hợp lệ, {bad} không hợp lệ.")


def cmd_add(new_keys: list[str]) -> None:
    # Validate trước
    invalid = [k for k in new_keys if not is_valid_key(k)]
    if invalid:
        print("Key không hợp lệ:")
        for k in invalid:
            print(f"  ✗ {k}")
        print("\nHủy thao tác. Sửa key rồi thử lại.")
        sys.exit(1)

    current = get_current_keys()
    added = []
    skipped = []
    for k in new_keys:
        if k in current:
            skipped.append(k)
        else:
            current.append(k)
            added.append(k)

    if added:
        write_env_key(KEY_NAME, ",".join(current))
        print(f"Đã thêm {len(added)} key(s):")
        for k in added:
            print(f"  + {k[:8]}...{k[-4:]}")
    if skipped:
        print(f"Bỏ qua {len(skipped)} key(s) đã tồn tại:")
        for k in skipped:
            print(f"  ~ {k[:8]}...{k[-4:]}")
    print(f"\nTổng cộng: {len(current)} key(s)")


def cmd_remove(to_remove: list[str]) -> None:
    current = get_current_keys()
    removed = []
    for k in to_remove:
        # Hỗ trợ match prefix (ít nhất 8 ký tự)
        matches = [c for c in current if c == k or (len(k) >= 8 and c.startswith(k))]
        for m in matches:
            if m in current:
                current.remove(m)
                removed.append(m)

    if removed:
        write_env_key(KEY_NAME, ",".join(current))
        print(f"Đã xóa {len(removed)} key(s):")
        for k in removed:
            print(f"  - {k[:8]}...{k[-4:]}")
    else:
        print("Không tìm thấy key nào khớp.")
    print(f"Còn lại: {len(current)} key(s)")


def cmd_set(raw: str) -> None:
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    invalid = [k for k in keys if not is_valid_key(k)]
    if invalid:
        print("Key không hợp lệ:")
        for k in invalid:
            print(f"  ✗ {k}")
        print("\nHủy thao tác.")
        sys.exit(1)

    write_env_key(KEY_NAME, ",".join(keys))
    print(f"Đã đặt {len(keys)} key(s).")
    cmd_list()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()

    if cmd == "list":
        cmd_list()
    elif cmd == "validate":
        keys = sys.argv[2:] if len(sys.argv) > 2 else get_current_keys()
        cmd_validate(keys)
    elif cmd == "add":
        if len(sys.argv) < 3:
            print("Dùng: python scripts/import_gemini_keys.py add KEY1 KEY2 ...")
            sys.exit(1)
        cmd_add(sys.argv[2:])
    elif cmd == "remove":
        if len(sys.argv) < 3:
            print("Dùng: python scripts/import_gemini_keys.py remove KEY1 ...")
            sys.exit(1)
        cmd_remove(sys.argv[2:])
    elif cmd == "set":
        if len(sys.argv) < 3:
            print("Dùng: python scripts/import_gemini_keys.py set KEY1,KEY2,...")
            sys.exit(1)
        cmd_set(sys.argv[2])
    else:
        print(f"Lệnh không biết: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
