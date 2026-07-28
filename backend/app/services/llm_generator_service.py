import json
import urllib.request
import urllib.error
import re
import time
import logging
import random
from typing import List, Dict, Any, Tuple
from ..settings import settings

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


# Một "chỗ trống" là chuỗi 2+ dấu gạch dưới — khớp với split(/_{2,}/) của
# renderer frontend, nên đếm ở đây phản ánh đúng số ô người học nhìn thấy.
_BLANK_RUN_RE = re.compile(r"_{2,}")

# CJK Unified Ideographs: basic + extension A + compatibility (đồng bộ với
# ``question_generator._CJK_RANGE``).
_CJK_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def _has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(str(text or "")))


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


def _clean_json_response(content: str) -> str:
    """Loai bo markdown formatting neu DeepSeek tra ve ```json ... ```"""
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()


def _validate_question(q_data: dict, word_hanzi: str) -> Tuple[bool, str]:
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
    # OpenAI-compatible shape (relay vilao.ai trả về dạng này)
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
            if e.code == 429:
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


def _call_api(prompt_text: str, retries: int = MAX_RETRIES) -> dict:
    """Gọi relay LLM (OpenAI-compatible), xoay vòng qua từng key cấu hình.

    URL/model/key lấy từ ``settings.llm_*_effective`` nên đổi provider chỉ cần
    đổi biến môi trường ``LLM_API_URL`` / ``LLM_API_KEYS`` / ``LLM_MODEL``, không
    phải sửa code. Mỗi key là một "lượt" riêng — key cạn quota thì thử key tiếp
    theo. Hết key thì raise RuntimeError kèm lỗi của từng key.
    """
    keys = settings.llm_keys_list
    if not keys:
        raise RuntimeError(
            "Chưa cấu hình LLM_API_KEYS (hoặc GEMINI_API_KEYS) — không có provider LLM nào khả dụng."
        )
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
    # response_format chỉ gửi khi relay hỗ trợ (LLM_JSON_MODE=true). Relay vilao
    # không hỗ trợ nên mặc định tắt và JSON được ép bằng system prompt +
    # _clean_json_response.
    if settings.llm_json_mode:
        payload_template["response_format"] = {"type": "json_object"}
    # Hạ ngân sách reasoning khi provider hỗ trợ: đây là đòn duy nhất có tác dụng
    # với trần gateway ~121s. Cắt kích thước prompt thì không — đo được 5 từ/3 câu
    # vẫn fail ở 122s trong khi 15 từ/6 câu xong ở 110s, tức thời gian đi theo số
    # token model sinh ra chứ không theo prompt. Dùng dạng lồng ``reasoning.effort``
    # (dạng phẳng ``reasoning_effort`` chỉ hạ 103s -> 28s, dạng lồng xuống 13s).
    effort = settings.llm_reasoning_effort.strip()
    if effort:
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
            return _call_provider(
                url=url,
                api_key=api_key,
                model=model,
                payload=payload,
                retries=retries,
                timeout=240,
            )
        except Exception as e:
            err_msg = f"LLM key #{i + 1}: {str(e)}"
            errors.append(err_msg)
            logger.warning(err_msg)
            if i < len(keys) - 1:
                time.sleep(0.5)  # nghỉ ngắn trước khi đổi key
            continue

    raise RuntimeError(
        f"Đã thử hết {len(keys)} key LLM ({model}). Errors: {' | '.join(errors)}"
    )


