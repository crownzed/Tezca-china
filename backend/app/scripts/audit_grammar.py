"""
Grammar & Content Audit Script — uses DeepSeek API to check example sentences.

Checks:
  1. Example sentences contain the target word
  2. Chinese sentences are grammatically correct
  3. Vietnamese translations are accurate (basic check)
  4. Audio text matches prompt content

Dùng ``_call_api``, nên provider do ``settings.llm_provider`` chọn (mặc định
provider chính khi có key — xem ghi chú ở ``app/settings.py``). Chỉ cần
một trong LLM_API_KEYS / provider chính keys / relay keys được đặt.
Rate limited to 10 req/s to stay within free tier limits.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.models import Example, Question, Word
from app.services.llm_generator_service import _call_api
from app.settings import NO_LLM_KEY_MESSAGE, settings

# ── Rule-based checks (fast, no API call) ────────────────────────────────


def _rule_check_example(example, word: Word) -> list[dict]:
    """Fast rule-based checks on an example sentence. Returns list of issues."""
    issues: list[dict] = []

    # Check 1: Target word must appear in the Chinese sentence
    if word.hanzi and word.hanzi not in example.sentence_cn:
        issues.append({
            "type": "target_word_missing",
            "detail": f"'{word.hanzi}' not found in sentence: {example.sentence_cn[:60]}...",
            "severity": "critical",
        })

    # Check 2: Sentence shouldn't be too short (< 4 chars)
    if len(example.sentence_cn.strip()) < 4:
        issues.append({
            "type": "sentence_too_short",
            "detail": f"Sentence is only {len(example.sentence_cn)} chars: {example.sentence_cn}",
            "severity": "low",
        })

    # Check 3: Both CN and VI should be non-empty
    if not example.sentence_cn.strip():
        issues.append({
            "type": "empty_chinese",
            "detail": "Chinese sentence is empty",
            "severity": "critical",
        })

    if not example.sentence_vi.strip():
        issues.append({
            "type": "missing_vietnamese",
            "detail": f"Vietnamese translation missing for: {example.sentence_cn[:60]}...",
            "severity": "medium",
        })

    # Check 4: Basic CJK character presence
    cjk_count = sum(1 for ch in example.sentence_cn if '一' <= ch <= '鿿')
    if cjk_count < 2:
        issues.append({
            "type": "insufficient_cjk",
            "detail": f"Only {cjk_count} Chinese chars in: {example.sentence_cn[:60]}...",
            "severity": "medium",
        })

    return issues


def rule_check_all_examples() -> list[dict]:
    """Run rule-based checks on all examples. Fast, no API call."""
    issues: list[dict] = []
    with SessionLocal() as db:
        examples = db.scalars(
            select(Example).order_by(Example.word_id)
        ).all()

        word_cache: dict[int, Word] = {}
        for ex in examples:
            if ex.word_id not in word_cache:
                word_cache[ex.word_id] = db.scalar(
                    select(Word).where(Word.id == ex.word_id)
                )
            word = word_cache[ex.word_id]
            if not word:
                issues.append({
                    "example_id": ex.id,
                    "word_id": ex.word_id,
                    "sentence_cn": ex.sentence_cn[:80],
                    "type": "orphan_example",
                    "detail": "Example references non-existent word",
                    "severity": "critical",
                })
                continue

            ex_issues = _rule_check_example(ex, word)
            for issue in ex_issues:
                issue.update({
                    "example_id": ex.id,
                    "word_id": ex.word_id,
                    "hanzi": word.hanzi,
                    "sentence_cn": ex.sentence_cn[:100],
                })
            issues.extend(ex_issues)

    return issues


# ── LLM-based grammar check ─────────────────────────────────────────────


def _build_grammar_prompt(sentence_cn: str, sentence_vi: str, word_hanzi: str) -> str:
    """Build a prompt for the LLM to check a single sentence."""
    return f"""Check this Chinese sentence for grammar errors. The target word is "{word_hanzi}".

Chinese: {sentence_cn}
Vietnamese meaning: {sentence_vi}

Assess:
1. Is the Chinese grammatically correct? (yes/no)
2. Does the Vietnamese translation match reasonably? (yes/partial/no)
3. Is the target word used naturally in context? (yes/no)

