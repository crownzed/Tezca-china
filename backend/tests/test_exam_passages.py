"""Test tất định cho ngân hàng đoạn văn chuẩn đề thi (选词填空 / 阅读理解).

Chạy: cd backend && python -m unittest tests.test_exam_passages -v
Không cần DB, không gọi LLM — chỉ đọc app/data/exam_passages.json và kiểm tra
dữ liệu + payload do ExamPassageBank dựng ra.

LƯU Ý ĐỒNG BỘ: cùng bộ quy tắc được cài ở ``scripts/validate-exam-passages.mjs``
(cổng build phía frontend). Sửa một bên thì sửa cả bên kia.
"""

import json
import re
import unittest
from pathlib import Path

from app.services.exam_passage_service import (
    EXAM_BANK_SOURCE,
    QUESTION_SUBTYPE_GUIDED_CLOZE,
    QUESTION_SUBTYPE_READING_COMP,
    ExamPassageBank,
)

BANK_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "exam_passages.json"

# Trần độ dài đoạn (số ký tự CJK) theo cấp HSK. Khác với
# ``_PARAGRAPH_CJK_CAP_BY_LEVEL`` trong question_generator: cap đó dành cho câu
# ví dụ ĐƠN của một từ, còn đây là đoạn nhiều câu nên nới rộng theo cấp.
PASSAGE_CJK_CAP = {1: 45, 2: 70, 3: 120, 4: 160, 5: 200, 6: 240}

CLOZE_SKILLS = {"pos", "collocation", "conjunction", "logic"}
READING_SKILLS = {"scanning", "skimming", "inference", "reference"}

LEVELS = range(1, 7)
BLANK_RE = re.compile(r"\{\{(\d+)\}\}")
CJK_RE = re.compile(r"[㐀-鿿]")


def count_cjk(text: str) -> int:
    return len(CJK_RE.findall(text or ""))


