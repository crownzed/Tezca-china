"""Test tất định cho enrichment_service.

Chạy: cd backend && .venv/bin/python -m unittest tests.test_enrichment -v
Không cần pytest hay DB — chỉ kiểm tra logic thuần.
"""

import unittest

from app.services.enrichment_service import (
    character_family,
    classify_error,
    component_hint,
    compute_confusables,
    confusable_hanzi,
    strip_tones,
    tone_pattern,
    topic,
)


class TonePatternTest(unittest.TestCase):
    def test_single_syllable(self):
        self.assertEqual(tone_pattern("wǒ"), "3")
        self.assertEqual(tone_pattern("nǐ"), "3")
        self.assertEqual(tone_pattern("hǎo"), "3")

    def test_multi_syllable_spaced(self):
        self.assertEqual(tone_pattern("yīn wèi"), "1-4")

    def test_multi_syllable_joined(self):
        # Không có khoảng trắng -> tách theo cụm nguyên âm.
        self.assertEqual(tone_pattern("xuéxí"), "2-2")
        self.assertEqual(tone_pattern("Zhōngguó"), "1-2")
        self.assertEqual(tone_pattern("yīnwèi"), "1-4")

    def test_neutral_tone(self):
        # Từ toàn thanh nhẹ -> 'neutral' (khớp convention frontend).
        self.assertEqual(tone_pattern("men"), "neutral")

    def test_digit_pinyin(self):
        # Pinyin số: ni3 hao3 -> 3-3.
        self.assertEqual(tone_pattern("ni3 hao3"), "3-3")
        self.assertEqual(tone_pattern("men2"), "2")

    def test_empty(self):
        self.assertEqual(tone_pattern(""), "")


class StripTonesTest(unittest.TestCase):
    def test_removes_diacritics_and_spaces(self):
        self.assertEqual(strip_tones("Zhōngguó"), "zhongguo")
        self.assertEqual(strip_tones("yīn wèi"), "yinwei")

    def test_u_umlaut_maps_to_v(self):
        self.assertEqual(strip_tones("nǚ"), "nv")

    def test_digits_removed(self):
        self.assertEqual(strip_tones("ni3hao3"), "nihao")

    def test_empty(self):
        self.assertEqual(strip_tones(""), "")


class ComponentHintTest(unittest.TestCase):
    def test_category_and_strokes(self):
        # Chữ không có hint thủ công -> fallback loại từ + số nét.
        self.assertEqual(component_hint("猫", "noun", 5), "Danh từ · 5 nét")
        self.assertEqual(component_hint("跑", "verb", 8), "Động từ · 8 nét")

    def test_category_only(self):
        self.assertEqual(component_hint("猫", "pronoun", None), "Đại từ")

    def test_unknown_category(self):
        self.assertEqual(component_hint("猫", "xyz", 3), "3 nét")

    def test_manual_hint_takes_priority(self):
        # Chữ có giải thích thủ công -> ưu tiên hơn loại từ + số nét.
        self.assertIn("học tập", component_hint("学", "noun", 8))

    def test_empty(self):
        self.assertEqual(
            component_hint("", "", None),
            "Gắn chữ, âm, nghĩa và ví dụ trong cùng một lượt học.",
        )


class CharacterFamilyTest(unittest.TestCase):
    def test_shared_character(self):
        corpus = {"学习", "学校", "你好"}
        self.assertEqual(character_family("学习", corpus), "学")

    def test_no_shared_character(self):
        corpus = {"我", "你好"}
        self.assertEqual(character_family("我", corpus), "")


