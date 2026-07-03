"""Test tất định cho enrichment_service (validator + dedupe).

Chạy: cd backend && python -m unittest tests.test_enrichment -v
Không cần DB, không gọi LLM — chỉ kiểm tra logic thuần + dedupe trên fake session.
"""

import unittest
from types import SimpleNamespace

from app.services.enrichment_service import (
    AI_SOURCE,
    TARGET_CONFUSABLES,
    _validate_confusable,
    _validate_example,
    enrich_word,
)


def _word(hanzi="学习", hsk_level=1, confusables=None):
    """Fake Word đủ field mà validator/enrich_word dùng (không chạm ORM)."""
    return SimpleNamespace(
        id=1,
        hanzi=hanzi,
        pinyin="xuéxí",
        meaning_vi="học tập",
        meaning_en="study",
        hsk_level=hsk_level,
        pos="v",
        confusable_words_json=confusables if confusables is not None else [],
    )


class ValidateExampleTest(unittest.TestCase):
    def test_good_example_passes(self):
        ok, _ = _validate_example("我每天学习中文。", "Tôi học tiếng Trung mỗi ngày.", _word())
        self.assertTrue(ok)

    def test_missing_target_hanzi_rejected(self):
        ok, reason = _validate_example("我每天看书。", "Tôi đọc sách mỗi ngày.", _word())
        self.assertFalse(ok)
        self.assertIn("hanzi", reason)

    def test_empty_cn_rejected(self):
        ok, _ = _validate_example("", "có dịch", _word())
        self.assertFalse(ok)

    def test_empty_vi_rejected(self):
        ok, _ = _validate_example("我学习。", "", _word())
        self.assertFalse(ok)

    def test_too_short_rejected(self):
        # 1 ký tự Hán duy nhất (chính là target) → không đủ ngữ cảnh cloze.
        ok, reason = _validate_example("学", "học", _word(hanzi="学"))
        self.assertFalse(ok)
        self.assertIn("short", reason)

    def test_exceeds_level_cap_rejected(self):
        # HSK1 cap = 16 ký tự Hán. Dựng câu dài vượt cap nhưng vẫn chứa target.
        long_cn = "学习" + "书" * 20
        ok, reason = _validate_example(long_cn, "quá dài", _word(hsk_level=1))
        self.assertFalse(ok)
        self.assertIn("cap", reason)


class ValidateConfusableTest(unittest.TestCase):
    def test_good_confusable_passes(self):
        ok, _ = _validate_confusable("练习", _word())
        self.assertTrue(ok)

    def test_same_as_target_rejected(self):
        ok, reason = _validate_confusable("学习", _word(hanzi="学习"))
        self.assertFalse(ok)
        self.assertIn("same", reason)

    def test_empty_rejected(self):
        ok, _ = _validate_confusable("   ", _word())
        self.assertFalse(ok)

    def test_non_cjk_rejected(self):
        ok, reason = _validate_confusable("abc", _word())
        self.assertFalse(ok)
        self.assertIn("CJK", reason)


class FakeSession:
    """Session giả: giữ Example đã 'thêm' trong list, hỗ trợ scalars(select...)."""

    def __init__(self, existing_examples=None):
        self._existing = list(existing_examples or [])
        self.added = []

    def scalars(self, _query):
        # enrich_word iterate trực tiếp trên kết quả scalars → trả list là đủ.
        return list(self._existing)

    def add(self, obj):
        self.added.append(obj)


class EnrichWordDedupeTest(unittest.TestCase):
    def test_dedupe_against_existing_cn(self):
        existing = [SimpleNamespace(sentence_cn="我每天学习中文。", sentence_vi="", source="tatoeba")]
        db = FakeSession(existing)
        word = _word()
        data = {
            "examples": [
                {"cn": "我每天学习中文。", "vi": "trùng nên bỏ"},   # dup
                {"cn": "他喜欢学习新东西。", "vi": "Anh ấy thích học cái mới."},  # mới
            ],
            "confusables": [],
        }
        stats = enrich_word(db, word, data)
        self.assertEqual(stats["examples_added"], 1)
        self.assertEqual(len(db.added), 1)
        self.assertEqual(db.added[0].source, AI_SOURCE)

    def test_dedupe_within_batch(self):
        db = FakeSession()
        data = {
            "examples": [
                {"cn": "我在学习。", "vi": "Tôi đang học."},
                {"cn": "我在学习。", "vi": "trùng trong batch"},
            ],
            "confusables": [],
        }
        stats = enrich_word(db, _word(), data)
        self.assertEqual(stats["examples_added"], 1)

    def test_confusables_capped_and_normalized(self):
        # List cũ dạng legacy dict + str; thêm mới, cap ở TARGET_CONFUSABLES.
        db = FakeSession()
        word = _word(confusables=[{"hanzi": "学校"}, "练习"])
        data = {"examples": [], "confusables": ["复习", "学生", "教室", "作业", "课本", "老师"]}
        stats = enrich_word(db, word, data)
        self.assertEqual(len(word.confusable_words_json), TARGET_CONFUSABLES)
        self.assertTrue(all(isinstance(h, str) for h in word.confusable_words_json))
        # Giữ phần tử cũ trước (đã normalize 学校 từ dict).
        self.assertEqual(word.confusable_words_json[0], "学校")
        self.assertEqual(stats["confusables_added"], TARGET_CONFUSABLES - 2)

    def test_duplicate_confusable_not_readded(self):
        db = FakeSession()
        word = _word(confusables=["练习"])
        data = {"examples": [], "confusables": ["练习", "复习"]}
        stats = enrich_word(db, word, data)
        self.assertEqual(stats["confusables_added"], 1)
        self.assertEqual(word.confusable_words_json, ["练习", "复习"])


if __name__ == "__main__":
    unittest.main()
