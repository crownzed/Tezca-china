"""Test tất định cho repair_service (logic thuần, không cần DB).

Chạy: cd backend && .venv/bin/python -m unittest tests.test_repair -v
"""

import unittest
from collections import Counter

from app.services.enrichment_service import classify_error
from app.services.repair_service import REPAIR_MAPPING, _PRIORITY, RepairService


class RepairMappingTest(unittest.TestCase):
    def test_every_error_tag_has_mapping(self):
        # Mọi tag mà classify_error có thể sinh ra phải có repair mapping.
        produced = {
            "tone_error",
            "sound_error",
            "hanzi_error",
            "meaning_error",
            "context_error",
        }
        for tag in produced:
            self.assertIn(tag, REPAIR_MAPPING)

    def test_mapping_entries_complete(self):
        for tag, entry in REPAIR_MAPPING.items():
            self.assertIn("label", entry)
            self.assertIn("method", entry)
            self.assertIn("quiz_type", entry)
            self.assertIn("tone", entry)

    def test_priority_covers_all_mapping_tags(self):
        # _PRIORITY phải bao trùm mọi tag trong mapping để tie-break luôn quyết định được.
        self.assertEqual(set(_PRIORITY), set(REPAIR_MAPPING.keys()))


class DominantTagTest(unittest.TestCase):
    def setUp(self):
        # _dominant_tag không chạm DB nên gọi qua instance giả lập (db=None).
        self.svc = RepairService.__new__(RepairService)

    def test_clear_majority(self):
        counts = Counter({"hanzi_error": 5, "sound_error": 2, "meaning_error": 1})
        self.assertEqual(self.svc._dominant_tag(counts), "hanzi_error")

    def test_tie_breaks_by_priority(self):
        # Cùng tần suất -> lỗi nền tảng (tone) thắng theo _PRIORITY.
        counts = Counter({"meaning_error": 3, "tone_error": 3})
        self.assertEqual(self.svc._dominant_tag(counts), "tone_error")

    def test_empty_falls_back_to_meaning(self):
        self.assertEqual(self.svc._dominant_tag(Counter()), "meaning_error")


class ClassifyToRepairChainTest(unittest.TestCase):
    """Kiểm tra tag do classify_error sinh ra luôn dẫn tới một repair hợp lệ."""

    def _assert_repairable(self, correct, selected, skill="recognition"):
        result = classify_error(correct, selected, skill=skill)
        tag = result["error_tag"]
        self.assertIn(tag, REPAIR_MAPPING, f"tag {tag} thiếu repair mapping")

    def test_tone_chain(self):
        self._assert_repairable(
            {"hanzi": "买", "pinyin": "mǎi", "meaning_vi": "mua"},
            {"hanzi": "卖", "pinyin": "mài", "meaning_vi": "bán"},
        )

    def test_sound_chain(self):
        self._assert_repairable(
            {"hanzi": "是", "pinyin": "shì", "meaning_vi": "là"},
            {"hanzi": "四", "pinyin": "sì", "meaning_vi": "bốn"},
        )

    def test_meaning_chain(self):
        self._assert_repairable(
            {"hanzi": "大", "pinyin": "dà", "meaning_vi": "to"},
            {"hanzi": "猫", "pinyin": "māo", "meaning_vi": "mèo"},
        )


if __name__ == "__main__":
    unittest.main()
