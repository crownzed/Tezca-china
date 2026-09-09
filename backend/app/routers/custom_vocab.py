from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
import logging

from ..db import get_db
from ..models import Word, Question, QuizType, LearningSession, User
from ..schemas import (
    CustomVocabGenerateRequest,
    CustomVocabGenerateResponse,
    PassageGenerateRequest,
    TopicGenerateRequest,
    QuizDraftOut,
    DraftQuestion,
    DraftWord,
    SaveQuizRequest,
)
from ..services.llm_generator_service import (
    generate_exercises_for_vocab,
    generate_questions_for_passage,
    generate_passage_for_topic,
)
from .auth import get_current_user
from .quiz import _question_out

router = APIRouter(prefix="/api/custom-vocab", tags=["custom_vocab"])
logger = logging.getLogger(__name__)

_GENERIC_ERROR = "Không xử lý được yêu cầu, vui lòng thử lại."


def _safe_correct_index(value) -> int:
    """Ép correct_index từ LLM về [0, 3]. Options luôn là 4 lựa chọn nên index
    ngoài khoảng (LLM trả bậy) sẽ khiến câu không bao giờ chấm đúng — clamp về 0."""
    return value if isinstance(value, int) and 0 <= value <= 3 else 0


# ---------------------------------------------------------------------------
# Draft builders: goi LLM -> tra ve cau hoi de PREVIEW (chua luu DB).
# Lop save rieng moi commit vao DB (luong "Tao -> Xem truoc -> Luu thu vien").
# ---------------------------------------------------------------------------

def _vocab_drafts(words: List[str]) -> QuizDraftOut:
    data = generate_exercises_for_vocab(words)
    if "words" not in data:
        raise HTTPException(status_code=500, detail="Invalid JSON format returned from LLM")

    questions: List[DraftQuestion] = []
    for item in data["words"]:
        hanzi = item.get("hanzi")
        if not hanzi:
            continue
        word = DraftWord(
            hanzi=hanzi,
            pinyin=item.get("pinyin", ""),
            meaning_vi=item.get("meaning_vi", ""),
            hsk_level=item.get("hsk_level", 1) or 1,
            pos=item.get("pos", ""),
        )
        for q in item.get("questions", []):
            opts = q.get("options", [])
            if len(opts) != 4:
                continue
            questions.append(DraftQuestion(
                quiz_type=q.get("quiz_type", "vocab"),
                level=word.hsk_level,
                prompt=q.get("prompt", ""),
                options=opts,
                correct_index=q.get("correct_index", 0),
                explanation=q.get("explanation", ""),
                word=word,
            ))

    if not questions:
        raise HTTPException(status_code=400, detail="Khong tao duoc cau hoi nao tu danh sach tu vung.")
    return QuizDraftOut(quiz_title="Tu vung tu chon", source="vocab", questions=questions)


def _passage_drafts(text: str, hsk_level: int, count: int, subtypes: List[str] | None,
                    source: str = "passage", passage_text: str = "") -> QuizDraftOut:
    data = generate_questions_for_passage(text, hsk_level=hsk_level, count=count, question_subtypes=subtypes)
    questions: List[DraftQuestion] = []
    for q in data.get("questions", []):
        opts = q.get("options", [])
        if len(opts) != 4:
            continue
        questions.append(DraftQuestion(
            quiz_type=q.get("quiz_type", "reading"),
            level=hsk_level,
            prompt=q.get("prompt", ""),
            options=opts,
            correct_index=q.get("correct_index", 0),
            explanation=q.get("explanation", ""),
            subtype=q.get("question_subtype", ""),
        ))
    if not questions:
        raise HTTPException(status_code=400, detail="Khong tao duoc cau hoi nao tu doan van.")
    return QuizDraftOut(
        quiz_title=data.get("quiz_title") or "Bai tap doc hieu",
        passage=passage_text or text,
        source=source,
        questions=questions,
    )

