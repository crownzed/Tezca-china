import logging
import threading
from datetime import datetime, timezone
from random import shuffle

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

import random

from ..db import SessionLocal
from ..models import LearningEvent, Question, QuizAttempt, QuizType, UserProgress, Word
from ..schemas import AnswerResult, QuizSubmitRequest, QuizSubmitResponse
from ..settings import settings
from .event_service import LearningEventService
from .exam_passage_service import (
    QUESTION_SUBTYPE_GUIDED_CLOZE,
    QUESTION_SUBTYPE_READING_COMP,
)
from .item_difficulty import difficulty_fit, is_low_quality
from .distractor_policy import order_distractors_by_stage
from .gloss_senses import glosses_conflict, normalize_text
from .acquisition_service import acquisition_stage
from .question_generator import (
    QUESTION_SUBTYPE_DIALOGUE,
    QUESTION_SUBTYPE_MEANING,
    QUESTION_SUBTYPE_PARAGRAPH,
    QUESTION_SUBTYPE_SENTENCE,
    QuestionGeneratorService,
)
from .srs_service import SRSService

logger = logging.getLogger(__name__)

# Chống nhiều request cùng kích hoạt sinh nền cho một (level, quiz_type). Khóa
# chỉ sống trong tiến trình — đủ để gộp các request đồng thời của cùng backend.
_bankfill_lock = threading.Lock()
_bankfill_inflight: set[tuple[int, str]] = set()

# Các dạng câu mà AI (generate_exercises_for_vocab) sinh ra khớp trực tiếp với
# schema Question và render được qua option-grid sẵn có. Các dạng khác
# (listening/dialogue/translation/drag_drop/voice) cần audio_text CN hoặc
# segments mà output AI không cung cấp → giữ nguyên template-only.
_AI_MAPPABLE_TYPES = {QuizType.vocab, QuizType.cloze, QuizType.reading, QuizType.translation}
# Nguồn đánh dấu câu hỏi AI sinh nền cho luồng luyện tập.
_AI_PRACTICE_SOURCE = "ai_practice_llm"
# Trần số câu AI mỗi (level, quiz_type) — chặn chi phí gọi LLM. Blend chỉ cần
# ~limit/2 câu/lượt nên giữ mức khiêm tốn, bank đầy dần qua nhiều lượt chơi.
_AI_BANK_TARGET = 24

# Khóa in-flight cho AI fill, keyed theo level (một lượt gọi LLM enrich nhiều
# dạng cùng lúc nên không keyed theo quiz_type như template fill).
_ai_bankfill_lock = threading.Lock()
_ai_bankfill_inflight: set[int] = set()


def _ai_available() -> bool:
    """AI khả dụng khi provider LLM đang chọn có ít nhất một key.

    ``llm_keys_list`` tự bám theo provider (StepFun -> vilao), nên hàm này không
    cần biết provider nào đang bật.
    """
    return bool(settings.llm_keys_list)


def _is_ai_question(question: Question) -> bool:
    """Câu hỏi do LLM sinh (custom-vocab, passage, hoặc AI practice fill)."""
    return str((question.metadata_json or {}).get("source", "")).endswith("_llm")


def _ai_subtype_for(quiz_type: QuizType) -> str:
    """question_subtype để câu AI lọt qua bộ lọc subtype trong get_quiz.

    cloze/reading: prompt LLM giờ yêu cầu đúng khuôn đề thi (选词填空 /
    阅读理解) như ngân hàng đoạn văn viết tay, nên gắn cùng subtype với ngân
    hàng đó. Bộ lọc cloze trong get_quiz nhận cả guided_cloze nên câu AI vẫn
    được phục vụ. reading không bị lọc theo subtype.

    Lưu ý: câu AI không có ``passage``/``stem`` tách riêng trong metadata nên UI
    render cả prompt trong một khối — vẫn đọc được vì prompt đã gồm đoạn + câu
    hỏi, chỉ không tách khung như câu từ ngân hàng.
    """
    if quiz_type == QuizType.cloze:
        return QUESTION_SUBTYPE_GUIDED_CLOZE
    if quiz_type == QuizType.reading:
        return QUESTION_SUBTYPE_READING_COMP
    if quiz_type == QuizType.translation:
        return QUESTION_SUBTYPE_PARAGRAPH
    return QUESTION_SUBTYPE_MEANING


