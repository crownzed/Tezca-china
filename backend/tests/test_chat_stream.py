"""Test cho POST /api/speech/chat/stream — hội thoại SSE một request.

Chạy: cd backend && python -m pytest tests/test_chat_stream.py

Endpoint này thay hai request (/transcribe rồi /chat) bằng MỘT, và phát từng câu
tiếng Trung khi model chốt để client đọc câu 1 trong lúc câu 2 còn sinh.

Các ca khoá:
  - guard giống /chat từng chữ: không token -> 401, audio quá lớn/quá dài -> 413,
    mime lạ -> 415, lượt rỗng -> 400, vượt hạn mức -> 429, và dùng CHUNG hạn mức
    với /chat (nếu tách suất thì siết /chat là vô nghĩa);
  - thứ tự event: transcript TRƯỚC mọi sentence, done sau cùng;
  - transcript phát ngay sau ASR, không chờ LLM;
  - mỗi câu ra một event sentence, đúng thứ tự, đánh index từ 1;
  - câu cuối không có dấu kết vẫn được phát;
  - stream không ra được câu nào -> fallback voice_chat, và KHÔNG chép âm lần hai;
  - ASR lỗi -> event error, không có sentence nào.

Không mạng: ``transcribe_speech`` và ``urlopen`` được patch.
"""

import base64
import io
import json
import struct
import unittest
import wave
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.routers import speech as speech_module
from app.routers.speech import router as speech_router
from app.services import speech_ai_service as svc


def _make_wav(duration_sec: float, sample_rate: int = 8000) -> bytes:
    n_frames = int(duration_sec * sample_rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack("<%dh" % n_frames, *([0] * n_frames)))
    return buf.getvalue()


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


class _FakeUser:
    def __init__(self, user_id: str) -> None:
        self.id = user_id


