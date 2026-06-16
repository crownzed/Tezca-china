"""Test tất định cho distractor_policy (chọn distractor theo nấc thụ đắc, #2).

Chạy: cd backend && .venv/bin/python -m unittest tests.test_distractor_policy -v
Không cần DB — chỉ kiểm tra logic thuần.
"""

import unittest

from app.services.distractor_policy import (
    difficulty_bias,
    order_distractors_by_stage,
)


class DifficultyBiasTest(unittest.TestCase):
    def test_unknown_is_zero(self):
        self.assertEqual(difficulty_bias("UNKNOWN"), 0.0)

    def test_mastered_is_one(self):
        self.assertEqual(difficulty_bias("MASTERED"), 1.0)

    def test_monotonic_increasing(self):
        stages = ["UNKNOWN", "RECOGNIZED", "UNDERSTOOD", "USABLE", "MASTERED"]
        biases = [difficulty_bias(s) for s in stages]
        self.assertEqual(biases, sorted(biases))

    def test_unknown_stage_defaults_low(self):
        # Chuỗi lạ → coi như người mới (bias thấp).
        self.assertEqual(difficulty_bias("???"), 0.0)
        self.assertEqual(difficulty_bias(None), 0.0)

    def test_case_insensitive(self):
        self.assertEqual(difficulty_bias("mastered"), 1.0)


class OrderDistractorsTest(unittest.TestCase):
    def setUp(self):
        # Đã xếp gần→xa: 'a' gần đáp án nhất (khó nhất), 'e' xa nhất (dễ loại).
        self.ranked = ["a", "b", "c", "d", "e"]

    def test_mastered_keeps_hardest_first(self):
        # Thuần thục → distractor gần nhất ('a') lên đầu.
        out = order_distractors_by_stage(self.ranked, "MASTERED")
        self.assertEqual(out[0], "a")

    def test_newest_puts_easiest_first(self):
        # Người mới nhất (UNKNOWN) → distractor xa nhất ('e') lên đầu để dễ loại trừ.
        out = order_distractors_by_stage(self.ranked, "UNKNOWN")
        self.assertEqual(out[0], "e")

    def test_recognized_puts_second_farthest_first(self):
        # RECOGNIZED là một bậc trên UNKNOWN → distractor xa thứ nhì ('d'),
        # đúng gradient tuyến tính 5 nấc (UNKNOWN→e, RECOGNIZED→d, ... MASTERED→a).
        out = order_distractors_by_stage(self.ranked, "RECOGNIZED")
        self.assertEqual(out[0], "d")

    def test_no_items_dropped(self):
        for stage in ["UNKNOWN", "RECOGNIZED", "UNDERSTOOD", "USABLE", "MASTERED"]:
            out = order_distractors_by_stage(self.ranked, stage)
            self.assertEqual(sorted(out), sorted(self.ranked))
            self.assertEqual(len(out), len(self.ranked))

    def test_middle_stage_favors_mid(self):
        # UNDERSTOOD (bias 0.5) → neo giữa dải, phần tử giữa ('c') ưu tiên.
        out = order_distractors_by_stage(self.ranked, "UNDERSTOOD")
        self.assertEqual(out[0], "c")

    def test_empty_and_single(self):
        self.assertEqual(order_distractors_by_stage([], "MASTERED"), [])
        self.assertEqual(order_distractors_by_stage(["x"], "RECOGNIZED"), ["x"])

    def test_stable_for_ties(self):
        # Hai phần tử cách đều neo → giữ thứ tự gốc (gần đáp án thắng).
        ranked = ["a", "b"]  # bias 0.5 → anchor 0.5, |0-0.5|==|1-0.5|
        out = order_distractors_by_stage(ranked, "UNDERSTOOD")
        self.assertEqual(out, ["a", "b"])


if __name__ == "__main__":
    unittest.main()
