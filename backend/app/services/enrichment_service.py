"""Lõi tính "chiều sâu" cho từ vựng tiếng Trung (thuần, không DB).

Module này là **một nguồn sự thật duy nhất** cho việc suy ra metadata học
sâu từ dữ liệu sẵn có (pinyin, hanzi, nghĩa) — không gọi API ngoài, không
chạm DB, kết quả ổn định giữa các lần chạy nên seed idempotent.

Cả hai luồng dùng chung lõi này:
- Luồng quiz cũ: ``question_generator._pick_distractors`` đọc
  ``confusable_words_json`` để chọn distractor dễ nhầm.
- Luồng session mới: ``ChineseMetadataService`` (DB-aware) ủy thác phần
  tính toán về đây, chỉ bổ sung dữ liệu lấy từ DB (collocations, corpus).

Thuộc tính sinh ra:
- ``tone_pattern``: chuỗi thanh điệu, "xuéxí" -> "2-2", "wǒ" -> "3",
  từ toàn thanh nhẹ -> "neutral" (khớp convention frontend).
- ``confusable_hanzi``: list[str] hanzi dễ nhầm, ưu tiên cặp thủ công chất
  lượng cao rồi tới thuật toán (đồng âm > gần âm > chung chữ > gần nghĩa).
- ``character_family``: chữ Hán dùng chung làm "họ chữ".
- ``component_hint``: gợi ý cấu tạo (ưu tiên giải thích thủ công, fallback
  loại từ + số nét).
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------------------
# Từ điển thủ công chất lượng cao (gộp từ chinese_metadata_service cũ).
# Đây là tri thức sư phạm được người soạn, ưu tiên hơn kết quả thuật toán.
# ---------------------------------------------------------------------------

# Cặp dễ nhầm kinh điển: tự hình gần giống hoặc dễ lẫn khi học.
MANUAL_CONFUSABLE_PAIRS: dict[str, list[str]] = {
    "买": ["卖"],
    "卖": ["买"],
    "四": ["十"],
    "十": ["四"],
    "在": ["再"],
    "再": ["在"],
    "他": ["她", "它"],
    "她": ["他", "它"],
    "它": ["他", "她"],
    "哪": ["那"],
    "那": ["哪"],
    "坐": ["座"],
    "座": ["坐"],
}

# Giải thích cấu tạo/ngữ nghĩa thủ công cho một số chữ trọng yếu.
MANUAL_COMPONENT_HINTS: dict[str, str] = {
    "学": "Bộ/tố 学 thường gắn với học tập: 学生, 学校, 学习.",
    "校": "校 gắn với trường/lớp và môi trường học.",
    "生": "生 thường gắn với người, đời sống, sinh ra.",
    "买": "买 là mua; chú ý khác 卖 là bán.",
    "卖": "卖 là bán; chú ý khác 买 là mua.",
    "四": "四 là số 4, âm sì; dễ nhầm 十 shí.",
    "十": "十 là số 10, âm shí; dễ nhầm 四 sì.",
    "在": "在 chỉ ở/tại/đang; khác 再 là lại/lần nữa.",
    "再": "再 là lại/lần nữa; khác 在 là ở/tại/đang.",
    "吗": "吗 dùng cuối câu hỏi yes/no.",
    "呢": "呢 dùng hỏi tiếp hoặc nhấn ngữ cảnh hội thoại.",
}

# Phân loại chủ đề thô theo ký tự/nghĩa.
TOPIC_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("school", ("学", "校", "老师", "学生", "课")),
    ("people", ("我", "你", "他", "她", "人", "朋友")),
    ("time", ("日", "月", "年", "天", "时", "候", "再")),
    ("place", ("在", "家", "国", "店", "里", "上", "下")),
    ("number", ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")),
]

# Bản đồ nguyên âm có dấu thanh -> số thanh điệu.
_TONE_VOWELS = {
    "ā": 1, "á": 2, "ǎ": 3, "à": 4,
    "ē": 1, "é": 2, "ě": 3, "è": 4,
    "ī": 1, "í": 2, "ǐ": 3, "ì": 4,
    "ō": 1, "ó": 2, "ǒ": 3, "ò": 4,
    "ū": 1, "ú": 2, "ǔ": 3, "ù": 4,
    "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4,
    "ń": 2, "ň": 3, "ǹ": 4, "ḿ": 2,
}

# Từ phụ trợ tiếng Việt cần bỏ khi so khớp nghĩa.
_VI_STOPWORDS = {
    "và", "là", "của", "các", "những", "một", "có", "không", "được",
    "cho", "với", "the", "to", "a", "an", "of", "in", "on", "đã",
    "khi", "này", "đó", "ở", "ra", "vào", "thì", "mà", "hay", "hoặc",
    "người", "việc", "cái", "sự", "rằng", "ấy", "số", "nhiều",
}

_CATEGORY_LABELS = {
    "noun": "Danh từ",
    "verb": "Động từ",
    "adjective": "Tính từ",
    "adj": "Tính từ",
    "adverb": "Trạng từ",
    "pronoun": "Đại từ",
    "numeral": "Số từ",
    "measure": "Lượng từ",
    "measure_word": "Lượng từ",
    "conjunction": "Liên từ",
    "preposition": "Giới từ",
    "particle": "Trợ từ",
    "interjection": "Thán từ",
}


def _is_cjk(ch: str) -> bool:
    return "\u4e00" <= ch <= "\u9fff"


def strip_tones(pinyin: str) -> str:
    """Pinyin không dấu thanh, gộp âm tiết, viết thường (khoá so khớp âm)."""
    if not pinyin:
        return ""
    # Bỏ chữ số chỉ thanh (pinyin kiểu "men2") trước khi chuẩn hoá.
    pinyin = re.sub(r"[1-5]", "", pinyin)
    normalized = unicodedata.normalize("NFD", pinyin.lower())
    out: list[str] = []
    for ch in normalized:
        if ch == "\u0308":  # diaeresis tách ra sau u/ü -> đổi u vừa thêm thành v
            if out and out[-1] == "u":
                out[-1] = "v"
            continue
        if unicodedata.combining(ch):
            continue
        if ch in (" ", "'", "·", "-"):
            continue
        out.append(ch)
    return "".join(out).replace("ü", "v")


def tone_pattern(pinyin: str) -> str:
    """Chuỗi thanh điệu nối bằng '-', ví dụ '2-2', '1-4', '3'.

    Từ toàn thanh nhẹ trả về 'neutral' (khớp convention frontend). Hỗ trợ cả
    pinyin có dấu (wǒ) lẫn pinyin số (wo3).
    """
    if not pinyin:
        return ""
    text = pinyin.strip().lower()

    # Pinyin số: "ni3 hao3" / "nihao3" -> lấy trực tiếp các chữ số thanh.
    digit_tones = re.findall(r"[1-5]", text)
    if digit_tones:
        return "-".join(digit_tones)

    syllables = text.split() if " " in text else _split_syllables(text)
    tones: list[str] = []
    for syl in syllables:
        tone = 0
        for ch in syl:
            if ch in _TONE_VOWELS:
                tone = _TONE_VOWELS[ch]
                break
        tones.append(str(tone))
    # Bỏ các thanh '0' ở cuối do tách dư, nhưng giữ nếu nằm giữa.
    while len(tones) > 1 and tones[-1] == "0":
        tones.pop()
    if not tones or all(t == "0" for t in tones):
        return "neutral"
    return "-".join(tones)


def _is_vowel_char(ch: str) -> bool:
    """True nếu ``ch`` là nguyên âm pinyin, kể cả khi mang dấu thanh."""
    base = "".join(
        c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c)
    )
    base = base.replace("ü", "v")
    return base in "aeiouv"


def _split_syllables(text: str) -> list[str]:
    """Tách pinyin liền thành âm tiết theo cụm nguyên âm.

    Heuristic: mỗi cụm nguyên âm liên tiếp = một hạt nhân âm tiết. Phụ âm
    đứng trước gắn vào âm tiết kế tiếp. Giữ NGUYÊN ký tự gốc (kèm dấu thanh)
    để ``tone_pattern`` đọc được thanh điệu sau khi tách.
    """
    syllables: list[str] = []
    current = ""
    prev_vowel = False
    for ch in text:
        is_vowel = _is_vowel_char(ch)
        if is_vowel and not prev_vowel and current and any(_is_vowel_char(c) for c in current):
            syllables.append(current)
            current = ch
        else:
            current += ch
        prev_vowel = is_vowel
    if current:
        syllables.append(current)
    return syllables or [text]


def _meaning_tokens(meaning: str) -> set[str]:
    if not meaning:
        return set()
    cleaned = []
    for ch in meaning.lower():
        cleaned.append(ch if (ch.isalnum() or unicodedata.category(ch).startswith("L")) else " ")
    tokens = "".join(cleaned).split()
    return {t for t in tokens if len(t) >= 2 and t not in _VI_STOPWORDS}


def _toneless_distance(a: str, b: str) -> int:
    """Khoảng cách Levenshtein đơn giản (đủ cho chuỗi pinyin ngắn)."""
    if a == b:
        return 0
    if not a or not b:
        return max(len(a), len(b))
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def character_family(hanzi: str, all_hanzi: set[str]) -> str:
    """Chữ Hán dùng chung với từ khác (ưu tiên ký tự đầu).

    Trả về một ký tự đại diện nếu từ này chia sẻ ký tự đó với ít nhất một từ
    khác trong tập; ngược lại trả về "".
    """
    if not hanzi:
        return ""
    for ch in hanzi:
        if not _is_cjk(ch):
            continue
        for other in all_hanzi:
            if other != hanzi and ch in other:
                return ch
    return ""


def component_hint(hanzi: str, category: str = "", stroke_count: int | None = None) -> str:
    """Gợi ý cấu tạo: ưu tiên giải thích thủ công, fallback loại từ + số nét."""
    for ch in hanzi or "":
        if ch in MANUAL_COMPONENT_HINTS:
            return MANUAL_COMPONENT_HINTS[ch]
    parts: list[str] = []
    label = _CATEGORY_LABELS.get((category or "").lower())
    if label:
        parts.append(label)
    if stroke_count:
        parts.append(f"{stroke_count} nét")
    if parts:
        return " · ".join(parts)
    if hanzi:
        return f"Quan sát ký tự {hanzi[0]} trước, rồi gắn với âm và nghĩa trong câu."
    return "Gắn chữ, âm, nghĩa và ví dụ trong cùng một lượt học."


def topic(hanzi: str, meaning_vi: str = "", meaning_en: str = "") -> str:
    text = f"{hanzi} {meaning_vi} {meaning_en}"
    for name, markers in TOPIC_HINTS:
        if any(marker in text for marker in markers):
            return name
    return "core"


def compute_confusables(target: dict, corpus: list[dict], limit: int = 6) -> list[dict]:
    """Tính danh sách từ dễ nhầm cho ``target`` trong ``corpus`` (có lý do).

    Mỗi phần tử corpus là dict gồm: hanzi, pinyin, meaning_vi, meaning_en.
    Trả về list dict ``{"hanzi", "pinyin", "meaning", "reason"}`` đã xếp theo
    độ "dễ nhầm" giảm dần. Dùng cho phân tích/UI cần lý do; nơi chỉ cần hanzi
    thì gọi ``confusable_hanzi``.

    Trục nhầm lẫn (điểm cao = dễ nhầm hơn):
      - đồng âm khác thanh: cùng pinyin không dấu thanh, khác mẫu thanh.
      - đồng âm: cùng pinyin không dấu thanh, cùng mẫu thanh.
      - gần âm: pinyin không dấu thanh lệch 1 ký tự.
      - chung chữ: dùng chung ký tự Hán.
      - gần nghĩa: nghĩa trùng từ khoá.
    """
    t_hanzi = target.get("hanzi") or ""
    if not t_hanzi:
        return []
    t_toneless = strip_tones(target.get("pinyin") or "")
    t_tone = tone_pattern(target.get("pinyin") or "")
    t_meaning_tokens = _meaning_tokens(target.get("meaning_vi") or target.get("meaning_en") or "")
    t_chars = {ch for ch in t_hanzi if _is_cjk(ch)}

    scored: list[tuple[float, str, dict]] = []
    for other in corpus:
        o_hanzi = other.get("hanzi") or ""
        if not o_hanzi or o_hanzi == t_hanzi:
            continue
        o_toneless = strip_tones(other.get("pinyin") or "")
        o_meaning_tokens = _meaning_tokens(other.get("meaning_vi") or other.get("meaning_en") or "")
        o_chars = {ch for ch in o_hanzi if _is_cjk(ch)}

        score = 0.0
        reasons: list[str] = []

        if t_toneless and o_toneless == t_toneless:
            o_tone = tone_pattern(other.get("pinyin") or "")
            if o_tone != t_tone:
                score += 5.0
                reasons.append("đồng âm khác thanh")
            else:
                score += 4.0
                reasons.append("đồng âm")
        elif t_toneless and o_toneless and _toneless_distance(t_toneless, o_toneless) == 1:
            score += 3.0
            reasons.append("gần âm")

        shared = t_chars & o_chars
        if shared:
            score += 2.5 + 0.5 * len(shared)
            reasons.append("chung chữ " + "".join(sorted(shared)))

        meaning_overlap = t_meaning_tokens & o_meaning_tokens
        if meaning_overlap:
            score += 1.5 + 0.4 * len(meaning_overlap)
            reasons.append("gần nghĩa")

        if score <= 0:
            continue
        scored.append((score, o_hanzi, {
            "hanzi": o_hanzi,
            "pinyin": other.get("pinyin") or "",
            "meaning": other.get("meaning_vi") or other.get("meaning_en") or "",
            "reason": ", ".join(reasons),
        }))

    # Xếp theo điểm giảm dần, hoà thì theo hanzi để ổn định.
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in scored[:limit]]


def confusable_hanzi(target: dict, corpus: list[dict], limit: int = 6) -> list[str]:
    """Shape canonical lưu vào ``confusable_words_json``: list[str] hanzi.

    Hợp nhất hai nguồn, ưu tiên cặp thủ công chất lượng cao trước, rồi bổ
    sung bằng thuật toán. Chỉ giữ những hanzi thật sự có trong corpus để
    distractor/confusion card luôn dựng được câu hợp lệ.
    """
    t_hanzi = target.get("hanzi") or ""
    if not t_hanzi:
        return []

    corpus_hanzi = {c.get("hanzi") for c in corpus if c.get("hanzi")}
    ordered: list[str] = []
    seen: set[str] = set()

    def _add(hanzi: str) -> None:
        if (
            hanzi
            and hanzi != t_hanzi
            and hanzi not in seen
            and hanzi in corpus_hanzi
        ):
            seen.add(hanzi)
            ordered.append(hanzi)

    # 1) Cặp thủ công: khớp theo từng ký tự trong hanzi (vd 他 -> 她, 它).
    for ch in t_hanzi:
        for pair in MANUAL_CONFUSABLE_PAIRS.get(ch, []):
            _add(pair)

    # 2) Thuật toán: lấp phần còn thiếu theo thứ tự dễ nhầm.
    for item in compute_confusables(target, corpus, limit=limit * 2):
        _add(item["hanzi"])
        if len(ordered) >= limit:
            break

    return ordered[:limit]


# Các cặp phụ âm/vần người học hay lẫn (lỗi phát âm vùng miền/hệ thống).
# Dùng để gắn nhãn chi tiết khi lỗi rơi vào lớp âm thanh.
SOUND_CONFUSION_PAIRS: tuple[tuple[str, str], ...] = (
    ("zh", "z"), ("ch", "c"), ("sh", "s"),
    ("z", "j"), ("l", "n"), ("l", "r"), ("n", "r"),
    ("f", "h"), ("b", "p"), ("d", "t"), ("g", "k"),
    ("in", "ing"), ("en", "eng"), ("an", "ang"),
    ("un", "ong"), ("ian", "iang"), ("uan", "uang"),
)


def _sound_confusion_label(a: str, b: str) -> str:
    """Nếu hai pinyin không thanh chỉ khác nhau ở một cặp dễ lẫn, trả nhãn.

    Ví dụ: ``shi`` vs ``si`` -> ``confusion_sh_s``. Không khớp -> "".
    """
    if not a or not b or a == b:
        return ""
    for x, y in SOUND_CONFUSION_PAIRS:
        # thử thay x->y và y->x trên một trong hai chuỗi
        if a.replace(x, y, 1) == b or b.replace(x, y, 1) == a:
            lo, hi = sorted((x, y))
            return f"confusion_{lo}_{hi}"
    return ""


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def classify_error(
    correct_word: dict,
    selected_word: dict | None,
    skill: str = "recognition",
) -> dict:
    """Phân loại lỗi từ cặp (đáp án đúng, đáp án người học chọn).

    Trả về dict ``{"error_tag", "detail", "confusion"}`` trong đó:
      - ``error_tag``: một trong ``tone_error`` | ``sound_error`` |
        ``hanzi_error`` | ``meaning_error`` | ``context_error``.
      - ``detail``: nhãn chi tiết (vd ``confusion_sh_s``, ``shared_radical``)
        để hệ thống đề xuất bài luyện đúng loại; có thể rỗng.
      - ``confusion``: cặp ``"correct→selected"`` để dựng ma trận nhầm lẫn.

    Thứ tự ưu tiên: thanh điệu > âm thanh > tự hình > ngữ nghĩa. Khi không
    đủ dữ liệu (thiếu selected) thì lùi về suy luận theo kỹ năng.
    """
    c_hanzi = (correct_word or {}).get("hanzi") or ""
    s_hanzi = (selected_word or {}).get("hanzi") if selected_word else ""
    confusion = f"{c_hanzi}→{s_hanzi}" if (c_hanzi and s_hanzi) else ""

    # Không biết người học chọn gì -> suy luận thô theo kỹ năng.
    if not selected_word or not s_hanzi or s_hanzi == c_hanzi:
        if skill == "listening":
            return {"error_tag": "sound_error", "detail": "", "confusion": confusion}
        if skill in ("context", "production"):
            return {"error_tag": "context_error", "detail": "", "confusion": confusion}
        return {"error_tag": "meaning_error", "detail": "", "confusion": confusion}

    c_toneless = strip_tones(correct_word.get("pinyin") or "")
    s_toneless = strip_tones(selected_word.get("pinyin") or "")
    c_tone = tone_pattern(correct_word.get("pinyin") or "")
    s_tone = tone_pattern(selected_word.get("pinyin") or "")

    # 1) Lỗi thanh điệu: cùng âm (bỏ thanh) nhưng khác mẫu thanh.
    if c_toneless and c_toneless == s_toneless and c_tone != s_tone:
        return {
            "error_tag": "tone_error",
            "detail": f"{s_tone}->{c_tone}",
            "confusion": confusion,
        }

    # 2) Lỗi âm thanh: pinyin lệch nhỏ (Levenshtein <=1) hoặc cặp dễ lẫn.
    if c_toneless and s_toneless:
        label = _sound_confusion_label(c_toneless, s_toneless)
        if label:
            return {"error_tag": "sound_error", "detail": label, "confusion": confusion}
        if _toneless_distance(c_toneless, s_toneless) <= 1:
            return {"error_tag": "sound_error", "detail": "near_sound", "confusion": confusion}

    # 3) Lỗi tự hình: chung ký tự/bộ thủ giữa hai chữ Hán.
    c_chars = {ch for ch in c_hanzi if _is_cjk(ch)}
    s_chars = {ch for ch in s_hanzi if _is_cjk(ch)}
    if c_chars and s_chars:
        shared = c_chars & s_chars
        jac = _jaccard(c_chars, s_chars)
        if shared or jac >= 0.5:
            detail = "shared_char_" + "".join(sorted(shared)) if shared else "similar_shape"
            return {"error_tag": "hanzi_error", "detail": detail, "confusion": confusion}

    # 4) Còn lại: lỗi ngữ nghĩa (chọn từ khác nghĩa).
    tag = "context_error" if skill in ("context", "production") else "meaning_error"
    return {"error_tag": tag, "detail": "", "confusion": confusion}
