"""AI enrichment offline cho pool dữ liệu câu hỏi luyện tập.

Mọi loại câu hỏi trong ``QuestionGeneratorService`` đều dẫn xuất từ 2 nguồn:
  1. Bảng ``examples`` (câu nền cho cloze/listening/drag_drop/voice/dialogue/paragraph).
  2. ``Word.confusable_words_json`` (nguồn distractor "dễ nhầm").

Module này dùng LLM (tái dùng ``_call_api``: provider theo ``settings.llm_provider``,
xoay vòng key)
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
            data = _call_api(prompt, content_task=True)
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


# ---------------------------------------------------------------------------
# Dual-Professor Word Detail Enrichment
# ---------------------------------------------------------------------------
# Hai "giáo sư" LLM độc lập cùng sinh nội dung chi tiết cho mỗi từ, sau đó
# reconciler so sánh và merge bản tốt nhất. Chạy OFFLINE, không nằm trong
# request path.

DETAIL_WORDS_PER_CALL = 5  # ít hơn enrichment thường vì prompt dài hơn


def words_needing_detail_enrichment(
    db: Session, level: int | None = None, limit: int = 20
) -> list[Word]:
    """Từ chưa có semantic_notes (cổng idempotency cho detail enrichment)."""
    query = select(Word).where(
        (Word.semantic_notes == "") | Word.semantic_notes.is_(None)
    )
    if level is not None:
        query = query.where(Word.hsk_level == level)
    query = query.order_by(Word.hsk_level, Word.id).limit(limit)
    return list(db.scalars(query).all())


def _build_professor_a_prompt(words: list[Word]) -> str:
    """Giáo sư Ngữ nghĩa: nghĩa gốc/mở rộng, sắc thái, phân tích chữ Hán."""
    lines = []
    for w in words:
        lines.append(
            f'- hanzi="{w.hanzi}", pinyin="{w.pinyin or ""}", '
            f'nghĩa="{w.meaning_vi or w.meaning_en or ""}", '
            f'pos="{w.pos or ""}", hsk_level={w.hsk_level}'
        )
    words_block = "\n".join(lines)

    return f"""Bạn là GIÁO SƯ NGỮ NGHĨA tiếng Trung (Mandarin) với 30 năm kinh nghiệm nghiên cứu ngữ nghĩa học và tự nguyên học. Nhiệm vụ: phân tích CHI TIẾT ngữ nghĩa và cấu trúc chữ Hán cho người Việt học HSK.

Với MỖI từ dưới đây, hãy cung cấp:

1. **semantic_notes** (200-400 chữ tiếng Việt):
   - Nghĩa GỐC (etymology ngắn gọn nếu có)
   - Nghĩa MỞ RỘNG / nghĩa ẩn dụ trong các ngữ cảnh khác nhau
   - SẮC THÁI cảm xúc/trang trọng/thân mật — khi nào dùng, khi nào KHÔNG nên dùng
   - PHẠM VI sử dụng: văn nói hay văn viết? khẩu ngữ hay sách vở? miền Bắc/Nam TQ?
   - So sánh ngắn với từ tiếng Việt tương đương (nếu có sự khác biệt tinh tế)

2. **character_analysis** (100-250 chữ tiếng Việt):
   - Phân tích BỘ THỦ và các THÀNH PHẦN cấu tạo chữ
   - Ý nghĩa của từng thành phần (tại sao bộ thủ này lại liên quan đến nghĩa?)
   - Gợi ý LIÊN TƯỞNG để nhớ chữ (mnemonic dựa trên cấu trúc chữ)
   - Các chữ KHÁC có chung bộ thủ/thành phần (tạo họ chữ)

3. **usage_patterns** (2-4 mẫu):
   Mỗi mẫu gồm: pattern (công thức/cấu trúc), example_cn, example_vi, note (lưu ý ngắn)
   Tập trung vào các CẤU TRÚC NGỮ PHÁP cố định mà từ này tham gia.

