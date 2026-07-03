"""Phục vụ từ vựng HSK từ DB cho thư viện frontend.

Nguồn sự thật cho danh sách từ là bảng ``words`` (đã nhập từ HSK 3.0 chính thức
và dịch nghĩa tiếng Việt offline). Chỉ trả từ đã có ``meaning_vi`` để client
không hiển thị thẻ thiếu nghĩa; từ đang chờ dịch tự bị lọc.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Word
from ..schemas import WordExampleOut, WordOut, WordsOut

router = APIRouter(prefix="/api/words", tags=["words"])

MAX_EXAMPLES_PER_WORD = 3


def _has_meaning():
    return func.coalesce(func.trim(Word.meaning_vi), "") != ""


@router.get("", response_model=WordsOut)
def list_words(
    level: int | None = Query(default=None, ge=1, le=6),
    db: Session = Depends(get_db),
):
    query = (
        select(Word)
        .where(_has_meaning())
        .options(selectinload(Word.examples))
        .order_by(Word.hsk_level, Word.id)
    )
    if level is not None:
        query = query.where(Word.hsk_level == level)

    words = db.scalars(query).all()

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
                examples=examples,
            )
        )
        key = f"HSK {w.hsk_level}"
        counts[key] = counts.get(key, 0) + 1

    return WordsOut(words=out, counts=counts)
