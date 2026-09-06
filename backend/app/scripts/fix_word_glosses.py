"""Sửa các gloss tiếng Việt sai hoặc tự lộ đáp án trong bảng ``words``.

Chạy từ thư mục backend:
    python -m app.scripts.fix_word_glosses --dry-run
    python -m app.scripts.fix_word_glosses

Vì sao sửa ở ĐÂY chứ không sửa từng câu hỏi: ``meaning_vi`` là nguồn của cả đáp
án đúng lẫn distractor của mọi câu ``vocab`` (5.594/5.881 câu lấy trực tiếp từ
đây), lại còn là text hiển thị trong thư viện từ và thẻ ôn tập. Sửa ở bảng
``words`` thì mọi câu sinh SAU đều đúng; sửa từng câu thì lỗi mọc lại ở lần
``pregenerate`` kế tiếp.

Ghi cả vào ``app/data/words_export.json`` — nguồn mà ``load_words`` dùng để nạp
DB mới và đẩy lên prod. Bỏ bước này thì lần ``load_words --overwrite`` sau sẽ
mang gloss sai trở lại.

Idempotent: mỗi bản sửa chỉ áp dụng khi gloss hiện tại KHỚP giá trị sai đã biết,
nên chạy lại lần hai không đổi gì và không đè mất bản sửa tay về sau.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Word

logger = logging.getLogger(__name__)

EXPORT_PATH = Path(__file__).resolve().parents[1] / "data" / "words_export.json"

# (hanzi, hsk_level, gloss_sai, gloss_đúng, lý do)
CORRECTIONS: list[tuple[str, int, str, str, str]] = [
    (
        "把", 3, "Đem (cấu trúc 把)", "đem; đưa (giới từ đảo tân ngữ)",
        "Gloss chứa chính chữ 把 đang hỏi: ở câu 'Chọn nghĩa đúng của: 把' thì "
        "lựa chọn duy nhất có chữ Hán chính là đáp án, người học không biết gì "
        "vẫn chọn đúng (câu 2556).",
    ),
    (
        "把", 4, "(tân ngữ đảo trí)", "đem; đưa (giới từ đảo tân ngữ)",
        "Gloss chỉ là chú thích ngữ pháp, không phải nghĩa — không thể nhận ra "
        "trong 4 lựa chọn (câu 11921). Dùng cùng cách diễn đạt với 把 cấp 3.",
    ),
    (
        "竟然", 5, "thậm chí", "thế mà; không ngờ; lại",
        "'thậm chí' là nghĩa của 甚至. 竟然 là phó từ biểu thị sự ngoài dự tính. "
        "Bản ghi 竟然 cấp 4 đã đúng ('bất ngờ').",
    ),
    (
        "妻子", 2, "vợ con", "vợ",
        "'vợ con' là cách đọc chữ theo nghĩa cổ 妻+子 (đúng với meaning_en 'wife "
        "and children'). Tiếng Trung hiện đại 妻子 = vợ, như câu 4966 đang dùng.",
    ),
    (
        "吧", 1, "(trợ từ)", "trợ từ: nhé; đi; thôi",
        "'(trợ từ)' không phân biệt được với 呢/啊/嘛 — cả bốn đều là trợ từ, nên "
        "câu 5241 có tới hai lựa chọn hợp lý. Nêu rõ nghĩa cầu khiến/đề nghị.",
    ),
]


def _apply_to_db(dry_run: bool) -> tuple[int, int, list[str]]:
    applied = skipped = 0
    notes: list[str] = []
    with SessionLocal() as db:
        for hanzi, level, wrong, right, _reason in CORRECTIONS:
            word = db.scalar(
                select(Word).where(Word.hanzi == hanzi, Word.hsk_level == level)
            )
            if word is None:
                notes.append(f"{hanzi} (HSK{level}): không có trong DB")
                skipped += 1
                continue
            current = (word.meaning_vi or "").strip()
            if current == right:
                skipped += 1
                continue
            if current != wrong:
                notes.append(
                    f"{hanzi} (HSK{level}): gloss hiện tại {current!r} khác giá trị "
                    f"sai đã biết {wrong!r} — bỏ qua để không đè bản sửa tay"
                )
                skipped += 1
                continue
            word.meaning_vi = right
            applied += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
    return applied, skipped, notes


def _apply_to_export(dry_run: bool) -> int:
    if not EXPORT_PATH.exists():
        logger.warning("Không thấy %s — bỏ qua bước ghi export.", EXPORT_PATH)
        return 0
    payload = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    rows = payload.get("words") or []
    wanted = {(hanzi, level): right for hanzi, level, _w, right, _r in CORRECTIONS}
    known_wrong = {(hanzi, level): wrong for hanzi, level, wrong, _r, _x in CORRECTIONS}

    changed = 0
    for row in rows:
        key = (row.get("hanzi"), int(row.get("hsk_level") or 0))
        if key not in wanted:
            continue
        current = (row.get("meaning_vi") or "").strip()
        if current != known_wrong[key]:
            continue
        row["meaning_vi"] = wanted[key]
        changed += 1

    if changed and not dry_run:
        # ``indent=1`` khớp ``export_words.py``: dùng indent khác sẽ tạo diff
        # toàn bộ 5.851 dòng thay vì đúng 5 dòng vừa sửa.
        EXPORT_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Sửa gloss tiếng Việt sai trong bảng words")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ báo cáo, không ghi")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stdout, force=True
    )

    applied, skipped, notes = _apply_to_db(args.dry_run)
    exported = _apply_to_export(args.dry_run)

    verb = "Sẽ sửa" if args.dry_run else "Đã sửa"
    logger.info("%s %s gloss trong DB (bỏ qua %s).", verb, applied, skipped)
    logger.info("%s %s dòng trong words_export.json.", verb, exported)
    for note in notes:
        logger.info("  %s", note)
    if args.dry_run:
        logger.info("Chạy lại không có --dry-run để ghi.")


if __name__ == "__main__":
    main()
