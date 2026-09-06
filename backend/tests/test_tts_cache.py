"""Test cho cache TTS server-side (backend/app/services/tts_cache.py + /tts).

Chạy: cd backend && python -m pytest tests/test_tts_cache.py

Khoá đúng thứ cache tồn tại để làm: cùng một chữ chỉ tốn tiền provider MỘT lần.
Không có nó, hai người học bấm "Nghe mẫu" cùng một từ là hai lần trả tiền, và
trong một buổi học cùng một từ được đọc lại rất nhiều lần (flashcard lặp, quiz
cùng bộ từ, SRS ôn lại).

Các ca khoá:
  - gọi hai lần cùng text -> provider chỉ được gọi MỘT lần, lần hai trả đúng
    bytes cũ và đúng media_type;
  - text khác -> khoá khác, provider được gọi lại;
  - ``no_gemini`` vào khoá (đổi provider = đổi giọng), ``key_index`` thì KHÔNG
    (chỉ chọn key trong cùng provider);
  - LRU đẩy entry cũ nhất khi vượt trần byte;
  - clip lớn bất thường không được vào cache;
  - /tts/feedback cũng được cache;
  - provider lỗi -> KHÔNG cache lỗi (lần sau vẫn thử lại).
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import tts as tts_module
from app.routers.tts import router as tts_router
from app.services import tts_cache

# MP3 giả: đủ dài để _is_mp3 nhận (cần > 500 byte) và bắt đầu bằng ID3.
_FAKE_MP3 = b"ID3" + b"\x00" * 900
_OTHER_MP3 = b"ID3" + b"\x11" * 900


class TtsCacheUnitTest(unittest.TestCase):
    """Tầng cache thuần, không qua HTTP."""

    def setUp(self):
        tts_cache.clear()

    def test_roundtrip(self):
        key = tts_cache.cache_key("你好", voice="a")
        self.assertIsNone(tts_cache.get(key))
        tts_cache.put(key, _FAKE_MP3, "audio/mpeg")
        self.assertEqual(tts_cache.get(key), (_FAKE_MP3, "audio/mpeg"))

    def test_key_ignores_nothing_relevant(self):
        """Tham số khác nhau -> khoá khác nhau; cùng tham số -> cùng khoá."""
        a = tts_cache.cache_key("你好", voice="x", speed=0.9)
        b = tts_cache.cache_key("你好", speed=0.9, voice="x")  # thứ tự không đổi khoá
        c = tts_cache.cache_key("你好", voice="y", speed=0.9)
        d = tts_cache.cache_key("再见", voice="x", speed=0.9)
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertNotEqual(a, d)

    def test_evicts_oldest_when_over_byte_cap(self):
        """Trần theo BYTE, không theo số entry: máy fly chỉ có 512MB."""
        entry = b"x" * 1024
        with patch.object(tts_cache, "MAX_CACHE_BYTES", 3 * 1024):
            for i in range(3):
                tts_cache.put(f"k{i}", entry, "audio/mpeg")
            self.assertIsNotNone(tts_cache.get("k0"))
            # k0 vừa được get -> thành mới nhất; entry thứ 4 phải đẩy k1 ra.
            tts_cache.put("k3", entry, "audio/mpeg")
            self.assertIsNone(tts_cache.get("k1"))
            self.assertIsNotNone(tts_cache.get("k0"))
            self.assertIsNotNone(tts_cache.get("k3"))

    def test_refuses_oversized_entry(self):
        """Một entry khổng lồ sẽ đẩy hết phần còn lại ra -> không nhận."""
        huge = b"x" * (tts_cache.MAX_ENTRY_BYTES + 1)
        tts_cache.put("huge", huge, "audio/mpeg")
        self.assertIsNone(tts_cache.get("huge"))

    def test_refuses_empty_entry(self):
        tts_cache.put("empty", b"", "audio/mpeg")
        self.assertIsNone(tts_cache.get("empty"))


class TtsEndpointCacheTest(unittest.TestCase):
    """Cache nhìn từ HTTP: provider được gọi bao nhiêu lần."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app)

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()

    def test_second_call_does_not_touch_provider(self):
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                first = self.client.get("/tts", params={"text": "你好"})
                second = self.client.get("/tts", params={"text": "你好"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.content, _FAKE_MP3)
        self.assertEqual(second.content, _FAKE_MP3)
        self.assertEqual(second.headers["content-type"], "audio/mpeg")
        m.assert_called_once()

    def test_different_text_calls_provider_again(self):
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                self.client.get("/tts", params={"text": "你好"})
                self.client.get("/tts", params={"text": "再见"})
        self.assertEqual(m.call_count, 2)

    def test_key_index_shares_one_cache_entry(self):
        """key_index chỉ chọn key trong cùng provider/voice -> bytes như nhau.

        Nếu nó vào khoá thì 3 worker của generate-audio.mjs mỗi worker một cache
        riêng, mất trắng phần chia sẻ.
        """
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                self.client.get("/tts", params={"text": "你好", "key_index": 0})
                self.client.get("/tts", params={"text": "你好", "key_index": 2})
        m.assert_called_once()

    def test_no_gemini_is_part_of_the_key(self):
        """no_gemini đổi provider phục vụ khi StepFun tắt -> đổi giọng thật."""
        with patch.object(tts_module.settings, "stepfun_api_keys", ""):
            with patch.object(tts_module.settings, "gemini_native_api_keys", ""):
                with patch.object(
                    tts_module, "_elevenlabs_synth", return_value=_FAKE_MP3
                ) as eleven:
                    ok = self.client.get("/tts", params={"text": "你好", "no_gemini": 1})
                    self.assertEqual(ok.status_code, 200, ok.text)
                    # Không có key Gemini -> nhánh no_gemini=0 trả 503, và 503 thì
                    # không có bytes nào để cache.
                    other = self.client.get("/tts", params={"text": "你好"})
        self.assertEqual(other.status_code, 503, other.text)
        eleven.assert_called_once()

    def test_feedback_endpoint_is_cached(self):
        with patch.object(tts_module, "_elevenlabs_synth", return_value=_FAKE_MP3) as m:
            first = self.client.get("/tts/feedback", params={"text": "Giữ thanh 3 sâu hơn."})
            second = self.client.get("/tts/feedback", params={"text": "Giữ thanh 3 sâu hơn."})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.content, _FAKE_MP3)
        m.assert_called_once()

    def test_feedback_and_tts_do_not_share_entries(self):
        """Cùng text nhưng hai endpoint đọc bằng giọng khác nhau (VI vs CN)."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3):
                with patch.object(
                    tts_module, "_elevenlabs_synth", return_value=_OTHER_MP3
                ):
                    cn = self.client.get("/tts", params={"text": "你好"})
                    vi = self.client.get("/tts/feedback", params={"text": "你好"})
        self.assertEqual(cn.content, _FAKE_MP3)
        self.assertEqual(vi.content, _OTHER_MP3)

    def test_provider_failure_is_not_cached(self):
        """Cache lỗi sẽ khoá chết một chữ trong cả phiên -> chỉ cache thành công."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=None):
                with patch.object(tts_module, "_elevenlabs_synth", return_value=None):
                    fail = self.client.get("/tts", params={"text": "你好", "no_gemini": 1})
            self.assertEqual(fail.status_code, 429, fail.text)
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                ok = self.client.get("/tts", params={"text": "你好", "no_gemini": 1})
        self.assertEqual(ok.status_code, 200, ok.text)
        m.assert_called_once()

    def test_speed_is_part_of_the_key_and_forwarded(self):
        """Tốc độ đổi bytes thật (0.72 -> 340ms/chữ, 0.95 -> 202, đo trên key thật),
        nên phải vào khoá. Không có thì đổi tốc độ vẫn nghe bản đọc cũ."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                self.client.get("/tts", params={"text": "你好", "speed": 0.72})
                self.client.get("/tts", params={"text": "你好", "speed": 0.95})
                self.client.get("/tts", params={"text": "你好", "speed": 0.72})
        self.assertEqual(m.call_count, 2, "lượt thứ ba phải trúng cache")
        self.assertEqual([c.kwargs["speed"] for c in m.call_args_list], [0.72, 0.95])

    def test_clamped_speed_shares_one_cache_entry(self):
        """``speed=9`` kẹp về MAX_SPEED, nên hai request phải dùng CÙNG khoá.

        Nếu khoá dùng tham số thô còn provider dùng giá trị đã kẹp thì mỗi giá trị
        ngoài dải là một cache miss vĩnh viễn cho cùng một audio.
        """
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                self.client.get("/tts", params={"text": "你好", "speed": 9})
                self.client.get(
                    "/tts", params={"text": "你好", "speed": tts_module.MAX_SPEED}
                )
        m.assert_called_once()
        self.assertEqual(m.call_args.kwargs["speed"], tts_module.MAX_SPEED)

    def test_omitted_speed_uses_the_configured_default(self):
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(tts_module, "_stepfun_synth", return_value=_FAKE_MP3) as m:
                self.client.get("/tts", params={"text": "你好"})
        self.assertEqual(
            m.call_args.kwargs["speed"], tts_module.settings.stepfun_tts_speed
        )


if __name__ == "__main__":
    unittest.main()
