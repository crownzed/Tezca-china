from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
import logging

from ..db import get_db
from ..models import Word, Question, QuizType, LearningSession
from ..schemas import CustomVocabGenerateRequest, CustomVocabGenerateResponse
from ..services.llm_generator_service import generate_exercises_for_vocab
from .auth import get_current_user
from .quiz import _question_out

router = APIRouter(prefix="/api/custom-vocab", tags=["custom_vocab"])
logger = logging.getLogger(__name__)

@router.post("/generate", response_model=CustomVocabGenerateResponse)
def generate_custom_vocab(
    request: CustomVocabGenerateRequest,
    db: Session = Depends(get_db),
    # Uncomment the following line if auth is required
    # user=Depends(get_current_user)
):
    try:
        user_id = "local-user" # Or user.id if using auth
        
        # 1. Gọi DeepSeek API để sinh dữ liệu
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
                    
                    if len(options) == 4:
                        q = Question(
                            word_id=word.id,
                            level=word.hsk_level,
                            quiz_type=q_type,
                            prompt=prompt,
                            options=options,
                            correct_index=correct_index,
                            explanation=explanation,
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
            reason="Người dùng tự tạo bằng DeepSeek API"
        )
        db.add(session)
        db.commit()
        
        return CustomVocabGenerateResponse(
            session_id=session.id,
            message=f"Đã tạo {len(generated_questions)} câu hỏi cho {len(target_words)} từ vựng.",
            questions=[_question_out(q) for q in generated_questions]
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Generate custom vocab error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
