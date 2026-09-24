"""Backend-owned StepFun Preview session; no Step Plan credentials or endpoints.

Contract: session.created -> session.update -> session.updated. PCM rates must be
configured after provider confirmation; pcm16 alone does not specify a rate.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from urllib.parse import urlencode, urlsplit

from ..settings import settings
from .protocol import MAX_UPSTREAM_BYTES, ProtocolError, parse_message, valid_id

logger = logging.getLogger(__name__)
# Library debug logs can contain upgrade headers and audio. Never propagate them.
_ws_logger = logging.Logger("realtime.transport", level=logging.CRITICAL + 1)
_ws_logger.addHandler(logging.NullHandler())
_SESSION_MAX_SEC = 25 * 60
_CONNECT_TIMEOUT_SEC = 20
_HANDSHAKE_TIMEOUT_SEC = 8
_IO_TIMEOUT_SEC = 5


def _provider_url() -> str:
    url = settings.stepfun_realtime_ws_url.strip()
    parsed = urlsplit(url)
    if (parsed.scheme != "wss" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path.rstrip("/") != "/v1/realtime"):
        raise ValueError("Invalid Realtime endpoint")
    if not settings.stepfun_realtime_model.strip() or not settings.stepfun_realtime_voice.strip():
        raise ValueError("Missing Realtime configuration")
    return f"{url}?{urlencode({'model': settings.stepfun_realtime_model})}"


def realtime_configured() -> bool:
    """Local readiness only; never probes upstream or asserts account entitlement."""
    if not settings.stepfun_realtime_enabled or not settings.stepfun_realtime_keys_list:
        return False
    rates = (settings.stepfun_realtime_input_sample_rate, settings.stepfun_realtime_output_sample_rate)
    if any(type(rate) is not int or not 8000 <= rate <= 48000 for rate in rates):
        return False
    try:
        _provider_url()
    except ValueError:
        return False
    return True


class RealtimeSession:
    def __init__(self) -> None:
        self._upstream_ws = None
        self._session_id: str | None = None
        self._created_at: float | None = None
        self._closed = False
        self.input_sample_rate = settings.stepfun_realtime_input_sample_rate
        self.output_sample_rate = settings.stepfun_realtime_output_sample_rate

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def age(self) -> float:
        return 0.0 if self._created_at is None else time.monotonic() - self._created_at

    @property
    def is_expired(self) -> bool:
        return self.age >= _SESSION_MAX_SEC

    async def connect(self) -> None:
        if self._closed or self._upstream_ws is not None:
            raise RuntimeError("Realtime session cannot reconnect")
        if not settings.stepfun_realtime_enabled:
            raise RuntimeError("Realtime preview is disabled")
        keys = settings.stepfun_realtime_keys_list
        if not keys:
            raise RuntimeError("Realtime preview credentials are not configured")
        if not realtime_configured():
            raise RuntimeError("Realtime preview audio or endpoint is not configured")

        from websockets.asyncio.client import connect as ws_connect

        try:
            # Total deadline includes key rotation and both handshake messages.
            async with asyncio.timeout(_CONNECT_TIMEOUT_SEC):
                for key in keys:
                    try:
                        self._upstream_ws = await ws_connect(
                            _provider_url(),
                            additional_headers={"Authorization": f"Bearer {key}"},
                            open_timeout=5, close_timeout=2,
                            ping_interval=20, ping_timeout=10,
                            max_size=MAX_UPSTREAM_BYTES, max_queue=8,
                            compression=None, logger=_ws_logger,
                        )
                        break
                    except Exception:
                        logger.warning("Realtime credential connection failed")
                if self._upstream_ws is None:
                    raise ConnectionError("Realtime unavailable")
                self._created_at = time.monotonic()
                async with asyncio.timeout(_HANDSHAKE_TIMEOUT_SEC):
                    await self._expect_session("session.created")
                    await self.send_to_upstream(json.dumps({
                        "type": "session.update",
                        "session": {
                            "modalities": ["text", "audio"],
                            "instructions": settings.stepfun_realtime_system_prompt,
                            "voice": settings.stepfun_realtime_voice,
                            "input_audio_format": "pcm16",
                            "output_audio_format": "pcm16",
                            "turn_detection": {
                                "type": "server_vad",
                                "prefix_padding_ms": 300,
                                "silence_duration_ms": 800,
                                "energy_awakeness_threshold": 2500,
                            },
                            # Do not guess the Preview tool-result choreography.
                            # lookup_word stays server-side, unadvertised for now.
                            "tools": [],
                        },
                    }, ensure_ascii=False))
                    await self._expect_session("session.updated")
        except BaseException as exc:
            await self.close()
            if isinstance(exc, asyncio.CancelledError):
                raise
            if not isinstance(exc, Exception):
                raise
            # Provider errors may contain request headers/config; do not log them.
            raise RuntimeError("Realtime preview is unavailable") from None
        logger.info("Realtime session configured")

    async def _expect_session(self, kind: str) -> None:
        message = parse_message(await self._upstream_ws.recv(), MAX_UPSTREAM_BYTES)
        session = message.get("session")
        if message["type"] != kind or not isinstance(session, dict):
            raise ProtocolError("Unexpected handshake event")
        session_id = session.get("id")
        if not valid_id(session_id) or (self._session_id and session_id != self._session_id):
            raise ProtocolError("Invalid session id")
        if session.get("model", settings.stepfun_realtime_model) != settings.stepfun_realtime_model:
            raise ProtocolError("Unexpected model")
        if kind == "session.updated":
            if session.get("input_audio_format") != "pcm16" or session.get("output_audio_format") != "pcm16":
                raise ProtocolError("Unsupported audio format")
        self._session_id = session_id

    async def send_to_upstream(self, message: str) -> None:
        if self._closed or self._upstream_ws is None:
            raise ConnectionError("Upstream closed")
        try:
            await asyncio.wait_for(self._upstream_ws.send(message), _IO_TIMEOUT_SEC)
        except Exception:
            raise ConnectionError("Upstream send failed") from None

    async def recv_from_upstream(self, timeout: float = 30.0) -> str | None:
        if self._closed or self._upstream_ws is None:
            raise ConnectionError("Upstream closed")
        try:
            return await asyncio.wait_for(self._upstream_ws.recv(), timeout)
        except asyncio.TimeoutError:
            return None
        except Exception:
            # Leave socket ownership intact so close() still releases it.
            raise ConnectionError("Upstream connection lost") from None

    async def close(self) -> None:
        self._closed = True
        ws, self._upstream_ws = self._upstream_ws, None
        if ws is not None:
            try:
                await asyncio.wait_for(ws.close(), 3)
            except Exception:
                pass