@router.post("/generate", response_model=CustomVocabGenerateResponse)
def generate_custom_vocab(
    request: CustomVocabGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        user_id = user.id
        
        # 1. Gọi LLM API để sinh dữ liệu
        data = generate_exercises_for_vocab(request.words)
        if "words" not in data:
            raise HTTPException(status_code=500, detail="Invalid JSON format returned from LLM")
            
        generated_questions = []
        target_words = []
        
        # 2. Xử lý lưu từng từ và câu hỏi vào CSDL
        for item in data["words"]:
            hanzi = item.get("hanzi")
            if not hanzi:
                continue
                
            # Kiểm tra xem từ đã tồn tại chưa
            word = db.scalar(select(Word).where(Word.hanzi == hanzi).limit(1))
            if not word:
                # Tạo từ mới, đánh dấu source để dễ phân biệt
                word = Word(
                    hanzi=hanzi,
                    pinyin=item.get("pinyin", ""),
                    meaning_vi=item.get("meaning_vi", ""),
                    hsk_level=item.get("hsk_level", 1),
                    pos=item.get("pos", ""),
                    source=f"custom_{user_id}",
                    topic="custom"
                )
                db.add(word)
                db.flush() # Lấy word.id
            
            target_words.append({"id": word.id, "hanzi": word.hanzi})
            
            # Lưu câu hỏi
            questions_data = item.get("questions", [])
            for q_data in questions_data:
                try:
                    q_type = QuizType(q_data.get("quiz_type", "vocab"))
                    prompt = q_data.get("prompt", "")
                    options = q_data.get("options", [])
                    correct_index = q_data.get("correct_index", 0)
                    explanation = q_data.get("explanation", "")
                    # Phòng thủ: LLM có thể trả correct_index ngoài [0,3] → chấm
                    # sai/không bao giờ đúng. Ép về khoảng hợp lệ.
                    if not isinstance(correct_index, int) or not (0 <= correct_index < 4):
                        correct_index = 0

                    if len(options) == 4:
                        q = Question(
                            word_id=word.id,
                            level=word.hsk_level,
                            quiz_type=q_type,
                            prompt=prompt,
                            options=options,
                            correct_index=correct_index,
                            explanation=explanation,
                            audio_text=word.hanzi,
                            metadata_json={"source": f"custom_{user_id}_llm"}
                        )
                        db.add(q)
                        generated_questions.append(q)
                except ValueError:
                    logger.warning(f"Invalid quiz_type from LLM: {q_data.get('quiz_type')}")
                    continue

        db.flush()
        
        # 3. Tạo LearningSession mới với các câu hỏi này
        if not target_words:
            raise HTTPException(status_code=400, detail="Không tạo được từ vựng nào.")
            
        session = LearningSession(
            user_id=user_id,
            session_type="custom_vocab",
            behavior_state="learning",
            target_words_json=target_words,
            reason="Người dùng tự tạo bằng LLM API"
        )
        db.add(session)
        db.commit()
        
        return CustomVocabGenerateResponse(
            session_id=session.id,
            message=f"Đã tạo {len(generated_questions)} câu hỏi cho {len(target_words)} từ vựng.",
            questions=[_question_out(q) for q in generated_questions]
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Generate custom vocab error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")


@router.post("/generate-from-text", response_model=CustomVocabGenerateResponse)
def generate_from_text(
    request: PassageGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        user_id = user.id

        # 1. Goi LLM de sinh 5 cau hoi suy luan ngon ngu tu doan van
        data = generate_questions_for_passage(request.text)
        questions_data = data.get("questions", [])
        if not questions_data:
            raise HTTPException(status_code=500, detail="Khong tao duoc cau hoi nao tu doan van.")

        generated_questions = []

        # 2. Luu tung cau hoi (word_id=None vi cau hoi dua tren doan van, khong gan tu cu the)
        #    Tat ca 5 dang deu la trac nghiem 4 lua chon, chi khac question_subtype.
        for q_data in questions_data:
            try:
                q_type = QuizType(q_data.get("quiz_type"))
            except ValueError:
                logger.warning(f"Invalid quiz_type from LLM: {q_data.get('quiz_type')}")
                continue

            subtype = q_data.get("question_subtype", "")
            options = q_data.get("options", [])
            if len(options) != 4:
                logger.warning(f"Skipping {subtype}: expected 4 options, got {len(options)}")
                continue

            q = Question(
                word_id=None,
                level=1,
                quiz_type=q_type,
                prompt=q_data.get("prompt", ""),
                options=options,
                correct_index=_safe_correct_index(q_data.get("correct_index", 0)),
                explanation=q_data.get("explanation", ""),
                audio_text="",
                metadata_json={
                    "source": f"passage_{user_id}_llm",
                    "question_subtype": subtype,
                },
            )
            db.add(q)
            generated_questions.append(q)

        db.flush()

        if not generated_questions:
            raise HTTPException(status_code=400, detail="Khong luu duoc cau hoi nao.")

        # 3. Tao LearningSession moi cho bo cau hoi nay
        session = LearningSession(
            user_id=user_id,
            session_type="passage_quiz",
            behavior_state="learning",
            target_words_json=[],
            reason="Nguoi dung tao tu doan van bang LLM",
        )
        db.add(session)
        db.commit()

        return CustomVocabGenerateResponse(
            session_id=session.id,
            message=f"Da tao {len(generated_questions)} cau hoi tu doan van.",
            questions=[_question_out(q) for q in generated_questions],
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Generate from text error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")


# ---------------------------------------------------------------------------
# HUB da nguon: Tao (preview) -> Luu thu vien
# Cac endpoint /draft/* CHI goi LLM va tra cau hoi de xem truoc (khong cham DB).
# /save moi commit bo cau hoi da chon vao DB.
# ---------------------------------------------------------------------------

@router.post("/draft/vocab", response_model=QuizDraftOut)
def draft_from_vocab(request: CustomVocabGenerateRequest, user: User = Depends(get_current_user)):
    """Nguon [Tu danh sach tu vung]: sinh bai tap per-word de xem truoc."""
    try:
        return _vocab_drafts(request.words)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft vocab error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")


@router.post("/draft/passage", response_model=QuizDraftOut)
def draft_from_passage(request: PassageGenerateRequest, user: User = Depends(get_current_user)):
    """Nguon [Tu doan van]: sinh cau hoi suy luan tu doan van nguoi dung dan."""
    try:
        return _passage_drafts(
            request.text,
            hsk_level=request.hsk_level,
            count=request.count,
            subtypes=request.question_types,
            source="passage",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft passage error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")


@router.post("/draft/topic", response_model=QuizDraftOut)
def draft_from_topic(request: TopicGenerateRequest, user: User = Depends(get_current_user)):
    """Nguon [Tu chu de] (ket hop ca 2): AI sinh doan van theo chu de + cap HSK,
    roi sinh cau hoi tu chinh doan van do."""
    try:
        passage = generate_passage_for_topic(request.topic, hsk_level=request.hsk_level)
        draft = _passage_drafts(
            passage,
            hsk_level=request.hsk_level,
            count=request.count,
            subtypes=request.question_types,
            source="topic",
            passage_text=passage,
        )
        draft.quiz_title = f"Chu de: {request.topic}"
        return draft
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Draft topic error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")


@router.post("/save", response_model=CustomVocabGenerateResponse)
def save_quiz(request: SaveQuizRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Luu bo cau hoi (da xem truoc) vao DB + tao LearningSession de hoc lai sau."""
    user_id = user.id
    try:
        generated_questions = []
        target_words = []
        seen_word_ids = set()

        for dq in request.questions:
            if len(dq.options) != 4:
                continue

            try:
                q_type = QuizType(dq.quiz_type)
            except ValueError:
                logger.warning(f"Invalid quiz_type on save: {dq.quiz_type}")
                continue

            word_id = None
            level = dq.level
            # Cau hoi tu vung: find-or-create Word de gan thong tin truc quan.
            if dq.word and dq.word.hanzi:
                w = dq.word
                word = db.scalar(select(Word).where(Word.hanzi == w.hanzi).limit(1))
                if not word:
                    word = Word(
                        hanzi=w.hanzi,
                        pinyin=w.pinyin,
                        meaning_vi=w.meaning_vi,
                        hsk_level=w.hsk_level,
                        pos=w.pos,
                        source=f"custom_{user_id}",
                        topic="custom",
                    )
                    db.add(word)
                    db.flush()
                word_id = word.id
                level = word.hsk_level or level
                if word.id not in seen_word_ids:
                    seen_word_ids.add(word.id)
                    target_words.append({"id": word.id, "hanzi": word.hanzi})

            q = Question(
                word_id=word_id,
                level=level,
                quiz_type=q_type,
                prompt=dq.prompt,
                options=dq.options,
                correct_index=_safe_correct_index(dq.correct_index),
                explanation=dq.explanation,
                audio_text=(dq.word.hanzi if dq.word and dq.word.hanzi else ""),
                metadata_json={
                    "source": f"{request.source}_{user_id}_llm",
                    **({"question_subtype": dq.subtype} if dq.subtype else {}),
                },
            )
            db.add(q)
            generated_questions.append(q)

        db.flush()

        if not generated_questions:
            raise HTTPException(status_code=400, detail="Khong luu duoc cau hoi nao.")

        session = LearningSession(
            user_id=user_id,
            session_type=request.session_type,
            behavior_state="learning",
            target_words_json=target_words,
            reason=f"Nguoi dung tao tu hub ({request.source})",
        )
        db.add(session)
        db.commit()

        return CustomVocabGenerateResponse(
            session_id=session.id,
            message=f"Da luu {len(generated_questions)} cau hoi vao thu vien.",
            questions=[_question_out(q) for q in generated_questions],
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Save quiz error: {e}")
        raise HTTPException(status_code=500, detail="Không xử lý được yêu cầu")
