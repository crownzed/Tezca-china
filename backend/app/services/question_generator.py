import json
import random
import re
from random import shuffle

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Example, Question, QuizType, Word
from .distractor_policy import order_distractors_by_stage
from .exam_passage_service import (
    QUESTION_SUBTYPE_GUIDED_CLOZE,
    QUESTION_SUBTYPE_READING_COMP,
    get_exam_passage_bank,
)
from .template_engine import get_template_engine
from .viet_distractor import get_vietnamese_aware_distractors

# CJK Unified Ideographs: basic + extension A + compatibility
_CJK_RANGE = r"一-鿿㐀-䶿豈-﫿"

QUESTION_SUBTYPE_SENTENCE = "sentence"
QUESTION_SUBTYPE_DIALOGUE = "dialogue"
QUESTION_SUBTYPE_PARAGRAPH = "paragraph"
QUESTION_SUBTYPE_SIMPLE = "simple"
QUESTION_SUBTYPE_WORD = "word"
QUESTION_SUBTYPE_MEANING = "meaning"
QUESTION_SUBTYPE_KEYWORD = "keyword"
QUESTION_SUBTYPE_DRAG_DROP = "drag_drop"
QUESTION_SUBTYPE_VOICE = "voice"

# Các dạng có ngân hàng đoạn văn chuẩn đề thi (选词填空 / 阅读理解) viết tay.
_EXAM_BANK_TYPES = frozenset({QuizType.cloze, QuizType.reading})

# Giới hạn độ dài đoạn đọc (số ký tự CJK) theo cấp HSK. Đoạn vượt mức bị
# thay bằng câu ví dụ đơn (đúng cấp) để tránh sinh đoạn quá dài so với chuẩn
# cấp độ — HSK1/2 chỉ đọc câu ngắn, cấp cao mới đọc đoạn dài.
_PARAGRAPH_CJK_CAP_BY_LEVEL = {1: 16, 2: 30, 3: 60, 4: 100, 5: 150, 6: 200}


def _count_cjk(text: str) -> int:
    return len(re.findall(f"[{_CJK_RANGE}]", text or ""))


def _valid_question_payload(
    quiz_type: QuizType,
    prompt: str,
    options: list[str],
    correct_index: int,
    explanation: str,
    metadata: dict,
) -> bool:
    """Cổng QA cuối trước khi ghi bank.

    Template/LLM đều phải đi qua cùng một contract: 4 lựa chọn khác nhau,
    đáp án hợp lệ, prompt có nội dung và dạng đặc biệt có metadata cần thiết.
    Điều này ngăn dữ liệu lỗi lọt vào DB khi nguồn ví dụ hoặc template thiếu.
    """
    if not isinstance(prompt, str) or len(prompt.strip()) < 5:
        return False
    if not isinstance(explanation, str) or len(explanation.strip()) < 3:
        return False
    if not isinstance(options, list) or len(options) != 4:
        return False
    cleaned = [str(item).strip() for item in options]
    if any(not item for item in cleaned) or len(set(cleaned)) != 4:
        return False
    if not isinstance(correct_index, int) or not 0 <= correct_index < 4:
        return False
    if quiz_type == QuizType.cloze and "____" not in prompt:
        return False
    if quiz_type == QuizType.drag_drop:
        segments = metadata.get("segments") or []
        order = metadata.get("correct_order") or []
        if len(segments) < 2 or len(order) < 2:
            return False
    return True


def _pos_filtered_pool(word: Word, pool: list[Word], quiz_type: QuizType) -> list[Word]:
    """Với câu Cloze, ưu tiên distractor cùng POS để tránh đoán mò ngữ pháp."""
    if quiz_type != QuizType.cloze or not word.pos:
        return pool
    matched = [w for w in pool if w.pos == word.pos]
    return matched if len(matched) >= 3 else pool


def _cloze_replace(text: str, hanzi: str) -> str:
    """Thay thế lần xuất hiện đầu tiên của ``hanzi``.

    Từ ghép (2+ ký tự) dùng str.replace trực tiếp.
    Từ đơn (1 ký tự) dùng ranh giới CJK để tránh thay thế từ con.
    """
    if len(hanzi) >= 2:
        return text.replace(hanzi, "____", 1)
    cjk = _CJK_RANGE
    pattern = r"(?<![%s])%s(?![%s])" % (cjk, re.escape(hanzi), cjk)
    result = re.sub(pattern, "____", text, count=1)
    if result == text:
        result = text.replace(hanzi, "____", 1)
    return result


def _cloze_replace_all(text: str, hanzi: str) -> str | None:
    """Như ``_cloze_replace`` nhưng thay TẤT CẢ lần xuất hiện."""
    if len(hanzi) >= 2:
        result = text.replace(hanzi, "____")
        return result if result != text else None
    cjk = _CJK_RANGE
    pattern = r"(?<![%s])%s(?![%s])" % (cjk, re.escape(hanzi), cjk)
    result = re.sub(pattern, "____", text)
    return result if result != text else None


