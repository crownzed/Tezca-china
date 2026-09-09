"""TTS proxy — tổng hợp giọng đọc từ nhiều provider.

Frontend gọi /tts?text=你好 -> ưu tiên provider chính khi đã cấu hình,
sau đó mới thử provider phụ và TTS fallback.

Tách khỏi LLM relay: relay chỉ phục vụ chat text, không có model TTS.

Ba endpoint, khác nhau ở thứ được tối ưu:
  - ``/tts`` — trả trọn file. Cho flashcard/quiz: ở đó TỔNG thời gian mới quan
    trọng, và kho MP3 tĩnh phục vụ phần lớn lượt.
  - ``/tts/stream`` — trả từng khối MP3 qua WebSocket. Cho chế độ gọi: ở đó thời
    gian tới TIẾNG ĐẦU TIÊN mới quan trọng (0.65s so với 2.5s, đo thật).
  - ``/tts/feedback`` — tiếng Việt qua TTS fallback.

Hai lớp bảo vệ trước provider trả tiền, áp cho cả ba:
  - cache RAM (``tts_cache``) — cùng một chữ chỉ tốn tiền MỘT lần;
  - rate-limit theo IP — các endpoint này không có auth (``<audio src>`` không
    gửi được header Authorization), nên IP là khoá duy nhất còn lại.
"""
import base64
import io
import json
import logging
import re
import struct
import time
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from ..deps import client_ip, is_loopback_request
from ..services import mp3_trim, tts_cache, tts_socket_pool
from ..services.rate_limiter import RateLimiter
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts", tags=["tts"])

_SPEECH_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_SAMPLE_RATE = 24000  # Provider phụ xuất PCM 24kHz mono 16-bit
MAX_TEXT_LEN = 500

# Rate-limit theo IP cho /tts và /tts/feedback.
#
# Vì sao IP mà không phải user id như /chat: hai endpoint này được gọi bằng
# ``new Audio(url)`` / ``<audio src>``, và thẻ audio KHÔNG gửi được header
# Authorization. Đổi sang auth-bắt-buộc thì phải chuyển toàn bộ TTS sang fetch +
# blob URL ở client — một thay đổi lớn hơn hẳn, cho một endpoint chỉ trả về audio
# của văn bản mà caller đã tự biết. Nên ở đây IP là khoá thực tế duy nhất.
#
# 120 lượt/60s: cao hơn hẳn nhịp người thật (một buổi flashcard nhanh nhất cũng
# chỉ vài lượt/giây trong khoảnh khắc, không phải liên tục), nhưng đủ chặn vòng
# lặp tự động cày quota. Cả một lớp học sau NAT dùng chung IP vẫn nằm dưới trần,
# và phần lớn lượt lặp lại được cache phục vụ mà không đụng tới provider.
_tts_rate_limiter = RateLimiter(max_hits=120, window_seconds=60)

_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}

# Giữ output lại bấy nhiêu giây trước khi phát khối đầu của /tts/stream.
#
# Vì sao PHẢI có: đo mốc đến từng khối trên nhiều câu, provider giao ``mp3_stream``
# theo CHÙM — ~5 khối liền nhau (~1.25s audio), NGHỈ 0.8-1.5s, rồi chùm còn lại.
# Tổng thể sinh nhanh hơn phát nhưng cái khe ở giữa dài hơn lượng audio vừa gửi,
# nên thẻ ``<audio>`` phát hết chỗ có rồi ĐỨNG chờ. Đo thật trên key hôm nay:
# gap lớn nhất 1.525s (câu 22 chữ), trung bình ~1.0s.
#
# Giá trị cũ 0.9s chỉ che được gap trung bình, không che được worst-case → vẫn đứt
# quãng ở ~30% câu. 1.6s = worst-case đo được (1.525s) + biên jitter 75ms. Đổi lấy:
# tiếng đầu về ~2.4s thay vì ~1.7s — vẫn nhanh hơn ``/tts`` (3.7-4.4s) khoảng 1.5s,
# và liền mạch ở mọi câu đã đo.
STREAM_HOLD_SEC = 1.6

