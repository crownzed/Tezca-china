"""Test cho POST /api/speech/pronunciation — endpoint chấm phát âm ĐÃ đăng nhập.

Chạy: cd backend && python -m pytest tests/test_pronunciation_guards.py

Khoá lớp bảo vệ mới. Endpoint này tiêu quota GEMINI_NATIVE_API_KEYS — cùng bể key
với /transcribe, /chat, /tts — nhưng trước đây là endpoint DUY NHẤT trong nhóm
còn để công khai: không auth, không rate-limit, không trần payload. Tức mọi lớp
bảo vệ dựng cho ba endpoint kia đều có thể đi vòng qua đây.

Các ca khoá:
  - không token -> 401;
  - có token -> 200 và service được gọi (mock, không chạm Gemini/DSP);
  - audio >500KB -> 413; audio quá dài -> 413;
  - mime ngoài whitelist -> 415; base64 rác -> 400;
  - base64 vượt trần schema -> 422 (chặn TRƯỚC khi vào endpoint);
  - dùng CHUNG hạn mức với /chat, không phải mỗi endpoint một suất;
  - /demo-pronunciation vẫn công khai (không bị siết lây).
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


_FAKE_SCORE = {
    "score": 78,
    "base_score": 80,
    "identity_score": 82,
    "tone_accuracy": 0.75,
    "target_hanzi": "你好",
    "target_pinyin": "nǐ hǎo",
    "actual_hanzi": "你好",
    "actual_pinyin": "nǐ hǎo",
    "tone_errors": [],
    "syllable_errors": [],
    "tone_syllables": [],
    "user_f0_contour": [120.0, 130.0],
    "fluency": None,
    "prosody": None,
    "detailed_feedback": "",
    "macro_feedback": "",
    "tip": "Giữ thanh 3 sâu hơn.",
}


def _payload(duration_sec: float = 1.0, mime: str = "audio/wav") -> dict:
    return {
        "audio_base64": _b64(_make_wav(duration_sec)),
        "mime_type": mime,
        "target_hanzi": "你好",
        "target_pinyin": "nǐ hǎo",
    }


class PronunciationGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(speech_router)
        cls.app = app
        cls.client = TestClient(app)

    def setUp(self):
        speech_module._chat_rate_limiter._hits.clear()
        speech_module._demo_rate_limiter._hits.clear()
        self.app.dependency_overrides.clear()

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _login(self, user_id: str = "user-1"):
        self.app.dependency_overrides[get_current_user] = lambda: _FakeUser(user_id)

    # --- Auth --------------------------------------------------------------

    def test_requires_auth(self):
        with patch.object(speech_module, "score_pronunciation") as m:
            res = self.client.post("/api/speech/pronunciation", json=_payload())
        self.assertEqual(res.status_code, 401, res.text)
        m.assert_not_called()

    def test_succeeds_when_authenticated(self):
        self._login()
        with patch.object(
            speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)
        ) as m:
            res = self.client.post("/api/speech/pronunciation", json=_payload())
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json()["score"], 78)
        m.assert_called_once()

    # --- Siết audio --------------------------------------------------------

    def test_rejects_audio_over_500kb(self):
        self._login()
        payload = _payload()
        payload["audio_base64"] = _b64(b"\x00" * 515_000)
        with patch.object(speech_module, "score_pronunciation") as m:
            res = self.client.post("/api/speech/pronunciation", json=payload)
        self.assertEqual(res.status_code, 413, res.text)
        m.assert_not_called()

    def test_rejects_audio_over_duration_cap(self):
        self._login()
        too_long = speech_module._CHAT_MAX_DURATION_SEC + 1.0
        with patch.object(speech_module, "score_pronunciation") as m:
            res = self.client.post("/api/speech/pronunciation", json=_payload(too_long))
        self.assertEqual(res.status_code, 413, res.text)
        m.assert_not_called()

    def test_rejects_mime_outside_whitelist(self):
        self._login()
        with patch.object(speech_module, "score_pronunciation") as m:
            res = self.client.post(
                "/api/speech/pronunciation", json=_payload(mime="audio/mp3")
            )
        self.assertEqual(res.status_code, 415, res.text)
        m.assert_not_called()

    def test_rejects_invalid_base64(self):
        self._login()
        payload = _payload()
        payload["audio_base64"] = "khong-phai-base64!!!"
        with patch.object(speech_module, "score_pronunciation") as m:
            res = self.client.post("/api/speech/pronunciation", json=payload)
        self.assertEqual(res.status_code, 400, res.text)
        m.assert_not_called()

    def test_oversized_base64_rejected_by_schema_422(self):
        """Trần schema chặn TRƯỚC endpoint — payload không vào nổi RAM handler."""
        self._login()
        payload = _payload()
        payload["audio_base64"] = "A" * 700_001
        res = self.client.post("/api/speech/pronunciation", json=payload)
        self.assertEqual(res.status_code, 422, res.text)

    def test_normalized_mime_is_passed_to_service(self):
        """Service nhận mime đã chuẩn hoá (bỏ tham số codec), không phải chuỗi thô."""
        self._login()
        payload = _payload(mime="audio/wav; codecs=1")
        with patch.object(
            speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)
        ) as m:
            res = self.client.post("/api/speech/pronunciation", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(m.call_args.kwargs["mime_type"], "audio/wav")

    # --- Hạn mức dùng chung ------------------------------------------------

    def test_shares_one_user_budget_with_chat(self):
        """Cùng bể key -> cùng hạn mức. Nếu tách suất thì siết /chat là vô nghĩa:
        chỉ cần đổi sang gọi /pronunciation là có thêm 30 lượt."""
        self._login("user-shared")
        limit = speech_module._chat_rate_limiter.max_hits
        with patch.object(
            speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)
        ):
            for _ in range(limit):
                res = self.client.post("/api/speech/pronunciation", json=_payload())
                self.assertEqual(res.status_code, 200, res.text)
        with patch.object(
            speech_module, "voice_chat", return_value={"user_text": "", "reply_cn": "好", "reply_vi": ""}
        ):
            over = self.client.post("/api/speech/chat", json={"text": "你好", "history": []})
        self.assertEqual(over.status_code, 429, over.text)

    def test_rate_limited_after_quota(self):
        self._login("user-heavy")
        limit = speech_module._chat_rate_limiter.max_hits
        with patch.object(
            speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)
        ):
            for _ in range(limit):
                self.assertEqual(
                    self.client.post("/api/speech/pronunciation", json=_payload()).status_code,
                    200,
                )
            over = self.client.post("/api/speech/pronunciation", json=_payload())
        self.assertEqual(over.status_code, 429, over.text)

    # --- Demo KHÔNG bị siết lây -------------------------------------------

    def test_demo_endpoint_stays_public(self):
        """Người chưa đăng nhập vẫn phải thử được demo trên trang chủ."""
        sid = next(iter(speech_module._DEMO_SENTENCES.keys()))
        payload = {
            "sentence_id": sid,
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
        }
        with patch.object(
            speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)
        ) as m:
            res = self.client.post(
                "/api/speech/demo-pronunciation",
                json=payload,
                headers={"x-forwarded-for": "203.0.113.9"},
            )
        self.assertEqual(res.status_code, 200, res.text)
        m.assert_called_once()


if __name__ == "__main__":
    unittest.main()
