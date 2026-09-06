"""Phục vụ từ vựng HSK từ DB cho thư viện frontend.

Nguồn sự thật cho danh sách từ là bảng ``words`` (đã nhập từ HSK 3.0 chính thức
và dịch nghĩa tiếng Việt offline). Chỉ trả từ đã có ``meaning_vi`` để client
không hiển thị thẻ thiếu nghĩa; từ đang chờ dịch tự bị lọc.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import client_ip
from ..models import Word
from ..schemas import WordExampleOut, WordOut, WordsOut
from ..services.rate_limiter import RateLimiter

router = APIRouter(prefix="/api/words", tags=["words"])

MAX_EXAMPLES_PER_WORD = 3

# Rate limit: endpoint này public (không cần auth) và trả payload lớn (~5-10MB nếu
# không phân trang). Giới hạn 60 req/phút/IP đủ cho người học duyệt thư viện mà
# vẫn chặn scraping hàng loạt hoặc DoS bằng request body-less lặp vô hạn.
_words_limiter = RateLimiter(max_hits=60, window_seconds=60)


def _has_meaning():
    return func.coalesce(func.trim(Word.meaning_vi), "") != ""


@router.get("", response_model=WordsOut)
def list_words(
    request: Request,
    # Nhận lặp param (?level=1&level=2) để khớp getWords() ở src/api-core.js khi
    # người học chọn nhiều cấp. Nếu khai báo scalar, Starlette chỉ lấy giá trị
    # cuối và âm thầm thu hẹp yêu cầu nhiều cấp thành một cấp.
    # ge/le phải nằm ở PHẦN TỬ (Annotated[int, Field(...)]), không phải ở Query:
    # đặt trên list sẽ khiến pydantic ném TypeError → 500 thay vì 422.
    level: list[Annotated[int, Field(ge=1, le=6)]] | None = Query(default=None),
    # Phân trang bắt buộc: mặc định 200 từ/trang, tối đa 500. Không có offset
    # thì trả trang đầu. Client muốn load thêm thì gửi ?offset=200&limit=200.
    # Trước đây endpoint này trả TOÀN BỘ ~5700 từ trong một lần gọi — vừa chậm
    # (serialize 5-10MB JSON) vừa là vector tấn công (public, không auth).
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    if not _words_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu, vui lòng thử lại sau.")

    base_query = select(Word).where(_has_meaning()).order_by(Word.hsk_level, Word.id)
    levels = sorted({value for value in (level or [])})
    if levels:
        base_query = base_query.where(Word.hsk_level.in_(levels))

    words = db.scalars(base_query.options(selectinload(Word.examples)).offset(offset).limit(limit)).all()

    out: list[WordOut] = []
    counts: dict[str, int] = {}
    for w in words:
        examples = [
            WordExampleOut(cn=e.sentence_cn, vi=e.sentence_vi or "")
            for e in w.examples
            if (e.sentence_cn or "").strip()
        ][:MAX_EXAMPLES_PER_WORD]
        out.append(
            WordOut(
                id=w.id,
                hanzi=w.hanzi,
                pinyin=w.pinyin or "",
                meaning_vi=w.meaning_vi or "",
                hsk_level=w.hsk_level,
                pos=w.pos or "",
                radical=w.character_family or "",
                component_hint=w.component_hint or "",
                examples=examples,
                confusable_words=list(w.confusable_words_json or []),
            )
        )
        key = f"HSK {w.hsk_level}"
        counts[key] = counts.get(key, 0) + 1

    return WordsOut(words=out, counts=counts)
