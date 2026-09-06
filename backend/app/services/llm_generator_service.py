import json
import urllib.request
import urllib.error
import re
import time
import logging
import random
from typing import List, Dict, Any, Tuple
from ..settings import NO_LLM_KEY_MESSAGE, settings
from .gloss_senses import (
    conflicting_option_indexes,
    duplicate_after_normalize,
    gloss_reveals_hanzi,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

API_QUIZ_TYPES = {"vocab", "listening", "reading", "translation", "cloze", "drag_drop"}

# Đặc tả hai dạng theo chuẩn đề thi (选词填空 / 阅读理解). Dùng CHUNG cho mọi
# prompt LLM trong file để câu AI sinh ra khớp cùng một khuôn với ngân hàng
# đoạn văn viết tay ở ``app/data/exam_passages.json``.
#
# Ràng buộc kỹ thuật quan trọng: prompt cloze phải có ĐÚNG MỘT ``____`` vì
# renderer frontend tách prompt bằng ``split(/_{2,}/)`` để chạy hiệu ứng điền.
# Các chỗ trống khác trong cùng đoạn phải ghi dạng （2）, （3）...
_CLOZE_SPEC = (
    "选词填空: prompt là ĐOẠN 2-4 câu tiếng Trung liền mạch, KHÔNG phải câu rời. "
    "BẮT BUỘC (câu không đạt sẽ bị loại tự động): đoạn phải có TỐI THIỂU 2 dấu kết "
    "câu 。！？ và TỐI THIỂU 17 chữ Hán. Viết đủ 2-3 câu kể một tình huống nhỏ "
    "(đi chợ, ở lớp, thời tiết, gia đình), đừng chỉ viết một câu ngắn rồi thêm ____. "
    "Đoạn chứa 2-4 chỗ trống; chỗ ĐANG HỎI ghi bằng đúng một ____ , các chỗ còn "
    "lại ghi （2）,（3）… theo số thứ tự. 4 options là từ tiếng Trung dùng chung cho "
    "cả đoạn (word bank), cùng một bộ cho mọi chỗ trống của đoạn đó. "
    "WORD BANK PHẢI PHỦ ĐÚNG các chỗ trống: mỗi chỗ （2）,（3）… phải điền được bằng "
    "MỘT option khác nhau trong 4 options, và mỗi option chỉ dùng cho một chỗ. "
    "Nghĩa là nếu （2）đứng sau 非常/很 thì word bank phải có một tính từ điền vào đó — "
    "KHÔNG được để 4 options cùng một từ loại rồi chỉ khớp chỗ ____ đang hỏi, vì khi đó "
    "các chỗ còn lại của đoạn không có từ nào điền được và đề trở thành vô nghiệm. "
    "Cách an toàn: viết đoạn chỉ 2 chỗ trống (____ và （2）) rồi chọn 4 options gồm đáp án "
    "đúng cho ____, một từ điền được vào （2）, và 2 từ nhiễu cùng từ loại với đáp án. "
    "Ưu tiên kiểm tra: từ loại đúng vị trí, cặp liên từ (虽然…但是/因为…所以/只要…就/"
    "只有…才/即使…也/不仅…而且/与其…不如), và cụm cố định. "
    "explanation bằng tiếng Việt, nêu rõ căn cứ ngữ pháp chọn đáp án. "
    "Mẫu đúng: 我家旁边新开了一个大超市。____里面的东西很便宜，（2）去那里买东西的人非常多。"
)
_READING_SPEC = (
    "阅读理解: prompt gồm ĐOẠN VĂN tiếng Trung, rồi một dòng trống, rồi CÂU HỎI "
    "bằng tiếng Trung (ví dụ 这段话主要说什么？ / 根据这段话，下面哪个正确？). "
    "BẮT BUỘC (câu không đạt sẽ bị loại tự động): phần đoạn văn phải có TỐI THIỂU "
    "2 dấu kết câu 。！？ và TỐI THIỂU 17 chữ Hán — tức ít nhất 2 câu kể, không "
    "phải một câu đơn rồi hỏi luôn. "
    "4 options đều bằng tiếng Trung (KHÔNG dùng tiếng Việt), độ dài tương đương. "
    "Mỗi đoạn nên có một câu hỏi chi tiết (tìm thông tin trực tiếp) và một câu hỏi "
    "ý chính. explanation bằng tiếng Việt, chỉ ra câu nào trong đoạn là căn cứ. "
    "Mẫu đúng: 小王每天六点起床。他先跑步半个小时，然后吃早饭。\\n\\n小王每天先做什么？"
)
_VOCAB_SPEC = (
    "vocab: prompt là 'Chọn nghĩa đúng của: <hanzi>'. "
    "4 options đều là nghĩa tiếng Việt (KHÔNG dùng chữ Hán hay pinyin). "
    "Distractor phải cùng từ loại với đáp án đúng (danh từ ↔ danh từ, động từ ↔ động từ) "
    "và gần nghĩa hoặc cùng trường ngữ nghĩa — tránh distractor quá xa nghĩa dễ loại ngay. "
    "explanation bằng tiếng Việt: nghĩa chính xác + ví dụ dùng từ ngắn gọn."
)
_TRANSLATION_SPEC = (
    "translation: prompt là câu/đoạn văn tiếng Trung ngắn (1-3 câu, ngữ cảnh đầy đủ). "
    "4 options là 4 bản dịch tiếng Việt — chỉ 1 bản vừa chính xác vừa tự nhiên. "
    "3 bản sai theo các lỗi tinh tế khác nhau: sai thì/thể, sai đại từ nhân xưng, "
    "dịch từng chữ cứng nhắc, hoặc bỏ sót/thêm ý. TẤT CẢ 4 options phải nghe như "
    "tiếng Việt tự nhiên (không phải tiếng Anh dịch). KHÔNG để CJK trong options. "
    "explanation bằng tiếng Việt: nêu rõ lỗi của từng option sai và căn cứ đáp án đúng."
)
_LISTENING_SPEC = (
    "listening: audio_text là câu tiếng Trung sẽ được đọc lên (1-2 câu, tự nhiên). "
    "prompt TUYỆT ĐỐI không được chứa lại nội dung audio_text — chỉ ghi câu hỏi kiểu "
    "'Nghe và chọn nghĩa đúng' hoặc 'Người nói muốn nói gì?'. "
    "4 options là nghĩa tiếng Việt, KHÔNG để chữ Hán trong options (người học phải "
    "nghe mới trả lời được, không đọc được đáp án). "
    "explanation bằng tiếng Việt: ghi lại audio_text kèm bản dịch để đối chiếu sau khi trả lời."
)
_DRAG_DROP_SPEC = (
    "drag_drop: chỉ cần tạo metadata.correct_order là các từ/cụm từ tiếng Trung theo "
    "thứ tự đúng của câu (2-8 token, mỗi token là một từ/cụm có nghĩa — KHÔNG tách "
    "rời từng chữ Hán của một từ hai âm tiết). Backend tự xáo trộn thành segments và "
    "tạo placeholder options, nên KHÔNG tự xáo trộn và KHÔNG cần điền options. "
    "Nên đặt metadata.sentence_vi là bản dịch tiếng Việt của câu đúng. "
    "Câu phải kiểm tra một điểm trật tự từ thật (vị trí trạng ngữ thời gian, 把-câu, "
    "bổ ngữ trình độ, trạng ngữ nơi chốn) chứ không phải câu ngẫu nhiên. "
    "explanation bằng tiếng Việt: nêu quy tắc trật tự từ quyết định thứ tự đúng."
)


# Một "chỗ trống" là chuỗi 2+ dấu gạch dưới — khớp với split(/_{2,}/) của
# renderer frontend, nên đếm ở đây phản ánh đúng số ô người học nhìn thấy.
_BLANK_RUN_RE = re.compile(r"_{2,}")

# CJK Unified Ideographs: basic + extension A + compatibility (đồng bộ với
# ``question_generator._CJK_RANGE``).
_CJK_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def _has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(str(text or "")))


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(str(text or "")))


# Số ký tự CJK tối đa cho phép trong MỘT option của dạng vocab/translation
# (options phải là tiếng Việt). Không cấm CJK tuyệt đối vì gloss tiếng Việt hợp
# lệ có quyền trích chữ Hán trong ngoặc: "Đem (cấu trúc 把)", "Bị (bị động)".
#
# Ngưỡng 2 lấy từ phân bố thật của bank (1119 row vocab+translation): option
# gloss hợp lệ tối đa 1 ký tự CJK, còn row dịch lỗi (chèn nguyên cụm Trung chưa
# dịch vào "bản dịch tiếng Việt") thấp nhất 3 và trung vị 8 — giữa 1 và 3 không
# có row nào, nên cắt ở 2 tách đúng hai nhóm mà không chạm gloss hợp lệ.
_MAX_CJK_PER_VI_OPTION = 2


