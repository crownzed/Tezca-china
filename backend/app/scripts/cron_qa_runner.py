"""
Cron QA Runner — aggregates all content quality checks.

Called by GitHub Actions cron (every 8 hours) or manually:
    python backend/app/scripts/cron_qa_runner.py

Checks performed:
  1. Pinyin accuracy audit
  2. Grammar & content audit (rule-based + DeepSeek)
  3. Question integrity & diversity
  4. Health metrics (DB stats)

Exits non-zero if critical/high severity issues found.
Optionally sends Slack alert on failure.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal, engine
from sqlalchemy import func, select, text

from app.models import Example, Question, QuizAttempt, UserProgress, Word


def health_metrics() -> dict:
    """Collect DB health metrics."""
    with SessionLocal() as db:
        word_count = db.scalar(select(func.count(Word.id))) or 0
        example_count = db.scalar(select(func.count(Example.id))) or 0
        question_count = db.scalar(select(func.count(Question.id))) or 0
        attempt_count = db.scalar(select(func.count(QuizAttempt.id))) or 0
        user_count = db.scalar(select(func.count(UserProgress.user_id.distinct()))) or 0

        # Questions per level
        level_dist = {}
        rows = db.execute(
            select(Question.level, func.count(Question.id)).group_by(Question.level)
        ).all()
        for level, count in rows:
            level_dist[f"HSK_{level}"] = count

        # DB connection check
        try:
            db.execute(text("SELECT 1"))
            db_connected = True
        except Exception:
            db_connected = False

        return {
            "db_connected": db_connected,
            "word_count": word_count,
            "example_count": example_count,
            "question_count": question_count,
            "total_attempts": attempt_count,
            "unique_users": user_count,
            "questions_per_level": level_dist,
        }


def run_pinyin_audit() -> dict:
    """Run pinyin audit and return result dict."""
    from app.scripts.audit_pinyin import audit_pinyin
    errors = audit_pinyin()
    by_severity: dict[str, int] = {}
    for err in errors:
        sev = err.get("severity", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1
    return {
        "passed": not any(
            err["severity"] in ("critical", "high") for err in errors
        ),
        "total_errors": len(errors),
        "by_severity": by_severity,
        "errors": errors[:50],  # truncate for report size
    }


def run_grammar_audit() -> dict:
    """Run rule-based grammar checks. Returns result dict."""
    from app.scripts.audit_grammar import (
        check_question_integrity,
        check_question_diversity,
        rule_check_all_examples,
    )

    rule_issues = rule_check_all_examples()
    q_issues = check_question_integrity()
    diversity = check_question_diversity()

    all_issues = rule_issues + q_issues
    by_severity: dict[str, int] = {}
    for issue in all_issues:
        sev = issue.get("severity", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1

    return {
        "passed": not any(
            i["severity"] in ("critical", "high") for i in all_issues
        ),
        "total_issues": len(all_issues),
        "by_severity": by_severity,
        "diversity_gaps": diversity["gaps_count"],
        "issues": all_issues[:50],
    }


def send_slack_alert(report: dict) -> bool:
    """Send alert to Slack webhook if configured. Returns True if sent."""
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        return False

    critical = sum(
        report.get("checks", {}).get(k, {}).get("by_severity", {}).get("critical", 0)
        for k in ["pinyin", "grammar"]
    )
    high = sum(
        report.get("checks", {}).get(k, {}).get("by_severity", {}).get("high", 0)
        for k in ["pinyin", "grammar"]
    )

    total_errors = critical + high
    if total_errors == 0:
        return False

    message = {
        "text": f"🚨 *Tezca Content QA Failed*\n"
                f"• Critical: {critical}\n"
                f"• High: {high}\n"
                f"• Run: {report.get('run_id', 'unknown')}\n"
                f"• Time: {report.get('generated_at', 'unknown')}",
    }

    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(message).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f"  ⚠ Slack alert failed: {e}")
        return False


def main():
    start_time = time.time()
    print("=" * 60)
    print("CRON QA RUNNER — Tezca China Content Quality")
    print("=" * 60)

    run_id = f"qa-{time.strftime('%Y-%m-%dT%H%M%SZ', time.gmtime())}"
    print(f"Run ID: {run_id}")

    report: dict = {
        "run_id": run_id,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "checks": {},
    }

    # ── Check 1: Health metrics ──
    print("\n── Check 1: Health metrics ──")
    health = health_metrics()
    print(f"  DB connected: {health['db_connected']}")
    print(f"  Words: {health['word_count']} | Examples: {health['example_count']}")
    print(f"  Questions: {health['question_count']} | Users: {health['unique_users']}")
    report["health"] = health

    if not health["db_connected"]:
        print("  ❌ Database connection failed — aborting")
        report["status"] = "failed"
        sys.exit(1)

    # ── Check 2: Pinyin audit ──
    print("\n── Check 2: Pinyin audit ──")
    pinyin_result = run_pinyin_audit()
    print(f"  Passed: {pinyin_result['passed']}")
    print(f"  Errors: {pinyin_result['total_errors']} ({pinyin_result['by_severity']})")
    report["checks"]["pinyin"] = pinyin_result

    # ── Check 3: Grammar & content ──
    print("\n── Check 3: Grammar & content ──")
    grammar_result = run_grammar_audit()
    print(f"  Passed: {grammar_result['passed']}")
    print(f"  Issues: {grammar_result['total_issues']} ({grammar_result['by_severity']})")
    print(f"  Question diversity gaps: {grammar_result['diversity_gaps']}")
    report["checks"]["grammar"] = grammar_result

    # ── Determine overall status ──
    all_passed = (
        pinyin_result["passed"]
        and grammar_result["passed"]
    )
    report["status"] = "passed" if all_passed else "failed"

    # ── Duration ──
    elapsed_ms = int((time.time() - start_time) * 1000)
    report["duration_ms"] = elapsed_ms
    print(f"\nDuration: {elapsed_ms}ms")

    # ── Write report ──
    output_dir = Path(__file__).resolve().parents[1] / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "qa_report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Report: {report_path}")

    # ── Alert on failure ──
    if not all_passed:
        print("\n── Sending alerts ──")
        sent = send_slack_alert(report)
        print(f"  Slack alert: {'sent' if sent else 'not configured / skipped'}")
        print(f"\n❌ QA FAILED — exiting with code 1")
        sys.exit(1)
    else:
        print("\n✅ QA PASSED — all checks clear")
        sys.exit(0)


if __name__ == "__main__":
    main()
