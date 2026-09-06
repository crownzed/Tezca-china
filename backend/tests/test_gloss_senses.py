"""Test tất định cho so trùng NGHĨA của gloss tiếng Việt.

Chạy: cd backend && python -m pytest tests/test_gloss_senses.py

Khoá các hành vi từng để lỗi lọt vào bank câu hỏi (số liệu đo trên 5.881 câu
``vocab`` của dev.db):

1. Distractor trùng nghĩa với đáp án -> hai lựa chọn cùng đúng (271 câu).
2. Hai lựa chọn chỉ khác chữ hoa/thường (14 câu).
3. Gloss chứa chính chữ Hán đang hỏi -> câu tự lộ đáp án (câu 2556, từ 把).

Đồng thời khoá phía ngược: những cặp gloss KHÁC nghĩa không được coi là xung
đột, và options dạng CÂU không được đưa vào phép so này.

Không cần DB — logic thuần.
"""

import unittest

from app.services.gloss_senses import (
    conflicting_option_indexes,
    duplicate_after_normalize,
    gloss_reveals_hanzi,
    glosses_conflict,
    has_cjk,
    normalize_text,
    senses,
)


class SensesTest(unittest.TestCase):
    def test_splits_on_semicolon_and_comma(self):
        self.assertEqual(senses("thích ứng, thích nghi"), {"thích ứng", "thích nghi"})
        self.assertEqual(senses("chỉ là; nhưng mà"), {"chỉ là", "nhưng mà"})

    def test_drops_parenthetical_annotation(self):
        # 'khách sạn (cũ)' là một nghĩa kèm chú thích, không phải hai nghĩa.
        self.assertEqual(
            senses("cửa hàng; tiệm; quán; khách sạn (cũ)"),
            {"cửa hàng", "tiệm", "quán", "khách sạn"},
        )

    def test_annotation_only_gloss_keeps_content(self):
        # 把 cấp 4 và 吧 cấp 1 có gloss THUẦN chú thích. Trả tập rỗng ở đây đồng
        # nghĩa miễn mọi phép kiểm ở đúng những gloss mơ hồ nhất.
        self.assertEqual(senses("(tân ngữ đảo trí)"), {"tân ngữ đảo trí"})
        self.assertEqual(senses("(trợ từ)"), {"trợ từ"})

    def test_empty_gloss_has_no_senses(self):
        self.assertEqual(senses(""), set())
        self.assertEqual(senses(None), set())

    def test_case_and_whitespace_insensitive(self):
        self.assertEqual(senses("Thấp"), senses("  thấp  "))


class GlossesConflictTest(unittest.TestCase):
    def test_shared_sense_conflicts(self):
        # Câu 5341: hỏi 小, distractor là gloss của 少.
        self.assertTrue(glosses_conflict("nhỏ; bé; ít; trẻ", "Ít"))
        # Câu 11675: hỏi 低, distractor là gloss của 矮 — chỉ khác chữ hoa.
        self.assertTrue(glosses_conflict("thấp", "Thấp"))

    def test_annotation_difference_still_conflicts(self):
        self.assertTrue(glosses_conflict("họ", "họ (nữ)"))

    def test_distinct_meanings_do_not_conflict(self):
        self.assertFalse(glosses_conflict("cảm ơn", "cảm động"))
        self.assertFalse(glosses_conflict("bên trái", "bên phải"))

    def test_empty_never_conflicts(self):
        self.assertFalse(glosses_conflict("", "thấp"))
        self.assertFalse(glosses_conflict("thấp", None))


class OptionGateTest(unittest.TestCase):
    def test_duplicate_only_by_case_is_caught(self):
        # Câu 8357 (可能): cổng cũ so set() trên chuỗi thô nên bỏ qua cặp này.
        options = ["có thể, được phép", "Có lẽ", "Nên", "có lẽ"]
        self.assertTrue(duplicate_after_normalize(options))

    def test_distinct_options_pass(self):
        self.assertFalse(duplicate_after_normalize(["một", "hai", "ba", "bốn"]))

    def test_conflicting_index_points_at_the_distractor(self):
        options = ["có thể, được phép", "Có lẽ", "Nên", "có lẽ"]
        self.assertEqual(conflicting_option_indexes(options, 1), [3])

    def test_clean_question_has_no_conflict(self):
        options = ["nghe hay", "ăn ngon", "ngửi thơm", "nhìn đẹp"]
        self.assertEqual(conflicting_option_indexes(options, 0), [])

    def test_out_of_range_index_is_ignored(self):
        self.assertEqual(conflicting_option_indexes(["a", "b"], 5), [])
        self.assertEqual(conflicting_option_indexes(["a", "b"], -1), [])

    def test_non_list_is_ignored(self):
        self.assertEqual(conflicting_option_indexes("abc", 0), [])


class RevealTest(unittest.TestCase):
    def test_gloss_embedding_target_hanzi_is_rejected(self):
        self.assertTrue(gloss_reveals_hanzi("Đem (cấu trúc 把)", "把"))

    def test_other_hanzi_is_fine(self):
        self.assertFalse(gloss_reveals_hanzi("Đem (cấu trúc 把)", "被"))

    def test_missing_target_is_fine(self):
        self.assertFalse(gloss_reveals_hanzi("bất kỳ", ""))


class HasCjkTest(unittest.TestCase):
    def test_detects_hanzi(self):
        self.assertTrue(has_cjk("Đem (cấu trúc 把)"))

    def test_plain_vietnamese_is_clean(self):
        self.assertFalse(has_cjk("đem; đưa (giới từ đảo tân ngữ)"))


class NormalizeTest(unittest.TestCase):
    def test_collapses_whitespace_and_case(self):
        self.assertEqual(normalize_text("  Thấp   Hơn "), "thấp hơn")

    def test_none_becomes_empty(self):
        self.assertEqual(normalize_text(None), "")


if __name__ == "__main__":
    unittest.main()