def generate_exercises_for_vocab(words: List[str]) -> Dict[str, Any]:
    """
    Goi LLM de tao du lieu tu vung va cau hoi.
    Co validation, retry, va quality filtering.
    """
    words_str = "\n".join([f"- {w}" for w in words])

    prompt = f"""Ban la mot giao vien tieng Trung giau kinh nghiem. Voi MOI TU trong danh sach duoi day, hay cung cap thong tin day du va tao 3 cau hoi bai tap.

Danh sach tu:
{words_str}

CAC LOAI BAI TAP (chon 3 loai phu hop nhat cho moi tu, KHONG tao bai nghe):
- vocab: chon nghia tieng Viet cua tu
- cloze: {_CLOZE_SPEC}
- translation: dich cau Trung-Viet
- reading: {_READING_SPEC}

OUPUT PHAI LA MOT OBJECT JSON (khong markdown, khong giai thich them):

{{
  "words": [
    {{
      "hanzi": "苹果",
      "pinyin": "pingguo",
      "meaning_vi": "qua tao",
      "pos": "n",
      "hsk_level": 1,
      "questions": [
        {{
          "quiz_type": "vocab",
          "prompt": "Chon nghia dung cua: 苹果",
          "options": ["Qua tao", "Qua cam", "Qua chuoi", "Qua nho"],
          "correct_index": 0,
          "explanation": "苹果 (pingguo) co nghia la qua tao"
        }},
        {{
          "quiz_type": "cloze",
          "prompt": "昨天下午我去了超市。我买了三个____，还买了一些（2）。回家以后，我把水果洗干净放进（3）里。",
          "options": ["苹果", "面包", "冰箱", "牛奶"],
          "correct_index": 0,
          "explanation": "Cho trong (1) di sau luong tu 个 va truoc dau phay, can mot loai qua dem duoc bang 个 → 苹果. Doan day du: 我买了三个苹果，还买了一些面包。回家以后，我把水果洗干净放进冰箱里。"
        }},
        {{
          "quiz_type": "reading",
          "prompt": "昨天下午我去超市买了三个苹果和一些面包。回家以后，我把苹果洗干净放进冰箱里，晚上和家人一起吃。\\n\\n根据这段话，下面哪个正确？",
          "options": ["他把苹果放在冰箱里", "他没有买面包", "他在早上去超市", "他一个人吃苹果"],
          "correct_index": 0,
          "explanation": "Cau can cu: 我把苹果洗干净放进冰箱里 → dap an noi anh ay de tao trong tu lanh."
        }}
      ]
    }}
  ]
}}

QUY TAC BAT BUOC:
1. MOI tu PHAI co it nhat 1 cau hoi, toi da 3 cau
2. MOI cau hoi PHAI co DUNG 4 options, khong trung lap
3. correct_index PHAI la vi tri (0-3) cua dap an DUNG trong options
4. Dap an DUNG PHAI nam trong options (correct_index phai tro den dap an do)
5. Cloze PHAI co DUNG MOT ____ trong prompt; cac cho trong khac ghi （2）,（3）…
6. Options cho vocab PHAI la nghia tieng Viet
7. Options cho cloze VA reading PHAI la tieng Trung (hanzi)
8. Prompt cloze va reading PHAI la tieng Trung (doan van, khong phai cau roi)
9. KHONG dung cac tu trong danh sach lam distractors cho nhau (tranh lap)
10. Do dai options tuong duong nhau (tranh dap an qua ro rang vi dai/ngan)
11. Chi tra ve JSON, khong giai thich gi them"""

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
    ci = item.get("correct_index")
    if not isinstance(ci, int) or not 0 <= ci < 4:
        return False, "invalid correct_index"
    if len(str(item.get("prompt", "")).strip()) < 5:
        return False, "prompt too short"
    if len(str(item.get("explanation", "")).strip()) < 5:
        return False, "explanation too short"
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
    if quiz_type != "drag_drop":
        # drag_drop dùng options placeholder (frontend không đọc) nên không xáo.
        return _shuffle_options(row)
    # drag_drop kiểm tra thứ tự cả câu, không nhắm vào một từ mục tiêu nào — spec
    # trong prompt bundle cũng chỉ đòi metadata.correct_order. Nhưng validator
    # bắt buộc khóa ``target_hanzi`` tồn tại, nên thiếu nó là loại sạch cả lượt
    # (HSK3 drag_drop đã bị bỏ qua vì lỗi này). Điền rỗng: caller tra
    # ``word_by_hanzi`` không thấy thì ghi word_id=NULL, vốn hợp lệ với cột này.
    row.setdefault("target_hanzi", "")
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
- vocab: hỏi nghĩa; 4 options tiếng Việt.
- listening: prompt không lộ transcript; audio_text là câu Trung; 4 options nghĩa tiếng Việt.
- reading: {_READING_SPEC}
- translation: câu/đoạn Trung; 4 bản dịch Việt, chỉ một bản tự nhiên và đúng.
- cloze: {_CLOZE_SPEC}
- drag_drop: chỉ cần tạo metadata.correct_order là các từ/cụm từ theo thứ tự đúng (2-8 token). Backend sẽ tự xáo trộn thành segments và tạo placeholder; không cần tự xáo trộn.

Chỉ dùng từ vựng/ngữ pháp phù hợp HSK {hsk_level}. Mỗi câu có đúng 4 lựa chọn duy nhất, correct_index 0..3 và giải thích tiếng Việt rõ ràng. Không markdown.
Chỉ trả JSON object:
{{"questions":[{{"quiz_type":"vocab","target_hanzi":"词","prompt":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"...","audio_text":"","metadata":{{"segments":[],"correct_order":[],"sentence_vi":""}}}}]}}
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

