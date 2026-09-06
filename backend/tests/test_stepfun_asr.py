"""Test cho StepFun ASR (_stepfun_asr) + fallback Gemini trong transcribe_speech.

Chạy: cd backend && python -m pytest tests/test_stepfun_asr.py

Khoá hai điều:

1. Parsing SSE đúng: ``transcript.text.delta`` cộng dồn, ``transcript.text.done``
   là bản chốt, ``error`` phải ném. Nếu ghép sai thì lời người học bị mất chữ mà
   không ai thấy — chỉ lộ ra dưới dạng "AI trả lời không liên quan".

2. Fallback về Gemini thật sự chạy. Đây là điểm cố ý KHÔNG làm theo báo cáo (báo
   cáo đề nghị thay hẳn): hiện chỉ có MỘT key Step Plan, không xoay vòng được khi
   nó 429/hỏng, còn GEMINI_NATIVE_API_KEYS có năm. Nếu fallback vỡ thì một lỗi
   StepFun là mất luôn tính năng nói.

Không mạng: ``urlopen`` bị patch để trả stream SSE giả.
"""

import io
import unittest
import urllib.error
from unittest.mock import patch

from app.services import speech_ai_service as svc


def _sse_stream(*blocks: str) -> io.BytesIO:
    """Stream SSE giả. Mỗi block là một dòng ``data: {...}``, phân cách dòng trống."""
    body = "".join(f"data: {block}\n\n" for block in blocks)
    return io.BytesIO(body.encode("utf-8"))


class _FakeResponse:
    """Context manager tối thiểu, iterate theo DÒNG như urlopen thật."""

    def __init__(self, stream: io.BytesIO) -> None:
        self._stream = stream

    def __enter__(self):
        return self._stream

    def __exit__(self, *exc):
        return False


class StepfunAsrParsingTest(unittest.TestCase):
    def setUp(self):
        # ``stepfun_keys_list`` đọc từ đây; một key là đủ cho mọi ca parsing.
        self._patcher = patch.object(svc.settings, "stepfun_api_keys", "fake-key")
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def _run(self, *blocks: str, mime: str = "audio/wav") -> str:
        with patch.object(
            svc.urllib.request, "urlopen", return_value=_FakeResponse(_sse_stream(*blocks))
        ):
            return svc._stepfun_asr("Zm9v", mime)

    def test_joins_deltas(self):
        text = self._run(
            '{"type":"transcript.text.delta","delta":"我"}',
            '{"type":"transcript.text.delta","delta":"想"}',
            '{"type":"transcript.text.delta","delta":"喝茶"}',
        )
        self.assertEqual(text, "我想喝茶")

    def test_done_event_wins_over_accumulated_deltas(self):
        """``done.text`` là bản chốt của server (đã qua ITN) nên phải thắng."""
        text = self._run(
            '{"type":"transcript.text.delta","delta":"二零"}',
            '{"type":"transcript.text.done","text":"20年"}',
        )
        self.assertEqual(text, "20年")

    def test_falls_back_to_deltas_when_done_has_no_text(self):
        """Kết nối đứt/`done` rỗng: phần đã nghe được vẫn dùng, hơn là mất cả lượt."""
        text = self._run(
            '{"type":"transcript.text.delta","delta":"你好"}',
            '{"type":"transcript.text.done","text":""}',
        )
        self.assertEqual(text, "你好")

    def test_ignores_unknown_events_and_malformed_lines(self):
        text = self._run(
            '{"type":"session.created"}',
            "khong-phai-json",
            '{"type":"transcript.text.delta","delta":"好"}',
        )
        self.assertEqual(text, "好")

    def test_error_event_raises(self):
        with self.assertRaises(RuntimeError):
            self._run('{"type":"error","message":"quota exceeded"}')

    def test_unsupported_mime_raises(self):
        with self.assertRaises(RuntimeError):
            self._run('{"type":"transcript.text.done","text":"x"}', mime="audio/aac")

    def test_wav_mime_maps_to_wav_format(self):
        """Client gửi WAV 16kHz mono; chỉ khai ``format.type``, không khai rate/bits."""
        captured = {}

        def fake_urlopen(req, timeout=None):
            captured["body"] = req.data
            captured["headers"] = {k.lower(): v for k, v in req.headers.items()}
            captured["url"] = req.full_url
            return _FakeResponse(_sse_stream('{"type":"transcript.text.done","text":"你好"}'))

        with patch.object(svc.urllib.request, "urlopen", side_effect=fake_urlopen):
            svc._stepfun_asr("Zm9v", "audio/wav")

        import json

        body = json.loads(captured["body"].decode("utf-8"))
        fmt = body["audio"]["input"]["format"]
        self.assertEqual(fmt, {"type": "wav"})
        self.assertEqual(body["audio"]["data"], "Zm9v")
        transcription = body["audio"]["input"]["transcription"]
        self.assertEqual(transcription["model"], svc.settings.stepfun_asr_model)
        self.assertEqual(transcription["language"], "zh")
        # SSE bắt buộc: thiếu Accept thì server trả JSON một lần, parser sẽ rỗng.
        self.assertEqual(captured["headers"]["accept"], "text/event-stream")
        self.assertTrue(captured["headers"]["authorization"].startswith("Bearer "))
        # Path /step_plan/v1 là bắt buộc trên key Step Plan hiện tại.
        self.assertIn("/step_plan/v1/audio/asr/sse", captured["url"])

    def test_rotates_to_next_key_on_http_error(self):
        with patch.object(svc.settings, "stepfun_api_keys", "key-a,key-b"):
            calls = []

            def fake_urlopen(req, timeout=None):
                calls.append(req.headers.get("Authorization"))
                if len(calls) == 1:
                    raise urllib.error.HTTPError(req.full_url, 429, "rate", {}, io.BytesIO(b"{}"))
                return _FakeResponse(_sse_stream('{"type":"transcript.text.done","text":"好"}'))

            with patch.object(svc.urllib.request, "urlopen", side_effect=fake_urlopen):
                self.assertEqual(svc._stepfun_asr("Zm9v", "audio/wav"), "好")
            self.assertEqual(len(calls), 2)
            self.assertNotEqual(calls[0], calls[1])

    def test_raises_when_all_keys_fail(self):
        def fake_urlopen(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 500, "boom", {}, io.BytesIO(b"{}"))

        with patch.object(svc.urllib.request, "urlopen", side_effect=fake_urlopen):
            with self.assertRaises(RuntimeError):
                svc._stepfun_asr("Zm9v", "audio/wav")


