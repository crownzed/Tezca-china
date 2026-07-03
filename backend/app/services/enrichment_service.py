"""AI enrichment offline cho pool dữ liệu câu hỏi luyện tập.

Mọi loại câu hỏi trong ``QuestionGeneratorService`` đều dẫn xuất từ 2 nguồn:
  1. Bảng ``examples`` (câu nền cho cloze/listening/drag_drop/voice/dialogue/paragraph).
  2. ``Word.confusable_words_json`` (nguồn distractor "dễ nhầm").

Module này dùng LLM (tái dùng ``_call_api``: DeepSeek primary + Gemini fallback)
để LÀM GIÀU 2 nguồn trên rồi ghi vào DB — chạy OFFLINE, không nằm trong đường
request. Nhờ đó chất lượng câu hỏi tăng mà đường runtime vẫn nhanh (template-based,
không thêm độ trễ LLM per-request).

Toàn bộ hàm build prompt + validator là THUẦN (test được, không chạm mạng/DB).
Các hàm ``enrich_*`` mới chạm DB, ghi idempotent (bỏ trùng, có cổng
``words_needing_enrichment``) nên re-run gần như miễn phí và không sinh trùng.
"""

from __future__ import annotations

import logging
import re
import time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Example, Word
from .llm_generator_service import _call_api
from .question_generator import _CJK_RANGE, _PARAGRAPH_CJK_CAP_BY_LEVEL, _count_cjk

logger = logging.getLogger(__name__)

# Nguồn đánh dấu câu do AI sinh — để phân biệt với Tatoeba và làm cổng idempotency.
AI_SOURCE = "ai_gen"

MIN_GOOD_EXAMPLES = 4       # dưới mức này thì từ cần enrich
TARGET_EXAMPLES_PER_WORD = 5
TARGET_CONFUSABLES = 6
WORDS_PER_CALL = 8          # số từ mỗi lần gọi LLM (giữ trong max_tokens=4000)

_CJK_ONLY = re.compile(f"^[{_CJK_RANGE}]+$")


# ---------------------------------------------------------------------------
# Prompt builder (thuần)
# ---------------------------------------------------------------------------

def _build_enrichment_prompt(words: list[Word]) -> str:
    """Dựng 1 prompt cho cả batch từ. Yêu cầu câu ví dụ + confusable per-word."""
    lines = []
    for w in words:
        cap = _PARAGRAPH_CJK_CAP_BY_LEVEL.get(w.hsk_level, 200)
        lines.append(
            f'- hanzi="{w.hanzi}", pinyin="{w.pinyin or ""}", '
            f'nghĩa="{w.meaning_vi or w.meaning_en or ""}", '
            f'pos="{w.pos or ""}", hsk_level={w.hsk_level}, '
            f'giới_hạn_ký_tự_Hán={cap}'
        )
    words_block = "\n".join(lines)

    return f"""Bạn là giáo viên tiếng Trung (Mandarin) giàu kinh nghiệm, soạn ngữ liệu luyện tập cho người Việt học HSK.

Với MỖI từ trong danh sách dưới đây, hãy tạo:
1. {TARGET_EXAMPLES_PER_WORD} câu ví dụ TỰ NHIÊN, mỗi câu DÙNG đúng từ mục tiêu (chuỗi hanzi phải xuất hiện nguyên vẹn trong câu), đúng từ loại (pos), trong các NGỮ CẢNH đời thường KHÁC nhau (không lặp mô-típ). Mỗi câu có bản tiếng Trung (cn) và bản dịch tiếng Việt (vi).
2. {TARGET_CONFUSABLES} từ distractor (hanzi) DỄ NHẦM với từ mục tiêu: cùng từ loại, cùng cấp HSK hoặc thấp hơn, gần âm / chung chữ Hán / gần nghĩa, NHƯNG khi đặt vào ngữ cảnh của từ mục tiêu thì SAI. KHÔNG dùng từ đồng nghĩa có thể thay thế được.

Danh sách từ:
{words_block}

RÀNG BUỘC BẮT BUỘC:
1. Câu ví dụ CHỈ dùng chữ Hán thuộc cấp HSK của từ đó HOẶC THẤP HƠN. Không dùng chữ vượt cấp.
2. Số ký tự Hán mỗi câu KHÔNG vượt "giới_hạn_ký_tự_Hán" của từ; cấp thấp (HSK1-2) nên viết câu ngắn 5-12 chữ.
3. Chuỗi hanzi của từ mục tiêu PHẢI nằm trong câu cn (nguyên văn, không tách rời).
4. Bản dịch vi phải sát nghĩa, tự nhiên, không dịch máy móc.
5. distractor PHẢI là chữ Hán, KHÁC từ mục tiêu, KHÔNG trùng nhau.

OUTPUT CHỈ LÀ MỘT OBJECT JSON (không markdown, không giải thích thêm):
{{
  "words": [
    {{
      "hanzi": "学习",
      "examples": [
        {{"cn": "我每天晚上学习中文。", "vi": "Tối nào tôi cũng học tiếng Trung."}}
      ],
      "confusables": ["学校", "练习", "复习"]
    }}
  ]
}}"""


# ---------------------------------------------------------------------------
# Validators (thuần)
# ---------------------------------------------------------------------------

