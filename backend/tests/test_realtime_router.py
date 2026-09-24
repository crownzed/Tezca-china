"""Offline admission/ASGI lifecycle tests; no app startup, schema changes, or provider."""
import asyncio
from contextlib import ExitStack
from importlib import import_module
import json
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from app.services.auth_service import AuthService
from app.services.rate_limiter import RateLimiter

realtime = import_module("app.realtime.router")


class Browser:
    """Use Starlette's real state machine over in-memory ASGI messages."""
    def __init__(self, origins=("https://app.example",), headers=()):
        self.incoming = asyncio.Queue()
        self.outgoing = asyncio.Queue()
        self.sent = []
        self.stall = None
        self.incoming.put_nowait({"type": "websocket.connect"})
        self.websocket = WebSocket({
            "type": "websocket", "path": "/ws/voice-chat", "scheme": "wss",
            "query_string": b"", "client": ("203.0.113.7", 50000),
            "headers": [(b"origin", origin.encode()) for origin in origins] + list(headers),
        }, self.incoming.get, self.send)

    async def send(self, message):
        if self.stall and self.stall(message):
            await asyncio.Event().wait()
        self.sent.append(message)
        await self.outgoing.put(message)

    def json(self, value):
        self.incoming.put_nowait({"type": "websocket.receive", "text": json.dumps(value)})

    def raw(self, value):
        self.incoming.put_nowait({"type": "websocket.receive", "text": value})

    def disconnect(self):
        self.incoming.put_nowait({"type": "websocket.disconnect", "code": 1000})

    async def event(self, kind):
        async with asyncio.timeout(2):
            while True:
                message = await self.outgoing.get()
                if message["type"] == "websocket.send":
                    payload = json.loads(message["text"])
                    if payload["type"] == kind:
                        return payload

    @property
    def events(self):
        return [json.loads(m["text"]) for m in self.sent if m["type"] == "websocket.send"]

    @property
    def closes(self):
        return [m for m in self.sent if m["type"] == "websocket.close"]


class Upstream:
    session_id = "sess-offline"
    input_sample_rate = 16000
    output_sample_rate = 24000
    is_expired = False

    def __init__(self):
        self.messages = asyncio.Queue()
        self.connect_started = asyncio.Event()
        self.connected = asyncio.Event()
        self.connect_gate = None
        self.connect_error = None
        self.connect_cancelled = False
        self.close_error = None
        self.close_gate = None
        self.close_started = asyncio.Event()
        self.closed = False
        self.close_count = 0
        self.send_error = None
        self.sent = []

    async def connect(self):
        self.connect_started.set()
        try:
            if self.connect_gate:
                await self.connect_gate.wait()
            if self.connect_error:
                raise self.connect_error
            self.connected.set()
        except asyncio.CancelledError:
            self.connect_cancelled = True
            raise

    async def send_to_upstream(self, value):
        if self.send_error:
            raise self.send_error
        self.sent.append(json.loads(value))

    async def recv_from_upstream(self, timeout):
        value = await self.messages.get()
        if isinstance(value, Exception):
            raise value
        return json.dumps(value) if isinstance(value, dict) else value

    async def close(self):
        self.close_count += 1
        self.close_started.set()
        if self.close_gate:
            await self.close_gate.wait()
        if self.close_error:
            raise self.close_error
        self.closed = True


class RouterLifecycleTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.running = []
        self.upstream = Upstream()
        for name, value in {
            "_connection_total": 0, "_active_total": 0, "_active_by_user": {},
            "_attempt_limiter": RateLimiter(100, 60),
            "_user_attempt_limiter": RateLimiter(100, 60),
            "_message_limiter": RateLimiter(100, 60),
            "_admission_slots": threading.BoundedSemaphore(8),
            "_AUTH_FRAME_TIMEOUT": 0.2, "_ADMISSION_TIMEOUT": 0.2,
            "_BROWSER_IO_TIMEOUT": 0.08, "_CLOSE_TIMEOUT": 0.02,
            "_SESSION_CLOSE_TIMEOUT": 0.08, "_WATCHDOG_INTERVAL": 0.01,
        }.items():
            self.stack.enter_context(patch.object(realtime, name, value))
        self.stack.enter_context(patch.object(realtime, "settings_cors_list", return_value=["https://app.example"]))
        self.admit = self.stack.enter_context(patch.object(realtime, "_admit_token", return_value="user-offline"))
        self.configured = self.stack.enter_context(patch.object(realtime, "realtime_configured", return_value=True))
        self.factory = self.stack.enter_context(patch.object(realtime, "RealtimeSession", return_value=self.upstream))

    async def asyncTearDown(self):
        for task in self.running:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.running, return_exceptions=True)
        self.assertEqual(realtime._connection_total, 0)
        self.assertEqual(realtime._active_total, 0)
        self.assertEqual(realtime._active_by_user, {})
        leftovers = [task for task in asyncio.all_tasks()
                     if not task.done() and task.get_name().startswith("realtime-")]
        self.assertEqual(leftovers, [])

    def start(self, browser=None, authenticate=True):
        browser = browser or Browser()
        if authenticate:
            browser.json({"type": "auth", "token": "offline-token"})
        task = asyncio.create_task(realtime.ws_voice_chat(browser.websocket))
        self.running.append(task)
        return browser, task

    async def finish(self, task):
        await asyncio.wait_for(task, 2)

    def assert_error(self, browser, code, close_code, kind="error"):
        errors = [event for event in browser.events if event["type"] in {"error", "fallback_needed"}]
        self.assertEqual(len(errors), 1, browser.events)
        self.assertEqual(errors[0]["type"], kind)
        self.assertEqual(errors[0]["code"], code)
        self.assertIs(errors[0]["retryable"], False)
        self.assertEqual(browser.closes[-1]["code"], close_code)
        self.assertNotIn("sensitive-provider-payload", str(browser.sent))

    async def test_ready_has_configured_rates_and_disconnect_releases_all(self):
        browser, task = self.start()
        ready = await browser.event("session.ready")
        self.assertTrue(self.upstream.connected.is_set())
        self.assertEqual(ready, {"type": "session.ready", "session_id": "sess-offline",
                                 "input_sample_rate": 16000, "output_sample_rate": 24000})
        self.assertEqual(realtime._active_total, 1)
        browser.disconnect()
        await self.finish(task)
        self.assertTrue(self.upstream.closed)
        self.assertEqual(self.upstream.close_count, 1)

    async def test_exact_origin_required_before_accept_or_auth(self):
        for origins in [(), ("null",), ("https://app.example.evil",),
                        (" https://app.example",), ("https://app.example", "https://app.example")]:
            with self.subTest(origins=origins):
                browser, task = self.start(Browser(origins))
                await self.finish(task)
                self.assertEqual([m["type"] for m in browser.sent], ["websocket.close"])
                self.assertEqual(browser.closes[0]["code"], 4003)
        self.admit.assert_not_called()
        self.factory.assert_not_called()

    async def test_connection_rate_ignores_forged_proxy_headers(self):
        with patch.object(realtime, "_attempt_limiter", RateLimiter(1, 60)):
            self.configured.return_value = False
            browser, task = self.start(Browser(headers=[(b"fly-client-ip", b"1.2.3.4")]))
            await self.finish(task)
            browser, task = self.start(Browser(headers=[(b"fly-client-ip", b"5.6.7.8"),
                                                       (b"x-forwarded-for", b"127.0.0.1")]))
            await self.finish(task)
            self.assertEqual(browser.closes[0]["code"], 4008)
            self.assertNotIn("websocket.accept", [m["type"] for m in browser.sent])
        self.factory.assert_not_called()

    async def test_query_or_header_token_cannot_replace_first_frame(self):
        browser = Browser(headers=[(b"authorization", b"Bearer offline-token")])
        browser.websocket.scope["query_string"] = b"token=offline-token"
        browser, task = self.start(browser, authenticate=False)
        await self.finish(task)
        self.assert_error(browser, "auth_timeout", 4001)
        self.admit.assert_not_called()
        self.factory.assert_not_called()

    async def test_invalid_first_frames_never_open_upstream(self):
        frames = [
            {"type": "websocket.receive", "bytes": b"audio"},
            {"type": "websocket.receive", "text": "[]"},
            {"type": "websocket.receive", "text": "{"},
            {"type": "websocket.receive", "text": '{"type":"auth","token":"a","token":"b"}'},
            {"type": "websocket.receive", "text": '{"type":"auth","token":NaN}'},
            {"type": "websocket.receive", "text": '{"type":"auth","token":Infinity}'},
            {"type": "websocket.receive", "text": '{"type":"auth","token":"\\ud800"}'},
            {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "a" * 9000})},
            {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": " "})},
            {"type": "websocket.receive", "text": json.dumps({"type": "response.create"})},
            {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "a", "model": "bad"})},
        ]
        for frame in frames:
            with self.subTest(frame=frame["type"]):
                browser = Browser()
                browser.incoming.put_nowait(frame)
                browser, task = self.start(browser, authenticate=False)
                await self.finish(task)
                self.assert_error(browser, "invalid_auth_frame", 4001)
        self.admit.assert_not_called()
        self.factory.assert_not_called()

    async def test_invalid_token_and_disabled_config_never_open_provider(self):
        self.admit.return_value = None
        browser, task = self.start()
        await self.finish(task)
        self.assert_error(browser, "unauthorized", 4001)
        self.admit.return_value = "user-offline"
        self.configured.return_value = False
        browser, task = self.start()
        await self.finish(task)
        self.assert_error(browser, "realtime_unavailable", 4503, "fallback_needed")
        self.factory.assert_not_called()

    async def test_pending_auth_counts_toward_connection_cap(self):
        with patch.object(realtime, "_MAX_CONNECTIONS", 1):
            first, first_task = self.start(authenticate=False)
            await asyncio.wait_for(first.outgoing.get(), 1)
            second, second_task = self.start()
            await self.finish(second_task)
            self.assertEqual(second.closes[0]["code"], 4008)
            first.disconnect()
            await self.finish(first_task)
        self.factory.assert_not_called()

    async def test_authenticated_attempt_limit_precedes_provider(self):
        with patch.object(realtime, "_user_attempt_limiter", RateLimiter(1, 60)):
            self.configured.return_value = False
            _, task = self.start()
            await self.finish(task)
            browser, task = self.start()
            await self.finish(task)
            self.assert_error(browser, "user_rate_limited", 4008)
        self.factory.assert_not_called()

    async def test_total_active_and_per_user_limits(self):
        first, first_task = self.start()
        await first.event("session.ready")
        second, second_task = self.start()
        await self.finish(second_task)
        self.assert_error(second, "connection_limit", 4008)
        self.admit.return_value = "different-user"
        with patch.object(realtime, "_MAX_ACTIVE_TOTAL", 1):
            third, third_task = self.start()
            await self.finish(third_task)
            self.assert_error(third, "connection_limit", 4008)
        self.factory.assert_called_once()
        first.disconnect()
        await self.finish(first_task)

    async def test_disconnect_during_setup_cancels_connect_and_closes(self):
        self.upstream.connect_gate = asyncio.Event()
        browser, task = self.start()
        await asyncio.wait_for(self.upstream.connect_started.wait(), 1)
        browser.disconnect()
        await self.finish(task)
        self.assertTrue(self.upstream.connect_cancelled)
        self.assertTrue(self.upstream.closed)
        self.assertEqual(browser.events, [])

    async def test_audio_before_ready_is_not_buffered_or_forwarded(self):
        self.upstream.connect_gate = asyncio.Event()
        browser, task = self.start()
        await asyncio.wait_for(self.upstream.connect_started.wait(), 1)
        browser.json({"type": "input_audio_buffer.append", "audio": "AAA="})
        await self.finish(task)
        self.assert_error(browser, "event_before_ready", 4008)
        self.assertTrue(self.upstream.connect_cancelled)
        self.assertEqual(self.upstream.sent, [])

    async def test_initial_provider_error_is_static_fallback_and_no_retry(self):
        self.upstream.connect_error = RuntimeError("sensitive-provider-payload")
        with self.assertLogs(realtime.logger, level="WARNING") as logs:
            browser, task = self.start()
            await self.finish(task)
        self.assert_error(browser, "upstream_unavailable", 4503, "fallback_needed")
        self.assertNotIn("sensitive-provider-payload", str(logs.output))
        self.assertNotIn("Traceback", str(logs.output))
        self.factory.assert_called_once()
        self.assertTrue(self.upstream.closed)

    async def test_valid_events_forwarded_without_auth_or_provider_config(self):
        browser, task = self.start()
        await browser.event("session.ready")
        events = [
            {"type": "input_audio_buffer.append", "audio": "AAA="},
            {"type": "input_audio_buffer.clear"}, {"type": "response.cancel"},
            {"type": "conversation.item.create", "item": {"type": "message", "role": "user",
             "content": [{"type": "input_text", "text": "你好"}]}},
            {"type": "response.create"},
        ]
        for event in events:
            browser.json(event)
        browser.disconnect()
        await self.finish(task)
        self.assertEqual(self.upstream.sent, events)

    async def test_client_event_and_config_injections_are_rejected(self):
        values = [
            {"type": "session.update", "session": {"instructions": "bad"}},
            {"type": "response.create", "response": {"model": "bad"}},
            {"type": "conversation.item.truncate", "item_id": "item1"},
            {"type": "input_audio_buffer.commit"},
            {"type": "conversation.item.create", "item": {"type": "function_call_output", "output": "bad"}},
            {"type": "conversation.item.create", "item": {"type": "message", "role": "system", "content": []}},
            {"type": "input_audio_buffer.append", "audio": "AA=="},
            {"type": "input_audio_buffer.append", "audio": "???"},
            {"type": "input_audio_buffer.append", "audio": "AAAA" * 9000},
        ]
        for value in values:
            with self.subTest(kind=value["type"]):
                browser, task = self.start()
                await browser.event("session.ready")
                browser.json(value)
                await self.finish(task)
                self.assert_error(browser, "invalid_event", 4008)
        self.assertEqual(self.upstream.sent, [])

    async def test_malformed_binary_and_oversized_events_rejected(self):
        frames = [
            {"type": "websocket.receive", "bytes": b"pcm"},
            {"type": "websocket.receive", "text": "[1,2]"},
            {"type": "websocket.receive", "text": '{"type":"response.create","type":"response.cancel"}'},
            {"type": "websocket.receive", "text": '{"type":"response.create","unused":NaN}'},
            {"type": "websocket.receive", "text": '{"type":"response.create","unused":Infinity}'},
            {"type": "websocket.receive", "text": 'x' * 48001},
        ]
        for frame in frames:
            browser, task = self.start()
            await browser.event("session.ready")
            browser.incoming.put_nowait(frame)
            await self.finish(task)
            self.assert_error(browser, "invalid_event", 4008)
        self.assertEqual(self.upstream.sent, [])

    async def test_message_limit_has_terminal_close_and_no_excess_forwarding(self):
        with patch.object(realtime, "_message_limiter", RateLimiter(1, 60)):
            browser, task = self.start()
            await browser.event("session.ready")
            browser.json({"type": "response.create"})
            browser.json({"type": "response.create"})
            await self.finish(task)
        self.assert_error(browser, "message_rate_limited", 4008)
        self.assertEqual(len(self.upstream.sent), 1)

    async def test_projection_drops_tools_config_and_extra_provider_fields(self):
        browser, task = self.start()
        await browser.event("session.ready")
        self.upstream.messages.put_nowait({"type": "session.updated", "session": {"secret": "hidden"}})
        self.upstream.messages.put_nowait({"type": "response.function_call_arguments.done", "arguments": "hidden"})
        self.upstream.messages.put_nowait({"type": "response.audio.delta", "delta": "AAA=", "secret": "hidden"})
        event = await browser.event("response.audio.delta")
        self.assertEqual(event, {"type": "response.audio.delta", "delta": "AAA="})
        browser.disconnect()
        await self.finish(task)
        self.assertNotIn("hidden", str(browser.sent))

    async def test_failed_and_incomplete_responses_end_call_without_fallback_or_reconnect(self):
        for status in ("failed", "incomplete"):
            browser, task = self.start()
            await browser.event("session.ready")
            self.upstream.messages.put_nowait({"type": "response.done", "response": {
                "status": status, "status_details": {"error": "sensitive-provider-payload"}}})
            await self.finish(task)
            self.assert_error(browser, "upstream_response_failed", 4503)
            self.assertNotIn("response.done", [event["type"] for event in browser.events])
        self.assertEqual(self.factory.call_count, 2)

    async def test_cancelled_response_is_forwarded_and_session_stays_open(self):
        browser, task = self.start()
        await browser.event("session.ready")
        self.upstream.messages.put_nowait({"type": "response.done", "response": {"status": "cancelled"}})
        self.assertEqual((await browser.event("response.done"))["response"]["status"], "cancelled")
        self.assertFalse(task.done())
        browser.disconnect()
        await self.finish(task)

    async def test_upstream_raw_error_and_invalid_json_are_sanitized(self):
        for message, code in [({"type": "error", "error": {"message": "sensitive-provider-payload"}}, "upstream_error"),
                              ("not json sensitive-provider-payload", "upstream_protocol")]:
            browser, task = self.start()
            await browser.event("session.ready")
            self.upstream.messages.put_nowait(message)
            await self.finish(task)
            self.assert_error(browser, code, 4503)

    async def test_unexpected_relay_exception_is_observed_and_sanitized(self):
        self.upstream.send_error = RuntimeError("sensitive-provider-payload")
        browser, task = self.start()
        await browser.event("session.ready")
        with self.assertLogs(realtime.logger, level="WARNING") as logs:
            browser.json({"type": "response.create"})
            await self.finish(task)
        self.assert_error(browser, "upstream_unavailable", 4503)
        self.assertNotIn("sensitive-provider-payload", str(logs.output))

    async def test_lost_provider_connection_ends_call_without_reconnect(self):
        browser, task = self.start()
        await browser.event("session.ready")
        self.upstream.messages.put_nowait(ConnectionError("sensitive-provider-payload"))
        await self.finish(task)
        self.assert_error(browser, "upstream_unavailable", 4503)
        self.factory.assert_called_once()
        self.assertTrue(self.upstream.closed)

    async def test_silent_hard_expiry_and_idle_expiry(self):
        browser, task = self.start()
        await browser.event("session.ready")
        self.upstream.is_expired = True
        await self.finish(task)
        self.assert_error(browser, "session_expired", 4410)
        self.upstream.is_expired = False
        with patch.object(realtime, "_IDLE_TIMEOUT_SEC", 0):
            browser, task = self.start()
            await self.finish(task)
            self.assert_error(browser, "idle_timeout", 4408)

    async def test_ignored_upstream_events_do_not_refresh_idle_time(self):
        with patch.object(realtime, "_IDLE_TIMEOUT_SEC", 0.08):
            browser, task = self.start()
            await browser.event("session.ready")

            async def ignored_events():
                while True:
                    self.upstream.messages.put_nowait({"type": "provider.heartbeat"})
                    await asyncio.sleep(0.005)

            producer = asyncio.create_task(ignored_events())
            try:
                await self.finish(task)
            finally:
                producer.cancel()
                await asyncio.gather(producer, return_exceptions=True)
        self.assert_error(browser, "idle_timeout", 4408)

    async def test_stalled_browser_send_is_bounded_and_closes_upstream(self):
        browser, task = self.start()
        await browser.event("session.ready")
        browser.stall = lambda message: message["type"] == "websocket.send"
        self.upstream.messages.put_nowait({"type": "response.audio.delta", "delta": "AAA="})
        await self.finish(task)
        self.assertEqual(browser.closes[-1]["code"], 4503)
        self.assertTrue(self.upstream.closed)

    async def test_stalled_accept_and_close_do_not_leak_connection_slots(self):
        browser = Browser()
        browser.stall = lambda _message: True
        browser, task = self.start(browser)
        await self.finish(task)
        self.factory.assert_not_called()
        self.assertEqual(realtime._connection_total, 0)

    async def test_cleanup_failure_still_releases_slots(self):
        self.upstream.close_error = RuntimeError("sensitive-provider-payload")
        browser, task = self.start()
        await browser.event("session.ready")
        with self.assertLogs(realtime.logger, level="WARNING") as logs:
            browser.disconnect()
            await self.finish(task)
        self.assertNotIn("sensitive-provider-payload", str(logs.output))
        self.assertEqual(realtime._active_total, 0)
        self.assertEqual(realtime._connection_total, 0)

    async def test_stalled_upstream_cleanup_is_bounded(self):
        self.upstream.close_gate = asyncio.Event()
        browser, task = self.start()
        await browser.event("session.ready")
        browser.disconnect()
        await self.finish(task)
        self.assertEqual(realtime._active_total, 0)

    async def test_cancellation_during_setup_and_active_call_cleans_resources(self):
        self.upstream.connect_gate = asyncio.Event()
        _, task = self.start()
        await asyncio.wait_for(self.upstream.connect_started.wait(), 1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(self.upstream.connect_cancelled)
        self.assertTrue(self.upstream.closed)
        self.upstream.connect_gate = None
        browser, task = self.start()
        await browser.event("session.ready")
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(realtime._active_total, 0)

    async def test_second_cancellation_does_not_lose_cleanup_or_slot_release(self):
        self.upstream.close_gate = asyncio.Event()
        browser, task = self.start()
        await browser.event("session.ready")
        task.cancel()
        await asyncio.wait_for(self.upstream.close_started.wait(), 1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(realtime._active_total, 0)
        self.assertEqual(realtime._connection_total, 0)
        self.upstream.close_gate.set()
        cleanups = [task for task in asyncio.all_tasks() if task.get_name() == "realtime-cleanup"]
        await asyncio.gather(*cleanups)
        self.assertTrue(self.upstream.closed)

    async def test_disconnect_during_admission_never_opens_provider(self):
        admission_started = asyncio.Event()

        async def waiting(_token):
            admission_started.set()
            await asyncio.Event().wait()

        with patch.object(realtime, "_admit_async", waiting):
            browser, task = self.start()
            await admission_started.wait()
            browser.disconnect()
            await self.finish(task)
        self.factory.assert_not_called()


class AdmissionTest(unittest.TestCase):
    def test_jwt_admission_and_short_lived_db_session(self):
        token = AuthService.create_token("user-offline")
        for user, expected in [
            (SimpleNamespace(id="user-offline", is_active=True), "user-offline"),
            (SimpleNamespace(id="user-offline", is_active=None), "user-offline"),
            (SimpleNamespace(id="user-offline", is_active=False), None),
            (None, None),
        ]:
            with self.subTest(user=user):
                db_context = Mock()
                db_context.__enter__ = Mock(return_value=Mock())
                db_context.__exit__ = Mock(return_value=False)
                with patch.object(realtime, "SessionLocal", return_value=db_context), \
                     patch.object(AuthService, "get_user_by_id", return_value=user):
                    self.assertEqual(realtime._admit_token(token), expected)
                db_context.__exit__.assert_called_once()
        with patch.object(realtime, "SessionLocal") as database:
            self.assertIsNone(realtime._admit_token("invalid.jwt"))
            self.assertIsNone(realtime._admit_token(None))
        database.assert_not_called()

    def test_db_failure_logs_no_token_or_exception(self):
        with patch.object(realtime, "SessionLocal", side_effect=RuntimeError("sensitive-provider-payload")), \
             self.assertLogs(realtime.logger, level="WARNING") as logs:
            token = AuthService.create_token("user-offline")
            self.assertIsNone(realtime._admit_token(token))
        self.assertNotIn("sensitive-provider-payload", str(logs.output))
        self.assertNotIn(token, str(logs.output))
        self.assertNotIn("Traceback", str(logs.output))

    def test_capability_requires_auth_and_never_probes_provider(self):
        app = FastAPI()
        app.include_router(realtime.router)
        with TestClient(app) as client, \
             patch.object(realtime, "RealtimeSession") as provider, \
             patch.object(realtime, "_admit_token", return_value="user-offline") as admit:
            self.assertEqual(client.get("/api/realtime/capabilities").status_code, 401)
            admit.assert_not_called()
            for available in (False, True):
                with patch.object(realtime, "realtime_configured", return_value=available):
                    result = client.get("/api/realtime/capabilities", headers={"Authorization": "Bearer offline-token"})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json(), {"realtime_available": available, "experimental": True,
                                                  "languages": ["zh", "en"]})
            admit.return_value = None
            self.assertEqual(client.get("/api/realtime/capabilities", headers={"Authorization": "Bearer bad"}).status_code, 401)
            provider.assert_not_called()

    def test_capability_saturated_admission_returns_safe_503(self):
        app = FastAPI()
        app.include_router(realtime.router)
        with TestClient(app) as client, patch.object(realtime, "_admission_slots", threading.BoundedSemaphore(0)):
            result = client.get("/api/realtime/capabilities", headers={"Authorization": "Bearer offline-token"})
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json(), {"detail": "Authentication temporarily unavailable"})

    def test_header_length_and_unicode_are_bounded(self):
        for value in (None, "Basic test", "Bearer ", "Bearer " + "a" * 8193, "Bearer \ud800"):
            self.assertIsNone(realtime._extract_bearer(value))
        self.assertEqual(realtime._extract_bearer("Bearer test  "), "test")


class AdmissionThreadTest(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_retains_permit_until_actual_worker_exits(self):
        started = threading.Event()
        release = threading.Event()
        finished = threading.Event()
        slots = threading.BoundedSemaphore(1)

        def blocking(_token):
            started.set()
            release.wait(2)
            finished.set()
            return "user-offline"

        with patch.object(realtime, "_admission_slots", slots), \
             patch.object(realtime, "_admit_token", side_effect=blocking), \
             patch.object(realtime, "_ADMISSION_TIMEOUT", 0.03):
            try:
                with self.assertRaises(TimeoutError):
                    await realtime._admit_async("offline-token")
                self.assertTrue(started.is_set())
                self.assertFalse(slots.acquire(blocking=False))
                with self.assertRaises(realtime._RelayFailure):
                    await realtime._admit_async("another-token")
            finally:
                release.set()
                await asyncio.to_thread(finished.wait, 1)
            async with asyncio.timeout(1):
                while not slots.acquire(blocking=False):
                    await asyncio.sleep(0.005)
            slots.release()


if __name__ == "__main__":
    unittest.main()