# Nhãn "A." / "B)" / "C、" / "D:" ở ĐẦU nội dung option. Chỉ khớp một chữ cái
# latin A-D (hoa hoặc thường) + một dấu phân cách + khoảng trắng tùy chọn.
_OPTION_LABEL_RE = re.compile(r"^\s*[A-Da-d]\s*[.)．、:：]\s*")


# Ký tự ngoài tiếng Trung LẪN vào giữa thân chữ Hán: relay đôi khi thay một từ
# chức năng bằng từ tiếng Anh/Việt/Hàn ("欧洲 of 温带森林", "祝 she 天天快乐",
# "蜂群의生存"). Câu vẫn hợp lệ với validator cũ nhưng người học đọc thì vô nghĩa.
#
# Chỉ bắt khi ký tự lạ NẰM GIỮA hai chữ Hán (hoặc dính liền một chữ Hán), không
# bắt tiền tố câu lệnh tiếng Việt hợp lệ ("Chọn từ đúng điền vào chỗ trống: …"),
# vì phần dẫn đó nằm trước toàn bộ thân chữ Hán chứ không lẫn vào giữa.
_LATIN_WORD = r"[A-Za-z]{2,}"
_VI_DIACRITIC = r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]"
_HANGUL_KANA = r"[가-힣ㄱ-ㅎㅏ-ㅣぁ-ゟ゠-ヿ]"
_FOREIGN_IN_CJK_RE = re.compile(
    # Chữ Hán + (khoảng trắng tùy chọn) + ký tự lạ, hoặc chiều ngược lại.
    rf"(?:{_CJK_RE.pattern}\s*(?:{_LATIN_WORD}|{_VI_DIACRITIC}|{_HANGUL_KANA})"
    rf"|(?:{_LATIN_WORD}|{_VI_DIACRITIC}|{_HANGUL_KANA})\s*{_CJK_RE.pattern})"
)

# Acronym viết hoa dính chữ Hán là hợp lệ trong tiếng Trung thật: 5G技术,
# WTO成员, IT行业. Bỏ trước khi soi để không loại oan.
#
# KHÔNG dùng ``\b`` ở đầu: Python coi chữ Hán là ký tự "word", nên giữa 家 và I
# trong "这家IT公司" KHÔNG có word boundary — allowlist khi đó chỉ chạy được nếu
# acronym nằm ngay đầu chuỗi, còn mọi acronym giữa câu vẫn bị
# ``_FOREIGN_IN_CJK_RE`` loại oan (đo được: "这家IT公司很大" -> "家IT",
# "他在WTO成员国工作" -> "在WTO", "这是CD播放器" -> "是CD"), đúng thứ mà comment
# trên đây nói là để tránh. Lookbehind chỉ chặn chữ/số ASCII liền trước, nên
# acronym sau chữ Hán vẫn được bỏ mà "aBC汉" thì không.
_ACRONYM_RE = re.compile(r"(?<![A-Za-z0-9])[0-9]*[A-Z]{1,4}(?=[一-鿿])")


def _foreign_in_cjk(text: str) -> str:
    """Trả về đoạn ký tự lạ lẫn trong thân chữ Hán, chuỗi rỗng nếu sạch."""
    value = _ACRONYM_RE.sub("", str(text or ""))
    match = _FOREIGN_IN_CJK_RE.search(value)
    return match.group(0) if match else ""


# "đáp án đúng là B", "phương án A", "lựa chọn C" trong explanation. Vô dụng và
# gây hiểu sai: ``_shuffle_options`` xáo lại vị trí sau khi model viết giải
# thích, nên chữ cái gần như luôn trỏ sai — đo trên bank: 61/80 câu trỏ lệch.
# Frontend cũng tự đánh nhãn theo vị trí nên chữ cái trong explanation không có
# gì bảo đảm khớp. Giải thích phải dẫn NỘI DUNG đáp án, không dẫn chữ cái.
_EXPL_LETTER_RE = re.compile(
    r"(?:đáp án|phương án|lựa chọn|câu trả lời|option)\s*"
    r"(?:đúng|chính xác|phù hợp)?\s*(?:là|:)?\s*[\"'“]?\b([A-D])\b",
    re.IGNORECASE,
)


def _strip_option_labels(options: list) -> list:
    """Bỏ nhãn A./B./C./D. mà model tự thêm vào đầu mỗi option.

    Frontend đã tự sinh nhãn theo VỊ TRÍ (``String.fromCharCode(65 + index)``
    trong option-grid của App.jsx), nên nhãn nằm trong text làm nút hiện hai
    nhãn chồng nhau. Tệ hơn: ``_shuffle_options`` xáo lại vị trí sau đó, nên
    nhãn cũ trỏ sai — option ở vị trí A lại mang chữ "D.". Phải bỏ TRƯỚC khi
    xáo, vì sau khi xáo thì không còn biết nhãn nào từng đúng.

    Chỉ bỏ khi có TỪ 2 option trở lên mang nhãn: một option tiếng Việt mở đầu
    bằng "A." đơn lẻ là nội dung thật, còn 2+ option cùng dạng thì chắc chắn là
    model đánh nhãn cả bộ.
    """
    values = [str(value) for value in options]
    matches = [bool(_OPTION_LABEL_RE.match(value)) for value in values]
    if sum(matches) < 2:
        return values
    stripped = [
        _OPTION_LABEL_RE.sub("", value).strip() if matched else value.strip()
        for value, matched in zip(values, matches)
    ]
    # Bỏ nhãn có thể làm hai option trùng nhau (model đánh nhãn khác nhau nhưng
    # nội dung y hệt). VẪN trả bản đã bỏ nhãn: trả bản gốc thì check trùng ở
    # validator so hai chuỗi CÒN nhãn ("A. quả táo" vs "B. quả táo") — khác nhau
    # nên câu lọt qua, và bộ 4 option có hai đáp án y hệt được ghi vào bank. Bỏ
    # nhãn rồi thì đúng cặp đó thành trùng và validator loại được thật.
    if any(not value for value in stripped):
        return values
    return stripped


# Dấu kết câu tiếng Trung. Dùng để phân biệt ĐOẠN (选词填空/阅读理解 chuẩn đề
# thi) với CÂU RỜI (dạng cloze/reading kiểu cũ) — chỉ đếm CJK là không đủ vì
# một câu dài cũng vượt ngưỡng ký tự.
_CN_SENTENCE_END_RE = re.compile(r"[。！？；…]")

# Ngưỡng hiệu chuẩn theo ngân hàng viết tay ở app/data/exam_passages.json:
# đoạn ngắn nhất có 17 ký tự CJK và 2 dấu kết câu.
_MIN_PASSAGE_CJK = 16
_MIN_PASSAGE_SENTENCES = 2


def _is_passage(text: str) -> bool:
    """Prompt có phải một ĐOẠN nhiều câu tiếng Trung (không phải câu rời)."""
    value = str(text or "")
    return (
        len(_CJK_RE.findall(value)) >= _MIN_PASSAGE_CJK
        and len(_CN_SENTENCE_END_RE.findall(value)) >= _MIN_PASSAGE_SENTENCES
    )


_JSON_CLOSERS = {"{": "}", "[": "]"}


