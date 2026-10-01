"""Bounded, local-only question audit runner.

The selected database must be the *configured* SQLite engine's existing local file.
Dry-run still calls the paid StepFun provider, but uses read-only SQLite sessions.
No answer text, provider response, secrets, or raw exception is written to reports.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
from typing import Any, Callable
from urllib.parse import quote
from uuid import uuid4

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import Question, QuizType

LEVELS = tuple(range(1, 7))
ALL_TYPES = tuple(QuizType(name) for name in (
    "vocab", "listening", "translation", "cloze", "reading", "dialogue", "drag_drop",
))
DEFAULT_BATCH = 10
DEFAULT_MAX_PASSES = 10  # GLOBAL cap, not a cap per level/type
MAX_PASSES = 20
MAX_IDS = 10_000
STAT_KEYS = ("audited", "approved", "passed", "fixed", "needs_review",
             "quarantined", "errors", "committed", "deleted")
_STATUSES = {"approved", "needs_review", "quarantined", "error"}
_ERROR_CODES = {
    "provider_error", "schema_error", "audit_error", "database_error",
    "concurrent_change", "snapshot_error", "invalid_candidate",
    "validator_rejected", "unsupported_type", "callback_mismatch",
    "accounting_mismatch", "service_error",
}
_UNRESOLVED = ("needs_review", "quarantined", "error")


class AuditCliError(Exception):
    """Code and remediation are constants; never include a provider exception/URL."""

    def __init__(self, code: str, fix: str):
        super().__init__(code)
        self.code = code
        self.fix = fix


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit a bounded number of questions in an explicitly selected local SQLite bank.",
        epilog=("Examples (run from backend with the same DATABASE_URL as the selected bank):\n"
                "  python -m app.scripts.audit_questions --db-path /absolute/path/bank.db --pilot 1 --dry-run\n"
                "  python -m app.scripts.audit_questions --db-path /absolute/path/bank.db --ids 5,8 --json\n"
                "  python -m app.scripts.audit_questions --db-path /absolute/path/bank.db --level 2 --quiz-type vocab --max-passes 2\n"
                "Dry-run still makes paid StepFun calls. Live mode writes QA metadata, NOT repairs,\n"
                "unless --apply-repairs-offline explicitly attests this bank is isolated and drained.\n"
                "All runs stop on error; a backup is verified before any live-bank write."),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--db-path", required=True, metavar="ABSOLUTE_SQLITE_FILE",
                        help="Existing local SQLite file; MUST match DATABASE_URL and the running engine")
    parser.add_argument("--report-dir", type=Path, metavar="DIRECTORY",
                        help="Backup/manifest/checkpoint directory (default: <bank-parent>/audit-reports)")
    parser.add_argument("--level", type=int, choices=LEVELS, help="Limit to HSK level 1..6")
    parser.add_argument("--quiz-type", "--type", dest="quiz_type",
                        choices=[item.value for item in ALL_TYPES], help="Limit to one supported quiz type")
    parser.add_argument("--ids", metavar="ID,ID,...", help="Explicit positive question IDs (max 10,000)")
    parser.add_argument("--pilot", type=int, choices=(1, 2), metavar="{1,2}",
                        help="Up to 1 or 2 eligible items per HSK1..6 x 7 types (42 or 84 slots)")
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH, metavar="1..100",
                        help="Items per call (default: 10; allowed: 1..100)")
    parser.add_argument("--workers", type=int, default=1, metavar="1..4",
                        help="Concurrent provider calls (default: 1; allowed: 1..4)")
    parser.add_argument("--max-passes", type=int, default=DEFAULT_MAX_PASSES, metavar="1..20",
                        help="Global bound on audit calls (default: 10; allowed: 1..20)")
    parser.add_argument("--force", action="store_true", help="Also re-audit current items, at most once per run")
    parser.add_argument("--dry-run", action="store_true",
                        help="Use SQLite read-only/query_only; still makes paid provider calls")
    parser.add_argument("--apply-repairs-offline", action="store_true",
                        help="ATTEST bank is an isolated OFFLINE copy, unserved and all writers drained; apply validated repairs")
    parser.add_argument("--json", action="store_true", help="Print one safe, parseable JSON summary")
    args = parser.parse_args(argv)
    if not 1 <= args.batch <= 100 or not 1 <= args.workers <= 4 or not 1 <= args.max_passes <= MAX_PASSES:
        raise AuditCliError("invalid_bounds", "Use --batch 1..100, --workers 1..4 and --max-passes 1..20.")
    if args.pilot and (args.ids is not None or args.level is not None or args.quiz_type is not None):
        raise AuditCliError("conflicting_selection", "Use --pilot alone, or choose --ids/--level/--quiz-type instead.")
    if args.dry_run and args.apply_repairs_offline:
        raise AuditCliError("conflicting_modes", "Remove --apply-repairs-offline or --dry-run; repairs require a backed-up, isolated bank.")
    args.question_ids = _parse_ids(args.ids)
    return args


def _parse_ids(value: str | None) -> list[int] | None:
    if value is None:
        return None
    fields = value.split(",")
    if (len(fields) > MAX_IDS or not fields or
            any(not field.isascii() or not field.isdecimal() or
                len(field) > 18 or int(field) < 1 for field in fields)):
        raise AuditCliError("invalid_ids", "Supply at most 10,000 comma-separated positive decimal IDs, e.g. --ids 2,5.")
    ids = [int(field) for field in fields]
    if len(set(ids)) != len(ids):
        raise AuditCliError("duplicate_ids", "Remove duplicate IDs from --ids and retry.")
    return ids


def _local_path(path: str | Path) -> Path:
    raw = str(path)
    # Reject external URLs, sqlite URI parameters and Windows UNC shares *before* path resolution.
    if (not raw or raw.startswith(("//", "\\\\", "file:")) or "://" in raw
            or "?" in raw or "#" in raw or "\x00" in raw):
        raise AuditCliError("unsafe_target", "Use an existing absolute path to a local SQLite file, without URI, query or network share.")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute() or candidate.is_symlink():
        raise AuditCliError("unsafe_target", "Use an existing absolute, non-symlink local SQLite file.")
    try:
        resolved = candidate.resolve(strict=True)
        mode = resolved.stat().st_mode
    except OSError:
        raise AuditCliError("missing_target", "Create or locate the SQLite bank first; pass its existing absolute path via --db-path.") from None
    if not stat.S_ISREG(mode) or str(resolved).startswith(("//", "\\\\")):
        raise AuditCliError("unsafe_target", "Use an existing local SQLite regular file, not a device or network share.")
    return resolved


def _url_path(url_string: str) -> Path:
    try:
        url = make_url(url_string)
        if (url.drivername not in ("sqlite", "sqlite+pysqlite") or url.host or url.port
                or url.username or url.password or url.query or not url.database
                or url.database == ":memory:" or url.database.startswith("file:")
                or "?" in url.database or "#" in url.database):
            raise ValueError
        return _local_path(Path(url.database).absolute())
    except (ValueError, TypeError, AuditCliError):
        raise AuditCliError("unsafe_configuration", "Set DATABASE_URL to this same existing local SQLite file (no URI, query, or remote driver).") from None


def _sqlite_ro_connection(path: Path) -> sqlite3.Connection:
    uri = "file:" + quote(path.as_posix(), safe="/: ") + "?mode=ro"
    connection = sqlite3.connect(uri, uri=True, check_same_thread=False)
    connection.execute("PRAGMA query_only = ON")
    return connection


def _database_list(connection: Any, target: Path) -> None:
    # SQLite creates a harmless empty temp schema after using temporary tables;
    # reject only extra attached file DBs, not SQLite's own temp namespace.
    databases = [row for row in connection.execute("PRAGMA database_list").fetchall()
                 if row[1] != "temp"]
    if len(databases) != 1 or databases[0][1] != "main":
        raise AuditCliError("database_mismatch", "Remove attached databases and ensure the configured engine opens only --db-path.")
    try:
        actual = _local_path(databases[0][2])
    except AuditCliError:
        raise AuditCliError("database_mismatch", "Set DATABASE_URL to the exact local file passed to --db-path.") from None
    if actual != target:
        raise AuditCliError("database_mismatch", "Set DATABASE_URL and --db-path to the same local SQLite file, then retry.")


def _check_integrity(connection: Any) -> None:
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise AuditCliError("integrity_failure", "Restore this bank from a known-good backup before auditing.")


def verify_target(path: str | Path, *, configured_url: str, engine: Engine) -> Path:
    """Check file/header, configured URL, actual DB on engine and SQLite integrity.

    No database connection is attempted until the explicit file exists and both
    settings and engine URL match it, so a typo cannot create an empty bank.
    """
    target = _local_path(path)
    try:
        with target.open("rb") as source:
            if source.read(16) != b"SQLite format 3\x00":
                raise AuditCliError("invalid_header", "Select an existing SQLite 3 bank, not another file type.")
    except OSError:
        raise AuditCliError("unreadable_target", "Grant read access to the selected SQLite bank and retry.") from None
    configured = _url_path(configured_url)
    actual_url = _url_path(engine.url.render_as_string(hide_password=True))
    if target != configured or target != actual_url or engine.dialect.name != "sqlite" or engine.dialect.driver != "pysqlite":
        raise AuditCliError("database_mismatch", "Set DATABASE_URL and --db-path to the exact same local SQLite file, then retry.")
    try:
        with closing(_sqlite_ro_connection(target)) as reader:
            _database_list(reader, target)
            _check_integrity(reader)
        with closing(engine.raw_connection()) as live:
            _database_list(live.cursor(), target)
            _check_integrity(live.cursor())
    except sqlite3.Error:
        raise AuditCliError("database_unreadable", "Check SQLite file permissions/integrity and retry with a local bank.") from None
    return target


def _sync_dir(directory: Path) -> None:
    # Directory fsync is unavailable on some platforms (including Windows).
    try:
        fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        try:
            os.fsync(fd)
        except OSError:
            pass
    finally:
        os.close(fd)


def _atomic_json(path: Path, payload: dict) -> None:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".audit-", suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            json.dump(payload, output, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        _sync_dir(path.parent)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def backup_database(target: Path, directory: Path, run_id: str) -> dict:
    """Create and verify a point-in-time SQLite backup plus fsynced SHA256 manifest."""
    output = directory / f"audit-{run_id}.sqlite3"
    try:
        # Exclusive creation prevents a concurrent run from replacing another backup.
        with output.open("xb"):
            pass
        with closing(_sqlite_ro_connection(target)) as source, closing(sqlite3.connect(output)) as destination:
            _database_list(source, target)
            _check_integrity(source)
            source.backup(destination)
            destination.commit()
        with closing(_sqlite_ro_connection(output)) as backup:
            _database_list(backup, output)
            _check_integrity(backup)
        with output.open("r+b") as file:
            os.fsync(file.fileno())
        manifest = {
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "backup_path": str(output), "backup_sha256": _hash_file(output),
            "size_bytes": output.stat().st_size,
        }
        _atomic_json(directory / f"audit-{run_id}.manifest.json", manifest)
        return manifest
    except (sqlite3.Error, OSError, AuditCliError):
        raise AuditCliError("backup_failure", "Free disk space/check report directory permissions; verify a backup before rerunning live audit.") from None


def _readonly_engine(target: Path) -> Engine:
    return create_engine("sqlite://", creator=lambda: _sqlite_ro_connection(target), poolclass=NullPool)


def _scope(args: argparse.Namespace) -> tuple[int | None, QuizType | None]:
    return args.level, QuizType(args.quiz_type) if args.quiz_type else None


def _classify_ids(db: Any, args: argparse.Namespace, selector: Callable) -> dict[str, list[int]]:
    """Only explicitly intended IDs; never dump question content into a report."""
    classes = {key: [] for key in ("pending", "current", "missing", "out_of_scope")}
    ids = args.question_ids or []
    level, quiz_type = _scope(args)
    for offset in range(0, len(ids), 500):
        group = ids[offset:offset + 500]
        rows = db.execute(select(Question.id, Question.level, Question.quiz_type)
                          .where(Question.id.in_(group))).all()
        known = {qid: (row_level, row_type) for qid, row_level, row_type in rows}
        candidates = [qid for qid in group if qid in known and
                      (level is None or known[qid][0] == level) and
                      (quiz_type is None or known[qid][1] == quiz_type) and
                      known[qid][1] in ALL_TYPES]
        eligible = set()
        # Explicit IDs can exceed a single service limit; classify in small chunks.
        for start in range(0, len(candidates), 100):
            part = candidates[start:start + 100]
            eligible.update(row.id for row in selector(
                db, level=level, quiz_type=quiz_type, limit=len(part), force=args.force,
                question_ids=part, exclude_ids=None,
            ))
        for qid in group:
            if qid not in known:
                classes["missing"].append(qid)
            elif qid not in candidates:
                classes["out_of_scope"].append(qid)
            elif qid in eligible:
                classes["pending"].append(qid)
            else:
                classes["current"].append(qid)
    return classes


def _pilot_plan(db: Any, args: argparse.Namespace, selector: Callable) -> tuple[list[int], list[dict]]:
    ids, strata = [], []
    for level in LEVELS:
        for quiz_type in ALL_TYPES:
            selected = selector(db, level=level, quiz_type=quiz_type,
                                limit=args.pilot, force=args.force,
                                question_ids=None, exclude_ids=None)
            selected_ids = [row.id for row in selected]
            ids.extend(selected_ids)
            strata.append({"level": level, "quiz_type": quiz_type.value,
                           "requested": args.pilot, "selected": len(selected_ids),
                           "unfilled": args.pilot - len(selected_ids)})
    if len(ids) != len(set(ids)):
        raise AuditCliError("selection_mismatch", "Check the selector's ID uniqueness before rerunning the audit.")
    return ids, strata


def _sanitize_result(result: dict, qid: int) -> dict:
    status, verdict = result["status"], result["verdict"]
    code = result.get("error_code")
    return {"question_id": qid, "status": status, "verdict": verdict,
            "error_code": code if code in _ERROR_CODES or code is None else "audit_error",
            "repair_proposed": result.get("repair_proposed") is True,
            "skip_write": result["skip_write"] is True,
            "issue_count": len(result["issues"])}


def _safe_errors(ids: list[int], code: str) -> list[dict]:
    return [{"question_id": qid, "status": "error", "verdict": "error",
             "error_code": code, "repair_proposed": False, "skip_write": None,
             "issue_count": 0}
            for qid in ids]


def _validate_batch(ids: list[int], results: list, stats: dict, dry_run: bool) -> list[dict]:
    if (not isinstance(results, list) or len(results) != len(ids)
            or any(not isinstance(item, dict) or type(item.get("question_id")) is not int
                   for item in results)
            or set(item["question_id"] for item in results) != set(ids)
            or len({item["question_id"] for item in results}) != len(ids)):
        raise AuditCliError("callback_mismatch", "Inspect the checkpoint and backup; fix the service's per-ID callback before retrying.")
    ordered = {result["question_id"]: result for result in results}
    if not isinstance(stats, dict) or any(type(stats.get(key)) is not int or stats[key] < 0 for key in STAT_KEYS):
        raise AuditCliError("accounting_mismatch", "Inspect the checkpoint and backup; fix the service's batch statistics before retrying.")
    try:
        sanitized = []
        for qid in ids:
            result = ordered[qid]
            status, verdict, code = result["status"], result["verdict"], result.get("error_code")
            if (status not in _STATUSES or
                (status == "approved" and (verdict not in ("pass", "fix") or code is not None)) or
                (status == "error" and verdict != "error") or
                (status in ("needs_review", "quarantined") and verdict != status) or
                not isinstance(result["issues"], list) or
                type(result.get("repair_proposed", False)) is not bool or
                type(result.get("skip_write")) is not bool):
                raise ValueError
            sanitized.append(_sanitize_result(result, qid))
    except (KeyError, ValueError, TypeError):
        raise AuditCliError("callback_mismatch", "Inspect the checkpoint and backup; fix malformed per-ID results before retrying.") from None
    counts = {key: sum(row["status"] == key for row in sanitized) for key in _STATUSES}
    expected_committed = sum(not row["skip_write"] for row in sanitized)
    if (stats["audited"] != len(ids) or stats["approved"] != counts["approved"]
            or stats["passed"] != sum(row["verdict"] == "pass" for row in sanitized)
            or stats["fixed"] != sum(row["verdict"] == "fix" for row in sanitized)
            or stats["needs_review"] != counts["needs_review"]
            or stats["quarantined"] != counts["quarantined"]
            or stats["errors"] != counts["error"] or stats["deleted"] != 0
            or stats["committed"] != expected_committed
            or (dry_run and (stats["committed"] != 0 or expected_committed != 0))):
        raise AuditCliError("accounting_mismatch", "Inspect the checkpoint and backup; reconcile result statuses, skip_write flags and statistics before retrying.")
    return sanitized


def _unresolved_counts(db: Any, args: argparse.Namespace, ids: list[int] | None) -> dict[str, int]:
    level, quiz_type = _scope(args)
    counts = {key: 0 for key in _UNRESOLVED}
    # Explicit/pilot scopes may contain 10,000 IDs; SQLite has a finite bind limit.
    groups = [ids[offset:offset + 500] for offset in range(0, len(ids), 500)] if ids is not None else [None]
    for group in groups:
        status = func.json_extract(Question.metadata_json, "$.qa_status")
        query = select(status, func.count()).where(status.in_(_UNRESOLVED))
        if level is not None:
            query = query.where(Question.level == level)
        if quiz_type is not None:
            query = query.where(Question.quiz_type == quiz_type)
        else:
            query = query.where(Question.quiz_type.in_(ALL_TYPES))
        if group is not None:
            query = query.where(Question.id.in_(group))
        for name, amount in db.execute(query.group_by(status)):
            counts[name] += amount
    return counts


def _checkpoint(path: Path, state: dict) -> None:
    _atomic_json(path, state)


def run(args: argparse.Namespace, *, engine: Engine, configured_url: str,
        selector: Callable, auditor: Callable, provider_check: Callable) -> dict:
    """Inject the service for offline tests; production passes the real functions."""
    target = verify_target(args.db_path, configured_url=configured_url, engine=engine)
    try:
        provider_check()  # no network: only verifies effective StepFun routing
    except Exception:
        raise AuditCliError("provider_unavailable", "Configure the primary StepFun key and /step_plan/v1 routing, then retry.") from None
    report_dir = args.report_dir or target.parent / "audit-reports"
    if report_dir.resolve() == target:
        raise AuditCliError("invalid_report_dir", "Choose a directory, not the database file, for --report-dir.")
    try:
        report_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise AuditCliError("report_unwritable", "Choose a writable local --report-dir and retry.") from None
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid4().hex[:8]
    checkpoint = report_dir / f"audit-{run_id}.checkpoint.json"
    level, quiz_type = _scope(args)
    state = {
        "run_id": run_id, "mode": "dry_run" if args.dry_run else "live",
        "repairs_applied": args.apply_repairs_offline,
        "scope": {"level": level, "quiz_type": quiz_type.value if quiz_type else None,
                  "pilot": args.pilot, "explicit_ids": args.question_ids is not None,
                  "force": args.force},
        "bounds": {"batch": args.batch, "workers": args.workers, "max_passes": args.max_passes},
        "backup": None, "stats": dict.fromkeys(STAT_KEYS, 0),
        "selection": {key: [] for key in ("pending", "current", "missing", "out_of_scope")},
        "remaining_ids": None, "pilot_strata": [], "results": [], "passes": 0, "seen_ids": [],
        "selection_changes": [], "in_flight_ids": [],
        "persisted_unresolved": dict.fromkeys(_UNRESOLVED, 0),
        "queue_has_more": None, "write_state": "none", "stop_reason": None,
    }
    read_engine = _readonly_engine(target)
    select_session = sessionmaker(bind=read_engine, autoflush=False)
    audit_session = sessionmaker(bind=read_engine if args.dry_run else engine, autoflush=False)
    seen: set[int] = set()
    intended: list[int] | None = None
    try:
        with select_session() as selection_db:
            if args.question_ids is not None:
                state["selection"] = _classify_ids(selection_db, args, selector)
                intended = list(state["selection"]["pending"])
            elif args.pilot:
                intended, state["pilot_strata"] = _pilot_plan(selection_db, args, selector)
                state["selection"]["pending"] = list(intended)
        if intended is not None:
            state["remaining_ids"] = list(intended)
        # Backup includes the entire live database snapshot, not just selected questions.
        # Manifest and initial checkpoint must both be durable before the first live write.
        if not args.dry_run:
            state["backup"] = backup_database(target, report_dir, run_id)
            state["write_state"] = "backed_up"
        _checkpoint(checkpoint, state)
        for _ in range(args.max_passes):
            with select_session() as selection_db:
                pending = [qid for qid in (intended or []) if qid not in seen][:args.batch] if intended is not None else None
                if intended is not None and not pending:
                    break
                selected = selector(
                    selection_db, level=level, quiz_type=quiz_type, limit=args.batch,
                    force=args.force, question_ids=pending, exclude_ids=seen,
                )
                ids = [row.id for row in selected]
            if len(ids) != len(set(ids)) or len(ids) > args.batch or (pending is not None and not set(ids) <= set(pending)):
                raise AuditCliError("selection_mismatch", "Check the selector's bounded IDs before retrying; no new batch was audited.")
            if pending is not None and len(ids) != len(pending):
                # Do not quietly treat a planned ID that disappeared or changed
                # eligibility as audited. Stop before invoking the service for
                # any part of this batch and retain all unprocessed IDs.
                state["selection_changes"] = [
                    {"question_id": qid, "error_code": "concurrent_change"}
                    for qid in pending if qid not in ids
                ]
                state["stop_reason"] = "concurrent_change"
                _checkpoint(checkpoint, state)
                break
            if not ids:
                break
            seen.update(ids)  # mark before calling the service, including failed IDs
            state["seen_ids"] = sorted(seen)
            state["passes"] += 1
            state["in_flight_ids"] = list(ids)
            # This checkpoint is durable BEFORE the service can commit. After a
            # crash, zero recorded commits must not imply that no write happened.
            if not args.dry_run:
                state["write_state"] = "unknown"
            _checkpoint(checkpoint, state)
            raw_results: list[dict] = []
            try:
                # Fresh, clean session: selection reads were on a different engine/session.
                with audit_session() as audit_db:
                    if audit_db.in_transaction():
                        raise AuditCliError("dirty_session", "Use a fresh audit Session with no active transaction.")
                    stats = auditor(
                        audit_db, batch_size=args.batch, level=level, quiz_type=quiz_type,
                        force=args.force, dry_run=args.dry_run, workers=args.workers,
                        question_ids=ids, exclude_ids=None, result_sink=raw_results,
                        apply_repairs=args.apply_repairs_offline,
                    )
                safe_results = _validate_batch(ids, raw_results, stats, args.dry_run)
            except AuditCliError as exc:
                safe_results = _safe_errors(ids, exc.code)
                state["stop_reason"] = exc.code
                state["write_state"] = "unknown" if not args.dry_run else "none"
            except Exception:
                safe_results = _safe_errors(ids, "service_error")
                state["stop_reason"] = "service_error"
                state["write_state"] = "unknown" if not args.dry_run else "none"
            state["results"].extend(safe_results)
            if state["stop_reason"] is None:
                for key in STAT_KEYS:
                    state["stats"][key] += stats[key]
                state["in_flight_ids"] = []
                if not args.dry_run:
                    state["write_state"] = "committed" if state["stats"]["committed"] else "backed_up"
                if stats["errors"]:
                    state["stop_reason"] = "item_errors"
            else:
                # Callback/statistics cannot establish what the service committed.
                # Keep the in-flight IDs and unknown write state as recovery evidence.
                state["stats"]["audited"] += len(ids)
                state["stats"]["errors"] += len(ids)
            if intended is not None:
                state["remaining_ids"] = [qid for qid in intended if qid not in seen]
            _checkpoint(checkpoint, state)
            if state["stop_reason"] is not None:
                break
        with select_session() as selection_db:
            # Explicit scope includes every requested ID still in the supported
            # level/type scope, including initially current or quarantined rows.
            # Missing and unsupported/out-of-scope IDs are not bank rows to count.
            unresolved_ids = (state["selection"]["pending"] + state["selection"]["current"]
                              if args.question_ids is not None else intended)
            state["persisted_unresolved"] = _unresolved_counts(selection_db, args, unresolved_ids)
            if intended is None:
                state["queue_has_more"] = bool(selector(
                    selection_db, level=level, quiz_type=quiz_type, limit=1,
                    force=args.force, question_ids=None, exclude_ids=seen,
                ))
            else:
                # Remaining eligible IDs are bounded by the explicit/pilot plan.
                state["queue_has_more"] = bool(state["remaining_ids"])
        if state["stop_reason"] is None:
            state["stop_reason"] = "max_passes" if state["queue_has_more"] else "complete"
        _checkpoint(checkpoint, state)
    except Exception:
        if state["stop_reason"] is None:
            state["stop_reason"] = "runner_error"
            if not args.dry_run and state["passes"]:
                state["write_state"] = "unknown"
            _checkpoint(checkpoint, state)
        raise
    finally:
        read_engine.dispose()
    return state


def main(argv: list[str] | None = None, *, engine: Engine | None = None,
         configured_url: str | None = None, selector: Callable | None = None,
         auditor: Callable | None = None, provider_check: Callable | None = None) -> int:
    json_output = argv is not None and "--json" in argv or argv is None and "--json" in sys.argv[1:]
    try:
        args = parse_args(argv)
        if engine is None or configured_url is None:
            from app.db import engine as configured_engine
            from app.settings import settings
            engine = configured_engine if engine is None else engine
            configured_url = settings.database_url if configured_url is None else configured_url
        if selector is None or auditor is None or provider_check is None:
            from app.services.qa_audit_service import (
                audit_questions, check_audit_provider, questions_needing_audit,
            )
            selector = selector or questions_needing_audit
            auditor = auditor or audit_questions
            provider_check = provider_check or check_audit_provider
        state = run(args, engine=engine, configured_url=configured_url,
                    selector=selector, auditor=auditor, provider_check=provider_check)
        summary = {key: state[key] for key in ("run_id", "mode", "passes", "stop_reason",
                                                "write_state", "stats", "persisted_unresolved", "queue_has_more")}
        if json_output:
            print(json.dumps(summary, sort_keys=True))
        else:
            print(f"Audit {summary['stop_reason']}; passes={summary['passes']} "
                  f"audited={summary['stats']['audited']} errors={summary['stats']['errors']} "
                  f"persisted_unresolved={sum(summary['persisted_unresolved'].values())} "
                  f"run_id={summary['run_id']}")
        if state["stop_reason"] not in ("complete", "max_passes"):
            print("Error: audit stopped. Fix: inspect this run's checkpoint and verified backup before retrying.", file=sys.stderr)
            return 1
        if state["stop_reason"] == "max_passes":
            print("Audit limit reached; select another bounded run after reviewing the checkpoint.", file=sys.stderr)
        return 0
    except AuditCliError as exc:
        print(f"Error [{exc.code}]. Fix: {exc.fix}", file=sys.stderr)
        return 2
    except (OSError, sqlite3.Error):
        print("Error [filesystem_error]. Fix: check local bank/report permissions and the checkpoint before retrying.", file=sys.stderr)
        return 2
    except Exception:
        print("Error [runner_error]. Fix: inspect the checkpoint and verified backup before retrying; no raw provider response is printed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
