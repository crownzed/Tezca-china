"""Tra từ vựng HSK cho tool calling trong Realtime Voice Chat.

Khi học sinh hỏi nghĩa từ (vd "努力是什么意思?"), StepFun Realtime gọi function
``lookup_word``. Service này query bảng ``words`` + ``examples`` và trả kết quả
gọn dưới dạng dict để backend gửi lại làm function_call_output.

Query trực tiếp qua SessionLocal (không qua HTTP) để giữ latency <5ms và không
lộ schema/data structure cho client.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..db import SessionLocal
from ..models import Word

logger = logging.getLogger(__name__)

MAX_EXAMPLES = 2
MAX_WORD_LENGTH = 32


def lookup_word(word: str) -> str:
    """Tra từ dài nhất khớp với đầu input, trả JSON string cho tool output."""
    if not isinstance(word, str):
        return json.dumps({"error": "Từ cần tra không hợp lệ."}, ensure_ascii=False)
    word = word.strip()
    if not word or len(word) > MAX_WORD_LENGTH:
        return json.dumps({"error": "Từ cần tra phải dài 1-32 ký tự."}, ensure_ascii=False)

    try:
        with SessionLocal() as db:
            # So từng tiền tố bằng exact match: '%' và '_' là ký tự, không phải wildcard.
            prefixes = [word[:length] for length in range(1, len(word) + 1)]
            stmt = (
                select(Word)
                .options(selectinload(Word.examples))
                .where(Word.hanzi.in_(prefixes))
                .order_by(func.length(Word.hanzi).desc(), Word.hsk_level, Word.id)
                .limit(1)
            )
            result = db.scalars(stmt).first()

            if result is None:
                return json.dumps(
                    {"not_found": True, "word": word},
                    ensure_ascii=False,
                )

            examples = []
            for ex in (result.examples or [])[:MAX_EXAMPLES]:
                if (ex.sentence_cn or "").strip():
                    examples.append({
                        "cn": ex.sentence_cn.strip(),
                        "vi": (ex.sentence_vi or "").strip(),
                    })

            return json.dumps(
                {
                    "hanzi": result.hanzi,
                    "pinyin": result.pinyin or "",
                    "meaning_vi": result.meaning_vi or "",
                    "hsk_level": result.hsk_level,
                    "pos": result.pos or "",
                    "examples": examples,
                },
                ensure_ascii=False,
            )
    except Exception:
        logger.exception("lookup_word failed for '%s'", word)
        return json.dumps({"error": f"Lỗi khi tra từ '{word}'."}, ensure_ascii=False)