class TranscribeSpeechFallbackTest(unittest.TestCase):
    def test_uses_stepfun_when_available(self):
        with patch.object(svc.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(svc, "_stepfun_asr", return_value="我想喝茶") as asr:
                with patch.object(svc, "_call_native_gemini") as gemini:
                    text = svc.transcribe_speech("Zm9v", "audio/wav")
        self.assertEqual(text, "我想喝茶")
        asr.assert_called_once()
        gemini.assert_not_called()

    def test_falls_back_to_gemini_when_stepfun_raises(self):
        with patch.object(svc.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(svc, "_stepfun_asr", side_effect=RuntimeError("StepFun down")):
                with patch.object(
                    svc, "_call_native_gemini", return_value='{"user_text":"你好"}'
                ) as gemini:
                    text = svc.transcribe_speech("Zm9v", "audio/wav")
        self.assertEqual(text, "你好")
        gemini.assert_called_once()

    def test_falls_back_to_gemini_when_stepfun_returns_empty(self):
        """Chuỗi rỗng không phải lỗi nhưng cũng không dùng được -> vẫn phải fallback."""
        with patch.object(svc.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(svc, "_stepfun_asr", return_value=""):
                with patch.object(
                    svc, "_call_native_gemini", return_value='{"user_text":"你好"}'
                ) as gemini:
                    text = svc.transcribe_speech("Zm9v", "audio/wav")
        self.assertEqual(text, "你好")
        gemini.assert_called_once()

    def test_skips_stepfun_when_no_key(self):
        with patch.object(svc.settings, "stepfun_api_keys", ""):
            with patch.object(svc, "_stepfun_asr") as asr:
                with patch.object(
                    svc, "_call_native_gemini", return_value='{"user_text":"你好"}'
                ):
                    self.assertEqual(svc.transcribe_speech("Zm9v", "audio/wav"), "你好")
        asr.assert_not_called()

    def test_raises_when_both_providers_fail(self):
        with patch.object(svc.settings, "stepfun_api_keys", "fake-key"):
            with patch.object(svc, "_stepfun_asr", side_effect=RuntimeError("down")):
                with patch.object(
                    svc, "_call_native_gemini", return_value='{"user_text":""}'
                ):
                    with self.assertRaises(RuntimeError):
                        svc.transcribe_speech("Zm9v", "audio/wav")


if __name__ == "__main__":
    unittest.main()