# Dải ``speed`` nhận từ client. Đo trên key thật: provider nhận cả 0.5 và 1.5, và
# nhịp nói ĐƠN ĐIỆU theo giá trị (0.72 -> 340ms/chữ, 0.82 -> 293, 0.95 -> 202),
# bitrate vẫn 128kbps ở mọi mức, ASR chép lại khớp 3/3 kể cả ở mức chậm nhất.
#
# KẸP thay vì trả 422: URL này nằm trong ``new Audio(src)``, và một 422 ở đó chỉ
# hiện ra dưới dạng im lặng không lý do. Kẹp thì tệ nhất là đọc sai tốc độ.
MIN_SPEED, MAX_SPEED = 0.5, 2.0


def _resolve_speed(speed: float | None) -> float:
    """``None`` -> mặc định của settings; ngoài dải -> kẹp về biên.

    Phải đi qua đây ở CẢ chỗ dựng khoá cache và chỗ gọi provider. Nếu khoá dùng
    giá trị thô mà provider dùng giá trị đã kẹp thì ``speed=9`` và ``speed=2`` sẽ
    là hai khoá khác nhau cho cùng một audio — cache miss vĩnh viễn, tốn tiền mỗi
    lượt.
    """
    if speed is None:
        return settings.stepfun_tts_speed
    return max(MIN_SPEED, min(MAX_SPEED, float(speed)))



def _guard_tts_quota(request: Request) -> None:
    """Rate-limit theo IP, miễn cho request từ chính máy này.

    ``scripts/generate-audio.mjs`` gọi ``/tts`` hàng nghìn lượt từ 127.0.0.1 để
    dựng kho MP3 tĩnh; hạn mức hợp lý cho người dùng thật sẽ chặn chết nó. Miễn
    trừ dựa trên peer TCP thật (xem ``deps.is_loopback_request``), không dựa vào
    header — nếu không thì ai gửi ``X-Forwarded-For: 127.0.0.1`` cũng được miễn.
    """
    if is_loopback_request(request):
        return
    if not _tts_rate_limiter.allow(f"tts:{client_ip(request)}"):
        raise HTTPException(
            status_code=429,
            detail="Bạn đang yêu cầu phát âm quá nhanh. Chờ một chút rồi thử lại nhé.",
            headers={"Retry-After": "30"},
        )


def _audio_response(audio: bytes, media_type: str) -> Response:
    return Response(content=audio, media_type=media_type, headers=_CACHE_HEADERS)


def _normalize_onset(audio: bytes) -> bytes:
    """Cắt lặng đầu/cuối về một mức cố định. Trả bytes gốc nếu không cắt được.

    Vì sao cần: đo 400 clip lấy mẫu của kho tĩnh, khoảng lặng ĐẦU trải từ 120ms
    tới 760ms (trung vị 260ms). Cùng một cú bấm "Nghe" mà lúc kêu ngay lúc trễ
    nửa giây — người dùng đọc đó là máy lag, không phải giọng đọc có nhịp riêng.
    Provider không có tham số nào điều khiển việc này (đã dò), nên phải cắt ở đây.

    Chỉ áp cho MP3 (provider chính/TTS fallback). Provider phụ trả WAV — nhánh đó
    đi đường khác và tự nó không có vấn đề lặng đầu, nên không cần.
    """
    return mp3_trim.trim_silence(audio)


def _is_mp3(data: bytes) -> bool:
    """Nhận diện MP3 đủ lớn để không trả nhầm JSON/error body cho frontend."""
    return len(data) > 500 and (
        data[:3] == b"ID3" or (len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0)
    )