def _balanced_end(value: str, start: int) -> int | None:
    """Vị trí NGAY SAU ngoặc đóng khớp với ``value[start]``, None nếu chưa đóng.

    Có nhận biết chuỗi: ngoặc nằm trong chuỗi JSON (rất hay gặp — dấu 「」 hoặc
    ngoặc trong câu tiếng Trung) không được tính, và ``\\"`` không kết thúc chuỗi.
    Chỉ cần biết khối đã đóng hay chưa, việc parse để ``json.loads`` làm.
    """
    opener = value[start]
    closer = _JSON_CLOSERS[opener]
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(value)):
        character = value[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in (opener, closer):
            depth += 1 if character == opener else -1
            if depth == 0:
                return index + 1
        elif character in _JSON_CLOSERS or character in _JSON_CLOSERS.values():
            # Ngoặc loại khác lồng bên trong: bỏ qua, độ sâu chỉ tính theo cặp
            # của khối ngoài cùng. json.loads sẽ bắt lỗi nếu chúng lệch nhau.
            continue
    return None


def _clean_json_response(content: str) -> str:
    """Return the first complete JSON object/array from a model response.

    Some OpenAI-compatible relays ignore the system instruction and prepend a
    short sentence (or wrap the object in a Markdown fence).  ``raw_decode``
    is deliberately used instead of a greedy regex: braces in quoted Chinese
    text must not change where the JSON document ends.
    """
    value = str(content or "").strip()
    if value.startswith("```"):
        first_newline = value.find("\n")
        if first_newline != -1:
            value = value[first_newline + 1:]
        if value.rstrip().endswith("```"):
            value = value.rstrip()[:-3]
        value = value.strip()

    # Ưu tiên OBJECT, không phải "khối đầu tiên parse được": mọi caller của
    # ``_call_api`` đều làm ``data.get(...)`` / ``"words" not in data``, tức luôn
    # cần dict. Câu dẫn của model rất hay chứa một mảng hợp lệ — vd
    # "Tôi đã tạo 3 câu hỏi [1, 2, 3] như sau:\n{...}" — và nếu nhận mảng đó thì
    # json.loads THÀNH CÔNG, nên nhánh ``except json.JSONDecodeError`` trong
    # ``_call_provider`` không chạy, mất luôn 3 lượt retry và cả bundle bị huỷ
    # bởi RuntimeError("missing 'words' key"). Chỉ rơi về mảng khi không có object.
    #
    # Và KHÔNG được quét vào trong một khối chưa đóng. Response bị cắt vì
    # ``finish_reason=length`` luôn có dạng '{"words": [{...}, {"hanzi": "面'
    # — quét vào trong sẽ tìm thấy phần tử đầu tiên của mảng, một object HOÀN
    # CHỈNH, rồi trả về nó. json.loads lại thành công, nên đúng cái nhánh retry
    # sinh ra để cứu ca truncation này không bao giờ chạy, và nguyên nhân thật
    # (bị cắt) bị che sau lỗi "missing 'words' key". Vì thế phải kiểm ngoặc cân
    # trước: khối ngoài cùng chưa đóng thì trả nguyên văn để json.loads NÉM lỗi.
    fallback: str | None = None
    start = 0
    while start < len(value):
        if value[start] not in "{[":
            start += 1
            continue
        end = _balanced_end(value, start)
        if end is None:
            # Chưa đóng: mọi thứ phía sau đều nằm bên trong nó. Dừng hẳn, đừng
            # nhặt mảnh con — để retry lo.
            break
        fragment = value[start:end]
        try:
            parsed = json.loads(fragment)
        except json.JSONDecodeError:
            # Ngoặc cân nhưng không phải JSON (vd văn xuôi có dấu ngoặc).
            start += 1
            continue
        if isinstance(parsed, dict):
            return fragment
        # Mảng: giữ làm phương án dự phòng rồi nhảy QUA nó, không quét vào trong.
        # Quét vào trong sẽ trả về phần tử đầu của mảng — với "[{...},{...}]" là
        # cắt mất phần còn lại của tài liệu.
        if fallback is None:
            fallback = fragment
        start = end
    return fallback if fallback is not None else value


def _validate_question(q_data: dict, word_hanzi: str = "") -> Tuple[bool, str]:
    """Validate a single question. Returns (is_valid, reason)."""
    required = ["quiz_type", "prompt", "options", "correct_index", "explanation"]
    for field in required:
        if field not in q_data:
            return False, f"Missing field: {field}"

    # Check quiz_type is valid
    # Bộ luyện này chủ động không sinh listening; nghe dùng audio/template
    # riêng để tránh LLM tạo transcript hoặc đáp án không khớp audio.
    valid_types = {"vocab", "cloze", "translation", "reading"}
    if q_data["quiz_type"] not in valid_types:
        return False, f"Invalid quiz_type: {q_data['quiz_type']}"

    # Check options
    options = q_data.get("options", [])
    if not isinstance(options, list) or len(options) != 4:
        return False, f"Options must be exactly 4, got {len(options) if isinstance(options, list) else type(options).__name__}"

    # Check for empty/duplicate options
    cleaned = [str(o).strip() for o in options]
    if any(not o for o in cleaned):
        return False, "Empty option found"
    if len(set(cleaned)) < 4:
        return False, f"Duplicate options: {cleaned}"
    # So chuỗi thô bỏ sót cặp chỉ khác chữ hoa/thường hoặc khác khoảng trắng.
    if duplicate_after_normalize(cleaned):
        return False, f"Duplicate options after normalize: {cleaned}"

    # Check correct_index
    ci = q_data.get("correct_index", 0)
    if not isinstance(ci, int) or ci < 0 or ci > 3:
        return False, f"Invalid correct_index: {ci}"

    # Check prompt contains word or makes sense
    prompt = str(q_data.get("prompt", ""))
    if len(prompt) < 5:
        return False, "Prompt too short"
    # cloze/reading đi qua ĐÚNG các ràng buộc của ngân hàng đoạn văn chuẩn đề
    # thi, vì quiz_service._ai_subtype_for gắn cho chúng guided_cloze /
    # reading_comp_mc — cùng nhãn với row viết tay. Không siết ở đây thì câu
    # kiểu cũ (một câu rời, options tiếng Việt) sẽ lọt vào bank dưới nhãn đề thi.
    if q_data["quiz_type"] == "cloze":
        blanks = len(_BLANK_RUN_RE.findall(prompt))
        if blanks == 0:
            return False, "Cloze question missing ____"
        # Renderer frontend split(/_{2,}/) chỉ điền một ô, nên nhiều ____ hiện sai.
        if blanks > 1:
            return False, f"Cloze must have exactly one blank, got {blanks}"
        if not _has_cjk(prompt):
            return False, "Cloze prompt must be Chinese"
        if not _is_passage(prompt):
            return False, "Cloze prompt must be a multi-sentence passage"
        if not all(_has_cjk(value) for value in cleaned):
            return False, "Cloze options must be Chinese"
    if q_data["quiz_type"] == "reading":
        if not _has_cjk(prompt):
            return False, "Reading prompt must be Chinese"
        if not _is_passage(prompt):
            return False, "Reading prompt must be a multi-sentence passage"
        if not all(_has_cjk(value) for value in cleaned):
            return False, "Reading options must be Chinese"
    if q_data["quiz_type"] in ("vocab", "translation"):
        # Cùng ràng buộc như _validate_api_quiz_question: options là tiếng Việt,
        # cho phép gloss trích chữ Hán trong ngoặc nhưng không cho chèn nguyên
        # cụm Trung chưa dịch.
        if max(_cjk_count(value) for value in cleaned) > _MAX_CJK_PER_VI_OPTION:
            return False, f"{q_data['quiz_type']} options must be Vietnamese"
    if q_data["quiz_type"] == "vocab":
        # Lựa chọn của vocab là GLOSS: hai gloss trùng nghĩa nghĩa là hai đáp án
        # cùng đúng. Không áp cho translation vì lựa chọn của nó là bản dịch cả
        # đoạn, tách theo dấu phẩy sẽ ra mệnh đề trùng nhau giữa hai đoạn khác
        # nghĩa (đo trên bank: 65,1% câu translation bị coi là xung đột).
        if conflicting_option_indexes(cleaned, ci):
            return False, "vocab options share a meaning with the answer"
        # Gloss chứa chính chữ Hán đang hỏi thì lựa chọn duy nhất có chữ Hán là
        # đáp án — người học không biết gì vẫn chọn đúng.
        if gloss_reveals_hanzi(cleaned[ci], word_hanzi):
            return False, "vocab answer reveals the target hanzi"
    if q_data["quiz_type"] == "translation" and not _has_cjk(prompt):
        return False, "Translation prompt must contain Chinese"

    # Check explanation is meaningful
    explanation = str(q_data.get("explanation", ""))
    if len(explanation) < 3:
        return False, "Explanation too short"

    return True, "ok"


def _validate_word_entry(item: dict) -> Tuple[bool, str]:
    """Validate a word entry from the LLM. Returns (is_valid, reason)."""
    if not item.get("hanzi"):
        return False, "Missing hanzi"
    if not item.get("pinyin"):
        return False, "Missing pinyin"
    if not item.get("meaning_vi"):
        return False, "Missing meaning_vi"

    questions = item.get("questions", [])
    if not isinstance(questions, list) or len(questions) == 0:
        return False, "No questions"

    # Bỏ nhãn A./B./C./D. trước khi validate: nhãn làm sai lệch cả check độ dài
    # options tương đương lẫn check "options phải là tiếng Việt".
    for q in questions:
        if isinstance(q, dict) and isinstance(q.get("options"), list):
            q["options"] = _strip_option_labels(q["options"])

    # Validate MỘT lần mỗi câu (trước đây gọi 2 lần: đếm rồi lọc lại).
    valid_questions = [q for q in questions if _validate_question(q, item["hanzi"])[0]]
    if not valid_questions:
        return False, "No valid questions after validation"

    item["questions"] = valid_questions
    return True, f"{len(valid_questions)} valid questions"


def _extract_content(result_json: dict):
    """Pull text content from an LLM response, tolerating both OpenAI-style
    ({choices:[{message:{content}}]}) and native Gemini-style
    ({candidates:[{content:{parts:[{text}]}}]}) response shapes. Returns the
    string, or None if neither shape is present."""
    # OpenAI-compatible shape (StepFun và các relay đều trả về dạng này)
    try:
        content = result_json["choices"][0]["message"]["content"]
        if content:
            return content
    except (KeyError, IndexError, TypeError):
        pass
    # Native Gemini
    try:
        parts = result_json["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        if text:
            return text
    except (KeyError, IndexError, TypeError):
        pass
    return None


def _call_provider(url: str, api_key: str, model: str, payload: dict, retries: int = MAX_RETRIES, timeout: int = 90) -> dict:
    """Call a single LLM provider with retry logic."""
    # User-Agent khai báo đúng client thật (không giả lập trình duyệt) để log phía
    # provider/relay truy được nguồn gọi. urllib mặc định gửi "Python-urllib/x.y",
    # một số relay chặn UA đó nên đặt tên ứng dụng tường minh thay vì UA Chrome giả.
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "tezca-china-backend/1.0 (+llm_generator_service)",
    }

    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=timeout) as response:
                result_body = response.read().decode("utf-8")
                result_json = json.loads(result_body)
                content = _extract_content(result_json)
                if content is None:
                    last_error = f"Unexpected response shape: {result_body[:200]}"
                    time.sleep(1)
                    continue
                cleaned = _clean_json_response(content)
                return json.loads(cleaned)
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}"
            # 429 and server errors are normally transient (quota gateways and
            # relays regularly return 502/503 while switching an upstream
            # model).  Client errors are deterministic and should move to the
            # next configured key immediately instead of burning retry time.
            if e.code == 429 or 500 <= e.code < 600:
                time.sleep(2 * (attempt + 1))
                continue
            if hasattr(e, 'read'):
                last_error += f": {e.read().decode('utf-8')[:200]}"
            break
        except urllib.error.URLError as e:
            last_error = str(e)
            time.sleep(1)
            continue
        except json.JSONDecodeError as e:
            last_error = f"JSON parse error: {str(e)}"
            time.sleep(1)
            continue

    raise RuntimeError(f"Provider {model} failed after {retries} retries: {last_error}")


