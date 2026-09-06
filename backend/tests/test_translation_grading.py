"""Test cho chấm bài dịch câu — ``translation_exercise_service.grade``.

Chạy: cd backend && python -m pytest tests/test_translation_grading.py

Chấm là SO KHỚP ĐÁP ÁN MẪU (lựa chọn thay cho "AI chấm"), nên nó phải tất định và
không gọi mạng. Các ca dưới đây khoá lại đúng những gì "so khớp đáp án mẫu" phải
làm được, đặc biệt là ba ca dễ hỏng nhất:

  - gõ tiếng Việt KHÔNG DẤU vẫn phải tính đúng (chỉ hạ điểm): kỹ năng đang kiểm là
    hiểu tiếng Trung, không phải gõ có dấu;
  - dấu thanh KHÁC NGHĨA thì không được coi là đúng (``má`` vs ``mà``);
  - gõ pinyin thay chữ Hán phải có thông báo riêng, không lẫn với "dịch sai".

Không import router, không TestClient, không DB — đây là unit thuần.
"""

import unittest

from app.services import translation_exercise_service as svc

_ITEM = {
    "sentence_cn": "我每天早上七点起床。",
    "sentence_vi": "Tôi thức dậy lúc bảy giờ mỗi sáng.",
    "pinyin": "wǒ měi tiān zǎo shang qī diǎn qǐ chuáng",
    "alt_cn": ["我每天早上七点钟起床。"],
    "alt_vi": ["Mỗi sáng tôi thức dậy vào lúc bảy giờ."],
    "key_words": ["起床", "七点"],
}


class GradeCnToViTest(unittest.TestCase):
    """Chiều CN→VI: người học gõ tiếng Việt."""

    def _grade(self, answer: str) -> dict:
        return svc.grade(answer, _ITEM, svc.DIRECTION_CN_TO_VI)

    def test_exact_reference_scores_full(self):
        result = self._grade("Tôi thức dậy lúc bảy giờ mỗi sáng.")
        self.assertTrue(result["correct"])
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["error_tag"], "")

    def test_punctuation_and_case_are_ignored(self):
        result = self._grade("tôi thức dậy lúc bảy giờ mỗi sáng")
        self.assertTrue(result["correct"])
        self.assertEqual(result["score"], 100)

    def test_alternate_reference_also_counts(self):
        result = self._grade("Mỗi sáng tôi thức dậy vào lúc bảy giờ.")
        self.assertTrue(result["correct"])
        self.assertEqual(result["matched_reference"], _ITEM["alt_vi"][0])

    def test_missing_diacritics_still_correct_but_penalized(self):
        result = self._grade("Toi thuc day luc bay gio moi sang")
        self.assertTrue(result["correct"], result)
        self.assertLess(result["score"], 100)
        self.assertIn("dấu", result["feedback"])

    def test_wrong_meaning_fails(self):
        result = self._grade("Tôi đi ngủ lúc mười giờ tối.")
        self.assertFalse(result["correct"])
        self.assertEqual(result["error_tag"], "meaning_mismatch")

    def test_tone_marks_change_meaning_and_must_not_pass(self):
        """``bà``/``bả`` là hai từ khác nhau: ai đã gõ được dấu ở chỗ khác thì dấu SAI
        là lỗi thật, không phải hạn chế bàn phím. Bậc không-dấu chỉ mở khi cả câu
        không có dấu nào — nếu mở cho câu này thì bản dịch sai nghĩa sẽ được tính đúng.
        """
        item = {
            "sentence_cn": "她是我妈妈。",
            "sentence_vi": "Bà ấy là mẹ tôi.",
            "alt_cn": [],
            "alt_vi": [],
            "key_words": ["妈妈"],
        }
        wrong_tone = svc.grade("Bả ấy là mẹ tôi.", item, svc.DIRECTION_CN_TO_VI)
        self.assertFalse(wrong_tone["correct"], wrong_tone)
        self.assertEqual(wrong_tone["error_tag"], "meaning_mismatch")

        # Nhưng gõ TOÀN BỘ không dấu thì vẫn được ghi nhận (chỉ hạ điểm).
        all_bare = svc.grade("Ba ay la me toi", item, svc.DIRECTION_CN_TO_VI)
        self.assertTrue(all_bare["correct"], all_bare)
        self.assertLess(all_bare["score"], 100)

    def test_empty_answer_has_its_own_tag(self):
        result = self._grade("   ")
        self.assertFalse(result["correct"])
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["error_tag"], "empty_output")