def _validate_example(cn: str, vi: str, word: Word) -> tuple[bool, str]:
    """Kiểm 1 câu ví dụ. Trả (hợp_lệ, lý_do).

    Cổng quan trọng nhất là ``word.hanzi in cn``: generator âm thầm bỏ câu không
    chứa hanzi (``_cloze_for_word``/``_drag_drop_for_word`` kiểm điều này), nên
    câu thiếu hanzi là rác ngay từ đầu.
    """
    cn = (cn or "").strip()
    vi = (vi or "").strip()
    if not cn:
        return False, "empty cn"
    if not vi:
        return False, "empty vi"
    if word.hanzi not in cn:
        return False, f"cn missing target hanzi {word.hanzi!r}"
    n_cjk = _count_cjk(cn)
    if n_cjk < 2:
        return False, "cn too short (<2 CJK)"
    cap = _PARAGRAPH_CJK_CAP_BY_LEVEL.get(word.hsk_level, 200)
    if n_cjk > cap:
        return False, f"cn exceeds level cap ({n_cjk} > {cap})"
    return True, "ok"


def _validate_confusable(hanzi: str, word: Word) -> tuple[bool, str]:
    """Kiểm 1 distractor hanzi. Trả (hợp_lệ, lý_do).

    Không kiểm tồn tại cùng cấp ở đây — ``_pick_distractors`` lọc bằng
    ``Word.hanzi.in_(...)`` lúc đọc, hanzi lạ tự bị bỏ qua.
    """
    hanzi = (hanzi or "").strip()
    if not hanzi:
        return False, "empty"
    if hanzi == word.hanzi:
        return False, "same as target"
    if not _CJK_ONLY.match(hanzi):
        return False, "not pure CJK"
    return True, "ok"


# ---------------------------------------------------------------------------
# DB writes (idempotent, KHÔNG commit — caller commit theo chunk)
# ---------------------------------------------------------------------------

def enrich_word(db: Session, word: Word, data: dict) -> dict[str, int]:
    """Ghi example + confusable đã validate cho 1 từ. Idempotent, không commit."""
    examples_added = 0
    confusables_added = 0

    # --- Examples: bỏ trùng theo sentence_cn đã có (Tatoeba + ai_gen trước) ---
    existing_cn = {
        e.sentence_cn.strip()
        for e in db.scalars(select(Example).where(Example.word_id == word.id))
        if e.sentence_cn
    }
    for ex in data.get("examples", []) or []:
        cn = str(ex.get("cn", "")).strip()
        vi = str(ex.get("vi", "")).strip()
        ok, reason = _validate_example(cn, vi, word)
        if not ok:
            logger.debug("skip example for %s: %s", word.hanzi, reason)
            continue
        if cn in existing_cn:
            continue
        db.add(Example(word_id=word.id, sentence_cn=cn, sentence_vi=vi, source=AI_SOURCE))
        existing_cn.add(cn)
        examples_added += 1

    # --- Confusables: chuẩn hóa list cũ (dict/legacy) -> hanzi, thêm mới, cap ---
    current_raw = word.confusable_words_json or []
    current: list[str] = []
    for c in current_raw:
        h = c if isinstance(c, str) else (c.get("hanzi") if isinstance(c, dict) else None)
        if h:
            current.append(h)
    seen = set(current)
    for hanzi in data.get("confusables", []) or []:
        hanzi = str(hanzi).strip()
        ok, reason = _validate_confusable(hanzi, word)
        if not ok:
            logger.debug("skip confusable for %s: %s", word.hanzi, reason)
            continue
        if hanzi in seen:
            continue
        if len(current) >= TARGET_CONFUSABLES:
            break
        current.append(hanzi)
        seen.add(hanzi)
        confusables_added += 1

    if confusables_added:
        # Cột JSON: phải GÁN LẠI để SQLAlchemy đánh dấu dirty (mutate in-place không đủ).
        word.confusable_words_json = current

    return {"examples_added": examples_added, "confusables_added": confusables_added}


def enrich_words(db: Session, words: list[Word]) -> dict[str, int]:
    """Enrich cả list từ theo chunk ``WORDS_PER_CALL``. Commit sau mỗi chunk."""
    totals = {"examples_added": 0, "confusables_added": 0, "words_done": 0}
    if not words:
        return totals

    for start in range(0, len(words), WORDS_PER_CALL):
        chunk = words[start:start + WORDS_PER_CALL]
        prompt = _build_enrichment_prompt(chunk)
        try:
            data = _call_api(prompt)
        except Exception as exc:
            logger.warning("enrich chunk failed (%d words): %s", len(chunk), exc)
            time.sleep(1.5)
            continue

        entries = data.get("words") if isinstance(data, dict) else None
        if not isinstance(entries, list):
            logger.warning("enrich chunk: missing 'words' list in LLM response")
            time.sleep(1.5)
            continue

        by_hanzi = {e.get("hanzi"): e for e in entries if isinstance(e, dict) and e.get("hanzi")}
        for word in chunk:
            entry = by_hanzi.get(word.hanzi)
            if not entry:
                continue
            stats = enrich_word(db, word, entry)
            totals["examples_added"] += stats["examples_added"]
            totals["confusables_added"] += stats["confusables_added"]
            totals["words_done"] += 1

        db.commit()
        time.sleep(1.5)

    return totals


def words_needing_enrichment(db: Session, level: int | None = None) -> list[Word]:
    """Từ có < ``MIN_GOOD_EXAMPLES`` câu ai_gen (cổng idempotency).

    Đẩy toàn bộ filter xuống SQL: loại các từ đã đủ câu ai_gen bằng NOT IN một
    subquery gom theo word_id. Từ chưa có câu ai_gen nào cũng được tính là cần
    enrich (không nằm trong subquery). Không tải object thừa vào RAM.
    """
    enough_ai = (
        select(Example.word_id)
        .where(Example.source == AI_SOURCE)
        .group_by(Example.word_id)
        .having(func.count(Example.id) >= MIN_GOOD_EXAMPLES)
        .subquery()
    )

    query = select(Word).where(Word.id.notin_(select(enough_ai.c.word_id)))
    if level is not None:
        query = query.where(Word.hsk_level == level)

    return list(db.scalars(query).all())
