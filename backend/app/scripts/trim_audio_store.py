"""Cắt lặng đầu/cuối cho KHO MP3 TĨNH đã dựng (public/audio).

Vì sao cần chạy một lần cho kho: ``/tts`` giờ cắt lặng cho mọi clip nó sinh ra,
nhưng 15.404 clip trong ``public/audio`` đã được dựng TRƯỚC đó. Frontend ưu tiên
clip local (``getLocalAudioSrc``), nên phần lớn lượt phát vẫn đi qua kho cũ — tức
bản sửa không tới được người học nếu không xử lý kho.

Đo trên 400 clip lấy mẫu: lặng đầu 120-760ms (trung vị 260ms). Sau khi cắt, mọi
clip có cùng ~80ms đệm đầu và ~150ms đệm cuối.

Chạy thử trước (không ghi gì):
    cd backend && python -m app.scripts.trim_audio_store --dry-run

Ghi thật:
    cd backend && python -m app.scripts.trim_audio_store

An toàn: ghi qua file tạm rồi ``os.replace`` (nguyên tử) nên Ctrl-C không để lại
file nửa vời. ``mp3_trim.trim_silence`` trả bytes GỐC ở mọi ca bất định, và script
này bỏ qua clip không cắt được thay vì cố xử lý.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

from ..services import mp3_trim


def _audio_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", "..", "public", "audio"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="chỉ báo cáo, không ghi file")
    parser.add_argument("--limit", type=int, default=0,
                        help="chỉ xử lý N file đầu (để thử)")
    args = parser.parse_args(argv)

    root = _audio_dir()
    index_path = os.path.join(root, "index.json")
    if not os.path.isdir(root) or not os.path.exists(index_path):
        print(f"!! không thấy kho audio ở {root}")
        return 1

    with open(index_path, encoding="utf-8") as fh:
        index = json.load(fh)

    # Đi qua index chứ không qua glob: file không có entry nào trỏ tới thì không
    # ai phát, cắt nó chỉ là rủi ro không đổi lấy gì.
    stems = sorted(set(index.values()))
    if args.limit:
        stems = stems[:args.limit]

    trimmed = skipped = missing = 0
    saved = 0
    for n, stem in enumerate(stems, 1):
        path = os.path.join(root, f"{stem}.mp3")
        if not os.path.exists(path):
            missing += 1
            continue
        with open(path, "rb") as fh:
            raw = fh.read()
        cut = mp3_trim.trim_silence(raw)
        if cut is raw or len(cut) >= len(raw):
            skipped += 1
        else:
            saved += len(raw) - len(cut)
            trimmed += 1
            if not args.dry_run:
                fd, tmp = tempfile.mkstemp(dir=root, suffix=".tmp")
                try:
                    with os.fdopen(fd, "wb") as out:
                        out.write(cut)
                    os.replace(tmp, path)   # nguyên tử: Ctrl-C không để lại file nửa vời
                except BaseException:
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass
                    raise
        if n % 1000 == 0:
            print(f"  {n}/{len(stems)}  cắt {trimmed}  bỏ qua {skipped}  "
                  f"tiết kiệm {saved/1e6:.1f}MB")

    print()
    print(f"{'THỬ (không ghi)' if args.dry_run else 'ĐÃ GHI'}: "
          f"{trimmed} file cắt, {skipped} bỏ qua, {missing} thiếu file")
    print(f"dung lượng giảm {saved/1e6:.1f}MB")
    if args.dry_run and trimmed:
        print("\nChạy lại không có --dry-run để ghi thật.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
