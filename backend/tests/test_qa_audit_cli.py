"""Offline CLI safety checks. Run via main tests/run_offline.py; no keys/network/bank access.

Uses disposable SQLite banks and fake provider responses. The original CLI-only
cases inject a fake auditor; the integration cases exercise the real main audit
service and selector, patching only their provider boundary.
"""
from __future__ import annotations

from contextlib import closing
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, selectinload

from app.db import Base
from app.models import Example, Question, QuizType, Word
from app.services import qa_audit_service as qa
from app.services.question_quality import (
    AGENT_VERSIONS, AUDIT_VERSION, RUBRIC_VERSION, audit_is_current,
    content_fingerprint, context_fingerprint, question_content,
    question_is_approved, question_word_context,
)

_CLI_PATH = Path(__file__).resolve().parents[1] / "app" / "scripts" / "audit_questions.py"
_spec = importlib.util.spec_from_file_location("qa_audit_cli_under_test", _CLI_PATH)
cli = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(cli)


def _bank(folder: Path, n: int = 4):
    target = folder / "bank.sqlite3"
    engine = create_engine(f"sqlite:///{target.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for qid in range(1, n + 1):
            db.add(Question(
                id=qid, word_id=None, level=(qid - 1) % 6 + 1,
                quiz_type=QuizType.vocab, prompt=f"question-{qid}",
                options=["a", "b", "c", "d"], correct_index=0,
                explanation="why", audio_text="", metadata_json={"source": "test"},
            ))
        db.commit()
    return target, engine, f"sqlite:///{target.as_posix()}"


def _selector(db, level=None, quiz_type=None, limit=10, force=False, *,
              question_ids=None, exclude_ids=None):
    query = select(Question).order_by(Question.id)
    if level is not None:
        query = query.where(Question.level == level)
    if quiz_type is not None:
        query = query.where(Question.quiz_type == quiz_type)
    if question_ids is not None:
        query = query.where(Question.id.in_(question_ids))
    if exclude_ids:
        query = query.where(Question.id.not_in(exclude_ids))
    return [row for row in db.scalars(query).all() if row.quiz_type in cli.ALL_TYPES
            and (force or row.metadata_json.get("qa_status") != "approved")][:limit]


class FakeAudit:
    def __init__(self):
        self.calls = []

    def __call__(self, db, batch_size, level, quiz_type, force, dry_run, workers,
                 *, question_ids, exclude_ids, result_sink, apply_repairs):
        assert not db.in_transaction()  # the service rejects preexisting transactions
        assert not db.dirty and not db.new
        query_only = db.connection().exec_driver_sql("PRAGMA query_only").scalar_one()
        self.calls.append((list(question_ids), dry_run, query_only, apply_repairs))
        assert bool(query_only) == dry_run
        results = []
        for qid in question_ids:
            results.append({"question_id": qid, "status": "approved", "verdict": "pass",
                            "error_code": None, "issues": [], "repair_proposed": False,
                            "skip_write": dry_run,
                            "candidate": {"PRIVATE": "do not report"},
                            "role_results": {"verifier": "sensitive response"}})
            if not dry_run:
                question = db.get(Question, qid)
                question.metadata_json = {**question.metadata_json, "qa_status": "approved"}
        if not dry_run:
            db.commit()
        result_sink.extend(results)
        return {"audited": len(results), "approved": len(results), "passed": len(results),
                "fixed": 0, "needs_review": 0, "quarantined": 0, "errors": 0,
                "committed": 0 if dry_run else len(results), "deleted": 0}


class AuditCliTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.target, self.engine, self.configured_url = _bank(self.folder)
        self.addCleanup(self.engine.dispose)
        self.report_dir = self.folder / "reports"
        self.provider_check = Mock()
        self.auditor = FakeAudit()

    def args(self, *extra):
        return cli.parse_args(["--db-path", str(self.target), "--report-dir", str(self.report_dir), *extra])

    def run_cli(self, *extra, auditor=None, selector=_selector, provider_check=None):
        args = self.args(*extra)
        return cli.run(args, engine=self.engine, configured_url=self.configured_url,
                       selector=selector, auditor=auditor or self.auditor,
                       provider_check=provider_check or self.provider_check)

    def _read_checkpoint(self, state):
        checkpoints = list(self.report_dir.glob("*.checkpoint.json"))
        self.assertEqual(len(checkpoints), 1)
        data = json.loads(checkpoints[0].read_text(encoding="utf-8"))
        self.assertEqual(data, state)
        return data

    def test_defaults_global_bounds_and_help(self):
        args = self.args()
        self.assertEqual((args.batch, args.workers, args.max_passes), (10, 1, 10))
        for flag, invalid in (("--batch", "0"), ("--batch", "101"),
                              ("--workers", "5"), ("--max-passes", "21")):
            with self.subTest(flag=flag, invalid=invalid):
                with self.assertRaises(cli.AuditCliError):
                    self.args(flag, invalid)
        for extra in (("--dry-run", "--apply-repairs-offline"),
                      ("--pilot", "2", "--ids", "1"),
                      ("--pilot", "1", "--level", "1"),
                      ("--ids", "2,2"), ("--ids", "0"), ("--ids", "2,-3")):
            with self.subTest(extra=extra):
                with self.assertRaises(cli.AuditCliError):
                    self.args(*extra)
        with self.assertRaises(SystemExit) as ctx:
            cli.parse_args(["--help"])
        self.assertEqual(ctx.exception.code, 0)

    def test_target_rejects_missing_header_mismatched_config_and_remote(self):
        bad = self.folder / "not-sqlite.db"
        bad.write_bytes(b"not a database")
        malformed = self.folder / "malformed.db"
        malformed.write_bytes(b"SQLite format 3\x00" + b"\x00" * 512)
        examples = [
            ("/nonexistent/audit-file.db", self.configured_url, self.engine),
            (str(bad), self.configured_url, self.engine),
            (str(malformed), self.configured_url, self.engine),
            (str(self.target), "sqlite://", self.engine),
            (str(self.target), "sqlite:///:memory:", self.engine),
            (str(self.target), self.configured_url + "?mode=ro", self.engine),
            (str(self.target), "postgresql://user:SECRET@host/db", self.engine),
            (str(self.target), "sqlite+libsql://some.example/db?secure=true", self.engine),
            ("file:" + str(self.target), self.configured_url, self.engine),
            (str(self.target) + "?mode=ro", self.configured_url, self.engine),
        ]
        for target, url, engine in examples:
            with self.subTest(target=target, url=url):
                with self.assertRaises(cli.AuditCliError) as ctx:
                    cli.verify_target(target, configured_url=url, engine=engine)
                self.assertNotIn("SECRET", str(ctx.exception))
        # A second existing valid bank must be rejected before any audit call.
        second = self.folder / "second.sqlite3"
        with closing(sqlite3.connect(self.target)) as source, closing(sqlite3.connect(second)) as destination:
            source.backup(destination)
        with self.assertRaises(cli.AuditCliError):
            cli.verify_target(self.target, configured_url=f"sqlite:///{second.as_posix()}", engine=self.engine)
        other_engine = create_engine(f"sqlite:///{second.as_posix()}")
        try:
            with self.assertRaises(cli.AuditCliError):
                cli.verify_target(self.target, configured_url=self.configured_url, engine=other_engine)
        finally:
            other_engine.dispose()
        self.provider_check.assert_not_called()

    def test_bad_or_missing_target_never_invokes_service_or_makes_reports(self):
        self.engine.dispose()  # release the pooled Windows file handle before removal
        self.target.unlink()
        with self.assertRaises(cli.AuditCliError):
            self.run_cli()
        self.provider_check.assert_not_called()
        self.assertEqual(self.auditor.calls, [])
        self.assertFalse(self.report_dir.exists())

    def test_live_verified_backup_and_manifest_before_first_write(self):
        def assert_backed_up(*args, **kwargs):
            checkpoints = list(self.report_dir.glob("*.checkpoint.json"))
            manifests = list(self.report_dir.glob("*.manifest.json"))
            self.assertEqual((len(checkpoints), len(manifests)), (1, 1))
            manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
            state = json.loads(checkpoints[0].read_text(encoding="utf-8"))
            backup = Path(manifest["backup_path"])
            self.assertEqual(backup.stat().st_size, manifest["size_bytes"])
            self.assertEqual(manifest["backup_sha256"], cli._hash_file(backup))
            self.assertEqual(state["backup"], manifest)
            with closing(sqlite3.connect(backup)) as db:
                self.assertEqual(db.execute("PRAGMA integrity_check").fetchone(), ("ok",))
                self.assertEqual(db.execute("SELECT COUNT(*) FROM questions").fetchone(), (4,))
            return self.auditor(*args, **kwargs)

        state = self.run_cli("--batch", "2", "--max-passes", "2", auditor=assert_backed_up)
        self.assertEqual(state["stats"]["committed"], 4)
        self.assertEqual(state["in_flight_ids"], [])
        self.assertEqual(state["stop_reason"], "complete")
        self.assertEqual(state["write_state"], "committed")
        self._read_checkpoint(state)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(__import__("sqlalchemy").func.count()).select_from(Question)
                                       .where(Question.metadata_json["qa_status"].as_string() == "approved")), 4)
        self.assertTrue(self.provider_check.called)
        self.assertFalse(list(self.report_dir.glob("*.done")))

    def test_checkpoint_records_in_flight_ids_and_unknown_writes_before_service_call(self):
        def crash_after_commit(db, *args, **kwargs):
            ids = kwargs["question_ids"]
            checkpoints = list(self.report_dir.glob("*.checkpoint.json"))
            self.assertEqual(len(checkpoints), 1)
            state = json.loads(checkpoints[0].read_text(encoding="utf-8"))
            self.assertEqual(state["write_state"], "unknown")
            self.assertEqual(state["in_flight_ids"], ids)
            self.assertEqual(state["seen_ids"], ids)
            self.assertEqual(state["stats"]["committed"], 0)
            self.assertEqual(state["passes"], 1)
            self.assertIsNotNone(state["backup"])
            question = db.get(Question, ids[0])
            question.metadata_json = {**question.metadata_json, "qa_status": "approved"}
            db.commit()
            raise SystemExit("simulated abrupt exit after SQLite commit")

        with self.assertRaises(SystemExit):
            self.run_cli("--ids", "1", auditor=crash_after_commit)
        persisted = json.loads(next(self.report_dir.glob("*.checkpoint.json")).read_text(encoding="utf-8"))
        self.assertEqual(persisted["in_flight_ids"], [1])
        self.assertEqual(persisted["write_state"], "unknown")
        self.assertEqual(persisted["stats"]["committed"], 0)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Question, 1).metadata_json["qa_status"], "approved")

    def test_dry_run_uses_read_only_query_only_and_no_backup_or_bank_writes(self):
        original_hash = cli._hash_file(self.target)
        def test_read_only(db, *args, **kwargs):
            with self.assertRaises(OperationalError):
                db.connection().exec_driver_sql("UPDATE questions SET prompt = 'MUTATED'")
            db.rollback()
            return self.auditor(db, *args, **kwargs)
        state = self.run_cli("--dry-run", "--ids", "1,3", auditor=test_read_only)
        self.assertEqual(state["stats"]["audited"], 2)
        self.assertEqual(state["stats"]["committed"], 0)
        self.assertEqual(state["persisted_unresolved"], {"needs_review": 0, "quarantined": 0, "error": 0})
        self.assertEqual(cli._hash_file(self.target), original_hash)
        self.assertFalse(list(self.report_dir.glob("*.sqlite3")))
        self.assertIsNone(state["backup"])
        self.assertEqual(state["stop_reason"], "complete")
        self._read_checkpoint(state)
        self.assertEqual([row[0] for row in self.auditor.calls], [[1, 3]])

    def test_force_never_retries_seen_ids_or_reaches_unbounded_bank(self):
        state = self.run_cli("--force", "--batch", "2", "--max-passes", "20")
        self.assertEqual(state["passes"], 2)
        self.assertEqual([ids for ids, *_ in self.auditor.calls], [[1, 2], [3, 4]])
        self.assertEqual(state["seen_ids"], [1, 2, 3, 4])
        self.assertFalse(state["queue_has_more"])

    def test_explicit_id_intent_classifies_pending_current_missing_and_out_of_scope(self):
        with Session(self.engine) as db:
            q2 = db.get(Question, 2)
            q2.metadata_json = {"qa_status": "approved"}
            q4 = db.get(Question, 4)
            q4.quiz_type = QuizType.voice
            db.commit()
        state = self.run_cli("--ids", "1,2,4,999", "--batch", "2")
        self.assertEqual(state["selection"], {"pending": [1], "current": [2],
                                               "missing": [999], "out_of_scope": [4]})
        self.assertEqual(state["remaining_ids"], [])
        self.assertEqual(state["stats"]["audited"], 1)
        self.assertEqual([item["question_id"] for item in state["results"]], [1])
        self._read_checkpoint(state)

    def test_planned_explicit_ids_dropped_by_second_selection_stop_without_auditing(self):
        selection_calls = 0

        def changed_selector(db, *args, **kwargs):
            nonlocal selection_calls
            selection_calls += 1
            rows = _selector(db, *args, **kwargs)
            if selection_calls == 2:
                return [row for row in rows if row.id != 2]
            return rows

        state = self.run_cli("--dry-run", "--ids", "1,2", "--batch", "2",
                             selector=changed_selector)
        self.assertEqual(state["selection"]["pending"], [1, 2])
        self.assertEqual(state["selection_changes"], [
            {"question_id": 2, "error_code": "concurrent_change"}])
        self.assertEqual(state["remaining_ids"], [1, 2])
        self.assertEqual(state["seen_ids"], [])
        self.assertEqual(state["passes"], 0)
        self.assertEqual(state["stop_reason"], "concurrent_change")
        self.assertTrue(state["queue_has_more"])
        self.assertEqual(self.auditor.calls, [])
        self._read_checkpoint(state)

    def test_planned_pilot_id_dropped_by_second_selection_stays_unresolved(self):
        def changed_selector(db, *args, **kwargs):
            if kwargs.get("exclude_ids") is not None:
                return []
            return _selector(db, *args, **kwargs)

        state = self.run_cli("--dry-run", "--pilot", "1", selector=changed_selector)
        self.assertEqual(state["stop_reason"], "concurrent_change")
        self.assertEqual(state["selection"]["pending"], [1, 2, 3, 4])
        self.assertEqual(state["selection_changes"], [
            {"question_id": qid, "error_code": "concurrent_change"} for qid in [1, 2, 3, 4]])
        self.assertEqual(state["remaining_ids"], [1, 2, 3, 4])
        self.assertEqual(state["seen_ids"], [])
        self.assertEqual(self.auditor.calls, [])

    def test_explicit_current_unresolved_status_is_counted_without_audit(self):
        with Session(self.engine) as db:
            db.get(Question, 1).metadata_json = {"qa_status": "quarantined"}
            db.get(Question, 2).metadata_json = {"qa_status": "error"}
            db.get(Question, 3).metadata_json = {"qa_status": "needs_review"}
            db.commit()

        def none_pending(db, *args, **kwargs):
            return []

        state = self.run_cli("--dry-run", "--ids", "1,2,3", selector=none_pending)
        self.assertEqual(state["selection"]["pending"], [])
        self.assertEqual(state["selection"]["current"], [1, 2, 3])
        self.assertEqual(state["stats"]["audited"], 0)
        self.assertEqual(state["persisted_unresolved"],
                         {"needs_review": 1, "quarantined": 1, "error": 1})
        self.assertFalse(state["queue_has_more"])
        self._read_checkpoint(state)

    def test_proposal_default_and_offline_attestation_is_explicit(self):
        state = self.run_cli("--ids", "1")
        self.assertFalse(state["repairs_applied"])
        self.assertEqual(self.auditor.calls[0][3], False)
        second = self.run_cli("--ids", "2", "--apply-repairs-offline")
        self.assertTrue(second["repairs_applied"])
        self.assertTrue(self.auditor.calls[-1][3])

    def test_error_stops_and_unresolved_counts_are_separate_from_queue(self):
        def fail_once(db, *args, **kwargs):
            qid = kwargs["question_ids"][0]
            db.get(Question, qid).metadata_json = {"qa_status": "quarantined"}
            db.commit()
            kwargs["result_sink"].append({"question_id": qid, "status": "quarantined",
                                          "verdict": "quarantined", "error_code": "invalid_candidate",
                                          "issues": [{"detail": "private user content"}],
                                          "skip_write": False})
            return {"audited": 1, "approved": 0, "passed": 0, "fixed": 0,
                    "needs_review": 0, "quarantined": 1, "errors": 0,
                    "committed": 1, "deleted": 0}
        state = self.run_cli("--ids", "1", "--batch", "1", auditor=fail_once)
        self.assertEqual(state["stop_reason"], "complete")
        self.assertFalse(state["queue_has_more"])
        self.assertEqual(state["persisted_unresolved"]["quarantined"], 1)
        self.assertEqual(state["results"][0]["issue_count"], 1)
        self.assertNotIn("private", json.dumps(state))

    def test_mismatched_membership_normalizes_all_ids_to_safe_errors_and_stops(self):
        def foreign_callback(db, *args, **kwargs):
            ids = kwargs["question_ids"]
            kwargs["result_sink"].extend([
                {"question_id": ids[0], "status": "approved", "verdict": "pass", "issues": [], "skip_write": True},
                {"question_id": 9999, "status": "approved", "verdict": "pass", "issues": [], "skip_write": True},
            ])
            return {"audited": 2, "approved": 2, "passed": 2, "fixed": 0, "needs_review": 0,
                    "quarantined": 0, "errors": 0, "committed": 0, "deleted": 0}
        state = self.run_cli("--dry-run", "--ids", "1,3", auditor=foreign_callback)
        self.assertEqual(state["stop_reason"], "callback_mismatch")
        self.assertEqual(state["stats"]["errors"], 2)
        self.assertEqual([row["question_id"] for row in state["results"]], [1, 3])
        self.assertTrue(all(row["error_code"] == "callback_mismatch" for row in state["results"]))
        self.assertEqual(state["passes"], 1)
        self._read_checkpoint(state)

    def test_partial_commit_count_follows_skip_write_flags(self):
        def partial_commit(db, *args, **kwargs):
            ids = kwargs["question_ids"]
            question = db.get(Question, ids[0])
            question.metadata_json = {**question.metadata_json, "qa_status": "approved"}
            db.commit()
            kwargs["result_sink"].extend([
                {"question_id": ids[0], "status": "approved", "verdict": "pass",
                 "error_code": None, "issues": [], "repair_proposed": False,
                 "skip_write": False},
                {"question_id": ids[1], "status": "quarantined", "verdict": "quarantined",
                 "error_code": "invalid_candidate", "issues": [{"detail": "bad item"}],
                 "repair_proposed": False, "skip_write": True},
            ])
            return {"audited": 2, "approved": 1, "passed": 1, "fixed": 0,
                    "needs_review": 0, "quarantined": 1, "errors": 0,
                    "committed": 1, "deleted": 0}

        state = self.run_cli("--ids", "1,2", "--batch", "2", auditor=partial_commit)
        self.assertEqual(state["stats"]["committed"], 1)
        self.assertEqual([row["skip_write"] for row in state["results"]], [False, True])
        self.assertEqual(state["write_state"], "committed")
        self.assertEqual(state["stop_reason"], "complete")
        with Session(self.engine) as db:
            self.assertEqual(db.get(Question, 1).metadata_json["qa_status"], "approved")
            self.assertNotIn("qa_status", db.get(Question, 2).metadata_json)

    def test_rollback_results_mark_all_attempts_skip_write_and_commit_zero(self):
        def rolled_back(db, *args, **kwargs):
            ids = kwargs["question_ids"]
            kwargs["result_sink"].extend([
                {"question_id": qid, "status": "error", "verdict": "error",
                 "error_code": "database_error", "issues": [],
                 "repair_proposed": False, "skip_write": True}
                for qid in ids
            ])
            return {"audited": len(ids), "approved": 0, "passed": 0, "fixed": 0,
                    "needs_review": 0, "quarantined": 0, "errors": len(ids),
                    "committed": 0, "deleted": 0}

        state = self.run_cli("--ids", "1,2", "--batch", "2", auditor=rolled_back)
        self.assertEqual(state["stats"]["committed"], 0)
        self.assertEqual(state["stats"]["errors"], 2)
        self.assertTrue(all(row["skip_write"] is True for row in state["results"]))
        self.assertEqual(state["stop_reason"], "item_errors")

    def test_missing_or_non_boolean_skip_write_stops_without_claiming_commit(self):
        for bad_value in ("missing", "not-a-boolean"):
            with self.subTest(bad_value=bad_value):
                self.report_dir = self.folder / f"reports-{bad_value}"

                def malformed(db, *args, **kwargs):
                    result = self.auditor(db, *args, **kwargs)
                    item = kwargs["result_sink"][0]
                    if bad_value == "missing":
                        item.pop("skip_write")
                    else:
                        item["skip_write"] = bad_value
                    return result

                state = self.run_cli("--dry-run", "--ids", "1", auditor=malformed)
                self.assertEqual(state["stop_reason"], "callback_mismatch")
                self.assertEqual(state["stats"]["committed"], 0)
                self.assertEqual(state["stats"]["errors"], 1)
                self.assertIsNone(state["results"][0]["skip_write"])

    def test_accounting_mismatch_keeps_ids_no_content_or_exception_leak(self):
        def mismatch(db, *args, **kwargs):
            result = self.auditor(db, *args, **kwargs)
            result["approved"] = 0
            return result
        state = self.run_cli("--dry-run", "--ids", "1,2", auditor=mismatch)
        self.assertEqual(state["stop_reason"], "accounting_mismatch")
        self.assertEqual(state["stats"]["errors"], 2)
        self.assertEqual([row["question_id"] for row in state["results"]], [1, 2])
        self.assertNotIn("sensitive response", json.dumps(state))
        self.assertNotIn("PRIVATE", json.dumps(state))
        self._read_checkpoint(state)

    def test_service_exception_is_sanitized_and_checkpointed(self):
        def private_exception(*_args, **_kwargs):
            raise RuntimeError("API_KEY=SECRET provider response private user payload")
        state = self.run_cli("--ids", "1", auditor=private_exception)
        self.assertEqual(state["stop_reason"], "service_error")
        self.assertEqual(state["results"][0]["error_code"], "service_error")
        self.assertEqual(state["write_state"], "unknown")
        self.assertEqual(state["in_flight_ids"], [1])
        self.assertNotIn("SECRET", json.dumps(state))
        self._read_checkpoint(state)

    def test_pilot_is_at_most_two_per_supported_stratum(self):
        state = self.run_cli("--pilot", "2", "--dry-run")
        self.assertEqual(len(state["pilot_strata"]), 42)
        self.assertEqual(sum(group["selected"] for group in state["pilot_strata"]), 4)
        self.assertTrue(all(0 <= item["selected"] <= 2 for item in state["pilot_strata"]))
        self.assertEqual(state["stats"]["audited"], 4)
        self.assertEqual(state["stop_reason"], "complete")

    def test_max_passes_bounds_cost_and_shows_remaining_queue(self):
        state = self.run_cli("--batch", "1", "--max-passes", "2")
        self.assertEqual((state["passes"], state["stats"]["audited"]), (2, 2))
        self.assertTrue(state["queue_has_more"])
        self.assertEqual(state["stop_reason"], "max_passes")

    def test_provider_check_happens_before_backup_and_selector(self):
        failing = Mock(side_effect=RuntimeError("provider SECRET"))
        with self.assertRaises(cli.AuditCliError) as ctx:
            self.run_cli(provider_check=failing)
        self.assertEqual(ctx.exception.code, "provider_unavailable")
        self.assertEqual(self.auditor.calls, [])
        self.assertFalse(self.report_dir.exists())
        self.assertNotIn("SECRET", str(ctx.exception))


