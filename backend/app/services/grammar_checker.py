"""
Grammar Checker — validates Chinese sentences using the vilao.ai LLM relay.

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
import time
from pathlib import Path
from typing import TypedDict

from .llm_generator_service import _call_api
from ..settings import settings


class GrammarResult(TypedDict):
    grammar_ok: bool
    translation_ok: str  # 'yes' | 'partial' | 'no'
    word_usage_natural: bool
    grammar_issues: list[str]
    confidence: float


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
    if not settings.llm_keys_list:
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

    try:
        # _call_api lo sẵn xoay vòng key vilao.ai, retry và bóc markdown fence.
        parsed = _call_api(prompt)
        if not isinstance(parsed, dict):
            return None

        if use_cache:
            _CACHE[key] = parsed  # type: ignore[assignment]
            _save_cache()

        return parsed  # type: ignore[return-value]
    except Exception:
        # Giữ contract cũ: mọi lỗi (hết key, timeout, JSON méo) trả None để
        # caller coi như "api_unavailable" thay vì làm vỡ cả batch.
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
