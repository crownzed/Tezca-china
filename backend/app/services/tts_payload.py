"""Shared StepFun streaming TTS payload and handshake validation."""

import json

from ..settings import settings


STREAM_TEXT_NORMALIZATION = "standard"
STREAM_RESPONSE_FORMAT = "mp3_stream"


def build_stream_create_payload(session_id: str, speed: float) -> dict:
    """Build the single ``tts.create`` contract used by warm and cold sockets."""
    return {
        "session_id": session_id,
        "voice_id": settings.stepfun_tts_voice,
        "response_format": STREAM_RESPONSE_FORMAT,
        "sample_rate": settings.stepfun_tts_sample_rate,
        "mode": "sentence",
        "speed_ratio": speed,
        "instruction": settings.stepfun_tts_instruction_chat,
        "text_normalization": STREAM_TEXT_NORMALIZATION,
        "language": settings.stepfun_tts_language,
    }


def parse_stream_handshake(
    frame: str | bytes, expected_type: str, *, session_id: str | None = None,
) -> str:
    """Require a documented setup event before sending text or pooling a socket."""
    try:
        event = json.loads(frame)
    except (TypeError, ValueError, UnicodeError):
        raise RuntimeError("Invalid TTS handshake event") from None

    if not isinstance(event, dict) or event.get("type") != expected_type:
        raise RuntimeError("Unexpected TTS handshake event")
    event_id = event.get("event_id")
    data = event.get("data")
    if not isinstance(event_id, str) or not event_id.strip() or not isinstance(data, dict):
        raise RuntimeError("Invalid TTS handshake event")
    received_id = data.get("session_id")
    if not isinstance(received_id, str) or not received_id.strip():
        raise RuntimeError("Invalid TTS handshake session")
    if session_id is not None and received_id != session_id:
        raise RuntimeError("TTS handshake session mismatch")
    return received_id


__all__ = ["build_stream_create_payload", "parse_stream_handshake"]
