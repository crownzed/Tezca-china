"""Strict browser event contract for the experimental Realtime proxy."""
from __future__ import annotations

import base64
import binascii
import json
import re

MAX_CLIENT_BYTES = 48_000
MAX_AUDIO_BYTES = 24_000  # Byte limit, not a claim about the Preview PCM rate.
MAX_TEXT_CHARS = 2_000
MAX_UPSTREAM_BYTES = 1_000_000
_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


class ProtocolError(ValueError):
    """A client or upstream message violates the proxy contract."""


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProtocolError("Duplicate field")
        result[key] = value
    return result


def _invalid_constant(_value):
    raise ProtocolError("Invalid JSON constant")


def parse_message(raw: str, max_bytes: int = MAX_CLIENT_BYTES) -> dict:
    if not isinstance(raw, str):
        raise ProtocolError("Message must be text")
    try:
        if len(raw) > max_bytes or len(raw.encode("utf-8")) > max_bytes:
            raise ProtocolError("Message too large")
        message = json.loads(raw, object_pairs_hook=_object, parse_constant=_invalid_constant)
    except (ValueError, RecursionError, UnicodeError):
        raise ProtocolError("Invalid JSON message") from None
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        raise ProtocolError("Invalid event")
    return message


def valid_id(value: object) -> bool:
    return isinstance(value, str) and _ID.fullmatch(value) is not None


def _fields(value: object, required: set[str], optional: set[str] | None = None) -> None:
    if not isinstance(value, dict) or not required <= value.keys():
        raise ProtocolError("Missing fields")
    if value.keys() - required - (optional or set()):
        raise ProtocolError("Unsupported fields")


def pcm_bytes(audio: object, max_bytes: int = MAX_AUDIO_BYTES) -> bytes:
    if not isinstance(audio, str) or not 0 < len(audio) <= 4 * ((max_bytes + 2) // 3):
        raise ProtocolError("Invalid audio")
    try:
        pcm = base64.b64decode(audio, validate=True)
    except (ValueError, binascii.Error):
        raise ProtocolError("Invalid audio") from None
    if not pcm or len(pcm) > max_bytes or len(pcm) % 2:
        raise ProtocolError("Invalid PCM16")
    return pcm


def validate_client_event(message: dict) -> dict:
    """No config overrides, assistant/system messages, or browser tool results."""
    kind = message["type"]
    if kind == "input_audio_buffer.append":
        _fields(message, {"type", "audio"})
        pcm_bytes(message["audio"])
    elif kind in {"input_audio_buffer.clear", "response.create", "response.cancel"}:
        _fields(message, {"type"})
    elif kind == "conversation.item.create":
        _fields(message, {"type", "item"})
        item = message["item"]
        _fields(item, {"type", "role", "content"})
        if item["type"] != "message" or item["role"] != "user":
            raise ProtocolError("Only user messages are allowed")
        content = item["content"]
        if not isinstance(content, list) or len(content) != 1:
            raise ProtocolError("Invalid content")
        _fields(content[0], {"type", "text"})
        text = content[0]["text"]
        if content[0]["type"] != "input_text" or not isinstance(text, str):
            raise ProtocolError("Only input_text is allowed")
        if not text.strip() or len(text) > MAX_TEXT_CHARS or "\x00" in text:
            raise ProtocolError("Invalid text")
        try:
            text.encode("utf-8")
        except UnicodeError:
            raise ProtocolError("Invalid text") from None
    else:
        # In particular: truncate isn't documented; manual commit is unnecessary
        # with backend-owned server VAD and may commit an empty buffer.
        raise ProtocolError("Unsupported event")
    return message


def public_server_event(message: dict) -> dict | None:
    """Project only UI fields; never relay config, tools, thinking, or raw errors."""
    kind = message["type"]
    fields = {
        "response.created": (),
        "response.audio.delta": ("delta", "item_id", "content_index", "response_id"),
        "response.audio.done": ("item_id", "content_index", "response_id"),
        "response.text.delta": ("delta", "item_id", "response_id"),
        "response.text.done": ("text", "item_id", "response_id"),
        "response.audio_transcript.delta": ("delta", "item_id", "response_id"),
        "response.audio_transcript.done": ("transcript", "item_id", "response_id"),
        "input_audio_buffer.speech_started": ("audio_start_ms", "item_id"),
        "input_audio_buffer.speech_stopped": ("audio_end_ms", "item_id"),
        "conversation.item.input_audio_transcription.completed": ("transcript", "item_id"),
    }
    if kind == "response.done":
        response = message.get("response")
        if not isinstance(response, dict):
            raise ProtocolError("Invalid response")
        status = response.get("status")
        if not isinstance(status, str) or status not in {"completed", "cancelled", "incomplete", "failed"}:
            raise ProtocolError("Invalid response status")
        result = {"type": kind, "response": {"status": status}}
        if valid_id(response.get("id")):
            result["response"]["id"] = response["id"]
        return result
    if kind not in fields:
        return None
    if kind == "response.audio.delta":
        pcm_bytes(message.get("delta"), max_bytes=MAX_UPSTREAM_BYTES // 2)
    elif kind.endswith(".delta") and not isinstance(message.get("delta"), str):
        raise ProtocolError("Missing delta")
    result = {"type": kind}
    if kind == "response.created":
        response = message.get("response")
        if isinstance(response, dict) and valid_id(response.get("id")):
            result["response"] = {"id": response["id"]}
    for field in fields[kind]:
        value = message.get(field)
        if value is None:
            continue
        if field in {"content_index", "audio_start_ms", "audio_end_ms"}:
            if type(value) is not int or value < 0:
                raise ProtocolError("Invalid event field")
        elif not isinstance(value, str):
            raise ProtocolError("Invalid event field")
        elif field.endswith("_id") and not valid_id(value):
            raise ProtocolError("Invalid event id")
        elif field in {"text", "transcript", "delta"} and kind != "response.audio.delta":
            if len(value) > 16_000:
                raise ProtocolError("Text too large")
            try:
                value.encode("utf-8")
            except UnicodeError:
                raise ProtocolError("Invalid text") from None
        result[field] = value
    return result
