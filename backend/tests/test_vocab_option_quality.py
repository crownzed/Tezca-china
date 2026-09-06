"""Test tất định cho cổng QA nghĩa của câu ``vocab``.

Chạy: cd backend && python -m pytest tests/test_vocab_option_quality.py

Khoá ba hành vi ở TẦNG SINH (``question_generator``), bổ sung cho
``test_gloss_senses.py`` khoá tầng so nghĩa thuần:

1. Distractor trùng nghĩa với đáp án bị loại NGAY khi ráp options, không phải
   loại cả câu — pool còn ứng viên khác nên bỏ câu sẽ làm hụt phủ từ vựng ở đúng
   những từ nhiều nghĩa nhất.
2. Cổng ``_valid_question_payload`` chặn câu có hai đáp án đúng, có chữ Hán trong
   lựa chọn, hoặc đáp án lộ chữ Hán đang hỏi.
3. Phép so tập nghĩa KHÔNG áp cho listening/dialogue/translation: lựa chọn của
   chúng là câu/đoạn, tách theo dấu phẩy sẽ ra mệnh đề trùng nhau giữa hai đoạn
   khác nghĩa (đo trên bank: 65,1% câu translation bị coi là xung đột).

Dùng SQLite in-memory nên không chạm DB thật, không gọi LLM.
"""

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Example, QuizType, Word
from app.services.question_generator import (
    QuestionGeneratorService,
    _pos_label,
    _valid_question_payload,
)
from app.services.gloss_senses import conflicting_option_indexes

_SENTENCE_CN = "我今天在学校学习{hanzi}，老师说这个词很有用。"
_SENTENCE_VI = "Hôm nay tôi học {hanzi} ở trường, giáo viên nói từ này rất hữu ích."
_HANZI = "书桌椅灯笔纸门窗床包鞋帽伞碗杯盘勺叉刀锅"


def _add_word(db, hanzi: str, meaning_vi: str, level: int = 1, pos: str = "n") -> Word:
    word = Word(
        hanzi=hanzi,
        pinyin=f"py{hanzi}",
        meaning_vi=meaning_vi,
        meaning_en="",
        hsk_level=level,
        pos=pos,
    )
    db.add(word)
    db.flush()
    db.add(Example(
        word_id=word.id,
        sentence_cn=_SENTENCE_CN.format(hanzi=hanzi),
        sentence_vi=_SENTENCE_VI.format(hanzi=hanzi),
    ))
    return word


class PayloadGateTest(unittest.TestCase):
    """Cổng QA cuối, không cần DB."""

    def _gate(self, options, correct_index, quiz_type=QuizType.vocab, target_hanzi="低"):
        return _valid_question_payload(
            quiz_type,
            "Chọn nghĩa đúng của: 低",
            options,
            correct_index,
            "giải thích",
            {},
            target_hanzi=target_hanzi,
        )

    def test_clean_vocab_question_passes(self):
        self.assertTrue(self._gate(["thấp", "cao", "dài", "ngắn"], 0))

    def test_two_valid_answers_rejected(self):
        # Câu 11675 trong bank: hỏi 低 ('thấp') nhưng có distractor 'Thấp' (từ 矮).
        self.assertFalse(self._gate(["Ngắn", "thấp", "Thấp", "đáy, cuối"], 1))

    def test_multi_sense_answer_overlapping_distractor_rejected(self):
        # Câu 5341: hỏi 小 với gloss nhiều nghĩa, distractor là gloss của 少.
        self.assertFalse(
            self._gate(["nhỏ; bé; ít; trẻ", "Ít", "Cao", "Nhiều"], 0, target_hanzi="小")
        )

    def test_duplicate_by_case_rejected(self):
        # Câu 8357: cổng cũ so set() trên chuỗi thô nên cặp 'Có lẽ'/'có lẽ' lọt qua.
        self.assertFalse(
            self._gate(["có thể, được phép", "Có lẽ", "Nên", "có lẽ"], 1, target_hanzi="可能")
        )

    def test_cjk_in_option_rejected(self):
        self.assertFalse(
            self._gate(["Đem (cấu trúc 把)", "Đối với", "Ngoại trừ", "Giống như"], 0, target_hanzi="把")
        )

    def test_answer_revealing_target_hanzi_rejected(self):
        # Ngay cả khi chữ Hán nằm ở ô đáp án và không ô nào khác có: câu 2556.
        self.assertFalse(
            self._gate(["Đối với", "Ngoại trừ", "Đem cấu trúc 把", "Giống như"], 2, target_hanzi="把")
        )

    def test_sentence_types_skip_sense_comparison(self):
        # Hai đoạn dịch khác nghĩa nhưng chung nhiều mệnh đề: KHÔNG được loại.
        options = [
            "Hôm nay tôi đi học, sau đó về nhà ăn cơm",
            "Hôm nay tôi đi làm, sau đó về nhà ăn cơm",
            "Ngày mai tôi đi chơi, sau đó về nhà nghỉ",
            "Tuần sau tôi đi công tác, sau đó về nhà",
        ]
        self.assertTrue(conflicting_option_indexes(options, 0))  # so nghĩa thì xung đột
        self.assertTrue(  # nhưng cổng vẫn cho qua vì đây là dạng câu
            _valid_question_payload(
                QuizType.translation,
                "Dịch đoạn nói sau sang tiếng Việt: 今天我去上学。",
                options,
                0,
                "giải thích",
                {},
                target_hanzi="上学",
            )
        )


class OptionAssemblyTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def tearDown(self):
        self.engine.dispose()

    def test_synonym_distractor_is_dropped_not_the_whole_question(self):
        """Từ đồng nghĩa trong pool bị bỏ qua, câu vẫn sinh được với ứng viên khác."""
        with self.Session() as db:
            target = _add_word(db, "低", "thấp")
            _add_word(db, "矮", "Thấp")          # trùng nghĩa -> phải bị loại
            _add_word(db, "短", "ngắn")
            _add_word(db, "高", "cao")
            _add_word(db, "长", "dài")
            _add_word(db, "大", "to; lớn")
            db.commit()

            gen = QuestionGeneratorService(db)
            options, correct_index, _ = gen._options_with_words(target, QuizType.vocab, seed=7)

            self.assertEqual(len(options), 4)
            self.assertEqual(options[correct_index], "thấp")
            self.assertNotIn("Thấp", options)
            self.assertEqual(conflicting_option_indexes(options, correct_index), [])

    def test_generated_vocab_question_passes_its_own_gate(self):
        with self.Session() as db:
            words = [
                _add_word(db, _HANZI[i], f"nghia rieng biet {i}")
                for i in range(8)
            ]
            db.commit()
            gen = QuestionGeneratorService(db)
            question = gen._get_or_create_question(words[0], 1, QuizType.vocab, seed=11)
            self.assertIsNotNone(question)
            self.assertEqual(
                conflicting_option_indexes(question.options, question.correct_index), []
            )

    def test_explanation_carries_teaching_content(self):
        """Giải thích phải hơn dòng ``hanzi · pinyin · nghĩa`` lặp lại đáp án."""
        with self.Session() as db:
            target = _add_word(db, "低", "thấp", pos="a")
            target.component_hint = "Thành phần chữ gồm: 亻 (Nhân (Người - dạng đứng))."
            target.confusable_words_json = ["底", "短", "矮"]
            db.commit()

            gen = QuestionGeneratorService(db)
            explanation = gen._explanation_for(target, QuizType.vocab)

            self.assertIn("低 · py低 · thấp", explanation)
            self.assertIn("Từ loại: tính từ", explanation)
            self.assertIn("Nhân", explanation)
            self.assertIn("Dễ nhầm với: 底, 短, 矮", explanation)

    def test_generic_component_hint_is_omitted(self):
        """Câu gợi ý chung chung (330/5.746 từ) không mang thông tin -> bỏ."""
        with self.Session() as db:
            target = _add_word(db, "会", "biết; có thể", pos="v")
            target.component_hint = "Quan sát ký tự 会 trước, rồi học âm và nghĩa trong câu."
            db.commit()
            gen = QuestionGeneratorService(db)
            self.assertNotIn("Quan sát", gen._explanation_for(target, QuizType.vocab))


class PosLabelTest(unittest.TestCase):
    """``words.pos`` trộn ba quy ước từ ba nguồn nhập; nhãn phải tra được cả ba."""

    def test_chinese_codes(self):
        self.assertEqual(_pos_label("n"), "danh từ")
        self.assertEqual(_pos_label("v"), "động từ")
        self.assertEqual(_pos_label("d"), "phó từ")

    def test_english_words(self):
        self.assertEqual(_pos_label("noun"), "danh từ")
        self.assertEqual(_pos_label("adjective"), "tính từ")
        self.assertEqual(_pos_label("preposition"), "giới từ")

    def test_compound_code_keeps_order(self):
        self.assertEqual(_pos_label("a/ad"), "tính từ/phó từ")

    def test_unknown_and_empty_yield_nothing(self):
        self.assertEqual(_pos_label("zzz"), "")
        self.assertEqual(_pos_label(""), "")
        self.assertEqual(_pos_label(None), "")

    def test_duplicate_labels_collapse(self):
        # 'v/verb' cùng trỏ 'động từ' -> không lặp lại nhãn.
        self.assertEqual(_pos_label("v/verb"), "động từ")


if __name__ == "__main__":
    unittest.main()
