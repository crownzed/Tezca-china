"""Speech features router — pronunciation scoring + turn-based voice chat.

All AI calls go through speech_ai_service, which uses the native Gemini API
server-side. The browser only talks to these endpoints; the API key never
leaves the backend.
"""
import base64
import binascii
import logging
import random

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Word
from ..schemas import (
    ConversationScenarioOut,
    DemoPronunciationRequest,
    DemoSentenceOut,
    PracticeSentenceOut,
    PronunciationScoreOut,
    PronunciationScoreRequest,
    VoiceChatOut,
    VoiceChatRequest,
)
from ..services.conversation_bank_service import get_conversation_bank
from ..services.rate_limiter import RateLimiter
from ..services.speech_ai_service import score_pronunciation, voice_chat

router = APIRouter(prefix="/api/speech", tags=["speech"])
logger = logging.getLogger(__name__)

# --- Demo phát âm trang chủ (KHÔNG cần đăng nhập) ---------------------------
# Tập câu mẫu HSK1 CỐ ĐỊNH. Server là nguồn sự thật của câu + pinyin: client chỉ
# gửi ``sentence_id``, không bao giờ gửi văn bản/thanh điệu tự do để chấm. Nhờ
# vậy endpoint công khai không thể bị lợi dụng làm dịch vụ chấm pinyin tùy ý.
_DEMO_SENTENCES: dict[str, dict] = {
    "ni-hao": {"hanzi": "你好", "pinyin": "nǐ hǎo", "meaning_vi": "Xin chào"},
    "xie-xie": {"hanzi": "谢谢", "pinyin": "xiè xie", "meaning_vi": "Cảm ơn"},
    "wo-ai-ni": {"hanzi": "我爱你", "pinyin": "wǒ ài nǐ", "meaning_vi": "Tôi yêu bạn"},
    "zai-jian": {"hanzi": "再见", "pinyin": "zài jiàn", "meaning_vi": "Tạm biệt"},
}

# Giới hạn bảo vệ endpoint công khai:
#  - payload base64 tối đa (thô, trước khi giải mã); schema đã chặn ở 700KB.
#  - số byte audio thật ≤ 500KB.
#  - thời lượng ≤ 8 giây (ước lượng từ header WAV; webm bỏ qua kiểm thời lượng).
_DEMO_MAX_AUDIO_BYTES = 500 * 1024
_DEMO_MAX_DURATION_SEC = 8.0
_DEMO_ALLOWED_MIME = {"audio/wav", "audio/webm"}

# 3 lượt / 600s cho mỗi IP. localStorage phía client chỉ là guard UX; đây mới là
# lớp bảo vệ thật (in-memory, đủ cho deploy single-instance).
_demo_rate_limiter = RateLimiter(max_hits=3, window_seconds=600)