def _pcm_to_wav(pcm: bytes, sample_rate: int = _SAMPLE_RATE) -> bytes:
    """Bọc PCM 16-bit mono thô thành file WAV để <audio> phát trực tiếp."""
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm)
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))  # PCM
    buf.write(struct.pack("<H", num_channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm)
    return buf.getvalue()


def _elevenlabs_synth(text: str, voice_id: str = "", key_index: int | None = None) -> bytes | None:
    """Gọi TTS fallback, trả MP3 bytes (không cần encode).

    Dùng làm fallback khi mọi key provider phụ cạn quota. Trả None nếu chưa cấu hình
    key hoặc call lỗi — caller sẽ trả 429 như trước.

    ``voice_id`` rỗng → dùng giọng mặc định (đọc tiếng Trung); truyền vào để
    đọc phản hồi tiếng Việt bằng giọng riêng.

    ``key_index`` không None → CHỈ dùng đúng key tại vị trí đó (không xoay vòng).
    Cho phép nhiều worker chạy song song, mỗi worker ghim 1 key/1 tài khoản riêng
    nên rate-limit độc lập. Ngoài phạm vi list → None (worker coi như hết quota).
    """
    keys = settings.elevenlabs_keys_list
    if not keys:
        return None
    if key_index is not None:
        if key_index < 0 or key_index >= len(keys):
            return None
        keys = [keys[key_index]]
    vid = voice_id or settings.elevenlabs_voice_id
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}"
        "?output_format=mp3_44100_128"
    )
    body = json.dumps({"text": text, "model_id": settings.elevenlabs_model}).encode("utf-8")
    # Xoay vòng qua mọi key: key cạn quota ký tự tháng (401/429) → thử key kế.
    for idx, key in enumerate(keys):
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "xi-api-key": key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            # MP3 hợp lệ bắt đầu bằng ID3 tag hoặc MPEG frame sync (0xFFEx).
            if _is_mp3(data):
                return data
            logger.warning("TTS fallback key#%s trả dữ liệu không phải MP3 (%d bytes)", idx, len(data))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:300] if hasattr(exc, "read") else ""
            logger.warning("TTS fallback key#%s HTTP %s: %s", idx, exc.code, detail)
        except Exception as exc:  # noqa: BLE001
            logger.warning("TTS fallback key#%s lỗi: %s", idx, exc)
    return None


