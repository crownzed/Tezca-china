"""Test tất định cho việc phủ bank câu hỏi lên TOÀN BỘ từ vựng của mỗi cấp.

Chạy: cd backend && python -m pytest tests/test_question_coverage.py

Khóa ba hành vi từng làm bank chỉ dùng một phần nhỏ bộ từ HSK:

1. ``_options_with_words`` phải trả ĐÚNG 4 lựa chọn cho mọi dạng. Với
   listening/dialogue/translation, generator lấy dư ứng viên (pick_count=8) để
   chịu được distractor bị lọc; nếu không cắt lại còn 4 thì cổng QA
   (``_valid_question_payload``) loại IM LẶNG mọi câu ba dạng đó.
2. ``_source_words`` phải ưu tiên từ CHƯA có câu, không lặp lại phần đầu bảng —
   truy vấn cũ ``limit(n)`` không kèm ``order by`` luôn trả cùng n từ đầu theo
   primary key nên đuôi bộ từ (HSK5/6 ~1.7k từ mỗi cấp) không bao giờ được dùng.
3. ``ensure_coverage`` phải phủ được từ mới và idempotent khi chạy lại.

Dùng SQLite in-memory nên không chạm DB thật, không gọi LLM.
"""

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Example, Question, QuizType, Word
from app.services.question_generator import (
    QuestionGeneratorService,
    _cloze_replace_all,
)

# Câu ví dụ dùng chung: chứa chỗ chèn hanzi để cloze/drag_drop khoét được ô trống.
_SENTENCE_CN = "我今天在学校学习{hanzi}，老师说这个词很有用。"
_SENTENCE_VI = "Hom nay toi hoc {hanzi} o truong, giao vien noi tu nay rat huu ich."

# Bộ hanzi đủ khác nhau để dedup option không rút số lựa chọn xuống dưới 4.
_HANZI = "书桌椅灯笔纸门窗床包鞋帽伞碗杯盘勺叉刀锅"