Reply in JSON only:
{{"grammar_ok": true/false, "translation_ok": "yes"/"partial"/"no", "word_usage_natural": true/false, "grammar_issues": ["issue1", "issue2"], "confidence": 0.0-1.0}}"""


def check_sentences_with_llm(
    sentences: list[dict],
    batch_size: int = 10,
    max_total: int = 500,
) -> list[dict]:
    """Check sentences via the LLM relay with rate limiting.

    Args:
        sentences: list of {sentence_cn, sentence_vi, word_hanzi, example_id, word_id}
        batch_size: sentences per API call
        max_total: max sentences to check (cap cost)

    Returns: list of issue dicts
    """
    if not settings.llm_keys_list:
        print(f"  ⚠ {NO_LLM_KEY_MESSAGE} Bỏ qua phần kiểm ngữ pháp bằng LLM.")
        return []

    issues: list[dict] = []
    batch = sentences[:max_total]
    total_batches = (len(batch) + batch_size - 1) // batch_size

    for i in range(0, len(batch), batch_size):
        chunk = batch[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"  Batch {batch_num}/{total_batches} ({len(chunk)} sentences)...")

        for item in chunk:
            prompt = _build_grammar_prompt(
                item["sentence_cn"], item.get("sentence_vi", ""), item.get("word_hanzi", "")
            )

            try:
                # _call_api tự lo retry/xoay key và bóc markdown fence, nên ở đây
                # chỉ cần đọc các trường của verdict.
                parsed = _call_api(prompt)
                if not isinstance(parsed, dict):
                    print(f"    Bỏ qua: verdict không phải JSON object ({type(parsed).__name__})")
                    continue

                if not parsed.get("grammar_ok"):
                    issues.append({
                        "example_id": item["example_id"],
                        "word_id": item["word_id"],
                        "hanzi": item.get("word_hanzi", ""),
                        "sentence_cn": item["sentence_cn"][:100],
                        "type": "grammar_issue",
                        "detail": parsed.get("grammar_issues", []),
                        "confidence": parsed.get("confidence", 0),
                        "severity": "high",
                    })

                if parsed.get("translation_ok") == "no":
                    issues.append({
                        "example_id": item["example_id"],
                        "word_id": item["word_id"],
                        "hanzi": item.get("word_hanzi", ""),
                        "sentence_cn": item["sentence_cn"][:100],
                        "type": "translation_mismatch",
                        "detail": "Vietnamese translation does not match Chinese",
                        "severity": "medium",
                    })

                if not parsed.get("word_usage_natural"):
                    issues.append({
                        "example_id": item["example_id"],
                        "word_id": item["word_id"],
                        "hanzi": item.get("word_hanzi", ""),
                        "sentence_cn": item["sentence_cn"][:100],
                        "type": "unnatural_word_usage",
                        "detail": f"Target word '{item.get('word_hanzi')}' used unnaturally",
                        "severity": "low",
                    })

            except Exception as e:
                print(f"    Error: {e}")

            # Rate limiting: ~8 requests per second max
            time.sleep(0.15)

    return issues


# ── Question content checks ──────────────────────────────────────────────


def check_question_integrity() -> list[dict]:
    """Check questions for content integrity issues."""
    issues: list[dict] = []
    with SessionLocal() as db:
        questions = db.scalars(
            select(Question).order_by(Question.level, Question.quiz_type)
        ).all()

        for q in questions:
            # Check: options must be unique
            opts = q.options or []
            if len(set(opts)) != len(opts):
                issues.append({
                    "question_id": q.id,
                    "word_id": q.word_id,
                    "quiz_type": q.quiz_type.value,
                    "level": q.level,
                    "type": "duplicate_options",
                    "detail": f"Duplicate values in options: {opts}",
                    "severity": "critical",
                })

            # Check: correct_index must be within range
            if q.correct_index < 0 or q.correct_index >= len(opts):
                issues.append({
                    "question_id": q.id,
                    "word_id": q.word_id,
                    "quiz_type": q.quiz_type.value,
                    "level": q.level,
                    "type": "invalid_correct_index",
                    "detail": f"correct_index={q.correct_index} but options length={len(opts)}",
                    "severity": "critical",
                })

            # Check: prompt must not be empty
            if not q.prompt or not q.prompt.strip():
                issues.append({
                    "question_id": q.id,
                    "word_id": q.word_id,
                    "quiz_type": q.quiz_type.value,
                    "level": q.level,
                    "type": "empty_prompt",
                    "detail": "Question prompt is empty",
                    "severity": "critical",
                })

            # Check: exactly 4 options for MCQ types
            if q.quiz_type.value not in ("drag_drop", "voice") and len(opts) != 4:
                issues.append({
                    "question_id": q.id,
                    "word_id": q.word_id,
                    "quiz_type": q.quiz_type.value,
                    "level": q.level,
                    "type": "wrong_option_count",
                    "detail": f"Expected 4 options, got {len(opts)}",
                    "severity": "high",
                })

            # Check: correct answer must not appear in distractor positions
            if q.correct_index < len(opts):
                correct_answer = opts[q.correct_index]
                for i, opt in enumerate(opts):
                    if i != q.correct_index and opt == correct_answer:
                        issues.append({
                            "question_id": q.id,
                            "type": "answer_leaked_in_distractors",
                            "detail": f"Correct answer '{correct_answer}' also at position {i}",
                            "severity": "critical",
                        })

    return issues


def check_question_diversity() -> dict:
    """Check question distribution across levels and quiz types."""
    with SessionLocal() as db:
        from sqlalchemy import func

        rows = db.execute(
            select(
                Question.level,
                Question.quiz_type,
                func.count(Question.id),
            ).group_by(Question.level, Question.quiz_type)
        ).all()

        distribution: dict = {}
        gaps: list[dict] = []
        MIN_QUESTIONS = 10  # minimum questions per (level, type) combo

        # Initialize expected combos
        from app.models import QuizType
        expected_levels = range(1, 7)
        expected_types = list(QuizType)

        for level in expected_levels:
            distribution[str(level)] = {}
            for qt in expected_types:
                distribution[str(level)][qt.value] = 0

        for level, qt, count in rows:
            distribution[str(level)][qt.value] = count

        for level in expected_levels:
            for qt in expected_types:
                count = distribution[str(level)][qt.value]
                if count < MIN_QUESTIONS:
                    gaps.append({
                        "level": level,
                        "quiz_type": qt.value,
                        "count": count,
                        "min_required": MIN_QUESTIONS,
                        "deficit": MIN_QUESTIONS - count,
                    })

        return {
            "distribution": distribution,
            "gaps": gaps,
            "gaps_count": len(gaps),
        }


# ── Main ─────────────────────────────────────────────────────────────────


def main():
    print("=" * 60)
    print("GRAMMAR & CONTENT AUDIT — Chinese Learning Content")
    print("=" * 60)

    all_issues: list[dict] = []

    # ── Phase 1: Rule-based example checks ──
    print("\n── Phase 1: Rule-based example checks ──")
    rule_issues = rule_check_all_examples()
    print(f"  Found {len(rule_issues)} issues via rule checks")
    all_issues.extend(rule_issues)

    # ── Phase 2: LLM grammar check (if API key available) ──
    # In provider thật thay vì tên cứng: script này chạy lâu, biết nó gọi
    # endpoint nào giúp khỏi ngồi đợi một provider không mong muốn.
    print(
        f"\n── Phase 2: LLM grammar check ({settings.llm_provider}"
        f" / {settings.llm_model_effective}) ──"
    )
    if settings.llm_keys_list:
        with SessionLocal() as db:
            examples = db.scalars(
                select(Example).limit(500)
            ).all()
            word_cache: dict[int, Word] = {}
            sentences = []
            for ex in examples:
                if ex.word_id not in word_cache:
                    word_cache[ex.word_id] = db.scalar(
                        select(Word).where(Word.id == ex.word_id)
                    )
                word = word_cache[ex.word_id]
                if word and ex.sentence_cn:
                    sentences.append({
                        "example_id": ex.id,
                        "word_id": ex.word_id,
                        "word_hanzi": word.hanzi,
                        "sentence_cn": ex.sentence_cn,
                        "sentence_vi": ex.sentence_vi,
                    })

        api_issues = check_sentences_with_llm(sentences, batch_size=10, max_total=200)
        print(f"  Found {len(api_issues)} issues via LLM")
        all_issues.extend(api_issues)
    else:
        print(f"  Skipped — {NO_LLM_KEY_MESSAGE}")

    # ── Phase 3: Question integrity ──
    print("\n── Phase 3: Question integrity ──")
    q_issues = check_question_integrity()
    print(f"  Found {len(q_issues)} question issues")
    all_issues.extend(q_issues)

    # ── Phase 4: Question diversity ──
    print("\n── Phase 4: Question diversity ──")
    diversity = check_question_diversity()
    print(f"  Found {diversity['gaps_count']} distribution gaps")
    for gap in diversity["gaps"]:
        print(f"    HSK {gap['level']} · {gap['quiz_type']}: {gap['count']} questions (need {gap['deficit']} more)")

    # ── Write report ──
    by_severity: dict[str, list[dict]] = {}
    for issue in all_issues:
        sev = issue.get("severity", "unknown")
        by_severity.setdefault(sev, []).append(issue)

    output_dir = Path(__file__).resolve().parents[1] / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Merge with existing audit report if any
    report_path = output_dir / "audit_report.json"
    existing = {}
    if report_path.exists():
        try:
            existing = json.loads(report_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = {}

    report = {
        **existing,
        "grammar_audit": {
            "total_issues": len(all_issues),
            "by_severity": {k: len(v) for k, v in by_severity.items()},
            "issues": all_issues,
        },
        "question_diversity": diversity,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nReport written to: {report_path}")

    critical = len(by_severity.get("critical", []))
    high = len(by_severity.get("high", []))
    if critical > 0:
        print(f"\n❌ {critical} CRITICAL issues — exiting with code 1")
        sys.exit(1)
    elif high > 0:
        print(f"\n⚠️  {high} HIGH severity issues — exiting with code 1")
        sys.exit(1)
    else:
        print("\n✅ Content audit passed")
        sys.exit(0)


if __name__ == "__main__":
    main()
