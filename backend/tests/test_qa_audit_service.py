"""Audit regression tests on disposable SQLite banks; every provider call is fake."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import selectinload, sessionmaker

from app.db import Base
from app.models import Example, Question, QuizType, Word
from app.services import qa_audit_service as qa
from app.services.question_quality import (
    AGENT_VERSIONS, AUDIT_VERSION, RUBRIC_VERSION, content_fingerprint,
    context_fingerprint, question_content, question_is_approved, question_word_context,
)


PASS_ROLES = {
    "verifier": {"verdict": "pass", "correct_answer_should_be": 0, "reason": "Đáp án duy nhất."},
    "critic": {"issues": []},
    "examiner": {"quality": 4, "level_match": True, "construct_match": True, "notes": "Phù hợp HSK1."},
}
ACCEPT = {
    "improved": True, "issues_resolved": True, "new_issues": [],
    "recommendation": "accept", "quality": 4, "level_match": True,
    "construct_match": True, "reason": "Đã sửa đúng và đồng bộ.",
}
ISSUE = {"type": "ambiguity", "severity": "high", "detail": "Lựa chọn chưa rõ.", "suggestion": "Viết lại lựa chọn."}


def _eager():
    return selectinload(Question.word).selectinload(Word.examples)


def _approve(question):
    question.metadata_json = {
        **question.metadata_json,
        "qa_status": "approved", "qa_verdict": "pass", "qa_error_code": None,
        "qa_audit_version": AUDIT_VERSION, "qa_rubric_version": RUBRIC_VERSION,
        "qa_agent_versions": dict(AGENT_VERSIONS),
        "qa_audited_at": datetime.now(timezone.utc).isoformat(),
        "qa_content_fingerprint": content_fingerprint(question),
        "qa_context_fingerprint": context_fingerprint(question_word_context(question)),
    }


@pytest.fixture
def bank(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'audit.db').as_posix()}")
    Base.metadata.create_all(engine, tables=[Word.__table__, Example.__table__, Question.__table__])
    sessions = sessionmaker(bind=engine, autoflush=False)
    with sessions.begin() as db:
        word = Word(hanzi="低", pinyin="dī", meaning_vi="thấp", hsk_level=1, pos="adj")
        word.examples = [Example(sentence_cn="这里的价格很低。", sentence_vi="Giá ở đây rất thấp.")]
        db.add(word)
        db.flush()
        word_id = word.id

    def add(count=1):
        with sessions.begin() as db:
            rows = [Question(
                word_id=word_id, level=1, quiz_type=QuizType.vocab,
                prompt=f"Chọn nghĩa đúng của: 低 ({i})", options=["thấp", "cao", "dài", "ngắn"],
                correct_index=0, explanation="低 có nghĩa là thấp.", audio_text="",
                metadata_json={"source": "template", "option_word_ids": [word_id, None, None, None]},
            ) for i in range(count)]
            db.add_all(rows)
            db.flush()
            return [q.id for q in rows]

    def get(qid):
        with sessions() as db:
            return db.scalar(select(Question).where(Question.id == qid).options(_eager()))

    yield SimpleNamespace(engine=engine, Session=sessions, word_id=word_id, add=add, get=get)
    engine.dispose()


@pytest.fixture
def provider():
    with (
        patch.object(qa, "check_audit_provider"),
        patch.object(qa, "_call_role", side_effect=lambda role, _prompt: deepcopy(PASS_ROLES[role])) as calls,
    ):
        yield calls


def _repair_roles(original):
    candidate = deepcopy(original)
    candidate.update(
        prompt="Chọn nghĩa phù hợp nhất của từ 低:",
        options=["cao", "thấp", "dài", "ngắn"], correct_index=1,
        explanation="低 (dī) diễn tả độ cao thấp.", audio_text="低",
    )
    candidate["metadata_json"]["option_word_ids"] = [None] * 4
    roles = deepcopy(PASS_ROLES)
    roles["critic"] = {"issues": [deepcopy(ISSUE)]}
    roles["fixer"] = {"candidate": candidate, "changes_summary": "Sửa prompt và đồng bộ đáp án, âm thanh, mapping."}
    roles["validator"] = deepcopy(ACCEPT)
    return roles


def _run(bank, **kwargs):
    results = []
    with bank.Session() as db:
        stats = qa.audit_questions(db, result_sink=results, **kwargs)
        assert not db.in_transaction()
    return stats, results


def test_selector_scans_past_first_256_current_items(bank):
    ids = bank.add(270)
    with bank.Session.begin() as db:
        rows = db.scalars(select(Question).where(Question.id.in_(ids[:260])).options(_eager())).all()
        for question in rows:
            _approve(question)
    with bank.Session() as db:
        pending = qa.questions_needing_audit(db, limit=3)
        assert [q.id for q in pending] == ids[260:263]


@pytest.mark.parametrize("case", ["empty", "missing", "current"])
def test_early_returns_release_service_owned_read_transaction(bank, provider, case):
    kwargs = {}
    if case == "missing":
        kwargs["question_ids"] = [999]
    elif case == "current":
        qid = bank.add()[0]
        with bank.Session.begin() as db:
            _approve(db.scalar(select(Question).where(Question.id == qid).options(_eager())))
        kwargs["question_ids"] = [qid]
    stats, results = _run(bank, **kwargs)
    assert stats["committed"] == 0
    assert stats["errors"] == (case != "empty")
    assert len(results) == (case != "empty")
    provider.assert_not_called()


def test_caller_transaction_is_rejected_without_rollback(bank, provider):
    qid = bank.add()[0]
    with bank.Session() as db:
        question = db.get(Question, qid)
        question.prompt = "Thay đổi riêng của caller."
        transaction = db.get_transaction()
        with patch.object(db, "rollback", wraps=db.rollback) as rollback:
            with pytest.raises(qa.AuditError, match="^database_error$"):
                qa.audit_questions(db)
            rollback.assert_not_called()
        assert db.get_transaction() is transaction
        assert question in db.dirty
        assert question.prompt == "Thay đổi riêng của caller."
    provider.assert_not_called()


def test_proposal_preserves_all_original_content_and_keeps_fixer_evidence(bank, provider):
    qid = bank.add()[0]
    before = question_content(bank.get(qid))
    roles = _repair_roles(before)
    provider.side_effect = lambda role, _prompt: deepcopy(roles[role])
    stats, results = _run(bank, question_ids=[qid])
    after = bank.get(qid)
    assert question_content(after) == before
    assert stats["needs_review"] == 1
    assert stats["fixed"] == stats["approved"] == 0
    assert stats["committed"] == 1
    assert results[0]["repair_proposed"] is True
    assert after.metadata_json["qa_proposed_content"] == roles["fixer"]["candidate"]
    assert after.metadata_json["qa_fixes_applied"] == []
    assert after.metadata_json["qa_role_results"]["fixer"] == roles["fixer"]
    assert not question_is_approved(after)


def test_apply_flag_is_required_even_if_worker_forgets_proposal_marker(bank, provider):
    qid = bank.add()[0]
    before = question_content(bank.get(qid))
    roles = _repair_roles(before)
    provider.side_effect = lambda role, _prompt: deepcopy(roles[role])
    worker = qa._audit_single_question

    def wrongly_mark_applied(snapshot):
        result = worker(snapshot)
        result.update(status="approved", verdict="fix", repair_proposed=False, changes=["prompt"])
        return result

    with patch.object(qa, "_audit_single_question", side_effect=wrongly_mark_applied):
        stats, results = _run(bank, question_ids=[qid])
    after = bank.get(qid)
    assert question_content(after) == before
    assert stats["approved"] == stats["fixed"] == 0
    assert results[0]["repair_proposed"] is True
    assert after.metadata_json["qa_status"] == "needs_review"


def test_explicit_offline_apply_updates_complete_candidate_atomically(bank, provider):
    qid = bank.add()[0]
    before = question_content(bank.get(qid))
    roles = _repair_roles(before)
    provider.side_effect = lambda role, _prompt: deepcopy(roles[role])
    stats, results = _run(bank, question_ids=[qid], apply_repairs=True)
    after = bank.get(qid)
    assert question_content(after) == roles["fixer"]["candidate"]
    assert after.metadata_json["qa_previous_content"] == before
    assert stats["approved"] == stats["fixed"] == stats["committed"] == 1
    assert question_is_approved(after)
    assert set(results[0]["changes"]) == {key for key in before if before[key] != question_content(after)[key]}


@pytest.mark.parametrize("change", ["word", "example", "add_example", "delete_example", "question", "qa_status"])
def test_changes_during_provider_calls_abort_batch(bank, provider, change):
    ids = bank.add(2)
    mutated = False

    def role_with_concurrent_edit(role, _prompt):
        nonlocal mutated
        if not mutated:
            mutated = True
            with bank.Session.begin() as other:
                if change == "word":
                    other.get(Word, bank.word_id).meaning_vi = "ý nghĩa mới"
                elif change == "example":
                    other.scalar(select(Example)).sentence_cn = "这个价格太低了。"
                elif change == "add_example":
                    other.add(Example(word_id=bank.word_id, sentence_cn="低一点。", sentence_vi="Thấp hơn một chút."))
                elif change == "delete_example":
                    other.delete(other.scalar(select(Example)))
                elif change == "question":
                    other.get(Question, ids[-1]).explanation = "Giải thích mới từ tiến trình khác."
                else:
                    question = other.scalar(select(Question).where(Question.id == ids[-1]).options(_eager()))
                    _approve(question)
        return deepcopy(PASS_ROLES[role])

    provider.side_effect = role_with_concurrent_edit
    stats, results = _run(bank, question_ids=ids)
    assert stats["errors"] == 2
    assert stats["committed"] == stats["approved"] == 0
    assert {r["error_code"] for r in results} == {"concurrent_change"}
    assert "qa_status" not in bank.get(ids[0]).metadata_json


@pytest.mark.parametrize("change", ["current", "level", "type", "delete"])
def test_explicit_membership_and_eligibility_are_rechecked_after_refresh(bank, provider, change):
    ids = bank.add(2)
    selector = qa.questions_needing_audit

    def select_then_change(*args, **kwargs):
        selected = selector(*args, **kwargs)
        with bank.Session.begin() as other:
            question = other.scalar(select(Question).where(Question.id == ids[-1]).options(_eager()))
            if change == "current":
                _approve(question)
            elif change == "level":
                question.level = 2
            elif change == "type":
                question.quiz_type = QuizType.voice
            else:
                other.delete(question)
        return selected

    with patch.object(qa, "questions_needing_audit", side_effect=select_then_change):
        stats, results = _run(bank, question_ids=ids, level=1)
    assert stats["errors"] == 2
    assert stats["committed"] == 0
    assert {r["error_code"] for r in results} == {"concurrent_change"}
    provider.assert_not_called()


def test_bad_snapshot_is_reported_without_poisoning_valid_item(bank, provider):
    ids = bank.add(2)
    with bank.Session.begin() as db:
        db.execute(update(Question).where(Question.id == ids[0]).values(metadata_json=["broken"]))
    stats, results = _run(bank, question_ids=ids)
    assert stats["errors"] == stats["approved"] == stats["committed"] == 1
    assert results[0]["error_code"] == "snapshot_error"
    assert results[0]["skip_write"] is True
    assert bank.get(ids[0]).metadata_json == ["broken"]
    assert question_is_approved(bank.get(ids[1]))


def test_commit_failure_rolls_back_all_writes_and_reports_errors(bank, provider):
    ids = bank.add(2)
    results = []
    with bank.Session() as db, patch.object(db, "commit", side_effect=RuntimeError("private db detail")):
        stats = qa.audit_questions(db, question_ids=ids, result_sink=results)
        assert not db.in_transaction()
    assert stats["errors"] == 2
    assert stats["committed"] == stats["approved"] == 0
    assert {r["error_code"] for r in results} == {"database_error"}
    for qid in ids:
        assert "qa_status" not in bank.get(qid).metadata_json
    assert "private db detail" not in str(results)