# ── Circuit Breaker cho LLM API calls ────────────────────────────────────────
# Khi provider liên tục fail (quota hết, server down), retry 3 lần × N keys mỗi
# request tốn ~10-30s. Nếu có 5 request đồng thời thì tổng thời gian treo là
# 50-150s — đủ để timeout toàn bộ worker trên Fly free tier. Circuit breaker
# cắt ngắn chu kỳ này: sau THRESHOLD_FAILS lỗi liên tiếp, mở mạch COOLDOWN_SEC
# giây; trong khoảng đó mọi call fail ngay (<1ms) thay vì đốt thêm timeout.
# State nằm trong RAM tiến trình → reset khi restart (an toàn vì restart cũng
# reset connection pool). Không cần Redis vì single-instance trên free tier.
_CB_THRESHOLD_FAILS = 5          # số lỗi liên tiếp trước khi mở mạch
_CB_COOLDOWN_SEC = 60            # thời gian giữ mạch mở (giây)
_cb_state = {"fails": 0, "open_until": 0.0}


class CircuitBreakerOpen(RuntimeError):
    """LLM circuit breaker đang mở — provider được coi là không khả dụng tạm thời."""
    pass


def _cb_record_success() -> None:
    _cb_state["fails"] = 0
    _cb_state["open_until"] = 0.0


def _cb_record_failure() -> None:
    _cb_state["fails"] += 1
    if _cb_state["fails"] >= _CB_THRESHOLD_FAILS:
        _cb_state["open_until"] = time.time() + _CB_COOLDOWN_SEC
        logger.warning(
            "LLM circuit breaker OPENED after %d consecutive failures; "
            "cooldown %ds", _cb_state["fails"], _CB_COOLDOWN_SEC,
        )


def _cb_check() -> None:
    """Raise CircuitBreakerOpen nếu mạch đang mở và chưa hết cooldown."""
    if _cb_state["open_until"] > time.time():
        remaining = int(_cb_state["open_until"] - time.time())
        raise CircuitBreakerOpen(
            f"LLM provider đang bị gián đoạn (circuit breaker mở, còn {remaining}s)"
        )


def _call_api(prompt_text: str, retries: int = MAX_RETRIES, timeout: int = 240) -> dict:
    """Gọi provider LLM (OpenAI-compatible), xoay vòng qua từng key cấu hình.

    Provider do ``settings.llm_provider`` chọn: StepFun khi có STEPFUN_API_KEYS,
    relay vilao khi chỉ có GEMINI_API_KEYS, hoặc bất kỳ endpoint nào khác nếu đặt
    LLM_API_URL/LLM_API_KEYS/LLM_MODEL. URL, key, model và payload đều đọc chung
    một provider nên không thể lệch nhau. Mỗi key là một "lượt" riêng — key cạn
    quota thì thử key tiếp theo. Hết key thì raise RuntimeError kèm lỗi từng key.

    Circuit breaker: sau 5 lỗi liên tiếp, mở mạch 60s — mọi call fail ngay thay
    vì đốt thêm timeout. Xem _cb_check/_cb_record_success/_cb_record_failure.

    Args:
        prompt_text: Nội dung prompt gửi LLM.
        retries: Số lần retry mỗi key trước khi chuyển key tiếp.
        timeout: Timeout mỗi request đến provider (giây). Mặc định 240 cho batch
            generation; caller on-demand (study analysis) nên truyền thấp hơn.
    """
    _cb_check()  # fail nhanh nếu provider đang bị gián đoạn
    keys = settings.llm_keys_list
    if not keys:
        raise RuntimeError(NO_LLM_KEY_MESSAGE)
    url = settings.llm_api_url_effective
    model = settings.llm_model_effective

    payload_template = {
        "messages": [
            {"role": "system", "content": "You are an expert Chinese language teacher who outputs ONLY valid JSON. Never include markdown fences or explanations outside the JSON."},
            {"role": "user", "content": prompt_text}
        ],
        # Relay chạy model reasoning: token bị đốt vào chain-of-thought TRƯỚC khi
        # xuất JSON. Budget thấp (vd 4000) làm finish_reason=length, content rỗng
        # -> parse fail. Giữ mức cao để reasoning xong vẫn còn chỗ cho JSON.
        "max_tokens": settings.llm_max_tokens,
    }
    # response_format chỉ gửi khi provider hỗ trợ. StepFun hỗ trợ nên bật (đo:
    # 10.8s/892 token thay vì 29s/3749); relay vilao không hỗ trợ nên tắt và JSON
    # được ép bằng system prompt + _clean_json_response. Xem llm_json_mode_effective.
    if settings.llm_json_mode_effective:
        payload_template["response_format"] = {"type": "json_object"}
    # Hạ ngân sách reasoning khi provider hỗ trợ: đây là đòn duy nhất có tác dụng
    # với trần gateway ~121s. Cắt kích thước prompt thì không — đo được 5 từ/3 câu
    # vẫn fail ở 122s trong khi 15 từ/6 câu xong ở 110s, tức thời gian đi theo số
    # token model sinh ra chứ không theo prompt.
    # Tên tham số KHÁC NHAU theo provider và gửi sai thì bị bỏ qua im lặng (không
    # báo lỗi, chỉ chậm lại): StepFun nhận dạng phẳng ``reasoning_effort``, relay
    # gilotex nhận dạng lồng ``reasoning.effort``. Cờ llm_reasoning_flat chọn đúng.
    effort = settings.llm_reasoning_effort_effective
    if effort:
        if settings.llm_reasoning_flat:
            payload_template["reasoning_effort"] = effort
        else:
            payload_template["reasoning"] = {"effort": effort}

    errors = []
    for i, api_key in enumerate(keys):
        logger.info("Trying LLM key #%s: %s", i + 1, model)
        payload = {
            **payload_template,
            "model": model,
            # Lệch nhẹ temperature giữa các lượt để lần thử lại không lặp y nguyên
            # output đã fail validate.
            "temperature": 0.7 + (i * 0.05),
        }
        try:
            result = _call_provider(
                url=url,
                api_key=api_key,
                model=model,
                payload=payload,
                retries=retries,
                timeout=timeout,
            )
            _cb_record_success()
            return result
        except Exception as e:
            err_msg = f"LLM key #{i + 1}: {str(e)}"
            errors.append(err_msg)
            logger.warning(err_msg)
            if i < len(keys) - 1:
                time.sleep(0.5)  # nghỉ ngắn trước khi đổi key
            continue

    _cb_record_failure()
    raise RuntimeError(
        f"Đã thử hết {len(keys)} key LLM ({model}). Errors: {' | '.join(errors)}"
    )


