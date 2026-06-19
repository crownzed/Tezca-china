"""Lớp DB-aware bọc quanh ``enrichment_service`` (lõi tính thuần).

Service này KHÔNG tự định nghĩa lại thuật toán; nó ủy thác toàn bộ phần
tính toán cho ``enrichment_service`` (một nguồn sự thật duy nhất) và chỉ
bổ sung phần cần DB: corpus cùng cấp HSK cho confusables, và collocations
trích từ câu ví dụ.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Example, Word
from . import enrichment_service as core


class ChineseMetadataService:
    def __init__(self, db: Session):
        self.db = db

    def enrich_word(self, word: Word) -> dict:
        metadata = self.metadata_for(word)
        changed = False
        for field, value in {
            "tone_pattern": metadata["tone_pattern"],
            "character_family": metadata["character_family"],
            "component_hint": metadata["component_hint"],
            "collocations_json": metadata["collocations"],
            "confusable_words_json": metadata["confusable_words"],
            "topic": metadata["topic"],
            "frequency_band": metadata["frequency_band"],
        }.items():
            if getattr(word, field) != value:
                setattr(word, field, value)
                changed = True
        if changed:
            self.db.flush()
        return metadata

    def metadata_for(self, word: Word) -> dict:
        return {
            "word_id": word.id,
            "tone_pattern": word.tone_pattern or core.tone_pattern(word.pinyin or ""),
            "character_family": word.character_family or (word.hanzi[0] if word.hanzi else ""),
            "component_hint": word.component_hint or core.component_hint(word.hanzi or ""),
            "collocations": word.collocations_json or self.collocations(word),
            "confusable_words": word.confusable_words_json or self.confusable_words(word),
            "topic": word.topic if (word.topic and word.topic != "core")
            else core.topic(word.hanzi or "", word.meaning_vi or "", word.meaning_en or ""),
            "frequency_band": word.frequency_band or f"hsk{word.hsk_level}",
        }

    # Giữ các phương thức cũ để tương thích ngược; ủy thác về lõi chung.
    def tone_pattern(self, pinyin: str) -> str:
        return core.tone_pattern(pinyin or "")

    def component_hint(self, word: Word) -> str:
        return core.component_hint(word.hanzi or "")

    def topic(self, word: Word) -> str:
        return core.topic(word.hanzi or "", word.meaning_vi or "", word.meaning_en or "")

    def collocations(self, word: Word) -> list[str]:
        """Trích collocation từ câu ví dụ (cần DB)."""
        rows = self.db.scalars(
            select(Example).where(Example.word_id == word.id).limit(3)
        ).all()
        examples = [
            row.sentence_cn for row in rows
            if row.sentence_cn and word.hanzi and word.hanzi in row.sentence_cn
        ]
        if examples:
            return examples[:3]
        if word.hanzi:
            return [f"学习{word.hanzi}", f"用{word.hanzi}造句", f"复习{word.hanzi}"]
        return []

    def confusable_words(self, word: Word) -> list[str]:
        """Confusable hanzi (list[str]) tính trên corpus cùng cấp HSK."""
        if not word.hanzi:
            return []
        candidates = self.db.scalars(
            select(Word).where(Word.hsk_level == word.hsk_level, Word.id != word.id).limit(120)
        ).all()
        corpus = [
            {
                "hanzi": c.hanzi,
                "pinyin": c.pinyin,
                "meaning_vi": c.meaning_vi,
                "meaning_en": c.meaning_en,
            }
            for c in candidates
        ]
        target = {
            "hanzi": word.hanzi,
            "pinyin": word.pinyin,
            "meaning_vi": word.meaning_vi,
            "meaning_en": word.meaning_en,
        }
        return core.confusable_hanzi(target, corpus, limit=4)
