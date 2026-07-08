"""
Grammar Checker — validates Chinese sentences using DeepSeek API.

Features:
  - Grammar correctness check
  - Target word usage validation
  - Vietnamese translation quality assessment
  - Batch mode with rate limiting
  - Result caching to reduce API cost
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import TypedDict


class GrammarResult(TypedDict):
    grammar_ok: bool
    translation_ok: str  # 'yes' | 'partial' | 'no'
    word_usage_natural: bool
    grammar_issues: list[str]
    confidence: float


DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE = "https://api.ai-box.vn/v1/chat/completions"

_CACHE: dict[str, GrammarResult] = {}
_CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "grammar_cache.json"


def _load_cache() -> dict[str, GrammarResult]:
    global _CACHE
    if _CACHE:
        return _CACHE
    if _CACHE_PATH.exists():
        try:
            _CACHE = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            _CACHE = {}
    return _CACHE


def _save_cache() -> None:
    _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CACHE_PATH.write_text(json.dumps(_CACHE, ensure_ascii=False, indent=2), encoding="utf-8")


def _cache_key(sentence_cn: str) -> str:
    # Hash TOÀN câu thay vì cắt [:120] — hai câu khác nhau chung 120 ký tự đầu
    # trước đây trả cùng verdict cache (câu dài dễ đụng). sha1 đủ để tránh đụng
    # mà key vẫn ngắn/ổn định.
    return hashlib.sha1(sentence_cn.strip().encode("utf-8")).hexdigest()


def check_sentence(
    sentence_cn: str,
    sentence_vi: str = "",
    target_word: str = "",
    use_cache: bool = True,
) -> GrammarResult | None:
    """Check a single Chinese sentence for grammar issues.

    Returns None if API is unavailable or rate limited.
    Results are cached by sentence content.
    """
    if not DEEPSEEK_API_KEY:
        return None

    key = _cache_key(sentence_cn)
    if use_cache:
        _load_cache()
        if key in _CACHE:
            return _CACHE[key]

    prompt = f"""Check this Chinese sentence for grammar errors. Target word: "{target_word}".

Chinese: {sentence_cn}
Vietnamese: {sentence_vi}

Reply in JSON only (no markdown):
{{"grammar_ok": true/false, "translation_ok": "yes"/"partial"/"no", "word_usage_natural": true/false, "grammar_issues": [], "confidence": 0.0-1.0}}"""

    payload = json.dumps({
        "model": "deepseek-v4-flash",
        "messages": [
            {"role": "system", "content": "You are a Chinese grammar validator. Reply ONLY in JSON, no explanation."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 200,
        "temperature": 0.1,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            DEEPSEEK_BASE,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:])
                if content.endswith("```"):
                    content = content[:-3]

            parsed: GrammarResult = json.loads(content)

            if use_cache:
                _CACHE[key] = parsed
                _save_cache()

            return parsed

    except urllib.error.HTTPError as e:
        if e.code == 429:
            time.sleep(2)
        return None
    except Exception:
        return None


def check_sentences_batch(
    sentences: list[dict],
    delay: float = 0.2,
) -> list[dict]:
    """Check multiple sentences with rate limiting.

    Args:
        sentences: list of {sentence_cn, sentence_vi, target_word}
        delay: seconds between API calls

    Returns:
        list of {sentence_cn, result, error}
    """
    results = []
    for i, item in enumerate(sentences):
        result = check_sentence(
            item.get("sentence_cn", ""),
            item.get("sentence_vi", ""),
            item.get("target_word", ""),
        )
        results.append({
            "sentence_cn": item.get("sentence_cn", ""),
            "result": result,
            "error": None if result else "api_unavailable",
        })
        if i < len(sentences) - 1:
            time.sleep(delay)
    return results