# These cases deliberately do not mock the selector, snapshot logic or persistence.
# Only the provider boundary is fake; run with the main backend's run_offline.py.
_SERVICE_PASS_ROLES = {
    "verifier": {"verdict": "pass", "correct_answer_should_be": 0,
                 "reason": "Đáp án duy nhất."},
    "critic": {"issues": []},
    "examiner": {"quality": 4, "level_match": True, "construct_match": True,
                 "notes": "Phù hợp HSK1."},
}
_SERVICE_ISSUE = {"type": "ambiguity", "severity": "high",
                  "detail": "Lựa chọn chưa rõ.", "suggestion": "Viết lại lựa chọn."}


def _service_repair_roles(original):
    candidate = deepcopy(original)
    candidate.update(
        prompt="Chọn nghĩa phù hợp nhất của từ 低:",
        options=["cao", "thấp", "dài", "ngắn"], correct_index=1,
        explanation="低 (dī) diễn tả độ cao thấp.", audio_text="低",
    )
    candidate["metadata_json"]["option_word_ids"] = [None] * 4
    roles = deepcopy(_SERVICE_PASS_ROLES)
    roles["critic"] = {"issues": [deepcopy(_SERVICE_ISSUE)]}
    roles["fixer"] = {"candidate": candidate, "changes_summary": "Sửa toàn bộ item."}
    roles["validator"] = {
        "improved": True, "issues_resolved": True, "new_issues": [],
        "recommendation": "accept", "quality": 4, "level_match": True,
        "construct_match": True, "reason": "Đã sửa đúng và đồng bộ.",
    }
    return roles


