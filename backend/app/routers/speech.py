"""Speech features router — pronunciation scoring + turn-based voice chat.

All AI calls go through speech_ai_service, which uses the native Gemini API
server-side. The browser only talks to these endpoints; the API key never
leaves the backend.
"""
import logging
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Word
from ..schemas import (
    PracticeSentenceOut,
    PronunciationScoreOut,
    PronunciationScoreRequest,
    VoiceChatOut,
    VoiceChatRequest,
)
from ..services.speech_ai_service import score_pronunciation, voice_chat

router = APIRouter(prefix="/api/speech", tags=["speech"])
logger = logging.getLogger(__name__)


@router.get("/practice-sentence", response_model=PracticeSentenceOut)
def practice_sentence(level: int = 1, db: Session = Depends(get_db)):
    """Return a short word to read aloud, with its canonical pinyin from the DB.

    Words carry stored pinyin, so the pronunciation target is exact — the most
    reliable basis for scoring. Falls back across levels if the requested level
    has no words.
    """
    level = max(1, min(int(level or 1), 6))
    for lvl in [level, *[x for x in range(1, 7) if x != level]]:
        count = db.scalar(
            select(func.count()).select_from(Word).where(Word.hsk_level == lvl, Word.pinyin != "")
        ) or 0
        if not count:
            continue
        offset = random.randint(0, max(0, count - 1))
        word = db.scalar(
            select(Word).where(Word.hsk_level == lvl, Word.pinyin != "").offset(offset).limit(1)
        )
        if word:
            return PracticeSentenceOut(
                hanzi=word.hanzi,
                pinyin=word.pinyin or "",
                meaning_vi=word.meaning_vi or word.meaning_en or "",
                level=word.hsk_level,
            )
    raise HTTPException(status_code=404, detail="Chưa có từ vựng để luyện phát âm.")


@router.post("/pronunciation", response_model=PronunciationScoreOut)
def pronunciation(request: PronunciationScoreRequest):
    """Score a user's recording against the target. Deterministic scoring via
    pinyin_scorer; Gemini handles transcription + the correction tip."""
    try:
        result = score_pronunciation(
            audio_b64=request.audio_base64,
            mime_type=request.mime_type,
            target_hanzi=request.target_hanzi,
            target_pinyin=request.target_pinyin,
        )
        return PronunciationScoreOut(**result)
    except RuntimeError as e:
        logger.warning(f"Pronunciation scoring failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Pronunciation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat", response_model=VoiceChatOut)
def chat(request: VoiceChatRequest):
    """Turn-based voice chat: Gemini hears the user's clip and replies in
    Chinese (one call). The client speaks reply_cn via the existing speak() TTS;
    the API key stays server-side."""
    try:
        result = voice_chat(
            audio_b64=request.audio_base64,
            mime_type=request.mime_type,
            history=[turn.model_dump() for turn in request.history],
        )
        return VoiceChatOut(**result)
    except RuntimeError as e:
        logger.warning(f"Voice chat failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Voice chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
