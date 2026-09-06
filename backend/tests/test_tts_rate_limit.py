"""Test cho rate-limit theo IP trên /tts và /tts/feedback.

Chạy: cd backend && python -m pytest tests/test_tts_rate_limit.py

Hai endpoint này tiêu quota ba provider TRẢ TIỀN (StepFun, Gemini, ElevenLabs) mà
không có auth — thẻ ``<audio src>`` không gửi được header Authorization, nên IP là
khoá thực tế duy nhất còn lại.

Điểm dễ vỡ nhất và là lý do file này tồn tại: ``scripts/generate-audio.mjs`` gọi
``/tts`` hàng nghìn lượt từ 127.0.0.1 để dựng kho MP3 tĩnh. Bất kỳ hạn mức hợp lý
nào cho người dùng thật cũng sẽ chặn chết nó, nên phải có miễn trừ loopback — và
miễn trừ đó phải dựa trên PEER TCP thật, không dựa trên header, nếu không ai gửi
``X-Forwarded-For: 127.0.0.1`` cũng được miễn.
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import tts as tts_module
from app.routers.tts import router as tts_router
from app.services import tts_cache

_FAKE_MP3 = b"ID3" + b"\x00" * 900


class TtsRateLimitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        # client_host bất kỳ KHÁC loopback: TestClient mặc định "testclient",
        # nhưng khai rõ để test không phụ thuộc mặc định của thư viện.
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()

    def _get(self, text: str, ip: str | None = None):
        headers = {"x-forwarded-for": ip} if ip else {}
        return self.client.get("/tts", params={"text": text}, headers=headers)

    def test_blocks_after_limit_for_one_ip(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                # Text khác nhau mỗi lượt: cache hit KHÔNG được tính là bỏ qua
                # rate-limit, nhưng ở đây ta muốn chắc chắn từng lượt đều đếm.
                for i in range(limit):
                    res = self._get(f"你好{i}", ip="198.51.100.5")
                    self.assertEqual(res.status_code, 200, res.text)
                over = self._get("再见", ip="198.51.100.5")
        self.assertEqual(over.status_code, 429, over.text)
        self.assertEqual(over.headers.get("Retry-After"), "30")

    def test_other_ip_is_not_blocked(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                for i in range(limit):
                    self._get(f"你好{i}", ip="198.51.100.5")
                other = self._get("你好", ip="198.51.100.9")
        self.assertEqual(other.status_code, 200, other.text)

    def test_cache_hit_still_counts_against_the_limit(self):
        """Nếu cache hit bỏ qua limiter thì một vòng lặp trên MỘT chữ là vô hạn."""
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                for _ in range(limit):
                    res = self._get("你好", ip="198.51.100.6")
                    self.assertEqual(res.status_code, 200, res.text)
                over = self._get("你好", ip="198.51.100.6")
        self.assertEqual(over.status_code, 429, over.text)

    def test_feedback_endpoint_is_limited_too(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module, "_elevenlabs_synth", return_value=_FAKE_MP3):
            for i in range(limit):
                res = self.client.get(
                    "/tts/feedback",
                    params={"text": f"Gợi ý {i}"},
                    headers={"x-forwarded-for": "198.51.100.7"},
                )
                self.assertEqual(res.status_code, 200, res.text)
            over = self.client.get(
                "/tts/feedback",
                params={"text": "Gợi ý cuối"},
                headers={"x-forwarded-for": "198.51.100.7"},
            )
        self.assertEqual(over.status_code, 429, over.text)

    def test_forwarded_header_cannot_forge_loopback_exemption(self):
        """Miễn trừ phải theo PEER TCP, không theo header.

        Nếu đọc từ ``X-Forwarded-For`` thì ai gửi ``127.0.0.1`` cũng được miễn —
        tức rate-limit thành trang trí.
        """
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                for i in range(limit):
                    res = self._get(f"你好{i}", ip="127.0.0.1")
                    self.assertEqual(res.status_code, 200, res.text)
                over = self._get("再见", ip="127.0.0.1")
        self.assertEqual(over.status_code, 429, over.text)

    def test_fly_client_ip_wins_over_forwarded_for(self):
        """Fly Proxy tự đặt ``Fly-Client-IP`` và ghi đè giá trị client gửi, nên nó
        là nguồn duy nhất không giả mạo được. Kẻ xoay vòng X-Forwarded-For vẫn
        phải dồn vào cùng một khoá."""
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                for i in range(limit):
                    res = self.client.get(
                        "/tts",
                        params={"text": f"你好{i}"},
                        headers={
                            "fly-client-ip": "198.51.100.20",
                            "x-forwarded-for": f"10.0.0.{i % 250}",  # đổi mỗi lượt
                        },
                    )
                    self.assertEqual(res.status_code, 200, res.text)
                over = self.client.get(
                    "/tts",
                    params={"text": "再见"},
                    headers={
                        "fly-client-ip": "198.51.100.20",
                        "x-forwarded-for": "10.0.0.251",
                    },
                )
        self.assertEqual(over.status_code, 429, over.text)


class TtsLoopbackExemptionTest(unittest.TestCase):
    """Peer TCP là loopback -> miễn trừ, để generate-audio.mjs chạy được."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app, client=("127.0.0.1", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()

    def test_local_audio_builder_is_never_limited(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                for i in range(limit + 5):
                    res = self.client.get(
                        "/tts", params={"text": f"从{i}", "no_gemini": 1, "key_index": i % 3}
                    )
                    self.assertEqual(res.status_code, 200, res.text)


if __name__ == "__main__":
    unittest.main()
