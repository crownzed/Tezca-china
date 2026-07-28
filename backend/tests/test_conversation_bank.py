"""Test tất định cho ngân hàng kịch bản hội thoại.

Chạy: cd backend && python -m unittest tests.test_conversation_bank -v
Không cần DB, không gọi LLM — chỉ đọc app/data/conversation_scenarios.json và
kiểm tra dữ liệu + system prompt do ConversationBank dựng ra.

Cùng khuôn với tests/test_exam_passages.py: bank nội dung nào cũng phải có cổng
kiểm tra tất định, vì lỗi dữ liệu ở đây không làm crash mà chỉ âm thầm khiến hội
thoại dở đi (sai cấp, lộ đáp án, mất nước đi cứu hội thoại).
"""

import json
import unittest
from pathlib import Path

from app.services.conversation_bank_service import (
    CONVERSATION_BANK_SOURCE,
    ConversationBank,
    count_cjk,
)

BANK_PATH = (
    Path(__file__).resolve().parents[1] / "app" / "data" / "conversation_scenarios.json"
)

LEVELS = range(1, 7)

# Nước đi cứu hội thoại tối thiểu: người học im, và người học nói sai ngôn ngữ.
# Thiếu hai cái này là hội thoại đứng luôn ở lượt đầu.
REQUIRED_REPAIRS = {"silent", "wrong_language"}

# Số kịch bản tối thiểu mỗi cấp. Đặt 4 để pick() có đủ cái luân phiên: người học
# luyện vài lần liền một cấp mà chỉ 1-2 kịch bản thì gặp lại y nguyên vai và câu
# mở đầu, hết cảm giác nói chuyện thật.
MIN_PER_LEVEL = 4

# Số giọng điệu tối thiểu mỗi cấp. Một cấp chỉ có một register thì người học ở cấp
# đó không bao giờ luyện được cách đổi cách nói giữa bạn bè và người lạ.
MIN_REGISTERS_PER_LEVEL = 2


