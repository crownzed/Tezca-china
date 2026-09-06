"""Test cho /api/speech/transcribe và /api/speech/chat — hai endpoint ĐÃ đăng nhập.

Chạy: cd backend && python -m pytest tests/test_speech_chat_guards.py

Khoá lại lớp bảo vệ mới. Hai endpoint này tiêu quota GEMINI_NATIVE_API_KEYS —
cùng bể key với /tts và /pronunciation — nên trước đây để công khai thì:
  - /transcribe thành dịch vụ speech-to-text miễn phí;
  - /chat thành proxy LLM văn bản miễn phí, kể từ khi ``audio_base64`` thành tuỳ
    chọn và có thêm ``text`` (trước đó ``min_length=16`` vô tình chặn được).

Các ca khoá:
  - không có token -> 401 (cả hai endpoint, cả lượt chỉ-văn-bản);
  - có token -> 200 và service ĐƯỢC gọi (mock, không chạm Gemini);
  - audio quá lớn (>500KB) / quá dài (>8s) -> 413;
  - mime ngoài whitelist -> 415;
  - base64 rác -> 400;
  - lượt chỉ-văn-bản KHÔNG bị kiểm audio (mime lạ vẫn qua);
  - không có text lẫn audio -> 400;
  - vượt rate limit theo USER -> 429, và khoá theo user chứ không theo IP.

Không chạm DB, không mạng: router được gắn vào FastAPI rỗng, ``get_current_user``
bị override, và transcribe_speech/voice_chat được patch.
"""

import base64
import io
import struct
import unittest
import wave
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.routers import speech as speech_module
from app.routers.speech import router as speech_router


def _make_wav(duration_sec: float, sample_rate: int = 8000) -> bytes:
    """WAV PCM 16-bit mono hợp lệ với thời lượng cho trước (im lặng)."""
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
    """Chỉ cần ``.id`` — đó là tất cả những gì rate limiter dùng làm khoá."""

    def __init__(self, user_id: str) -> None:
        self.id = user_id


_FAKE_CHAT = {"user_text": "你好", "reply_cn": "你好！", "reply_vi": "Xin chào!"}


class SpeechChatGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(speech_router)
        cls.app = app
        cls.client = TestClient(app)

    def setUp(self):
        # Limiter là global module -> reset để lượt không rò giữa các ca.
        speech_module._chat_rate_limiter._hits.clear()
        self.app.dependency_overrides.clear()

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _login(self, user_id: str = "user-1"):
        self.app.dependency_overrides[get_current_user] = lambda: _FakeUser(user_id)

    # --- Không đăng nhập ---------------------------------------------------

    def test_transcribe_requires_auth(self):
        res = self.client.post(
            "/api/speech/transcribe",
            json={"audio_base64": _b64(_make_wav(1.0)), "mime_type": "audio/wav"},
        )
        self.assertEqual(res.status_code, 401, res.text)

    def test_chat_requires_auth_for_audio_turn(self):
        res = self.client.post(
            "/api/speech/chat",
            json={"audio_base64": _b64(_make_wav(1.0)), "mime_type": "audio/wav", "history": []},
        )
        self.assertEqual(res.status_code, 401, res.text)

    def test_chat_text_only_turn_requires_auth(self):
        """Ca lạm dụng cụ thể: proxy LLM miễn phí bằng payload chỉ có text."""
        res = self.client.post(
            "/api/speech/chat",
            json={"text": "viết cho tôi một bài luận 3 câu", "history": []},
        )
        self.assertEqual(res.status_code, 401, res.text)

    # --- Đã đăng nhập: đường thành công ------------------------------------

    def test_transcribe_succeeds_when_authenticated(self):
        self._login()
        payload = {"audio_base64": _b64(_make_wav(1.0)), "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="你好") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["user_text"], "你好")
        m.assert_called_once()

    def test_chat_succeeds_when_authenticated(self):
        self._login()
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)) as m:
            res = self.client.post(
                "/api/speech/chat",
                json={"text": "你好", "history": []},
            )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["reply_cn"], "你好！")
        m.assert_called_once()

    # --- Siết audio --------------------------------------------------------

    def test_transcribe_rejects_audio_over_500kb(self):
        self._login()
        # >500KB byte THẬT nhưng base64 vẫn dưới trần schema 700k ký tự — đúng
        # kẽ hở mà trần base64 một mình không bịt được.
        payload = {"audio_base64": _b64(b"\x00" * 515000), "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="x") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 413, res.text)
        m.assert_not_called()

    def test_transcribe_rejects_audio_over_the_duration_cap(self):
        self._login()
        # 8000 Hz để 16s WAV vẫn dưới trần 500KB -> chắc chắn trượt ở trần THỜI
        # LƯỢNG, không phải trần byte (16s * 8000 * 2 = 256KB).
        too_long = speech_module._CHAT_MAX_DURATION_SEC + 1.0
        payload = {"audio_base64": _b64(_make_wav(too_long)), "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="x") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 413, res.text)
        m.assert_not_called()

    def test_transcribe_accepts_a_normal_length_conversational_turn(self):
        """10 giây phải qua: trần cũ 8s (mượn từ demo chấm 1 từ) chặn oan câu nói
        bình thường, và người học chỉ biết sau khi đã nói xong."""
        self._login()
        payload = {"audio_base64": _b64(_make_wav(10.0)), "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="你好") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        m.assert_called_once()

    def test_duration_cap_is_the_tightest_of_the_three_limits(self):
        """Trần thời lượng phải chạm trước trần byte/base64.

        Chỉ trần thời lượng báo được lỗi có nghĩa ("quá dài"); hai trần kia chỉ nói
        "quá lớn". Với WAV 16kHz mono 16-bit mà speech-ai.js sinh ra, cả hai trần
        kia rơi vào ~16s, nên trần thời lượng phải nhỏ hơn.
        """
        bytes_per_sec = 16_000 * 2
        byte_cap_sec = speech_module._DEMO_MAX_AUDIO_BYTES / bytes_per_sec
        b64_cap_sec = 700_000 * 3 / 4 / bytes_per_sec
        self.assertLess(speech_module._CHAT_MAX_DURATION_SEC, byte_cap_sec)
        self.assertLess(speech_module._CHAT_MAX_DURATION_SEC, b64_cap_sec)

    def test_transcribe_rejects_mime_outside_whitelist(self):
        self._login()
        payload = {"audio_base64": _b64(_make_wav(1.0)), "mime_type": "audio/mp3"}
        with patch.object(speech_module, "transcribe_speech", return_value="x") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 415, res.text)
        m.assert_not_called()

    def test_transcribe_rejects_invalid_base64(self):
        self._login()
        payload = {"audio_base64": "khong-phai-base64!!!", "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="x") as m:
            res = self.client.post("/api/speech/transcribe", json=payload)
        self.assertEqual(res.status_code, 400, res.text)
        m.assert_not_called()

    def test_chat_rejects_oversized_audio(self):
        self._login()
        payload = {
            "audio_base64": _b64(b"\x00" * 515000),
            "mime_type": "audio/wav",
            "history": [],
        }
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)) as m:
            res = self.client.post("/api/speech/chat", json=payload)
        self.assertEqual(res.status_code, 413, res.text)
        m.assert_not_called()

    def test_chat_text_only_turn_skips_audio_guards(self):
        """Lượt chỉ có text không mang audio nên mime mặc định không được chặn."""
        self._login()
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)) as m:
            res = self.client.post(
                "/api/speech/chat",
                json={"text": "你好", "mime_type": "audio/mp3", "history": []},
            )
        self.assertEqual(res.status_code, 200, res.text)
        m.assert_called_once()

    def test_chat_rejects_empty_turn(self):
        self._login()
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)) as m:
            res = self.client.post("/api/speech/chat", json={"history": []})
        self.assertEqual(res.status_code, 400, res.text)
        m.assert_not_called()

    # --- Rate limit theo user ---------------------------------------------

    def test_rate_limit_is_keyed_by_user(self):
        self._login("user-heavy")
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)):
            for _ in range(speech_module._chat_rate_limiter.max_hits):
                res = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
                self.assertEqual(res.status_code, 200, res.text)
            over = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
        self.assertEqual(over.status_code, 429, over.text)

        # Người khác KHÔNG bị chặn lây: khoá là user id, không phải IP (cả lớp
        # học sau một NAT dùng chung IP thì khoá theo IP sẽ chặn oan).
        self._login("user-light")
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)):
            res = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
        self.assertEqual(res.status_code, 200, res.text)

    def test_transcribe_and_chat_share_one_user_budget(self):
        """Cùng một bể key -> cùng một hạn mức, không phải mỗi endpoint một suất."""
        self._login("user-shared")
        limit = speech_module._chat_rate_limiter.max_hits
        payload = {"audio_base64": _b64(_make_wav(1.0)), "mime_type": "audio/wav"}
        with patch.object(speech_module, "transcribe_speech", return_value="你好"):
            for _ in range(limit):
                res = self.client.post("/api/speech/transcribe", json=payload)
                self.assertEqual(res.status_code, 200, res.text)
        with patch.object(speech_module, "voice_chat", return_value=dict(_FAKE_CHAT)):
            over = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
        self.assertEqual(over.status_code, 429, over.text)


if __name__ == "__main__":
    unittest.main()
