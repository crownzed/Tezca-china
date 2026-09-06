"""Test cho trần thời gian ladder + tách câu cho stream hội thoại.

Chạy: cd backend && python -m pytest tests/test_speech_ladder.py

Phần ladder khoá đúng thứ gây treo UI trước đây: vòng lồng
``model × key × attempt`` KHÔNG có trần tổng thời gian. Với 3 model × 5 key × 2
attempt × 15s là 450s, và fly.toml không đặt trần request nào nên chuỗi đó chạy
hết thật. Ba thứ phải đúng, nếu không worst case quay lại:
  - chỉ MỘT model được thử (danh sách 3 model trùng lặp đã bỏ);
  - hết ngân sách -> raise ngay, không bước vào attempt kế;
  - timeout mỗi request bị kẹp theo ngân sách còn lại (attempt cuối không được
    phép chạy trọn 15s khi chỉ còn 2s).

Phần tách câu khoá điều kiện để TTS không bao giờ nhận nửa câu: đọc nửa câu rồi
nối nửa sau tạo chỗ ngắt sai chỗ, nghe tệ hơn chờ thêm vài trăm ms.
"""

import io
import time
import unittest
import urllib.error
from unittest.mock import patch

from app.services import speech_ai_service as svc


class LadderDeadlineTest(unittest.TestCase):
    def test_only_one_model_is_tried(self):
        """Danh sách 3 model làm ladder dài gấp 3 mà không cứu được ca lỗi nào:
        429/quota gắn với KEY (đã xoay ở vòng trong), 404 model-not-found thì
        model khác cùng key cũng vô nghĩa."""
        self.assertEqual(len(svc._CANDIDATE_MODELS), 1)
        self.assertEqual(svc._CANDIDATE_MODELS[0], svc.settings.gemini_native_model)

    def test_remaining_shrinks_and_expires(self):
        clock = svc._LadderDeadline(budget_sec=0.05)
        self.assertFalse(clock.expired())
        time.sleep(0.06)
        self.assertTrue(clock.expired())
        self.assertLess(clock.remaining, 0)

    def test_timeout_is_clamped_to_remaining_budget(self):
        """Không kẹp thì attempt bắt đầu khi còn 2s vẫn chạy được 15s — deadline bị
        vượt đúng ở attempt cuối, chỗ khó thấy nhất."""
        clock = svc._LadderDeadline(budget_sec=3.0)
        self.assertLessEqual(clock.timeout_for(15), 3)
        # Sàn 1s: urllib không nhận timeout <= 0.
        expired = svc._LadderDeadline(budget_sec=0.0)
        self.assertEqual(expired.timeout_for(15), 1)

    def test_stops_calling_once_budget_is_gone(self):
        """Ngân sách cạn -> raise, KHÔNG thử tiếp key còn lại."""
        calls = []

        def slow_post(url, payload, timeout):
            calls.append(timeout)
            raise urllib.error.HTTPError(url, 503, "unavailable", {}, io.BytesIO(b"{}"))

        with patch.object(svc.settings, "gemini_native_api_keys", "k1,k2,k3,k4,k5"):
            with patch.object(svc, "_post", side_effect=slow_post):
                with patch.object(svc, "_RETRY_BACKOFF_SEC", (0.0, 0.0)):
                    clock = svc._LadderDeadline(budget_sec=0.0)
                    with self.assertRaises(RuntimeError):
                        svc._call_native_gemini([{"text": "x"}], deadline=clock)
        self.assertEqual(calls, [], "hết ngân sách thì không được gọi provider lần nào")

    def test_error_message_names_the_budget(self):
        with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
            with patch.object(svc, "_post", side_effect=AssertionError("không được gọi")):
                clock = svc._LadderDeadline(budget_sec=0.0)
                with self.assertRaises(RuntimeError) as ctx:
                    svc._call_native_gemini([{"text": "x"}], deadline=clock)
        self.assertIn("ngân sách", str(ctx.exception))

    def test_backoff_runs_between_retries_on_429(self):
        """Retry tức thì với 429 gần như vô nghĩa: 429 nghĩa là đang quá hạn mức."""
        sleeps = []

        def fake_post(url, payload, timeout):
            raise urllib.error.HTTPError(url, 429, "rate", {}, io.BytesIO(b"{}"))

        with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
            with patch.object(svc, "_post", side_effect=fake_post):
                with patch.object(svc.time, "sleep", side_effect=sleeps.append):
                    with self.assertRaises(RuntimeError):
                        svc._call_native_gemini([{"text": "x"}])
        self.assertEqual(sleeps, [svc._RETRY_BACKOFF_SEC[0]])

    def test_no_backoff_on_auth_error(self):
        """401/403 là lỗi key, chờ không giúp gì — phải sang key kế ngay."""
        sleeps = []

        def fake_post(url, payload, timeout):
            raise urllib.error.HTTPError(url, 401, "bad key", {}, io.BytesIO(b"{}"))

        with patch.object(svc.settings, "gemini_native_api_keys", "k1,k2"):
            with patch.object(svc, "_post", side_effect=fake_post):
                with patch.object(svc.time, "sleep", side_effect=sleeps.append):
                    with self.assertRaises(RuntimeError):
                        svc._call_native_gemini([{"text": "x"}])
        self.assertEqual(sleeps, [])

    def test_backoff_never_exceeds_remaining_budget(self):
        sleeps = []

        def fake_post(url, payload, timeout):
            raise urllib.error.HTTPError(url, 503, "unavailable", {}, io.BytesIO(b"{}"))

        with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
            with patch.object(svc, "_post", side_effect=fake_post):
                with patch.object(svc.time, "sleep", side_effect=sleeps.append):
                    with self.assertRaises(RuntimeError):
                        svc._call_native_gemini(
                            [{"text": "x"}], deadline=svc._LadderDeadline(budget_sec=0.2)
                        )
        for pause in sleeps:
            self.assertLessEqual(pause, 0.2)

    def test_successful_call_returns_text(self):
        with patch.object(svc.settings, "gemini_native_api_keys", "k1"):
            with patch.object(
                svc,
                "_post",
                return_value={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            ):
                self.assertEqual(svc._call_native_gemini([{"text": "x"}]), "ok")

    def test_default_budget_leaves_room_for_two_full_attempts(self):
        """35s = 2 attempt trọn 15s + chỗ báo lỗi. Nếu ai hạ xuống dưới 30s thì
        key thứ hai không bao giờ được thử hết."""
        self.assertGreaterEqual(svc.LADDER_DEADLINE_SEC, 2 * svc.TIMEOUT)


class SentenceSplitTest(unittest.TestCase):
    def test_only_complete_sentences_are_returned(self):
        sentences, consumed = svc._split_complete_sentences("我很好。你呢")
        self.assertEqual(sentences, ["我很好。"])
        self.assertEqual(consumed, len("我很好。"))

    def test_multiple_sentences_in_one_chunk(self):
        sentences, consumed = svc._split_complete_sentences("你好！你好吗？很好。")
        self.assertEqual(sentences, ["你好！", "你好吗？", "很好。"])
        self.assertEqual(consumed, len("你好！你好吗？很好。"))

    def test_no_ending_yields_nothing(self):
        sentences, consumed = svc._split_complete_sentences("我正在说")
        self.assertEqual(sentences, [])
        self.assertEqual(consumed, 0)

    def test_closing_quote_stays_with_its_sentence(self):
        """Dấu đóng đi SAU dấu kết vẫn thuộc câu đó, không rơi sang câu sau."""
        sentences, _ = svc._split_complete_sentences("他说：“你好。”我笑了。")
        self.assertEqual(sentences[0], "他说：“你好。”")

    def test_newline_ends_a_sentence(self):
        """Model xuống dòng giữa REPLY_CN và REPLY_VI — dấu đó chốt câu cuối."""
        sentences, _ = svc._split_complete_sentences("我很好\n")
        self.assertEqual(sentences, ["我很好"])

    def test_strips_partial_reply_vi_marker(self):
        """Stream dừng giữa lúc model viết nhãn: "REPLY_V" không được vào TTS."""
        self.assertEqual(svc._strip_partial_marker("我很好。REPLY_V"), "我很好。")
        self.assertEqual(svc._strip_partial_marker("我很好。R"), "我很好。")
        self.assertEqual(svc._strip_partial_marker("我很好。"), "我很好。")


if __name__ == "__main__":
    unittest.main()
