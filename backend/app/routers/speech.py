"""Speech features router — pronunciation scoring + turn-based voice chat.

All AI calls go through speech_ai_service, which uses the native speech API
server-side. The browser only talks to these endpoints; the API key never
leaves the backend.
"""
import base64
import binascii
import json
import logging
import random

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import client_ip, get_current_user
from ..models import User, Word
from ..schemas import (
    ConversationScenarioOut,
    DemoPronunciationRequest,
    DemoSentenceOut,
    PracticeSentenceOut,
    PronunciationScoreOut,
    PronunciationScoreRequest,
    SpeechTranscriptionOut,
    SpeechTranscriptionRequest,
    VoiceChatOut,
    VoiceChatRequest,
)
from ..services.conversation_bank_service import get_conversation_bank
from ..services.rate_limiter import RateLimiter
from ..services.speech_ai_service import (
    score_pronunciation,
    stream_voice_chat,
    transcribe_speech,
    voice_chat,
)

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

# Practice sentence: công khai, không auth, đọc random từ DB. Giới hạn theo IP
# để chặn scraping/crawler cày endpoint mà không ảnh hưởng người học thật (một
# phiên luyện phát âm bình thường hiếm khi vượt 10 câu/phút).
_practice_sentence_limiter = RateLimiter(max_hits=30, window_seconds=60)

# --- Giới hạn cho /transcribe và /chat (ĐÃ đăng nhập) -----------------------
# Hai endpoint này tiêu quota speech API keys — cùng bể key mà /tts và
# /pronunciation đang dùng — nên một tài khoản gọi lặp vô hạn sẽ làm chết tính
# năng của mọi người khác. Hạn mức nới hơn demo vì đây là hội thoại thật: người
# học nói nhiều lượt liên tiếp là bình thường.
# Khoá theo user id, KHÔNG theo IP: cùng một lớp học/NAT dùng chung IP thì khoá
# theo IP sẽ chặn oan lẫn nhau.
_chat_rate_limiter = RateLimiter(max_hits=30, window_seconds=60)
_CHAT_ALLOWED_MIME = {"audio/wav", "audio/webm"}
# Thời lượng: 15s, KHÔNG dùng lại 8s của demo. Demo chấm phát âm MỘT từ nên 8s là
# thừa; còn đây là hội thoại, một câu trả lời bình thường đã quá 8s và người học
# chỉ nhận 413 sau khi đã nói xong.
#
# 15s là trần chặt nhất trong ba trần, có chủ ý — hai trần kia cùng rơi vào ~16s
# với WAV mà ``speech-ai.js`` sinh ra (16kHz mono 16-bit = 32000 byte/s):
#   - schema ``max_length=700_000`` ký tự base64 -> 700000*3/4/32000 = 16.4s
#   - ``_DEMO_MAX_AUDIO_BYTES`` 500KB            -> 512000/32000      = 16.0s
# Giữ 15s để tới trần thời lượng trước, vì đó là trần duy nhất báo được lỗi có
# nghĩa; hai trần kia chỉ nói "quá lớn". ``VOICE_MAX_RECORDING_SEC`` trong
# speech-ai.js tự dừng mic trước ngưỡng này để không ai mất công nói rồi bị chặn.
_CHAT_MAX_DURATION_SEC = 15.0


def _client_ip(request: Request) -> str:
    """IP người gọi. Wrapper mỏng quanh ``deps.client_ip`` — logic dùng chung với
    ``/tts`` nằm ở đó, kể cả lý do vì sao ``Fly-Client-IP`` phải thắng
    ``X-Forwarded-For`` (header client gửi được, tức giả mạo được)."""
    return client_ip(request)