class ExamBankDataTest(unittest.TestCase):
    """Kiểm tra dữ liệu thô trong JSON."""

    @classmethod
    def setUpClass(cls):
        cls.raw = json.loads(BANK_PATH.read_text(encoding="utf-8"))
        cls.cloze = cls.raw["cloze"]
        cls.reading = cls.raw["reading"]

    def test_ids_unique_across_bank(self):
        ids = [p["id"] for p in self.cloze] + [p["id"] for p in self.reading]
        duplicates = {i for i in ids if ids.count(i) > 1}
        self.assertEqual(duplicates, set(), f"id trùng: {sorted(duplicates)}")

    def test_every_level_has_both_types(self):
        for level in LEVELS:
            for kind, passages in (("cloze", self.cloze), ("reading", self.reading)):
                found = [p for p in passages if p["hsk_level"] == level]
                self.assertTrue(found, f"HSK {level} thiếu đoạn {kind}")

    def test_passage_length_within_level_cap(self):
        for passages in (self.cloze, self.reading):
            for p in passages:
                cap = PASSAGE_CJK_CAP[p["hsk_level"]]
                length = count_cjk(p["passage"])
                self.assertLessEqual(
                    length, cap,
                    f"{p['id']}: {length} ký tự CJK > trần {cap} của HSK {p['hsk_level']}",
                )

    def test_cloze_markers_match_blanks(self):
        for p in self.cloze:
            markers = [int(m) for m in BLANK_RE.findall(p["passage"])]
            indices = [b["index"] for b in p["blanks"]]
            self.assertEqual(
                len(markers), len(set(markers)),
                f"{p['id']}: marker {{{{n}}}} bị lặp",
            )
            self.assertEqual(
                sorted(markers), sorted(indices),
                f"{p['id']}: marker trong đoạn không khớp danh sách blanks",
            )

    def test_cloze_word_bank_shape(self):
        for p in self.cloze:
            bank = p["word_bank"]
            self.assertEqual(len(bank), 4, f"{p['id']}: word_bank phải có đúng 4 từ")
            hanzi = [e["hanzi"] for e in bank]
            self.assertEqual(len(set(hanzi)), 4, f"{p['id']}: word_bank có từ trùng")
            for entry in bank:
                for field in ("hanzi", "pinyin", "meaning_vi"):
                    self.assertTrue(
                        str(entry.get(field, "")).strip(),
                        f"{p['id']}: word_bank thiếu {field}",
                    )

    def test_cloze_answers_in_word_bank(self):
        for p in self.cloze:
            hanzi = {e["hanzi"] for e in p["word_bank"]}
            for blank in p["blanks"]:
                self.assertIn(
                    blank["answer"], hanzi,
                    f"{p['id']} chỗ {blank['index']}: đáp án không có trong word_bank",
                )

    def test_full_cloze_uses_every_bank_word(self):
        """Đoạn 4 chỗ trống phải dùng hết 4 từ — đúng khuôn 选词填空."""
        for p in self.cloze:
            if len(p["blanks"]) != 4:
                continue
            answers = {b["answer"] for b in p["blanks"]}
            self.assertEqual(
                len(answers), 4,
                f"{p['id']}: 4 chỗ trống nhưng chỉ dùng {len(answers)} từ khác nhau",
            )

    def test_cloze_skills_and_explanations(self):
        for p in self.cloze:
            for blank in p["blanks"]:
                self.assertIn(
                    blank["skill"], CLOZE_SKILLS,
                    f"{p['id']} chỗ {blank['index']}: skill lạ {blank['skill']!r}",
                )
                self.assertTrue(
                    str(blank.get("explanation", "")).strip(),
                    f"{p['id']} chỗ {blank['index']}: thiếu giải thích",
                )

    def test_reading_passage_has_no_blank_marker(self):
        for p in self.reading:
            self.assertFalse(
                BLANK_RE.search(p["passage"]),
                f"{p['id']}: đoạn đọc hiểu không được chứa {{{{n}}}}",
            )

    def test_reading_has_two_questions_with_main_idea(self):
        for p in self.reading:
            questions = p["questions"]
            self.assertGreaterEqual(
                len(questions), 2, f"{p['id']}: cần ít nhất 2 câu hỏi",
            )
            skills = {q["skill"] for q in questions}
            self.assertIn(
                "skimming", skills,
                f"{p['id']}: cần ít nhất 1 câu hỏi ý chính (skimming)",
            )
            for q in questions:
                self.assertIn(
                    q["skill"], READING_SKILLS,
                    f"{p['id']}: skill lạ {q['skill']!r}",
                )

    def test_reading_questions_are_chinese_mc(self):
        for p in self.reading:
            for q in p["questions"]:
                self.assertTrue(
                    count_cjk(q["stem"]) > 0,
                    f"{p['id']}: câu hỏi phải bằng tiếng Trung: {q['stem']!r}",
                )
                options = [str(o).strip() for o in q["options"]]
                self.assertEqual(len(options), 4, f"{p['id']}: cần đúng 4 lựa chọn")
                self.assertTrue(all(options), f"{p['id']}: có lựa chọn rỗng")
                self.assertEqual(len(set(options)), 4, f"{p['id']}: lựa chọn trùng nhau")
                self.assertTrue(
                    0 <= q["correct_index"] < 4,
                    f"{p['id']}: correct_index ngoài phạm vi",
                )
                self.assertTrue(
                    str(q.get("explanation", "")).strip(),
                    f"{p['id']}: thiếu giải thích",
                )


