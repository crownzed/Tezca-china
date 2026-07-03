"""Dịch nghĩa tiếng Việt cho các từ HSK 3.0 mới nhập (meaning_vi rỗng).

Nguồn dữ liệu chính thức (drkameleon/complete-hsk-vocabulary) chỉ có nghĩa
tiếng Anh. Script này tìm những từ còn thiếu ``meaning_vi``, dịch EN->VI theo
lô nhỏ (có kèm hanzi + pinyin làm ngữ cảnh để tránh dịch sai từ đồng âm), rồi
ghi vào DB. Chạy OFFLINE với API key, KHÔNG nằm trong đường request.

Đặc tính:
- Idempotent: chỉ đụng tới từ có ``meaning_vi`` rỗng, nên re-run an toàn và có
  thể chạy tăng dần (dừng giữa chừng rồi chạy tiếp cũng không hại).
- Commit theo từng lô: mất mạng/timeout ở lô sau không mất kết quả lô trước.
- Validate từng nghĩa: bỏ nghĩa rỗng / lẫn chữ Hán / quá dài, để lại cho lần sau.

Dùng:
    python -m app.scripts.translate_meanings                # tất cả cấp
    python -m app.scripts.translate_meanings --level 6      # chỉ 1 cấp
    python -m app.scripts.translate_meanings --limit 60     # dừng sớm (thử)
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Word
from app.services.llm_generator_service import _call_api

WORDS_PER_CALL = 15          # nhỏ để dịch cẩn thận + gọn trong max_tokens=4000
SLEEP_BETWEEN_CALLS = 1.5
MAX_MEANING_LEN = 120        # nghĩa VI dài hơn mức này gần như chắc là rác

# Nghĩa VI hợp lệ không được chứa chữ Hán (dấu hiệu LLM chép lại tiếng Trung).
_CJK = re.compile(r"[一-鿿]")


def _build_prompt(words: list[Word]) -> str:
    lines = []
    for w in words:
        en = (w.meaning_en or "").replace("\n", " ").strip()
        lines.append(f'- hanzi="{w.hanzi}", pinyin="{w.pinyin or ""}", nghĩa_tiếng_anh="{en}"')
    words_block = "\n".join(lines)

    return f"""Bạn là từ điển Trung-Việt chuẩn xác cho người Việt học HSK.

Với MỖI từ dưới đây, hãy cho nghĩa TIẾNG VIỆT ngắn gọn, tự nhiên, đúng như một
cuốn từ điển Trung-Việt. Dựa vào cả hanzi, pinyin và nghĩa tiếng Anh để chọn
đúng nghĩa (chú ý từ đồng âm khác nghĩa).

Danh sách từ:
{words_block}

RÀNG BUỘC BẮT BUỘC:
1. meaning_vi CHỈ là tiếng Việt, TUYỆT ĐỐI không chứa chữ Hán hay chữ Latinh phiên âm.
2. Ngắn gọn: 1-4 nghĩa chính, ngăn cách bằng dấu phẩy hoặc chấm phẩy (ví dụ: "học tập; nghiên cứu").
3. Sát nghĩa với từ gốc, KHÔNG bịa, KHÔNG giải thích dài dòng.
4. Giữ nguyên hanzi gốc trong output để đối chiếu.

OUTPUT CHỈ LÀ MỘT OBJECT JSON (không markdown, không giải thích thêm):
{{
  "words": [
    {{"hanzi": "学习", "meaning_vi": "học tập; học"}}
  ]
}}"""


def _validate_meaning(vi: str) -> tuple[bool, str]:
    vi = (vi or "").strip()
    if not vi:
        return False, "empty"
    if _CJK.search(vi):
        return False, "contains CJK"
    if len(vi) > MAX_MEANING_LEN:
        return False, f"too long ({len(vi)})"
    return True, "ok"


def _pending_words(db: Session, level: int | None, limit: int | None) -> list[Word]:
    query = select(Word).where(func.coalesce(func.trim(Word.meaning_vi), "") == "")
    if level is not None:
        query = query.where(Word.hsk_level == level)
    query = query.order_by(Word.hsk_level, Word.id)
    if limit is not None:
        query = query.limit(limit)
    return list(db.scalars(query).all())


def translate_batch(db: Session, words: list[Word]) -> int:
    prompt = _build_prompt(words)
    try:
        data = _call_api(prompt)
    except Exception as exc:
        print(f"    batch failed ({len(words)} words): {str(exc)[:120]}")
        return 0

    entries = data.get("words") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        print("    batch: response missing 'words' list")
        return 0

    by_hanzi = {e.get("hanzi"): e for e in entries if isinstance(e, dict) and e.get("hanzi")}
    updated = 0
    for word in words:
        entry = by_hanzi.get(word.hanzi)
        if not entry:
            continue
        vi = str(entry.get("meaning_vi", "")).strip()
        ok, reason = _validate_meaning(vi)
        if not ok:
            print(f"    skip {word.hanzi}: {reason}")
            continue
        word.meaning_vi = vi
        updated += 1

    db.commit()
    return updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, default=None, help="Chỉ dịch 1 cấp HSK (1-6)")
    parser.add_argument("--limit", type=int, default=None, help="Số từ tối đa xử lý (thử nghiệm)")
    args = parser.parse_args()

    from app.settings import settings
    if not settings.deepseek_api_key and not settings.gemini_keys_list:
        print("ERROR: chưa cấu hình DEEPSEEK_API_KEY hoặc GEMINI_API_KEYS")
        return

    db = SessionLocal()
    pending = _pending_words(db, args.level, args.limit)
    total = len(pending)
    if not total:
        print("Không còn từ nào cần dịch. Done.")
        db.close()
        return

    print(f"Cần dịch {total} từ (level={args.level or 'tất cả'})...")
    done = 0
    for start in range(0, total, WORDS_PER_CALL):
        chunk = pending[start:start + WORDS_PER_CALL]
        updated = translate_batch(db, chunk)
        done += updated
        print(f"  {start + len(chunk)}/{total} — +{updated} nghĩa (tổng {done})")
        time.sleep(SLEEP_BETWEEN_CALLS)

    remaining = db.scalar(
        select(func.count()).select_from(Word).where(func.coalesce(func.trim(Word.meaning_vi), "") == "")
    ) or 0
    db.close()
    print(f"Xong. Dịch được {done} nghĩa. Còn lại {remaining} từ chưa dịch (chạy lại để tiếp tục).")


if __name__ == "__main__":
    main()