# Mo ta tung dang de chen vao prompt theo so luong yeu cau.
_PASSAGE_SUBTYPE_INSTRUCTION = {
    "cloze_translation": "lay 1 cau trong doan, dua ra ban dich tieng Viet nhung de TRONG mot tu khoa (dung ky tu ___). 4 lua chon la cac tu/cum tu tieng Viet ung vien.",
    "error_id": "dua ra ban dich tieng Viet gan dung cua 1 cau, chia thanh 4 doan; mot doan co loi tinh te (sai trang ngu thoi gian, sai dai tu, dao chu ngu/vi ngu...). 4 options la 4 doan do.",
    "sentence_scramble": "lay ban dich tieng Viet cua 1 cau. Dua ra 4 cach sap xep tu/cum tu thanh cau; chi 1 cach dung ngu phap va khop nghia, 3 cach con lai bi dao trat tu sai.",
    "info_extraction": "hoi truc tiep 1 thong tin trich tu doan van; 4 options ngan gon, 1 dung.",
    "contextual_translation": "lay 1 cau ngan; 4 ban dich tieng Viet DEU dung ngu phap nhung chi 1 ban tu nhien nhat cho tinh huong da neu (ghi tinh huong trong prompt).",
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
    tai su dung _call_api (relay vilao.ai).
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

    prompt = f"""Ban la chuyen gia danh gia ngon ngu va thiet ke bai tap tieng Trung (Mandarin) cao cap.

DOAN VAN NGUON (tieng Trung):
{text}

Hay tao DUNG {count} cau hoi suy luan ngon ngu (khong phai hoc thuoc long) dua tren doan van tren.
Tu vung va ngu phap PHAI phu hop CAP DO HSK {hsk_level}.
TAT CA huong dan, lua chon va giai thich PHAI bang TIENG VIET.

Phan bo cac dang cau hoi nhu sau (dung dung so luong va dung question_subtype):
{spec_block}

OUTPUT PHAI LA MOT OBJECT JSON (khong markdown, khong giai thich them):

{{
  "quiz_title": "Tieu de ngan goi cho bai quiz",
  "questions": [
    {{
      "quiz_type": "cloze",
      "question_subtype": "cloze_translation",
      "prompt": "Goc: 每个星期我都会去健身房五次。 Dich: \\"Moi tuan toi deu den ___ nam lan.\\"",
      "options": ["thu vien", "phong tap the hinh", "nha an", "cong vien"],
      "correct_index": 1,
      "explanation": "健身房 (jianshenfang) nghia la phong tap the hinh."
    }}
  ]
}}

QUY TAC BAT BUOC:
1. Tao DUNG {count} cau hoi, dung so luong moi question_subtype nhu yeu cau o tren.
2. TAT CA cau hoi la trac nghiem: DUNG 4 options, khong trung lap, do dai tuong duong.
3. correct_index la vi tri (0-3) cua dap an DUNG trong options.
4. cloze_translation PHAI co ___ trong prompt.
5. sentence_scramble: 4 options la 4 cach sap xep ca cau; chi 1 cach dung.
6. Moi cau PHAI bam sat noi dung doan van nguon o tren (dung lai cau/thong tin co that trong doan).
7. quiz_type PHAI lay dung tu bang anh xa sau (KHONG dung ten question_subtype lam quiz_type):
{qt_mapping_block}
8. Chi tra ve JSON, khong giai thich gi them."""

    data = _call_api(prompt)

    if "questions" not in data or not isinstance(data["questions"], list):
        raise RuntimeError("Invalid JSON format from LLM: missing 'questions' list")

    allowed = set(subtypes)
    valid: List[dict] = []
    rejected = 0
    for q in data["questions"]:
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
    """Goi LLM sinh mot doan van tieng Trung ngan theo chu de + cap HSK.

    Doan van nay sau do duoc dua vao generate_questions_for_passage de sinh
    cau hoi (ket hop ca hai: sinh ngu lieu theo chu de + sinh cau hoi tu ngu lieu).
    """
    prompt = f"""Ban la giao vien tieng Trung. Hay viet MOT doan van ngan bang tieng Trung (Mandarin)
ve chu de: "{topic}".

Yeu cau:
- Tu vung va ngu phap phu hop CAP DO HSK {hsk_level}.
- Do dai 4-7 cau, mach lac, tu nhien, co the dung lam ngu lieu doc hieu.
- Chi dung chu Han (co the kem dau cau). KHONG pinyin, KHONG ban dich.

OUTPUT PHAI LA MOT OBJECT JSON (khong markdown):
{{"passage": "noi dung doan van tieng Trung o day"}}"""

    data = _call_api(prompt)
    passage = data.get("passage") if isinstance(data, dict) else None
    if not isinstance(passage, str) or len(passage.strip()) < 4:
        raise RuntimeError("LLM khong tra ve doan van hop le cho chu de.")
    return passage.strip()
