"""Test cổng định dạng cho câu cloze/reading do LLM sinh.

Chạy: cd backend && python -m unittest tests.test_exam_format_gate -v
Không cần DB, không gọi LLM — chỉ kiểm tra logic validate thuần.

Lý do có file này: ``quiz_service._ai_subtype_for`` gắn cho câu AI cùng nhãn
``question_subtype`` với ngân hàng đoạn văn viết tay (``guided_cloze`` /
``reading_comp_mc``). Nếu validator không siết đúng khuôn 选词填空 / 阅读理解 thì
câu kiểu cũ (một câu rời, options tiếng Việt) sẽ lọt vào bank dưới nhãn đề thi.
Hai validator (``_validate_question`` cho luồng runtime,
``_validate_api_quiz_question`` cho script offline) phải cùng một chuẩn.
"""

import unittest

from app.services.exam_passage_service import ExamPassageBank
from app.services.llm_generator_service import (
    _validate_api_quiz_question,
    _validate_question,
)

# Đoạn 选词填空 đúng khuôn: nhiều câu, đúng MỘT ____, các chỗ khác là （n）.
GOOD_CLOZE_PROMPT = "我每天都去图书馆学习。____我很忙，但是我还是会去。（2）那里很安静。"
GOOD_CLOZE_OPTIONS = ["虽然", "因为", "只要", "即使"]

# Đoạn 阅读理解 đúng khuôn: đoạn nhiều câu + câu hỏi tiếng Trung, options CN.
GOOD_READING_PROMPT = "小王每天六点起床。他先跑步半个小时，然后吃早饭。\n\n小王每天先做什么？"
GOOD_READING_OPTIONS = ["跑步", "吃早饭", "睡觉", "看书"]

# Dạng cũ mà cổng phải chặn: cloze một câu rời.
OLD_CLOZE_PROMPT = "我买了三个____。"
# Dạng cũ: reading chọn từ khóa, options tiếng Việt.
OLD_READING_PROMPT = "Đọc câu sau và chọn từ khóa chính: 我喜欢苹果。"
OLD_READING_OPTIONS = ["quả táo", "quả cam", "quả chuối", "quả nho"]


def runtime_item(quiz_type, prompt, options):
    return {
        "quiz_type": quiz_type,
        "prompt": prompt,
        "options": options,
        "correct_index": 0,
        "explanation": "Giải thích đủ dài để qua ngưỡng.",
    }


def api_item(prompt, options):
    return {
        "target_hanzi": "学习",
        "prompt": prompt,
        "options": options,
        "correct_index": 0,
        "explanation": "Giải thích đủ dài để qua ngưỡng.",
    }


class RuntimeValidatorTest(unittest.TestCase):
    """_validate_question — luồng generate_exercises_for_vocab (AI bank fill)."""

    def test_accepts_exam_format_cloze(self):
        ok, reason = _validate_question(
            runtime_item("cloze", GOOD_CLOZE_PROMPT, GOOD_CLOZE_OPTIONS), "虽然"
        )
        self.assertTrue(ok, reason)

    def test_accepts_exam_format_reading(self):
        ok, reason = _validate_question(
            runtime_item("reading", GOOD_READING_PROMPT, GOOD_READING_OPTIONS), "跑步"
        )
        self.assertTrue(ok, reason)

    def test_rejects_single_sentence_cloze(self):
        ok, reason = _validate_question(
            runtime_item("cloze", OLD_CLOZE_PROMPT, ["苹果", "香蕉", "橘子", "西瓜"]), "苹果"
        )
        self.assertFalse(ok)
        self.assertIn("passage", reason)

    def test_rejects_multiple_blanks(self):
        """Renderer frontend split(/_{2,}/) chỉ điền một ô nên >1 ____ hiện sai."""
        prompt = GOOD_CLOZE_PROMPT.replace("（2）", "____")
        ok, reason = _validate_question(
            runtime_item("cloze", prompt, GOOD_CLOZE_OPTIONS), "虽然"
        )
        self.assertFalse(ok)
        self.assertIn("one blank", reason)

    def test_rejects_vietnamese_cloze_options(self):
        ok, reason = _validate_question(
            runtime_item("cloze", GOOD_CLOZE_PROMPT, ["mặc dù", "bởi vì", "chỉ cần", "dù rằng"]),
            "虽然",
        )
        self.assertFalse(ok)
        self.assertIn("Chinese", reason)

    def test_rejects_keyword_style_reading(self):
        ok, reason = _validate_question(
            runtime_item("reading", OLD_READING_PROMPT, OLD_READING_OPTIONS), "苹果"
        )
        self.assertFalse(ok)

    def test_vocab_unaffected_by_passage_rule(self):
        """Ràng buộc đoạn văn chỉ áp cho cloze/reading, không lan sang vocab."""
        ok, reason = _validate_question(
            runtime_item("vocab", "Chọn nghĩa đúng của: 苹果", ["quả táo", "quả cam", "quả chuối", "quả nho"]),
            "苹果",
        )
        self.assertTrue(ok, reason)


class ApiValidatorTest(unittest.TestCase):
    """_validate_api_quiz_question — script offline upgrade_quiz_bank_ai."""

    def test_accepts_exam_format(self):
        for quiz_type, prompt, options in (
            ("cloze", GOOD_CLOZE_PROMPT, GOOD_CLOZE_OPTIONS),
            ("reading", GOOD_READING_PROMPT, GOOD_READING_OPTIONS),
        ):
            ok, reason = _validate_api_quiz_question(api_item(prompt, options), quiz_type)
            self.assertTrue(ok, f"{quiz_type}: {reason}")

    def test_rejects_single_sentence(self):
        for quiz_type, prompt, options in (
            ("cloze", OLD_CLOZE_PROMPT, ["苹果", "香蕉", "橘子", "西瓜"]),
            ("reading", "我喜欢苹果。", GOOD_READING_OPTIONS),
        ):
            ok, reason = _validate_api_quiz_question(api_item(prompt, options), quiz_type)
            self.assertFalse(ok, f"{quiz_type} đáng ra phải bị loại")
            self.assertIn("passage", reason)


class HandwrittenBankPassesGateTest(unittest.TestCase):
    """Ngưỡng của cổng phải được hiệu chuẩn theo bank viết tay, không chặn nó."""

    @classmethod
    def setUpClass(cls):
        cls.bank = ExamPassageBank()

    def test_every_bank_item_passes_both_validators(self):
        for quiz_type in ("cloze", "reading"):
            for item in self.bank.items(quiz_type):
                payload = api_item(item["prompt"], item["options"])
                ok, reason = _validate_api_quiz_question(payload, quiz_type)
                self.assertTrue(ok, f"api validator loại {item['passage_id']}: {reason}")

                runtime = runtime_item(quiz_type, item["prompt"], item["options"])
                ok, reason = _validate_question(runtime, "")
                self.assertTrue(ok, f"runtime validator loại {item['passage_id']}: {reason}")


if __name__ == "__main__":
    unittest.main()
