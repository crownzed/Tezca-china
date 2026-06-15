"""Repair Engine — biến error taxonomy thành nhiệm vụ sửa lỗi cụ thể.

Đọc các ``LearningEvent`` sai gần đây, gom theo ``error_tag`` (do
``classify_error`` gán), rồi áp **repair mapping** trong tài liệu chiến lược
(mục 4.6): mỗi loại lỗi có một cách sửa và một dạng bài phù hợp.

Trước đây các tag như ``tone_error``/``hanzi_error`` được gán nhưng không có
gì tiêu thụ — repair mapping nằm chết. Service này là nơi tiêu thụ chúng.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import LearningEvent, QuizType, Word

# Repair mapping (tài liệu mục 4.6): error_tag -> cách sửa + dạng bài.
# ``quiz_type`` là dạng luyện phù hợp nhất để sửa loại lỗi đó.
REPAIR_MAPPING: dict[str, dict] = {
    "tone_error": {
        "label": "Luyện thanh điệu",
        "method": "Nghe cặp tối thiểu + đánh dấu thanh",
        "quiz_type": QuizType.listening,
        "tone": "cinnabar",
    },
    "sound_error": {
        "label": "Luyện phát âm",
        "method": "Nghe chậm, lặp lại, phân biệt phụ âm/vần dễ lẫn",
        "quiz_type": QuizType.listening,
        "tone": "cinnabar",
    },
    "hanzi_error": {
        "label": "Phân biệt mặt chữ",
        "method": "So sánh trực quan bộ thủ + viết tay tùy chọn",
        "quiz_type": QuizType.vocab,
        "tone": "gold",
    },
    "meaning_error": {
        "label": "Củng cố nghĩa",
        "method": "Ví dụ tương phản + nhận diện đơn giản hơn",
        "quiz_type": QuizType.vocab,
        "tone": "gold",
    },
    "context_error": {
        "label": "Luyện ngữ cảnh",
        "method": "Điền khuyết + cụm từ đi kèm",
        "quiz_type": QuizType.cloze,
        "tone": "jade",
    },
    "production_error": {
        "label": "Luyện tạo câu",
        "method": "Khung câu + tạo output có hướng dẫn",
        "quiz_type": QuizType.translation,
        "tone": "jade",
    },
    "speed_error": {
        "label": "Vòng tốc độ",
        "method": "Luyện phản xạ nhanh để tăng độ trôi chảy",
        "quiz_type": QuizType.vocab,
        "tone": "blue",
    },
    "confidence_error": {
        "label": "Gợi nhớ nhẹ",
        "method": "Nhắc lại sớm bằng câu dễ để xây tự tin",
        "quiz_type": QuizType.vocab,
        "tone": "blue",
    },
}

# Thứ tự ưu tiên khi nhiều loại lỗi cùng tần suất: lỗi nền tảng sửa trước.
_PRIORITY = [
    "tone_error",
    "sound_error",
    "hanzi_error",
    "meaning_error",
    "context_error",
    "production_error",
    "speed_error",
    "confidence_error",
]


class RepairService:
    def __init__(self, db: Session):
        self.db = db

    def recent_error_events(self, user_id: str, limit: int = 60) -> list[LearningEvent]:
        return list(
            self.db.scalars(
                select(LearningEvent)
                .where(LearningEvent.user_id == user_id, LearningEvent.correct == 0)
                .order_by(LearningEvent.created_at.desc())
                .limit(limit)
            ).all()
        )

    def build_repair_plan(self, user_id: str, max_words: int = 5) -> dict | None:
        """Tổng hợp kế hoạch sửa lỗi từ các event sai gần đây.

        Trả về ``None`` khi chưa có lỗi nào (không cần repair). Ngược lại trả
        dict gồm: error_tag chủ đạo, label/method theo mapping, quiz_type nên
        dùng, danh sách từ cần sửa, phân bố lỗi, và ma trận nhầm lẫn.
        """
        events = self.recent_error_events(user_id)
        if not events:
            return None

        tag_counts: Counter[str] = Counter()
        words_by_tag: dict[str, list[int]] = defaultdict(list)
        confusion_counts: Counter[str] = Counter()
        seen_word_for_tag: dict[str, set[int]] = defaultdict(set)

        for event in events:
            tag = event.error_tag or "meaning_error"
            if tag not in REPAIR_MAPPING:
                # Tag lạ (vd biến thể production) gộp về nhóm gần nhất.
                tag = "production_error" if "production" in tag or "output" in tag else "meaning_error"
            tag_counts[tag] += 1
            if event.word_id and event.word_id not in seen_word_for_tag[tag]:
                seen_word_for_tag[tag].add(event.word_id)
                words_by_tag[tag].append(event.word_id)
            detail = event.error_detail or {}
            confusion = detail.get("confusion") if isinstance(detail, dict) else None
            if confusion:
                confusion_counts[confusion] += 1

        dominant = self._dominant_tag(tag_counts)
        mapping = REPAIR_MAPPING[dominant]

        focus_word_ids = words_by_tag.get(dominant, [])[:max_words]
        focus_words = self._word_payloads(focus_word_ids)

        distribution = [
            {"error_tag": tag, "count": count, "label": REPAIR_MAPPING[tag]["label"]}
            for tag, count in tag_counts.most_common()
        ]
        confusion_matrix = [
            {"pair": pair, "count": count}
            for pair, count in confusion_counts.most_common(8)
        ]

        return {
            "error_tag": dominant,
            "label": mapping["label"],
            "method": mapping["method"],
            "quiz_type": mapping["quiz_type"],
            "tone": mapping["tone"],
            "error_count": sum(tag_counts.values()),
            "focus_words": focus_words,
            "distribution": distribution,
            "confusion_matrix": confusion_matrix,
        }

    def _dominant_tag(self, tag_counts: Counter[str]) -> str:
        if not tag_counts:
            return "meaning_error"
        top = tag_counts.most_common(1)[0][1]
        tied = [tag for tag, count in tag_counts.items() if count == top]
        for tag in _PRIORITY:
            if tag in tied:
                return tag
        return tied[0]

    def _word_payloads(self, word_ids: list[int]) -> list[dict]:
        if not word_ids:
            return []
        words = {w.id: w for w in self.db.scalars(select(Word).where(Word.id.in_(word_ids))).all()}
        payloads = []
        for wid in word_ids:  # giữ thứ tự theo tần suất lỗi
            word = words.get(wid)
            if not word:
                continue
            payloads.append({
                "word_id": word.id,
                "hanzi": word.hanzi,
                "pinyin": word.pinyin or "",
                "meaning_vi": word.meaning_vi or "",
                "level": word.hsk_level,
            })
        return payloads
