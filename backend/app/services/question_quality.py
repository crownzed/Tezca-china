"""Offline item contracts, audit fingerprints and serving policy.

QA metadata is not evidence unless it matches the current content and rubric.
No provider imports here: serving must never initialize an LLM client.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import re
from typing import Any

from ..models import QuizType
from .ordering_contract import OrderingError, normalize_ordering

AUDIT_VERSION = "qa-v2"
RUBRIC_VERSION = "hsk-vi-2026-09-v2"
AGENT_VERSIONS = {role: "v2" for role in ("verifier", "critic", "examiner", "fixer", "validator")}
QA_STALE_DAYS = 30
CONTENT_FIELDS = ("word_id", "level", "quiz_type", "prompt", "options", "correct_index", "explanation", "audio_text", "metadata_json")
SUPPORTED_TYPES = frozenset({"vocab", "listening", "cloze", "translation", "reading", "dialogue", "drag_drop"})


def _validate_json(value: Any, depth: int = 0) -> None:
    """Reject coercible/non-finite values instead of hashing a lossy substitute."""
    if depth > 80:
        raise ValueError("JSON nesting too deep")
    if value is None or type(value) in (str, bool, int):
        return
    if type(value) is float and math.isfinite(value):
        return
    if isinstance(value, list):
        for child in value:
            _validate_json(child, depth + 1)
        return
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        for child in value.values():
            _validate_json(child, depth + 1)
        return
    raise ValueError("Invalid JSON value")


def content_metadata(metadata: Any) -> dict:
    if not isinstance(metadata, dict):
        raise ValueError("metadata_json must be an object")
    _validate_json(metadata)
    return deepcopy({k: v for k, v in metadata.items() if not k.startswith("qa_")})


def question_content(question: Any) -> dict:
    def value(name):
        return question.get(name) if isinstance(question, dict) else getattr(question, name, None)
    item = {name: deepcopy(value(name)) for name in CONTENT_FIELDS}
    if isinstance(item["quiz_type"], QuizType):
        item["quiz_type"] = item["quiz_type"].value
    item["metadata_json"] = content_metadata(item["metadata_json"])
    _validate_json(item)
    return item


def content_fingerprint(question: Any) -> str:
    data = json.dumps(question_content(question), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def question_word_context(question: Any) -> dict | None:
    """Use only eagerly loaded context; a serving predicate must not issue SQL."""
    values = question if isinstance(question, dict) else vars(question)
    if values.get("word_id") is None:
        return None
    if "word" not in values or values["word"] is None:
        raise ValueError("Word context unavailable")
    word = values["word"]
    fields = word if isinstance(word, dict) else vars(word)
    if "examples" not in fields:
        raise ValueError("Examples not loaded")
    examples = []
    for example in fields["examples"]:
        row = example if isinstance(example, dict) else vars(example)
        if row.get("sentence_cn"):
            examples.append({"cn": row["sentence_cn"], "vi": row.get("sentence_vi")})
    # Stable selection: relationship row order is not guaranteed by SQL.
    examples.sort(key=lambda e: (e["cn"], e["vi"] or ""))
    return {**{key: fields[key] for key in ("hanzi", "pinyin", "meaning_vi", "pos", "hsk_level")},
            "examples": examples[:3]}


def context_fingerprint(word_info: dict | None) -> str:
    _validate_json(word_info)
    data = json.dumps(word_info, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _metadata(question: Any) -> dict:
    meta = question.get("metadata_json") if isinstance(question, dict) else getattr(question, "metadata_json", None)
    if not isinstance(meta, dict):
        raise ValueError("metadata_json must be an object")
    _validate_json(meta)
    return meta


def audit_is_current(question: Any, now: datetime | None = None) -> bool:
    try:
        meta = _metadata(question)
        if (meta.get("qa_audit_version") != AUDIT_VERSION
                or meta.get("qa_rubric_version") != RUBRIC_VERSION
                or meta.get("qa_agent_versions") != AGENT_VERSIONS
                or meta.get("qa_content_fingerprint") != content_fingerprint(question)
                or meta.get("qa_context_fingerprint") != context_fingerprint(question_word_context(question))):
            return False
        audited = datetime.fromisoformat(meta["qa_audited_at"])
        if audited.tzinfo is None:
            audited = audited.replace(tzinfo=timezone.utc)
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return now - timedelta(days=QA_STALE_DAYS) <= audited <= now + timedelta(minutes=5)
    except (AttributeError, KeyError, ValueError, TypeError, RecursionError):
        return False


def question_is_approved(question: Any) -> bool:
    try:
        meta = _metadata(question)
        return (meta.get("qa_status") == "approved"
                and meta.get("qa_verdict") in ("pass", "fix")
                and meta.get("qa_error_code") is None and audit_is_current(question))
    except (ValueError, TypeError, RecursionError):
        return False


def question_is_servable(question: Any) -> bool:
    try:
        meta = _metadata(question)
        question_content(question)
        if "qa_status" in meta:
            return question_is_approved(question)
        # Legacy fallback, not a retroactive approval of the old fail-open auditor.
        if meta.get("qa_verdict") in ("delete", "fail", "error", "needs_review", "quarantined"):
            return False
        score = meta.get("qa_quality_score")
        if score is not None and (type(score) not in (int, float) or score <= 2):
            return False
        issues = meta.get("qa_issues_found", [])
        if not isinstance(issues, list):
            return False
        for issue in issues:
            if not isinstance(issue, (str, dict)) or issue == "wrong_answer":
                return False
            if isinstance(issue, dict) and (issue.get("type") == "wrong_answer"
                    or issue.get("severity") in ("high", "critical")):
                return False
        return True
    except (ValueError, TypeError, RecursionError):
        return False


_ISSUE_TYPES = {
    "quiz_type": "invalid_structure", "unsupported_type": "invalid_structure",
    "level": "level_mismatch", "audio_type": "invalid_structure",
    "missing_audio": "invalid_structure", "mixed_language_audio": "mixed_language",
    "translation_language": "mixed_language", "listening_construct": "construct",
    "drag_metadata": "invalid_structure", "drag_segments": "invalid_structure",
    "drag_order": "invalid_structure", "drag_scramble": "invalid_structure",
    "stale_audio": "stale_metadata", "stale_drag_audio": "stale_metadata",
    "stale_drag_prompt": "stale_metadata", "option_mapping": "stale_metadata",
    "stale_passage": "stale_metadata", "stale_stem": "stale_metadata",
}


def _issue(kind: str, detail: str, severity: str = "high") -> dict:
    return {"type": _ISSUE_TYPES.get(kind, kind), "severity": severity, "detail": detail,
            "suggestion": "Sửa toàn bộ item rồi kiểm định lại."}


def _text_key(text: str) -> str:
    return re.sub(r"[\s。，！？,.!?；;：:\"'“”‘’「」]", "", text)


_ORDERING_DETAILS = {
    "ordering_metadata": "metadata_json phải là object.",
    "ordering_segments": "Cần ít nhất hai token chứa chữ hoặc số.",
    "ordering_unscramblable": "Không thể xáo token thành câu hiển thị khác đáp án.",
    "ordering_correct_order": "correct_order phải là permutation index hợp lệ.",
    "ordering_scramble": "scrambled_indices phải là permutation index hợp lệ.",
    "ordering_selected_order": "selected_order phải dùng đủ index đúng một lần.",
    "ordering_version": "Phiên bản ordering không được hỗ trợ.",
    "ordering_alternates_unsupported": "Không hỗ trợ accepted_orders ngoài danh sách rỗng.",
    "ordering_legacy_ambiguous": "Legacy có token trùng nên không thể xác định identity.",
    "ordering_legacy_mismatch": "Token legacy không khớp đáp án.",
    "ordering_legacy_mixed": "Không được trộn metadata legacy với scrambled_indices.",
    "ordering_visible_scramble": "Thứ tự xáo hiển thị giống hệt đáp án.",
}


def drag_contract_errors(metadata: Any) -> list[dict]:
    try:
        normalize_ordering(metadata)
    except OrderingError as exc:
        return [_issue("invalid_structure", _ORDERING_DETAILS[str(exc)])]
    return []


def validate_question(
    item: dict, target_hanzi: str = "", *, target_level: int | None = None,
) -> list[dict]:
    """Validate the complete persisted/repair candidate; never infer semantic truth."""
    from .question_generator import _valid_question_payload

    errors: list[dict] = []
    try:
        if not isinstance(item, dict):
            raise ValueError("Item must be an object")
        _validate_json(item)
        content_metadata(item.get("metadata_json"))
    except (ValueError, TypeError, RecursionError):
        return [_issue("invalid_structure", "Item/metadata phải là JSON object hợp lệ, không có giá trị vô hạn.")]
    try:
        qt = QuizType(item.get("quiz_type"))
    except (ValueError, TypeError):
        return [_issue("quiz_type", "Quiz type không hợp lệ.")]
    if qt.value not in SUPPORTED_TYPES:
        return [_issue("unsupported_type", "Dạng này chưa có rubric QA.")]
    if type(item.get("level")) is not int or not 1 <= item["level"] <= 6:
        errors.append(_issue("level", "HSK level phải nằm trong 1..6."))
    if target_level is not None and (
        type(target_level) is not int or not 1 <= target_level <= 6
        or item.get("level") != target_level
    ):
        errors.append(_issue("level_mismatch", "HSK level của item không khớp từ gắn với item."))
    word_id = item.get("word_id")
    if word_id is not None and (type(word_id) is not int or word_id < 1):
        errors.append(_issue("invalid_structure", "word_id phải là ID nguyên dương hoặc null."))
    prompt, options = item.get("prompt"), item.get("options")
    index, explanation = item.get("correct_index"), item.get("explanation")
    meta = item.get("metadata_json")
    if not _valid_question_payload(qt, prompt, options, index, explanation, meta, target_hanzi):
        errors.append(_issue("invalid_structure", "Prompt/options/index/explanation hoặc metadata vi phạm contract."))
    if not isinstance(meta, dict):
        return errors
    audio = item.get("audio_text")
    if not isinstance(audio, str):
        errors.append(_issue("audio_type", "audio_text phải là chuỗi, có thể rỗng nếu không phải bài nghe."))
        audio = ""
    if qt in {QuizType.listening, QuizType.dialogue} and not audio.strip():
        errors.append(_issue("missing_audio", "Bài nghe/hội thoại cần audio_text tiếng Trung."))
    # Only inspect Chinese audio, not bilingual instructions or explanations.
    # Speaker labels and conventional Latin acronyms are not Vietnamese leakage.
    chinese_audio = re.sub(r"(?:^|[\s。！？])(?:[A-D]|\d)[：:]", "", audio)
    if qt in {QuizType.listening, QuizType.dialogue, QuizType.translation, QuizType.drag_drop}:
        if re.search(r"[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]", chinese_audio):
            errors.append(_issue("mixed_language_audio", "Audio tiếng Trung chứa chữ tiếng Việt."))
    if qt == QuizType.translation and isinstance(prompt, str):
        if audio and _text_key(audio) not in _text_key(prompt):
            errors.append(_issue("stale_audio", "Audio bản dịch không khớp văn bản nguồn trong prompt."))
        if isinstance(options, list) and any(isinstance(o, str) and re.search(r"[㐀-鿿]", o) for o in options):
            errors.append(_issue("translation_language", "Lựa chọn dịch sang tiếng Việt không được giữ mảnh Hán tự chưa dịch."))
    if qt == QuizType.listening and meta.get("question_subtype") == "sentence" and target_hanzi and audio.strip() == target_hanzi:
        errors.append(_issue("listening_construct", "Subtype sentence nhưng audio chỉ đọc từ đơn."))
    if qt == QuizType.drag_drop:
        drag_errors = drag_contract_errors(meta)
        errors.extend(drag_errors)
        if not drag_errors:
            ordering = normalize_ordering(meta)
            segments = ordering.segments
            sentence = "".join(segments[i] for i in ordering.correct_order)
            if audio and _text_key(audio) != _text_key(sentence):
                errors.append(_issue("stale_drag_audio", "Audio khác câu được dựng từ token đáp án."))
            if isinstance(prompt, str) and " · " in prompt:
                visible = re.split(r"[:：]", prompt, maxsplit=1)[-1].strip().split(" · ")
                if Counter(map(_text_key, visible)) != Counter(map(_text_key, segments)):
                    errors.append(_issue("stale_drag_prompt", "Token hiển thị trong prompt khác metadata.segments."))
    mapping = meta.get("option_word_ids")
    if mapping is not None and (not isinstance(mapping, list) or len(mapping) != 4 or any(i is not None and (type(i) is not int or i < 1) for i in mapping)):
        errors.append(_issue("option_mapping", "option_word_ids cần 4 ID nguyên dương hoặc null."))
    if isinstance(prompt, str):
        for field in ("passage", "stem"):
            text = meta.get(field)
            if text and (not isinstance(text, str) or _text_key(text) not in _text_key(prompt)):
                errors.append(_issue("stale_" + field, f"metadata.{field} không khớp prompt."))
    return errors