class ConversationBankDataTest(unittest.TestCase):
    """Kiểm tra dữ liệu thô trong JSON."""

    @classmethod
    def setUpClass(cls):
        cls.raw = json.loads(BANK_PATH.read_text(encoding="utf-8"))
        cls.scenarios = cls.raw["scenarios"]
        cls.registers = set(cls.raw["_registers"]) - {"_note"}
        cls.topics = set(cls.raw["_topics"])
        cls.triggers = set(cls.raw["_repair_triggers"]) - {"_note"}
        cls.caps = {
            int(k): int(v) for k, v in cls.raw["_turn_cjk_cap"].items() if k != "_note"
        }

    def test_ids_unique(self):
        ids = [s["id"] for s in self.scenarios]
        duplicates = {i for i in ids if ids.count(i) > 1}
        self.assertEqual(duplicates, set(), f"id trùng: {sorted(duplicates)}")

    def test_every_level_has_enough_scenarios(self):
        """Mỗi cấp phải có ít nhất MIN_PER_LEVEL kịch bản.

        Một kịch bản/cấp thì người học vào lần thứ hai gặp lại y nguyên vai, y
        nguyên câu mở đầu — hết cảm giác nói chuyện thật. pick() cũng không có gì
        để luân phiên nên luôn trả về cùng một tình huống.
        """
        for level in LEVELS:
            found = [s for s in self.scenarios if s["hsk_level"] == level]
            self.assertGreaterEqual(
                len(found), MIN_PER_LEVEL,
                f"HSK {level} chỉ có {len(found)} kịch bản, cần >= {MIN_PER_LEVEL}",
            )

    def test_every_level_has_multiple_registers(self):
        """Mỗi cấp phải luyện được nhiều hơn một giọng điệu.

        Cấp nào chỉ có 'service' thì người học chỉ biết nói kiểu mua bán; chỉ có
        'casual' thì gặp người lạ là dùng sai cách nói. Đây là lỗi âm thầm: dữ
        liệu vẫn hợp lệ, hội thoại vẫn chạy, chỉ là học lệch.
        """
        for level in LEVELS:
            found = {s["register"] for s in self.scenarios if s["hsk_level"] == level}
            self.assertGreaterEqual(
                len(found), MIN_REGISTERS_PER_LEVEL,
                f"HSK {level} chỉ có giọng điệu {sorted(found)}, "
                f"cần >= {MIN_REGISTERS_PER_LEVEL} loại",
            )

    def test_no_duplicate_topic_within_level(self):
        """Hai kịch bản cùng cấp cùng chủ đề thì cấp đó thực chất vẫn chỉ có một
        tình huống để luyện."""
        seen = {}
        for s in self.scenarios:
            key = (s["hsk_level"], s["topic"])
            self.assertNotIn(
                key, seen,
                f"{s['id']} trùng chủ đề '{s['topic']}' ở HSK {s['hsk_level']} với {seen.get(key)}",
            )
            seen[key] = s["id"]

    def test_declared_topics_are_all_used(self):
        """Chủ đề khai báo trong _topics mà không kịch bản nào dùng là danh mục
        chết: client lọc theo nó sẽ ra danh sách rỗng."""
        used = {s["topic"] for s in self.scenarios}
        unused = sorted(self.topics - used)
        self.assertEqual(
            unused, [], f"_topics khai báo nhưng chưa có kịch bản: {unused}"
        )

    def test_openings_differ_within_level(self):
        """Câu mở đầu là thứ người học nghe trước tiên — trùng nhau thì hai kịch
        bản cùng cấp cảm giác như một."""
        by_level = {}
        for s in self.scenarios:
            by_level.setdefault(s["hsk_level"], []).append(s)
        for level, items in by_level.items():
            openings = [s.get("opening_cn", "") for s in items]
            self.assertEqual(
                len(set(openings)), len(openings),
                f"HSK {level}: có kịch bản dùng chung opening_cn",
            )

    def test_topic_and_register_are_declared(self):
        for s in self.scenarios:
            self.assertIn(s["topic"], self.topics, f"{s['id']}: topic lạ")
            self.assertIn(s["register"], self.registers, f"{s['id']}: register lạ")

    def test_role_and_situation_are_filled(self):
        """Vai + tình huống là thứ phân biệt bank với prompt chung — không được rỗng."""
        for s in self.scenarios:
            for field in ("setting", "user_role", "goal"):
                self.assertTrue(
                    str(s.get(field, "")).strip(), f"{s['id']}: thiếu {field}"
                )
            role = s.get("ai_role") or {}
            for field in ("name", "persona"):
                self.assertTrue(
                    str(role.get(field, "")).strip(),
                    f"{s['id']}: ai_role thiếu {field}",
                )

    def test_opening_is_chinese_with_translation(self):
        """AI phải nói trước: hội thoại thật luôn có người mở lời."""
        for s in self.scenarios:
            self.assertGreater(
                count_cjk(s.get("opening_cn", "")), 0,
                f"{s['id']}: opening_cn phải bằng tiếng Trung",
            )
            self.assertTrue(
                str(s.get("opening_vi", "")).strip(),
                f"{s['id']}: thiếu bản dịch opening_vi",
            )

    def test_turn_lines_within_level_cap(self):
        """Mọi câu tiếng Trung AI sẽ nói/bắt chước phải nằm trong trần của cấp.

        Nếu chính few-shot đã dài hơn trần thì luật 'tối đa N chữ Hán' trong
        system prompt tự mâu thuẫn, và model sẽ theo ví dụ chứ không theo luật.
        """
        for s in self.scenarios:
            cap = self.caps[s["hsk_level"]]
            lines = [("opening_cn", s.get("opening_cn", ""))]
            lines += [("wrap_up_cn", s.get("wrap_up_cn", ""))]
            lines += [
                (f"exemplar[{i}].reply_cn", e.get("reply_cn", ""))
                for i, e in enumerate(s.get("turn_exemplars") or [])
            ]
            lines += [
                (f"repair[{m.get('trigger')}]", m.get("cn", ""))
                for m in (s.get("repair_moves") or [])
            ]
            for label, text in lines:
                length = count_cjk(text)
                self.assertLessEqual(
                    length, cap,
                    f"{s['id']} {label}: {length} chữ Hán > trần {cap} của HSK {s['hsk_level']}",
                )

    def test_exemplars_are_paired_and_chinese(self):
        for s in self.scenarios:
            exemplars = s.get("turn_exemplars") or []
            self.assertGreaterEqual(
                len(exemplars), 2,
                f"{s['id']}: cần ít nhất 2 mẫu lượt thoại để dạy được nhịp đối đáp",
            )
            for i, ex in enumerate(exemplars):
                self.assertGreater(
                    count_cjk(ex.get("user_cn", "")), 0,
                    f"{s['id']} mẫu {i}: user_cn phải bằng tiếng Trung",
                )
                self.assertGreater(
                    count_cjk(ex.get("reply_cn", "")), 0,
                    f"{s['id']} mẫu {i}: reply_cn phải bằng tiếng Trung",
                )
                self.assertTrue(
                    str(ex.get("reply_vi", "")).strip(),
                    f"{s['id']} mẫu {i}: thiếu reply_vi",
                )

    def test_exemplar_replies_are_not_identical(self):
        """Hai mẫu giống nhau thì model học được đúng một nước đi."""
        for s in self.scenarios:
            replies = [e.get("reply_cn") for e in (s.get("turn_exemplars") or [])]
            self.assertEqual(
                len(replies), len(set(replies)),
                f"{s['id']}: turn_exemplars có reply_cn trùng nhau",
            )

    def test_repair_moves_cover_required_triggers(self):
        for s in self.scenarios:
            moves = s.get("repair_moves") or []
            triggers = {str(m.get("trigger")) for m in moves}
            self.assertTrue(
                REQUIRED_REPAIRS <= triggers,
                f"{s['id']}: thiếu nước đi {sorted(REQUIRED_REPAIRS - triggers)}",
            )
            for m in moves:
                self.assertIn(
                    m.get("trigger"), self.triggers,
                    f"{s['id']}: trigger lạ {m.get('trigger')!r}",
                )
                self.assertGreater(
                    count_cjk(m.get("cn", "")), 0,
                    f"{s['id']} nước đi {m.get('trigger')}: cn phải bằng tiếng Trung",
                )

    def test_repair_moves_differ_from_opening(self):
        """Nước đi cứu hội thoại không được là câu mở đầu (hay một phần của nó).

        Người học im chính vì không hiểu câu mở đầu; đọc lại y nguyên câu đó thì
        hội thoại đứng nguyên tại chỗ. Nước đi phải là cách hỏi khác, dễ hơn.
        """
        for s in self.scenarios:
            opening = s.get("opening_cn", "")
            for m in s.get("repair_moves") or []:
                cn = m.get("cn", "")
                self.assertNotIn(
                    cn, opening,
                    f"{s['id']} nước đi {m.get('trigger')}: {cn!r} nằm trong câu "
                    f"mở đầu {opening!r} — lặp lại không giúp người học",
                )

    def test_key_vocab_shape(self):
        for s in self.scenarios:
            vocab = s.get("key_vocab") or []
            self.assertGreaterEqual(
                len(vocab), 3, f"{s['id']}: key_vocab nên có ít nhất 3 từ"
            )
            hanzi = [v.get("hanzi") for v in vocab]
            self.assertEqual(
                len(set(hanzi)), len(hanzi), f"{s['id']}: key_vocab có từ trùng"
            )
            for v in vocab:
                for field in ("hanzi", "pinyin", "meaning_vi"):
                    self.assertTrue(
                        str(v.get(field, "")).strip(),
                        f"{s['id']}: key_vocab thiếu {field}",
                    )

    def test_key_vocab_appears_in_scenario_lines(self):
        """Từ khóa phải thật sự xuất hiện trong hội thoại, không chỉ là danh sách rời."""
        for s in self.scenarios:
            corpus = " ".join(
                [str(s.get("opening_cn", "")), str(s.get("wrap_up_cn", ""))]
                + [str(e.get("user_cn", "")) for e in (s.get("turn_exemplars") or [])]
                + [str(e.get("reply_cn", "")) for e in (s.get("turn_exemplars") or [])]
                + [str(m.get("cn", "")) for m in (s.get("repair_moves") or [])]
            )
            used = [v["hanzi"] for v in s["key_vocab"] if v["hanzi"] in corpus]
            self.assertGreaterEqual(
                len(used), 2,
                f"{s['id']}: chỉ {len(used)} từ khóa xuất hiện trong các câu mẫu",
            )