def _stepfun_synth(text: str, key_index: int | None = None,
                   speed: float | None = None) -> bytes | None:
    """Gọi TTS provider chính, trả MP3 bytes hoặc None nếu không khả dụng.

    ``key_index`` cho phép audio builder ghim một worker vào một key cụ thể;
    request realtime không truyền index sẽ xoay vòng qua toàn bộ key.

    ``speed`` None -> lấy mặc định của settings. Truyền vào để tổng hợp THẲNG ở
    nhịp người học chọn, thay vì để browser kéo ``playbackRate`` — browser resample
    một luồng đã nén, còn provider tổng hợp lại từ đầu.
    """
    keys = settings.stepfun_keys_list
    if not keys:
        return None
    if key_index is not None:
        # Audio builder có thể chạy nhiều worker hơn số key provider chính. Ghim theo
        # vòng để một key vẫn dùng được với AUDIO_WORKERS mặc định; quota/rate
        # limit vẫn được backend xử lý bằng retry/fallback.
        keys = [keys[key_index % len(keys)]]

    body = json.dumps(
        {
            "model": settings.stepfun_tts_model,
            "input": text,
            "voice": settings.stepfun_tts_voice,
            "instruction": settings.stepfun_tts_instruction,
            "response_format": "mp3",
            "speed": _resolve_speed(speed),
            "sample_rate": settings.stepfun_tts_sample_rate,
            "text_normalization": settings.stepfun_tts_text_normalization,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    # Key cạn quota hoặc voice không được cấp quyền → thử key kế, không làm
    # lộ key trong log. Cùng code path cho realtime và script build audio.
    for idx, api_key in enumerate(keys):
        req = urllib.request.Request(
            settings.stepfun_tts_url,
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = resp.read()
            if _is_mp3(data):
                return data
            logger.warning("TTS primary key#%s trả dữ liệu không phải MP3 (%d bytes)", idx, len(data))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:300] if hasattr(exc, "read") else ""
            logger.warning("TTS primary key#%s HTTP %s: %s", idx, exc.code, detail)
        except Exception as exc:  # noqa: BLE001
            logger.warning("TTS primary key#%s lỗi: %s", idx, exc)
    return None


# Text trần ngắn (vd "你好") khiến model 400 "tried to generate text": nó không
# chắc đây là yêu cầu TTS. Prefix chỉ dẫn tiếng Trung ép chế độ đọc; phần chỉ
# dẫn gần như không bị phát thành tiếng (đo "你好" ≈ 1.1s).
_TTS_PREFIX = "请用标准普通话朗读："


def _stepfun_stream_synth(text: str, speed: float | None = None):
    """Sinh từng khối MP3 từ TTS WebSocket provider chính, theo thứ tự phát.

    Vì sao WebSocket thay vì ``_stepfun_synth`` (HTTP): HTTP tổng hợp TRỌN câu rồi
    mới trả byte đầu (đo 2.5s), còn đường này trả khối đầu ~0.65s sau khi gửi
    text. Trong hội thoại, thời gian tới TIẾNG ĐẦU TIÊN là thứ người học cảm nhận;
    tổng thời lượng thì không, vì họ đang nghe.

    Ưu tiên socket đã hâm sẵn (``tts_socket_pool``): bắt tay + ``tts.create`` tốn
    ~1.30s trong tổng 2.1s, và luồng nền trả phần đó TRONG LÚC câu trước đang
    phát. Socket hâm sẵn được tạo theo ``settings.stepfun_tts_speed``, nên chỉ
    dùng được khi ``speed`` đúng bằng mặc định — xem ``tts_socket_pool.acquire``.

    Dùng client ĐỒNG BỘ (``websockets.sync.client``) có chủ ý: cả backend không có
    một ``async def`` nào, và một generator đồng bộ thả vào ``StreamingResponse``
    được Starlette tự đưa sang threadpool. Thêm async ở đây sẽ là hàm async duy
    nhất trong app, cạnh mọi lời gọi provider vẫn đang blocking.

    Ném RuntimeError khi không dựng được stream — caller rơi về HTTP một khối.
    """
    keys = settings.stepfun_keys_list
    if not keys:
        raise RuntimeError("TTS primary keys chưa được cấu hình.")

    rate = _resolve_speed(speed)

    # Socket hâm sẵn đã gửi ``tts.create`` với tốc độ MẶC ĐỊNH. Nếu lượt này cần
    # tốc độ khác thì không dùng được — dùng sẽ đọc sai tốc độ người học chọn, và
    # đó là lỗi im lặng (audio vẫn phát, chỉ sai nhịp).
    warm = tts_socket_pool.acquire() if rate == settings.stepfun_tts_speed else None
    if warm is not None:
        # Socket hâm sẵn CHỈ phục vụ một lượt sinh (đã đo: gửi câu thứ hai sau
        # ``sentence.end`` thì server im lặng tới timeout), nên đóng sau khi dùng.
        try:
            yield from _pump_sentence(warm.ws, warm.session_id, text)
        finally:
            warm.close()
        return

    # Import tại chỗ: module này được import lúc khởi động app, còn websockets chỉ
    # cần khi có người gọi /tts/stream. Giữ startup nhẹ và không làm chết cả app
    # nếu thiếu dependency — nhánh HTTP vẫn chạy.
    from websockets.sync.client import connect

    url = f"{settings.stepfun_tts_ws_url}?model={settings.stepfun_tts_model}"
    with connect(
        url,
        additional_headers={"Authorization": f"Bearer {keys[0]}"},
        open_timeout=15,
        close_timeout=3,
    ) as ws:
        session_id = json.loads(ws.recv(timeout=10))["data"]["session_id"]
        ws.send(json.dumps({
            "type": "tts.create",
            "data": {
                "session_id": session_id,
                "voice_id": settings.stepfun_tts_voice,
                # mp3_stream: các khối PHẢI nối theo thứ tự đến mới thành file hợp
                # lệ (khác "mp3" — mỗi khối là một file trọn vẹn). Đã kiểm: nối lại
                # cho 132 frame MPEG liền mạch, đúng 3.17s, không dư byte nào.
                "response_format": "mp3_stream",
                "sample_rate": settings.stepfun_tts_sample_rate,
                # "sentence": text đã hoàn chỉnh, không cần engine tự gom câu. Ta
                # gửi trọn một câu mỗi request nên chờ gom chỉ thêm độ trễ.
                # ("stream" bị từ chối: 400 "invalid mode".)
                "mode": "sentence",
                "speed_ratio": rate,
                # Chỉ dẫn của HỘI THOẠI, không phải bản trung tính của /tts: ở đây
                # giọng đóng vai người đối thoại. Đo được +11% F0 và +2dB mà ASR
                # chép lại vẫn khớp (thanh điệu không méo) — xem settings.py.
                "instruction": settings.stepfun_tts_instruction_chat,
                # "standard" cho hội thoại: provider khuyến nghị đúng thế cho đường
                # realtime, còn "enhanced" (mặc định của /tts) là cho bản thu phát
                # thanh, đổi lấy độ trễ.
                "text_normalization": "standard",
            },
        }, ensure_ascii=False))
        ws.recv(timeout=15)  # tts.response.created
        yield from _pump_sentence(ws, session_id, text)


def _pump_sentence(ws, session_id: str, text: str):
    """Gửi một câu vào session ĐÃ create và yield từng khối audio.

    Tách ra để socket hâm sẵn và socket mở tại chỗ đi CHUNG một đường đọc — nếu
    hai nhánh có hai vòng đọc riêng thì một sửa đổi ở nhánh này sẽ âm thầm không
    áp cho nhánh kia.
    """
    ws.send(json.dumps({
        "type": "tts.text.delta",
        "data": {"session_id": session_id, "text": text},
    }, ensure_ascii=False))
    ws.send(json.dumps({"type": "tts.text.done", "data": {"session_id": session_id}}))

    while True:
        event = json.loads(ws.recv(timeout=45))
        kind = event.get("type")
        if kind == "tts.response.audio.delta":
            chunk = base64.b64decode(event["data"]["audio"])
            if chunk:
                yield chunk
        elif kind == "tts.response.audio.done":
            return
        elif kind == "tts.response.error":
            raise RuntimeError(
                f"TTS stream: {event.get('data', {}).get('message', 'lỗi không rõ')}"
            )



@router.get("/feedback")
def synthesize_feedback(
    request: Request,
    text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN),
):
    """Đọc phản hồi/gợi ý sửa lỗi (tiếng Việt) qua TTS fallback.

    Khác /tts (đọc tiếng Trung qua provider phụ): phần tip là tiếng Việt nên đi
    thẳng TTS fallback với giọng đa ngôn ngữ. Trả MP3 sẵn, không encode.

    Cache đáng giá hơn ở đây so với /tts: tip do ``_generate_phonetic_tip`` sinh
    từ một tập câu mẫu cố định, nên cùng một lỗi phát âm luôn cho cùng một câu
    tiếng Việt — tỉ lệ trùng rất cao dù người học khác nhau.
    """
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    _guard_tts_quota(request)

    key = tts_cache.cache_key(
        clean,
        endpoint="feedback",
        model=settings.elevenlabs_model,
        voice=settings.elevenlabs_feedback_voice_id,
    )
    cached = tts_cache.get(key)
    if cached is not None:
        return _audio_response(*cached)

    mp3 = _elevenlabs_synth(clean, voice_id=settings.elevenlabs_feedback_voice_id)
    if mp3 is not None:
        mp3 = _normalize_onset(mp3)
        tts_cache.put(key, mp3, "audio/mpeg")
        return _audio_response(mp3, "audio/mpeg")
    raise HTTPException(
        status_code=503,
        detail="TTS fallback chưa cấu hình hoặc không khả dụng",
    )


@router.get("")
def synthesize(
    request: Request,
    text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN),
    no_gemini: bool = Query(False),
    key_index: int | None = Query(None),
    speed: float | None = Query(None),
):
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    _guard_tts_quota(request)

    rate = _resolve_speed(speed)

    # Cache bọc TOÀN BỘ hàm, không riêng nhánh primary: nhánh nào phục vụ được
    # thì lần sau khỏi gọi lại provider đó. ``no_gemini`` vào khoá vì nó đổi
    # provider (fallback TTS thay native speech) tức đổi giọng thật; ``key_index`` KHÔNG,
    # vì nó chỉ chọn key trong cùng provider/voice — xem ``tts_cache.cache_key``.
    key = tts_cache.cache_key(
        clean,
        endpoint="tts",
        no_gemini=no_gemini,
        stepfun_model=settings.stepfun_tts_model,
        stepfun_voice=settings.stepfun_tts_voice,
        # Giá trị ĐÃ KẸP, không phải tham số thô: xem ``_resolve_speed``.
        stepfun_speed=rate,
        stepfun_instruction=settings.stepfun_tts_instruction,
        stepfun_sample_rate=settings.stepfun_tts_sample_rate,
        gemini_model=settings.gemini_tts_model,
        gemini_voice=settings.gemini_tts_voice,
        eleven_model=settings.elevenlabs_model,
        eleven_voice=settings.elevenlabs_voice_id,
    )
    cached = tts_cache.get(key)
    if cached is not None:
        return _audio_response(*cached)

    # Provider chính là ưu tiên cho tiếng Trung khi có key.
    # Nếu lỗi/quota/voice không hợp lệ thì rơi xuống provider phụ/TTS fallback.
    # Đặt trước no_gemini để script build audio không vô tình bỏ qua primary TTS.
    if settings.stepfun_keys_list:
        mp3 = _stepfun_synth(clean, key_index=key_index, speed=rate)
        if mp3 is not None:
            # Cắt lặng TRƯỚC khi cache: nếu cache bản chưa cắt thì mỗi lượt sau đều
            # phải giải mã lại để cắt, tức trả 14ms và một lần ghi file tạm cho
            # việc đã làm rồi.
            mp3 = _normalize_onset(mp3)
            tts_cache.put(key, mp3, "audio/mpeg")
            return _audio_response(mp3, "audio/mpeg")

    # no_gemini=1: bỏ qua native speech TTS, đi thẳng fallback TTS sau khi primary
    # không khả dụng. Dùng khi build kho audio lúc native speech đã cạn quota ngày —
    # thử nhiều key (đều 429) chỉ tốn round-trip vô ích.
    #
    # key_index: ghim đúng 1 key TTS fallback cho request này. Cho phép chạy nhiều
    # worker song song, mỗi worker 1 key/1 tài khoản → rate-limit độc lập, cày ~Nx.
    if no_gemini:
        mp3 = _elevenlabs_synth(clean, key_index=key_index)
        if mp3 is not None:
            mp3 = _normalize_onset(mp3)
            tts_cache.put(key, mp3, "audio/mpeg")
            return _audio_response(mp3, "audio/mpeg")
        raise HTTPException(status_code=429, detail="TTS fallback không khả dụng", headers={"Retry-After": "60"})

    keys = settings.gemini_native_keys_list
    if not keys:
        raise HTTPException(status_code=503, detail="Speech API keys chưa cấu hình")

    payload = {
        "contents": [{"parts": [{"text": _TTS_PREFIX + clean}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": settings.gemini_tts_voice}
                }
            },
        },
    }
    data = json.dumps(payload).encode("utf-8")

    # Xoay vòng qua mọi key: 429 (cạn quota) chuyển sang key kế tiếp. Chỉ khi TẤT
    # CẢ key đều 429 mới trả 429 lên client — để script build audio dừng mềm.
    all_quota_exhausted = True
    last_error = ""
    retry_after = 60.0  # trần mặc định nếu Google không nêu "retry in Ns"
    for idx, api_key in enumerate(keys):
        url = f"{_SPEECH_API_BASE}/{settings.gemini_tts_model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:400] if hasattr(exc, "read") else ""
            logger.warning("Speech TTS key#%s HTTP %s: %s", idx, exc.code, detail)
            last_error = f"HTTP {exc.code}"
            if exc.code == 429:
                # Free tier giới hạn 10 req/phút/key; Google gợi ý "retry in Ns".
                # Nhặt số nhỏ nhất qua các key để client chờ đúng rồi thử lại.
                m = re.search(r"retry in ([\d.]+)s", detail)
                if m:
                    retry_after = min(retry_after, float(m.group(1)))
                continue  # key này cạn quota phút này, thử key kế
            all_quota_exhausted = False
            continue
        except Exception as exc:  # noqa: BLE001
            logger.warning("Speech TTS key#%s lỗi: %s", idx, exc)
            last_error = str(exc)
            all_quota_exhausted = False
            continue

        try:
            part = body["candidates"][0]["content"]["parts"][0]
            b64 = part["inlineData"]["data"]
        except (KeyError, IndexError):
            logger.warning("Speech TTS key#%s phản hồi lạ: %s", idx, json.dumps(body)[:300])
            last_error = "không trả audio"
            all_quota_exhausted = False
            continue

        pcm = base64.b64decode(b64)
        wav = _pcm_to_wav(pcm)
        tts_cache.put(key, wav, "audio/wav")
        return _audio_response(wav, "audio/wav")

    # Provider phụ cạn quota → thử TTS fallback (nếu có key). TTS fallback trả MP3
    # sẵn, quota riêng, nên lấp được kho khi free tier provider phụ đã hết trong ngày.
    if all_quota_exhausted:
        mp3 = _elevenlabs_synth(clean)
        if mp3 is not None:
            mp3 = _normalize_onset(mp3)
            tts_cache.put(key, mp3, "audio/mpeg")
            return _audio_response(mp3, "audio/mpeg")
        # Không có TTS fallback khả dụng: báo client chờ đúng window provider phụ rồi thử lại.
        wait = 60 if retry_after == float("inf") else max(1, int(retry_after) + 1)
        raise HTTPException(
            status_code=429,
            detail="Tất cả key speech TTS đều hết quota phút này",
            headers={"Retry-After": str(wait)},
        )
    raise HTTPException(status_code=502, detail="Tổng hợp giọng đọc thất bại, thử lại sau.")


