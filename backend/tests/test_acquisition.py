"""Test tất định cho acquisition_service (trục thụ đắc tự nhiên SPEC v2).

Chạy: cd backend && .venv/bin/python -m unittest tests.test_acquisition -v
Không cần DB — chỉ kiểm tra logic thuần.
"""

import unittest

from app.services.acquisition_service import (
    STAGES,
    STAGE_LABELS,
    acquisition_stage,
    describe_acquisition,
)


def _stage(**kw):
    base = dict(
        seen=0,
        recognition_score=0,
        listening_score=0,
        context_score=0,
        production_score=0,
        mastery=0,
    )
    base.update(kw)
    return acquisition_stage(**base)


class AcquisitionStageTest(unittest.TestCase):
    def test_brand_new_word_is_unknown(self):
        self.assertEqual(_stage(), "UNKNOWN")

    def test_seen_but_no_recall_still_unknown(self):
        # Đã gặp nhưng chưa nhận diện được → vẫn chưa biết.
        self.assertEqual(_stage(seen=3, recognition_score=5), "UNKNOWN")

    def test_recognized_via_recognition(self):
        self.assertEqual(_stage(seen=2, recognition_score=40), "RECOGNIZED")

    def test_recognized_via_listening(self):
        # Trẻ con nhận ra qua kênh nghe cũng tính.
        self.assertEqual(_stage(seen=2, listening_score=45), "RECOGNIZED")

    def test_understood_needs_recall_and_context(self):
        self.assertEqual(
            _stage(seen=5, recognition_score=60, context_score=40),
            "UNDERSTOOD",
        )

    def test_understood_blocked_without_context(self):
        # Recall cao nhưng chưa hiểu ngữ cảnh → dừng ở RECOGNIZED.
        self.assertEqual(
            _stage(seen=5, recognition_score=70, context_score=10),
            "RECOGNIZED",
        )

    def test_usable_needs_production_and_context(self):
        self.assertEqual(
            _stage(
                seen=8,
                recognition_score=70,
                context_score=60,
                production_score=50,
            ),
            "USABLE",
        )

    def test_usable_blocked_without_production(self):
        # Hiểu tốt nhưng chưa sản sinh → chưa "dùng được".
        self.assertEqual(
            _stage(
                seen=8,
                recognition_score=80,
                context_score=70,
                production_score=10,
            ),
            "UNDERSTOOD",
        )

    def test_mastered_needs_high_production_and_mastery(self):
        self.assertEqual(
            _stage(
                seen=20,
                recognition_score=90,
                context_score=85,
                production_score=80,
                mastery=85,
            ),
            "MASTERED",
        )

    def test_mastered_blocked_by_low_mastery(self):
        # Sản sinh tốt nhưng trí nhớ chưa ổn định → vẫn USABLE.
        self.assertEqual(
            _stage(
                seen=15,
                recognition_score=85,
                context_score=70,
                production_score=80,
                mastery=50,
            ),
            "USABLE",
        )

    def test_mastered_blocked_without_context(self):
        # Sản sinh + trí nhớ cao nhưng CHƯA hiểu ngữ cảnh (context=0) không được
        # là MASTERED: MASTERED phải bao hàm điều kiện của USABLE (context đủ).
        stage = _stage(
            seen=20,
            recognition_score=30,
            context_score=0,
            production_score=80,
            mastery=85,
        )
        self.assertNotEqual(stage, "MASTERED")
        self.assertNotEqual(stage, "USABLE")


class MonotonicityTest(unittest.TestCase):
    def test_stage_never_regresses_as_scores_rise(self):
        # Khi mọi điểm tăng dần, stage index không bao giờ giảm.
        prev_index = -1
        for score in range(0, 101, 5):
            stage = _stage(
                seen=20,
                recognition_score=score,
                listening_score=score,
                context_score=score,
                production_score=score,
                mastery=score,
            )
            idx = STAGES.index(stage)
            self.assertGreaterEqual(idx, prev_index)
            prev_index = idx

    def test_top_scores_reach_mastered(self):
        self.assertEqual(
            _stage(
                seen=30,
                recognition_score=100,
                listening_score=100,
                context_score=100,
                production_score=100,
                mastery=100,
            ),
            "MASTERED",
        )


class DescribeAcquisitionTest(unittest.TestCase):
    def test_describe_shape(self):
        out = describe_acquisition(
            seen=2,
            recognition_score=40,
            listening_score=0,
            context_score=0,
            production_score=0,
            mastery=0,
        )
        self.assertEqual(out["stage"], "RECOGNIZED")
        self.assertEqual(out["label"], STAGE_LABELS["RECOGNIZED"])
        self.assertEqual(out["index"], STAGES.index("RECOGNIZED"))
        self.assertGreaterEqual(out["progress_to_next"], 0)
        self.assertLessEqual(out["progress_to_next"], 100)
        self.assertFalse(out["is_productive"])

    def test_is_productive_flag(self):
        out = describe_acquisition(
            seen=8,
            recognition_score=70,
            listening_score=0,
            context_score=60,
            production_score=50,
            mastery=0,
        )
        self.assertEqual(out["stage"], "USABLE")
        self.assertTrue(out["is_productive"])

    def test_progress_bounded_and_unknown_scales(self):
        low = describe_acquisition(
            seen=1, recognition_score=5, listening_score=0,
            context_score=0, production_score=0, mastery=0,
        )
        high = describe_acquisition(
            seen=1, recognition_score=18, listening_score=0,
            context_score=0, production_score=0, mastery=0,
        )
        self.assertEqual(low["stage"], "UNKNOWN")
        self.assertEqual(high["stage"], "UNKNOWN")
        # progress tới RECOGNIZED tăng theo recall.
        self.assertLess(low["progress_to_next"], high["progress_to_next"])

    def test_mastered_progress_is_full(self):
        out = describe_acquisition(
            seen=30, recognition_score=100, listening_score=100,
            context_score=100, production_score=100, mastery=100,
        )
        self.assertEqual(out["stage"], "MASTERED")
        self.assertEqual(out["progress_to_next"], 100)


if __name__ == "__main__":
    unittest.main()
