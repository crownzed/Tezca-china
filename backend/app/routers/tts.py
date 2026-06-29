"""Gemini TTS proxy.

Frontend gọi /tts?text=你好 -> backend gọi Google Gemini TTS (native API),
nhận PCM L16 24kHz mono base64, bọc WAV header rồi trả audio/wav.

Tách khỏi vilao relay: relay chỉ phục vụ chat text, không có model TTS.
Key dùng ở đây là key Google AI Studio gốc (GEMINI_TTS_API_KEY).
"""
import base64
import io
import json
import logging
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


@router.get("")
def synthesize(text: str = Query(..., min_length=1, max_length=MAX_TEXT_LEN)):
    api_key = settings.gemini_tts_api_key.strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_TTS_API_KEY chưa cấu hình")

    clean = text.strip()
    if not clean:
        raise HTTPException(status_code=400, detail="text rỗng")

    url = f"{_GEMINI_BASE}/{settings.gemini_tts_model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": clean}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": settings.gemini_tts_voice}
                }
            },
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:300]
        logger.warning("Gemini TTS HTTP %s: %s", exc.code, detail)
        raise HTTPException(status_code=502, detail=f"Gemini TTS lỗi {exc.code}")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gemini TTS request failed")
        raise HTTPException(status_code=502, detail=f"Gemini TTS không truy cập được: {exc}")

    try:
        part = body["candidates"][0]["content"]["parts"][0]
        b64 = part["inlineData"]["data"]
    except (KeyError, IndexError):
        logger.warning("Gemini TTS phản hồi lạ: %s", json.dumps(body)[:300])
        raise HTTPException(status_code=502, detail="Gemini TTS không trả audio")

    pcm = base64.b64decode(b64)
    wav = _pcm_to_wav(pcm)
    return Response(
        content=wav,
        media_type="audio/wav",
        headers={"Cache-Control": "public, max-age=86400"},
    )
