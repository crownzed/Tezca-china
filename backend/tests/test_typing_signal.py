"""Test tất định cho gom tín hiệu lỗi gõ (typing) vào error_json.typing.

SPEC v2 mục 3.1: usage habit đo qua lỗi thực tế, gồm lỗi gõ pinyin/hanzi.
``OutputService._merge_typing_signal`` là static pure → test không cần DB.

Chạy: cd backend && .venv/bin/python -m unittest tests.test_typing_signal -v
"""

import unittest

from app.services.output_service import OutputService

merge = OutputService._merge_typing_signal

class MergeTypingSignalTest(unittest.TestCase):
    def test_none_detail_is_noop(self):
        errors = {"tone": 2}
        merge(errors, None)
        self.assertEqual(errors, {"tone": 2})

    def test_empty_detail_is_noop(self):
        errors = {}
        merge(errors, {})
        self.assertNotIn("typing", errors)

    def test_creates_typing_blob(self):
        errors = {}
        merge(errors, {"backspaces": 3, "pinyin_typos": 2})
        self.assertEqual(errors["typing"], {"backspaces": 3, "pinyin_typos": 2})

    def test_accumulates_existing_counts(self):
        errors = {"typing": {"backspaces": 5, "wrong_char": 1}}
        merge(errors, {"backspaces": 2, "wrong_char": 3, "corrections": 1})
        self.assertEqual(
            errors["typing"],
            {"backspaces": 7, "wrong_char": 4, "corrections": 1},
        )

    def test_ignores_unknown_and_zero_keys(self):
        errors = {}
        merge(errors, {"backspaces": 0, "garbage": 9, "keystrokes": 12})
        self.assertEqual(errors["typing"], {"keystrokes": 12})

    def test_ignores_non_numeric(self):
        errors = {}
        merge(errors, {"backspaces": "lots", "corrections": 2})
        self.assertEqual(errors["typing"], {"corrections": 2})

    def test_preserves_other_error_tags(self):
        errors = {"tone": 4, "confusable": 1}
        merge(errors, {"pinyin_typos": 3})
        self.assertEqual(errors["tone"], 4)
        self.assertEqual(errors["confusable"], 1)
        self.assertEqual(errors["typing"], {"pinyin_typos": 3})

if __name__ == "__main__":
    unittest.main()
