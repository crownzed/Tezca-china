import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Example, Word

TONE_MARKS = {
    "ā": "1", "á": "2", "ǎ": "3", "à": "4",
    "ē": "1", "é": "2", "ě": "3", "è": "4",
    "ī": "1", "í": "2", "ǐ": "3", "ì": "4",
    "ō": "1", "ó": "2", "ǒ": "3", "ò": "4",
    "ū": "1", "ú": "2", "ǔ": "3", "ù": "4",
    "ǖ": "1", "ǘ": "2", "ǚ": "3", "ǜ": "4",
}

COMPONENT_HINTS = {
    "学": "Bộ/tố 学 thường gắn với học tập: 学生, 学校, 学习.",
    "校": "校 gắn với trường/lớp và môi trường học.",
    "生": "生 thường gắn với người, đời sống, sinh ra.",
    "买": "买 là mua; chú ý khác 卖 là bán.",
    "卖": "卖 là bán; chú ý khác 买 là mua.",
    "四": "四 là số 4, âm si4; dễ nhầm 十 shi2.",
    "十": "十 là số 10, âm shi2; dễ nhầm 四 si4.",
    "在": "在 chỉ ở/tại/đang; khác 再 là lại/lần nữa.",
    "再": "再 là lại/lần nữa; khác 在 là ở/tại/đang.",
    "吗": "吗 dùng cuối câu hỏi yes/no.",
    "呢": "呢 dùng hỏi tiếp hoặc nhấn ngữ cảnh hội thoại.",
}

CONFUSABLE_PAIRS = {
    "买": ["卖"],
    "卖": ["买"],
    "四": ["十"],
    "十": ["四"],
    "在": ["再"],
    "再": ["在"],
    "他": ["她", "它"],
    "她": ["他", "它"],
    "哪": ["那"],
    "那": ["哪"],
    "坐": ["座"],
    "座": ["坐"],
}

TOPIC_HINTS = [
    ("school", ("学", "校", "老师", "学生", "课")),
    ("people", ("我", "你", "他", "她", "人", "朋友")),
    ("time", ("日", "月", "年", "天", "时", "候", "再")),
    ("place", ("在", "家", "国", "店", "里", "上", "下")),
    ("number", ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十")),
]


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
        tone_pattern = word.tone_pattern or self.tone_pattern(word.pinyin)
        family = word.character_family or (word.hanzi[0] if word.hanzi else "")
        return {
            "word_id": word.id,
            "tone_pattern": tone_pattern,
            "character_family": family,
            "component_hint": word.component_hint or self.component_hint(word),
            "collocations": word.collocations_json or self.collocations(word),
            "confusable_words": word.confusable_words_json or self.confusable_words(word),
            "topic": word.topic if word.topic and word.topic != "core" else self.topic(word),
            "frequency_band": word.frequency_band or f"hsk{word.hsk_level}",
        }

    def tone_pattern(self, pinyin: str) -> str:
        text = pinyin or ""
        digit_tones = re.findall(r"[1-5]", text)
        if digit_tones:
            return "-".join(digit_tones)
        tones = [TONE_MARKS[char] for char in text if char in TONE_MARKS]
        return "-".join(tones) if tones else "neutral"

    def component_hint(self, word: Word) -> str:
        for char in word.hanzi or "":
            if char in COMPONENT_HINTS:
                return COMPONENT_HINTS[char]
        if word.hanzi:
            return f"Quan sát ký tự {word.hanzi[0]} trước, rồi gắn với âm và nghĩa trong câu."
        return "Gắn chữ, âm, nghĩa và ví dụ trong cùng một lượt học."

    def collocations(self, word: Word) -> list[str]:
        rows = self.db.scalars(select(Example).where(Example.word_id == word.id).limit(3)).all()
        examples = [row.sentence_cn for row in rows if row.sentence_cn and word.hanzi in row.sentence_cn]
        if examples:
            return examples[:3]
        if word.hanzi:
            return [f"学习{word.hanzi}", f"用{word.hanzi}造句", f"复习{word.hanzi}"]
        return []

    def confusable_words(self, word: Word) -> list[str]:
        matches: list[str] = []
        for char in word.hanzi or "":
            matches.extend(CONFUSABLE_PAIRS.get(char, []))
        if matches:
            return list(dict.fromkeys(matches))[:4]
        plain_pinyin = re.sub(r"[1-5\s]", "", word.pinyin or "").lower()
        if len(plain_pinyin) >= 2:
            candidates = self.db.scalars(
                select(Word).where(Word.hsk_level == word.hsk_level, Word.id != word.id).limit(80)
            ).all()
            for candidate in candidates:
                candidate_plain = re.sub(r"[1-5\s]", "", candidate.pinyin or "").lower()
                if candidate_plain == plain_pinyin:
                    matches.append(candidate.hanzi)
        return list(dict.fromkeys(matches))[:4]

    def topic(self, word: Word) -> str:
        text = f"{word.hanzi} {word.meaning_vi} {word.meaning_en}"
        for topic, markers in TOPIC_HINTS:
            if any(marker in text for marker in markers):
                return topic
        return "core"
