"""Luyện dịch câu hai chiều (VI↔CN): sinh cặp câu theo cấp HSK + chấm tất định.

Hai phần tách biệt, có chủ ý:

  - ``generate_items`` / ``take_items`` gọi LLM qua ``_call_api`` (không bao giờ
    tạo HTTP client mới) và cache vào ``translation_pool.json``. Một lượt gọi mất
    10-30s và ăn quota, còn một phiên luyện cần 5-10 câu — nên phiên đầu chờ AI,
    các phiên sau lấy từ pool.
  - ``grade`` chấm bằng cách SO KHỚP ĐÁP ÁN MẪU, thuần CPU, không mạng, không DB.
    Đây là lựa chọn của người dùng thay cho "AI chấm + nhận xét": chấm phải tất
    định và trả lời tức thì, không tốn thêm một lượt LLM cho mỗi câu.

Một item là MỘT CẶP câu (CN + VI) kèm đáp án mẫu thay thế ở cả hai phía, nên một
lượt sinh phục vụ được cả hai chiều — chiều dịch chỉ quyết định hiển thị gì và so
khớp với tập tham chiếu nào. Nhờ vậy chế độ trộn không tốn thêm lượt gọi nào.
"""
from __future__ import annotations

import json
import logging
import random
import re
import time
import unicodedata
from collections import Counter
from pathlib import Path

from .llm_generator_service import _CJK_RE, _MAX_CJK_PER_VI_OPTION, _call_api, _cjk_count

logger = logging.getLogger(__name__)

# Hai chiều dịch. Tên ngắn vì đi vào query/payload của client.
DIRECTION_VI_TO_CN = "vi2cn"
DIRECTION_CN_TO_VI = "cn2vi"
DIRECTIONS = (DIRECTION_VI_TO_CN, DIRECTION_CN_TO_VI)

_POOL_PATH = Path(__file__).resolve().parents[1] / "data" / "translation_pool.json"
_POOL: dict[str, list[dict]] | None = None

# Câu quá ngắn không dạy được gì về trật tự từ; quá dài thì chấm theo đáp án mẫu
# mất ý nghĩa (một câu 30 chữ có quá nhiều cách dịch đúng để liệt kê).
_MIN_CN_CHARS = 5
_MAX_CN_CHARS = 40

# Ngưỡng đạt. 0.85 lấy theo mức "khác một hư từ / một cách nói đồng nghĩa" — dưới
# mức đó là thiếu hoặc thêm hẳn một thành phần câu.
_PASS_RATIO = 0.85

# Bản dịch tiếng Việt gõ không dấu vẫn tính là ĐÚNG, chỉ bị hạ điểm: kỹ năng đang
# kiểm tra là hiểu tiếng Trung, không phải gõ tiếng Việt có dấu. Hệ số 0.9 khiến
# khớp-tuyệt-đối-không-dấu ra 90 điểm (vẫn qua ngưỡng), còn khớp lệch thì tụt
# nhanh hơn bản có dấu.
_NO_DIACRITIC_PENALTY = 0.9

_PUNCT_RE = re.compile(r"[.,!?;:…、。！？；：－—\-_\"'“”‘’()\[\]（）【】《》]")


# --- Chuẩn hoá ---------------------------------------------------------------

def _norm_vi(text: str) -> str:
    """Tiếng Việt về dạng so sánh: NFC, bỏ dấu câu, gộp khoảng trắng, casefold.

    GIỮ dấu thanh — ``má``/``mà``/``mả`` là ba từ khác nhau, bỏ dấu ở bước này sẽ
    coi bản dịch sai nghĩa là đúng. Biến thể không dấu được so RIÊNG ở bậc điểm
    thấp hơn (xem ``_strip_diacritics``).
    """
    value = unicodedata.normalize("NFC", str(text or ""))
    value = _PUNCT_RE.sub(" ", value)
    return " ".join(value.split()).casefold()


