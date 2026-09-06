"""So sánh NGHĨA của các gloss tiếng Việt, dùng chung cho mọi tầng sinh/phục vụ.

Vì sao cần: distractor của câu ``vocab`` là ``meaning_vi`` của từ khác cùng cấp,
mà 36,6% từ vựng trùng ít nhất một nghĩa tiếng Việt với một từ khác CÙNG cấp HSK
(HSK5: 44,5% — riêng nghĩa "xây dựng" có 9 từ: 建立/盖/建/建设/建造/建筑/修建/造/制订).
So chuỗi nguyên văn nên ``'Ít'`` và ``'nhỏ; bé; ít; trẻ'`` được coi là hai lựa
chọn khác nhau, trong khi người học chọn ô nào cũng đúng.

Gloss trong bank là danh sách nghĩa phân tách bằng ``;`` hoặc ``,`` (thỉnh
thoảng ``/`` hoặc ``、``), kèm chú thích trong ngoặc: ``'cửa hàng; tiệm; quán;
khách sạn (cũ)'``. Nên phép so đúng là **giao tập hợp nghĩa**, không phải so
chuỗi: hai gloss xung đột khi có ít nhất một nghĩa trùng nhau.

Chú thích trong ngoặc bị BỎ trước khi tách, không phải giữ làm một nghĩa riêng:
``'họ'`` và ``'họ (nữ)'`` là cùng một nghĩa với người học đang chọn đáp án —
giữ ngoặc thì hai gloss này thành khác nhau và câu vẫn có hai đáp án đúng.
"""

from __future__ import annotations

import re
import unicodedata

# Ngoặc tròn nửa chiều rộng và toàn chiều rộng: chú thích, không phải nghĩa.
_PAREN_RE = re.compile(r"[(（][^)）]*[)）]")
# Dấu phân tách nghĩa trong gloss. ``、`` xuất hiện ở gloss nhập từ nguồn Trung.
_SENSE_SPLIT_RE = re.compile(r"[;,/]|、")
# Ký tự rìa cần cắt sau khi tách: dấu câu cuối câu và khoảng trắng.
_EDGE_CHARS = " \t\r\n.。!！?？…:：-–—"

_CJK_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def normalize_text(value: object) -> str:
    """Chuẩn hoá để so BẰNG: NFC + casefold + gộp khoảng trắng.

    Bắt được các cặp chỉ khác chữ hoa/thường — 14 câu trong bank có đúng lỗi này
    (câu 8357 từ 可能 có cả ``'Có lẽ'`` và ``'có lẽ'``), lọt qua vì cổng QA cũ so
    ``set(options)`` trên chuỗi thô.
    """
    return " ".join(unicodedata.normalize("NFC", str(value or "")).casefold().split())


def senses(value: object) -> set[str]:
    """Tập nghĩa của một gloss, đã chuẩn hoá.

    ``'cửa hàng; tiệm; quán; khách sạn (cũ)'`` -> ``{'cửa hàng', 'tiệm', 'quán',
    'khách sạn'}``. Gloss rỗng -> tập rỗng (không xung đột với bất cứ gì).

    Nếu bỏ ngoặc xong KHÔNG còn gì thì lấy lại phần trong ngoặc: hai từ công cụ
    có gloss thuần chú thích (把 cấp 4 = ``'(tân ngữ đảo trí)'``, 吧 cấp 1 =
    ``'(trợ từ)'``). Trả tập rỗng cho chúng đồng nghĩa với miễn mọi phép kiểm ở
    đúng những gloss mơ hồ nhất.
    """
    text = unicodedata.normalize("NFC", str(value or "")).casefold()
    stripped = _PAREN_RE.sub(" ", text)
    result = _split_senses(stripped)
    return result or _split_senses(text.replace("(", " ").replace("（", " ")
                                   .replace(")", " ").replace("）", " "))


def _split_senses(text: str) -> set[str]:
    result: set[str] = set()
    for part in _SENSE_SPLIT_RE.split(text):
        cleaned = " ".join(part.split()).strip(_EDGE_CHARS)
        if cleaned:
            result.add(cleaned)
    return result


def glosses_conflict(left: object, right: object) -> bool:
    """Hai gloss có nghĩa trùng nhau? Dùng cho cả khâu chèn distractor lúc phục vụ."""
    return bool(senses(left) & senses(right))


def duplicate_after_normalize(options: list) -> bool:
    """Có hai lựa chọn giống nhau sau khi chuẩn hoá? Áp cho MỌI quiz_type."""
    normalized = [normalize_text(option) for option in options]
    return len(set(normalized)) != len(normalized)


def conflicting_option_indexes(options: list, correct_index: int) -> list[int]:
    """Vị trí các distractor có nghĩa trùng đáp án đúng, tăng dần.

    Chỉ dùng cho lựa chọn dạng GLOSS (``vocab``). Options của
    listening/dialogue/translation là CÂU/ĐOẠN — tách theo dấu phẩy sẽ ra các
    mệnh đề trùng nhau giữa hai đoạn khác nghĩa, tức báo động giả (đo trên bank:
    65,1% câu translation bị coi là xung đột).
    """
    if not isinstance(options, list) or not isinstance(correct_index, int):
        return []
    if not 0 <= correct_index < len(options):
        return []
    answer = senses(options[correct_index])
    if not answer:
        return []
    return [
        index
        for index, option in enumerate(options)
        if index != correct_index and senses(option) & answer
    ]


def gloss_reveals_hanzi(gloss: object, hanzi: object) -> bool:
    """Gloss có chứa chính chữ Hán của từ đang hỏi?

    Từ 把 từng có ``meaning_vi = 'Đem (cấu trúc 把)'``: ở câu "Chọn nghĩa đúng
    của: 把" thì lựa chọn duy nhất chứa 把 chính là đáp án, người học không biết
    gì vẫn chọn đúng.
    """
    target = str(hanzi or "").strip()
    if not target:
        return False
    return target in str(gloss or "")


def has_cjk(value: object) -> bool:
    """Có chữ Hán trong chuỗi? Gloss tiếng Việt thì không được có."""
    return bool(_CJK_RE.search(str(value or "")))