@router.get("/practice-sentence", response_model=PracticeSentenceOut)
def practice_sentence(request: Request, level: int = 1, db: Session = Depends(get_db)):
    """Return a short word to read aloud, with its canonical pinyin from the DB.

    Words carry stored pinyin, so the pronunciation target is exact — the most
    reliable basis for scoring. Falls back across levels if the requested level
    has no words.
    """
    if not _practice_sentence_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu, vui lòng thử lại sau.")
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
def pronunciation(
    request: PronunciationScoreRequest,
    current_user: User = Depends(get_current_user),
):
    """Score a user's recording against the target.

    Chấm điểm tất định qua ``pinyin_scorer`` + tầng âm học ``tone_dsp_service``;
    speech API CHỈ làm việc chép âm thành hanzi/pinyin. Câu nhận xét do
    ``_generate_phonetic_tip`` sinh cục bộ từ chính kết quả chấm, không gọi mạng.

    Yêu cầu đăng nhập + rate-limit + siết audio, giống ``/transcribe`` và
    ``/chat``: endpoint này tiêu quota speech API keys — cùng bể key với
    cả ba endpoint kia — và trước đây là endpoint DUY NHẤT trong nhóm còn để
    công khai, tức đường vòng miễn phí quanh mọi lớp bảo vệ đã dựng cho các
    endpoint còn lại. Người chưa đăng nhập vẫn có ``/demo-pronunciation`` (câu
    mục tiêu do server chọn, 3 lượt/IP).
    """
    _guard_chat_quota(current_user)
    mime = _guard_chat_audio(request.audio_base64, request.mime_type)
    try:
        result = score_pronunciation(
            audio_b64=request.audio_base64,
            mime_type=mime,
            target_hanzi=request.target_hanzi,
            target_pinyin=request.target_pinyin,
        )
        return PronunciationScoreOut(**result)
    except HTTPException:
        raise
    except RuntimeError as e:
        logger.warning(f"Pronunciation scoring failed: {e}")
        raise HTTPException(status_code=502, detail="Không chấm được phát âm, thử lại sau.")
    except Exception as e:
        logger.error(f"Pronunciation error: {e}")
        raise HTTPException(status_code=500, detail="Lỗi máy chủ, thử lại sau.")


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


def _guard_chat_audio(audio_b64: str, mime_type: str) -> str:
    """Siết audio đầu vào cho /transcribe và /chat. Trả về mime đã chuẩn hoá.

    Cùng bộ kiểm với ``/demo-pronunciation``: whitelist mime, giới hạn byte THẬT
    sau khi giải mã (trần base64 ở schema không đủ — base64 phình ~33% nên 700K
    ký tự vẫn là ~525KB audio), và trần thời lượng — nhưng thời lượng dùng
    ``_CHAT_MAX_DURATION_SEC`` (15s) chứ không phải 8s của demo, xem ghi chú ở
    hằng số đó. Chuỗi rỗng = lượt chỉ có văn bản, không kiểm gì.
    """
    audio_b64 = (audio_b64 or "").strip()
    mime = (mime_type or "").split(";")[0].strip().lower()
    if not audio_b64:
        return mime
    if mime not in _CHAT_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Định dạng âm thanh không được hỗ trợ.")
    try:
        audio_bytes = base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Dữ liệu âm thanh không hợp lệ.")
    if len(audio_bytes) > _DEMO_MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Đoạn ghi âm quá lớn (tối đa 500KB).")
    duration = _wav_duration_sec(audio_bytes)
    if duration is not None and duration > _CHAT_MAX_DURATION_SEC:
        raise HTTPException(
            status_code=413,
            detail=f"Đoạn ghi âm quá dài (tối đa {int(_CHAT_MAX_DURATION_SEC)} giây).",
        )
    return mime


def _guard_chat_quota(user: User) -> None:
    """Rate-limit theo user id. Xem ``_chat_rate_limiter`` để biết vì sao không IP."""
    if not _chat_rate_limiter.allow(f"chat:{user.id}"):
        raise HTTPException(
            status_code=429,
            detail="Bạn đang gửi quá nhanh. Chờ một chút rồi thử lại nhé.",
        )