def generate_exercises_for_vocab(words: List[str]) -> Dict[str, Any]:
    """Gọi LLM để tạo dữ liệu từ vựng và câu hỏi.

    Có validation, retry, và quality filtering.
    """
    words_str = "\n".join([f"- {w}" for w in words])

    prompt = f"""Bạn là giáo viên tiếng Trung giàu kinh nghiệm. Với MỖI TỪ trong danh sách dưới đây, hãy cung cấp thông tin đầy đủ và tạo 3 câu hỏi bài tập.

Danh sách từ:
{words_str}

CÁC LOẠI BÀI TẬP (chọn 3 loại phù hợp nhất cho mỗi từ, KHÔNG tạo bài nghe):
- vocab: {_VOCAB_SPEC}
- cloze: {_CLOZE_SPEC}
- translation: {_TRANSLATION_SPEC}
- reading: {_READING_SPEC}

OUTPUT PHẢI LÀ MỘT OBJECT JSON (không markdown, không giải thích thêm):

{{
  "words": [
    {{
      "hanzi": "苹果",
      "pinyin": "píng guǒ",
      "meaning_vi": "quả táo",
      "pos": "n",
      "hsk_level": 1,
      "questions": [
        {{
          "quiz_type": "vocab",
          "prompt": "Chọn nghĩa đúng của: 苹果",
          "options": ["quả táo", "quả cam", "quả chuối", "quả nho"],
          "correct_index": 0,
          "explanation": "苹果 (píng guǒ) có nghĩa là quả táo. Ví dụ: 我喜欢吃苹果。"
        }},
        {{
          "quiz_type": "cloze",
          "prompt": "昨天下午我去了超市。我买了三个____，还买了一些（2）。回家以后，我把水果洗干净放进（3）里。",
          "options": ["苹果", "面包", "冰箱", "牛奶"],
          "correct_index": 0,
          "explanation": "Chỗ trống (1) đi sau lượng từ 个 và trước dấu phẩy, cần một loại quả đếm được bằng 个 → 苹果. Đoạn đầy đủ: 我买了三个苹果，还买了一些面包。回家以后，我把水果洗干净放进冰箱里。"
        }},
        {{
          "quiz_type": "reading",
          "prompt": "昨天下午我去超市买了三个苹果和一些面包。回家以后，我把苹果洗干净放进冰箱里，晚上和家人一起吃。\\n\\n根据这段话，下面哪个正确？",
          "options": ["他把苹果放在冰箱里", "他没有买面包", "他在早上去超市", "他一个人吃苹果"],
          "correct_index": 0,
          "explanation": "Câu căn cứ: 我把苹果洗干净放进冰箱里 → đáp án nói anh ấy để táo trong tủ lạnh."
        }}
      ]
    }}
  ]
}}

QUY TẮC BẮT BUỘC:
1. MỖI từ PHẢI có ít nhất 1 câu hỏi, tối đa 3 câu
2. MỖI câu hỏi PHẢI có ĐÚNG 4 options, không trùng lặp
3. correct_index PHẢI là vị trí (0-3) của đáp án ĐÚNG trong options
4. Đáp án ĐÚNG PHẢI nằm trong options (correct_index phải trỏ đến đáp án đó)
5. Cloze PHẢI có ĐÚNG MỘT ____ trong prompt; các chỗ trống khác ghi （2）,（3）…
6. Options cho vocab PHẢI là nghĩa tiếng Việt (KHÔNG dùng chữ Hán)
7. Options cho cloze VÀ reading PHẢI là tiếng Trung (hanzi)
8. Options cho translation PHẢI là tiếng Việt (KHÔNG dùng chữ Hán)
9. Prompt cloze và reading PHẢI là tiếng Trung (đoạn văn, không phải câu rời)
10. KHÔNG dùng các từ trong danh sách làm distractors cho nhau (tránh lặp)
11. Độ dài options tương đương nhau (tránh đáp án quá rõ ràng vì dài/ngắn)
12. Chỉ trả về JSON, không giải thích gì thêm"""

    # Call API with retries
    data = _call_api(prompt)

    if "words" not in data:
        raise RuntimeError("Invalid JSON format from LLM: missing 'words' key")

    # Validate and filter
    valid_words = []
    rejected = 0
    for item in data["words"]:
        ok, reason = _validate_word_entry(item)
        if ok:
            valid_words.append(item)
        else:
            rejected += 1
            logger.warning(f"Rejected word entry: {reason}")

    if not valid_words:
        raise RuntimeError(f"All {len(data['words'])} word entries failed validation. Rejected: {rejected}")

    return {"words": valid_words, "_quality": {"accepted": len(valid_words), "rejected": rejected}}


def _validate_api_quiz_question(item: dict, quiz_type: str) -> Tuple[bool, str]:
    """Validate contract mà frontend Quiz đang render."""
    if quiz_type not in API_QUIZ_TYPES:
        return False, "unsupported quiz_type"
    for field in ("target_hanzi", "prompt", "options", "correct_index", "explanation"):
        if field not in item:
            return False, f"missing {field}"
    options = item.get("options")
    if not isinstance(options, list) or len(options) != 4:
        return False, "options must contain exactly 4 items"
    cleaned = [str(value).strip() for value in options]
    if any(not value for value in cleaned) or len(set(cleaned)) != 4:
        return False, "options must be non-empty and unique"
    if duplicate_after_normalize(cleaned):
        return False, "options must be unique after normalize"
    ci = item.get("correct_index")
    if not isinstance(ci, int) or not 0 <= ci < 4:
        return False, "invalid correct_index"
    if len(str(item.get("prompt", "")).strip()) < 5:
        return False, "prompt too short"
    if len(str(item.get("explanation", "")).strip()) < 5:
        return False, "explanation too short"
    # Giải thích không được trỏ đáp án bằng chữ cái: model viết explanation
    # trước khi ``_shuffle_options`` xáo vị trí, nên chữ cái trỏ sai gần như
    # luôn (61/80 câu trong bank trỏ lệch). Phải dẫn nội dung đáp án.
    letter = _EXPL_LETTER_RE.search(str(item.get("explanation", "")))
    if letter:
        return False, "explanation must cite answer content, not a letter"
    if quiz_type == "cloze":
        prompt_text = str(item["prompt"])
        blanks = len(_BLANK_RUN_RE.findall(prompt_text))
        if blanks == 0:
            return False, "cloze missing ____"
        # Renderer frontend tách prompt bằng split(/_{2,}/) và chỉ điền vào một
        # chỗ, nên nhiều ____ trong cùng prompt sẽ hiện sai. Các chỗ trống khác
        # của đoạn phải ghi （2）,（3）…
        if blanks > 1:
            return False, f"cloze must have exactly one blank, got {blanks}"
        if not _has_cjk(prompt_text):
            return False, "cloze prompt must be Chinese"
        if not _is_passage(prompt_text):
            return False, "cloze prompt must be a multi-sentence passage"
        if not all(_has_cjk(value) for value in cleaned):
            return False, "cloze options must be Chinese"
    if quiz_type == "reading":
        # 阅读理解 dùng câu hỏi và 4 lựa chọn tiếng Trung. Options tiếng Việt là
        # dấu hiệu của dạng cũ (chọn từ khóa/nghĩa) nên bị loại.
        if not _has_cjk(str(item["prompt"])):
            return False, "reading prompt must be Chinese"
        if not _is_passage(str(item["prompt"])):
            return False, "reading prompt must be a multi-sentence passage"
        if not all(_has_cjk(value) for value in cleaned):
            return False, "reading options must be Chinese"
    # Soi ký tự lạ lẫn trong thân chữ Hán, CHỈ ở các trường buộc thuần tiếng
    # Trung. Options của vocab/translation/listening là tiếng Việt nên không soi:
    # gloss hợp lệ ("Đem (cấu trúc 把)") vốn đặt chữ Việt cạnh chữ Hán.
    foreign_fields = []
    if quiz_type in ("reading", "cloze", "translation"):
        foreign_fields.append(("prompt", str(item.get("prompt", ""))))
    if quiz_type in ("reading", "cloze"):
        foreign_fields += [("option", value) for value in cleaned]
    if quiz_type == "listening":
        foreign_fields.append(("audio_text", str(item.get("audio_text", ""))))
    for label, text in foreign_fields:
        if _foreign_in_cjk(text):
            return False, f"{quiz_type} {label} mixes foreign text into Chinese"
    if quiz_type in ("vocab", "translation"):
        # Options phải là tiếng Việt. Cho phép tối đa
        # ``_MAX_CJK_PER_VI_OPTION`` ký tự CJK mỗi option để không loại oan
        # gloss hợp lệ có trích chữ Hán trong ngoặc ("Đem (cấu trúc 把)");
        # nhiều hơn thế là dấu hiệu chèn nguyên cụm Trung chưa dịch.
        # Lý do giữ nguyên văn (không nhúng số ký tự đếm được): caller gộp log
        # theo chuỗi reason, nhúng số đếm sẽ tách một lỗi thành hàng chục nhóm.
        if max(_cjk_count(value) for value in cleaned) > _MAX_CJK_PER_VI_OPTION:
            return False, (
                f"{quiz_type} options must be Vietnamese "
                f"(max {_MAX_CJK_PER_VI_OPTION} CJK chars per option)"
            )
    if quiz_type == "vocab":
        # Lựa chọn là GLOSS: trùng nghĩa với đáp án = hai đáp án cùng đúng. Chỉ
        # áp cho vocab, xem ghi chú ở ``_validate_question``.
        if conflicting_option_indexes(cleaned, ci):
            return False, "vocab options share a meaning with the answer"
        if gloss_reveals_hanzi(cleaned[ci], str(item.get("target_hanzi", ""))):
            return False, "vocab answer reveals the target hanzi"
    if quiz_type == "translation":
        # Prompt là đoạn tiếng Trung cần dịch; thiếu CJK là sai dạng.
        if not _has_cjk(str(item.get("prompt", ""))):
            return False, "translation prompt must contain Chinese"
    if quiz_type == "listening" and len(str(item.get("audio_text", "")).strip()) < 2:
        return False, "listening missing audio_text"
    if quiz_type == "drag_drop":
        metadata = item.get("metadata") or {}
        segments = metadata.get("segments") or []
        correct_order = metadata.get("correct_order") or []
        if len(segments) < 2 or len(correct_order) < 2:
            return False, "drag_drop missing segments/correct_order"
        if sorted(map(str, segments)) != sorted(map(str, correct_order)):
            return False, "drag_drop tokens do not match"
        if list(segments) == list(correct_order):
            return False, "drag_drop is not scrambled"
    return True, "ok"


