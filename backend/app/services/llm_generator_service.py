import json
import urllib.request
import urllib.error
import re
import time
import logging
from typing import List, Dict, Any, Tuple
from ..settings import settings

logger = logging.getLogger(__name__)

DEEPSEEK_API_URL = "https://api.ai-box.vn/v1/chat/completions"
MAX_RETRIES = 3


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
    valid_types = {"vocab", "cloze", "translation", "listening", "reading"}
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
    if q_data["quiz_type"] == "cloze" and "____" not in prompt:
        return False, "Cloze question missing ____"

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

    valid_count = 0
    for q in questions:
        ok, _ = _validate_question(q, item["hanzi"])
        if ok:
            valid_count += 1

    if valid_count == 0:
        return False, "No valid questions after validation"

    # Update questions list to only valid ones
    item["questions"] = [q for q in questions if _validate_question(q, item["hanzi"])[0]]
    return True, f"{len(item['questions'])} valid questions"


def _extract_content(result_json: dict):
    """Pull text content from an LLM response, tolerating both OpenAI-style
    ({choices:[{message:{content}}]}) and native Gemini-style
    ({candidates:[{content:{parts:[{text}]}}]}) response shapes. Returns the
    string, or None if neither shape is present."""
    # OpenAI / DeepSeek / OpenAI-compatible proxies
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
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
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
    """Call LLM API with primary (DeepSeek) first, fallback to Gemini keys."""

    providers = [
        # Primary
        {
            "url": DEEPSEEK_API_URL,
            "key": settings.deepseek_api_key,
            "model": "deepseek-v4-flash",
            "json_mode": True,
        }
    ]

    # Fallback Gemini keys
    for gemini_key in settings.gemini_keys_list:
        providers.append({
            "url": settings.gemini_api_url,
            "key": gemini_key,
            "model": settings.gemini_model,
            "json_mode": False,
        })

    payload_template = {
        "messages": [
            {"role": "system", "content": "You are an expert Chinese language teacher who outputs ONLY valid JSON. Never include markdown fences or explanations outside the JSON."},
            {"role": "user", "content": prompt_text}
        ],
        # deepseek-v4-pro là reasoning model: nó đốt token vào chain-of-thought
        # (reasoning_content) TRƯỚC khi xuất JSON vào content. Với 4000, reasoning
        # ăn sạch budget -> finish_reason=length, content rỗng -> parse fail.
        # 8000 để reasoning xong vẫn còn chỗ cho JSON.
        "max_tokens": 8000,
    }

    errors = []
    for i, provider in enumerate(providers):
        if not provider["key"]:
            errors.append(f"Provider {i} ({provider['model']}): no API key configured")
            continue

        label = "primary" if i == 0 else f"fallback-{i}"
        logger.info(f"Trying {label}: {provider['model']}")

        payload = {**payload_template, "model": provider["model"]}
        # Only request strict JSON mode where the provider supports it
        if provider.get("json_mode"):
            payload["response_format"] = {"type": "json_object"}
        # Slightly vary temperature for diversity
        payload["temperature"] = 0.7 + (i * 0.05)

        try:
            return _call_provider(
                url=provider["url"],
                api_key=provider["key"],
                model=provider["model"],
                payload=payload,
                retries=min(retries, 2) if i > 0 else retries,  # fewer retries for fallback
                timeout=90,
            )
        except Exception as e:
            err_msg = f"Provider {provider['model']}: {str(e)}"
            errors.append(err_msg)
            logger.warning(err_msg)
            if i < len(providers) - 1:
                time.sleep(0.5)  # brief pause before next provider
            continue

    raise RuntimeError(
        f"All {len(providers)} providers exhausted. Errors: {' | '.join(errors)}"
    )


def generate_exercises_for_vocab(words: List[str]) -> Dict[str, Any]:
    """
    Goi DeepSeek API de tao du lieu tu vung va cau hoi.
    Co validation, retry, va quality filtering.
    """
    words_str = "\n".join([f"- {w}" for w in words])

    prompt = f"""Ban la mot giao vien tieng Trung giau kinh nghiem. Voi MOI TU trong danh sach duoi day, hay cung cap thong tin day du va tao 3 cau hoi bai tap.

Danh sach tu:
{words_str}

CAC LOAI BAI TAP (chon 3 loai phu hop nhat cho moi tu):
- vocab: chon nghia tieng Viet cua tu
- cloze: dien tu vao cho trong trong cau
- translation: dich cau Trung-Viet
- listening: nghe cau va chon nghia
- reading: doc cau va chon tu khoa chinh

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
          "prompt": "Dien tu con thieu: 我买了三个____。",
          "options": ["苹果", "香蕉", "橘子", "西瓜"],
          "correct_index": 0,
          "explanation": "Cau hoan chinh: 我买了三个苹果。 - Toi da mua ba qua tao"
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
5. Cloze PHAI co ____ trong prompt
6. Options cho vocab PHAI la nghia tieng Viet
7. Options cho cloze PHAI la tu tieng Trung (hanzi)
8. KHONG dung cac tu trong danh sach lam distractors cho nhau (tranh lap)
9. Do dai options tuong duong nhau (tranh dap an qua ro rang vi dai/ngan)
10. Chi tra ve JSON, khong giai thich gi them"""

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
    tai su dung _call_api (DeepSeek + fallback Gemini).
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