class GradeViToCnTest(unittest.TestCase):
    """Chiều VI→CN: người học gõ tiếng Trung."""

    def _grade(self, answer: str) -> dict:
        return svc.grade(answer, _ITEM, svc.DIRECTION_VI_TO_CN)

    def test_exact_reference_scores_full(self):
        result = self._grade("我每天早上七点起床。")
        self.assertTrue(result["correct"])
        self.assertEqual(result["score"], 100)

    def test_missing_final_punctuation_is_not_an_error(self):
        result = self._grade("我每天早上七点起床")
        self.assertTrue(result["correct"])
        self.assertEqual(result["score"], 100)

    def test_alternate_chinese_wording_counts(self):
        result = self._grade("我每天早上七点钟起床")
        self.assertTrue(result["correct"])
        self.assertEqual(result["matched_reference"], _ITEM["alt_cn"][0])

    def test_missing_key_word_fails_even_with_high_overlap(self):
        """Câu đúng ngữ pháp nhưng thiếu từ khoá là lệch NỘI DUNG — phải trượt và
        phải nói rõ thiếu từ nào, nếu không người học không biết sửa gì."""
        result = self._grade("我每天早上洗澡。")
        self.assertFalse(result["correct"])
        self.assertEqual(result["error_tag"], "missing_key_word")
        self.assertIn("起床", result["missing_key_words"])

    def test_pinyin_instead_of_hanzi_has_a_dedicated_message(self):
        result = self._grade("wo mei tian zao shang qi dian qi chuang")
        self.assertFalse(result["correct"])
        self.assertEqual(result["error_tag"], "script_error")
        self.assertIn("chữ Hán", result["feedback"])

    def test_empty_answer_is_not_reported_as_wrong_script(self):
        result = self._grade("")
        self.assertEqual(result["error_tag"], "empty_output")


class GradeDirectionTest(unittest.TestCase):
    def test_reference_set_follows_the_direction(self):
        """Đổi chiều thì tập đáp án đổi theo — dịch đúng nhưng nhầm chiều phải trượt."""
        vi_answer = "Tôi thức dậy lúc bảy giờ mỗi sáng."
        self.assertTrue(svc.grade(vi_answer, _ITEM, svc.DIRECTION_CN_TO_VI)["correct"])
        self.assertFalse(svc.grade(vi_answer, _ITEM, svc.DIRECTION_VI_TO_CN)["correct"])

    def test_prompt_and_references_are_opposite_languages(self):
        self.assertEqual(svc.prompt_for(_ITEM, svc.DIRECTION_VI_TO_CN), _ITEM["sentence_vi"])
        self.assertEqual(svc.prompt_for(_ITEM, svc.DIRECTION_CN_TO_VI), _ITEM["sentence_cn"])
        self.assertIn(_ITEM["sentence_cn"], svc.references_for(_ITEM, svc.DIRECTION_VI_TO_CN))
        self.assertIn(_ITEM["sentence_vi"], svc.references_for(_ITEM, svc.DIRECTION_CN_TO_VI))

    def test_item_without_reference_says_so_instead_of_scoring_zero(self):
        """Không có đáp án mẫu thì không thể chấm. Trả 0 điểm kèm tag riêng thay vì
        để người học tưởng mình dịch sai."""
        broken = {"sentence_cn": "", "sentence_vi": "", "alt_cn": [], "alt_vi": [], "key_words": []}
        result = svc.grade("bất kỳ", broken, svc.DIRECTION_CN_TO_VI)
        self.assertFalse(result["correct"])
        self.assertEqual(result["error_tag"], "no_reference")

    def test_unknown_direction_falls_back_without_crashing(self):
        result = svc.grade("Tôi thức dậy lúc bảy giờ mỗi sáng.", _ITEM, "khong-ton-tai")
        self.assertTrue(result["correct"])


class ItemValidationTest(unittest.TestCase):
    """``_valid_item`` là chốt duy nhất giữa output LLM và người học."""

    def _base(self, **overrides) -> dict:
        item = {
            "sentence_cn": "我每天早上七点起床。",
            "sentence_vi": "Tôi thức dậy lúc bảy giờ mỗi sáng.",
            "pinyin": "wǒ měi tiān",
            "alt_cn": [],
            "alt_vi": [],
            "key_words": ["起床"],
        }
        item.update(overrides)
        return item

    def test_key_word_not_in_sentence_is_dropped(self):
        """Đây là validator quan trọng nhất: một key_word bịa ra sẽ khiến MỌI câu
        trả lời đúng bị chấm là thiếu từ."""
        item = svc._valid_item(self._base(key_words=["起床", "游泳"]))
        self.assertEqual(item["key_words"], ["起床"])

    def test_sentence_too_short_is_rejected(self):
        self.assertIsNone(svc._valid_item(self._base(sentence_cn="好。")))

    def test_vietnamese_translation_with_untranslated_chinese_is_rejected(self):
        self.assertIsNone(svc._valid_item(self._base(sentence_vi="Tôi 每天早上七点 thức dậy.")))

    def test_missing_vietnamese_is_rejected(self):
        self.assertIsNone(svc._valid_item(self._base(sentence_vi="  ")))

    def test_alternate_answers_are_filtered_by_script(self):
        item = svc._valid_item(self._base(
            alt_cn=["我七点钟起床。", "Toi thuc day"],
            alt_vi=["Mỗi sáng tôi thức dậy lúc bảy giờ.", "我七点起床"],
        ))
        self.assertEqual(item["alt_cn"], ["我七点钟起床。"])
        self.assertEqual(item["alt_vi"], ["Mỗi sáng tôi thức dậy lúc bảy giờ."])

    def test_alternate_identical_to_main_answer_is_dropped(self):
        item = svc._valid_item(self._base(alt_cn=["我每天早上七点起床"]))
        self.assertEqual(item["alt_cn"], [])

    def test_non_dict_row_is_rejected(self):
        self.assertIsNone(svc._valid_item("我每天早上七点起床。"))


if __name__ == "__main__":
    unittest.main()