class ExamBankPayloadTest(unittest.TestCase):
    """Kiểm tra payload câu hỏi mà service dựng ra."""

    @classmethod
    def setUpClass(cls):
        cls.bank = ExamPassageBank()

    def test_cloze_prompt_has_exactly_one_blank(self):
        """Renderer frontend tách prompt bằng split(/_{2,}/) — phải đúng 1 ____."""
        for item in self.bank.cloze_items():
            blanks = re.findall(r"_{2,}", item["prompt"])
            self.assertEqual(
                len(blanks), 1,
                f"{item['metadata_json']['passage_id']}: prompt có {len(blanks)} chỗ ____",
            )
            self.assertFalse(
                BLANK_RE.search(item["prompt"]),
                "prompt còn sót marker {{n}} chưa render",
            )

    def test_cloze_other_blanks_rendered_as_labels(self):
        items = [
            i for i in self.bank.cloze_items()
            if i["metadata_json"]["blank_total"] > 1
        ]
        self.assertTrue(items, "bank phải có đoạn nhiều chỗ trống")
        for item in items:
            expected = item["metadata_json"]["blank_total"] - 1
            labels = re.findall(r"（\d+）", item["prompt"])
            self.assertEqual(
                len(labels), expected,
                f"{item['metadata_json']['passage_id']}: cần {expected} nhãn （n）",
            )

    def test_cloze_correct_index_points_to_answer(self):
        raw = {p["id"]: p for p in self.bank.passages("cloze")}
        for item in self.bank.cloze_items():
            meta = item["metadata_json"]
            passage = raw[meta["passage_id"]]
            blank = next(b for b in passage["blanks"] if b["index"] == meta["blank_index"])
            self.assertEqual(
                item["options"][item["correct_index"]], blank["answer"],
                f"{meta['passage_id']} chỗ {meta['blank_index']}: correct_index lệch",
            )

    def test_cloze_options_are_the_shared_word_bank(self):
        raw = {p["id"]: p for p in self.bank.passages("cloze")}
        for item in self.bank.cloze_items():
            meta = item["metadata_json"]
            expected = {e["hanzi"] for e in raw[meta["passage_id"]]["word_bank"]}
            self.assertEqual(
                set(item["options"]), expected,
                f"{meta['passage_id']}: options không phải word bank của đoạn",
            )

    def test_reading_correct_index_points_to_answer(self):
        raw = {p["id"]: p for p in self.bank.passages("reading")}
        for item in self.bank.reading_items():
            meta = item["metadata_json"]
            question = raw[meta["passage_id"]]["questions"][meta["question_order"] - 1]
            expected = question["options"][question["correct_index"]]
            self.assertEqual(
                item["options"][item["correct_index"]], expected,
                f"{meta['passage_id']} câu {meta['question_order']}: correct_index lệch",
            )

    def test_reading_prompt_contains_passage_and_stem(self):
        for item in self.bank.reading_items():
            meta = item["metadata_json"]
            self.assertIn(meta["passage"], item["prompt"])
            self.assertIn(meta["stem"], item["prompt"])

    def test_metadata_marks_source_and_subtype(self):
        for item in self.bank.cloze_items():
            self.assertEqual(item["metadata_json"]["source"], EXAM_BANK_SOURCE)
            self.assertEqual(
                item["metadata_json"]["question_subtype"], QUESTION_SUBTYPE_GUIDED_CLOZE
            )
        for item in self.bank.reading_items():
            self.assertEqual(item["metadata_json"]["source"], EXAM_BANK_SOURCE)
            self.assertEqual(
                item["metadata_json"]["question_subtype"], QUESTION_SUBTYPE_READING_COMP
            )

    def test_payload_shape_matches_question_contract(self):
        for item in self.bank.cloze_items() + self.bank.reading_items():
            self.assertGreaterEqual(len(item["prompt"].strip()), 5)
            self.assertGreaterEqual(len(item["explanation"].strip()), 3)
            options = [str(o).strip() for o in item["options"]]
            self.assertEqual(len(options), 4)
            self.assertTrue(all(options))
            self.assertEqual(len(set(options)), 4)
            self.assertTrue(0 <= item["correct_index"] < 4)
            self.assertIn(item["level"], LEVELS)

    def test_prompts_unique_within_level_and_type(self):
        """_seed_exam_bank dedup theo prompt nên prompt phải phân biệt được."""
        for kind, items in (("cloze", self.bank.cloze_items()), ("reading", self.bank.reading_items())):
            seen: dict[tuple[int, str], str] = {}
            for item in items:
                key = (item["level"], item["prompt"])
                self.assertNotIn(
                    key, seen,
                    f"{kind}: prompt trùng giữa {seen.get(key)} và {item['metadata_json']['passage_id']}",
                )
                seen[key] = item["metadata_json"]["passage_id"]

    def test_build_is_deterministic(self):
        """Trộn options dùng seed tất định → hai lần dựng phải giống nhau."""
        first = ExamPassageBank().cloze_items()
        second = ExamPassageBank().cloze_items()
        self.assertEqual(
            [(i["prompt"], i["options"], i["correct_index"]) for i in first],
            [(i["prompt"], i["options"], i["correct_index"]) for i in second],
        )

    def test_level_filter(self):
        for level in LEVELS:
            for kind in ("cloze", "reading"):
                items = self.bank.items(kind, level)
                self.assertTrue(items, f"HSK {level} không dựng được câu {kind}")
                self.assertTrue(all(i["level"] == level for i in items))

    def test_answer_position_varies_within_passage(self):
        """Đáp án không được luôn nằm cùng một vị trí trong một đoạn."""
        by_passage: dict[str, list[int]] = {}
        for item in self.bank.cloze_items():
            meta = item["metadata_json"]
            if meta["blank_total"] < 3:
                continue
            by_passage.setdefault(meta["passage_id"], []).append(item["correct_index"])
        varied = [pid for pid, idx in by_passage.items() if len(set(idx)) > 1]
        self.assertTrue(
            len(varied) >= len(by_passage) * 0.5,
            "vị trí đáp án quá đơn điệu giữa các chỗ trống",
        )


if __name__ == "__main__":
    unittest.main()