@router.post("/transcribe", response_model=SpeechTranscriptionOut)
def transcribe(
    request: SpeechTranscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    """Speech-to-text bridge used before Mini local generates its reply.

    Yêu cầu đăng nhập: endpoint tiêu quota speech API keys, để công khai
    thì thành dịch vụ speech-to-text miễn phí và làm cạn bể key mà /tts,
    /pronunciation, /chat đều dùng chung. UI vốn đã nằm sau AuthGate nên không
    có caller hợp lệ nào bị ảnh hưởng."""

    _guard_chat_quota(current_user)
    mime = _guard_chat_audio(request.audio_base64, request.mime_type)
    try:
        return SpeechTranscriptionOut(user_text=transcribe_speech(
            request.audio_base64,
            mime,
        ))
    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.warning(f"Speech transcription failed: {exc}")
        raise HTTPException(status_code=502, detail="Không chép được âm thanh, thử lại sau.") from exc
    except Exception as exc:
        logger.error(f"Speech transcription error: {exc}")
        raise HTTPException(status_code=500, detail="Lỗi máy chủ, thử lại sau.") from exc


@router.post("/chat", response_model=VoiceChatOut)
def chat(
    request: VoiceChatRequest,
    current_user: User = Depends(get_current_user),
):
    """Cloud chat from either text or a mic recording.

    The client speaks ``reply_cn`` via the existing TTS; the API key stays
    server-side. Text and mic share the same bounded history so switching input
    methods does not reset the conversation.

    Yêu cầu đăng nhập: kể từ khi ``audio_base64`` thành tuỳ chọn và có thêm
    ``text``, một request chỉ-văn-bản là hợp lệ — nếu để công khai thì đây là
    proxy LLM miễn phí, tiêu quota speech API keys. Trước đây
    ``min_length=16`` trên audio vô tình chặn được kiểu lạm dụng này."""
    _guard_chat_quota(current_user)
    text = (request.text or "").strip()
    audio = (request.audio_base64 or "").strip()
    if not text and not audio:
        raise HTTPException(status_code=400, detail="Hãy nhập tin nhắn hoặc bật mic để nói.")
    mime = _guard_chat_audio(audio, request.mime_type)

    try:
        result = voice_chat(
            audio_b64=audio,
            mime_type=mime,
            text=text,
            history=[turn.model_dump() for turn in request.history],
        )
        return VoiceChatOut(**result)
    except HTTPException:
        raise
    except RuntimeError as e:
        logger.warning(f"Voice chat failed: {e}")
        raise HTTPException(status_code=502, detail="Không tạo được câu trả lời, thử lại sau.")
    except Exception as e:
        logger.error(f"Voice chat error: {e}")
        raise HTTPException(status_code=500, detail="Lỗi máy chủ, thử lại sau.")


@router.post("/chat/stream")
def chat_stream(
    request: VoiceChatRequest,
    current_user: User = Depends(get_current_user),
):
    """Như ``/chat`` nhưng trả SSE, để client phát tiếng sớm hơn.

    Endpoint MỚI thay vì đổi ``/chat`` tại chỗ: ``/chat`` vẫn được ``sendText``
    và mọi client đã deploy dùng, và response_model của nó là một JSON object —
    biến thành stream là phá contract. Hai đường cùng tồn tại, cùng lớp bảo vệ.

    Thứ tự guard giống ``/chat`` từng chữ (quota trước, audio sau): lệch thứ tự
    thì cùng một payload sai lại nhận mã lỗi khác nhau ở hai đường.

    Vì sao nhanh hơn: service chép âm rồi phát ``transcript`` ngay, rồi phát
    từng CÂU tiếng Trung khi chốt được, nên client gọi TTS câu 1 trong lúc câu 2
    còn đang sinh — thay vì chờ trọn ``reply_cn`` rồi mới bắt đầu.
    """
    _guard_chat_quota(current_user)
    text = (request.text or "").strip()
    audio = (request.audio_base64 or "").strip()
    if not text and not audio:
        raise HTTPException(status_code=400, detail="Hãy nhập tin nhắn hoặc bật mic để nói.")
    mime = _guard_chat_audio(audio, request.mime_type)
    history = [turn.model_dump() for turn in request.history]

    def event_stream():
        # Lỗi phát sinh SAU khi header đã gửi không thể thành HTTP status nữa —
        # phải đi ra dưới dạng một event ``error`` để client hiện toast thay vì
        # treo im lặng chờ ``done`` không bao giờ tới.
        try:
            yield from stream_voice_chat(
                audio_b64=audio,
                mime_type=mime,
                history=history,
                text=text,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Voice chat stream error: {exc}")
            payload = json.dumps(
                {"type": "error", "detail": "Không tạo được câu trả lời."},
                ensure_ascii=False,
            )
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Tắt buffering của reverse proxy: nginx/fly gom response lại thì mọi
            # event tới client cùng lúc ở cuối, tức mất trắng phần streaming.
            "X-Accel-Buffering": "no",
        },
    )


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

    # 5) Chấm điểm qua service dùng chung (speech API + DSP). Không log audio/base64.
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
        raise HTTPException(status_code=502, detail="Không chấm được phát âm, thử lại sau.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Demo pronunciation error: {e}")
        raise HTTPException(status_code=500, detail="Không chấm được phát âm, thử lại sau.")
