"""Gemini TTS proxy.

Frontend gọi /tts?text=你好 -> backend gọi Google Gemini TTS (native API),
nhận PCM L16 24kHz mono base64, bọc WAV header rồi trả audio/wav.

Tách khỏi vilao relay: relay chỉ phục vụ chat text, không có model TTS.
Key dùng ở đây là key Google AI Studio gốc, dùng chung GEMINI_NATIVE_API_KEYS
với các tính năng speech (pronunciation scoring + voice chat).
"""
import base64
import io
import json
import logging
import re
import struct
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts", tags=["tts"])

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_SAMPLE_RATE = 24000  # Gemini TTS xuất PCM 24kHz mono 16-bit
MAX_TEXT_LEN = 500


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
    """Gọi ElevenLabs text-to-speech, trả MP3 bytes (không cần encode).

    Dùng làm fallback khi mọi key Gemini cạn quota. Trả None nếu chưa cấu hình
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
            if len(data) > 500 and (data[:3] == b"ID3" or (data[0] == 0xFF and data[1] & 0xE0 == 0xE0)):
                return data
            logger.warning("ElevenLabs key#%s trả dữ liệu không phải MP3 (%d bytes)", idx, len(data))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:300] if hasattr(exc, "read") else ""
            logger.warning("ElevenLabs key#%s HTTP %s: %s", idx, exc.code, detail)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ElevenLabs key#%s lỗi: %s", idx, exc)
    return None


# Text trần ngắn (vd "你好") khiến model 400 "tried to generate text": nó không
# chắc đây là yêu cầu TTS. Prefix chỉ dẫn tiếng Trung ép chế độ đọc; phần chỉ
# dẫn gần như không bị phát thành tiếng (đo "你好" ≈ 1.1s).
_TTS_PREFIX = "请用标准普通话朗读："


@router.get("/feedback")
def synthesize_feedback(
    text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN),
):
    """Đọc phản hồi/gợi ý sửa lỗi (tiếng Việt) qua ElevenLabs.

    Khác /tts (đọc tiếng Trung qua Gemini): phần tip là tiếng Việt nên đi thẳng
    ElevenLabs với giọng đa ngôn ngữ (eleven_multilingual_v2 đọc được tiếng
    Việt). Trả MP3 sẵn, không encode.
    """
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    mp3 = _elevenlabs_synth(clean, voice_id=settings.elevenlabs_feedback_voice_id)
    if mp3 is not None:
        return Response(
            content=mp3,
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    raise HTTPException(
        status_code=503,
        detail="ElevenLabs chưa cấu hình hoặc không khả dụng",
    )


@router.get("")
def synthesize(
    text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN),
    no_gemini: bool = Query(False),
    key_index: int | None = Query(None),
):
    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    # no_gemini=1: bỏ qua Gemini, đi thẳng ElevenLabs. Dùng khi build kho audio
    # lúc Gemini đã cạn quota ngày — thử 5 key Gemini (đều 429) chỉ tốn ~vài giây/
    # clip vô ích. ElevenLabs quota riêng nên cày nhanh hơn nhiều.
    #
    # key_index: ghim đúng 1 key ElevenLabs cho request này. Cho phép chạy nhiều
    # worker song song, mỗi worker 1 key/1 tài khoản → rate-limit độc lập, cày ~Nx.
    if no_gemini:
        mp3 = _elevenlabs_synth(clean, key_index=key_index)
        if mp3 is not None:
            return Response(
                content=mp3,
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        raise HTTPException(status_code=429, detail="ElevenLabs không khả dụng", headers={"Retry-After": "60"})

    keys = settings.gemini_native_keys_list
    if not keys:
        raise HTTPException(status_code=503, detail="GEMINI_NATIVE_API_KEYS chưa cấu hình")

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
        url = f"{_GEMINI_BASE}/{settings.gemini_tts_model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:400] if hasattr(exc, "read") else ""
            logger.warning("Gemini TTS key#%s HTTP %s: %s", idx, exc.code, detail)
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
            logger.warning("Gemini TTS key#%s lỗi: %s", idx, exc)
            last_error = str(exc)
            all_quota_exhausted = False
            continue

        try:
            part = body["candidates"][0]["content"]["parts"][0]
            b64 = part["inlineData"]["data"]
        except (KeyError, IndexError):
            logger.warning("Gemini TTS key#%s phản hồi lạ: %s", idx, json.dumps(body)[:300])
            last_error = "không trả audio"
            all_quota_exhausted = False
            continue

        pcm = base64.b64decode(b64)
        wav = _pcm_to_wav(pcm)
        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # Gemini cạn quota → thử ElevenLabs (nếu có key). ElevenLabs trả MP3 sẵn,
    # quota riêng, nên lấp được kho khi free tier Gemini đã hết trong ngày.
    if all_quota_exhausted:
        mp3 = _elevenlabs_synth(clean)
        if mp3 is not None:
            return Response(
                content=mp3,
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        # Không có ElevenLabs khả dụng: báo client chờ đúng window Gemini rồi thử lại.
        wait = 60 if retry_after == float("inf") else max(1, int(retry_after) + 1)
        raise HTTPException(
            status_code=429,
            detail="Tất cả key Gemini đều hết quota TTS phút này",
            headers={"Retry-After": str(wait)},
        )
    raise HTTPException(status_code=502, detail=f"Gemini TTS lỗi: {last_error}")
