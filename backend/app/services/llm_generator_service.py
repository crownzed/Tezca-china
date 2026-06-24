import json
import urllib.request
import urllib.error
import re
from typing import List, Dict, Any
from ..settings import settings

DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

def _clean_json_response(content: str) -> str:
    """Loại bỏ markdown formatting nếu DeepSeek trả về ```json ... ```"""
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()

def generate_exercises_for_vocab(words: List[str]) -> Dict[str, Any]:
    """
    Gọi DeepSeek API để tạo dữ liệu từ vựng và câu hỏi.
    words: danh sách từ do user nhập (VD: ["苹果", "香蕉"])
    """
    if not settings.deepseek_api_key:
        raise ValueError("Missing deepseek_api_key in settings")

    words_str = "\n".join([f"- {w}" for w in words])

    prompt = f"""
Bạn là một giáo viên tiếng Trung giàu kinh nghiệm. Tôi có một danh sách từ vựng tiếng Trung sau đây:
{words_str}

Nhiệm vụ của bạn là với MỖI TỪ trong danh sách trên, hãy cung cấp thông tin từ vựng và tạo ra 3 câu hỏi bài tập khác nhau.
Các loại bài tập (quiz_type) được hỗ trợ: "vocab" (chọn nghĩa tiếng Việt), "cloze" (điền từ vào chỗ trống), "translation" (dịch câu Trung-Việt), "listening" (nghe câu và chọn nghĩa), "reading" (chọn từ khóa). Hãy chọn 3 loại bài tập phù hợp nhất cho mỗi từ.

Yêu cầu định dạng đầu ra PHẢI LÀ MỘT OBJECT JSON HỢP LỆ như sau:
{{
  "words": [
    {{
      "hanzi": "Từ tiếng Trung",
      "pinyin": "Pinyin của từ",
      "meaning_vi": "Nghĩa tiếng Việt",
      "pos": "Từ loại (vd: n, v, adj)",
      "hsk_level": 1,
      "questions": [
        {{
          "quiz_type": "vocab",
          "prompt": "Chọn nghĩa đúng của: [Từ]",
          "options": ["Nghĩa đúng", "Nghĩa sai 1", "Nghĩa sai 2", "Nghĩa sai 3"],
          "correct_index": 0,
          "explanation": "[Từ] · [Pinyin] · [Nghĩa đúng]"
        }},
        {{
          "quiz_type": "cloze",
          "prompt": "Câu tiếng Trung có chứa chỗ trống ____.",
          "options": ["Từ đúng", "Từ sai 1", "Từ sai 2", "Từ sai 3"],
          "correct_index": 0,
          "explanation": "Câu hoàn chỉnh · Dịch nghĩa tiếng Việt"
        }}
      ]
    }}
  ]
}}

LƯU Ý QUAN TRỌNG:
1. Mảng "options" luôn phải có CHÍNH XÁC 4 lựa chọn.
2. "correct_index" là vị trí (0-3) của đáp án đúng trong mảng options. Bạn nên xáo trộn vị trí đáp án đúng để không phải lúc nào cũng là 0.
3. Chỉ trả về JSON, không thêm bất kỳ văn bản giải thích nào.
"""

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.deepseek_api_key}"
    }

    data = {
        "model": "deepseek-v4-pro",
        "messages": [
            {"role": "system", "content": "You are a helpful Chinese teaching assistant that outputs pure JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }

    req = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            result_body = response.read().decode("utf-8")
            result_json = json.loads(result_body)
            content = result_json["choices"][0]["message"]["content"]
            cleaned = _clean_json_response(content)
            return json.loads(cleaned)
    except urllib.error.URLError as e:
        error_msg = str(e)
        if hasattr(e, 'read'):
            error_msg += f": {e.read().decode('utf-8')}"
        raise RuntimeError(f"DeepSeek API Error: {error_msg}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON from DeepSeek: {str(e)}")
