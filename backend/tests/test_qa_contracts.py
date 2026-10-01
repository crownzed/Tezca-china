"""Offline QA schemas, role decisions, StepFun boundary and item contracts."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import builtins
import importlib.util
import io
import json
import logging
from pathlib import Path
import sys
import urllib.error
from unittest.mock import patch

import pytest

from app.models import QuizType
from app.services import qa_audit_service as qa
from app.services import question_quality as quality
from app.services.question_generator import _valid_question_payload
from app.settings import Settings


ITEM = {
    "word_id": 1, "level": 1, "quiz_type": "vocab",
    "prompt": "Chọn nghĩa đúng của từ 低:",
    "options": ["thấp", "cao", "dài", "ngắn"], "correct_index": 0,
    "explanation": "低 có nghĩa là thấp.", "audio_text": "",
    "metadata_json": {"source": "template", "option_word_ids": [None] * 4},
}
WORD = {
    "hanzi": "低", "pinyin": "dī", "meaning_vi": "thấp", "pos": "adj",
    "hsk_level": 1, "examples": [{"cn": "这里的价格很低。", "vi": "Giá ở đây rất thấp."}],
}
ISSUE = {"type": "ambiguity", "severity": "high", "detail": "Đáp án chưa rõ.", "suggestion": "Sửa lựa chọn."}
ROLES = {
    "verifier": {"verdict": "pass", "correct_answer_should_be": 0, "reason": "Đáp án duy nhất."},
    "critic": {"issues": []},
    "examiner": {"quality": 4, "level_match": True, "construct_match": True, "notes": "Đúng cấp độ."},
    "validator": {
        "improved": True, "issues_resolved": True, "new_issues": [],
        "recommendation": "accept", "quality": 4, "level_match": True,
        "construct_match": True, "reason": "Bản sửa đúng và đồng bộ.",
    },
}
CANDIDATE = deepcopy(ITEM)
CANDIDATE["prompt"] = "Chọn nghĩa phù hợp nhất của từ 低:"
ROLES["fixer"] = {"candidate": CANDIDATE, "changes_summary": "Làm rõ câu hỏi."}


def _snapshot(item=None):
    content = deepcopy(item if item is not None else ITEM)
    return {"question_id": 1, "content": content,
            "fingerprint": quality.content_fingerprint(content), "word_info": deepcopy(WORD)}


@pytest.mark.parametrize("role", ROLES)
def test_role_requires_every_field_and_rejects_unknown_fields(role):
    original = deepcopy(ROLES[role])
    assert qa._parse_role(json.dumps(original), role) == original
    for key in original:
        missing = deepcopy(original)
        del missing[key]
        with pytest.raises(qa.AuditError, match="^schema_error$"):
            qa._parse_role(missing, role)
    with pytest.raises(qa.AuditError, match="^schema_error$"):
        qa._parse_role({**original, "approve_anyway": True}, role)


@pytest.mark.parametrize("raw", [None, [], True, "{", "null", '[{"issues": []}]', '{"issues": ['])
def test_malformed_role_cannot_default_to_success(raw):
    with pytest.raises(qa.AuditError, match="^schema_error$"):
        qa._parse_role(raw, "critic")


@pytest.mark.parametrize("role,field,value", [
    ("verifier", "verdict", "approved"), ("verifier", "correct_answer_should_be", True),
    ("verifier", "correct_answer_should_be", 4), ("verifier", "reason", ""),
    ("critic", "issues", {}), ("critic", "issues", [ISSUE] * 21),
    ("examiner", "quality", "4"), ("examiner", "quality", True),
    ("examiner", "quality", 0), ("examiner", "quality", 6),
    ("examiner", "level_match", "true"), ("examiner", "construct_match", 1),
    ("validator", "improved", "yes"), ("validator", "new_issues", None),
    ("validator", "recommendation", "pass"), ("validator", "quality", float("nan")),
])
def test_role_schema_does_not_coerce_bad_types(role, field, value):
    raw = deepcopy(ROLES[role])
    raw[field] = value
    with pytest.raises(qa.AuditError, match="^schema_error$"):
        qa._parse_role(raw, role)


@pytest.mark.parametrize("field,value", [
    ("word_id", True), ("level", "1"), ("correct_index", False),
    ("options", ["thấp"] * 3), ("quiz_type", "voice"), ("audio_text", None),
    ("metadata_json", {"score": float("inf")}),
])
def test_fixer_requires_a_complete_strict_candidate(field, value):
    raw = deepcopy(ROLES["fixer"])
    raw["candidate"][field] = value
    with pytest.raises(qa.AuditError, match="^schema_error$"):
        qa._parse_role(raw, "fixer")
    missing = deepcopy(ROLES["fixer"])
    del missing["candidate"][field]
    with pytest.raises(qa.AuditError, match="^schema_error$"):
        qa._parse_role(missing, "fixer")


@pytest.mark.parametrize("role,field,value,decision,issue_type", [
    ("verifier", "verdict", "uncertain", "needs_review", "uncertainty"),
    ("verifier", "verdict", "fail", "fix", "wrong_answer"),
    ("verifier", "correct_answer_should_be", 1, "fix", "wrong_answer"),
    ("verifier", "correct_answer_should_be", None, "needs_review", "uncertainty"),
    ("examiner", "quality", 2, "fix", "low_quality"),
    ("examiner", "level_match", False, "fix", "level_mismatch"),
    ("examiner", "construct_match", False, "fix", "construct"),
    ("critic", "issues", [{**ISSUE, "severity": "medium"}], "fix", "ambiguity"),
])
def test_reconciliation_never_approves_negative_or_inconsistent_evidence(role, field, value, decision, issue_type):
    roles = deepcopy(ROLES)
    roles[role][field] = value
    actual, issues = qa._reconcile_verdicts(
        roles["verifier"], roles["critic"], roles["examiner"], correct_index=0, quiz_type="vocab",
    )
    assert actual == decision
    assert issue_type in {issue["type"] for issue in issues}


def test_drag_verifier_does_not_need_a_placeholder_mcq_answer():
    verifier = {**ROLES["verifier"], "correct_answer_should_be": None}
    assert qa._reconcile_verdicts(
        verifier, ROLES["critic"], ROLES["examiner"], correct_index=0, quiz_type="drag_drop",
    ) == ("pass", [])


@pytest.mark.parametrize("field,value", [
    ("recommendation", "reject"), ("recommendation", "uncertain"),
    ("improved", False), ("issues_resolved", False), ("level_match", False),
    ("construct_match", False), ("quality", 2), ("new_issues", [ISSUE]),
])
def test_validator_rejection_keeps_original_unapproved(field, value):
    snapshot = _snapshot()
    before = deepcopy(snapshot)
    roles = deepcopy(ROLES)
    roles["critic"]["issues"] = [deepcopy(ISSUE)]
    roles["validator"][field] = value
    with patch.object(qa, "_call_role", side_effect=lambda role, prompt: deepcopy(roles[role])):
        result = qa._audit_single_question(snapshot)
    assert result["status"] == result["verdict"] == "quarantined"
    assert result["error_code"] == "validator_rejected"
    assert result["candidate"] is None and result["changes"] == []
    assert snapshot == before


@pytest.mark.parametrize("change", ["identity", "source", "mapping", "self_approval", "no_change", "bad_options"])
def test_invalid_candidate_never_reaches_validator(change):
    roles = deepcopy(ROLES)
    roles["critic"]["issues"] = [deepcopy(ISSUE)]
    candidate = roles["fixer"]["candidate"]
    if change == "identity":
        candidate["word_id"] = 2
    elif change == "source":
        candidate["metadata_json"]["source"] = "invented"
    elif change == "mapping":
        candidate["metadata_json"]["option_word_ids"] = [1, 2, 3, 4]
    elif change == "self_approval":
        candidate["metadata_json"]["qa_status"] = "approved"
    elif change == "no_change":
        roles["fixer"]["candidate"] = deepcopy(ITEM)
    else:
        candidate["options"] = ["thấp"] * 4
    with patch.object(qa, "_call_role", side_effect=lambda role, prompt: deepcopy(roles[role])) as calls:
        result = qa._audit_single_question(_snapshot())
    assert result["status"] == "quarantined"
    assert result["error_code"] == "invalid_candidate"
    assert result["candidate"] is None
    assert "validator" not in [call.args[0] for call in calls.call_args_list]


@pytest.fixture
def stepfun(monkeypatch):
    from app.services import llm_generator_service as llm
    configured = Settings(
        _env_file=None, env="test", llm_api_url="", llm_api_keys="", llm_model="",
        llm_json_mode="", llm_reasoning_effort="", stepfun_api_keys="offline-test-key",
        stepfun_chat_url="https://api.stepfun.ai/step_plan/v1/chat/completions",
        stepfun_chat_model="step-3.7-flash", stepfun_content_model="step-5-preview",
        gemini_api_keys="unused-offline-relay-key",
    )
    monkeypatch.setattr(qa, "settings", configured)
    monkeypatch.setattr(llm, "settings", configured)
    monkeypatch.setattr(llm, "_cb_states", {})
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    return llm, configured


@pytest.mark.parametrize("field,value", [
    ("stepfun_api_keys", ""), ("llm_api_keys", "explicit-custom-key"),
    ("llm_api_url", "https://other.invalid/v1"),
    ("llm_api_url", "http://api.stepfun.ai/step_plan/v1"),
    ("stepfun_chat_url", "https://api.stepfun.ai/v1/chat/completions"),
    ("stepfun_chat_url", "https://api.stepfun.ai/step_plan/v1/chat/completions?key=private"),
    ("stepfun_chat_url", "https://api.stepfun.ai/step_plan/v1/chat/completions#private"),
])
def test_audit_rejects_non_step_plan_routes_before_http(stepfun, field, value):
    llm, configured = stepfun
    setattr(configured, field, value)
    with patch.object(llm, "_call_provider") as transport:
        with pytest.raises(qa.AuditError, match="^provider_error$"):
            qa._call_role("critic", "offline prompt")
    transport.assert_not_called()


def test_audit_uses_real_common_caller_with_flat_reasoning(stepfun):
    llm, configured = stepfun
    with patch.object(llm, "_call_provider", return_value={"issues": []}) as transport:
        assert qa._call_role("critic", "offline prompt") == {"issues": []}
    transport.assert_called_once()
    sent = transport.call_args.kwargs
    assert sent["url"] == "https://api.stepfun.ai/step_plan/v1/chat/completions"
    assert sent["api_key"] == configured.stepfun_keys_list[0]
    assert sent["model"] == "step-5-preview"
    assert sent["timeout"] == 120 and sent["retries"] == 1
    assert sent["payload"]["reasoning_effort"] == "low"
    assert "reasoning" not in sent["payload"]
    assert sent["payload"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("error", [TimeoutError("private detail"), RuntimeError("private detail")])
def test_provider_failure_has_no_relay_fallback_and_no_approval(stepfun, error):
    llm, configured = stepfun
    with patch.object(llm, "_call_provider", side_effect=error) as transport:
        result = qa._audit_single_question(_snapshot())
    assert result["status"] == "error" and result["error_code"] == "provider_error"
    assert result["candidate"] is None
    assert "private detail" not in str(result)
    transport.assert_called_once()
    assert transport.call_args.kwargs["url"] == configured.stepfun_chat_url


@pytest.mark.parametrize("raw", [{}, {"verdict": "pass"}, {"verdict": "pass", "correct_answer_should_be": "0", "reason": "OK"}])
def test_bad_provider_schema_becomes_error_not_pass(stepfun, raw):
    llm, _ = stepfun
    with patch.object(llm, "_call_provider", return_value=raw):
        result = qa._audit_single_question(_snapshot())
    assert result["status"] == "error" and result["error_code"] == "schema_error"
    assert result["candidate"] is None and result["changes"] == []


def test_http_error_body_and_credentials_never_reach_logs(stepfun, caplog):
    llm, configured = stepfun
    secret = configured.stepfun_keys_list[0]
    failure = urllib.error.HTTPError(
        configured.stepfun_chat_url, 401, "private error", {},
        io.BytesIO(f"Invalid Authorization: Bearer {secret}".encode()),
    )
    with caplog.at_level(logging.WARNING), patch.object(llm.urllib.request, "urlopen", side_effect=failure):
        result = qa._audit_single_question(_snapshot())
    assert result["error_code"] == "provider_error"
    assert secret not in caplog.text
    assert secret not in str(result)


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("failure", ["provider", "schema"])
def test_each_role_failure_aborts_without_approval(stepfun, role, failure):
    llm, _ = stepfun
    roles = deepcopy(ROLES)
    roles["critic"]["issues"] = [deepcopy(ISSUE)]

    def respond(prompt, **kwargs):
        active = prompt.splitlines()[0].removeprefix("ROLE: ")
        if active == role:
            if failure == "provider":
                raise TimeoutError("private timeout detail")
            return {}
        return deepcopy(roles[active])

    snapshot = _snapshot()
    before = deepcopy(snapshot)
    with patch.object(llm, "_call_api", side_effect=respond):
        result = qa._audit_single_question(snapshot)
    assert result["status"] == result["verdict"] == "error"
    assert result["error_code"] == ("provider_error" if failure == "provider" else "schema_error")
    assert result["candidate"] is None and result["changes"] == []
    assert snapshot == before
    assert "private timeout detail" not in str(result)


@pytest.mark.parametrize("case", ["exception", "unexpected_shape", "transport"])
def test_common_caller_does_not_log_private_provider_diagnostics(stepfun, caplog, case):
    llm, configured = stepfun
    secret = configured.stepfun_keys_list[0]
    private = "private-prompt-marker"
    if case == "exception":
        target = patch.object(llm, "_call_provider", side_effect=RuntimeError(f"{secret} {private}"))
    elif case == "transport":
        target = patch.object(llm.urllib.request, "urlopen", side_effect=urllib.error.URLError(f"{secret} {private}"))
    else:
        response = io.BytesIO(json.dumps({"error": f"{secret} {private}"}).encode())
        target = patch.object(llm.urllib.request, "urlopen", return_value=response)
    with caplog.at_level(logging.WARNING), target:
        with pytest.raises(RuntimeError) as raised:
            llm._call_api("offline prompt", retries=1, content_task=True)
    for value in (secret, private):
        assert value not in caplog.text
        assert value not in str(raised.value)


def test_import_does_not_initialize_provider_or_call_network(monkeypatch):
    module_name = "app.services._qa_import_safety_test"
    real_import = builtins.__import__
    calls = []

    def guarded_import(name, *args, **kwargs):
        if name.endswith("llm_generator_service"):
            calls.append(name)
            raise AssertionError("Provider imported eagerly")
        return real_import(name, *args, **kwargs)

    spec = importlib.util.spec_from_file_location(module_name, Path(qa.__file__))
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    with patch.object(builtins, "__import__", side_effect=guarded_import), patch("urllib.request.urlopen") as network:
        spec.loader.exec_module(module)
    assert calls == []
    network.assert_not_called()


def _approved_item():
    item = deepcopy(ITEM)
    item["word"] = {**deepcopy(WORD), "examples": [{"sentence_cn": "这里的价格很低。", "sentence_vi": "Giá ở đây rất thấp."}]}
    item["metadata_json"].update({
        "qa_status": "approved", "qa_verdict": "pass", "qa_error_code": None,
        "qa_audit_version": quality.AUDIT_VERSION, "qa_rubric_version": quality.RUBRIC_VERSION,
        "qa_agent_versions": dict(quality.AGENT_VERSIONS),
        "qa_audited_at": datetime.now(timezone.utc).isoformat(),
        "qa_content_fingerprint": quality.content_fingerprint(item),
        "qa_context_fingerprint": quality.context_fingerprint(quality.question_word_context(item)),
    })
    assert quality.question_is_approved(item)
    return item


@pytest.mark.parametrize("field,value", [
    ("prompt", "Câu hỏi đã đổi"), ("audio_text", "这个价格很低。"),
    ("options", ["cao", "thấp", "dài", "ngắn"]), ("correct_index", 1),
    ("explanation", "Giải thích khác"), ("level", 2), ("word_id", 2), ("quiz_type", "reading"),
])
def test_all_scoring_content_changes_invalidate_approval(field, value):
    item = _approved_item()
    item[field] = value
    assert not quality.audit_is_current(item)
    assert not quality.question_is_servable(item)


@pytest.mark.parametrize("change", ["render", "word", "example", "audit", "rubric", "agent", "expired", "future", "bad_time", "context_unloaded"])
def test_metadata_context_versions_and_time_invalidate_approval(change):
    item = _approved_item()
    meta = item["metadata_json"]
    if change == "render":
        meta["segments"] = ["我", "来"]
    elif change == "word":
        item["word"]["meaning_vi"] = "khác"
    elif change == "example":
        item["word"]["examples"][0]["sentence_cn"] = "这个价格太低了。"
    elif change in {"audit", "rubric"}:
        meta[f"qa_{change}_version"] = "old"
    elif change == "agent":
        meta["qa_agent_versions"]["verifier"] = "old"
    elif change == "expired":
        meta["qa_audited_at"] = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    elif change == "future":
        meta["qa_audited_at"] = (datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat()
    elif change == "bad_time":
        meta["qa_audited_at"] = "invalid"
    else:
        del item["word"]["examples"]
    assert not quality.audit_is_current(item)
    assert not quality.question_is_servable(item)


def test_qa_bookkeeping_and_object_order_do_not_change_content_hash():
    item = deepcopy(ITEM)
    fingerprint = quality.content_fingerprint(item)
    item["metadata_json"]["qa_history"] = [{"status": "error"}]
    item = dict(reversed(list(item.items())))
    assert quality.content_fingerprint(item) == fingerprint


def _drag(legacy=False):
    item = deepcopy(ITEM)
    item.update(quiz_type="drag_drop", prompt="Sắp xếp: 学生 · 是 · 我", options=["—"] * 4,
                audio_text="我是学生。", explanation="我是学生 nghĩa là tôi là học sinh.")
    item["metadata_json"].update(sentence_vi="Tôi là học sinh.")
    if legacy:
        item["metadata_json"].update(
            segments=["学生", "是", "我"], correct_order=["我", "是", "学生"],
        )
    else:
        item["metadata_json"].update(
            ordering_version="ordering-v1", segments=["我", "是", "学生"],
            correct_order=[0, 1, 2], scrambled_indices=[2, 1, 0],
        )
    return item


@pytest.mark.parametrize("legacy", [False, True])
def test_both_drag_formats_accept_duplicate_placeholder_options(legacy):
    item = _drag(legacy)
    assert quality.validate_question(item) == []
    assert _valid_question_payload(QuizType.drag_drop, item["prompt"], item["options"],
                                   item["correct_index"], item["explanation"], item["metadata_json"])


@pytest.mark.parametrize("field,value", [
    ("correct_order", [0, 0, 2]), ("correct_order", [0, 1, 3]),
    ("correct_order", [False, 1, 2]), ("correct_order", ["我", 1, "学生"]),
    ("correct_order", ["我", "是", "是"]), ("scrambled_indices", [1, 1, 0]),
    ("scrambled_indices", None), ("segments", ["我", "", "学生"]),
])
def test_drag_rejects_missing_tokens_mixed_formats_and_bad_permutations(field, value):
    item = _drag()
    item["metadata_json"][field] = value
    assert quality.drag_contract_errors(item["metadata_json"])
    assert quality.validate_question(item)


@pytest.mark.parametrize("field,value", [("audio_text", "他是老师。"), ("prompt", "Sắp xếp: 老师 · 是 · 我")])
def test_drag_rejects_stale_audio_and_display_tokens(field, value):
    item = _drag()
    item[field] = value
    assert "stale_metadata" in {issue["type"] for issue in quality.validate_question(item)}


def test_sentence_listening_cannot_only_read_the_target_word():
    item = deepcopy(ITEM)
    item.update(quiz_type="listening", audio_text="低")
    item["metadata_json"]["question_subtype"] = "sentence"
    assert "construct" in {issue["type"] for issue in quality.validate_question(item, "低")}


@pytest.mark.parametrize("quiz_type", ["listening", "dialogue", "translation", "drag_drop"])
def test_vietnamese_translation_cannot_leak_into_chinese_audio(quiz_type):
    item = _drag() if quiz_type == "drag_drop" else deepcopy(ITEM)
    item.update(quiz_type=quiz_type, audio_text="A: 价格很低，giá rất thấp。")
    assert "mixed_language" in {issue["type"] for issue in quality.validate_question(item)}