@router.get("/stream")
def synthesize_stream(
    request: Request,
    text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN),
    speed: float | None = Query(None),
):
    """Đọc tiếng Trung, trả MP3 theo TỪNG KHỐI để phát dần. Dùng cho chế độ gọi.

    Khác ``/tts``: endpoint kia trả một Response trọn vẹn sau khi tổng hợp xong
    (đo 3.0s tới byte đầu). Ở đây ~2.1s khi phải tự mở socket, và ~0.65s khi có
    socket hâm sẵn từ ``tts_socket_pool``. Trong hội thoại thì thời gian tới TIẾNG
    ĐẦU TIÊN mới là thứ người học cảm nhận; với các tính năng gọi lẻ (flashcard,
    quiz) thì tổng thời gian mới quan trọng — nên ``/tts`` giữ nguyên, không đụng.

    ``speed`` để client chọn nhịp đọc. Tổng hợp THẲNG ở nhịp đó thay vì để browser
    kéo ``playbackRate``: browser resample một luồng đã nén (64kbps ở đường này),
    còn provider tổng hợp lại từ đầu.

    Không auth, đúng như ``/tts``: client phát bằng ``new Audio(url)``, thẻ audio
    không gửi được header Authorization. Rate-limit theo IP là lớp bảo vệ.
    """
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    _guard_tts_quota(request)

    rate = _resolve_speed(speed)

    # Ghi nhận nhu cầu TRƯỚC khi kiểm cache, và trước cả khi biết có phục vụ được
    # không: câu KẾ TIẾP của cùng cuộc gọi vẫn cần socket. Cuộc gọi thường mở đầu
    # bằng vài câu quen ("你好！") vốn là cache hit — chỉ ghi nhận ở nhánh cache
    # miss thì đúng lúc cần hâm nhất lại không hâm.
    tts_socket_pool.note_demand()

    # Khoá cache TÁCH khỏi /tts (``endpoint="tts_stream"``): cùng text nhưng khác
    # response_format (mp3_stream) và text_normalization (standard), tức bytes
    # khác — dùng chung khoá sẽ trả bytes của luồng kia.
    key = tts_cache.cache_key(
        clean,
        endpoint="tts_stream",
        stepfun_model=settings.stepfun_tts_model,
        stepfun_voice=settings.stepfun_tts_voice,
        stepfun_speed=rate,
        # Chỉ dẫn của HỘI THOẠI. Phải khớp với cái stream synth thật
        # sự gửi đi: nếu để chuỗi của /tts ở đây thì đổi giọng hội thoại sẽ KHÔNG
        # làm mất hiệu lực cache, và người học vẫn nghe bản đọc theo chỉ dẫn cũ.
        stepfun_instruction=settings.stepfun_tts_instruction_chat,
        stepfun_sample_rate=settings.stepfun_tts_sample_rate,
    )
    cached = tts_cache.get(key)
    if cached is not None:
        # Cache hit: trả một khối, KHÔNG mở socket. Câu lặp trong hội thoại (chào
        # hỏi, "你说得对") do đó không tốn thêm tiền lẫn thêm thời gian bắt tay.
        return _audio_response(*cached)

    def chunks():
        collected: list[bytes] = []
        streamed = False
        # Gom khối trong ``STREAM_HOLD_SEC`` KỂ TỪ KHỐI ĐẦU TIÊN, rồi mới xả. Xem
        # chú thích ở hằng số đó. Trong lúc gom, các khối sau vẫn về, nên khi bắt
        # đầu phát thì đã có đủ audio để đi qua cái khe 1.3-1.4s của provider.
        #
        # Mốc phải là khối ĐẦU TIÊN, không phải lúc vào generator: bắt tay socket
        # tốn tới 1.3s, dài hơn cả cửa sổ giữ, nên tính từ đầu generator thì nhánh
        # socket lạnh không gom được gì (đã đo: vẫn đứt 2/3 câu).
        first_at = None
        held: list[bytes] = []
        try:
            for chunk in _stepfun_stream_synth(clean, speed=rate):
                collected.append(chunk)
                if not streamed:
                    if first_at is None:
                        first_at = time.monotonic()
                    held.append(chunk)
                    if time.monotonic() - first_at < STREAM_HOLD_SEC:
                        continue
                    streamed = True
                    yield b"".join(held)
                    held = []
                    continue
                yield chunk
            if held:
                # Câu ngắn xong trước khi hết thời gian gom: xả ngay, đừng chờ nốt.
                streamed = True
                yield b"".join(held)
        except Exception as exc:  # noqa: BLE001
            logger.warning("TTS primary stream lỗi: %s", exc)
            if streamed:
                # Đã phát được một phần rồi: không thể đổi sang nhánh khác nữa vì
                # nối MP3 của hai lần tổng hợp khác nhau sẽ nghe như nhảy tiếng.
                # Dừng ở đây; client nghe câu bị cụt nhưng cuộc gọi vẫn tiếp.
                return
            # Chưa phát gì → còn nguyên quyền rơi về HTTP một khối. Cuộc gọi không
            # được đứt chỉ vì một hiccup của socket. Phần đã gom trong lúc giữ bị
            # bỏ: nối nó với audio của lần tổng hợp khác sẽ nghe như nhảy tiếng.
            mp3 = _stepfun_synth(clean, speed=rate)
            if mp3 is None:
                logger.warning("TTS primary HTTP fallback cũng thất bại cho /tts/stream")
                return
            mp3 = _normalize_onset(mp3)
            collected = [mp3]
            yield mp3

        if collected:
            # Cắt lặng trên bản ĐÃ GHÉP, không trên từng khối: mỗi khối riêng lẻ
            # không phải file hợp lệ. Bản cắt vào cache nên lượt sau vừa không tốn
            # tiền vừa có đầu âm đúng mức.
            tts_cache.put(key, _normalize_onset(b"".join(collected)), "audio/mpeg")

    return StreamingResponse(
        chunks(),
        media_type="audio/mpeg",
        headers={
            **_CACHE_HEADERS,
            # Tắt buffering của reverse proxy. Không có nó thì fly/nginx gom trọn
            # response rồi mới gửi, tức mất đúng phần streaming mà endpoint này tồn
            # tại để có — độ trễ sẽ TỆ HƠN /tts.
            "X-Accel-Buffering": "no",
        },
    )
