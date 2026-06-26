"""Test tất định cho validator câu hỏi từ đoạn văn (passage questions).

Chạy: cd backend && python -m unittest tests.test_passage_questions -v
Không cần DB, không gọi LLM — chỉ kiểm tra logic validate thuần.
"""

import copy
import unittest

from app.services.llm_generator_service import (
    _validate_passage_question,
    PASSAGE_SUBTYPES,
    _SUBTYPE_TO_QUIZ_TYPE,
)


# Năm câu hỏi mẫu vàng (golden) — đúng định dạng cho cả 5 question_subtype.
GOLDEN = [
    {
        "quiz_type": "cloze",
        "question_subtype": "cloze_translation",
        "prompt": 'Goc: 每个星期我都会去健身房五次。 Dich: "Moi tuan toi deu den ___ nam lan."',
        "options": ["thu vien", "phong tap the hinh", "nha an", "cong vien"],
        "correct_index": 1,
        "explanation": "健身房 nghia la phong tap the hinh.",
    },
    {
        "quiz_type": "reading",
        "question_subtype": "error_id",
        "prompt": "Goc: 为了身体健康，我中午常常吃鸡肉。 Chon doan sai:",
        "options": ["Vi suc khoe,", "buoi toi", "toi thuong", "an thit ga."],
        "correct_index": 1,
        "explanation": "中午 la buoi trua, khong phai buoi toi.",
    },
    {
        "quiz_type": "reading",
        "question_subtype": "sentence_scramble",
        "prompt": "Goc: 下课以后，我经常去运动。 Chon cau sap xep dung:",
        "options": [
            "Sau khi tan hoc, toi thuong di tap the duc.",
            "Toi thuong sau khi tan hoc di tap the duc.",
            "Di tap the duc toi thuong sau khi tan hoc.",
            "Sau khi toi thuong tan hoc di tap the duc.",
        ],
        "correct_index": 0,
        "explanation": "Trang ngu thoi gian dat dau cau.",
    },
    {
        "quiz_type": "reading",
        "question_subtype": "info_extraction",
        "prompt": "Moi tuan nhan vat den phong tap the hinh bao nhieu lan?",
        "options": ["Ba lan", "Bon lan", "Nam lan", "Sau lan"],
        "correct_index": 2,
        "explanation": "Trich: 每个星期...五次 - nam lan.",
    },
    {
        "quiz_type": "translation",
        "question_subtype": "contextual_translation",
        "prompt": "Goc: 我的目标是多锻炼身体。 Tinh huong: ban than. Chon ban tu nhien nhat:",
        "options": [
            "Muc tieu cua ban than toi chinh la gia tang cuong do ren luyen.",
            "Muc tieu cua minh la tap luyen nhieu hon.",
            "Chi huong cua ta la kho luyen than the.",
            "Muc tieu toi la nhieu ren luyen than the.",
        ],
        "correct_index": 1,
        "explanation": "Dung 'minh' hop van noi than mat.",
    },
]


class GoldenPassageQuestionsTest(unittest.TestCase):
    def test_all_golden_pass(self):
        for q in GOLDEN:
            ok, reason = _validate_passage_question(q)
            self.assertTrue(ok, f"{q['question_subtype']} should pass, got: {reason}")

    def test_golden_covers_all_subtypes(self):
        subtypes = {q["question_subtype"] for q in GOLDEN}
        self.assertEqual(subtypes, PASSAGE_SUBTYPES)

    def test_quiz_type_mapping_consistent(self):
        for q in GOLDEN:
            expected = _SUBTYPE_TO_QUIZ_TYPE[q["question_subtype"]]
            self.assertEqual(q["quiz_type"], expected)


class BadPassageQuestionsTest(unittest.TestCase):
    """Mỗi biến thể hỏng một chỗ — phải bị từ chối."""

    def _mc(self):
        return copy.deepcopy(GOLDEN[3])  # info_extraction (MC thuần)

    def test_three_options_rejected(self):
        q = self._mc()
        q["options"] = q["options"][:3]
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_duplicate_options_rejected(self):
        q = self._mc()
        q["options"][1] = q["options"][0]
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_empty_option_rejected(self):
        q = self._mc()
        q["options"][2] = "   "
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_correct_index_out_of_range_rejected(self):
        q = self._mc()
        q["correct_index"] = 7
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_cloze_missing_blank_rejected(self):
        q = copy.deepcopy(GOLDEN[0])
        q["prompt"] = q["prompt"].replace("___", "phong tap")
        ok, reason = _validate_passage_question(q)
        self.assertFalse(ok)
        self.assertIn("___", reason)

    def test_unknown_subtype_rejected(self):
        q = self._mc()
        q["question_subtype"] = "made_up"
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_mismatched_quiz_type_rejected(self):
        q = self._mc()
        q["quiz_type"] = "translation"  # info_extraction phải là 'reading'
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)

    def test_missing_field_rejected(self):
        q = self._mc()
        del q["explanation"]
        ok, _ = _validate_passage_question(q)
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
