"""Offline regression tests for the quiz QA serving gate.

All rows and queries are mocked: no database, background generation, or LLM calls.
"""

from copy import deepcopy
from datetime import datetime, timezone
import unittest
from unittest.mock import Mock, patch

from app.models import Question, QuizType, Word
from app.services.question_quality import (
    AGENT_VERSIONS,
    AUDIT_VERSION,
    RUBRIC_VERSION,
    content_fingerprint,
    context_fingerprint,
    question_word_context,
    question_is_approved,
)
from app.services.quiz_service import (
    QuizService,
    _inject_stage_confusable,
    _inject_user_distractors,
)


def _question(question_id: int, *, status: str | None = None, source: str = "template") -> Question:
    question = Question(
        word_id=1,
        level=1,
        quiz_type=QuizType.vocab,
        prompt=f"Chọn nghĩa đúng của: 低 ({question_id})",
        options=["thấp", "cao", "dài", "ngắn"],
        correct_index=0,
        explanation="giải thích",
        audio_text="",
        metadata_json={"source": source, "option_word_ids": [1, 2, 3, 4]},
    )
    question.id = question_id
    word = Word(hanzi="低", pinyin="dī", meaning_vi="thấp", hsk_level=1, pos="")
    word.id = 1
    word.examples = []
    question.word = word
    question.word_id = 1

    if status is not None:
        question.metadata_json["qa_status"] = status
    return question


def _approve(question: Question) -> Question:
    question.metadata_json.update({
        "qa_status": "approved",
        "qa_verdict": "pass",
        "qa_error_code": None,
        "qa_audit_version": AUDIT_VERSION,
        "qa_rubric_version": RUBRIC_VERSION,
        "qa_agent_versions": dict(AGENT_VERSIONS),
        "qa_audited_at": datetime.now(timezone.utc).isoformat(),
    })
    question.metadata_json["qa_content_fingerprint"] = content_fingerprint(question)
    question.metadata_json["qa_context_fingerprint"] = context_fingerprint(question_word_context(question))
    assert question_is_approved(question)
    return question


def _word(word_id: int, hanzi: str, meaning: str, confusables: list[str] | None = None) -> Word:
    word = Word(hanzi=hanzi, pinyin="py", meaning_vi=meaning, hsk_level=1)
    word.id = word_id
    word.confusable_words_json = confusables or []
    return word