Danh sách từ:
{words_block}

RÀNG BUỘC:
- Viết HOÀN TOÀN bằng tiếng Việt (trừ example_cn và các trích dẫn chữ Hán)
- KHÔNG lặp lại nghĩa cơ bản đã có ở trường "nghĩa" — đi SÂU hơn
- Ví dụ câu phải đúng cấp HSK của từ (không dùng chữ vượt cấp)
- Phân tích chữ Hán phải CHÍNH XÁC về bộ thủ (tra cứu, không đoán)

OUTPUT JSON (không markdown):
{{"words":[{{"hanzi":"学习","semantic_notes":"...","character_analysis":"...","usage_patterns":[{{"pattern":"~ + đối tượng","example_cn":"我学习中文。","example_vi":"Tôi học tiếng Trung.","note":"Học một ngôn ngữ/kỹ năng"}}]}}]}}"""


def _build_professor_b_prompt(words: list[Word]) -> str:
    """Giáo sư Ứng dụng: cách dùng thực tế, lỗi thường gặp, phân biệt từ gần nghĩa."""
    lines = []
    for w in words:
        confusables = list(w.confusable_words_json or [])[:5]
        lines.append(
            f'- hanzi="{w.hanzi}", pinyin="{w.pinyin or ""}", '
            f'nghĩa="{w.meaning_vi or w.meaning_en or ""}", '
            f'pos="{w.pos or ""}", hsk_level={w.hsk_level}, '
            f'từ_dễ_nhầm={confusables}'
        )
    words_block = "\n".join(lines)

    return f"""Bạn là GIÁO SƯ ỨNG DỤNG tiếng Trung (Mandarin) với 30 năm kinh nghiệm giảng dạy người nước ngoài. Nhiệm vụ: cung cấp hướng dẫn SỬ DỤNG THỰC TẾ và cảnh báo lỗi cho người Việt học HSK.

Với MỖI từ dưới đây, hãy cung cấp:

1. **usage_notes** (200-400 chữ tiếng Việt):
   - LỖI THƯỜNG GẶP của người Việt khi dùng từ này (dịch sai, dùng sai ngữ cảnh, nhầm từ loại)
   - PHÂN BIỆT với các từ gần nghĩa (đặc biệt các từ trong "từ_dễ_nhầm") — khác nhau ở đâu? khi nào dùng từ nào?
   - LƯU Ý VĂN HÓA: từ này có hàm ý văn hóa gì? dùng với ai thì phù hợp? tránh dùng trong tình huống nào?
   - Collocations CỐ ĐỊNH (các từ LUÔN đi kèm, không thay được)
   - Từ loại THỰC TẾ: có thể làm động từ/danh từ/tính từ? chuyển đổi thế nào?

2. **usage_patterns** (2-4 mẫu):
   Mỗi mẫu gồm: pattern (công thức/cấu trúc), example_cn, example_vi, note (lưu ý ngắn)
   Tập trung vào CÁCH DÙNG THỰC TẾ trong giao tiếp hàng ngày, KHÔNG phải cấu trúc sách giáo khoa.

Danh sách từ:
{words_block}

RÀNG BUỘC:
- Viết HOÀN TOÀN bằng tiếng Việt (trừ example_cn và các trích dẫn chữ Hán)
- Lỗi thường gặp phải là lỗi THẬT của người Việt (không bịa)
- Phân biệt từ gần nghĩa phải CHỈ RA SỰ KHÁC BIỆT CỤ THỂ (không nói chung chung)
- Ví dụ câu phải đúng cấp HSK của từ
- Collocations phải là kết hợp từ THẬT, kiểm chứng được