def _strip_diacritics(text: str) -> str:
    """Bỏ dấu thanh + dấu phụ tiếng Việt, đưa đ→d. Dùng cho bậc chấm "đúng nghĩa
    nhưng gõ không dấu" — người học không có bàn phím tiếng Việt là ca thật."""
    value = unicodedata.normalize("NFD", str(text or ""))
    value = "".join(char for char in value if not unicodedata.combining(char))
    return value.replace("đ", "d").replace("Đ", "D")


def _norm_cn(text: str) -> str:
    """Tiếng Trung về dạng so sánh: chỉ giữ ký tự CJK.

    Bỏ hết dấu câu và khoảng trắng vì tiếng Trung không có dấu cách — thiếu một
    dấu 。 không phải lỗi dịch. So khớp về sau làm ở mức KÝ TỰ, không phải token.
    Dùng chung ``_CJK_RE`` với ``_cjk_count`` để hai hàm không lệch định nghĩa
    "ký tự Hán" (đếm hợp lệ nhưng chuẩn hoá lại rơi mất ký tự là lỗi im lặng).
    """
    return "".join(_CJK_RE.findall(unicodedata.normalize("NFC", str(text or ""))))


# --- Sinh câu ----------------------------------------------------------------

def _clean_str(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _valid_item(item) -> dict | None:
    """Chuẩn hoá + kiểm một item từ LLM. None nếu phải loại.

    Kiểm quan trọng nhất là ``key_words`` phải là substring của ``sentence_cn``:
    một key_word bịa ra sẽ khiến MỌI câu trả lời đúng bị chấm là thiếu từ.
    """
    if not isinstance(item, dict):
        return None
    sentence_cn = _clean_str(item.get("sentence_cn"), 120)
    sentence_vi = _clean_str(item.get("sentence_vi"), 240)
    cn_chars = _cjk_count(sentence_cn)
    if not (_MIN_CN_CHARS <= cn_chars <= _MAX_CN_CHARS):
        return None
    if not sentence_vi:
        return None
    # Bản dịch tiếng Việt lẫn nguyên cụm Hán chưa dịch là lỗi LLM đã biết; ngưỡng
    # 2 lấy từ phân bố thật của bank (xem _MAX_CJK_PER_VI_OPTION).
    if _cjk_count(sentence_vi) > _MAX_CJK_PER_VI_OPTION:
        return None

    alt_cn = [
        text for text in (_clean_str(alt, 120) for alt in item.get("alt_cn") or [])
        if _cjk_count(text) >= _MIN_CN_CHARS and _norm_cn(text) != _norm_cn(sentence_cn)
    ][:3]
    alt_vi = [
        text for text in (_clean_str(alt, 240) for alt in item.get("alt_vi") or [])
        if text and _cjk_count(text) <= _MAX_CJK_PER_VI_OPTION and _norm_vi(text) != _norm_vi(sentence_vi)
    ][:3]

    key_words = [
        word for word in (_clean_str(kw, 16) for kw in item.get("key_words") or [])
        if word and word in sentence_cn
    ][:4]

    return {
        "sentence_cn": sentence_cn,
        "sentence_vi": sentence_vi,
        "pinyin": _clean_str(item.get("pinyin"), 240),
        "alt_cn": alt_cn,
        "alt_vi": alt_vi,
        "key_words": key_words,
    }


def generate_items(hsk_level: int, count: int, avoid: list[str] | None = None) -> list[dict]:
    """Một lượt ``_call_api`` sinh ``count`` cặp câu CN/VI ở cấp HSK cho trước.

    Item xấu bị loại từng cái (không fail cả lô) — cùng cách các caller của
    ``_validate_api_quiz_question`` đang làm. Raise RuntimeError khi LLM không trả
    được item nào hợp lệ, để router map thành 502.
    """
    hsk_level = max(1, min(int(hsk_level or 1), 6))
    count = max(1, min(int(count or 5), 15))
    # Nonce phá tính tất định của provider: cùng prompt -> cùng response, nên mỗi
    # lượt cần một chuỗi khác nhau để model đổi chủ đề/ngữ cảnh.
    nonce = f"{time.time_ns():x}{random.randrange(1 << 32):08x}"
    avoid_block = ""
    if avoid:
        # 12 câu gần nhất: đủ để model tránh lặp mà không phình token.
        sample = [str(text).strip().replace("\n", " ")[:80] for text in avoid[-12:]]
        avoid_block = (
            "\nĐÃ CÓ trong ngân hàng (TUYỆT ĐỐI không lặp lại, phải đổi chủ đề/ngữ cảnh): "
            f"{json.dumps(sample, ensure_ascii=False)}\n"
        )

    prompt = f"""Bạn là giáo viên tiếng Trung cho người Việt. Tạo ĐÚNG {count} cặp câu song ngữ
để luyện DỊCH CÂU ở cấp HSK {hsk_level}.
Mã lượt sinh (chỉ để đa dạng hóa, không đưa vào output): {nonce}
{avoid_block}
Yêu cầu từng cặp:
- sentence_cn: câu tiếng Trung tự nhiên, {_MIN_CN_CHARS}-{_MAX_CN_CHARS} chữ Hán, dùng ĐÚNG từ vựng
  và ngữ pháp HSK {hsk_level}. Câu hoàn chỉnh có ngữ cảnh (chủ ngữ + hành động), KHÔNG phải cụm từ rời.
- sentence_vi: bản dịch tiếng Việt TỰ NHIÊN nhất (như người Việt thật sẽ nói), không dịch từng chữ.
  TUYỆT ĐỐI không chèn chữ Hán hay pinyin vào bản dịch tiếng Việt.
- pinyin: pinyin có dấu thanh của sentence_cn.
- alt_cn: 1-2 cách nói tiếng Trung KHÁC cũng đúng cho cùng ý (đổi hư từ, đổi trật tự cho phép).
  Bỏ trống nếu không có cách nói khác tự nhiên.
- alt_vi: 1-2 bản dịch tiếng Việt KHÁC cũng đúng và tự nhiên cho cùng ý.
- key_words: 1-3 từ tiếng Trung then chốt PHẢI xuất hiện NGUYÊN VĂN trong sentence_cn (copy đúng
  ký tự từ sentence_cn, không tự đặt từ khác). Đây là từ mà bản dịch bắt buộc phải thể hiện.

Mỗi cặp phải khác nhau về chủ đề (gia đình, đi lại, mua sắm, công việc, học tập, thời tiết, sức khỏe...).
Chỉ trả JSON object (không markdown):
{{"items":[{{"sentence_cn":"我每天早上七点起床。","sentence_vi":"Tôi thức dậy lúc bảy giờ mỗi sáng.","pinyin":"wǒ měi tiān zǎo shang qī diǎn qǐ chuáng","alt_cn":["我每天早上七点钟起床。"],"alt_vi":["Mỗi sáng tôi thức dậy vào lúc bảy giờ."],"key_words":["起床","七点"]}}]}}"""

    data = _call_api(prompt)
    rows = data.get("items") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("LLM không trả về danh sách items cho bài dịch câu.")

    items: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        item = _valid_item(row)
        if not item:
            continue
        key = _norm_cn(item["sentence_cn"])
        if key in seen:
            continue
        seen.add(key)
        item["hsk_level"] = hsk_level
        items.append(item)

    if not items:
        raise RuntimeError(f"LLM không trả được cặp câu hợp lệ nào ở HSK {hsk_level}.")
    return items[:count]


# --- Pool cache --------------------------------------------------------------
# Cùng idiom load/save của grammar_checker._CACHE: file JSON cạnh app/data, đọc
# một lần vào biến module, ghi lại sau mỗi lần bổ sung. Lý do tồn tại: một lượt
# _call_api mất 10-30s và ăn quota, còn một phiên luyện cần 5-10 câu.

def _load_pool() -> dict[str, list[dict]]:
    global _POOL
    if _POOL is not None:
        return _POOL
    _POOL = {}
    if _POOL_PATH.exists():
        try:
            raw = json.loads(_POOL_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                _POOL = {
                    str(level): [item for item in items if _valid_item(item)]
                    for level, items in raw.items()
                    if isinstance(items, list)
                }
        except (json.JSONDecodeError, OSError):
            _POOL = {}
    return _POOL


def _save_pool() -> None:
    if _POOL is None:
        return
    try:
        _POOL_PATH.parent.mkdir(parents=True, exist_ok=True)
        _POOL_PATH.write_text(
            json.dumps(_POOL, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        # Pool chỉ là tối ưu chi phí. Ổ đĩa chỉ-đọc (một số môi trường deploy) không
        # được phép làm vỡ tính năng — mất cache thì lần sau gọi lại LLM.
        logger.warning("Không ghi được translation_pool.json", exc_info=True)


def take_items(hsk_level: int, count: int, exclude: list[str] | None = None) -> list[dict]:
    """``count`` cặp câu ở cấp HSK, ưu tiên pool và chỉ gọi LLM khi còn thiếu.

    ``exclude``: các ``sentence_cn`` người học vừa gặp (client gửi lên) — không lặp
    lại trong phiên kế tiếp.
    """
    hsk_level = max(1, min(int(hsk_level or 1), 6))
    count = max(1, min(int(count or 5), 15))
    key = str(hsk_level)
    pool = _load_pool()
    banned = {_norm_cn(text) for text in (exclude or [])}

    available = [
        item for item in pool.get(key, []) if _norm_cn(item.get("sentence_cn", "")) not in banned
    ]
    random.shuffle(available)
    picked = available[:count]
    if len(picked) >= count:
        return picked

    picked_keys = {_norm_cn(item["sentence_cn"]) for item in picked}
    avoid = [item.get("sentence_cn", "") for item in pool.get(key, [])]
    fresh = generate_items(hsk_level, count - len(picked), avoid=avoid)

    added = [
        item for item in fresh
        if _norm_cn(item["sentence_cn"]) not in picked_keys
        and not any(_norm_cn(item["sentence_cn"]) == _norm_cn(old.get("sentence_cn", ""))
                    for old in pool.get(key, []))
    ]
    if added:
        pool.setdefault(key, []).extend(added)
        _save_pool()
    # Câu vừa sinh vẫn dùng được cho phiên này dù trùng pool (chỉ không lưu lại).
    picked.extend(item for item in fresh if _norm_cn(item["sentence_cn"]) not in picked_keys)
    return picked[:count]


# --- Chấm bài: SO KHỚP ĐÁP ÁN MẪU -------------------------------------------
# Tất định, thuần CPU, không mạng. Thang điểm + bậc ``error_tag`` theo khuôn
# ``OutputService._assess_output`` để dashboard đọc được cùng một loại tín hiệu.
# KHÔNG dùng lại chính hàm đó: nó đếm ký tự CJK, nên chiều CN→VI (đáp án là tiếng
# Việt) sẽ luôn ra 0 điểm.

# Trần độ dài đáp án khi chấm. LCS là O(n*m) nên một payload 100k ký tự sẽ đốt CPU
# của cả process; schema đã chặn ở tầng ngoài, đây là chốt thứ hai.
_MAX_ANSWER_CHARS = 400


def _lcs_len(left: str, right: str) -> int:
    """Độ dài dãy con chung dài nhất. Dùng cho tiếng Trung: không có dấu cách nên
    so ở mức KÝ TỰ, và LCS phản ánh đúng "giữ được bao nhiêu chữ theo thứ tự"."""
    if not left or not right:
        return 0
    previous = [0] * (len(right) + 1)
    for char_l in left:
        current = [0]
        for index, char_r in enumerate(right):
            if char_l == char_r:
                current.append(previous[index] + 1)
            else:
                current.append(max(current[index], previous[index + 1]))
        previous = current
    return previous[-1]


def _f1(overlap: int, len_answer: int, len_reference: int) -> float:
    """F1 hai phía: phạt cả thiếu ý (recall thấp) và thêm ý (precision thấp)."""
    if not len_answer or not len_reference:
        return 0.0
    return (2 * overlap) / (len_answer + len_reference)


def _token_ratio(answer: str, reference: str) -> float:
    """Tỉ lệ trùng token cho tiếng Việt, dùng multiset nên từ lặp được đếm đúng."""
    answer_tokens = answer.split()
    reference_tokens = reference.split()
    if not answer_tokens or not reference_tokens:
        return 0.0
    overlap = sum((Counter(answer_tokens) & Counter(reference_tokens)).values())
    return _f1(overlap, len(answer_tokens), len(reference_tokens))


def _char_ratio(answer: str, reference: str) -> float:
    return _f1(_lcs_len(answer, reference), len(answer), len(reference))


def references_for(item: dict, direction: str) -> list[str]:
    """Tập đáp án mẫu của một chiều. Bản chính luôn đứng đầu."""
    if direction == DIRECTION_VI_TO_CN:
        return [item.get("sentence_cn", ""), *(item.get("alt_cn") or [])]
    return [item.get("sentence_vi", ""), *(item.get("alt_vi") or [])]


def prompt_for(item: dict, direction: str) -> str:
    """Câu ĐỀ BÀI của một chiều — ngược lại với tập đáp án."""
    return item.get("sentence_vi", "") if direction == DIRECTION_VI_TO_CN else item.get("sentence_cn", "")


def _grade_cn(answer: str, references: list[str], key_words: list[str]) -> dict:
    """Chiều VI→CN: đáp án người học là tiếng Trung."""
    normalized = _norm_cn(answer)
    if not normalized:
        # Gõ pinyin thay chữ Hán là ca thật và cần thông báo RIÊNG: người học tưởng
        # mình trả lời rồi, chỉ báo "sai" thì họ không biết phải đổi bộ gõ.
        has_latin = any(char.isascii() and char.isalpha() for char in answer)
        return {
            "ratio": 0.0,
            "matched_reference": references[0] if references else "",
            "error_tag": "script_error" if has_latin else "empty_output",
        }

    best_ratio = 0.0
    best_reference = references[0] if references else ""
    for reference in references:
        normalized_reference = _norm_cn(reference)
        if not normalized_reference:
            continue
        ratio = 1.0 if normalized == normalized_reference else _char_ratio(normalized, normalized_reference)
        if ratio > best_ratio:
            best_ratio, best_reference = ratio, reference

    missing = [word for word in key_words if _norm_cn(word) and _norm_cn(word) not in normalized]
    error_tag = ""
    if missing:
        error_tag = "missing_key_word"
    elif best_ratio < _PASS_RATIO:
        error_tag = "wording_mismatch"
    return {
        "ratio": best_ratio,
        "matched_reference": best_reference,
        "missing_key_words": missing,
        "error_tag": error_tag,
    }


def _grade_vi(answer: str, references: list[str]) -> dict:
    """Chiều CN→VI: đáp án người học là tiếng Việt.

    So hai bậc: có dấu (chuẩn) và không dấu (hạ điểm bằng ``_NO_DIACRITIC_PENALTY``).
    Bậc không dấu tồn tại vì kỹ năng đang kiểm tra là HIỂU tiếng Trung — người học
    không có bàn phím tiếng Việt vẫn phải được ghi nhận, chỉ không được điểm tối đa.

    Bậc không dấu CHỈ mở khi cả câu trả lời không có một dấu nào. Người đã gõ được
    dấu ở chỗ khác thì dấu SAI là lỗi thật, không phải hạn chế bàn phím — nếu mở
    bậc này cho họ thì ``Bả ấy là mẹ tôi`` sẽ khớp ``Bà ấy là mẹ tôi``, tức chấm
    đúng cho một bản dịch sai nghĩa.
    """
    normalized = _norm_vi(answer)
    if not normalized:
        return {
            "ratio": 0.0,
            "matched_reference": references[0] if references else "",
            "error_tag": "empty_output",
            "no_diacritics": False,
        }

    bare_answer = _strip_diacritics(normalized)
    typed_without_diacritics = bare_answer == normalized

    best_ratio = 0.0
    best_reference = references[0] if references else ""
    no_diacritics = False
    for reference in references:
        normalized_reference = _norm_vi(reference)
        if not normalized_reference:
            continue
        if normalized == normalized_reference:
            ratio, bare_hit = 1.0, False
        else:
            ratio, bare_hit = _token_ratio(normalized, normalized_reference), False
            if typed_without_diacritics:
                bare_reference = _strip_diacritics(normalized_reference)
                bare_ratio = (
                    1.0 if bare_answer == bare_reference else _token_ratio(bare_answer, bare_reference)
                ) * _NO_DIACRITIC_PENALTY
                if bare_ratio > ratio:
                    ratio, bare_hit = bare_ratio, True
        if ratio > best_ratio:
            best_ratio, best_reference, no_diacritics = ratio, reference, bare_hit

    error_tag = ""
    if best_ratio < _PASS_RATIO:
        error_tag = "meaning_mismatch"
    elif no_diacritics:
        error_tag = "missing_diacritics"
    return {
        "ratio": best_ratio,
        "matched_reference": best_reference,
        "error_tag": error_tag,
        "no_diacritics": no_diacritics,
    }


def _feedback(direction: str, correct: bool, detail: dict) -> str:
    tag = detail.get("error_tag") or ""
    if tag == "empty_output":
        return "Chưa có câu trả lời. Hãy gõ bản dịch của bạn."
    if tag == "script_error":
        return "Hãy gõ bằng chữ Hán, không phải pinyin."
    if tag == "missing_key_word":
        missing = "、".join(detail.get("missing_key_words") or [])
        return f"Câu dịch còn thiếu ý của từ khoá: {missing}."
    if tag == "missing_diacritics":
        return "Đúng nghĩa rồi. Lần sau gõ đủ dấu tiếng Việt để được điểm tối đa."
    if not correct:
        if direction == DIRECTION_VI_TO_CN:
            return "Câu tiếng Trung còn lệch so với đáp án mẫu. Đối chiếu để xem khác ở đâu."
        return "Bản dịch còn lệch nghĩa so với đáp án mẫu. Đối chiếu để xem khác ở đâu."
    return "Bản dịch khớp đáp án mẫu."


def grade(user_answer: str, item: dict, direction: str) -> dict:
    """Chấm một câu dịch bằng cách so khớp đáp án mẫu. Tất định, không mạng.

    Trả về cùng bộ khoá cho cả hai chiều để client không phải phân nhánh:
    ``{correct, score, matched_reference, missing_key_words, error_tag, feedback}``.
    """
    direction = direction if direction in DIRECTIONS else DIRECTION_CN_TO_VI
    answer = str(user_answer or "").strip()[:_MAX_ANSWER_CHARS]
    references = [text for text in references_for(item, direction) if text]
    if not references:
        # Item không có đáp án mẫu thì không thể chấm — nói thẳng thay vì cho 0 điểm
        # và để người học tưởng mình dịch sai.
        return {
            "correct": False,
            "score": 0,
            "matched_reference": "",
            "missing_key_words": [],
            "error_tag": "no_reference",
            "feedback": "Câu này thiếu đáp án mẫu nên chưa chấm được.",
        }

    if direction == DIRECTION_VI_TO_CN:
        detail = _grade_cn(answer, references, list(item.get("key_words") or []))
    else:
        detail = _grade_vi(answer, references)

    ratio = detail["ratio"]
    # "Đúng" cần cả hai: đủ giống một đáp án mẫu VÀ không thiếu từ khoá. Thiếu từ
    # khoá mà điểm cao là dấu hiệu dịch đúng ngữ pháp nhưng lệch nội dung.
    correct = ratio >= _PASS_RATIO and not detail.get("missing_key_words")
    return {
        "correct": correct,
        # floor(x + 0.5) chứ không round(): round() của Python làm tròn .5 về số CHẴN
        # (62.5 -> 62) còn Math.round() của JS làm tròn lên (63). Bản chấm cục bộ ở
        # api-core.js phải ra cùng điểm, nếu không cùng một câu sẽ hiện hai điểm khác
        # nhau tuỳ online/offline.
        "score": int(min(1.0, max(0.0, ratio)) * 100 + 0.5),
        "matched_reference": detail["matched_reference"],
        "missing_key_words": detail.get("missing_key_words") or [],
        "error_tag": "" if correct else (detail.get("error_tag") or "translation_error"),
        "feedback": _feedback(direction, correct, detail),
    }
