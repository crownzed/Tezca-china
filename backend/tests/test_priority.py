"""Test tất định cho priority_service (Weighted Priority Queue + FSRS-lite).

Chạy: cd backend && .venv/bin/python -m unittest tests.test_priority -v
Không cần DB — chỉ kiểm tra logic thuần.
"""

import unittest

from app.services.priority_service import (
    WEIGHTS,
    extract_features,
    priority_score,
    retrievability,
)


class RetrievabilityTest(unittest.TestCase):
    def test_full_recall_when_no_time_elapsed(self):
        # Vừa ôn xong (elapsed=0) -> nhớ gần như hoàn hảo.
        self.assertAlmostEqual(retrievability(7, 0), 1.0, places=6)

    def test_decays_over_time(self):
        # Càng để lâu càng dễ quên.
        r_short = retrievability(7, 3)
        r_long = retrievability(7, 30)
        self.assertGreater(r_short, r_long)

    def test_higher_stability_retains_better(self):
        # Cùng thời gian trôi, stability cao thì nhớ tốt hơn.
        self.assertGreater(retrievability(30, 10), retrievability(3, 10))

    def test_bounded_0_1(self):
        for s in (0.1, 1, 7, 45):
            for t in (0, 1, 100, 1000):
                r = retrievability(s, t)
                self.assertGreaterEqual(r, 0.0)
                self.assertLessEqual(r, 1.0)

    def test_handles_zero_stability(self):
        # Không chia cho 0 (clamp tối thiểu).
        r = retrievability(0, 10)
        self.assertGreaterEqual(r, 0.0)
        self.assertLessEqual(r, 1.0)


class PriorityScoreTest(unittest.TestCase):
    def test_weights_sum_matches_doc(self):
        # Trọng số dương cộng lại = 0.95, penalty = -0.05.
        positives = sum(v for v in WEIGHTS.values() if v > 0)
        self.assertAlmostEqual(positives, 0.95, places=6)
        self.assertAlmostEqual(WEIGHTS["recent_repeat_penalty"], -0.05, places=6)

    def test_all_max_features(self):
        feats = {k: 1.0 for k in WEIGHTS}
        # due+forget+error+goal+novelty+habit - penalty = 0.95 - 0.05 = 0.90
        self.assertAlmostEqual(priority_score(feats), 0.90, places=6)

    def test_penalty_lowers_score(self):
        base = {k: 0.5 for k in WEIGHTS}
        base["recent_repeat_penalty"] = 0.0
        penalized = dict(base)
        penalized["recent_repeat_penalty"] = 1.0
        self.assertLess(priority_score(penalized), priority_score(base))

    def test_missing_feature_treated_as_zero(self):
        # Thiếu key -> coi như 0, không lỗi.
        self.assertAlmostEqual(priority_score({"due_urgency": 1.0}), 0.35, places=6)


class ExtractFeaturesTest(unittest.TestCase):
    def test_never_seen_word_low_urgency_high_novelty(self):
        f = extract_features(
            seen=0, wrong=0, interval_days=1,
            elapsed_days=None, overdue_days=None,
            recent_error_count=0, word_level=1, focus_level=1,
            frequency_band="core_hsk",
        )
        self.assertEqual(f.due_urgency, 0.0)
        self.assertEqual(f.forgetting_risk, 0.0)
        self.assertEqual(f.novelty_need, 1.0)

    def test_overdue_word_high_urgency(self):
        # Đã trôi 10 ngày trên khoảng ôn 5 ngày -> due_urgency cao (clamp 1).
        f = extract_features(
            seen=5, wrong=1, interval_days=5,
            elapsed_days=10, overdue_days=5,
            recent_error_count=0, word_level=1, focus_level=1,
            frequency_band="core_hsk",
        )
        self.assertEqual(f.due_urgency, 1.0)
        self.assertGreater(f.forgetting_risk, 0.0)

    def test_error_need_rises_with_wrongs(self):
        low = extract_features(
            seen=10, wrong=0, interval_days=3, elapsed_days=1, overdue_days=0,
            recent_error_count=0, word_level=1, focus_level=1, frequency_band="core_hsk",
        )
        high = extract_features(
            seen=10, wrong=8, interval_days=3, elapsed_days=1, overdue_days=0,
            recent_error_count=3, word_level=1, focus_level=1, frequency_band="core_hsk",
        )
        self.assertGreater(high.error_need, low.error_need)

    def test_goal_relevance_by_level_distance(self):
        same = extract_features(
            seen=1, wrong=0, interval_days=1, elapsed_days=1, overdue_days=0,
            recent_error_count=0, word_level=2, focus_level=2, frequency_band="core_hsk",
        )
        far = extract_features(
            seen=1, wrong=0, interval_days=1, elapsed_days=1, overdue_days=0,
            recent_error_count=0, word_level=5, focus_level=2, frequency_band="core_hsk",
        )
        self.assertEqual(same.goal_relevance, 1.0)
        self.assertLess(far.goal_relevance, same.goal_relevance)

    def test_natural_mode_goal_relevance_from_usage(self):
        # Mode natural: goal_relevance đến từ tần suất dùng + lỗi cá nhân, không phải HSK level.
        rare = extract_features(
            seen=1, wrong=0, interval_days=1, elapsed_days=1, overdue_days=0,
            recent_error_count=0, word_level=5, focus_level=1, frequency_band="long_tail",
            learning_mode="natural", usage_count=0, topic_match=False,
        )
        hot = extract_features(
            seen=1, wrong=0, interval_days=1, elapsed_days=1, overdue_days=0,
            recent_error_count=3, word_level=5, focus_level=1, frequency_band="core_hsk",
            learning_mode="natural", usage_count=10, topic_match=True,
        )
        # Từ hay dùng + hay sai phải nổi bật hơn dù cùng word_level xa focus_level.
        self.assertGreater(hot.goal_relevance, rare.goal_relevance)
        # habit_fit theo chủ đề người dùng quan tâm, không theo band HSK.
        self.assertEqual(hot.habit_fit, 1.0)
        self.assertEqual(rare.habit_fit, 0.5)

    def test_natural_mode_does_not_affect_hsk_default(self):
        # Không truyền learning_mode -> giữ hành vi HSK cũ (tương thích ngược).
        f = extract_features(
            seen=1, wrong=0, interval_days=1, elapsed_days=1, overdue_days=0,
            recent_error_count=0, word_level=3, focus_level=3, frequency_band="core_hsk",
        )
        self.assertEqual(f.goal_relevance, 1.0)

    def test_recent_repeat_penalty_when_just_seen(self):
        # Gặp lại trong ~1h (0.04 ngày) -> phạt lặp.
        f = extract_features(
            seen=3, wrong=0, interval_days=3, elapsed_days=0.04, overdue_days=-2,
            recent_error_count=0, word_level=1, focus_level=1, frequency_band="core_hsk",
        )
        self.assertGreater(f.recent_repeat_penalty, 0.0)

    def test_features_all_bounded(self):
        f = extract_features(
            seen=100, wrong=100, interval_days=1, elapsed_days=999, overdue_days=999,
            recent_error_count=99, word_level=6, focus_level=1, frequency_band="long_tail",
        )
        for v in f.as_dict().values():
            self.assertGreaterEqual(v, 0.0)
            self.assertLessEqual(v, 1.0)


if __name__ == "__main__":
    unittest.main()