class AuditCliRealServiceTest(unittest.TestCase):
    """Exercise the main service through the worktree CLI, never a real bank/provider."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.target = self.folder / "bank.sqlite3"
        self.engine = create_engine(f"sqlite:///{self.target.as_posix()}")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine, tables=[Word.__table__, Example.__table__, Question.__table__])
        self.configured_url = f"sqlite:///{self.target.as_posix()}"
        self.report_dir = self.folder / "reports"
        with Session(self.engine) as db:
            word = Word(hanzi="低", pinyin="dī", meaning_vi="thấp", hsk_level=1, pos="adj")
            word.examples = [Example(sentence_cn="这里的价格很低。", sentence_vi="Giá ở đây rất thấp.")]
            db.add(word)
            db.flush()
            self.word_id = word.id
            db.commit()

    def add_questions(self, count=1):
        with Session(self.engine) as db:
            questions = [Question(
                word_id=self.word_id, level=1, quiz_type=QuizType.vocab,
                prompt=f"Chọn nghĩa đúng của: 低 ({i})",
                options=["thấp", "cao", "dài", "ngắn"], correct_index=0,
                explanation="低 có nghĩa là thấp.", audio_text="",
                metadata_json={"source": "template",
                               "option_word_ids": [self.word_id, None, None, None]},
            ) for i in range(count)]
            db.add_all(questions)
            db.flush()
            ids = [question.id for question in questions]
            db.commit()
        return ids

    def get_question(self, question_id):
        with Session(self.engine) as db:
            return db.scalar(select(Question).where(Question.id == question_id).options(
                selectinload(Question.word).selectinload(Word.examples)))

    def run_service(self, *extra, roles=None, role_side_effect=None, auditor=None):
        args = cli.parse_args(["--db-path", str(self.target), "--report-dir", str(self.report_dir), *extra])
        if role_side_effect is None:
            responses = deepcopy(roles if roles is not None else _SERVICE_PASS_ROLES)
            role_side_effect = lambda role, _prompt: deepcopy(responses[role])
        # The CLI checks once before making a backup and the real service checks
        # again before selecting; patch both checks for the entire call.
        with (patch.object(qa, "check_audit_provider") as check,
              patch.object(qa, "_call_role", side_effect=role_side_effect) as calls):
            state = cli.run(args, engine=self.engine, configured_url=self.configured_url,
                            selector=qa.questions_needing_audit,
                            auditor=auditor if auditor is not None else qa.audit_questions,
                            provider_check=qa.check_audit_provider)
        self.assertTrue(check.called)
        checkpoints = list(self.report_dir.glob("*.checkpoint.json"))
        self.assertEqual(len(checkpoints), 1)
        self.assertEqual(json.loads(checkpoints[0].read_text(encoding="utf-8")), state)
        return state, calls

    def test_service_live_pass_commits_and_checkpoint_matches_bank(self):
        qid = self.add_questions()[0]
        original = question_content(self.get_question(qid))
        state, calls = self.run_service("--ids", str(qid))
        self.assertEqual(state["selection"]["pending"], [qid])
        self.assertEqual(state["stop_reason"], "complete")
        self.assertEqual(state["stats"]["audited"], 1)
        self.assertEqual((state["stats"]["approved"], state["stats"]["passed"],
                          state["stats"]["committed"]), (1, 1, 1))
        self.assertEqual(state["results"], [{"question_id": qid, "status": "approved",
                                            "verdict": "pass", "error_code": None,
                                            "repair_proposed": False, "skip_write": False,
                                            "issue_count": 0}])
        self.assertEqual(state["write_state"], "committed")
        self.assertIsNotNone(state["backup"])
        self.assertEqual(calls.call_count, 3)
        question = self.get_question(qid)
        self.assertEqual(question_content(question), original)
        self.assertTrue(question_is_approved(question))
        self.assertEqual(question.metadata_json["qa_status"], "approved")
        self.assertEqual(state["persisted_unresolved"],
                         {"needs_review": 0, "quarantined": 0, "error": 0})

    def test_service_proposal_preserves_every_content_field_and_records_candidate(self):
        qid = self.add_questions()[0]
        original = question_content(self.get_question(qid))
        roles = _service_repair_roles(original)
        state, calls = self.run_service("--ids", str(qid), roles=roles)
        self.assertEqual(state["stop_reason"], "complete")
        self.assertEqual((state["stats"]["needs_review"], state["stats"]["committed"],
                          state["stats"]["fixed"]), (1, 1, 0))
        self.assertEqual(state["results"][0]["status"], "needs_review")
        self.assertTrue(state["results"][0]["repair_proposed"])
        self.assertFalse(state["results"][0]["skip_write"])
        self.assertFalse(state["repairs_applied"])
        self.assertEqual(state["persisted_unresolved"]["needs_review"], 1)
        question = self.get_question(qid)
        self.assertEqual(question_content(question), original)
        self.assertEqual(question.metadata_json["qa_proposed_content"], roles["fixer"]["candidate"])
        self.assertEqual(question.metadata_json["qa_fixes_applied"], [])
        self.assertFalse(question_is_approved(question))
        self.assertEqual(calls.call_count, 5)

    def test_service_explicit_offline_apply_replaces_entire_candidate(self):
        qid = self.add_questions()[0]
        original = question_content(self.get_question(qid))
        roles = _service_repair_roles(original)
        state, calls = self.run_service("--ids", str(qid), "--apply-repairs-offline", roles=roles)
        self.assertTrue(state["repairs_applied"])
        self.assertEqual(state["stop_reason"], "complete")
        self.assertEqual((state["stats"]["approved"], state["stats"]["fixed"],
                          state["stats"]["committed"]), (1, 1, 1))
        self.assertEqual(state["results"][0]["verdict"], "fix")
        self.assertFalse(state["results"][0]["skip_write"])
        question = self.get_question(qid)
        self.assertEqual(question_content(question), roles["fixer"]["candidate"])
        self.assertEqual(question.metadata_json["qa_previous_content"], original)
        self.assertTrue(question_is_approved(question))
        self.assertEqual(calls.call_count, 5)

    def test_service_dry_run_is_read_only_and_does_not_change_bank(self):
        qid = self.add_questions()[0]
        before_hash = cli._hash_file(self.target)
        original = question_content(self.get_question(qid))

        def check_read_only(db, *args, **kwargs):
            self.assertEqual(db.connection().exec_driver_sql("PRAGMA query_only").scalar_one(), 1)
            with self.assertRaises(OperationalError):
                db.connection().exec_driver_sql("UPDATE questions SET prompt = 'changed'")
            db.rollback()  # clear this probe's service-owned read transaction
            return qa.audit_questions(db, *args, **kwargs)

        state, calls = self.run_service("--dry-run", "--ids", str(qid), auditor=check_read_only)
        self.assertEqual(state["stop_reason"], "complete")
        self.assertEqual((state["stats"]["audited"], state["stats"]["passed"],
                          state["stats"]["committed"]), (1, 1, 0))
        self.assertTrue(state["results"][0]["skip_write"])
        self.assertEqual(state["write_state"], "none")
        self.assertIsNone(state["backup"])
        self.assertFalse(list(self.report_dir.glob("*.sqlite3")))
        self.assertEqual(cli._hash_file(self.target), before_hash)
        self.assertEqual(question_content(self.get_question(qid)), original)
        self.assertNotIn("qa_status", self.get_question(qid).metadata_json)
        self.assertEqual(calls.call_count, 3)

    def test_service_provider_error_persists_safe_metadata_and_accounts_for_commit(self):
        qid = self.add_questions()[0]

        def provider_error(_role, _prompt):
            raise qa.AuditError("provider_error")

        state, calls = self.run_service("--ids", str(qid), role_side_effect=provider_error)
        self.assertEqual(state["stop_reason"], "item_errors")
        self.assertEqual((state["stats"]["audited"], state["stats"]["errors"],
                          state["stats"]["committed"]), (1, 1, 1))
        self.assertEqual(state["results"][0]["error_code"], "provider_error")
        self.assertEqual(state["results"][0]["status"], "error")
        self.assertFalse(state["results"][0]["skip_write"])
        self.assertEqual(state["write_state"], "committed")
        self.assertEqual(state["persisted_unresolved"]["error"], 1)
        question = self.get_question(qid)
        self.assertEqual(question.metadata_json["qa_status"], "error")
        self.assertEqual(question.metadata_json["qa_error_code"], "provider_error")
        self.assertEqual(calls.call_count, 1)

    def test_service_bad_snapshot_skips_write_while_good_row_commits(self):
        bad_id, good_id = self.add_questions(2)
        with Session(self.engine) as db:
            db.execute(update(Question).where(Question.id == bad_id).values(metadata_json=["broken"]))
            db.commit()
        state, calls = self.run_service("--ids", f"{bad_id},{good_id}", "--batch", "2")
        self.assertEqual(state["stop_reason"], "item_errors")
        self.assertEqual(state["selection"]["pending"], [bad_id, good_id])
        self.assertEqual((state["stats"]["audited"], state["stats"]["errors"],
                          state["stats"]["approved"], state["stats"]["committed"]),
                         (2, 1, 1, 1))
        self.assertEqual([(row["question_id"], row["error_code"], row["skip_write"])
                          for row in state["results"]],
                         [(bad_id, "snapshot_error", True), (good_id, None, False)])
        self.assertEqual(self.get_question(bad_id).metadata_json, ["broken"])
        self.assertTrue(question_is_approved(self.get_question(good_id)))
        self.assertEqual(calls.call_count, 3)

    def test_service_rollback_marks_all_attempts_skip_write_without_bank_changes(self):
        ids = self.add_questions(2)
        before = [question_content(self.get_question(qid)) for qid in ids]

        def commit_fails(db, *args, **kwargs):
            with patch.object(db, "commit", side_effect=RuntimeError("private db detail")):
                return qa.audit_questions(db, *args, **kwargs)

        state, calls = self.run_service("--ids", ",".join(map(str, ids)), "--batch", "2",
                                        auditor=commit_fails)
        self.assertEqual(state["stop_reason"], "item_errors")
        self.assertEqual((state["stats"]["audited"], state["stats"]["errors"],
                          state["stats"]["approved"], state["stats"]["committed"]),
                         (2, 2, 0, 0))
        self.assertEqual(state["write_state"], "backed_up")
        self.assertEqual([row["error_code"] for row in state["results"]],
                         ["database_error", "database_error"])
        self.assertTrue(all(row["skip_write"] is True for row in state["results"]))
        self.assertEqual(state["persisted_unresolved"],
                         {"needs_review": 0, "quarantined": 0, "error": 0})
        self.assertNotIn("private db detail", json.dumps(state))
        for qid, original in zip(ids, before):
            question = self.get_question(qid)
            self.assertEqual(question_content(question), original)
            self.assertNotIn("qa_status", question.metadata_json)
        self.assertEqual(calls.call_count, 6)

    def test_service_current_quarantined_explicit_row_is_counted_without_reaudit(self):
        qid = self.add_questions()[0]
        with Session(self.engine) as db:
            question = db.scalar(select(Question).where(Question.id == qid).options(
                selectinload(Question.word).selectinload(Word.examples)))
            question.metadata_json = {
                **question.metadata_json,
                "qa_status": "quarantined", "qa_verdict": "quarantined",
                "qa_audit_version": AUDIT_VERSION, "qa_rubric_version": RUBRIC_VERSION,
                "qa_agent_versions": dict(AGENT_VERSIONS),
                "qa_audited_at": datetime.now(timezone.utc).isoformat(),
                "qa_content_fingerprint": content_fingerprint(question),
                "qa_context_fingerprint": context_fingerprint(question_word_context(question)),
            }
            self.assertTrue(audit_is_current(question))
            db.commit()
        state, calls = self.run_service("--dry-run", "--ids", str(qid))
        self.assertEqual(state["selection"]["pending"], [])
        self.assertEqual(state["selection"]["current"], [qid])
        self.assertEqual((state["stats"]["audited"], state["passes"]), (0, 0))
        self.assertEqual(state["results"], [])
        self.assertEqual(state["persisted_unresolved"],
                         {"needs_review": 0, "quarantined": 1, "error": 0})
        self.assertEqual(state["stop_reason"], "complete")
        self.assertFalse(state["queue_has_more"])
        self.assertEqual(self.get_question(qid).metadata_json["qa_status"], "quarantined")
        calls.assert_not_called()


if __name__ == "__main__":
    unittest.main()
