from random import sample, shuffle

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Example, Question, QuizType, Word

RICH_PARAGRAPH_MARKERS = ("老师先说", "昨天晚上", "这周", "如果只看")


class QuestionGeneratorService:
    def __init__(self, db: Session):
        self.db = db

    def ensure_questions(self, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        query = select(Question).where(Question.level == level, Question.quiz_type == quiz_type)
        if quiz_type == QuizType.translation:
            query = query.where(Question.prompt.startswith("Dịch đoạn nói"))
        existing = self.db.scalars(query.limit(limit * 4)).all()
        if quiz_type == QuizType.listening:
            existing = [q for q in existing if q.prompt.startswith("Nghe câu")]
        if quiz_type == QuizType.translation:
            existing = [q for q in existing if any(marker in q.prompt for marker in RICH_PARAGRAPH_MARKERS)]
        if quiz_type == QuizType.cloze:
            existing = [q for q in existing if len(q.prompt) >= 90]
        if quiz_type == QuizType.dialogue:
            existing = [q for q in existing if q.prompt.startswith("Nghe đoạn hội thoại")]
        if len(existing) >= limit:
            return existing[:limit]

        words = self.db.scalars(select(Word).where(Word.hsk_level == level).limit(max(limit * 4, 40))).all()
        if not words:
            return existing

        for word in words:
            if len(existing) >= limit:
                break
            q = self._get_or_create_question(word, level, quiz_type)
            if q and q not in existing:
                existing.append(q)

        self.db.commit()
        return existing[:limit]

    def _get_or_create_question(self, word: Word, level: int, quiz_type: QuizType) -> Question | None:
        prompt = self._prompt_for(word, quiz_type)
        if not prompt:
            return None
        found = self.db.scalar(
            select(Question).where(
                Question.word_id == word.id,
                Question.quiz_type == quiz_type,
                Question.prompt == prompt,
            )
        )
        if found:
            if quiz_type == QuizType.dialogue and any(len(option) > 55 for option in found.options or []):
                options, correct_index = self._options_for(word, quiz_type)
                if len(options) >= 4:
                    found.options = options
                    found.correct_index = correct_index
                    found.explanation = self._explanation_for(word, quiz_type)
                    found.audio_text = self._audio_for(word, quiz_type)
            return found

        options, correct_index = self._options_for(word, quiz_type)
        if len(options) < 4:
            return None

        question = Question(
            word_id=word.id,
            level=level,
            quiz_type=quiz_type,
            prompt=prompt,
            options=options,
            correct_index=correct_index,
            explanation=self._explanation_for(word, quiz_type),
            audio_text=self._audio_for(word, quiz_type),
            metadata_json={"source": "generated"},
        )
        self.db.add(question)
        self.db.flush()
        return question

    def _prompt_for(self, word: Word, quiz_type: QuizType) -> str:
        if quiz_type == QuizType.vocab:
            return f"Chọn nghĩa đúng của: {word.hanzi}"
        if quiz_type == QuizType.listening:
            return "Nghe câu và chọn nghĩa tiếng Việt đúng"
        example = self.db.scalar(select(Example).where(Example.word_id == word.id))
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word)
            if dialogue:
                return "Nghe đoạn hội thoại và chọn ý đúng"
            return ""
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word)
            if paragraph:
                return f"Dịch đoạn nói sau sang tiếng Việt: {paragraph['cn']}"
            return ""
        if quiz_type == QuizType.cloze:
            cloze = self._cloze_for_word(word)
            if cloze:
                return f"Chọn từ còn thiếu để hoàn chỉnh câu: {cloze['prompt']}"
            return ""
        if example:
            return f"Đọc câu và chọn từ khóa chính: {example.sentence_cn}"
        return f"Đọc nghĩa và chọn từ phù hợp: {word.meaning_vi or word.meaning_en}"

    def _options_for(self, word: Word, quiz_type: QuizType) -> tuple[list[str], int]:
        pool = self.db.scalars(
            select(Word).where(Word.hsk_level == word.hsk_level, Word.id != word.id).limit(80)
        ).all()
        if len(pool) < 3:
            return [], 0
        distractors = sample(pool, 3)

        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word)
            if not listening:
                return [], 0
            correct = listening["vi"]
            distractor_options = []
            for item in distractors:
                item_listening = self._listening_for_word(item)
                distractor_options.append(item_listening["vi"] if item_listening else item.meaning_vi or item.meaning_en)
            options = [correct, *distractor_options]
        elif quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word)
            if not dialogue:
                return [], 0
            correct = dialogue.get("option_vi", dialogue["vi"])
            distractor_options = []
            for item in distractors:
                item_dialogue = self._dialogue_for_word(item)
                distractor_options.append(item_dialogue.get("option_vi", item_dialogue["vi"]) if item_dialogue else item.meaning_vi or item.meaning_en)
            options = [correct, *distractor_options]
        elif quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word)
            if not paragraph:
                return [], 0
            correct = paragraph["vi"]
            distractor_options = []
            for item in distractors:
                item_paragraph = self._paragraph_for_word(item)
                distractor_options.append(item_paragraph["vi"] if item_paragraph else item.meaning_vi or item.meaning_en)
            options = [correct, *distractor_options]
        elif quiz_type == QuizType.vocab:
            correct = word.meaning_vi or word.meaning_en
            options = [correct, *[(w.meaning_vi or w.meaning_en) for w in distractors]]
        else:
            correct = word.hanzi
            options = [correct, *[w.hanzi for w in distractors]]

        clean = []
        for option in options:
            if option and option not in clean:
                clean.append(option)
        if len(clean) < 4:
            return [], 0
        correct_value = clean[0]
        shuffle(clean)
        return clean, clean.index(correct_value)

    def _explanation_for(self, word: Word, quiz_type: QuizType) -> str:
        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word)
            if listening:
                return f"{listening['cn']} · {listening['vi']} · {word.hanzi} · {word.pinyin}"
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word)
            if dialogue:
                return f"{dialogue['cn']} · {dialogue['vi']}"
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word)
            if paragraph:
                return f"{paragraph['cn']} · {paragraph['vi']}"
        if quiz_type == QuizType.cloze:
            cloze = self._cloze_for_word(word)
            if cloze:
                return f"{cloze['answer_cn']} · {cloze['vi']} · Đáp án: {word.hanzi}"
        return f"{word.hanzi} · {word.pinyin} · {word.meaning_vi or word.meaning_en}"

    def _audio_for(self, word: Word, quiz_type: QuizType) -> str:
        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word)
            return listening["cn"] if listening else word.hanzi
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word)
            return dialogue["cn"] if dialogue else ""
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word)
            return paragraph["cn"] if paragraph else ""
        return ""

    def _listening_for_word(self, word: Word) -> dict[str, str] | None:
        example = self.db.scalar(select(Example).where(Example.word_id == word.id))
        if example and example.sentence_cn and example.sentence_vi:
            return {"cn": example.sentence_cn, "vi": example.sentence_vi}
        meaning = word.meaning_vi or word.meaning_en
        if not meaning:
            return None
        return {"cn": word.hanzi, "vi": meaning}

    def _dialogue_for_word(self, word: Word) -> dict[str, str] | None:
        example = self.db.scalar(select(Example).where(Example.word_id == word.id))
        if not example or not example.sentence_cn or not example.sentence_vi:
            return None
        meaning = word.meaning_vi or word.meaning_en or "nghĩa chính"
        variants = [
            {
                "cn": f"A：你今天在学习什么？B：我在学习“{word.hanzi}”。老师说：“{example.sentence_cn}” A：这个词是什么意思？B：它的意思是“{meaning}”，我晚上还会复习。",
                "vi": f"A hỏi hôm nay đang học gì. B nói đang học từ “{word.hanzi}”, nghe câu ví dụ “{example.sentence_vi}”, giải thích nghĩa là “{meaning}” và tối sẽ ôn lại.",
                "option_vi": f"B học từ “{word.hanzi}” và sẽ ôn lại.",
            },
            {
                "cn": f"A：刚才老师说了哪个句子？B：老师说：“{example.sentence_cn}” A：你听懂了吗？B：听懂了，重点词是“{word.hanzi}”，意思是“{meaning}”。",
                "vi": f"A hỏi giáo viên vừa nói câu nào. B nhắc lại “{example.sentence_vi}”, nói đã nghe hiểu, từ trọng tâm là “{word.hanzi}”, nghĩa là “{meaning}”.",
                "option_vi": f"B nghe hiểu câu về “{word.hanzi}”.",
            },
            {
                "cn": f"A：我们一起练口语吧。B：好，我先说一个句子：“{example.sentence_cn}” A：很好。这个句子里，“{word.hanzi}”怎么用？B：它可以放在完整句子里表达“{meaning}”。",
                "vi": f"A rủ luyện nói. B đọc câu “{example.sentence_vi}”. A hỏi cách dùng “{word.hanzi}”, B giải thích từ này được đặt trong câu hoàn chỉnh để diễn đạt “{meaning}”.",
                "option_vi": f"Hai người luyện cách dùng “{word.hanzi}”.",
            },
        ]
        return variants[word.id % len(variants)]

    def _paragraph_for_word(self, word: Word) -> dict[str, str] | None:
        first = self.db.scalar(select(Example).where(Example.word_id == word.id))
        if not first or not first.sentence_cn or not first.sentence_vi:
            return None
        meaning = word.meaning_vi or word.meaning_en or "nghĩa chính"
        variants = [
            {
                "cn": f"今天上午，我在学校学习中文。老师先说：“{first.sentence_cn}” 然后让我们解释“{word.hanzi}”的意思。下课以后，我把这个词、拼音和例句写在本子上，晚上再复习一遍。",
                "vi": f"Sáng nay, tôi học tiếng Trung ở trường. Giáo viên nói trước: “{first.sentence_vi}” Sau đó, giáo viên yêu cầu chúng tôi giải thích nghĩa của “{word.hanzi}”. Sau giờ học, tôi ghi từ này, pinyin và câu ví dụ vào vở, buổi tối ôn lại một lần nữa.",
            },
            {
                "cn": f"昨天晚上，我和朋友练习口语。我们用“{word.hanzi}”造了一个句子：“{first.sentence_cn}” 因为这个词和日常生活有关，所以我觉得它很容易记住，也很适合在聊天时使用。",
                "vi": f"Tối hôm qua, tôi luyện nói với bạn. Chúng tôi dùng “{word.hanzi}” để đặt một câu: “{first.sentence_vi}” Vì từ này liên quan đến đời sống hằng ngày, nên tôi thấy nó dễ nhớ và cũng phù hợp để dùng khi trò chuyện.",
            },
            {
                "cn": f"这周我给自己定了一个小目标：每天记十个汉语词。今天的重点词是“{word.hanzi}”，意思是“{meaning}”。我先读例句“{first.sentence_cn}”，再听发音，最后用自己的话说一遍。",
                "vi": f"Tuần này tôi đặt cho mình một mục tiêu nhỏ: mỗi ngày ghi nhớ mười từ tiếng Trung. Từ trọng tâm hôm nay là “{word.hanzi}”, nghĩa là “{meaning}”. Tôi đọc câu ví dụ “{first.sentence_vi}” trước, sau đó nghe phát âm, cuối cùng nói lại bằng lời của mình.",
            },
            {
                "cn": f"如果只看生词，我常常忘得很快。现在我把“{word.hanzi}”放进完整的句子里学习，比如：“{first.sentence_cn}” 这样我不仅知道它的意思，还知道它出现在什么场景、和哪些词一起使用。",
                "vi": f"Nếu chỉ nhìn từ mới, tôi thường quên rất nhanh. Bây giờ tôi đặt “{word.hanzi}” vào câu hoàn chỉnh để học, ví dụ: “{first.sentence_vi}” Như vậy tôi không chỉ biết nghĩa của nó, mà còn biết nó xuất hiện trong ngữ cảnh nào và đi cùng những từ nào.",
            },
        ]
        return variants[word.id % len(variants)]

    def _cloze_for_word(self, word: Word) -> dict[str, str] | None:
        paragraph = self._paragraph_for_word(word)
        if not paragraph or word.hanzi not in paragraph["cn"]:
            return None
        prompt = paragraph["cn"].replace(word.hanzi, "____", 1)
        return {"prompt": prompt, "answer_cn": paragraph["cn"], "vi": paragraph["vi"]}