OUTPUT JSON (không markdown):
{{"words":[{{"hanzi":"学习","usage_notes":"...","usage_patterns":[{{"pattern":"跟/向 + người + ~","example_cn":"我跟他学习太极拳。","example_vi":"Tôi học thái cực quyền với anh ấy.","note":"Nhấn mạnh học từ một người cụ thể"}}]}}]}}"""


def _reconcile_details(a: dict, b: dict) -> dict:
    """So sánh output của 2 giáo sư, merge lấy bản tốt nhất."""
    result: dict = {}

    # semantic_notes: chỉ Professor A sinh
    result["semantic_notes"] = (a.get("semantic_notes") or "").strip()

    # character_analysis: chỉ Professor A sinh
    result["character_analysis"] = (a.get("character_analysis") or "").strip()

    # usage_notes: chỉ Professor B sinh
    result["usage_notes"] = (b.get("usage_notes") or "").strip()

    # usage_patterns: merge từ cả 2, ưu tiên pattern có example
    a_patterns = a.get("usage_patterns") or []
    b_patterns = b.get("usage_patterns") or []
    merged_patterns: list[dict] = []
    seen_patterns: set[str] = set()

    for p in [*a_patterns, *b_patterns]:
        if not isinstance(p, dict):
            continue
        pat = (p.get("pattern") or "").strip()
        if not pat or pat in seen_patterns:
            continue
        seen_patterns.add(pat)
        # Validate: phải có ít nhất pattern + example_cn
        if not p.get("example_cn"):
            continue
        merged_patterns.append({
            "pattern": pat,
            "example_cn": (p.get("example_cn") or "").strip(),
            "example_vi": (p.get("example_vi") or "").strip(),
            "note": (p.get("note") or "").strip(),
        })

    result["usage_patterns"] = merged_patterns[:6]  # tối đa 6 patterns
    return result


def enrich_word_details(db: Session, batch_size: int = DETAIL_WORDS_PER_CALL) -> dict[str, int]:
    """Dual-professor enrichment: sinh ngữ nghĩa/lưu ý/cách dùng cho từ chưa có.

    Trả stats: words_done, errors.
    """
    words = words_needing_detail_enrichment(db, limit=batch_size)
    if not words:
        return {"words_done": 0, "errors": 0}

    stats = {"words_done": 0, "errors": 0}

    # Gọi Professor A
    prompt_a = _build_professor_a_prompt(words)
    try:
        data_a = _call_api(prompt_a, content_task=True)
    except Exception as exc:
        logger.warning("Professor A failed: %s", exc)
        stats["errors"] += 1
        return stats

    entries_a = {
        e.get("hanzi"): e
        for e in (data_a.get("words") if isinstance(data_a, dict) else [])
        if isinstance(e, dict) and e.get("hanzi")
    }

    time.sleep(1.0)

    # Gọi Professor B
    prompt_b = _build_professor_b_prompt(words)
    try:
        data_b = _call_api(prompt_b, content_task=True)
    except Exception as exc:
        logger.warning("Professor B failed: %s", exc)
        stats["errors"] += 1
        return stats

    entries_b = {
        e.get("hanzi"): e
        for e in (data_b.get("words") if isinstance(data_b, dict) else [])
        if isinstance(e, dict) and e.get("hanzi")
    }

    # Reconcile và lưu
    for word in words:
        a_data = entries_a.get(word.hanzi, {})
        b_data = entries_b.get(word.hanzi, {})

        if not a_data and not b_data:
            continue

        merged = _reconcile_details(a_data, b_data)

        # Chỉ lưu nếu có ít nhất 1 field có nội dung
        if not any([merged.get("semantic_notes"), merged.get("usage_notes"),
                     merged.get("usage_patterns"), merged.get("character_analysis")]):
            continue

        word.semantic_notes = merged.get("semantic_notes", "")
        word.usage_notes = merged.get("usage_notes", "")
        word.usage_patterns_json = merged.get("usage_patterns", [])
        word.character_analysis = merged.get("character_analysis", "")
        stats["words_done"] += 1

    db.commit()
    logger.info("Detail enrichment done: %d/%d words", stats["words_done"], len(words))
    return stats
