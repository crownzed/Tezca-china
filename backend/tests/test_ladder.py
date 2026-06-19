"""Test cho Retrieval Ladder Engine — logic thuần, không cần DB."""

import unittest

from app.services.retrieval_ladder_service import (
    LADDER,
    MAX_QUIZ_LEVEL,
    PRODUCTION_CHANNEL,
    _base_level_from_stability,
    describe_level,
    retrieval_level,
    rung_for_level,
)


# Kỹ năng nền đầy đủ để không bị trần kéo xuống (test stability thuần).
_STRONG = dict(mastery=100, accuracy_pct=100, recent_error_count=0, context_score=100, production_score=100)


class LadderShapeTest(unittest.TestCase):
    def test_eight_rungs_levels_1_to_8(self):
        self.assertEqual([r.level for r in LADDER], list(range(1, 9)))

    def test_rungs_unique_and_lookup(self):
        for level in range(1, 9):
            self.assertEqual(rung_for_level(level).level, level)

    def test_rung_clamps_out_of_range(self):
        self.assertEqual(rung_for_level(0).level, 1)
        self.assertEqual(rung_for_level(99).level, 8)

    def test_top_two_rungs_are_production(self):
        self.assertEqual(LADDER[6].mode, PRODUCTION_CHANNEL)
        self.assertEqual(LADDER[7].mode, PRODUCTION_CHANNEL)
        # Các bậc <= L6 là trắc nghiệm sinh được.
        for rung in LADDER[:MAX_QUIZ_LEVEL]:
            self.assertNotEqual(rung.mode, PRODUCTION_CHANNEL)


class BaseStabilityTest(unittest.TestCase):
    def test_new_word_starts_low(self):
        self.assertEqual(_base_level_from_stability(0, 0), 1)
        self.assertEqual(_base_level_from_stability(1, 0), 1)

    def test_climbs_with_interval(self):
        levels = [
            _base_level_from_stability(2, 2),
            _base_level_from_stability(7, 3),
            _base_level_from_stability(14, 4),
            _base_level_from_stability(30, 5),
            _base_level_from_stability(60, 6),
        ]
        self.assertEqual(levels, sorted(levels))
        self.assertEqual(levels[-1], 8)

    def test_monotonic_non_decreasing(self):
        prev = 0
        for interval in range(0, 60):
            cur = _base_level_from_stability(interval, 5)
            self.assertGreaterEqual(cur, prev)
            prev = cur


class RetrievalLevelTest(unittest.TestCase):
    def test_strong_long_interval_reaches_production(self):
        level = retrieval_level(interval_days=60, repetition=8, **_STRONG)
        self.assertGreaterEqual(level, 7)

    def test_skill_gate_caps_production(self):
        # Stability cao nhưng production_score thấp → không lên L7/L8.
        level = retrieval_level(
            interval_days=60, repetition=8,
            mastery=100, accuracy_pct=100, recent_error_count=0,
            context_score=100, production_score=10,
        )
        self.assertLessEqual(level, 6)

    def test_context_gate_caps_mid(self):
        # Chưa vững ngữ cảnh → trần L4.
        level = retrieval_level(
            interval_days=60, repetition=8,
            mastery=50, accuracy_pct=100, recent_error_count=0,
            context_score=10, production_score=0,
        )
        self.assertLessEqual(level, 4)

    def test_weak_word_demoted(self):
        strong = retrieval_level(interval_days=14, repetition=4, **_STRONG)
        weak = retrieval_level(
            interval_days=14, repetition=4,
            mastery=100, accuracy_pct=40, recent_error_count=3,
            context_score=100, production_score=100,
        )
        self.assertLess(weak, strong)
        self.assertGreaterEqual(weak, 1)

    def test_always_in_range(self):
        for interval in (0, 1, 5, 20, 100):
            for acc in (0, 50, 100):
                for err in (0, 5):
                    level = retrieval_level(
                        interval_days=interval, repetition=interval // 3,
                        mastery=80, accuracy_pct=acc, recent_error_count=err,
                        context_score=60, production_score=60,
                    )
                    self.assertGreaterEqual(level, 1)
                    self.assertLessEqual(level, 8)


class DescribeLevelTest(unittest.TestCase):
    def test_describe_returns_full_shape(self):
        out = describe_level(interval_days=0, repetition=0, mastery=0, accuracy_pct=0,
                             recent_error_count=0, context_score=0, production_score=0)
        self.assertEqual(set(out.keys()), {"level", "label", "mode", "skill", "is_production"})
        self.assertEqual(out["level"], 1)
        self.assertFalse(out["is_production"])

    def test_production_flag_at_top(self):
        out = describe_level(interval_days=60, repetition=8, mastery=100, accuracy_pct=100,
                             recent_error_count=0, context_score=100, production_score=100)
        self.assertTrue(out["is_production"])
        self.assertEqual(out["mode"], PRODUCTION_CHANNEL)


if __name__ == "__main__":
    unittest.main()
