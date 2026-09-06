"""Test tất định cho việc chèn distractor cá nhân hoá lúc PHỤC VỤ.

Chạy: cd backend && python -m pytest tests/test_serve_distractor_guard.py

``quiz_service`` thay một distractor bằng từ người học từng nhầm
(``_inject_user_distractors``) hoặc theo nấc thụ đắc (``_inject_stage_confusable``).
Guard cũ chỉ có ``text in options`` — so chuỗi NGUYÊN VĂN. Mô phỏng trên toàn
bank cho thấy ba lỗi lọt qua:

1. 46 câu ``vocab`` nhận thêm một gloss TRÙNG NGHĨA với đáp án (改变 'Thay đổi'
   nhận thêm 变化 'thay đổi, biến hóa') -> hai lựa chọn cùng đúng nhưng backend
   chỉ nhận một.
2. 19 câu nhận gloss chỉ khác chữ hoa/thường với một ô đang có.
3. Nặng nhất, ở listening/dialogue/translation: đáp án đúng là CÂU (p50 = 53–164
   ký tự) còn gloss chèn vào chỉ vài ký tự ('tôi', 'Trong'), nên ô ngắn tũn giữa
   ba ô dài là lộ đáp án bằng mắt — 2.134/2.366 câu dialogue sẽ bị vậy.

Điểm sống còn của cả hai hàm: ``correct_index`` và text đáp án KHÔNG được đổi,
nếu không thì mọi lượt trả lời đã lưu bị chấm sai.

Không cần DB — gọi trực tiếp hàm thuần với object rời.
"""

import unittest

from app.models import Question, QuizType, Word
from app.services.quiz_service import (
    _inject_stage_confusable,
    _inject_user_distractors,
)


def _question(quiz_type: QuizType, options: list[str], correct_index: int, word_id: int = 1):
    question = Question(
        word_id=word_id,
        level=1,
        quiz_type=quiz_type,
        prompt="Chọn nghĩa đúng của: 改变",
        options=list(options),
        correct_index=correct_index,
        explanation="giải thích",
        audio_text="",
        metadata_json={"option_word_ids": [word_id, 2, 3, 4]},
    )
    question.id = 100
    return question


def _word(word_id: int, hanzi: str, meaning_vi: str) -> Word:
    word = Word(hanzi=hanzi, pinyin="py", meaning_vi=meaning_vi, meaning_en="", hsk_level=1)
    word.id = word_id
    return word


class UserDistractorGuardTest(unittest.TestCase):
    def test_synonym_swap_is_refused(self):
        """变化 'thay đổi, biến hóa' không được chèn vào câu có đáp án 'Thay đổi'."""
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        before = list(question.options)
        _inject_user_distractors(question, {1: [9]}, {9: _word(9, "变化", "thay đổi, biến hóa")})
        self.assertEqual(question.options, before)
        self.assertIsNone((question.metadata_json or {}).get("personalized"))

    def test_case_only_duplicate_is_refused(self):
        question = _question(QuizType.vocab, ["thấp", "cao", "dài", "ngắn"], 0)
        before = list(question.options)
        _inject_user_distractors(question, {1: [9]}, {9: _word(9, "矮", "Thấp")})
        self.assertEqual(question.options, before)

    def test_distinct_meaning_is_accepted(self):
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        _inject_user_distractors(question, {1: [9]}, {9: _word(9, "移动", "di chuyển")})
        self.assertIn("di chuyển", question.options)
        self.assertEqual(question.options[0], "Thay đổi")   # đáp án nguyên vẹn
        self.assertEqual(question.correct_index, 0)
        self.assertTrue(question.metadata_json["personalized"])

    def test_word_id_follows_the_swapped_slot(self):
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        _inject_user_distractors(question, {1: [9]}, {9: _word(9, "移动", "di chuyển")})
        swapped = question.options.index("di chuyển")
        self.assertEqual(question.metadata_json["option_word_ids"][swapped], 9)

    def test_sentence_type_never_receives_a_short_gloss(self):
        """Ô 3 ký tự giữa ba ô 50+ ký tự là lộ đáp án bằng mắt."""
        long_options = [
            "A hỏi đường đến bệnh viện, B chỉ đường đi bộ năm phút",
            "A hỏi giá quả táo, B trả lời hai mươi tệ một cân",
            "A mời B đi ăn cơm, B nói đã ăn ở nhà rồi",
            "A nhờ B mở cửa sổ, B nói ngoài trời đang mưa",
        ]
        for quiz_type in (QuizType.dialogue, QuizType.listening, QuizType.translation):
            with self.subTest(quiz_type=quiz_type.value):
                question = _question(quiz_type, long_options, 0)
                before = list(question.options)
                _inject_user_distractors(question, {1: [9]}, {9: _word(9, "我", "tôi")})
                self.assertEqual(question.options, before)

    def test_hanzi_option_types_still_swap(self):
        """Dạng có lựa chọn là chữ Hán (cloze/reading) vẫn nhận distractor."""
        question = _question(QuizType.cloze, ["高", "低", "长", "短"], 0)
        _inject_user_distractors(question, {1: [9]}, {9: _word(9, "矮", "thấp")})
        self.assertIn("矮", question.options)
        self.assertEqual(question.options[0], "高")


class StageConfusableGuardTest(unittest.TestCase):
    def _target(self, confusables: list[str]) -> Word:
        word = _word(1, "改变", "Thay đổi")
        word.confusable_words_json = confusables
        return word

    def test_conflicting_candidate_is_skipped_for_the_next_one(self):
        """Ứng viên đầu trùng nghĩa -> thử tiếp, KHÔNG bỏ luôn phần cá nhân hoá."""
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        target = self._target(["变化", "移动"])
        pool = {
            "变化": _word(9, "变化", "thay đổi, biến hóa"),   # xung đột
            "移动": _word(10, "移动", "di chuyển"),           # dùng được
        }
        _inject_stage_confusable(question, target, "MASTERED", pool)
        self.assertIn("di chuyển", question.options)
        self.assertNotIn("thay đổi, biến hóa", question.options)
        self.assertEqual(question.options[0], "Thay đổi")
        self.assertEqual(question.correct_index, 0)

    def test_all_candidates_conflicting_leaves_question_untouched(self):
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        target = self._target(["变化"])
        before = list(question.options)
        _inject_stage_confusable(
            question, target, "MASTERED", {"变化": _word(9, "变化", "thay đổi")}
        )
        self.assertEqual(question.options, before)
        self.assertNotIn("stage_distractor", question.metadata_json or {})

    def test_sentence_type_is_skipped(self):
        question = _question(
            QuizType.listening,
            [
                "Xin hỏi, bệnh viện gần nhất ở đâu ạ",
                "Quả táo này bao nhiêu tiền một cân",
                "Tôi đi bộ năm phút là đến trường",
                "Ngoài trời đang mưa rất to nhé",
            ],
            0,
        )
        before = list(question.options)
        _inject_stage_confusable(
            question, self._target(["移动"]), None, {"移动": _word(10, "移动", "di chuyển")}
        )
        self.assertEqual(question.options, before)

    def test_no_confusable_data_is_a_noop(self):
        question = _question(QuizType.vocab, ["Thay đổi", "Giữ nguyên", "Tăng lên", "Giảm đi"], 0)
        before = list(question.options)
        _inject_stage_confusable(question, self._target([]), "USABLE", {})
        self.assertEqual(question.options, before)


if __name__ == "__main__":
    unittest.main()