def _fill_bank_ai_background(level: int, target: int = _AI_BANK_TARGET) -> None:
    """Sinh câu hỏi AI cho ``level`` ở thread nền, dùng session riêng.

    Một lượt gọi LLM (generate_exercises_for_vocab) enrich nhiều dạng cùng lúc;
    câu AI được lưu để BLEND vào các lượt SAU (không phục vụ ngay lượt hiện tại).
    Khóa in-flight keyed theo level tránh nhiều thread cùng gọi LLM cho một cấp.
    Mọi lỗi (timeout ~90s, thiếu key, JSON hỏng) chỉ log — luồng luyện tập vẫn
    chạy trên template, đúng chủ trương fallback về template.
    """
    if not _ai_available():
        return
    with _ai_bankfill_lock:
        if level in _ai_bankfill_inflight:
            return
        _ai_bankfill_inflight.add(level)
    try:
        with SessionLocal() as db:
            _generate_ai_questions(db, level, target)
    except Exception:
        logger.exception("fill_bank_ai_background failed for level=%s", level)
    finally:
        with _ai_bankfill_lock:
            _ai_bankfill_inflight.discard(level)


def _generate_ai_questions(db: Session, level: int, target: int) -> int:
    """Gọi LLM sinh câu hỏi AI cho các từ ở ``level``, lưu các dạng mappable.

    Dừng sớm nếu bank AI của cấp này đã đủ ``target`` câu (theo dạng ít nhất).
    Trả về số câu mới thêm. Dedup theo (word_id, quiz_type, prompt) để tôn trọng
    unique constraint của Question.
    """
    from .llm_generator_service import generate_exercises_for_vocab

    existing = db.scalars(
        select(Question).where(
            Question.level == level,
            Question.quiz_type.in_(_AI_MAPPABLE_TYPES),
        )
    ).all()
    ai_per_type: dict[QuizType, int] = {qt: 0 for qt in _AI_MAPPABLE_TYPES}
    existing_keys: set[tuple[int | None, QuizType, str]] = set()
    for q in existing:
        existing_keys.add((q.word_id, q.quiz_type, q.prompt))
        if _is_ai_question(q):
            ai_per_type[q.quiz_type] = ai_per_type.get(q.quiz_type, 0) + 1
    if min(ai_per_type.values()) >= target:
        return 0

    words = db.scalars(
        select(Word)
        .where(Word.hsk_level == level)
        .order_by(func.random())
        .limit(60)
    ).all()
    if not words:
        return 0
    word_by_hanzi = {w.hanzi: w for w in words}
    sample = random.sample(words, min(8, len(words)))

    data = generate_exercises_for_vocab([w.hanzi for w in sample])

    added = 0
    for item in data.get("words", []):
        word = word_by_hanzi.get(item.get("hanzi"))
        if not word:
            continue
        for q_data in item.get("questions", []):
            try:
                q_type = QuizType(q_data.get("quiz_type", ""))
            except ValueError:
                continue
            if q_type not in _AI_MAPPABLE_TYPES:
                continue
            options = q_data.get("options", [])
            if not isinstance(options, list) or len(options) != 4:
                continue
            prompt = q_data.get("prompt", "")
            key = (word.id, q_type, prompt)
            if key in existing_keys:
                continue
            existing_keys.add(key)
            correct_index = q_data.get("correct_index", 0)
            option_word_ids: list[int | None] = [None, None, None, None]
            if isinstance(correct_index, int) and 0 <= correct_index < 4:
                option_word_ids[correct_index] = word.id
            db.add(Question(
                word_id=word.id,
                level=level,
                quiz_type=q_type,
                prompt=prompt,
                options=options,
                correct_index=correct_index if isinstance(correct_index, int) else 0,
                explanation=q_data.get("explanation", ""),
                audio_text="",
                metadata_json={
                    "source": _AI_PRACTICE_SOURCE,
                    "question_subtype": _ai_subtype_for(q_type),
                    "option_word_ids": option_word_ids,
                },
            ))
            added += 1
    if added:
        db.commit()
    return added


