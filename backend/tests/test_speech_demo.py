"""Test cho demo phát âm công khai: POST /api/speech/demo-pronunciation.

Chạy: cd backend && python -m pytest tests/test_speech_demo.py

Khóa hành vi của endpoint CÔNG KHAI (không auth) trên hero trang chủ:
  - request hợp lệ trả 200 kèm contour + score (score_pronunciation được mock để
    KHÔNG gọi Gemini/DSP thật);
  - audio quá lớn (>500KB) hoặc quá dài (>8s) trả 413;
  - mime ngoài whitelist trả 415;
  - sentence_id không có trong tập cố định trả 404;
  - vượt rate limit theo IP trả 429.

Không chạm DB, không mạng: chỉ dựng router speech vào FastAPI rỗng và patch
score_pronunciation. Rate limiter là global module nên reset ở setUp và tách IP
theo từng ca để không rò lượt sang nhau.
"""

import base64
import io
import struct
import unittest
import wave
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

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


# Kết quả chấm điểm giả — hình dạng đúng như score_pronunciation thật trả về,
# đủ field bắt buộc của PronunciationScoreOut + contour để frontend vẽ pitch chart.
_FAKE_SCORE = {
    "score": 82,
    "base_score": 85,
    "identity_score": 88,
    "tone_accuracy": 0.8,
    "target_hanzi": "你好",
    "target_pinyin": "nǐ hǎo",
    "actual_hanzi": "你好",
    "actual_pinyin": "nǐ hǎo",
    "tone_errors": [],
    "syllable_errors": [],
    "tone_syllables": [],
    "user_f0_contour": [120.0, 130.0, 0.0, 140.0, 150.0],
    "fluency": None,
    "prosody": None,
    "detailed_feedback": "",
    "macro_feedback": "",
    "tip": "Phát âm tốt, giữ nhịp như vậy.",
}


class DemoPronunciationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(speech_router)
        cls.client = TestClient(app)
        # Một sentence_id chắc chắn tồn tại trong tập cố định.
        cls.sid = next(iter(speech_module._DEMO_SENTENCES.keys()))

    def setUp(self):
        # Reset limiter global trước mỗi ca để lượt không rò sang nhau.
        speech_module._demo_rate_limiter._hits.clear()

    def _post(self, payload: dict, ip: str):
        return self.client.post(
            "/api/speech/demo-pronunciation",
            json=payload,
            headers={"x-forwarded-for": ip},
        )

    def test_demo_sentence_returns_fixed_sample(self):
        res = self.client.get("/api/speech/demo-sentence")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertIn(body["id"], speech_module._DEMO_SENTENCES)
        self.assertTrue(body["hanzi"])

    def test_valid_request_returns_score_and_contour(self):
        payload = {
            "sentence_id": self.sid,
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
        }
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)) as m:
            res = self._post(payload, "10.0.0.1")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["score"], 82)
        self.assertEqual(body["user_f0_contour"], [120.0, 130.0, 0.0, 140.0, 150.0])
        # Server phải tra câu theo id, KHÔNG nhận target từ client.
        _, kwargs = m.call_args
        self.assertEqual(kwargs["target_hanzi"], speech_module._DEMO_SENTENCES[self.sid]["hanzi"])

    def test_unknown_sentence_id_returns_404(self):
        payload = {
            "sentence_id": "khong-ton-tai",
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
        }
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)):
            res = self._post(payload, "10.0.0.2")
        self.assertEqual(res.status_code, 404, res.text)

    def test_bad_mime_returns_415(self):
        payload = {
            "sentence_id": self.sid,
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/mp3",
        }
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)):
            res = self._post(payload, "10.0.0.3")
        self.assertEqual(res.status_code, 415, res.text)

    def test_audio_too_long_returns_413(self):
        payload = {
            "sentence_id": self.sid,
            "audio_base64": _b64(_make_wav(9.0)),  # >8s, vẫn <500KB ở 8kHz
            "mime_type": "audio/wav",
        }
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)):
            res = self._post(payload, "10.0.0.4")
        self.assertEqual(res.status_code, 413, res.text)

    def test_audio_too_large_returns_413(self):
        # >500KB byte thật nhưng base64 vẫn dưới ngưỡng schema (700k ký tự).
        raw = b"\x00" * 515000
        payload = {
            "sentence_id": self.sid,
            "audio_base64": _b64(raw),
            "mime_type": "audio/wav",
        }
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)):
            res = self._post(payload, "10.0.0.5")
        self.assertEqual(res.status_code, 413, res.text)

    def test_rate_limit_returns_429_after_three_hits(self):
        payload = {
            "sentence_id": self.sid,
            "audio_base64": _b64(_make_wav(1.0)),
            "mime_type": "audio/wav",
        }
        ip = "10.0.0.6"
        with patch.object(speech_module, "score_pronunciation", return_value=dict(_FAKE_SCORE)):
            for _ in range(3):
                self.assertEqual(self._post(payload, ip).status_code, 200)
            res = self._post(payload, ip)
        self.assertEqual(res.status_code, 429, res.text)

    def test_oversized_base64_rejected_by_schema_422(self):
        # Vượt max_length của schema (700k) → 422 trước khi vào endpoint.
        payload = {
            "sentence_id": self.sid,
            "audio_base64": "A" * 700_001,
            "mime_type": "audio/wav",
        }
        res = self._post(payload, "10.0.0.7")
        self.assertEqual(res.status_code, 422, res.text)


if __name__ == "__main__":
    unittest.main()