def _seed_level(db, level: int, count: int) -> list[Word]:
    """Tạo ``count`` từ ở ``level``, mỗi từ một câu ví dụ song ngữ."""
    words = []
    for index in range(count):
        hanzi = _HANZI[index % len(_HANZI)] * (1 + index // len(_HANZI))
        word = Word(
            hanzi=hanzi,
            pinyin=f"py{index}",
            meaning_vi=f"nghia {index}",
            meaning_en=f"meaning {index}",
            hsk_level=level,
            pos="n",
        )
        db.add(word)
        db.flush()
        db.add(Example(
            word_id=word.id,
            sentence_cn=_SENTENCE_CN.format(hanzi=hanzi),
            sentence_vi=_SENTENCE_VI.format(hanzi=hanzi),
        ))
        words.append(word)
    db.commit()
    return words


class ClozeSingleCharTest(unittest.TestCase):
    """Từ ĐƠN phải khoét được ô trống — không cần DB.

    Hồi quy: điều kiện độc lập cũ là "hai bên không phải chữ Hán". Tiếng Trung
    viết liền không dấu cách nên gần như mọi từ đơn đều có chữ Hán kề bên → hàm
    luôn trả None và KHÔNG từ đơn nào sinh được câu cloze (100% từ HSK1-3 chưa
    phủ cloze đều là từ đơn).
    """

    COMPOUNDS = frozenset({"学习", "椅子", "一只", "他们"})

    def test_single_char_word_is_blanked(self):
        for text, hanzi, expected in [
            ("它是一只猫。", "它", "____是一只猫。"),
            ("很好。", "很", "____好。"),
            ("我和你。", "和", "我____你。"),
            ("八点半。", "半", "八点____。"),
        ]:
            with self.subTest(hanzi=hanzi):
                self.assertEqual(_cloze_replace_all(text, hanzi, self.COMPOUNDS), expected)

    def test_char_inside_compound_is_not_blanked(self):
        """Khoét 学 trong 学习 sẽ tạo chỗ trống không phải một từ → phải bỏ."""
        for text, hanzi in [("我学习中文。", "学"), ("椅子下。", "子"), ("它是一只猫。", "只")]:
            with self.subTest(hanzi=hanzi):
                self.assertIsNone(_cloze_replace_all(text, hanzi, self.COMPOUNDS))

    def test_multi_char_word_still_blanked(self):
        self.assertEqual(_cloze_replace_all("我学习中文。", "学习", self.COMPOUNDS), "我____中文。")

    def test_mixed_occurrences_blank_only_standalone(self):
        self.assertEqual(
            _cloze_replace_all("他和他们一起去。", "他", self.COMPOUNDS),
            "____和他们一起去。",
        )

    def test_absent_word_returns_none(self):
        self.assertIsNone(_cloze_replace_all("我爱北京。", "猫", self.COMPOUNDS))


class CoverageTestBase(unittest.TestCase):
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


class ExactlyFourOptionsTest(CoverageTestBase):
    """Hồi quy: pick_count=8 từng tạo 9 option → cổng QA loại sạch câu."""

    def test_every_type_yields_exactly_four_options(self):
        with self.Session() as db:
            words = _seed_level(db, 1, 12)
            gen = QuestionGeneratorService(db)
            for quiz_type in (
                QuizType.vocab,
                QuizType.listening,
                QuizType.dialogue,
                QuizType.translation,
                QuizType.cloze,
                QuizType.reading,
            ):
                with self.subTest(quiz_type=quiz_type.value):
                    options, correct_index, option_word_ids = gen._options_with_words(
                        words[0], quiz_type, seed=42
                    )
                    self.assertEqual(len(options), 4, f"{quiz_type.value}: {len(options)} lựa chọn")
                    self.assertEqual(len(option_word_ids), 4)
                    self.assertTrue(0 <= correct_index < 4)
                    self.assertEqual(len(set(options)), 4, "lựa chọn phải khác nhau")

    def test_sentence_types_produce_questions(self):
        """Ba dạng câu/đoạn phải vào được bank, không bị loại im lặng."""
        with self.Session() as db:
            _seed_level(db, 1, 12)
            gen = QuestionGeneratorService(db)
            for quiz_type in (QuizType.listening, QuizType.dialogue, QuizType.translation):
                with self.subTest(quiz_type=quiz_type.value):
                    added = gen.ensure_coverage(1, quiz_type, batch=5)
                    self.assertGreater(added, 0, f"{quiz_type.value} không sinh được câu nào")


class SourceWordSpreadTest(CoverageTestBase):
    """``_source_words`` phải lan ra từ chưa phủ, không bám đầu bảng."""

    def test_prefers_uncovered_words(self):
        with self.Session() as db:
            words = _seed_level(db, 1, 20)
            covered = words[:5]
            for word in covered:
                db.add(Question(
                    word_id=word.id,
                    level=1,
                    quiz_type=QuizType.vocab,
                    prompt=f"Chọn nghĩa đúng của: {word.hanzi}",
                    options=["a", "b", "c", "d"],
                    correct_index=0,
                    explanation="giai thich",
                    metadata_json={"question_subtype": "meaning"},
                ))
            db.commit()

            picked = QuestionGeneratorService(db)._source_words(1, QuizType.vocab, 10)
            picked_ids = {word.id for word in picked}
            covered_ids = {word.id for word in covered}
            self.assertEqual(len(picked), 10)
            self.assertFalse(
                picked_ids & covered_ids,
                "từ đã có câu không được ưu tiên khi còn từ chưa phủ",
            )

    def test_example_required_types_skip_words_without_examples(self):
        """cloze cần ví dụ chứa từ đích → từ không có ví dụ phải bị loại."""
        with self.Session() as db:
            _seed_level(db, 2, 6)
            bare = Word(hanzi="孤", pinyin="gu", meaning_vi="le loi", hsk_level=2, pos="n")
            db.add(bare)
            db.commit()

            picked = QuestionGeneratorService(db)._source_words(2, QuizType.cloze, 50)
            self.assertNotIn(bare.id, {word.id for word in picked})
            # vocab không cần ví dụ → từ đó vẫn phải xuất hiện.
            picked_vocab = QuestionGeneratorService(db)._source_words(2, QuizType.vocab, 50)
            self.assertIn(bare.id, {word.id for word in picked_vocab})


class EnsureCoverageTest(CoverageTestBase):
    def test_coverage_grows_then_saturates(self):
        with self.Session() as db:
            _seed_level(db, 3, 10)
            gen = QuestionGeneratorService(db)

            done_before, total = gen.coverage(3, QuizType.vocab)
            self.assertEqual(done_before, 0)
            self.assertEqual(total, 10)

            added = gen.ensure_coverage(3, QuizType.vocab, batch=10)
            self.assertGreater(added, 0)

            done_after, _ = gen.coverage(3, QuizType.vocab)
            self.assertEqual(done_after, added)

            # Chạy lại: không còn từ nào chưa phủ trong phần đã xử lý.
            again = gen.ensure_coverage(3, QuizType.vocab, batch=10)
            self.assertEqual(again, total - done_after)

    def test_coverage_denominator_uses_capable_words_only(self):
        """Mẫu số của cloze là số từ CÓ ví dụ phù hợp, không phải toàn cấp."""
        with self.Session() as db:
            _seed_level(db, 4, 5)
            db.add(Word(hanzi="孑", pinyin="jie", meaning_vi="don doc", hsk_level=4, pos="n"))
            db.commit()

            gen = QuestionGeneratorService(db)
            _, cloze_total = gen.coverage(4, QuizType.cloze)
            _, vocab_total = gen.coverage(4, QuizType.vocab)
            self.assertEqual(cloze_total, 5)
            self.assertEqual(vocab_total, 6)

    def test_written_questions_pass_qa_gate(self):
        """Câu ghi vào bank phải đúng 4 option và correct_index hợp lệ."""
        with self.Session() as db:
            _seed_level(db, 5, 8)
            gen = QuestionGeneratorService(db)
            for quiz_type in (QuizType.vocab, QuizType.listening, QuizType.cloze, QuizType.translation):
                gen.ensure_coverage(5, quiz_type, batch=8)

            rows = db.scalars(select(Question).where(Question.level == 5)).all()
            self.assertGreater(len(rows), 0)
            for row in rows:
                with self.subTest(question_id=row.id, quiz_type=row.quiz_type.value):
                    self.assertEqual(len(row.options), 4)
                    self.assertEqual(len(set(row.options)), 4)
                    self.assertTrue(0 <= row.correct_index < 4)
                    self.assertTrue(row.explanation.strip())


if __name__ == "__main__":
    unittest.main()