def _fill_bank_background(level: int, quiz_type: QuizType, target: int) -> None:
    """Nạp bank câu hỏi lên ``target`` ở thread nền, dùng session riêng.

    Request chỉ sinh đủ câu để phục vụ ngay; phần còn lại (đa dạng hóa bank)
    được đẩy sang đây để không chặn response. Khóa in-flight tránh nhiều
    thread cùng sinh một (level, quiz_type).
    """
    key = (level, quiz_type.value)
    with _bankfill_lock:
        if key in _bankfill_inflight:
            return
        _bankfill_inflight.add(key)
    try:
        with SessionLocal() as db:
            QuestionGeneratorService(db).ensure_questions(level, quiz_type, target)
    except Exception:
        logger.exception("fill_bank_background failed for level=%s type=%s", level, quiz_type)
    finally:
        with _bankfill_lock:
            _bankfill_inflight.discard(key)


def _build_user_confusion_map(db: Session, user_id: str) -> dict[int, list[int]]:
    """Quét QuizAttempt để tìm các cặp từ người dùng từng nhầm lẫn.

    Trả về dict[target_word_id] = [confused_word_id_1, confused_word_id_2, ...].
    Các confused_word_id được sắp xếp theo tần suất nhầm giảm dần.
    """
    attempts = db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user_id)
        .order_by(QuizAttempt.created_at.desc())
        .limit(40)
    ).all()
    if not attempts:
        return {}

    question_ids: set[int] = set()
    wrong_pairs: list[tuple[int, int]] = []  # (question_id, selected_index)
    for attempt in attempts:
        for answer in attempt.answers or []:
            if not answer.get("correct") and answer.get("selected_index") is not None:
                qid = answer.get("question_id")
                if qid is not None:
                    question_ids.add(int(qid))
                    wrong_pairs.append((int(qid), int(answer["selected_index"])))

    if not question_ids:
        return {}

    questions = db.scalars(select(Question).where(Question.id.in_(question_ids))).all()
    q_by_id = {q.id: q for q in questions}

    confusion: dict[int, dict[int, int]] = {}  # target_word_id -> {confused_word_id: count}
    for qid, selected_idx in wrong_pairs:
        q = q_by_id.get(qid)
        if not q or not q.word_id:
            continue
        option_wids = (q.metadata_json or {}).get("option_word_ids") or []
        if selected_idx >= len(option_wids):
            continue
        confused_wid = option_wids[selected_idx]
        if confused_wid is None or confused_wid == q.word_id:
            continue
        inner = confusion.setdefault(q.word_id, {})
        inner[confused_wid] = inner.get(confused_wid, 0) + 1

    result: dict[int, list[int]] = {}
    for target_wid, counts in confusion.items():
        sorted_pairs = sorted(counts.items(), key=lambda x: -x[1])
        result[target_wid] = [wid for wid, _ in sorted_pairs]
    return result


# Dạng câu mà lựa chọn là GLOSS tiếng Việt của một từ. Chỉ những dạng này được
# so trùng theo TẬP NGHĨA khi chèn distractor; xem ``_safe_swap_text``.
_GLOSS_OPTION_TYPES = (QuizType.vocab,)
# Dạng có lựa chọn là gloss NHƯNG đáp án đúng là câu/đoạn hoàn chỉnh.
_SENTENCE_OPTION_TYPES = (QuizType.listening, QuizType.dialogue, QuizType.translation)


def _swap_option_text(question: Question, word: Word) -> str:
    """Text đại diện cho ``word`` khi chèn vào options của ``question``."""
    if question.quiz_type in (*_GLOSS_OPTION_TYPES, *_SENTENCE_OPTION_TYPES):
        return word.meaning_vi or word.meaning_en or ""
    return word.hanzi or ""


def _safe_swap_text(
    question: Question,
    options: list[str],
    correct_idx: int,
    text: str,
) -> bool:
    """Chèn ``text`` vào một ô distractor có an toàn không?

    Guard cũ chỉ có ``text in options`` — so chuỗi NGUYÊN VĂN, nên hai lỗi lọt
    qua (đo bằng mô phỏng trên toàn bank):

    1. **Trùng nghĩa với đáp án** (46 câu vocab): 改变 ``'Thay đổi'`` bị chèn thêm
       变化 ``'thay đổi, biến hóa'``; 矮 ``'Thấp'`` bị chèn thêm 低 ``'thấp'``.
       Người học chọn ô nào cũng đúng nhưng backend chỉ nhận một ô.
    2. **Trùng lựa chọn khác sau chuẩn hoá** (19 câu): chỉ khác chữ hoa/thường.

    Với listening/dialogue/translation còn một lỗi thứ ba, nặng hơn: đáp án đúng
    là CÂU (p50 = 53–164 ký tự) còn gloss chèn vào chỉ vài ký tự (``'tôi'``,
    ``'Trong'``), nên ô ngắn tũn hiện ra giữa ba ô dài là lộ đáp án bằng mắt —
    2.134/2.366 câu dialogue sẽ bị vậy. Ba dạng đó không nhận swap gloss nữa.
    """
    if not text:
        return False
    if question.quiz_type in _SENTENCE_OPTION_TYPES:
        return False
    if any(normalize_text(text) == normalize_text(option) for option in options):
        return False
    if question.quiz_type in _GLOSS_OPTION_TYPES and glosses_conflict(
        text, options[correct_idx]
    ):
        return False
    return True


