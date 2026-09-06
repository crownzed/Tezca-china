import json
import random
import re
from random import shuffle

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Example, Question, QuizType, Word
from .distractor_policy import order_distractors_by_stage
from .exam_passage_service import (
    QUESTION_SUBTYPE_GUIDED_CLOZE,
    QUESTION_SUBTYPE_READING_COMP,
    get_exam_passage_bank,
)
from .gloss_senses import (
    conflicting_option_indexes,
    duplicate_after_normalize,
    gloss_reveals_hanzi,
    has_cjk,
    normalize_text,
    senses,
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

# Dạng mà 4 lựa chọn là GLOSS tiếng Việt của một từ (không phải câu/đoạn/hanzi).
# Chỉ những dạng này được so trùng theo TẬP NGHĨA: options của
# listening/dialogue/translation là câu hoàn chỉnh, tách theo dấu phẩy sẽ ra các
# mệnh đề trùng nhau giữa hai đoạn khác nghĩa (đo trên bank: 65,1% câu
# translation bị coi là xung đột) → báo động giả, loại oan câu đúng.
_GLOSS_OPTION_TYPES = frozenset({QuizType.vocab})

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
    target_hanzi: str = "",
) -> bool:
    """Cổng QA cuối trước khi ghi bank.

    Template/LLM đều phải đi qua cùng một contract: 4 lựa chọn khác nhau,
    đáp án hợp lệ, prompt có nội dung và dạng đặc biệt có metadata cần thiết.
    Điều này ngăn dữ liệu lỗi lọt vào DB khi nguồn ví dụ hoặc template thiếu.

    ``target_hanzi`` chỉ dùng cho ``vocab``: xem ``_GLOSS_OPTION_TYPES``.
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
    # So chuỗi thô ở trên bỏ sót cặp chỉ khác chữ hoa/thường: 14 câu trong bank
    # có hai lựa chọn như ``'Có lẽ'`` / ``'có lẽ'`` (câu 8357, từ 可能).
    if duplicate_after_normalize(cleaned):
        return False
    if not isinstance(correct_index, int) or not 0 <= correct_index < 4:
        return False
    if quiz_type in _GLOSS_OPTION_TYPES and not _valid_gloss_options(
        cleaned, correct_index, target_hanzi
    ):
        return False
    if quiz_type == QuizType.cloze and "____" not in prompt:
        return False
    if quiz_type == QuizType.drag_drop:
        segments = metadata.get("segments") or []
        order = metadata.get("correct_order") or []
        if len(segments) < 2 or len(order) < 2:
            return False
    return True


def _valid_gloss_options(options: list[str], correct_index: int, target_hanzi: str) -> bool:
    """Kiểm riêng cho lựa chọn dạng GLOSS tiếng Việt (``vocab``).

    Hai lỗi mà cổng cũ để lọt, đo trên bank hiện có:

    1. **Hai đáp án cùng đúng** (262 câu): distractor lấy từ ``meaning_vi`` của
       từ khác cùng cấp, mà 36,6% từ vựng trùng ít nhất một nghĩa với từ khác
       CÙNG cấp HSK. Ví dụ câu 11675 hỏi 低 với đáp án ``'thấp'`` và distractor
       ``'Thấp'`` (từ 矮); câu 5341 hỏi 小 (``'nhỏ; bé; ít; trẻ'``) với distractor
       ``'Ít'`` (từ 少). Xem ``gloss_senses`` để biết vì sao phải so tập nghĩa.
    2. **Đáp án tự lộ** (câu 2556): gloss chứa chính chữ Hán đang hỏi, nên lựa
       chọn duy nhất có chữ Hán là đáp án.
    """
    if conflicting_option_indexes(options, correct_index):
        return False
    if any(has_cjk(option) for option in options):
        return False
    if gloss_reveals_hanzi(options[correct_index], target_hanzi):
        return False
    return True


# Mã từ loại -> nhãn tiếng Việt hiển thị cho người học. Bảng ``words`` trộn ba
# quy ước từ ba nguồn nhập khác nhau (mã HSK Trung ``n``/``v``/``vn``, mã tiếng
# Anh ``noun``/``verb``, và vài dòng đã là tiếng Việt), nên phải tra bằng bảng
# thay vì hiển thị thô. 64 mã sau khi tách theo ``/``; bảng này phủ ~99%.
_POS_LABELS = {
    "n": "danh từ", "noun": "danh từ", "nr": "danh từ riêng", "nz": "danh từ riêng",
    "v": "động từ", "verb": "động từ", "vn": "danh động từ", "qv": "động từ",
    "a": "tính từ", "adj": "tính từ", "adjective": "tính từ", "an": "danh tính từ",
    "d": "phó từ", "ad": "phó từ", "adv": "phó từ", "adverb": "phó từ",
    "q": "lượng từ", "measure": "lượng từ", "qt": "lượng từ", "m": "số từ",
    "r": "đại từ", "pron": "đại từ",
    "p": "giới từ", "prep": "giới từ", "preposition": "giới từ",
    "c": "liên từ", "conj": "liên từ", "conjunction": "liên từ",
    "u": "trợ từ", "y": "trợ từ", "k": "trợ từ",
    "t": "từ chỉ thời gian", "f": "từ chỉ phương vị", "s": "từ chỉ nơi chốn",
    "b": "từ phân biệt", "z": "từ trạng thái", "g": "từ tố", "l": "cụm cố định",
}


# Mở đầu của ``component_hint`` khi ``chinese_metadata_service`` không tra được
# bộ thủ nào và phải rơi về câu chung chung ("Quan sát ký tự X trước, rồi..."),
# đúng với 330/5.746 từ. Câu đó không dạy được gì nên không đưa vào giải thích.
_GENERIC_HINT_PREFIX = "Quan sát ký tự"


def _pos_label(pos: object) -> str:
    """Nhãn từ loại tiếng Việt cho ``word.pos``, hoặc chuỗi rỗng nếu không tra được.

    ``pos`` có thể là mã ghép (``'v/vn'``, ``'a/ad'``): lấy nhãn của TỪNG mã tra
    được, bỏ mã lạ, và giữ thứ tự gốc vì mã đầu là từ loại chính.
    """
    labels: list[str] = []
    for token in str(pos or "").split("/"):
        label = _POS_LABELS.get(token.strip().casefold())
        if label and label not in labels:
            labels.append(label)
    return "/".join(labels)


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


def _inside_compound(text: str, index: int, compounds: frozenset[str]) -> bool:
    """``text[index]`` có đang là một phần của từ ghép trong ``compounds``?

    Quét các đoạn 2-4 ký tự bao trùm ``index``; khớp một từ ghép đã biết nghĩa là
    ký tự này không đứng độc lập ở đây.
    """
    length = len(text)
    for size in (4, 3, 2):
        first = max(0, index - size + 1)
        last = min(index, length - size)
        for start in range(first, last + 1):
            if text[start:start + size] in compounds:
                return True
    return False


def _cloze_replace_all(
    text: str, hanzi: str, compounds: frozenset[str] | None = None
) -> str | None:
    """Khoét MỌI lần xuất hiện độc lập của ``hanzi`` thành ``____``.

    Từ ghép (2+ ký tự) thay trực tiếp. Từ đơn thì chỉ khoét những lần xuất hiện
    KHÔNG nằm trong một từ ghép dài hơn (``compounds`` = các từ ghép đã biết có
    chứa ``hanzi``) — khoét 学 trong 学习 sẽ tạo câu hỏi sai vì chỗ trống không
    còn là một từ.

    Trước đây điều kiện độc lập là "hai bên không phải chữ Hán", nhưng tiếng Trung
    viết liền không dấu cách nên gần như mọi từ đơn đều có chữ Hán kề bên: hàm
    luôn trả None và KHÔNG từ đơn nào sinh được câu cloze. Đó là toàn bộ khoảng
    trống cloze còn lại ở HSK1-3 (100% từ chưa phủ là từ đơn).

    ``compounds=None`` (không tra được từ điển) → coi như không có từ ghép nào,
    tức mọi lần xuất hiện đều độc lập.
    """
    if len(hanzi) >= 2:
        result = text.replace(hanzi, "____")
        return result if result != text else None

    known = compounds or frozenset()
    out: list[str] = []
    replaced = False
    for index, char in enumerate(text):
        if char == hanzi and not _inside_compound(text, index, known):
            out.append("____")
            replaced = True
        else:
            out.append(char)
    return "".join(out) if replaced else None


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
        # Cache các từ ghép (2+ ký tự) chứa một ký tự cho trước, dùng để biết một
        # lần xuất hiện của từ ĐƠN có đang nằm trong từ ghép dài hơn hay không
        # (xem ``_cloze_replace_all``). Tra một lần cho mỗi ký tự trong vòng đời
        # service; từ điển không đổi trong một lượt sinh.
        self._compound_cache: dict[str, frozenset[str]] = {}

    def _compounds_containing(self, hanzi: str) -> frozenset[str]:
        """Các từ ghép trong từ điển có chứa ký tự ``hanzi``.

        Chỉ tra cho từ ĐƠN — từ ghép tự khoét trực tiếp nên không cần. Dùng để
        không khoét 学 khi nó đang là một nửa của 学习.
        """
        if len(hanzi) != 1:
            return frozenset()
        cached = self._compound_cache.get(hanzi)
        if cached is None:
            rows = self.db.scalars(
                select(Word.hanzi).where(
                    func.length(Word.hanzi) >= 2,
                    Word.hanzi.contains(hanzi),
                )
            ).all()
            cached = frozenset(rows)
            self._compound_cache[hanzi] = cached
        return cached

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

        Lấy mẫu NGẪU NHIÊN trong cấp thay vì ``limit(80)`` thuần: ``limit`` không
        kèm ``order by`` luôn trả 80 từ đầu bảng theo primary key, nên ở HSK5/6
        (~1.7k từ mỗi cấp) mọi distractor đều rút từ cùng một nhóm nhỏ đầu bộ từ.
        Cache vẫn giữ trong vòng đời service nên không đổi số truy vấn.
        """
        key = (hsk_level, pos)
        cached = self._pool_cache.get(key)
        if cached is None:
            query = select(Word).where(Word.hsk_level == hsk_level)
            if pos:
                query = query.where(Word.pos == pos)
            cached = self.db.scalars(query.order_by(func.random()).limit(80)).all()
            self._pool_cache[key] = cached
        return cached

    def _capable_word_filter(self, quiz_type: QuizType):
        """Điều kiện SQL giữ lại từ CÓ THỂ sinh câu ở ``quiz_type``.

        cloze/drag_drop cần câu ví dụ CHỨA chính từ đích (để khoét ô trống hoặc
        tách token); translation/dialogue cần cặp câu CN-VI đầy đủ. Từ không đạt
        sẽ luôn trả None trong ``_prompt_for`` nên loại ngay ở SQL để mỗi lượt
        sinh không đốt slot vào từ vô vọng. Các dạng khác trả ``None`` (không lọc)
        vì đã có nhánh fallback về hanzi + meaning.
        """
        if quiz_type in (QuizType.cloze, QuizType.drag_drop):
            return (
                select(Example.id)
                .where(
                    Example.word_id == Word.id,
                    Example.sentence_cn.contains(Word.hanzi),
                )
                .exists()
            )
        if quiz_type in (QuizType.translation, QuizType.dialogue):
            return (
                select(Example.id)
                .where(
                    Example.word_id == Word.id,
                    Example.sentence_cn != "",
                    Example.sentence_vi != "",
                )
                .exists()
            )
        return None

    def _source_words(self, level: int, quiz_type: QuizType, want: int) -> list[Word]:
        """Từ nguồn để sinh câu, ƯU TIÊN từ chưa có câu ở ``(level, quiz_type)``.

        Trước đây dùng ``select(Word).where(hsk_level == level).limit(n)``: không
        có ``order by`` nên SQL luôn trả CÙNG n từ đầu bảng theo primary key. Hệ
        quả là mọi lượt sinh đều bám vào phần đầu bộ từ mỗi cấp, còn phần đuôi
        (HSK5/6 có ~1.7k từ mỗi cấp) không bao giờ được dùng — dù từ vựng đã nạp
        đủ. Giờ xếp theo (số câu đã có ở dạng này, ngẫu nhiên) nên mỗi lượt sinh
        kéo coverage lan ra từ mới, và bank dần phủ toàn bộ từ vựng của cấp.
        """
        covered = (
            select(Question.word_id.label("word_id"), func.count(Question.id).label("hits"))
            .where(
                Question.level == level,
                Question.quiz_type == quiz_type,
                Question.word_id.is_not(None),
            )
            .group_by(Question.word_id)
            .subquery()
        )
        query = (
            select(Word)
            .outerjoin(covered, covered.c.word_id == Word.id)
            .where(Word.hsk_level == level)
        )
        capable = self._capable_word_filter(quiz_type)
        if capable is not None:
            query = query.where(capable)
        query = query.order_by(func.coalesce(covered.c.hits, 0), func.random()).limit(want)
        return list(self.db.scalars(query).all())

    def coverage(self, level: int, quiz_type: QuizType) -> tuple[int, int]:
        """``(số từ đã có câu, số từ CÓ THỂ sinh câu)`` ở ``(level, quiz_type)``.

        Mẫu số là số từ đạt điều kiện của dạng (xem ``_capable_word_filter``),
        không phải toàn bộ từ của cấp — cloze/translation không thể phủ những từ
        chưa có câu ví dụ phù hợp, nên tính vào mẫu số sẽ báo thiếu vĩnh viễn.
        """
        capable = self._capable_word_filter(quiz_type)
        total_query = select(func.count(Word.id)).where(Word.hsk_level == level)
        if capable is not None:
            total_query = total_query.where(capable)
        total = self.db.scalar(total_query) or 0

        done_query = (
            select(func.count(func.distinct(Question.word_id)))
            .select_from(Question)
            .join(Word, Word.id == Question.word_id)
            # Ràng buộc CẢ hai phía: bank có sẵn ít row lệch cấp (``question.level``
            # khác ``word.hsk_level``, sinh ra trước khi có script phủ này). Không
            # lọc theo cấp của TỪ thì các row đó lọt vào tử số của cấp khác và tỉ lệ
            # vượt 100%, làm báo cáo mất nghĩa.
            .where(
                Question.level == level,
                Question.quiz_type == quiz_type,
                Word.hsk_level == level,
            )
        )
        if capable is not None:
            done_query = done_query.where(capable)
        done = self.db.scalar(done_query) or 0
        return done, total

    def ensure_coverage(self, level: int, quiz_type: QuizType, batch: int = 200) -> int:
        """Sinh câu cho tối đa ``batch`` từ CHƯA có câu nào ở dạng này.

        Khác ``ensure_questions`` (đủ ``limit`` câu là dừng, không quan tâm câu đó
        thuộc từ nào): hàm này lấy coverage làm mục tiêu nên mỗi lượt gọi đều mở
        rộng số TỪ được phủ. Idempotent + resumable: chạy lại chỉ nhặt phần còn
        thiếu, nên script nạp bank có thể lặp tới khi phủ hết mà không tạo trùng.

        Mỗi từ chạy trong một SAVEPOINT riêng: một từ vi phạm unique constraint
        (prompt trùng do seed khác sinh ra cùng câu) chỉ mất từ đó, không cuốn cả
        lô từ đã sinh thành công theo.

        Trả về số từ được phủ thêm.
        """
        covered_ids = select(Question.word_id).where(
            Question.level == level,
            Question.quiz_type == quiz_type,
            Question.word_id.is_not(None),
        )
        query = select(Word).where(Word.hsk_level == level, Word.id.notin_(covered_ids))
        capable = self._capable_word_filter(quiz_type)
        if capable is not None:
            query = query.where(capable)
        pending = self.db.scalars(query.order_by(Word.id).limit(batch)).all()
        if not pending:
            return 0

        added = 0
        for word in pending:
            for _ in range(3):  # thử vài seed: template có thể trả None với seed xấu
                savepoint = self.db.begin_nested()
                try:
                    question = self._get_or_create_question(
                        word, level, quiz_type, random.randint(0, 1_000_000)
                    )
                except IntegrityError:
                    savepoint.rollback()
                    continue
                if question is None:
                    savepoint.rollback()
                    continue
                savepoint.commit()
                added += 1
                break
        self.db.commit()
        return added

    def ensure_questions(self, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        # cloze/reading: nạp ngân hàng đoạn văn chuẩn đề thi trước. Đây là dữ
        # liệu viết tay nên luôn ưu tiên hơn template per-word; template chỉ lấp
        # phần còn thiếu khi bank chưa đủ ``limit``.
        self._seed_exam_bank(level, quiz_type)

        existing = self._existing_questions(level, quiz_type, limit)
        if len(existing) >= limit:
            return existing[:limit]

        words = self._source_words(level, quiz_type, max(limit * 4, 40))
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
            target_hanzi=word.hanzi,
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
        # câu bị loại chỉ vì vài distractor thiếu example. vocab cũng lấy dư vì
        # loại distractor TRÙNG NGHĨA với đáp án (xem dưới) — 36,6% từ vựng trùng
        # nghĩa với một từ khác cùng cấp nên chọn đúng 3 rồi lọc thì hụt.
        _sentence_types = (QuizType.listening, QuizType.dialogue, QuizType.translation)
        pick_count = 8 if quiz_type in (*_sentence_types, QuizType.vocab) else 3
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
        # Với vocab, ``pairs[0]`` là gloss của đáp án đúng: mọi ứng viên có nghĩa
        # TRÙNG nó phải bị loại ngay ở đây, không chỉ trùng chuỗi. Loại tại chỗ
        # (chứ không để cổng QA loại cả câu) vì pool còn ứng viên khác dùng được —
        # bỏ cả câu sẽ làm hụt phủ từ vựng ở đúng những từ nhiều nghĩa nhất.
        answer_senses = senses(pairs[0][0]) if quiz_type in _GLOSS_OPTION_TYPES else set()
        for text, wid in pairs:
            if not text:
                continue
            key = normalize_text(text)
            if key in seen_text:
                continue
            if answer_senses and clean and senses(text) & answer_senses:
                continue
            seen_text.add(key)
            clean.append((text, wid))
        if len(clean) < 4:
            return [], 0, []
        # CẮT còn ĐÚNG 4 lựa chọn. listening/dialogue/translation lấy dư ứng viên
        # (``pick_count=8``) để chịu được distractor bị lọc hoặc trùng text, nhưng
        # ``_valid_question_payload`` đòi đúng 4 option — giữ hết sẽ tạo tới 9
        # option và câu bị loại IM LẶNG ở cổng QA. Đó là lý do bank ba dạng này
        # không nhận thêm row template nào kể từ khi ``pick_count`` đổi thành 8;
        # chỉ câu do LLM sinh (đi đường khác) mới vào được. ``clean[0]`` là đáp án
        # đúng nên cắt phần đuôi luôn giữ đáp án.
        clean = clean[:4]
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
        if quiz_type == QuizType.vocab:
            return self._vocab_explanation(word)
        return f"{word.hanzi} · {word.pinyin} · {word.meaning_vi or word.meaning_en}"

    def _vocab_explanation(self, word: Word) -> str:
        """Giải thích cho câu ``vocab``: thêm phần DẠY, không chỉ lặp đáp án.

        Dòng ``hanzi · pinyin · nghĩa`` một mình là vô ích: nó nhắc lại đúng thứ
        người học vừa chọn. 95,1% câu trong bank đang như vậy (100% câu
        ``source=generated``), nên phần "lưu ý" trên UI trống nghĩa.

        Ba mẩu bổ sung, tất cả lấy từ dữ liệu ĐÃ có trong bảng ``words`` mà chưa
        chỗ nào dùng: từ loại (``pos``, có ở 5.656/5.851 từ), bộ thủ
        (``component_hint``, 5.746 từ), và từ dễ nhầm (``confusable_words_json``,
        2.394 từ). Không gọi mạng, không thêm truy vấn.
        """
        head = f"{word.hanzi} · {word.pinyin} · {word.meaning_vi or word.meaning_en}"
        parts = [head]

        pos_label = _pos_label(word.pos)
        if pos_label:
            parts.append(f"Từ loại: {pos_label}")

        hint = (word.component_hint or "").strip()
        if hint and not hint.startswith(_GENERIC_HINT_PREFIX):
            parts.append(hint.rstrip("."))

        # ``confusable_words_json`` là list[str] hanzi (không kèm nghĩa), nên chỉ
        # liệt kê chữ — người học tra được ngay trong thư viện từ.
        confusable = [
            c if isinstance(c, str) else (c or {}).get("hanzi")
            for c in (word.confusable_words_json or [])
        ]
        distinct = [h for h in confusable if h and h != word.hanzi][:3]
        if distinct:
            parts.append("Dễ nhầm với: " + ", ".join(distinct))
        return " · ".join(parts)

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
        prompt = _cloze_replace_all(
            example.sentence_cn, word.hanzi, self._compounds_containing(word.hanzi)
        )
        if prompt is None:
            return None
        # Chỉ sinh cloze nếu còn ít nhất 2 ký tự ngữ cảnh ngoài ____
        non_blank = prompt.replace('____', '').strip()
        if _count_cjk(non_blank) < 2:
            return None
        return {"prompt": prompt, "answer_cn": example.sentence_cn, "vi": example.sentence_vi or ""}
