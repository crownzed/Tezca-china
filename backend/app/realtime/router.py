"""Authenticated, opt-in proxy for the experimental StepFun Realtime API.

The browser authenticates with a first WebSocket frame because browser WebSocket
constructors cannot set the provider's Bearer header. Provider credentials, session
configuration, and event filtering remain backend-owned.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from ..db import SessionLocal
from ..services.auth_service import AuthService
from ..services.rate_limiter import RateLimiter
from .protocol import (
    MAX_UPSTREAM_BYTES,
    ProtocolError,
    parse_message,
    public_server_event,
    validate_client_event,
)
from .session import RealtimeSession, realtime_configured

logger = logging.getLogger(__name__)
router = APIRouter()

_AUTH_FRAME_TIMEOUT = 8.0
_ADMISSION_TIMEOUT = 5.0
_BROWSER_IO_TIMEOUT = 3.0
_CLOSE_TIMEOUT = 1.0
_SESSION_CLOSE_TIMEOUT = 4.0
_IDLE_TIMEOUT_SEC = 120.0
_WATCHDOG_INTERVAL = 2.0
_MAX_CONNECTIONS = 64
_MAX_ACTIVE_TOTAL = 32
_MAX_ACTIVE_PER_USER = 1
_MAX_TOKEN_BYTES = 8192

# These are process-local guards, like the existing HTTP limiter. A deployment
# with multiple workers must move them to a shared store before claiming a global
# quota. Connection slots include unauthenticated sockets and upstream setup.
_attempt_limiter = RateLimiter(max_hits=12, window_seconds=60)
_user_attempt_limiter = RateLimiter(max_hits=6, window_seconds=60)
_message_limiter = RateLimiter(max_hits=1800, window_seconds=60)
_admission_slots = threading.BoundedSemaphore(8)
_active_lock = threading.Lock()
_connection_total = 0
_active_total = 0
_active_by_user: dict[str, int] = {}


class _RelayFailure(Exception):
    def __init__(self, close_code: int, code: str, detail: str, kind: str = "error"):
        super().__init__(code)
        self.close_code = close_code
        self.code = code
        self.detail = detail
        self.kind = kind


def _safe_detail(code: str) -> str:
    return {
        "auth": "Authentication failed.",
        "origin": "This origin is not allowed.",
        "limits": "Realtime connection limit reached.",
        "timeout": "Realtime connection timed out.",
        "expiry": "Realtime session expired.",
        "config": "Realtime preview is unavailable.",
        "protocol": "Unsupported Realtime message.",
        "upstream": "Realtime preview is unavailable. Return to Pipeline.",
    }.get(code, "Realtime request failed.")


async def _send_json(websocket: WebSocket, message: dict) -> None:
    await asyncio.wait_for(websocket.send_json(message), _BROWSER_IO_TIMEOUT)


async def _close_browser(websocket: WebSocket, code: int = 1000, reason: str = "") -> None:
    if websocket.application_state == WebSocketState.DISCONNECTED:
        return
    try:
        await asyncio.wait_for(websocket.close(code=code, reason=reason), _CLOSE_TIMEOUT)
    except Exception:
        pass


async def _terminal(
    websocket: WebSocket,
    *,
    kind: str = "error",
    code: str,
    detail_code: str,
    retryable: bool = False,
) -> None:
    """A pre-accept rejection is an HTTP upgrade failure, not an error frame."""
    if websocket.application_state != WebSocketState.CONNECTED:
        return
    try:
        await asyncio.wait_for(websocket.send_json({
            "type": kind,
            "code": code,
            "detail": _safe_detail(detail_code),
            "retryable": retryable,
        }), _CLOSE_TIMEOUT)
    except Exception:
        pass


async def _close_with_error(
    websocket: WebSocket,
    *,
    close_code: int,
    error_code: str,
    detail_code: str,
    kind: str = "error",
) -> None:
    await _terminal(websocket, kind=kind, code=error_code, detail_code=detail_code)
    await _close_browser(websocket, close_code, error_code)


def _allowed_origin(websocket: WebSocket) -> bool:
    origins = websocket.headers.getlist("origin")
    return len(origins) == 1 and bool(origins[0] and origins[0] in settings_cors_list())


def settings_cors_list() -> list[str]:
    from ..settings import settings

    return settings.cors_list


def _client_key(websocket: WebSocket) -> str:
    # Only the ASGI peer is trusted here. Proxy headers may be interpreted by a
    # deployment's explicitly trusted proxy middleware, never by this route.
    peer = websocket.client.host if websocket.client else "unknown"
    return f"peer:{peer[:128]}"


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        if not token or len(token) > _MAX_TOKEN_BYTES or len(token.encode("utf-8")) > _MAX_TOKEN_BYTES:
            return None
    except UnicodeError:
        return None
    return token


def _admit_token(token: str | None) -> str | None:
    """Decode JWT and perform DB admission in a short-lived session."""
    if not token:
        return None
    try:
        user_id = AuthService.decode_token(token)
        if not user_id:
            return None
        with SessionLocal() as db:
            user = AuthService(db).get_user_by_id(user_id)
            if not user or user.is_active is False:
                return None
            return user.id
    except Exception:
        logger.warning("Realtime user admission failed")
        return None


def _consume_result(future) -> None:
    if not future.cancelled():
        future.exception()


async def _admit_async(token: str | None) -> str | None:
    if not token:
        return None
    if not _admission_slots.acquire(blocking=False):
        raise _RelayFailure(4008, "admission_limit", "limits")
    slots = _admission_slots

    def admit_and_release():
        try:
            return _admit_token(token)
        finally:
            slots.release()

    try:
        worker = asyncio.get_running_loop().run_in_executor(None, admit_and_release)
    except Exception:
        slots.release()
        raise
    worker.add_done_callback(_consume_result)
    # Cancelling a coroutine cannot stop a DB thread. Keep its permit until the
    # actual worker exits, so repeated timeouts cannot spawn unlimited DB work.
    return await asyncio.wait_for(asyncio.shield(worker), _ADMISSION_TIMEOUT)


def _acquire_connection() -> bool:
    global _connection_total
    with _active_lock:
        if _connection_total >= _MAX_CONNECTIONS:
            return False
        _connection_total += 1
        return True


def _release_connection() -> None:
    global _connection_total
    with _active_lock:
        _connection_total -= 1


def _acquire_slot(user_id: str) -> bool:
    global _active_total
    with _active_lock:
        if _active_total >= _MAX_ACTIVE_TOTAL:
            return False
        if _active_by_user.get(user_id, 0) >= _MAX_ACTIVE_PER_USER:
            return False
        _active_total += 1
        _active_by_user[user_id] = _active_by_user.get(user_id, 0) + 1
        return True


def _release_slot(user_id: str) -> None:
    global _active_total
    with _active_lock:
        count = _active_by_user.get(user_id, 0)
        if not count:
            return
        if count == 1:
            _active_by_user.pop(user_id)
        else:
            _active_by_user[user_id] = count - 1
        _active_total -= 1


@router.get("/api/realtime/capabilities")
async def realtime_capabilities(authorization: str | None = Header(default=None)) -> dict:
    """Return local readiness, never a claim that the provider granted access."""
    try:
        user_id = await _admit_async(_extract_bearer(authorization))
    except (TimeoutError, _RelayFailure):
        raise HTTPException(status_code=503, detail="Authentication temporarily unavailable") from None
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "realtime_available": realtime_configured(),
        "experimental": True,
        "languages": ["zh", "en"],
    }


async def _receive_auth_frame(websocket: WebSocket) -> str | None:
    frame = await asyncio.wait_for(websocket.receive(), _AUTH_FRAME_TIMEOUT)
    if frame.get("type") == "websocket.disconnect":
        raise WebSocketDisconnect()
    raw = frame.get("text")
    if raw is None or frame.get("bytes") is not None:
        raise ProtocolError("Authentication must be a text frame")
    message = parse_message(raw, max_bytes=_MAX_TOKEN_BYTES)
    if set(message) != {"type", "token"} or message["type"] != "auth":
        raise ProtocolError("Authentication frame required")
    token = message["token"]
    if not isinstance(token, str) or not _extract_bearer(f"Bearer {token}"):
        raise ProtocolError("Invalid authentication token")
    return token.strip()


async def _during_setup(operation, browser_frame: asyncio.Task):
    """Observe disconnects during DB admission/handshake without buffering audio."""
    task = asyncio.create_task(operation, name="realtime-setup")
    try:
        await asyncio.wait((task, browser_frame), return_when=asyncio.FIRST_COMPLETED)
        if browser_frame.done():
            frame = browser_frame.result()
            if frame.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect()
            raise _RelayFailure(4008, "event_before_ready", "protocol")
        return task.result()
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def _close_session(session: RealtimeSession) -> None:
    try:
        await asyncio.wait_for(session.close(), _SESSION_CLOSE_TIMEOUT)
    except Exception:
        logger.warning("Realtime upstream cleanup failed")


@router.websocket("/ws/voice-chat")
async def ws_voice_chat(websocket: WebSocket) -> None:
    if not _allowed_origin(websocket):
        await _close_with_error(
            websocket, close_code=4003, error_code="origin_rejected", detail_code="origin"
        )
        return
    if not _attempt_limiter.allow(_client_key(websocket)):
        await _close_with_error(
            websocket, close_code=4008, error_code="connection_rate_limited", detail_code="limits"
        )
        return
    if not _acquire_connection():
        await _close_with_error(
            websocket, close_code=4008, error_code="connection_limit", detail_code="limits"
        )
        return

    user_id: str | None = None
    slot_acquired = False
    session: RealtimeSession | None = None
    tasks: list[asyncio.Task] = []
    try:
        await asyncio.wait_for(websocket.accept(), _BROWSER_IO_TIMEOUT)
        try:
            token = await _receive_auth_frame(websocket)
        except (ProtocolError, RuntimeError):
            raise _RelayFailure(4001, "invalid_auth_frame", "auth") from None
        except TimeoutError:
            raise _RelayFailure(4001, "auth_timeout", "auth") from None

        browser_frame = asyncio.create_task(websocket.receive(), name="realtime-setup-receive")
        tasks.append(browser_frame)
        try:
            user_id = await _during_setup(_admit_async(token), browser_frame)
        except TimeoutError:
            raise _RelayFailure(4001, "auth_timeout", "auth") from None
        if not user_id:
            raise _RelayFailure(4001, "unauthorized", "auth")
        if not _user_attempt_limiter.allow(user_id):
            raise _RelayFailure(4008, "user_rate_limited", "limits")
        if not realtime_configured():
            raise _RelayFailure(4503, "realtime_unavailable", "config", "fallback_needed")
        if not _acquire_slot(user_id):
            raise _RelayFailure(4008, "connection_limit", "limits")
        slot_acquired = True

        session = RealtimeSession()
        try:
            await _during_setup(session.connect(), browser_frame)
        except (WebSocketDisconnect, _RelayFailure):
            raise
        except Exception:
            logger.warning("Realtime upstream setup failed")
            raise _RelayFailure(4503, "upstream_unavailable", "upstream", "fallback_needed") from None

        await _send_json(websocket, {
            "type": "session.ready",
            "session_id": session.session_id,
            "input_sample_rate": session.input_sample_rate,
            "output_sample_rate": session.output_sample_rate,
        })
        last_activity = time.monotonic()

        async def relay_client_to_upstream() -> None:
            nonlocal last_activity
            frame = await browser_frame
            while True:
                if frame.get("type") == "websocket.disconnect":
                    return
                if frame.get("bytes") is not None:
                    raise ProtocolError("Binary frames are not supported")
                event = validate_client_event(parse_message(frame.get("text")))
                if not _message_limiter.allow(user_id):
                    raise _RelayFailure(4008, "message_rate_limited", "limits")
                if session.is_expired:
                    raise _RelayFailure(4410, "session_expired", "expiry")
                last_activity = time.monotonic()
                await session.send_to_upstream(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
                frame = await websocket.receive()

        async def relay_upstream_to_client() -> None:
            nonlocal last_activity
            while True:
                msg = await session.recv_from_upstream(timeout=5.0)
                if msg is None:
                    continue
                if session.is_expired:
                    raise _RelayFailure(4410, "session_expired", "expiry")
                try:
                    parsed = parse_message(msg, max_bytes=MAX_UPSTREAM_BYTES)
                    if parsed["type"] == "error":
                        raise _RelayFailure(4503, "upstream_error", "upstream")
                    projected = public_server_event(parsed)
                except ProtocolError:
                    raise _RelayFailure(4503, "upstream_protocol", "upstream") from None
                if projected is None:
                    continue
                if (projected["type"] == "response.done"
                        and projected["response"]["status"] in {"failed", "incomplete"}):
                    raise _RelayFailure(4503, "upstream_response_failed", "upstream")
                await _send_json(websocket, projected)
                last_activity = time.monotonic()

        async def watchdog() -> None:
            while True:
                await asyncio.sleep(_WATCHDOG_INTERVAL)
                if session.is_expired:
                    raise _RelayFailure(4410, "session_expired", "expiry")
                if time.monotonic() - last_activity >= _IDLE_TIMEOUT_SEC:
                    raise _RelayFailure(4408, "idle_timeout", "timeout")

        relays = [
            asyncio.create_task(relay_client_to_upstream(), name="realtime-client-relay"),
            asyncio.create_task(relay_upstream_to_client(), name="realtime-upstream-relay"),
            asyncio.create_task(watchdog(), name="realtime-watchdog"),
        ]
        tasks.extend(relays)
        try:
            done, _ = await asyncio.wait(relays, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        finally:
            # Stop every writer before sending the one terminal error/close.
            for task in relays:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*relays, return_exceptions=True)
    except WebSocketDisconnect:
        pass
    except _RelayFailure as failure:
        await _close_with_error(
            websocket, close_code=failure.close_code, error_code=failure.code,
            detail_code=failure.detail, kind=failure.kind,
        )
    except ProtocolError:
        await _close_with_error(
            websocket, close_code=4008, error_code="invalid_event", detail_code="protocol"
        )
    except Exception:
        logger.warning("Realtime relay failed")
        await _close_with_error(
            websocket, close_code=4503, error_code="upstream_unavailable", detail_code="upstream"
        )
    finally:
        try:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            try:
                if session is not None:
                    # A second cancellation must not interrupt socket cleanup.
                    cleanup = asyncio.create_task(_close_session(session), name="realtime-cleanup")
                    cleanup.add_done_callback(_consume_result)
                    await asyncio.shield(cleanup)
            finally:
                if slot_acquired and user_id:
                    _release_slot(user_id)
                _release_connection()
                await _close_browser(websocket)