def _inject_user_distractors(
    question: Question,
    confusion_map: dict[int, list[int]],
    word_by_id: dict[int, Word],
) -> None:
    """Thay thế tối đa 1 distractor bằng từ người dùng từng nhầm với từ đích."""
    if not question.word_id or question.word_id not in confusion_map:
        return
    confused_ids = confusion_map[question.word_id]
    if not confused_ids:
        return

    option_wids = (question.metadata_json or {}).get("option_word_ids") or []
    if len(option_wids) < 4:
        return

    correct_idx = question.correct_index
    options = list(question.options or [])

    # Confused word đầu tiên chèn được AN TOÀN. Cũng như ``_inject_stage_confusable``:
    # ứng viên xung đột thì thử tiếp, vì danh sách đã xếp theo số lần nhầm.
    existing_wids = {wid for wid in option_wids if wid is not None}
    confused_word = None
    confused_text = ""
    for cid in confused_ids:
        if cid in existing_wids:
            continue
        candidate_word = word_by_id.get(cid)
        if not candidate_word:
            continue
        candidate = _swap_option_text(question, candidate_word)
        if _safe_swap_text(question, options, correct_idx, candidate):
            confused_word, confused_text = candidate_word, candidate
            break

    if not confused_word:
        return

    # Tìm một vị trí distractor (không phải correct) để thay thế
    distractor_positions = [i for i in range(len(options)) if i != correct_idx]
    if not distractor_positions:
        return

    # Thay thế distractor ở vị trí cuối cùng (xa correct nhất)
    swap_pos = distractor_positions[-1]
    options[swap_pos] = confused_text
    new_wids = list(option_wids)
    new_wids[swap_pos] = confused_word.id

    question.options = options
    meta = dict(question.metadata_json or {})
    meta["option_word_ids"] = new_wids
    meta["personalized"] = True
    question.metadata_json = meta


def _inject_stage_confusable(
    question: Question,
    target_word: Word | None,
    stage: str | None,
    conf_word_by_hanzi: dict[str, Word],
) -> None:
    """Thay tối đa 1 distractor bằng confusable sắp theo NẤC THỤ ĐẮC của user.

    Kích hoạt ``distractor_policy.order_distractors_by_stage``: người mới gặp
    distractor xa (dễ loại), người thạo gặp gần (buộc phân biệt tinh). Dùng
    ĐÚNG cơ chế swap an toàn của ``_inject_user_distractors`` — chỉ đổi slot
    KHÔNG phải đáp án đúng, giữ nguyên ``correct_index`` nên không ảnh hưởng
    chấm điểm; không commit (row bank dùng chung không đổi trên DB).
    """
    if not target_word or not question.word_id:
        return
    confusables = target_word.confusable_words_json or []
    conf_hanzi = [c if isinstance(c, str) else c.get("hanzi") for c in confusables]
    conf_hanzi = [h for h in conf_hanzi if h]
    if not conf_hanzi:
        return
    conf_hanzi = order_distractors_by_stage(conf_hanzi, stage)

    option_wids = (question.metadata_json or {}).get("option_word_ids") or []
    if len(option_wids) < 4:
        return
    correct_idx = question.correct_index
    options = list(question.options or [])
    existing_wids = {wid for wid in option_wids if wid is not None}

    # Lấy confusable ĐẦU TIÊN chèn được an toàn, không phải confusable đầu tiên
    # rồi bỏ cuộc nếu nó xung đột: confusable được xếp theo độ dễ nhầm nên ứng
    # viên kế tiếp vẫn tốt, còn bỏ cuộc thì mất luôn phần cá nhân hoá.
    chosen = None
    text = ""
    for h in conf_hanzi:
        w = conf_word_by_hanzi.get(h)
        if not w or w.id in existing_wids or w.id == question.word_id:
            continue
        candidate = _swap_option_text(question, w)
        if _safe_swap_text(question, options, correct_idx, candidate):
            chosen, text = w, candidate
            break
    if not chosen:
        return

    distractor_positions = [i for i in range(len(options)) if i != correct_idx]
    if not distractor_positions:
        return
    swap_pos = distractor_positions[-1]
    options[swap_pos] = text
    new_wids = list(option_wids)
    new_wids[swap_pos] = chosen.id

    question.options = options
    meta = dict(question.metadata_json or {})
    meta["option_word_ids"] = new_wids
    meta["stage_distractor"] = stage
    question.metadata_json = meta