def _gemini_sse(*chunks: str) -> io.BytesIO:
    """Stream ``streamGenerateContent?alt=sse`` giả, mỗi chunk một dòng data."""
    lines = []
    for chunk in chunks:
        payload = {"candidates": [{"content": {"parts": [{"text": chunk}]}}]}
        lines.append(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n")
    return io.BytesIO("".join(lines).encode("utf-8"))


class _FakeResponse:
    def __init__(self, stream: io.BytesIO) -> None:
        self._stream = stream

    def __enter__(self):
        return self._stream

    def __exit__(self, *exc):
        return False


def _parse_events(body: str) -> list[dict]:
    events = []
    for block in body.split("\n\n"):
        line = next((r for r in block.split("\n") if r.startswith("data:")), None)
        if line:
            events.append(json.loads(line[5:].strip()))
    return events


class ChatStreamGuardTest(unittest.TestCase):
    """Lớp bảo vệ phải khớp /chat — hai đường cùng tiêu một bể quota."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(speech_router)
        cls.app = app
        cls.client = TestClient(app)

    def setUp(self):
        speech_module._chat_rate_limiter._hits.clear()
        self.app.dependency_overrides.clear()

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _login(self, user_id: str = "user-1"):
        self.app.dependency_overrides[get_current_user] = lambda: _FakeUser(user_id)

    def test_requires_auth(self):
        res = self.client.post("/api/speech/chat/stream", json={"text": "你好", "history": []})
        self.assertEqual(res.status_code, 401, res.text)

    def test_rejects_empty_turn(self):
        self._login()
        res = self.client.post("/api/speech/chat/stream", json={"history": []})
        self.assertEqual(res.status_code, 400, res.text)

    def test_rejects_oversized_audio(self):
        self._login()
        res = self.client.post(
            "/api/speech/chat/stream",
            json={"audio_base64": _b64(b"\x00" * 515_000), "mime_type": "audio/wav", "history": []},
        )
        self.assertEqual(res.status_code, 413, res.text)

    def test_rejects_audio_over_duration_cap(self):
        self._login()
        too_long = speech_module._CHAT_MAX_DURATION_SEC + 1.0
        res = self.client.post(
            "/api/speech/chat/stream",
            json={
                "audio_base64": _b64(_make_wav(too_long)),
                "mime_type": "audio/wav",
                "history": [],
            },
        )
        self.assertEqual(res.status_code, 413, res.text)

    def test_rejects_mime_outside_whitelist(self):
        self._login()
        res = self.client.post(
            "/api/speech/chat/stream",
            json={
                "audio_base64": _b64(_make_wav(1.0)),
                "mime_type": "audio/mp3",
                "history": [],
            },
        )
        self.assertEqual(res.status_code, 415, res.text)

    def test_shares_one_user_budget_with_chat(self):
        self._login("user-shared")
        limit = speech_module._chat_rate_limiter.max_hits
        with patch.object(
            speech_module,
            "voice_chat",
            return_value={"user_text": "", "reply_cn": "好。", "reply_vi": ""},
        ):
            for _ in range(limit):
                res = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
                self.assertEqual(res.status_code, 200, res.text)
        over = self.client.post("/api/speech/chat/stream", json={"text": "你好", "history": []})
        self.assertEqual(over.status_code, 429, over.text)


class ChatStreamEventTest(unittest.TestCase):
    """Nội dung stream: thứ tự và ranh giới câu."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(speech_router)
        cls.app = app
        cls.client = TestClient(app)

    def setUp(self):
        speech_module._chat_rate_limiter._hits.clear()
        self.app.dependency_overrides[get_current_user] = lambda: _FakeUser("user-1")

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _stream(self, payload: dict, chunks: tuple[str, ...]) -> list[dict]:
        with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
            with patch.object(
                svc.urllib.request, "urlopen", return_value=_FakeResponse(_gemini_sse(*chunks))
            ):
                res = self.client.post("/api/speech/chat/stream", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertTrue(res.headers["content-type"].startswith("text/event-stream"))
        return _parse_events(res.text)

    def test_text_turn_emits_transcript_sentences_then_done(self):
        events = self._stream(
            {"text": "你好", "history": []},
            ("REPLY_CN: 你好！", "我很好。\n", "REPLY_VI: Xin chào!"),
        )
        types = [e["type"] for e in events]
        self.assertEqual(types[0], "transcript")
        self.assertEqual(types[-1], "done")

        sentences = [e for e in events if e["type"] == "sentence"]
        self.assertEqual([s["text"] for s in sentences], ["你好！", "我很好。"])
        self.assertEqual([s["index"] for s in sentences], [1, 2])

        done = events[-1]
        self.assertEqual(done["user_text"], "你好")
        self.assertIn("你好！", done["reply_cn"])
        self.assertEqual(done["reply_vi"], "Xin chào!")
        # Nhãn REPLY_VI không được lọt vào phần tiếng Trung.
        self.assertNotIn("REPLY_VI", done["reply_cn"])

    def test_transcript_precedes_every_sentence(self):
        """Bong bóng của người học phải hiện TRƯỚC câu trả lời đầu tiên — đó là
        phần độ trễ người dùng cảm nhận rõ nhất."""
        events = self._stream(
            {"text": "你好", "history": []},
            ("REPLY_CN: 好。", "REPLY_VI: ok"),
        )
        first_sentence = next(i for i, e in enumerate(events) if e["type"] == "sentence")
        transcript_at = next(i for i, e in enumerate(events) if e["type"] == "transcript")
        self.assertLess(transcript_at, first_sentence)

    def test_audio_turn_transcribes_before_streaming(self):
        payload = {
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
            "history": [],
        }
        with patch.object(svc, "transcribe_speech", return_value="我想喝茶") as asr:
            events = self._stream(payload, ("REPLY_CN: 好的。", "REPLY_VI: Được."))
        asr.assert_called_once()
        self.assertEqual(events[0], {"type": "transcript", "user_text": "我想喝茶"})

    def test_final_sentence_without_punctuation_is_emitted(self):
        """Model hay dừng ở REPLY_VI hoặc hết token, câu cuối không có dấu kết."""
        events = self._stream(
            {"text": "你好", "history": []},
            ("REPLY_CN: 我很好", "REPLY_VI: Tôi ổn"),
        )
        sentences = [e["text"] for e in events if e["type"] == "sentence"]
        self.assertEqual(sentences, ["我很好"])

    def test_tail_after_a_complete_sentence_keeps_every_character(self):
        """Phần đuôi phải cắt trên chuỗi NGUYÊN VĂN, không phải bản đã strip.

        Sau "REPLY_CN:" luôn có một dấu cách. Nếu đếm ký tự trên bản đã strip thì
        chỉ số lệch đúng một ký tự và câu cuối bị mất chữ đầu — ở đây là "我很好"
        thành "好", tức người học nghe một câu khác nghĩa.
        """
        events = self._stream(
            {"text": "你好", "history": []},
            ("REPLY_CN: 你好！我很好", "REPLY_VI: Xin chào"),
        )
        sentences = [e["text"] for e in events if e["type"] == "sentence"]
        self.assertEqual(sentences, ["你好！", "我很好"])

    def test_sentences_are_not_duplicated_across_chunks(self):
        """Một câu bị cắt qua hai chunk chỉ được phát MỘT lần."""
        events = self._stream(
            {"text": "你好", "history": []},
            ("REPLY_CN: 我很", "好。", "你呢？", "REPLY_VI: ok"),
        )
        sentences = [e["text"] for e in events if e["type"] == "sentence"]
        self.assertEqual(sentences, ["我很好。", "你呢？"])

    def test_asr_failure_yields_error_and_no_sentences(self):
        payload = {
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
            "history": [],
        }
        with patch.object(svc, "transcribe_speech", side_effect=RuntimeError("ASR down")):
            with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
                res = self.client.post("/api/speech/chat/stream", json=payload)
        events = _parse_events(res.text)
        self.assertEqual([e["type"] for e in events], ["error"])
        self.assertNotIn("sentence", [e["type"] for e in events])

    def test_falls_back_without_transcribing_twice(self):
        """Stream không ra câu nào -> voice_chat, nhưng KHÔNG gửi lại audio: đã
        chép xong ở bước 1, chép lần nữa vừa tốn quota vừa có thể ra khác."""
        payload = {
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
            "history": [],
        }
        with patch.object(svc, "transcribe_speech", return_value="你好"):
            with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
                with patch.object(
                    svc.urllib.request, "urlopen", side_effect=OSError("stream chết")
                ):
                    with patch.object(
                        svc,
                        "voice_chat",
                        return_value={"user_text": "你好", "reply_cn": "好的。", "reply_vi": "Được."},
                    ) as fallback:
                        res = self.client.post("/api/speech/chat/stream", json=payload)
        events = _parse_events(res.text)
        self.assertEqual(events[-1]["reply_cn"], "好的。")
        self.assertIn("好的。", [e.get("text") for e in events if e["type"] == "sentence"])
        self.assertEqual(fallback.call_args.kwargs["audio_b64"], "")
        self.assertEqual(fallback.call_args.kwargs["text"], "你好")

    def test_no_gemini_key_yields_error_event(self):
        with patch.object(svc.settings, "gemini_native_api_keys", ""):
            res = self.client.post(
                "/api/speech/chat/stream", json={"text": "你好", "history": []}
            )
        events = _parse_events(res.text)
        self.assertEqual(events[-1]["type"], "error")


if __name__ == "__main__":
    unittest.main()