def _primary_subtype(quiz_type: QuizType) -> str:
    """Trả về question_subtype chính được sinh ra cho mỗi quiz_type.

    Dùng để lọc câu hỏi đã tồn tại khi chưa có prompt cụ thể để phân loại.
    """
    if quiz_type == QuizType.listening:
        return QUESTION_SUBTYPE_SENTENCE
    if quiz_type == QuizType.dialogue:
        return QUESTION_SUBTYPE_DIALOGUE
    if quiz_type == QuizType.translation:
        return QUESTION_SUBTYPE_PARAGRAPH
    if quiz_type == QuizType.cloze:
        return QUESTION_SUBTYPE_SENTENCE
    if quiz_type == QuizType.vocab:
        return QUESTION_SUBTYPE_MEANING
    if quiz_type == QuizType.reading:
        return QUESTION_SUBTYPE_KEYWORD
    if quiz_type == QuizType.drag_drop:
        return QUESTION_SUBTYPE_DRAG_DROP
    if quiz_type == QuizType.voice:
        return QUESTION_SUBTYPE_VOICE
    return QUESTION_SUBTYPE_SIMPLE


def _accepted_subtypes(quiz_type: QuizType) -> set[str]:
    """Các subtype được coi là "đúng dạng" khi đọc lại bank đã có.

    cloze/reading giờ có hai nguồn: ngân hàng đoạn văn chuẩn đề thi
    (``guided_cloze``/``reading_comp_mc``) và template per-word cũ. Cả hai đều
    hợp lệ nên bộ lọc phải nhận cả tập, nếu không mỗi lượt sinh sẽ tưởng bank
    trống và tạo thêm row per-word trùng lặp.
    """
    accepted = {_primary_subtype(quiz_type)}
    if quiz_type == QuizType.cloze:
        accepted.add(QUESTION_SUBTYPE_GUIDED_CLOZE)
    if quiz_type == QuizType.reading:
        accepted.add(QUESTION_SUBTYPE_READING_COMP)
    return accepted