class ConversationBankPromptTest(unittest.TestCase):
    """Kiểm tra system prompt mà service dựng ra."""

    @classmethod
    def setUpClass(cls):
        cls.bank = ConversationBank()

    def test_prompt_contains_role_setting_and_goal(self):
        for s in self.bank.scenarios():
            prompt = self.bank.system_prompt(s)
            self.assertIn(s["ai_role"]["name"], prompt)
            self.assertIn(s["setting"], prompt)
            self.assertIn(s["goal"], prompt)
            self.assertIn(s["user_role"], prompt)

    def test_prompt_states_level_and_turn_cap(self):
        for s in self.bank.scenarios():
            prompt = self.bank.system_prompt(s)
            level = s["hsk_level"]
            self.assertIn(f"HSK {level}", prompt)
            self.assertIn(str(self.bank.turn_cap(level)), prompt)

    def test_prompt_carries_exemplars_and_repairs(self):
        for s in self.bank.scenarios():
            prompt = self.bank.system_prompt(s)
            for ex in s["turn_exemplars"]:
                self.assertIn(ex["reply_cn"], prompt)
            for move in s["repair_moves"]:
                self.assertIn(move["cn"], prompt)

    def test_prompt_forbids_teacher_behaviour(self):
        """Luật 'không sửa lỗi, không giảng bài' là lý do bank tồn tại."""
        for s in self.bank.scenarios():
            prompt = self.bank.system_prompt(s)
            self.assertIn("KHÔNG sửa lỗi ngữ pháp", prompt)
            self.assertIn("Giữ vai", prompt)

    def test_prompt_is_deterministic(self):
        first = ConversationBank()
        second = ConversationBank()
        for a, b in zip(first.scenarios(), second.scenarios()):
            self.assertEqual(first.system_prompt(a), second.system_prompt(b))

    def test_pick_prefers_exact_level(self):
        for level in LEVELS:
            picked = self.bank.pick(level, seed=f"seed-{level}")
            self.assertIsNotNone(picked, f"HSK {level}: pick() không trả kịch bản nào")
            self.assertEqual(
                picked["hsk_level"], level,
                f"HSK {level}: pick() trả cấp {picked['hsk_level']}",
            )

    def test_pick_is_deterministic_with_seed(self):
        for level in LEVELS:
            a = self.bank.pick(level, seed="fixed")
            b = self.bank.pick(level, seed="fixed")
            self.assertEqual(a["id"], b["id"])

    def test_pick_respects_topic_filter(self):
        for s in self.bank.scenarios():
            picked = self.bank.pick(s["hsk_level"], topic=s["topic"], seed="t")
            self.assertIsNotNone(picked)
            self.assertEqual(picked["topic"], s["topic"])

    def test_get_by_id_and_unknown_id(self):
        for s in self.bank.scenarios():
            self.assertEqual(self.bank.get(s["id"])["id"], s["id"])
        self.assertIsNone(self.bank.get("khong-ton-tai"))

    def test_briefing_hides_model_instructions(self):
        """Briefing gửi ra client không được chứa câu AI sắp nói."""
        for s in self.bank.scenarios():
            briefing = self.bank.briefing(s)
            self.assertEqual(briefing["source"], CONVERSATION_BANK_SOURCE)
            self.assertNotIn("turn_exemplars", briefing)
            self.assertNotIn("repair_moves", briefing)
            blob = json.dumps(briefing, ensure_ascii=False)
            for ex in s["turn_exemplars"]:
                self.assertNotIn(
                    ex["reply_cn"], blob,
                    f"{s['id']}: briefing lộ mẫu lượt thoại của AI",
                )
            for move in s["repair_moves"]:
                self.assertNotIn(
                    move["cn"], blob,
                    f"{s['id']}: briefing lộ nước đi cứu hội thoại",
                )

    def test_briefing_has_what_learner_needs(self):
        for s in self.bank.scenarios():
            briefing = self.bank.briefing(s)
            self.assertTrue(briefing["setting"])
            self.assertTrue(briefing["goal"])
            self.assertTrue(briefing["ai_name"])
            self.assertTrue(briefing["opening"]["cn"])
            self.assertTrue(briefing["key_vocab"])

    def test_level_filter_on_scenarios(self):
        for level in LEVELS:
            items = self.bank.scenarios(level)
            self.assertTrue(items, f"HSK {level} không có kịch bản")
            self.assertTrue(all(i["hsk_level"] == level for i in items))


if __name__ == "__main__":
    unittest.main()
