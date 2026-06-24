import json
import urllib.request
import urllib.error
import re
import time
from typing import List, Dict, Any, Tuple
from ..settings import settings

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


def _call_api(prompt_text: str, retries: int = MAX_RETRIES) -> dict:
    """Call DeepSeek API with retry logic."""
    if not settings.deepseek_api_key:
        raise ValueError("Missing deepseek_api_key in settings")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.deepseek_api_key}"
    }

    last_error = None
    for attempt in range(retries):
        # Slightly vary temperature on retries for diversity
        temperature = 0.7 + (attempt * 0.1)

        data = {
            "model": "deepseek-v4-pro",
            "messages": [
                {"role": "system", "content": "You are an expert Chinese language teacher who outputs ONLY valid JSON. Never include markdown fences or explanations outside the JSON."},
                {"role": "user", "content": prompt_text}
            ],
            "temperature": temperature,
            "max_tokens": 4000,
            "response_format": {"type": "json_object"}
        }

        req = urllib.request.Request(
            DEEPSEEK_API_URL,
            data=json.dumps(data).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                result_body = response.read().decode("utf-8")
                result_json = json.loads(result_body)
                content = result_json["choices"][0]["message"]["content"]
                cleaned = _clean_json_response(content)
                parsed = json.loads(cleaned)
                return parsed
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}"
            if e.code == 429:
                time.sleep(2 * (attempt + 1))  # exponential backoff
                continue
            if hasattr(e, 'read'):
                last_error += f": {e.read().decode('utf-8')[:200]}"
            break
        except urllib.error.URLError as e:
            last_error = str(e)
            if hasattr(e, 'read'):
                last_error += f": {e.read().decode('utf-8')[:200]}"
            time.sleep(1)
            continue
        except json.JSONDecodeError as e:
            last_error = f"JSON parse error: {str(e)}"
            time.sleep(1)
            continue

    raise RuntimeError(f"DeepSeek API Error after {retries} retries: {last_error}")


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
            import logging
            logging.getLogger(__name__).warning(f"Rejected word entry: {reason}")

    if not valid_words:
        raise RuntimeError(f"All {len(data['words'])} word entries failed validation. Rejected: {rejected}")

    return {"words": valid_words, "_quality": {"accepted": len(valid_words), "rejected": rejected}}