def _shuffle_options(row: dict) -> dict:
    """Xáo lại vị trí 4 lựa chọn, giữ nguyên đáp án đúng.

    LLM gần như luôn đặt đáp án đúng ở vị trí đầu: đo trên 505 câu đã sinh thì
    77% có ``correct_index=0`` (cloze tới 94%). Người học chỉ cần luôn chọn A là
    đúng phần lớn, nên bank mất giá trị đo lường. Chuẩn hóa ở đây thay vì nhờ
    prompt vì đây là ràng buộc cơ học, kiểm chứng được — không phụ thuộc việc
    model có tuân lời hay không.

    Seed lấy từ nội dung câu nên cùng một câu luôn cho cùng thứ tự (chạy lại
    script không tạo ra hoán vị khác cho câu đã có trong bank).
    """
    options = row.get("options")
    ci = row.get("correct_index")
    if not isinstance(options, list) or len(options) != 4:
        return row
    if not isinstance(ci, int) or not 0 <= ci < 4:
        return row
    answer = options[ci]
    indices = [0, 1, 2, 3]
    rng = random.Random(f"{row.get('prompt', '')}|{'|'.join(map(str, options))}")
    rng.shuffle(indices)
    reordered = [options[i] for i in indices]
    row["options"] = reordered
    row["correct_index"] = reordered.index(answer)
    return row


def _normalize_api_quiz_question(item: dict, quiz_type: str) -> dict:
    """Hoàn thiện các trường cơ học, không thay đổi nội dung do API tạo."""
    row = dict(item)
    # Validator chỉ đòi KHÓA ``target_hanzi`` tồn tại, không đòi có nội dung —
    # và giá trị rỗng vốn hợp lệ: 130/265 câu translation trong bank hiện tại để
    # rỗng kèm word_id=NULL, vì đề của chúng là cả đoạn văn chứ không nhắm vào
    # một từ nào. Thiếu KHÓA lại loại sạch cả lượt: log vừa bắt được một bundle
    # HSK5 mất trắng 5/5 câu translation chỉ vì model không ghi khóa này.
    # Điền rỗng cho mọi dạng: caller tra ``word_by_hanzi`` không thấy thì ghi
    # word_id=NULL, đúng như các row đang có.
    row.setdefault("target_hanzi", "")
    if quiz_type != "drag_drop":
        # Bỏ nhãn A./B./C./D. TRƯỚC khi xáo: nhãn gắn theo vị trí cũ, xáo xong
        # thì không còn cách nào biết nhãn nào từng ứng với option nào.
        if isinstance(row.get("options"), list):
            row["options"] = _strip_option_labels(row["options"])
        # drag_drop dùng options placeholder (frontend không đọc) nên không xáo.
        return _shuffle_options(row)
    # drag_drop kiểm tra thứ tự cả câu, không nhắm vào một từ mục tiêu nào — spec
    # trong prompt bundle cũng chỉ đòi metadata.correct_order.
    metadata = dict(row.get("metadata") or {})
    correct_order = [str(token).strip() for token in metadata.get("correct_order") or [] if str(token).strip()]
    if len(correct_order) >= 2:
        scrambled = list(correct_order)
        rng = random.Random("|".join(correct_order))
        for _ in range(12):
            rng.shuffle(scrambled)
            if scrambled != correct_order:
                break
        metadata["correct_order"] = correct_order
        metadata["segments"] = scrambled
        row["metadata"] = metadata
        # Nhúng token vào prompt, đúng định dạng các câu drag_drop viết tay
        # ("Sắp xếp từ thành câu đúng: A · B · C"). LLM để nguyên câu lệnh chung
        # cho mọi câu, nên 15 dòng HSK3 chỉ có 3 prompt phân biệt: caller dedup
        # theo (level, type, prompt) coi mọi câu mới là trùng -> created=0 vĩnh
        # viễn, bank không bao giờ lấp đủ. Prompt chứa token thì mỗi câu là một
        # khóa riêng, và người học cũng đọc được đề mà không cần metadata.
        row["prompt"] = f"Sắp xếp từ thành câu đúng: {' · '.join(scrambled)}"
        # Frontend Drag-drop không dùng option text, nhưng DB schema yêu cầu 4.
        row["options"] = ["__drag_1__", "__drag_2__", "__drag_3__", "__drag_4__"]
        row["correct_index"] = 0
    return row


