"""Test tất định cho item_difficulty (chọn câu theo độ khó thực nghiệm, #1).

Chạy: cd backend && .venv/bin/python -m unittest tests.test_item_difficulty -v
Không cần DB — chỉ kiểm tra logic thuần.
"""

import unittest

from app.services.item_difficulty import (
    difficulty_fit,
    difficulty_label,
    empirical_p_correct,
    is_low_quality,
)
from app.services.tuning import ITEM_DIFFICULTY_PRIOR_P


class EmpiricalPCorrectTest(unittest.TestCase):
    def test_no_attempts_returns_prior(self):
        # Câu chưa ai làm -> đúng prior trung tính, không thiên lệch.
        self.assertAlmostEqual(empirical_p_correct(0, 0), ITEM_DIFFICULTY_PRIOR_P, places=6)

    def test_small_sample_is_shrunk_toward_prior(self):
        # 1/1 = 100% thô, nhưng shrinkage phải kéo xuống dưới 1.0.
        p = empirical_p_correct(1, 1)
        self.assertLess(p, 1.0)
        self.assertGreater(p, ITEM_DIFFICULTY_PRIOR_P)

    def test_large_sample_approaches_raw_rate(self):
        # Nhiều lượt -> p tiến gần tỉ lệ thô (ở đây 50%).
        p = empirical_p_correct(500, 1000)
        self.assertAlmostEqual(p, 0.5, places=1)

    def test_clamped_in_range(self):
        self.assertGreaterEqual(empirical_p_correct(0, 50), 0.0)
        self.assertLessEqual(empirical_p_correct(50, 50), 1.0)


class DifficultyFitTest(unittest.TestCase):
    def test_peaks_near_target(self):
        # Câu có p ~ 0.85 (mục tiêu) phải đạt điểm khớp cao nhất.
        near_target = difficulty_fit(85, 100)
        too_easy = difficulty_fit(99, 100)
        too_hard = difficulty_fit(15, 100)
        self.assertGreater(near_target, too_easy)
        self.assertGreater(near_target, too_hard)

    def test_in_range(self):
        self.assertGreaterEqual(difficulty_fit(50, 100), 0.0)
        self.assertLessEqual(difficulty_fit(50, 100), 1.0)


class LowQualityGateTest(unittest.TestCase):
    def test_insufficient_attempts_never_flagged(self):
        # Chưa đủ lượt -> không loại oan, dù 3/3 đúng.
        self.assertFalse(is_low_quality(3, 3))

    def test_too_easy_flagged(self):
        self.assertTrue(is_low_quality(50, 50))

    def test_too_hard_flagged(self):
        self.assertTrue(is_low_quality(1, 50))

    def test_healthy_item_not_flagged(self):
        self.assertFalse(is_low_quality(42, 50))


class DifficultyLabelTest(unittest.TestCase):
    def test_labels_cover_spectrum(self):
        self.assertEqual(difficulty_label(99, 100), "easy")
        self.assertEqual(difficulty_label(5, 100), "very_hard")


if __name__ == "__main__":
    unittest.main()