class QuizService:
    def __init__(self, db: Session):
        self.db = db
        self.generator = QuestionGeneratorService(db)

    def get_quiz(self, user_id: str, level: int, quiz_type: QuizType, limit: int) -> list[Question]:
        bank_size = max(limit * 8, 80)
        # Chỉ sinh ĐỒNG BỘ đủ câu để phục vụ + buffer cho rank/đa dạng, để
        # response nhanh. Phần còn lại (nạp bank lên bank_size) đẩy sang thread
        # nền — bank vẫn đầy dần qua các lượt chơi, không đổi độ đa dạng.
        serve_size = min(bank_size, max(limit * 3, 24))
        self.generator.ensure_questions(level, quiz_type, serve_size)
        if serve_size < bank_size:
            threading.Thread(
                target=_fill_bank_background,
                args=(level, quiz_type, bank_size),
                name=f"bankfill-{level}-{quiz_type.value}",
                daemon=True,
            ).start()
        # Sinh câu AI ở nền cho các dạng mappable — không phục vụ lượt hiện tại
        # mà lấp bank để BLEND vào các lượt sau. Lỗi/timeout/thiếu key chỉ log,
        # luồng luyện tập vẫn chạy trên template (fallback về template).
        if quiz_type in _AI_MAPPABLE_TYPES and _ai_available():
            threading.Thread(
                target=_fill_bank_ai_background,
                args=(level,),
                name=f"ai-bankfill-{level}",
                daemon=True,
            ).start()
        # Tải tối đa bank_size*2 ORM Question rồi lọc/rank trong RAM. Trước đây
        # dùng *3 (240 obj khi limit=10); *2 vẫn để buffer ~16× limit cho
        # rank/đa dạng và phòng lọc subtype Python, đồng thời thu nhỏ IN của
        # _difficulty_stats. Composite index (level, quiz_type, created_at) lo
        # phần filter+sort ở tầng DB.
        candidates_query = (
            select(Question)
            .where(Question.level == level, Question.quiz_type == quiz_type)
            .order_by(Question.created_at.desc())
            .limit(bank_size * 2)
        )
        # dialogue: eager-load question.word để tránh N+1 lazy-load khi lọc/rank.
        if quiz_type == QuizType.dialogue:
            candidates_query = candidates_query.options(selectinload(Question.word))
        candidates = self.db.scalars(candidates_query).all()
        if quiz_type == QuizType.listening:
            candidates = [q for q in candidates if (q.metadata_json or {}).get("question_subtype") == QUESTION_SUBTYPE_SENTENCE]
        if quiz_type == QuizType.dialogue:
            candidates = [q for q in candidates if (q.metadata_json or {}).get("question_subtype") == QUESTION_SUBTYPE_DIALOGUE]
            # Loại các row dialogue legacy có option quá dài (>55 ký tự) khỏi lượt
            # phục vụ. Trước đây chúng được regenerate + commit tại chỗ với seed
            # ngẫu nhiên (_refresh_dialogue_options), nhưng việc mutate row DÙNG
            # CHUNG giữa serve và submit gây chấm sai: một fetch khác (người dùng
            # khác hoặc thread nền) hoán vị options + ghi đè correct_index, khiến
            # selected_index đã gửi trỏ nhầm đáp án. Bản sinh mới dùng option_vi
            # ngắn nên không dính; background gen sẽ bổ sung dần row ngắn thay thế.
            candidates = [q for q in candidates if not any(len(opt) > 55 for opt in (q.options or []))]
        if quiz_type == QuizType.translation:
            candidates = [q for q in candidates if (q.metadata_json or {}).get("question_subtype") == QUESTION_SUBTYPE_PARAGRAPH]
        if quiz_type == QuizType.cloze:
            # cloze có hai nguồn hợp lệ: đoạn văn chuẩn đề thi (选词填空 —
            # guided_cloze) và câu đơn per-word cũ (sentence). Lọc chỉ theo
            # SENTENCE sẽ loại sạch bank đoạn văn nên phải nhận cả hai.
            candidates = [
                q for q in candidates
                if (q.metadata_json or {}).get("question_subtype")
                in (QUESTION_SUBTYPE_SENTENCE, QUESTION_SUBTYPE_GUIDED_CLOZE)
            ]
        if not candidates:
            return []

        last_question_ids, recent_question_ids = self._recent_question_id_sets(user_id, level, quiz_type)
        progress_by_word = self._progress_by_word(user_id)
        difficulty_stats = self._difficulty_stats([q.id for q in candidates])

        fresh = self._rank_questions(
            candidates, progress_by_word, last_question_ids, recent_question_ids, difficulty_stats
        )
        selected = self._blend_ai_template(fresh, limit)
        if len(selected) < limit:
            selected_ids = {q.id for q in selected}
            fallback = [q for q in candidates if q.id not in selected_ids]
            shuffle(fallback)
            selected = [*selected, *fallback[: limit - len(selected)]]

        self._personalize_distractors(user_id, selected)
        return selected

    def _blend_ai_template(self, ranked: list[Question], limit: int) -> list[Question]:
        """Chọn ``limit`` câu, blend tối đa ~50% câu AI khi bank có sẵn.

        Câu AI sinh nền chỉ xuất hiện từ lượt sau; khi chưa có câu AI nào thì
        hàm trả về đúng ``ranked[:limit]`` (hành vi template-only như cũ). Khi
        đã có, dành tối đa nửa số slot cho câu AI, phần còn lại là template —
        cả hai nhóm đều giữ nguyên thứ tự rank. Thiếu nhóm nào thì nhóm kia bù.
        """
        ai = [q for q in ranked if _is_ai_question(q)]
        template = [q for q in ranked if not _is_ai_question(q)]
        if not ai:
            return template[:limit]
        ai_slots = min(len(ai), limit // 2)
        selected = [*ai[:ai_slots], *template[: limit - ai_slots]]
        if len(selected) < limit:
            chosen_ids = {q.id for q in selected}
            leftovers = [q for q in ranked if q.id not in chosen_ids]
            selected.extend(leftovers[: limit - len(selected)])
        shuffle(selected)
        return selected[:limit]

    def _personalize_distractors(self, user_id: str, questions: list[Question]) -> None:
        """Chèn distractor cá nhân hóa cho các câu ĐÃ chọn (không quét toàn bank).

        Hai tầng, ĐỀU đi qua cơ chế swap an toàn (chỉ đổi slot KHÔNG phải đáp án
        đúng, giữ nguyên ``correct_index``, KHÔNG commit → row bank dùng chung
        không đổi trên DB, chấm điểm không bị lệch):

        1. Ưu tiên tín hiệu lỗi THẬT: thay 1 distractor bằng từ user từng nhầm
           với từ đích (``_inject_user_distractors``).
        2. Với câu chưa nhận swap ở (1): dùng ``confusable_words_json`` sắp theo
           NẤC THỤ ĐẮC của user (``_inject_stage_confusable``) — kích hoạt
           ``distractor_policy``. Chạy cả khi user chưa có lịch sử nhầm.

        Tất cả dữ liệu (từ đích, tiến độ, confusable) nạp theo lô bằng truy vấn
        ``IN`` để tránh N+1.
        """
        # Từ đích của các câu (batch) — tránh lazy-load q.word từng câu (N+1).
        target_ids = {q.word_id for q in questions if q.word_id}
        if not target_ids:
            return
        target_words = self.db.scalars(select(Word).where(Word.id.in_(target_ids))).all()
        target_by_id = {w.id: w for w in target_words}

        # Tầng 1: distractor từ lỗi thật (nếu có lịch sử nhầm).
        personalized_ids: set[int] = set()
        confusion_map = _build_user_confusion_map(self.db, user_id)
        if confusion_map:
            needed_ids: set[int] = set()
            for q in questions:
                for cid in confusion_map.get(q.word_id or -1, []):
                    needed_ids.add(cid)
            if needed_ids:
                confused_words = self.db.scalars(select(Word).where(Word.id.in_(needed_ids))).all()
                confused_by_id = {w.id: w for w in confused_words}
                for q in questions:
                    before = (q.metadata_json or {}).get("personalized")
                    _inject_user_distractors(q, confusion_map, confused_by_id)
                    if (q.metadata_json or {}).get("personalized") and not before:
                        personalized_ids.add(q.id)

        # Tầng 2: distractor theo nấc thụ đắc cho các câu chưa được swap ở tầng 1.
        remaining = [q for q in questions if q.id not in personalized_ids and q.word_id]
        if not remaining:
            return
        # Tiến độ user cho các từ đích (batch) → suy ra stage per-word.
        progress_rows = self.db.scalars(
            select(UserProgress).where(
                UserProgress.user_id == user_id,
                UserProgress.word_id.in_(target_ids),
            )
        ).all()
        progress_by_word = {p.word_id: p for p in progress_rows}
        # Gom mọi hanzi confusable của các từ đích còn lại → batch-load 1 lần.
        conf_hanzi_all: set[str] = set()
        for q in remaining:
            tw = target_by_id.get(q.word_id)
            if not tw:
                continue
            for c in (tw.confusable_words_json or []):
                h = c if isinstance(c, str) else c.get("hanzi")
                if h:
                    conf_hanzi_all.add(h)
        if not conf_hanzi_all:
            return
        conf_words = self.db.scalars(select(Word).where(Word.hanzi.in_(conf_hanzi_all))).all()
        conf_word_by_hanzi = {w.hanzi: w for w in conf_words}
        for q in remaining:
            tw = target_by_id.get(q.word_id)
            if not tw:
                continue
            p = progress_by_word.get(q.word_id)
            stage = acquisition_stage(
                seen=p.seen if p else 0,
                recognition_score=p.recognition_score if p else 0,
                listening_score=p.listening_score if p else 0,
                context_score=p.context_score if p else 0,
                production_score=p.production_score if p else 0,
                mastery=p.mastery if p else 0,
            ) if p else None
            _inject_stage_confusable(q, tw, stage, conf_word_by_hanzi)

    def submit(self, payload: QuizSubmitRequest) -> QuizSubmitResponse:
        question_ids = [answer.question_id for answer in payload.answers]
        questions = self.db.scalars(select(Question).where(Question.id.in_(question_ids))).all()
        by_id = {q.id: q for q in questions}

        score = 0
        results: list[AnswerResult] = []
        stored_answers = []
        srs = SRSService(self.db)
        events = LearningEventService(self.db)
        for answer in payload.answers:
            question = by_id.get(answer.question_id)
            if not question:
                continue
            correct = answer.selected_index == question.correct_index
            score += 1 if correct else 0
            if payload.record_events:
                srs.update_from_answer(payload.user_id, question, correct, answer.confidence, answer.latency_ms)
                events.record_quiz_answer(
                    payload.user_id,
                    question,
                    correct,
                    answer.confidence,
                    answer.latency_ms,
                    answer.error_tag,
                    session_id=payload.session_id,
                )
            result = AnswerResult(
                question_id=question.id,
                correct=correct,
                correct_index=question.correct_index,
                explanation=question.explanation,
            )
            results.append(result)
            stored_answers.append({
                "question_id": question.id,
                "selected_index": answer.selected_index,
                "correct": correct,
                "confidence": answer.confidence,
                "latency_ms": answer.latency_ms,
                "error_tag": answer.error_tag,
            })

        attempt = QuizAttempt(
            user_id=payload.user_id,
            level=payload.level,
            quiz_type=payload.quiz_type,
            score=score,
            total=len(results),
            answers=stored_answers,
        )
        self.db.add(attempt)
        self.db.commit()
        return QuizSubmitResponse(score=score, total=len(results), results=results)

    def _recent_question_id_sets(
        self, user_id: str, level: int, quiz_type: QuizType, recent_count: int = 3
    ) -> tuple[set[int], set[int]]:
        """Lấy id câu của lần gần nhất và của ``recent_count`` lần gần nhất.

        Gộp hai truy vấn cũ (attempt_count=1 và =3) thành một: tải một lần
        ``recent_count`` attempt theo thứ tự mới nhất, rồi bóc set "last" (chỉ
        attempt đầu) và set "recent" (toàn bộ) từ cùng kết quả.
        """
        attempts = self.db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.user_id == user_id, QuizAttempt.level == level, QuizAttempt.quiz_type == quiz_type)
            .order_by(QuizAttempt.created_at.desc())
            .limit(recent_count)
        ).all()

        def _ids(attempt: QuizAttempt) -> set[int]:
            out: set[int] = set()
            for answer in attempt.answers or []:
                question_id = answer.get("question_id")
                if question_id is not None:
                    out.add(int(question_id))
            return out

        last_ids = _ids(attempts[0]) if attempts else set()
        recent_ids: set[int] = set()
        for attempt in attempts:
            recent_ids |= _ids(attempt)
        return last_ids, recent_ids

    def _progress_by_word(self, user_id: str) -> dict[int, UserProgress]:
        rows = self.db.scalars(select(UserProgress).where(UserProgress.user_id == user_id)).all()
        return {row.word_id: row for row in rows}

    def _difficulty_stats(self, question_ids: list[int]) -> dict[int, tuple[int, int]]:
        """Gom (số đúng, tổng lượt) toàn hệ cho mỗi câu từ ``LearningEvent``.

        Đây là dữ liệu thô cho ``item_difficulty`` (độ khó thực nghiệm). Tính
        trên TOÀN BỘ người dùng (không lọc theo user) vì độ khó của câu là
        thuộc tính của câu, không phải của người học.
        """
        if not question_ids:
            return {}
        rows = self.db.execute(
            select(
                LearningEvent.question_id,
                func.count(LearningEvent.id),
                func.sum(LearningEvent.correct),
            )
            .where(LearningEvent.question_id.in_(question_ids))
            .group_by(LearningEvent.question_id)
        ).all()
        stats: dict[int, tuple[int, int]] = {}
        for question_id, total, correct in rows:
            if question_id is None:
                continue
            stats[int(question_id)] = (int(correct or 0), int(total or 0))
        return stats

    def _rank_questions(
        self,
        questions: list[Question],
        progress_by_word: dict[int, UserProgress],
        last_question_ids: set[int],
        recent_question_ids: set[int],
        difficulty_stats: dict[int, tuple[int, int]] | None = None,
    ) -> list[Question]:
        difficulty_stats = difficulty_stats or {}
        shuffled = list(questions)
        shuffle(shuffled)

        def priority(question: Question) -> tuple[int, int, int, float, int]:
            if question.id in last_question_ids:
                recent_penalty = 5
            elif question.id in recent_question_ids:
                recent_penalty = 3
            else:
                recent_penalty = 0

            progress = progress_by_word.get(question.word_id or -1)
            if not progress:
                knowledge_rank = 0
            elif progress.next_review_at is None or progress.next_review_at <= datetime.now(timezone.utc):
                knowledge_rank = 0
            elif progress.wrong > 0 and progress.correct / max(1, progress.seen) < 0.75:
                knowledge_rank = 1
            elif progress.mastery >= 70 or (progress.correct > 0 and progress.wrong == 0):
                knowledge_rank = 4
            else:
                knowledge_rank = 2

            # Độ khó thực nghiệm: câu kém chất lượng bị đẩy xuống cuối; còn lại
            # ưu tiên câu có độ khó "vừa đủ" (difficulty_fit cao). Đặt SAU các
            # tín hiệu cũ (recent/knowledge) để không phá hành vi sẵn có khi
            # chưa có dữ liệu lượt làm.
            correct, total = difficulty_stats.get(question.id, (0, 0))
            low_quality_rank = 1 if is_low_quality(correct, total) else 0
            fit_penalty = -difficulty_fit(correct, total)

            return (
                recent_penalty,
                low_quality_rank,
                knowledge_rank,
                fit_penalty,
                progress.seen if progress else 0,
            )

        return sorted(shuffled, key=priority)

    def _update_progress(self, user_id: str, question: Question, correct: bool) -> None:
        if not question.word_id:
            return
        progress = self.db.scalar(
            select(UserProgress).where(UserProgress.user_id == user_id, UserProgress.word_id == question.word_id)
        )
        if not progress:
            progress = UserProgress(user_id=user_id, word_id=question.word_id, seen=0, correct=0, wrong=0, mastery=0)
            self.db.add(progress)
        progress.seen += 1
        progress.correct += 1 if correct else 0
        progress.wrong += 0 if correct else 1
        progress.mastery = max(0, min(100, progress.mastery + (12 if correct else -18)))
        progress.last_seen_at = datetime.now(timezone.utc)