def generate_quiz_bundle_for_hsk(
    hsk_level: int,
    distribution: Dict[str, int],
    vocabulary: List[dict],
    avoid_prompts: List[str] | None = None,
) -> Dict[str, Any]:
    """Một API call sinh nhiều loại quiz để giảm latency và chi phí.

    ``avoid_prompts``: các prompt đã có trong bank cho cùng (level, type). Relay
    trả output gần như tất định với cùng input, nên không truyền danh sách này
    thì lượt gọi thứ hai sinh lại y nguyên đoạn của lượt đầu — caller dedup theo
    prompt sẽ bỏ hết và vòng lặp không bao giờ lấp đủ ``count``.
    """
    requested = {
        kind: max(1, min(int(count), 10))
        for kind, count in distribution.items()
        if kind in API_QUIZ_TYPES and int(count) > 0
    }
    if not requested:
        raise ValueError("Empty quiz bundle")
    total = sum(requested.values())
    vocab_json = json.dumps(vocabulary[:50], ensure_ascii=False)
    distribution_json = json.dumps(requested, ensure_ascii=False)
    # Nonce phá tính tất định của relay: cùng prompt → cùng response, nên mỗi
    # lượt cần một chuỗi khác nhau để model chọn ngữ cảnh/đề tài khác.
    nonce = f"{time.time_ns():x}{random.randrange(1 << 32):08x}"
    avoid_block = ""
    if avoid_prompts:
        # Chỉ gửi 12 prompt gần nhất: đủ để model tránh lặp mà không phình token.
        sample = [str(item).strip().replace("\n", " ")[:80] for item in avoid_prompts[-12:]]
        avoid_json = json.dumps(sample, ensure_ascii=False)
        avoid_block = (
            f"\nĐÃ CÓ trong ngân hàng (TUYỆT ĐỐI không lặp lại, phải đổi chủ đề/ngữ "
            f"cảnh/nhân vật): {avoid_json}\n"
        )
    prompt = f"""Bạn là trưởng ban ra đề HSK cho người Việt. Tạo một bundle ĐÚNG {total} câu ở HSK {hsk_level}.

Phân bố bắt buộc theo quiz_type: {distribution_json}
Danh mục từ chuẩn ưu tiên: {vocab_json}
Mã lượt sinh (chỉ để đa dạng hóa, không đưa vào output): {nonce}
{avoid_block}

Quy tắc từng loại:
- vocab: {_VOCAB_SPEC}
- listening: {_LISTENING_SPEC}
- reading: {_READING_SPEC}
- translation: {_TRANSLATION_SPEC}
- cloze: {_CLOZE_SPEC}
- drag_drop: {_DRAG_DROP_SPEC}

Chỉ dùng từ vựng/ngữ pháp phù hợp HSK {hsk_level}. Mỗi câu có đúng 4 lựa chọn duy nhất, correct_index 0..3 và giải thích tiếng Việt rõ ràng. Không markdown.
Mỗi option chỉ chứa nội dung lựa chọn. KHÔNG thêm nhãn "A.", "B)", "C、", "D:" vào đầu option — giao diện tự đánh nhãn theo vị trí.
explanation TUYỆT ĐỐI không được trỏ đáp án bằng chữ cái ("đáp án đúng là B", "phương án C sai"). Backend xáo lại vị trí 4 options sau khi nhận, nên chữ cái sẽ trỏ sai ô. Hãy TRÍCH NGUYÊN VĂN nội dung option khi cần nhắc tới nó.
Văn bản tiếng Trung (prompt, options của reading/cloze, audio_text) phải THUẦN tiếng Trung: không chèn từ tiếng Anh/tiếng Việt/tiếng Hàn/tiếng Nhật vào giữa câu.
Chỉ trả JSON object:
{{"questions":[{{"quiz_type":"vocab","target_hanzi":"词","prompt":"...","options":["lựa chọn 1","lựa chọn 2","lựa chọn 3","lựa chọn 4"],"correct_index":0,"explanation":"...","audio_text":"","metadata":{{"segments":[],"correct_order":[],"sentence_vi":""}}}}]}}
"""
    data = _call_api(prompt)
    rows = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("API bundle response missing questions list")

    accepted: Dict[str, List[dict]] = {kind: [] for kind in requested}
    rejected: List[str] = []
    for row in rows:
        kind = str(row.get("quiz_type", ""))
        if kind not in requested:
            rejected.append(f"unexpected type {kind}")
            continue
        row = _normalize_api_quiz_question(row, kind)
        ok, reason = _validate_api_quiz_question(row, kind)
        if ok and len(accepted[kind]) < requested[kind]:
            accepted[kind].append(row)
        elif not ok:
            rejected.append(f"{kind}: {reason}")

    # Chấp nhận MỘT PHẦN: trả về mọi câu đã qua validate thay vì hủy cả bundle
    # khi thiếu vài câu. Trước đây thiếu 2/5 cloze là mất luôn 5 câu drag_drop
    # đã hợp lệ trong cùng response, và lượt gọi lại phải sinh lại từ đầu.
    # Caller (upgrade_quiz_bank_ai) chạy vòng while theo số còn thiếu nên phần
    # thiếu sẽ được lấp ở lượt sau — miễn là lượt này có tiến triển.
    flat = [row for kind in requested for row in accepted[kind]]
    if not flat:
        raise RuntimeError(
            f"API bundle không có câu nào hợp lệ (yêu cầu {requested}); rejected={rejected[:8]}"
        )
    missing = {
        kind: requested[kind] - len(rows_)
        for kind, rows_ in accepted.items()
        if len(rows_) < requested[kind]
    }
    return {
        "questions": flat,
        "_quality": {
            "accepted": len(flat),
            "rejected": len(rejected),
            "missing": missing,
            "reasons": rejected[:8],
        },
    }


# ---------------------------------------------------------------------------
# Passage-based pedagogical questions
# ---------------------------------------------------------------------------

# Cac dang cau hoi suy luan ngon ngu dua tren mot doan van nguon.
PASSAGE_SUBTYPES = {
    "cloze_translation",      # quiz_type=cloze
    "error_id",               # quiz_type=reading
    "sentence_scramble",      # quiz_type=drag_drop
    "info_extraction",        # quiz_type=reading
    "contextual_translation", # quiz_type=translation
}

# Anh xa subtype -> quiz_type tai su dung (khong them gia tri enum moi).
# Tat ca deu la trac nghiem 4 lua chon, render qua option-grid san co cua LearningSession.
_SUBTYPE_TO_QUIZ_TYPE = {
    "cloze_translation": "cloze",
    "error_id": "reading",
    "sentence_scramble": "reading",
    "info_extraction": "reading",
    "contextual_translation": "translation",
}

# Thu tu mac dinh (giu nguyen hanh vi cu khi khong yeu cau subtype cu the).
_DEFAULT_SUBTYPE_ORDER = [
    "cloze_translation",
    "error_id",
    "sentence_scramble",
    "info_extraction",
    "contextual_translation",
]

# Mô tả từng dạng để chèn vào prompt theo số lượng yêu cầu. Viết có dấu vì LLM
# bắt chước style của chỉ thị: hướng dẫn không dấu kéo theo explanation không dấu.
_PASSAGE_SUBTYPE_INSTRUCTION = {
    "cloze_translation": (
        "lấy 1 câu trong đoạn, đưa ra bản dịch tiếng Việt nhưng để TRỐNG một từ khóa "
        "(dùng đúng ký tự ___). Ghi kèm câu gốc tiếng Trung trước bản dịch để người "
        "học có căn cứ. 4 lựa chọn là các từ/cụm từ tiếng Việt cùng từ loại, cùng "
        "trường nghĩa — chỉ 1 lựa chọn khớp câu gốc."
    ),
    "error_id": (
        "đưa ra bản dịch tiếng Việt gần đúng của 1 câu, chia thành 4 đoạn; đúng MỘT "
        "đoạn có lỗi tinh tế (sai trạng ngữ thời gian, sai đại từ, đảo chủ ngữ/vị ngữ, "
        "sai lượng từ). 4 options là 4 đoạn đó, giữ nguyên thứ tự xuất hiện trong câu. "
        "explanation phải nói rõ đoạn sai sai ở đâu và bản đúng là gì."
    ),
    "sentence_scramble": (
        "lấy bản dịch tiếng Việt của 1 câu làm đề. Đưa ra 4 cách sắp xếp từ/cụm từ "
        "thành câu tiếng Trung; chỉ 1 cách đúng ngữ pháp và khớp nghĩa, 3 cách còn lại "
        "sai trật tự theo lỗi thật (trạng ngữ thời gian đặt sau động từ, bổ ngữ trình "
        "độ sai vị trí, 把 đặt sai chỗ). Cả 4 options dùng CÙNG bộ từ, chỉ khác thứ tự."
    ),
    "info_extraction": (
        "hỏi trực tiếp 1 thông tin có thật trong đoạn văn (thời gian, số lượng, ai làm "
        "gì, ở đâu); 4 options ngắn gọn và cùng kiểu thông tin, 1 đúng. 3 distractor "
        "phải là thông tin CÓ trong đoạn nhưng trả lời sai câu hỏi — không bịa dữ kiện mới."
    ),
    "contextual_translation": (
        "lấy 1 câu ngắn; ghi rõ tình huống/ngữ cảnh trong prompt (nói với ai, mức độ "
        "thân mật). 4 bản dịch tiếng Việt ĐỀU đúng ngữ pháp nhưng chỉ 1 bản tự nhiên "
        "nhất cho tình huống đã nêu; 3 bản còn lại sai sắc thái (quá trang trọng, quá "
        "suồng sã, dịch cứng theo từng chữ). explanation nêu vì sao sắc thái đó phù hợp."
    ),
}


def _resolve_subtypes(requested: List[str] | None) -> List[str]:
    """Loc + sap xep cac subtype hop le theo thu tu mac dinh.

    Bo qua gia tri khong hop le. Neu khong con subtype nao -> dung ca 5.
    """
    if not requested:
        return list(_DEFAULT_SUBTYPE_ORDER)
    req = set(requested)
    resolved = [st for st in _DEFAULT_SUBTYPE_ORDER if st in req]
    return resolved or list(_DEFAULT_SUBTYPE_ORDER)


def _validate_passage_question(q_data: dict) -> Tuple[bool, str]:
    """Validate a single passage question. Returns (is_valid, reason).

    All five subtypes are multiple-choice: exactly 4 unique options + a valid
    correct_index. cloze_translation also needs the blank token '___' in the
    prompt (the frontend splits the cloze prompt on '___').
    """
    for field in ("quiz_type", "question_subtype", "prompt", "explanation"):
        if field not in q_data:
            return False, f"Missing field: {field}"

    subtype = q_data["question_subtype"]
    if subtype not in PASSAGE_SUBTYPES:
        return False, f"Invalid question_subtype: {subtype}"

    # quiz_type must match the mapping for this subtype.
    expected_qt = _SUBTYPE_TO_QUIZ_TYPE[subtype]
    if q_data["quiz_type"] != expected_qt:
        return False, f"quiz_type {q_data['quiz_type']} != expected {expected_qt} for {subtype}"

    prompt = str(q_data.get("prompt", ""))
    if len(prompt) < 5:
        return False, "Prompt too short"

    explanation = str(q_data.get("explanation", ""))
    if len(explanation) < 3:
        return False, "Explanation too short"

    # All subtypes are multiple-choice.
    options = q_data.get("options", [])
    if not isinstance(options, list) or len(options) != 4:
        n = len(options) if isinstance(options, list) else type(options).__name__
        return False, f"Options must be exactly 4, got {n}"
    cleaned = [str(o).strip() for o in options]
    if any(not o for o in cleaned):
        return False, "Empty option found"
    if len(set(cleaned)) < 4:
        return False, f"Duplicate options: {cleaned}"

    ci = q_data.get("correct_index", 0)
    if not isinstance(ci, int) or ci < 0 or ci > 3:
        return False, f"Invalid correct_index: {ci}"

    if subtype == "cloze_translation" and "___" not in prompt:
        return False, "cloze_translation missing ___ blank"

    return True, "ok"