class ConfusablesTest(unittest.TestCase):
    def setUp(self):
        self.corpus = [
            {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"},
            {"hanzi": "她", "pinyin": "tā", "meaning_vi": "cô ấy"},
            {"hanzi": "它", "pinyin": "tā", "meaning_vi": "nó"},
            {"hanzi": "太", "pinyin": "tài", "meaning_vi": "quá"},
            {"hanzi": "学习", "pinyin": "xuéxí", "meaning_vi": "học tập"},
            {"hanzi": "学校", "pinyin": "xuéxiào", "meaning_vi": "trường học"},
            {"hanzi": "苹果", "pinyin": "píngguǒ", "meaning_vi": "táo"},
        ]

    def test_homophone_ranked_first(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        result = compute_confusables(target, self.corpus)
        hanzi = [r["hanzi"] for r in result]
        # 她 và 它 đồng âm -> phải đứng trước 太 (gần âm).
        self.assertIn("她", hanzi[:2])
        self.assertIn("它", hanzi[:2])
        self.assertLess(hanzi.index("她"), hanzi.index("太"))

    def test_shared_char_detected(self):
        target = {"hanzi": "学习", "pinyin": "xuéxí", "meaning_vi": "học tập"}
        result = compute_confusables(target, self.corpus)
        hanzi = [r["hanzi"] for r in result]
        self.assertIn("学校", hanzi)
        reason = next(r["reason"] for r in result if r["hanzi"] == "学校")
        self.assertIn("学", reason)

    def test_unrelated_word_excluded(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        result = compute_confusables(target, self.corpus)
        # 苹果 chẳng liên quan âm/chữ/nghĩa -> không xuất hiện.
        self.assertNotIn("苹果", [r["hanzi"] for r in result])

    def test_deterministic(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        first = compute_confusables(target, self.corpus)
        second = compute_confusables(target, self.corpus)
        self.assertEqual(first, second)

    def test_excludes_self(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        result = compute_confusables(target, self.corpus)
        self.assertNotIn("他", [r["hanzi"] for r in result])


class ConfusableHanziTest(unittest.TestCase):
    def setUp(self):
        self.corpus = [
            {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"},
            {"hanzi": "她", "pinyin": "tā", "meaning_vi": "cô ấy"},
            {"hanzi": "它", "pinyin": "tā", "meaning_vi": "nó"},
            {"hanzi": "太", "pinyin": "tài", "meaning_vi": "quá"},
            {"hanzi": "苹果", "pinyin": "píngguǒ", "meaning_vi": "táo"},
        ]

    def test_returns_list_of_str(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        result = confusable_hanzi(target, self.corpus)
        self.assertTrue(all(isinstance(h, str) for h in result))

    def test_manual_pairs_first(self):
        # 他 -> cặp thủ công 她/它 phải đứng đầu.
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        result = confusable_hanzi(target, self.corpus)
        self.assertEqual(set(result[:2]), {"她", "它"})

    def test_only_corpus_hanzi(self):
        # Cặp thủ công 买/卖 nhưng 卖 không có trong corpus -> bị loại.
        target = {"hanzi": "买", "pinyin": "mǎi", "meaning_vi": "mua"}
        result = confusable_hanzi(target, self.corpus)
        self.assertNotIn("卖", result)

    def test_excludes_self(self):
        target = {"hanzi": "他", "pinyin": "tā", "meaning_vi": "anh ấy"}
        self.assertNotIn("他", confusable_hanzi(target, self.corpus))


class ClassifyErrorTest(unittest.TestCase):
    def test_tone_error(self):
        # Cùng âm (bỏ thanh), khác mẫu thanh -> tone_error.
        correct = {"hanzi": "买", "pinyin": "mǎi", "meaning_vi": "mua"}
        selected = {"hanzi": "卖", "pinyin": "mài", "meaning_vi": "bán"}
        result = classify_error(correct, selected)
        self.assertEqual(result["error_tag"], "tone_error")
        self.assertEqual(result["confusion"], "买→卖")

    def test_sound_error_pair(self):
        # shi vs si -> cặp dễ lẫn sh/s.
        correct = {"hanzi": "是", "pinyin": "shì", "meaning_vi": "là"}
        selected = {"hanzi": "四", "pinyin": "sì", "meaning_vi": "bốn"}
        result = classify_error(correct, selected)
        self.assertEqual(result["error_tag"], "sound_error")
        self.assertEqual(result["detail"], "confusion_s_sh")

    def test_sound_error_near(self):
        # Lệch 1 ký tự pinyin nhưng không thuộc cặp -> near_sound.
        correct = {"hanzi": "big", "pinyin": "ba", "meaning_vi": "a"}
        selected = {"hanzi": "small", "pinyin": "bo", "meaning_vi": "b"}
        result = classify_error(correct, selected)
        self.assertEqual(result["error_tag"], "sound_error")

    def test_hanzi_error_shared_char(self):
        # Chung ký tự nhưng âm khác hẳn -> hanzi_error.
        correct = {"hanzi": "妈妈", "pinyin": "māma", "meaning_vi": "mẹ"}
        selected = {"hanzi": "马上", "pinyin": "mǎshàng", "meaning_vi": "ngay"}
        # 妈 và 马 không chung ký tự; dùng ví dụ chung ký tự rõ ràng:
        correct = {"hanzi": "中国", "pinyin": "zhōngguó", "meaning_vi": "Trung Quốc"}
        selected = {"hanzi": "中文", "pinyin": "zhōngwén", "meaning_vi": "tiếng Trung"}
        result = classify_error(correct, selected)
        self.assertEqual(result["error_tag"], "hanzi_error")

    def test_meaning_error_default(self):
        # Khác âm, khác chữ -> meaning_error (recognition).
        correct = {"hanzi": "猫", "pinyin": "māo", "meaning_vi": "mèo"}
        selected = {"hanzi": "狗", "pinyin": "gǒu", "meaning_vi": "chó"}
        result = classify_error(correct, selected)
        self.assertEqual(result["error_tag"], "meaning_error")

    def test_no_selected_falls_back_to_skill(self):
        correct = {"hanzi": "猫", "pinyin": "māo", "meaning_vi": "mèo"}
        self.assertEqual(classify_error(correct, None, skill="listening")["error_tag"], "sound_error")
        self.assertEqual(classify_error(correct, None, skill="context")["error_tag"], "context_error")
        self.assertEqual(classify_error(correct, None, skill="recognition")["error_tag"], "meaning_error")


class TopicTest(unittest.TestCase):
    def test_school(self):
        self.assertEqual(topic("学校", "trường học"), "school")

    def test_number(self):
        self.assertEqual(topic("四", "số bốn"), "number")

    def test_fallback_core(self):
        self.assertEqual(topic("龙", "rồng"), "core")


if __name__ == "__main__":
    unittest.main()