class QuizQAServingTest(unittest.TestCase):
    def _serve(self, rows: list[Question], *, limit: int = 3, blend=None):
        """Exercise get_quiz without making any real database or network calls."""
        db = Mock()
        db.scalars.return_value.all.return_value = rows
        with (
            patch("app.services.quiz_service.QuestionGeneratorService") as generator,
            patch("app.services.quiz_service.threading.Thread") as thread,
            patch("app.services.quiz_service._ai_available", return_value=False),
            patch.object(QuizService, "_personalize_distractors"),
        ):
            service = QuizService(db)
            service._recent_question_id_sets = Mock(return_value=(set(), set()))
            service._progress_by_word = Mock(return_value={})
            service._difficulty_stats = Mock(return_value={})
            # Keep the incoming order so an initially higher-ranked legacy item
            # makes approved preference observable and reproducible.
            service._rank_questions = Mock(side_effect=lambda items, *_: list(items))
            if blend is not None:
                service._blend_ai_template = Mock(side_effect=blend)
            selected = service.get_quiz("test-user", 1, QuizType.vocab, limit)
            generator.return_value.ensure_questions.assert_called_once()
            thread.return_value.start.assert_called_once()
            return selected, service

    def test_unreviewed_and_stale_approved_never_enter_rank_or_selection(self):
        legacy = _question(1)
        approved = _approve(_question(2))
        stale = _approve(_question(3))
        stale.options = ["sai", *stale.options[1:]]  # invalidate signed content
        rejected = [_question(10 + i, status=status) for i, status in enumerate(
            ("needs_review", "quarantined", "error", "draft")
        )]
        legacy_failed = _question(20)
        legacy_failed.metadata_json["qa_verdict"] = "fail"
        unsigned_approved = _question(21, status="approved")  # thiếu audit/fingerprint
        selected, service = self._serve(
            [legacy, stale, *rejected, legacy_failed, unsigned_approved, approved], limit=10
        )
        self.assertEqual({q.id for q in selected}, {legacy.id, approved.id})
        self.assertEqual(service._rank_questions.call_args.args[0], [legacy, approved])

    def test_valid_approved_precedes_higher_ranked_legacy_and_legacy_fills_shortage(self):
        legacy_a, legacy_b = _question(1), _question(2)
        approved = _approve(_question(3))
        selected, _ = self._serve([legacy_a, legacy_b, approved], limit=3)
        self.assertEqual([q.id for q in selected], [3, 1, 2])

    def test_no_approved_items_still_serves_legacy_bank(self):
        legacy_a, legacy_b = _question(1), _question(2)
        selected, _ = self._serve([legacy_a, legacy_b], limit=2)
        self.assertEqual([q.id for q in selected], [1, 2])

    def test_legacy_does_not_displace_enough_approved_items(self):
        approved = [_approve(_question(2)), _approve(_question(3))]
        selected, _ = self._serve([_question(1), *approved], limit=2)
        self.assertEqual([q.id for q in selected], [2, 3])

    def test_fallback_rechecks_qa_and_keeps_approved_preference(self):
        approved = _approve(_question(3))
        legacy = _question(1)
        rejected = _question(2, status="needs_review")
        # Force the shortage path; the candidate gate and the fallback must
        # independently keep rejected rows out of the response.
        selected, service = self._serve(
            [legacy, rejected, approved], limit=3, blend=lambda *_args, **_kwargs: []
        )
        self.assertEqual([q.id for q in selected], [3, 1])
        self.assertEqual(service._rank_questions.call_args.args[0], [legacy, approved])

    def test_fallback_rechecks_status_when_candidate_changes_after_filter(self):
        approved = _approve(_question(1))
        legacy = _question(2)

        def mark_quarantined(*_args, **_kwargs):
            legacy.metadata_json["qa_status"] = "quarantined"
            return []

        selected, _ = self._serve([legacy, approved], limit=2, blend=mark_quarantined)
        self.assertEqual([q.id for q in selected], [1])

    def test_ai_blend_quota_continues_across_approved_then_legacy(self):
        approved = [
            _approve(_question(1, source="ai_practice_llm")),
            _approve(_question(2, source="ai_practice_llm")),
        ]
        legacy_ai = [
            _question(3, source="ai_practice_llm"),
            _question(4, source="ai_practice_llm"),
        ]
        legacy_templates = [_question(5), _question(6), _question(7)]
        selected, _ = self._serve([*legacy_ai, *legacy_templates, *approved], limit=6)
        self.assertEqual({q.id for q in selected[:2]}, {1, 2})
        self.assertEqual({q.id for q in selected}, {1, 2, 3, 5, 6, 7})

    def test_only_rejected_questions_returns_empty_quiz(self):
        selected, service = self._serve([_question(1, status="draft")])
        self.assertEqual(selected, [])
        service._rank_questions.assert_not_called()


class ApprovedContentImmutabilityTest(unittest.TestCase):
    def test_user_and_stage_swaps_leave_approved_content_and_fingerprint_intact(self):
        question = _approve(_question(1))
        before_options = deepcopy(question.options)
        before_metadata = deepcopy(question.metadata_json)
        target = _word(1, "低", "thấp", confusables=["矮"])
        distractor = _word(9, "矮", "thấp hơn")

        _inject_user_distractors(question, {1: [9]}, {9: distractor})
        _inject_stage_confusable(question, target, "MASTERED", {"矮": distractor})

        self.assertEqual(question.options, before_options)
        self.assertEqual(question.metadata_json, before_metadata)
        self.assertTrue(question_is_approved(question))


if __name__ == "__main__":
    unittest.main()
