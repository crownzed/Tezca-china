"""Ngân hàng đoạn văn chuẩn đề thi cho 选词填空 (cloze) và 阅读理解 (reading).

Nguồn dữ liệu duy nhất: ``backend/app/data/exam_passages.json``. Bản sao phía
frontend (``src/data/exam-passages.js``) được sinh tự động từ file này bằng
``node scripts/sync-exam-passages.mjs`` — KHÔNG sửa tay bản sao đó.

Service này chuyển mỗi đoạn văn thành các payload câu hỏi dùng đúng contract
Question hiện có (prompt/options/correct_index/explanation/metadata_json), nên
không cần thêm giá trị mới vào enum QuizType:

* cloze  → mỗi chỗ trống là một câu hỏi. Prompt là TOÀN ĐOẠN với chỗ đang hỏi
  hiển thị ``____`` và các chỗ còn lại hiển thị ``（n）``. Nhờ vậy renderer cũ
  (``prompt.split(/_{2,}/)``) vẫn chạy mà người học vẫn đọc được cả đoạn.
  4 lựa chọn = word bank dùng chung của cả đoạn.
* reading → mỗi câu hỏi con là một câu hỏi. Prompt là đoạn + câu hỏi tiếng
  Trung; metadata giữ riêng ``passage``/``stem`` để UI tách hai khối.

Thứ tự lựa chọn được trộn bằng seed tất định (dựa trên id đoạn + số thứ tự) để
prompt/options của một câu luôn giống nhau giữa các lần sinh — tránh tạo row
trùng và tránh lệch correct_index giữa lúc phục vụ và lúc chấm.

Quy tắc kiểm tra dữ liệu được nhân đôi ở ``scripts/validate-exam-passages.mjs``
(cổng build phía frontend) và ``backend/tests/test_exam_passages.py``. Sửa một
bên thì sửa cả các bên kia.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

_BANK_PATH = Path(__file__).resolve().parents[1] / "data" / "exam_passages.json"

QUESTION_SUBTYPE_GUIDED_CLOZE = "guided_cloze"
QUESTION_SUBTYPE_READING_COMP = "reading_comp_mc"

EXAM_BANK_SOURCE = "exam_bank"

_BLANK_RE = re.compile(r"\{\{(\d+)\}\}")

_FULL_PASSAGE_PREFIX = " · Đoạn đầy đủ: "


def _blank_label(index: int) -> str:
    """Nhãn cho chỗ trống KHÔNG được hỏi trong câu hiện tại."""
    return f"（{index}）"


def _render_cloze_passage(passage: str, asked_index: int) -> str:
    """Đoạn văn với đúng MỘT ``____`` (chỗ đang hỏi), các chỗ khác thành （n）."""
    def _sub(match: re.Match[str]) -> str:
        idx = int(match.group(1))
        return "____" if idx == asked_index else _blank_label(idx)

    return _BLANK_RE.sub(_sub, str(passage))


def _render_answered_passage(passage: str, blanks: list[dict[str, Any]]) -> str:
    """Đoạn văn đã điền hết đáp án — dùng trong phần giải thích."""
    answers = {int(b["index"]): str(b["answer"]) for b in blanks}
    return _BLANK_RE.sub(lambda m: answers.get(int(m.group(1)), m.group(0)), str(passage))


def _shuffled(items: list[str], seed: str) -> list[str]:
    shuffled = list(items)
    random.Random(seed).shuffle(shuffled)
    return shuffled


class ExamPassageBank:
    """Loader stateless: đọc JSON một lần, dựng payload theo yêu cầu."""

    def __init__(self, path: str | Path | None = None) -> None:
        raw = json.loads((Path(path) if path else _BANK_PATH).read_text(encoding="utf-8"))
        self._cloze: list[dict[str, Any]] = list(raw.get("cloze") or [])
        self._reading: list[dict[str, Any]] = list(raw.get("reading") or [])
        self._by_type = {"cloze": self._cloze, "reading": self._reading}

    # ---- public API ---------------------------------------------------------

    def has_bank(self, quiz_type_value: str) -> bool:
        return bool(self._by_type.get(quiz_type_value))

    def passages(self, quiz_type_value: str, level: int | None = None) -> list[dict[str, Any]]:
        passages = self._by_type.get(quiz_type_value) or []
        if level is None:
            return list(passages)
        return [p for p in passages if int(p.get("hsk_level", 0)) == int(level)]

    def items(self, quiz_type_value: str, level: int | None = None) -> list[dict[str, Any]]:
        """Payload câu hỏi cho một dạng, giữ các câu cùng đoạn liền nhau."""
        builder = {
            "cloze": self.cloze_items_for_passage,
            "reading": self.reading_items_for_passage,
        }.get(quiz_type_value)
        if builder is None:
            return []
        items: list[dict[str, Any]] = []
        for passage in self.passages(quiz_type_value, level):
            items.extend(builder(passage))
        return items

    def cloze_items(self, level: int | None = None) -> list[dict[str, Any]]:
        return self.items("cloze", level)

    def reading_items(self, level: int | None = None) -> list[dict[str, Any]]:
        return self.items("reading", level)

    # ---- builders -----------------------------------------------------------

    def cloze_items_for_passage(self, passage: dict[str, Any]) -> list[dict[str, Any]]:
        word_bank = list(passage.get("word_bank") or [])
        blanks = list(passage.get("blanks") or [])
        if len(word_bank) != 4 or not blanks:
            return []

        bank_hanzi = [str(entry["hanzi"]) for entry in word_bank]
        answered = _render_answered_passage(passage["passage"], blanks)
        passage_id = str(passage.get("id") or "")
        level = int(passage.get("hsk_level", 0))
        topic = passage.get("topic")

        items: list[dict[str, Any]] = []
        for blank in blanks:
            index = int(blank["index"])
            answer = str(blank["answer"])
            if answer not in bank_hanzi:
                continue
            options = _shuffled(bank_hanzi, f"{passage_id}:{index}")
            items.append(
                {
                    "passage_id": passage_id,
                    "level": level,
                    "prompt": _render_cloze_passage(passage["passage"], index),
                    "options": options,
                    "correct_index": options.index(answer),
                    "explanation": f"{blank.get('explanation', '')}{_FULL_PASSAGE_PREFIX}{answered}",
                    "audio_text": None,
                    "metadata_json": {
                        "source": EXAM_BANK_SOURCE,
                        "question_subtype": QUESTION_SUBTYPE_GUIDED_CLOZE,
                        "passage_id": passage_id,
                        "blank_index": index,
                        "blank_total": len(blanks),
                        "skill": blank.get("skill"),
                        "topic": topic,
                        "word_bank": word_bank,
                    },
                }
            )
        return items

    def reading_items_for_passage(self, passage: dict[str, Any]) -> list[dict[str, Any]]:
        questions = list(passage.get("questions") or [])
        if not questions:
            return []

        text = str(passage.get("passage") or "")
        passage_id = str(passage.get("id") or "")
        level = int(passage.get("hsk_level", 0))
        topic = passage.get("topic")

        items: list[dict[str, Any]] = []
        for order, question in enumerate(questions, start=1):
            raw_options = [str(opt) for opt in (question.get("options") or [])]
            correct = int(question.get("correct_index", -1))
            if len(raw_options) != 4 or not 0 <= correct < 4:
                continue
            answer = raw_options[correct]
            options = _shuffled(raw_options, f"{passage_id}:{order}")
            stem = str(question.get("stem") or "")
            items.append(
                {
                    "passage_id": passage_id,
                    "level": level,
                    "prompt": f"{text}\n\n{stem}",
                    "options": options,
                    "correct_index": options.index(answer),
                    "explanation": str(question.get("explanation") or ""),
                    "audio_text": None,
                    "metadata_json": {
                        "source": EXAM_BANK_SOURCE,
                        "question_subtype": QUESTION_SUBTYPE_READING_COMP,
                        "passage_id": passage_id,
                        "passage": text,
                        "stem": stem,
                        "question_order": order,
                        "question_total": len(questions),
                        "skill": question.get("skill"),
                        "topic": topic,
                    },
                }
            )
        return items


# Module-level singleton for easy import
_bank: ExamPassageBank | None = None


def get_exam_passage_bank() -> ExamPassageBank:
    global _bank
    if _bank is None:
        _bank = ExamPassageBank()
    return _bank