def _client_ip(request: Request) -> str:
    """IP người gọi, ưu tiên X-Forwarded-For (Render/Proxy đặt IP thật ở đây)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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


@router.get("/scenarios", response_model=list[ConversationScenarioOut])
def scenarios(level: int | None = None, topic: str | None = None):
    """Danh sách kịch bản hội thoại để người học chọn trước khi vào chat.

    Chỉ trả phần briefing (vai, tình huống, mục tiêu, từ khóa, câu mở đầu) —
    system prompt, few-shot và nước đi cứu hội thoại KHÔNG gửi ra client, vì đó
    là chỉ thị cho model: lộ ra thì người học đọc trước được câu AI sắp nói.
    """
    bank = get_conversation_bank()
    return [
        ConversationScenarioOut(**bank.briefing(scenario))
        for scenario in bank.scenarios(level=level, topic=topic)
    ]


@router.post("/chat", response_model=VoiceChatOut)
def chat(request: VoiceChatRequest):
    """Turn-based voice chat: Gemini hears the user's clip and replies in
    Chinese (one call). The client speaks reply_cn via the existing speak() TTS;
    the API key stays server-side.

    ``scenario_id``/``hsk_level`` chọn kịch bản nhập vai; thiếu cả hai thì service
    rơi về prompt chung."""
    try:
        result = voice_chat(
            audio_b64=request.audio_base64,
            mime_type=request.mime_type,
            history=[turn.model_dump() for turn in request.history],
            scenario_id=request.scenario_id,
            hsk_level=request.hsk_level,
        )
        return VoiceChatOut(**result)
    except RuntimeError as e:
        logger.warning(f"Voice chat failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"Voice chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _wav_duration_sec(audio_bytes: bytes) -> float | None:
    """Thời lượng WAV (giây) đọc từ header stdlib. None nếu không phải WAV hợp lệ
    (vd webm) — khi đó bỏ qua kiểm thời lượng, các lớp byte/rate-limit vẫn giữ."""
    import io
    import wave

    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            rate = wf.getframerate()
            frames = wf.getnframes()
        if rate <= 0:
            return None
        return frames / rate
    except (wave.Error, EOFError):
        return None


@router.get("/demo-sentence", response_model=DemoSentenceOut)
def demo_sentence():
    """Một câu HSK1 ngẫu nhiên trong tập cố định cho demo trang chủ.

    Công khai (không auth) nhưng CHỈ trả câu mẫu tĩnh — không chạm DB, không lộ
    dữ liệu người dùng. ``id`` là khóa client gửi lại khi chấm điểm."""
    sid = random.choice(list(_DEMO_SENTENCES.keys()))
    s = _DEMO_SENTENCES[sid]
    return DemoSentenceOut(id=sid, hanzi=s["hanzi"], pinyin=s["pinyin"], meaning_vi=s["meaning_vi"])


@router.post("/demo-pronunciation", response_model=PronunciationScoreOut)
def demo_pronunciation(request: DemoPronunciationRequest, http_request: Request):
    """Chấm phát âm demo cho người CHƯA đăng nhập.

    Endpoint công khai nên siết chặt: rate-limit theo IP, whitelist mime, giới
    hạn byte + thời lượng, và câu mục tiêu do SERVER tra theo ``sentence_id`` (client
    không gửi văn bản/thanh điệu). KHÔNG lưu audio, KHÔNG ghi bản ghi người dùng."""
    # 1) Rate limit theo IP — lớp bảo vệ THẬT (localStorage client chỉ là UX guard).
    ip = _client_ip(http_request)
    if not _demo_rate_limiter.allow(ip):
        raise HTTPException(
            status_code=429,
            detail="Bạn đã dùng hết lượt thử miễn phí. Hãy tạo tài khoản để luyện tiếp nhé.",
        )

    # 2) Whitelist mime.
    mime = (request.mime_type or "").split(";")[0].strip().lower()
    if mime not in _DEMO_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Định dạng âm thanh không được hỗ trợ.")

    # 3) Tra câu mục tiêu từ tập cố định (server là nguồn sự thật).
    sentence = _DEMO_SENTENCES.get(request.sentence_id)
    if sentence is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu mẫu.")

    # 4) Giải mã + siết số byte thật và thời lượng.
    try:
        audio_bytes = base64.b64decode(request.audio_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Dữ liệu âm thanh không hợp lệ.")
    if len(audio_bytes) > _DEMO_MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Đoạn ghi âm quá lớn (tối đa 500KB).")
    duration = _wav_duration_sec(audio_bytes)
    if duration is not None and duration > _DEMO_MAX_DURATION_SEC:
        raise HTTPException(status_code=413, detail="Đoạn ghi âm quá dài (tối đa 8 giây).")

    # 5) Chấm điểm qua service dùng chung (Gemini + DSP). Không log audio/base64.
    try:
        result = score_pronunciation(
            audio_b64=request.audio_base64,
            mime_type=mime,
            target_hanzi=sentence["hanzi"],
            target_pinyin=sentence["pinyin"],
        )
        return PronunciationScoreOut(**result)
    except RuntimeError as e:
        logger.warning(f"Demo pronunciation scoring failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Demo pronunciation error: {e}")
        raise HTTPException(status_code=500, detail="Không chấm được phát âm, thử lại sau.")