def generate_questions_for_passage(
    text: str,
    hsk_level: int = 1,
    count: int = 5,
    question_subtypes: List[str] | None = None,
) -> Dict[str, Any]:
    """Goi LLM de tao cau hoi suy luan ngon ngu dua tren doan van tieng Trung.

    Tham so:
      - hsk_level: cap do kho (1-6), dieu khien do phuc tap tu vung/ngu phap.
      - count: tong so cau hoi mong muon.
      - question_subtypes: danh sach subtype duoc yeu cau (mac dinh ca 5).
        Phan bo `count` deu nhau giua cac subtype duoc chon.

    Tat ca cau hoi va giai thich bang tieng Viet. Co validation + filtering,
    tai su dung _call_api (provider theo settings.llm_provider).
    """
    subtypes = _resolve_subtypes(question_subtypes)
    count = max(1, min(int(count or 5), 20))

    # Phan bo so luong deu nhau giua cac subtype, phan du chia tu dau danh sach.
    base, extra = divmod(count, len(subtypes))
    distribution = {
        st: base + (1 if i < extra else 0)
        for i, st in enumerate(subtypes)
    }

    spec_lines = []
    n = 0
    for st in subtypes:
        qty = distribution[st]
        if qty <= 0:
            continue
        n += 1
        qt = _SUBTYPE_TO_QUIZ_TYPE[st]
        spec_lines.append(
            f'{n}. question_subtype="{st}" (x{qty}), quiz_type="{qt}": {_PASSAGE_SUBTYPE_INSTRUCTION[st]}'
        )
    spec_block = "\n".join(spec_lines)

    qt_mapping_block = "\n".join(
        f'   - question_subtype="{st}" -> quiz_type="{_SUBTYPE_TO_QUIZ_TYPE[st]}"'
        for st in subtypes
        if distribution[st] > 0
    )

    prompt = f"""Bạn là chuyên gia đánh giá ngôn ngữ và thiết kế bài tập tiếng Trung (Mandarin) cao cấp.

ĐOẠN VĂN NGUỒN (tiếng Trung):
{text}

Hãy tạo ĐÚNG {count} câu hỏi suy luận ngôn ngữ (không phải học thuộc lòng) dựa trên đoạn văn trên.
Từ vựng và ngữ pháp PHẢI phù hợp CẤP ĐỘ HSK {hsk_level}.
TẤT CẢ hướng dẫn, lựa chọn và giải thích PHẢI bằng TIẾNG VIỆT có dấu.

Phân bố các dạng câu hỏi như sau (đúng số lượng và đúng question_subtype):
{spec_block}

OUTPUT PHẢI LÀ MỘT OBJECT JSON (không markdown, không giải thích thêm):

{{
  "quiz_title": "Tiêu đề ngắn gọn cho bài quiz",
  "questions": [
    {{
      "quiz_type": "cloze",
      "question_subtype": "cloze_translation",
      "prompt": "Gốc: 每个星期我都会去健身房五次。 Dịch: \\"Mỗi tuần tôi đều đến ___ năm lần.\\"",
      "options": ["thư viện", "phòng tập thể hình", "nhà ăn", "công viên"],
      "correct_index": 1,
      "explanation": "健身房 (jiànshēnfáng) nghĩa là phòng tập thể hình."
    }}
  ]
}}

QUY TẮC BẮT BUỘC:
1. Tạo ĐÚNG {count} câu hỏi, đúng số lượng mỗi question_subtype như yêu cầu ở trên.
2. TẤT CẢ câu hỏi là trắc nghiệm: ĐÚNG 4 options, không trùng lặp, độ dài tương đương.
3. correct_index là vị trí (0-3) của đáp án ĐÚNG trong options.
4. cloze_translation PHẢI có ___ trong prompt.
5. sentence_scramble: 4 options là 4 cách sắp xếp cả câu; chỉ 1 cách đúng.
6. Mỗi câu PHẢI bám sát nội dung đoạn văn nguồn ở trên (dùng lại câu/thông tin có thật trong đoạn).
7. Mỗi câu hỏi phải nhắm vào MỘT điểm ngôn ngữ khác nhau — không lặp lại cùng một từ khóa
   hay cùng một câu nguồn cho nhiều câu hỏi.
8. quiz_type PHẢI lấy đúng từ bảng ánh xạ sau (KHÔNG dùng tên question_subtype làm quiz_type):
{qt_mapping_block}
9. Chỉ trả về JSON, không giải thích gì thêm."""

    data = _call_api(prompt)

    if "questions" not in data or not isinstance(data["questions"], list):
        raise RuntimeError("Invalid JSON format from LLM: missing 'questions' list")

    allowed = set(subtypes)
    valid: List[dict] = []
    rejected = 0
    for q in data["questions"]:
        if isinstance(q, dict) and isinstance(q.get("options"), list):
            q["options"] = _strip_option_labels(q["options"])
        ok, reason = _validate_passage_question(q)
        if ok and q.get("question_subtype") in allowed:
            valid.append(q)
        else:
            rejected += 1
            logger.warning(f"Rejected passage question: {reason if not ok else 'subtype not requested'}")

    if not valid:
        raise RuntimeError(f"All {len(data['questions'])} passage questions failed validation. Rejected: {rejected}")

    title = data.get("quiz_title") if isinstance(data.get("quiz_title"), str) else None
    return {
        "questions": valid,
        "quiz_title": title,
        "_quality": {"accepted": len(valid), "rejected": rejected},
    }


def generate_passage_for_topic(topic: str, hsk_level: int = 1) -> str:
    """Gọi LLM sinh một đoạn văn tiếng Trung ngắn theo chủ đề + cấp HSK.

    Đoạn văn này sau đó được đưa vào ``generate_questions_for_passage`` để sinh
    câu hỏi (kết hợp cả hai: sinh ngữ liệu theo chủ đề + sinh câu hỏi từ ngữ liệu).
    """
    prompt = f"""Bạn là giáo viên tiếng Trung. Hãy viết MỘT đoạn văn ngắn bằng tiếng Trung (Mandarin)
về chủ đề: "{topic}".

Yêu cầu:
- Từ vựng và ngữ pháp phù hợp CẤP ĐỘ HSK {hsk_level}.
- Độ dài 4-7 câu, mạch lạc, tự nhiên, có thể dùng làm ngữ liệu đọc hiểu.
- Đoạn phải có ít nhất {_MIN_PASSAGE_SENTENCES} dấu kết câu 。！？ và tối thiểu
  {_MIN_PASSAGE_CJK + 1} chữ Hán (đoạn quá ngắn sẽ bị loại tự động).
- Có mốc thời gian/nhân vật/địa điểm cụ thể để câu hỏi đọc hiểu có căn cứ trích dẫn.
- Chỉ dùng chữ Hán (có thể kèm dấu câu). KHÔNG pinyin, KHÔNG bản dịch.

OUTPUT PHẢI LÀ MỘT OBJECT JSON (không markdown):
{{"passage": "nội dung đoạn văn tiếng Trung ở đây"}}"""

    data = _call_api(prompt)
    passage = data.get("passage") if isinstance(data, dict) else None
    if not isinstance(passage, str) or len(passage.strip()) < 4:
        raise RuntimeError("LLM không trả về đoạn văn hợp lệ cho chủ đề.")
    passage = passage.strip()
    # Đoạn này là ngữ liệu cho câu hỏi đọc hiểu: một câu rời sẽ khiến
    # info_extraction/error_id không có gì để trích dẫn. Chặn ngay tại nguồn
    # thay vì để validator loại từng câu ở bước sau.
    if not _is_passage(passage):
        raise RuntimeError(
            "LLM trả về đoạn quá ngắn (cần >= "
            f"{_MIN_PASSAGE_SENTENCES} câu và >= {_MIN_PASSAGE_CJK} chữ Hán): {passage[:60]}"
        )
    return passage