class QuestionGeneratorService:
    def __init__(self, db: Session):
        self.db = db
        # Cache Example theo word_id trong vòng đời service. Một lượt sinh tạo
        # tới 6 biến thể/từ và nhiều method (_prompt_for, _options, _audio,
        # _explanation...) đều truy vấn cùng Example của một từ — memoize để
        # cắt các round-trip DB trùng lặp mà không đổi kết quả.
        self._example_cache: dict[int, list[Example]] = {}
        # Cache pool Word theo (hsk_level, pos) trong vòng đời service. Mỗi
        # variant gọi ``_options_with_words`` lại truy vấn tối đa 80 Word cùng
        # cấp (và cùng POS) làm nguồn distractor — memoize để không tải lại
        # cùng một pool cho mọi từ/variant ở cùng cấp. Loại ``word.id`` được
        # làm ở Python lúc dùng nên pool dùng chung được giữa các từ.
        self._pool_cache: dict[tuple[int, str | None], list[Word]] = {}

    def _examples_for(self, word: Word) -> list[Example]:
        cached = self._example_cache.get(word.id)
        if cached is None:
            cached = self.db.scalars(select(Example).where(Example.word_id == word.id)).all()
            self._example_cache[word.id] = cached
        return cached

    def _word_pool(self, hsk_level: int, pos: str | None) -> list[Word]:
        """Pool Word cùng cấp (tuỳ chọn cùng POS) làm nguồn distractor.

        Không lọc ``id != word.id`` trong SQL để pool dùng chung được cho mọi
        từ ở cùng cấp — người gọi tự loại từ đích ở Python.
        """
        key = (hsk_level, pos)
        cached = self._pool_cache.get(key)
        if cached is None:
            query = select(Word).where(Word.hsk_level == hsk_level)
            if pos:
                query = query.where(Word.pos == pos)
            cached = self.db.scalars(query.limit(80)).all()
            self._pool_cache[key] = cached
        return cached

    def ensure_questions(self, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        # cloze/reading: nạp ngân hàng đoạn văn chuẩn đề thi trước. Đây là dữ
        # liệu viết tay nên luôn ưu tiên hơn template per-word; template chỉ lấp
        # phần còn thiếu khi bank chưa đủ ``limit``.
        self._seed_exam_bank(level, quiz_type)

        existing = self._existing_questions(level, quiz_type, limit)
        if len(existing) >= limit:
            return existing[:limit]

        words = self.db.scalars(select(Word).where(Word.hsk_level == level).limit(max(limit * 4, 40))).all()
        if not words:
            return existing

        for word in words:
            if len(existing) >= limit:
                break
            for _ in range(6):  # 6 variants per word for question diversity
                seed = random.randint(0, 1000000)
                q = self._get_or_create_question(word, level, quiz_type, seed)
                if q and q not in existing:
                    existing.append(q)
                if len(existing) >= limit:
                    break

        self.db.commit()
        return existing[:limit]

    def _seed_exam_bank(self, level: int, quiz_type: QuizType) -> int:
        """Ghi các câu từ ngân hàng đoạn văn chuẩn đề thi vào DB (idempotent).

        Chỉ áp dụng cho cloze/reading. Trả về số row MỚI thêm.

        Các row này không gắn với từ nào nên ``word_id`` để NULL — hợp lệ vì cột
        nullable. Hệ quả: ``UniqueConstraint(word_id, quiz_type, prompt)`` KHÔNG
        chặn trùng (NULL không so sánh bằng nhau trong SQL), nên phải tự dedup ở
        Python theo prompt trước khi insert.
        """
        if quiz_type not in _EXAM_BANK_TYPES:
            return 0

        bank = get_exam_passage_bank()
        payloads = bank.items(quiz_type.value, level)
        if not payloads:
            return 0

        existing_prompts = set(
            self.db.scalars(
                select(Question.prompt).where(
                    Question.level == level,
                    Question.quiz_type == quiz_type,
                    Question.word_id.is_(None),
                )
            ).all()
        )

        added = 0
        for payload in payloads:
            prompt = payload["prompt"]
            if prompt in existing_prompts:
                continue
            if not _valid_question_payload(
                quiz_type,
                prompt,
                payload["options"],
                payload["correct_index"],
                payload["explanation"],
                payload["metadata_json"],
            ):
                continue
            self.db.add(
                Question(
                    word_id=None,
                    level=level,
                    quiz_type=quiz_type,
                    prompt=prompt,
                    options=payload["options"],
                    correct_index=payload["correct_index"],
                    explanation=payload["explanation"],
                    audio_text=payload.get("audio_text"),
                    metadata_json=payload["metadata_json"],
                )
            )
            existing_prompts.add(prompt)
            added += 1

        if added:
            self.db.commit()
        return added

    def _existing_questions(self, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        """Lấy câu hỏi đã có, dùng ``question_subtype`` trong metadata_json để lọc.

        Các câu hỏi cũ (chưa có ``question_subtype``) được giữ lại để tránh
        tái sinh trùng lặp — chỉ lọc khi metadata đã có subtype rõ ràng.
        """
        accepted = _accepted_subtypes(quiz_type)
        query = select(Question).where(Question.level == level, Question.quiz_type == quiz_type)
        all_existing = self.db.scalars(query.limit(limit * 4)).all()
        return [
            q for q in all_existing
            if (q.metadata_json or {}).get("question_subtype") in (None, *accepted)
        ]

    def _question_subtype(self, quiz_type: QuizType, prompt: str | None) -> str:
        """Xác định question_subtype dựa trên quiz_type.

        Dùng prompt để phân biệt khi một quiz_type có nhiều subtype thực sự
        được sinh ra. Hiện tại translation và cloze luôn sinh paragraph
        (qua ``_paragraph_for_word``), nên trả về PARAGRAPH trực tiếp.
        """
        if quiz_type == QuizType.listening:
            return QUESTION_SUBTYPE_SENTENCE
        if quiz_type == QuizType.dialogue:
            return QUESTION_SUBTYPE_DIALOGUE
        if quiz_type == QuizType.translation:
            return QUESTION_SUBTYPE_PARAGRAPH
        if quiz_type == QuizType.cloze:
            return QUESTION_SUBTYPE_SENTENCE
        if quiz_type == QuizType.vocab:
            return QUESTION_SUBTYPE_MEANING
        if quiz_type == QuizType.reading:
            return QUESTION_SUBTYPE_KEYWORD
        if quiz_type == QuizType.drag_drop:
            return QUESTION_SUBTYPE_DRAG_DROP
        if quiz_type == QuizType.voice:
            return QUESTION_SUBTYPE_VOICE
        return QUESTION_SUBTYPE_SIMPLE

    def _extra_metadata(self, word: Word, quiz_type: QuizType, seed: int | None = None) -> dict:
        """Trả về extra metadata cho từng quiz_type (segments cho drag_drop, v.v.)."""
        if quiz_type == QuizType.drag_drop:
            dd = self._drag_drop_for_word(word, seed)
            if dd:
                return {
                    "segments": dd.get("segments", []),
                    "correct_order": dd.get("correct_order", []),
                    "sentence_vi": dd.get("sentence_vi", ""),
                }
        if quiz_type == QuizType.voice:
            vp = self._voice_prompt_for_word(word, seed)
            if vp:
                return {"voice_prompt": vp}
        return {}

    def _get_or_create_question(self, word: Word, level: int, quiz_type: QuizType, seed: int | None = None) -> Question | None:
        from sqlalchemy import func
        base_prompt = self._prompt_for(word, quiz_type, seed)
        if not base_prompt:
            return None
            
        duplicate_prompt = self.db.scalar(
            select(Question).where(
                Question.word_id == word.id,
                Question.quiz_type == quiz_type,
                Question.prompt == base_prompt
            )
        )
        if duplicate_prompt:
            return duplicate_prompt

        prompt = base_prompt

        audio_text = self._audio_for(word, quiz_type, seed)
        if audio_text and quiz_type != QuizType.vocab:
            duplicate = self.db.scalar(
                select(Question).where(
                    Question.word_id == word.id,
                    Question.quiz_type == quiz_type,
                    Question.audio_text == audio_text,
                )
            )
            if duplicate:
                return duplicate

        options, correct_index, option_word_ids = self._options_with_words(word, quiz_type, seed)
        if len(options) < 4:
            return None

        extra_metadata = self._extra_metadata(word, quiz_type, seed)
        metadata = {
            "source": "generated",
            "option_word_ids": option_word_ids,
            "question_subtype": self._question_subtype(quiz_type, prompt),
            **extra_metadata,
        }
        if not _valid_question_payload(
            quiz_type, prompt, options, correct_index,
            self._explanation_for(word, quiz_type, seed), metadata,
        ):
            return None

        question = Question(
            word_id=word.id,
            level=level,
            quiz_type=quiz_type,
            prompt=prompt,
            options=options,
            correct_index=correct_index,
            explanation=self._explanation_for(word, quiz_type, seed),
            audio_text=audio_text,
            metadata_json=metadata,
        )
        self.db.add(question)
        self.db.flush()
        return question

    def _prompt_for(self, word: Word, quiz_type: QuizType, seed: int | None = None) -> str:
        if quiz_type == QuizType.vocab:
            return f"Chọn nghĩa đúng của: {word.hanzi}"
        if quiz_type == QuizType.listening:
            return "Nghe câu và chọn nghĩa tiếng Việt đúng"

        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word, seed)
            if dialogue:
                return "Nghe đoạn hội thoại và chọn ý đúng"
            return ""
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word, seed)
            if paragraph:
                return f"Dịch đoạn nói sau sang tiếng Việt: {paragraph['cn']}"
            return ""
        if quiz_type == QuizType.cloze:
            cloze = self._cloze_for_word(word, seed)
            if cloze:
                return f"Chọn từ còn thiếu để hoàn chỉnh câu: {cloze['prompt']}"
            return ""
        if quiz_type == QuizType.drag_drop:
            dd = self._drag_drop_for_word(word, seed)
            if dd:
                return f"Sắp xếp từ thành câu đúng: {dd['scrambled']}"
            return ""
        if quiz_type == QuizType.voice:
            vp = self._voice_prompt_for_word(word, seed)
            if vp:
                return vp
            return ""
        if example:
            return f"Đọc câu và chọn từ khóa chính: {example.sentence_cn}"
        return f"Đọc nghĩa và chọn từ phù hợp: {word.meaning_vi or word.meaning_en}"

    def _pick_distractors(
        self, word: Word, pool: list[Word], count: int = 3, stage: str | None = None
    ) -> list[Word]:
        """Chọn distractor ưu tiên từ nhóm dễ nhầm (confusables).

        Lấy trước các từ trong ``word.confusable_words_json`` (đã xếp theo độ
        dễ nhầm: đồng âm > gần âm > chung chữ > gần nghĩa), sau đó bù phần
        còn thiếu bằng từ ngẫu nhiên cùng cấp HSK. Distractor gần với đáp án
        đúng buộc người học phân biệt đúng chỗ hay sai, thay vì loại trừ
        những lựa chọn khác hẳn.

        Khi có ``stage`` (nấc thụ đắc của người học với từ này), thứ tự ưu tiên
        confusable được sắp lại theo ``distractor_policy`` để distractor "vừa
        đủ khó": người mới gặp distractor xa (dễ loại), người thạo gặp gần
        (buộc phân biệt). ``stage=None`` → giữ nguyên thứ tự gốc (hành vi cũ).
        """
        chosen: list[Word] = []
        chosen_ids: set[int] = set()
        # confusable_words_json là list[str] hanzi (shape canonical).
        # Vẫn chấp nhận list[dict] cũ để an toàn ngược.
        confusables = word.confusable_words_json or []
        conf_hanzi = [
            c if isinstance(c, str) else c.get("hanzi")
            for c in confusables
        ]
        conf_hanzi = [h for h in conf_hanzi if h]
        if stage:
            conf_hanzi = order_distractors_by_stage(conf_hanzi, stage)
        if conf_hanzi:
            conf_words = self.db.scalars(
                select(Word).where(Word.hanzi.in_(conf_hanzi), Word.id != word.id)
            ).all()
            by_hanzi = {w.hanzi: w for w in conf_words}
            for hanzi in conf_hanzi:  # giữ thứ tự theo độ dễ nhầm
                candidate = by_hanzi.get(hanzi)
                if candidate and candidate.id not in chosen_ids:
                    chosen.append(candidate)
                    chosen_ids.add(candidate.id)
                if len(chosen) >= count:
                    break
        if len(chosen) < count:
            # Bù phần thiếu bằng distractor "viet-aware" (nhầm lẫn đặc thù người
            # Việt: đồng âm khác thanh, gần tự, gần nghĩa cùng chủ đề...) thay vì
            # random thuần — cùng pool nên không thêm truy vấn, và options chỉ
            # được ráp + tính correct_index SAU ở _options_with_words nên không
            # ảnh hưởng chấm điểm. Thiếu pattern thì get_vietnamese_aware_distractors
            # tự fallback random, giữ nguyên hành vi bù cũ.
            remaining = [w for w in pool if w.id not in chosen_ids and w.id != word.id]
            viet = get_vietnamese_aware_distractors(word, remaining, count - len(chosen))
            for item in viet:
                cand = item["distractor"]
                if cand.id not in chosen_ids:
                    chosen.append(cand)
                    chosen_ids.add(cand.id)
                if len(chosen) >= count:
                    break
        return chosen[:count]

    def _options_for(self, word: Word, quiz_type: QuizType, seed: int | None = None) -> tuple[list[str], int]:
        options, correct_index, _ = self._options_with_words(word, quiz_type, seed)
        return options, correct_index

    def _options_with_words(
        self, word: Word, quiz_type: QuizType, seed: int | None = None
    ) -> tuple[list[str], int, list[int | None]]:
        """Như ``_options_for`` nhưng trả thêm word_id của từ đứng sau mỗi đáp án.

        Mapping option->word_id cho phép suy ra ``selected_word`` khi người học
        chọn sai (đáp án đã shuffle), làm đầu vào cho bộ phân loại lỗi.
        """
        # Pool distractor lấy từ cache theo (hsk_level, pos); loại từ đích ở
        # Python vì pool được chia sẻ giữa các từ cùng cấp.
        if word.pos:
            # Ưu tiên lấy từ có cùng từ loại (POS) để tạo distractors chuẩn ngữ pháp
            pos_pool = [w for w in self._word_pool(word.hsk_level, word.pos) if w.id != word.id]
            if len(pos_pool) >= 3:
                pool = pos_pool
            else:
                pool = [w for w in self._word_pool(word.hsk_level, None) if w.id != word.id]
        else:
            pool = [w for w in self._word_pool(word.hsk_level, None) if w.id != word.id]

        if len(pool) < 3:
            return [], 0, []
        pos_pool = _pos_filtered_pool(word, pool, quiz_type)
        # listening/dialogue/translation lọc bỏ distractor không sinh được câu
        # (xem dưới) nên lấy dư ứng viên để vẫn đủ 3 option sau khi lọc, tránh
        # câu bị loại chỉ vì vài distractor thiếu example.
        _sentence_types = (QuizType.listening, QuizType.dialogue, QuizType.translation)
        pick_count = 8 if quiz_type in _sentence_types else 3
        distractors = self._pick_distractors(word, pos_pool, pick_count)
        if len(distractors) < 3:
            return [], 0, []

        # Mỗi phần tử: (text, word_id). word_id của đáp án đúng là word.id.
        # listening/dialogue/translation: đáp án đúng là CÂU/ĐOẠN đầy đủ. Nếu
        # distractor thiếu example mà rơi về meaning_vi NGẮN thì đáp án đúng trở
        # thành option dài bất thường → lộ đáp án qua độ dài. Vì vậy chỉ nhận
        # distractor cũng sinh được câu/đoạn CÙNG DẠNG; distractor không có thì
        # BỎ QUA (không thêm option cụt). Thiếu ứng viên → dedup <4 → câu bị loại.
        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word, seed)
            if not listening:
                return [], 0, []
            pairs = [(listening["vi"], word.id)]
            for item in distractors:
                item_listening = self._listening_for_word(item, seed)
                if item_listening:
                    pairs.append((item_listening["vi"], item.id))
        elif quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word, seed)
            if not dialogue:
                return [], 0, []
            pairs = [(dialogue.get("option_vi", dialogue["vi"]), word.id)]
            for item in distractors:
                item_dialogue = self._dialogue_for_word(item, seed)
                if item_dialogue:
                    pairs.append((item_dialogue.get("option_vi", item_dialogue["vi"]), item.id))
        elif quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word, seed)
            if not paragraph:
                return [], 0, []
            pairs = [(paragraph["vi"], word.id)]
            for item in distractors:
                item_paragraph = self._paragraph_for_word(item, seed)
                if item_paragraph:
                    pairs.append((item_paragraph["vi"], item.id))
        elif quiz_type == QuizType.drag_drop:
            # Vấn đề 2: drag_drop không dùng multiple-choice options.
            # UI sắp xếp token trực tiếp — chỉ cần dummy options để pass validation.
            dd = self._drag_drop_for_word(word, seed)
            if not dd:
                return [], 0, []
            # Trả về 4 dummy options, correct_index=0 (không dùng trên UI)
            pairs = [
                (dd['sentence_cn'], word.id),
                ('__drag_drop_dummy_1__', None),
                ('__drag_drop_dummy_2__', None),
                ('__drag_drop_dummy_3__', None),
            ]
        elif quiz_type == QuizType.voice:
            # Voice is self-assessment: no correct answer leaked in options
            pairs = [("Đã đọc xong", word.id), ("Chưa đọc được", word.id), ("Cần luyện thêm", word.id), ("Quá dễ", word.id)]
        elif quiz_type == QuizType.vocab:
            pairs = [(word.meaning_vi or word.meaning_en, word.id)]
            pairs.extend([(w.meaning_vi or w.meaning_en, w.id) for w in distractors])
        else:
            pairs = [(word.hanzi, word.id)]
            pairs.extend([(w.hanzi, w.id) for w in distractors])

        clean: list[tuple[str, int | None]] = []
        seen_text: set[str] = set()
        for text, wid in pairs:
            if text and text not in seen_text:
                seen_text.add(text)
                clean.append((text, wid))
        if len(clean) < 4:
            return [], 0, []
        # drag_drop và voice: UI coi index 0 là đáp án chuẩn (drag_drop chấm
        # cục bộ rồi gửi selected_index=0 khi đúng; voice dùng options[0] làm
        # "Đã đọc xong"). Shuffle sẽ làm correct_index lệch khỏi 0 → backend
        # chấm sai. Giữ nguyên thứ tự, correct_index=0 cho 2 dạng này.
        if quiz_type in (QuizType.drag_drop, QuizType.voice):
            options = [text for text, _ in clean]
            option_word_ids = [wid for _, wid in clean]
            return options, 0, option_word_ids
        correct_value = clean[0][0]
        shuffle(clean)
        options = [text for text, _ in clean]
        option_word_ids = [wid for _, wid in clean]
        return options, options.index(correct_value), option_word_ids

    def _explanation_for(self, word: Word, quiz_type: QuizType, seed: int | None = None) -> str:
        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word, seed)
            if listening:
                return f"{listening['cn']} · {listening['vi']} · {word.hanzi} · {word.pinyin}"
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word, seed)
            if dialogue:
                return f"{dialogue['cn']} · {dialogue['vi']}"
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word, seed)
            if paragraph:
                return f"{paragraph['cn']} · {paragraph['vi']}"
        if quiz_type == QuizType.drag_drop:
            dd = self._drag_drop_for_word(word, seed)
            if dd:
                return f"Câu đúng: {dd['sentence_cn']} · {word.pinyin} · {word.meaning_vi or word.meaning_en}"
        if quiz_type == QuizType.voice:
            return f"{word.hanzi} · {word.pinyin} · {word.meaning_vi or word.meaning_en} · Hãy đọc to từ này"
        if quiz_type == QuizType.cloze:
            cloze = self._cloze_for_word(word, seed)
            if cloze:
                return f"{cloze['answer_cn']} · {cloze['vi']} · Đáp án: {word.hanzi}"
        return f"{word.hanzi} · {word.pinyin} · {word.meaning_vi or word.meaning_en}"

    def _audio_for(self, word: Word, quiz_type: QuizType, seed: int | None = None) -> str:
        if quiz_type == QuizType.listening:
            listening = self._listening_for_word(word, seed)
            return listening["cn"] if listening else word.hanzi
        if quiz_type == QuizType.dialogue:
            dialogue = self._dialogue_for_word(word, seed)
            return dialogue["cn"] if dialogue else ""
        if quiz_type == QuizType.translation:
            paragraph = self._paragraph_for_word(word, seed)
            return paragraph["cn"] if paragraph else ""
        if quiz_type == QuizType.drag_drop:
            dd = self._drag_drop_for_word(word, seed)
            return dd["sentence_cn"] if dd else ""
        if quiz_type == QuizType.voice:
            vp = self._voice_prompt_for_word(word, seed)
            if vp and vp.startswith('Đọc to câu sau: '):
                return vp.replace('Đọc to câu sau: ', '').strip()
            examples = self._examples_for(word)
            ex = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
            return ex.sentence_cn if ex and ex.sentence_cn else word.hanzi
        return ""

    def _drag_drop_for_word(self, word: Word, seed: int | None = None) -> dict[str, str] | None:
        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if not example or not example.sentence_cn or word.hanzi not in example.sentence_cn:
            return None
        import re as _re
        sentence = example.sentence_cn
        # Split sentence into segments around the target word
        escaped = _re.escape(word.hanzi)
        parts = _re.split(f'({escaped})', sentence)
        segments = [p for p in parts if p]
        # Further split long segments (>3 CJK chars) into smaller chunks
        result = []
        for seg in segments:
            if seg == word.hanzi:
                result.append(seg)
            elif len(seg) <= 3:
                result.append(seg)
            else:
                # Split long segments at punctuation first
                sub = _re.split(r'([，。！？、：])', seg)
                result.extend(p for p in sub if p)
        # Cần ít nhất 2 token KHÁC NHAU mới thành bài sắp xếp: nếu chỉ 1 token
        # hoặc mọi token giống hệt nhau thì không xáo trộn nào khác được thứ tự
        # gốc → câu hỏi hiện ra đã đúng sẵn. Bỏ qua, không sinh câu này.
        if len(set(result)) < 2:
            return None
        # Đảm bảo scrambled luôn khác correct_order (tránh shuffle trả về y hệt).
        rng = random.Random(seed) if seed is not None else random.Random()
        scrambled = list(result)
        for _ in range(10):
            rng.shuffle(scrambled)
            if scrambled != result:
                break
        return {
            "sentence_cn": sentence,
            "sentence_vi": example.sentence_vi or "",
            "scrambled": " · ".join(scrambled),
            "segments": scrambled,
            "correct_order": result,
        }


    def _voice_prompt_for_word(self, word: Word, seed: int | None = None) -> str | None:
        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if example and example.sentence_cn:
            return f"Đọc to câu sau: {example.sentence_cn}"
        return f"Đọc to từ: {word.hanzi} ({word.pinyin or ''})"

    def _listening_for_word(self, word: Word, seed: int | None = None) -> dict[str, str] | None:
        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if example and example.sentence_cn and example.sentence_vi:
            return {"cn": example.sentence_cn, "vi": example.sentence_vi}
        meaning = word.meaning_vi or word.meaning_en
        if not meaning:
            return None
        return {"cn": word.hanzi, "vi": meaning}

    def _dialogue_for_word(self, word: Word, seed: int | None = None) -> dict[str, str] | None:
        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if not example or not example.sentence_cn or not example.sentence_vi:
            return None
        meaning = word.meaning_vi or word.meaning_en or "nghĩa chính"
        try:
            engine = get_template_engine()
            return engine.render_dialogue(
                target_hanzi=word.hanzi,
                meaning=meaning,
                pinyin=word.pinyin or "",
                example_cn=example.sentence_cn,
                example_vi=example.sentence_vi,
                seed=seed,
            )
        except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError, TypeError):
            pass
        # Fallback: hardcoded variants
        variants = [
            {
                "cn": f"A：你今天在学习什么？B：我在学习「{word.hanzi}」。老师说：「{example.sentence_cn}」 A：这个词是什么意思？B：它的意思是「{meaning}」，我晚上还会复习。",
                "vi": f"A hỏi hôm nay đang học gì. B nói đang học từ 「{word.hanzi}」, nghe câu ví dụ 「{example.sentence_vi}」, giải thích nghĩa là 「{meaning}」 và tối sẽ ôn lại.",
                "option_vi": f"B học từ 「{word.hanzi}」 và sẽ ôn lại.",
            },
            {
                "cn": f"A：刚才老师说了哪个句子？B：老师说：「{example.sentence_cn}」 A：你听懂了吗？B：听懂了，重点词是「{word.hanzi}」，意思是「{meaning}」。",
                "vi": f"A hỏi giáo viên vừa nói câu nào. B nhắc lại 「{example.sentence_vi}」, nói đã nghe hiểu, từ trọng tâm là 「{word.hanzi}」, nghĩa là 「{meaning}」.",
                "option_vi": f"B nghe hiểu câu về 「{word.hanzi}」.",
            },
            {
                "cn": f"A：我们一起练口语吧。B：好，我先说一个句子：「{example.sentence_cn}」 A：很好。这个句子里，「{word.hanzi}」怎么用？B：它可以放在完整句子里表达「{meaning}」。",
                "vi": f"A rủ luyện nói. B đọc câu 「{example.sentence_vi}」. A hỏi cách dùng 「{word.hanzi}」, B giải thích từ này được đặt trong câu hoàn chỉnh để diễn đạt 「{meaning}」.",
                "option_vi": f"Hai người luyện cách dùng 「{word.hanzi}」.",
            },
        ]
        return variants[word.id % len(variants)]

    def _paragraph_for_word(self, word: Word, seed: int | None = None) -> dict[str, str] | None:
        examples = self._examples_for(word)
        first = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if not first or not first.sentence_cn or not first.sentence_vi:
            return None
        meaning = word.meaning_vi or word.meaning_en or "nghĩa chính"
        # Đoạn vượt giới hạn độ dài của cấp HSK → dùng câu ví dụ đơn cho đúng cấp.
        cap = _PARAGRAPH_CJK_CAP_BY_LEVEL.get(word.hsk_level, 200)

        def _within_cap(para: dict[str, str] | None) -> dict[str, str] | None:
            # Cap chỉ để chặn đoạn SINH RA nhiều câu quá dài so với cấp. Câu ví
            # dụ đơn là nội dung chuẩn cấp độ → luôn là mức sàn, không loại bỏ
            # (loại sẽ làm câu dịch của từ đó biến mất hẳn).
            if para and _count_cjk(para.get("cn", "")) <= cap:
                return para
            return {"cn": first.sentence_cn, "vi": first.sentence_vi}

        try:
            engine = get_template_engine()
            rendered = engine.render_paragraph(
                target_hanzi=word.hanzi,
                meaning=meaning,
                pinyin=word.pinyin or "",
                example_cn=first.sentence_cn,
                example_vi=first.sentence_vi,
                seed=seed,
            )
            return _within_cap(rendered)
        except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError, TypeError):
            pass
        # Fallback: hardcoded variants (giữ nguyên tiếng Trung để dùng khi JSON lỗi)
        variants = [
            {
                "cn": f"今天上午，我在学校学习中文。老师先说：「{first.sentence_cn}」 然后让我们解释「{word.hanzi}」的意思。下课以后，我把这个词、拼音和例句写在本子上，晚上再复习一遍。",
                "vi": f"Sang nay, toi hoc tieng Trung o truong. Giao vien noi truoc: 「{first.sentence_vi}」 Sau do, giao vien yeu cau chung toi giai thich nghia cua 「{word.hanzi}」. Sau gio hoc, toi ghi tu nay, pinyin va cau vi du vao vo, buoi toi on lai mot lan nua.",
            },
            {
                "cn": f"昨天晚上，我和朋友练习口语。我们用「{word.hanzi}」造了一个句子：「{first.sentence_cn}」 因为这个词和日常生活有关，所以我觉得它很容易记住，也很适合在聊天时使用。",
                "vi": f"Toi hom qua, toi luyen noi voi ban. Chung toi dung 「{word.hanzi}」 de dat mot cau: 「{first.sentence_vi}」 Vi tu nay lien quan den doi song hang ngay, nen toi thay no de nho va cung phu hop de dung khi tro chuyen.",
            },
            {
                "cn": f"这周我给自己定了一个小目标：每天记十个汉语词。今天的重点词是「{word.hanzi}」，意思是「{meaning}」。我先读例句「{first.sentence_cn}」，再听发音，最后用自己的话说一遍。",
                "vi": f"Tuan nay toi dat cho minh mot muc tieu nho: moi ngay ghi nho muoi tu tieng Trung. Tu trong tam hom nay la 「{word.hanzi}」, nghia la 「{meaning}」. Toi doc cau vi du 「{first.sentence_vi}」 truoc, sau do nghe phat am, cuoi cung noi lai bang loi cua minh.",
            },
            {
                "cn": f"如果只看生词，我常常忘得很快。现在我把「{word.hanzi}」放进完整的句子里学习，比如：「{first.sentence_cn}」 这样我不仅知道它的意思，还知道它出现在什么场景、和哪些词一起使用。",
                "vi": f"Neu chi nhin tu moi, toi thuong quen rat nhanh. Bay gio toi dat 「{word.hanzi}」 vao cau hoan chinh de hoc, vi du: 「{first.sentence_vi}」 Nhu vay toi khong chi biet nghia cua no, ma con biet no xuat hien trong ngu canh nao va di cung nhung tu nao.",
            },
        ]
        return _within_cap(variants[word.id % len(variants)])

    def _cloze_for_word(self, word: Word, seed: int | None = None) -> dict[str, str] | None:
        examples = self._examples_for(word)
        example = random.Random(seed).choice(examples) if examples and seed is not None else (examples[0] if examples else None)
        if not example or not example.sentence_cn or word.hanzi not in example.sentence_cn:
            return None
        prompt = _cloze_replace_all(example.sentence_cn, word.hanzi)
        if prompt is None:
            return None
        # Chỉ sinh cloze nếu còn ít nhất 2 ký tự ngữ cảnh ngoài ____
        non_blank = prompt.replace('____', '').strip()
        if _count_cjk(non_blank) < 2:
            return None
        return {"prompt": prompt, "answer_cn": example.sentence_cn, "vi": example.sentence_vi or ""}
