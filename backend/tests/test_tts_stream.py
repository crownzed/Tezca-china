"""Test cho /tts/stream — TTS theo khối qua StepFun WebSocket.

Chạy: cd backend && python -m pytest tests/test_tts_stream.py

Endpoint này tồn tại vì một lý do duy nhất: byte MP3 đầu tiên về sớm (đo thật
0.65s so với 2.5s của /tts). Mọi thứ dưới đây khoá đúng các điều kiện để lợi ích
đó không âm thầm biến mất:

  - khối phải nối theo ĐÚNG thứ tự đến. ``mp3_stream`` không phải chuỗi file độc
    lập; đảo thứ tự là file hỏng, và lỗi đó chỉ nghe ra chứ không crash.
  - cache hit KHÔNG được mở socket. Không có test này thì một refactor đặt cache
    sau ``connect()`` vẫn xanh trong khi mỗi lượt lặp lại tốn 0.94s handshake và
    một suất quota.
  - socket lỗi TRƯỚC khi phát khối nào -> rơi về ``_stepfun_synth`` (HTTP). Cuộc
    gọi không được đứt vì một hiccup của provider.
  - socket lỗi SAU khi đã phát -> dừng, KHÔNG chắp thêm audio từ nguồn khác. Nối
    MP3 của hai lần tổng hợp khác nhau nghe như nhảy tiếng.
  - rate-limit theo IP vẫn áp; miễn trừ loopback vẫn còn cho generate-audio.mjs.
"""

import base64
import json
import time
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import tts as tts_module
from app.routers.tts import router as tts_router
from app.services import tts_cache, tts_socket_pool

# Khối MP3 giả. Khối đầu mang header ID3 để giống luồng thật; các khối sau là
# payload trần — đúng cách mp3_stream hoạt động.
_CHUNKS = [b"ID3" + b"\x01" * 300, b"\x02" * 300, b"\x03" * 300]
_JOINED = b"".join(_CHUNKS)
_HTTP_MP3 = b"ID3" + b"\xff" * 900  # bytes của nhánh HTTP, khác _JOINED để phân biệt


class _FakeSocket:
    """Giả socket StepFun TTS: phát greeting, created, rồi các khối audio.

    ``fail_after`` = số khối phát được trước khi ném, để dựng hai ca lỗi khác
    nhau (chưa phát gì / đã phát một phần).
    """

    def __init__(self, chunks=None, fail_after=None, error_event=False):
        self.sent = []
        self.closed = 0
        self._fail_after = fail_after
        self._chunks = list(_CHUNKS if chunks is None else chunks)
        self._outbox = [
            json.dumps({"type": "tts.connection.done", "data": {"session_id": "sid-1"}}),
            json.dumps({"type": "tts.response.created", "data": {"session_id": "sid-1"}}),
        ]
        for chunk in self._chunks:
            self._outbox.append(json.dumps({
                "type": "tts.response.audio.delta",
                "data": {"status": "unfinished", "audio": base64.b64encode(chunk).decode()},
            }))
        if error_event:
            self._outbox.append(json.dumps({
                "type": "tts.response.error",
                "data": {"code": "500", "message": "engine overloaded"},
            }))
        else:
            self._outbox.append(json.dumps({
                "type": "tts.response.audio.done", "data": {"session_id": "sid-1"},
            }))
        self._delivered_audio = 0

    def send(self, payload):
        self.sent.append(json.loads(payload))

    def recv(self, timeout=None):
        if not self._outbox:
            raise AssertionError("test đọc quá số event đã dựng")
        item = self._outbox.pop(0)
        if json.loads(item).get("type") == "tts.response.audio.delta":
            self._delivered_audio += 1
            if self._fail_after is not None and self._delivered_audio > self._fail_after:
                raise OSError("socket chết giữa stream")
        return item

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def close(self):
        self.closed += 1


def _connect_returning(socket):
    """Thay cho ``websockets.sync.client.connect``, ghi lại số lần được gọi."""
    calls = []

    def fake_connect(url, **kwargs):
        calls.append((url, kwargs))
        return socket

    fake_connect.calls = calls
    return fake_connect


class TtsStreamTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        # client_host KHÁC loopback: nhánh rate-limit phải chạy thật.
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()
        # Pool phải sạch: một socket hâm sẵn còn sót lại sẽ khiến các ca dưới đây
        # đi nhánh warm thay vì nhánh tự-mở mà chúng đang kiểm.
        tts_socket_pool.reset_for_test()

    def tearDown(self):
        tts_socket_pool.reset_for_test()

    def _get(self, text="你好"):
        return self.client.get("/tts/stream", params={"text": text})

    def test_chunks_are_concatenated_in_order(self):
        """Thứ tự là tất cả: mp3_stream đảo khối = file hỏng, không phải crash."""
        socket = _FakeSocket()
        connect = _connect_returning(socket)
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", connect):
                res = self._get()
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.content, _JOINED)
        self.assertEqual(res.headers["content-type"], "audio/mpeg")

    def test_disables_proxy_buffering(self):
        """Không có header này thì fly/nginx gom trọn response — mất đúng phần
        streaming mà endpoint tồn tại để có, và độ trễ TỆ HƠN /tts."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                res = self._get()
        self.assertEqual(res.headers.get("X-Accel-Buffering"), "no")

    def test_create_uses_the_same_voice_as_the_http_endpoint(self):
        """Giọng phải KHỚP /tts. Lệch thì một cuộc gọi đổi giọng giữa câu lúc rơi
        về fallback HTTP.

        ``instruction`` là ngoại lệ CÓ CHỦ Ý: hội thoại dùng bản sinh động hơn
        (``stepfun_tts_instruction_chat``, đo được +11% F0 / +2dB). Đây là chỉ dẫn
        diễn đạt, không phải đặc tính giọng — nó không làm người nghe thấy đổi
        người nói.
        """
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                self._get()
        create = next(m for m in socket.sent if m["type"] == "tts.create")
        data = create["data"]
        self.assertEqual(data["voice_id"], tts_module.settings.stepfun_tts_voice)
        self.assertEqual(data["speed_ratio"], tts_module.settings.stepfun_tts_speed)
        self.assertEqual(data["sample_rate"], tts_module.settings.stepfun_tts_sample_rate)
        self.assertEqual(
            data["instruction"], tts_module.settings.stepfun_tts_instruction_chat
        )
        self.assertEqual(data["response_format"], "mp3_stream")

    def test_chat_instruction_keeps_the_tone_accuracy_clause(self):
        """Đây là app học tiếng: biểu cảm mà sai thanh điệu thì phản tác dụng.

        Đã đo bằng ASR round-trip là chỉ dẫn hiện tại KHÔNG méo thanh điệu; nếu ai
        sửa chuỗi mà bỏ mệnh đề này thì phải đo lại, nên khoá nó ở đây.
        """
        self.assertIn("声调", tts_module.settings.stepfun_tts_instruction_chat)

    def test_stream_cache_key_tracks_the_chat_instruction(self):
        """Khoá cache phải theo chỉ dẫn THẬT SỰ được gửi. Nếu nó theo chuỗi của
        /tts thì đổi giọng hội thoại sẽ không làm mất hiệu lực cache, và người học
        vẫn nghe bản đọc theo chỉ dẫn cũ."""
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                first = self._get("你好")
            # Đổi chỉ dẫn hội thoại -> phải là cache MISS, tức mở socket lần nữa.
            connect = _connect_returning(_FakeSocket(chunks=[b"ID3" + b"\x09" * 400]))
            with patch.object(
                tts_module.settings, "stepfun_tts_instruction_chat", "完全不同的指令。"
            ):
                with patch("websockets.sync.client.connect", connect):
                    second = self._get("你好")
        self.assertEqual(first.content, _JOINED)
        self.assertEqual(len(connect.calls), 1, "đổi chỉ dẫn phải làm mất hiệu lực cache")
        self.assertNotEqual(second.content, first.content)

    def test_text_is_sent_then_closed(self):
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                self._get("今天天气很好")
        kinds = [m["type"] for m in socket.sent]
        self.assertEqual(kinds, ["tts.create", "tts.text.delta", "tts.text.done"])
        delta = next(m for m in socket.sent if m["type"] == "tts.text.delta")
        self.assertEqual(delta["data"]["text"], "今天天气很好")

    def test_second_request_is_served_from_cache_without_a_socket(self):
        """Nếu cache hit vẫn mở socket thì mỗi câu lặp tốn 0.94s handshake + quota."""
        connect = _connect_returning(_FakeSocket())
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", connect):
                first = self._get()
                second = self._get()
        self.assertEqual(first.content, _JOINED)
        self.assertEqual(second.content, _JOINED)
        self.assertEqual(len(connect.calls), 1, "lần hai không được mở socket")

    def test_cache_is_separate_from_the_plain_tts_endpoint(self):
        """Cùng text nhưng khác response_format/normalization -> bytes khác. Dùng
        chung khoá sẽ trả bytes của luồng kia."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                streamed = self._get("你好")
            with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3):
                plain = self.client.get("/tts", params={"text": "你好"})
        self.assertEqual(streamed.content, _JOINED)
        self.assertEqual(plain.content, _HTTP_MP3)

    def test_falls_back_to_http_when_the_socket_never_yields(self):
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", side_effect=OSError("không nối được")):
                with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3) as http:
                    res = self._get()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, _HTTP_MP3)
        http.assert_called_once()

    def test_error_event_before_audio_also_falls_back(self):
        socket = _FakeSocket(chunks=[], error_event=True)
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3):
                    res = self._get()
        self.assertEqual(res.content, _HTTP_MP3)

    def test_partial_stream_is_not_spliced_with_http_audio(self):
        """Đã phát rồi mới lỗi: dừng ở đó. Chắp MP3 của hai lần tổng hợp khác nhau
        nghe như nhảy tiếng, tệ hơn một câu bị cụt.

        ``STREAM_HOLD_SEC=0`` để khối đầu ra client NGAY — đó là điều kiện cần để ca
        này có nghĩa. Với hold mặc định, socket giả trả mọi khối tức thời nên lỗi
        luôn xảy ra TRƯỚC lúc xả, và đường đi là nhánh fallback sạch (ca riêng bên
        dưới).
        """
        socket = _FakeSocket(fail_after=1)
        with patch.object(tts_module, "STREAM_HOLD_SEC", 0.0):
            with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
                with patch("websockets.sync.client.connect", _connect_returning(socket)):
                    with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3) as http:
                        res = self._get()
        self.assertEqual(res.content, _CHUNKS[0])
        http.assert_not_called()

    def test_partial_stream_is_not_cached(self):
        """Cache một câu cụt là cụt vĩnh viễn cho mọi người học sau."""
        with patch.object(tts_module, "STREAM_HOLD_SEC", 0.0):
            with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
                with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket(fail_after=1))):
                    with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3):
                        partial = self._get()
                # Lượt sau phải gọi provider lại, không được trả bản cụt từ cache.
                with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                    retry = self._get()
        self.assertEqual(partial.content, _CHUNKS[0])
        self.assertEqual(retry.content, _JOINED)

    def test_no_stepfun_key_falls_back_to_http(self):
        with patch.object(tts_module.settings, "stepfun_api_keys", ""):
            with patch.object(tts_module, "_stepfun_synth", return_value=_HTTP_MP3):
                res = self._get()
        self.assertEqual(res.content, _HTTP_MP3)

    def test_rejects_blank_text(self):
        res = self.client.get("/tts/stream", params={"text": "   "})
        self.assertEqual(res.status_code, 400)

    def test_rate_limited_per_ip(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", lambda url, **kw: _FakeSocket()):
                for i in range(limit):
                    res = self.client.get(
                        "/tts/stream",
                        params={"text": f"你好{i}"},
                        headers={"fly-client-ip": "198.51.100.30"},
                    )
                    self.assertEqual(res.status_code, 200, res.text)
                over = self.client.get(
                    "/tts/stream",
                    params={"text": "再见"},
                    headers={"fly-client-ip": "198.51.100.30"},
                )
        self.assertEqual(over.status_code, 429, over.text)
        self.assertEqual(over.headers.get("Retry-After"), "30")


class TtsStreamHoldTest(unittest.TestCase):
    """Giữ khối đầu ``STREAM_HOLD_SEC`` trước khi phát.

    Vì sao tồn tại: đo mốc đến từng khối trên 10 câu thật, StepFun giao
    ``mp3_stream`` theo CHÙM — ~5 khối liền nhau (1.25s audio), NGHỈ 1.3-1.4s, rồi
    phần còn lại. Thẻ ``<audio>`` phát hết chỗ có rồi ĐỨNG giữa chữ: mô phỏng kim
    phát cho 8/10 câu bị đứng, tệ nhất 686ms.

    Sàn ``playbackRate`` 0.85 cũ vô tình che lỗi này. Giờ client phát ở 1.0 (tốc độ
    do server tổng hợp) nên lớp đệm đó không còn, và việc giữ là thứ thay thế.
    """

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()
        tts_socket_pool.reset_for_test()

    def tearDown(self):
        tts_socket_pool.reset_for_test()

    def test_all_bytes_still_arrive_in_order_when_held(self):
        """Giữ là hoãn, KHÔNG phải bỏ. Mất một khối là file hỏng."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                res = self.client.get("/tts/stream", params={"text": "你好"})
        self.assertEqual(res.content, _JOINED)

    def test_short_sentence_is_flushed_without_waiting_out_the_hold(self):
        """Câu xong trước khi hết thời gian giữ thì xả ngay.

        Không có nhánh này thì mọi câu ngắn đều trả đủ ``STREAM_HOLD_SEC`` độ trễ
        vô ích — và câu ngắn là phần lớn lời đáp trong hội thoại.
        """
        with patch.object(tts_module, "STREAM_HOLD_SEC", 30.0):
            with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
                with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                    started = time.monotonic()
                    res = self.client.get("/tts/stream", params={"text": "你好"})
                    elapsed = time.monotonic() - started
        self.assertEqual(res.content, _JOINED)
        self.assertLess(elapsed, 5.0, "không được chờ hết hold khi câu đã xong")

    def test_hold_is_configurable_to_zero(self):
        """Phải tắt được: nếu provider đổi nhịp giao khối thì việc giữ thành thuần
        độ trễ, và ta cần một hằng số để hạ mà không phải sửa logic."""
        with patch.object(tts_module, "STREAM_HOLD_SEC", 0.0):
            with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
                with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                    res = self.client.get("/tts/stream", params={"text": "你好"})
        self.assertEqual(res.content, _JOINED)


class TtsStreamSpeedTest(unittest.TestCase):
    """Tốc độ đi vào REQUEST của provider, không qua ``playbackRate`` của browser.

    Lỗi được sửa: ``SPEECH_RATES`` của hội thoại có 0.72 / 0.82 / 0.95, nhưng
    ``speech.jsx`` kẹp ``playbackRate`` ở sàn 0.85 — nên 0.72 và 0.82 cho ra audio Y
    HỆT NHAU, và bộ chọn tốc độ coi như vô tác dụng ở hai mức chậm.

    Đo trên key thật: provider ÁP giá trị và đơn điệu (0.72 -> 340ms/chữ,
    0.82 -> 293, 0.95 -> 202), bitrate vẫn 128kbps, ASR khớp 3/3.
    """

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()
        tts_socket_pool.reset_for_test()

    def tearDown(self):
        tts_socket_pool.reset_for_test()

    def test_speed_is_forwarded_to_the_provider(self):
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                self.client.get("/tts/stream", params={"text": "你好", "speed": 0.72})
        create = next(m for m in socket.sent if m["type"] == "tts.create")
        self.assertEqual(create["data"]["speed_ratio"], 0.72)

    def test_omitted_speed_falls_back_to_the_configured_default(self):
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                self.client.get("/tts/stream", params={"text": "你好"})
        create = next(m for m in socket.sent if m["type"] == "tts.create")
        self.assertEqual(
            create["data"]["speed_ratio"], tts_module.settings.stepfun_tts_speed
        )

    def test_out_of_range_speed_is_clamped_not_rejected(self):
        """URL này nằm trong ``new Audio(src)``: một 422 ở đó chỉ hiện ra dưới dạng
        im lặng không lý do. Kẹp thì tệ nhất là đọc sai tốc độ."""
        socket = _FakeSocket()
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(socket)):
                res = self.client.get("/tts/stream", params={"text": "你好", "speed": 9})
        self.assertEqual(res.status_code, 200)
        create = next(m for m in socket.sent if m["type"] == "tts.create")
        self.assertEqual(create["data"]["speed_ratio"], tts_module.MAX_SPEED)

    def test_speed_is_part_of_the_cache_key(self):
        """Không có điều này thì đổi tốc độ vẫn trả bản đọc ở tốc độ cũ."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                first = self.client.get("/tts/stream", params={"text": "你好", "speed": 0.72})
            other = _connect_returning(_FakeSocket(chunks=[b"ID3" + b"\x07" * 400]))
            with patch("websockets.sync.client.connect", other):
                second = self.client.get("/tts/stream", params={"text": "你好", "speed": 0.95})
        self.assertEqual(len(other.calls), 1, "đổi tốc độ phải là cache miss")
        self.assertNotEqual(second.content, first.content)

    def test_clamped_speed_shares_one_cache_entry(self):
        """``speed=9`` và ``speed=2`` kẹp về cùng giá trị nên phải CÙNG khoá. Nếu
        khoá dùng giá trị thô thì đó là cache miss vĩnh viễn — tốn tiền mỗi lượt."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                self.client.get("/tts/stream", params={"text": "你好", "speed": 9})
            again = _connect_returning(_FakeSocket())
            with patch("websockets.sync.client.connect", again):
                res = self.client.get(
                    "/tts/stream", params={"text": "你好", "speed": tts_module.MAX_SPEED}
                )
        self.assertEqual(len(again.calls), 0, "giá trị đã kẹp phải trúng cache")
        self.assertEqual(res.content, _JOINED)

    def test_non_default_speed_does_not_consume_the_warm_socket(self):
        """Socket hâm sẵn đã gửi ``tts.create`` với tốc độ MẶC ĐỊNH. Dùng nó cho một
        tốc độ khác là đọc sai nhịp người học chọn — lỗi im lặng, audio vẫn phát."""
        warm_ws = _FakeSocket()
        tts_socket_pool._warm = tts_socket_pool.WarmSocket(warm_ws, "sid-1")
        fresh = _FakeSocket()
        connect = _connect_returning(fresh)
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", connect):
                self.client.get("/tts/stream", params={"text": "你好", "speed": 0.72})
        self.assertEqual(len(connect.calls), 1, "phải tự mở socket mới")
        self.assertEqual(warm_ws.sent, [], "socket hâm sẵn không được dùng")
        create = next(m for m in fresh.sent if m["type"] == "tts.create")
        self.assertEqual(create["data"]["speed_ratio"], 0.72)


class TtsStreamWarmSocketTest(unittest.TestCase):
    """Nhánh socket hâm sẵn: dùng cái có sẵn thay vì bắt tay lại.

    Đây là chỗ tiết kiệm ~1.3s mỗi câu, nên phải khoá ba điều: có socket sẵn thì
    KHÔNG mở socket mới, socket đó bị đóng sau khi dùng (một session chỉ phục vụ
    một lượt sinh), và bytes ra vẫn đúng như nhánh tự-mở.
    """

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app, client=("203.0.113.7", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()
        tts_socket_pool.reset_for_test()

    def tearDown(self):
        tts_socket_pool.reset_for_test()

    def test_warm_socket_is_used_and_no_new_connection_is_opened(self):
        warm_ws = _FakeSocket()
        tts_socket_pool._warm = tts_socket_pool.WarmSocket(warm_ws, "sid-1")
        connect = _connect_returning(_FakeSocket())
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", connect):
                res = self.client.get("/tts/stream", params={"text": "你好"})
        self.assertEqual(res.content, _JOINED)
        self.assertEqual(len(connect.calls), 0, "có socket hâm sẵn thì đừng bắt tay lại")

    def test_warm_socket_is_closed_after_one_sentence(self):
        """Một session StepFun chỉ phục vụ ĐÚNG MỘT lượt sinh — đã đo: gửi câu thứ
        hai sau ``sentence.end`` thì server im lặng tới timeout. Không đóng thì
        kết nối treo lại phía provider."""
        warm_ws = _FakeSocket()
        warm = tts_socket_pool.WarmSocket(warm_ws, "sid-1")
        tts_socket_pool._warm = warm
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                self.client.get("/tts/stream", params={"text": "你好"})
        self.assertEqual(warm_ws.closed, 1)

    def test_warm_socket_skips_create_and_sends_only_text(self):
        """``tts.create`` đã gửi lúc hâm. Gửi lại là lỗi protocol và cũng là mất
        đúng phần thời gian mà pool tồn tại để tiết kiệm."""
        warm_ws = _FakeSocket()
        tts_socket_pool._warm = tts_socket_pool.WarmSocket(warm_ws, "sid-1")
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            self.client.get("/tts/stream", params={"text": "今天天气很好"})
        kinds = [m["type"] for m in warm_ws.sent]
        self.assertEqual(kinds, ["tts.text.delta", "tts.text.done"])

    def test_request_marks_demand_so_the_warmer_knows_a_call_is_active(self):
        """Không có bước này thì luồng nền không bao giờ hâm và pool vô dụng."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                self.client.get("/tts/stream", params={"text": "你好"})
        self.assertGreater(tts_socket_pool._last_demand_at, 0)

    def test_cache_hit_still_marks_demand(self):
        """Cuộc gọi mở đầu bằng câu quen ("你好！") vốn là cache hit. Chỉ ghi nhận ở
        nhánh miss thì đúng lúc cần hâm nhất lại không hâm."""
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", _connect_returning(_FakeSocket())):
                self.client.get("/tts/stream", params={"text": "你好"})
            tts_socket_pool.reset_for_test()
            self.assertEqual(tts_socket_pool._last_demand_at, 0.0)
            cached = self.client.get("/tts/stream", params={"text": "你好"})
        self.assertEqual(cached.content, _JOINED)
        self.assertGreater(tts_socket_pool._last_demand_at, 0, "cache hit cũng phải ghi nhận")


class TtsStreamLoopbackTest(unittest.TestCase):
    """Peer TCP loopback -> miễn rate-limit, để audio builder chạy được."""

    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(tts_router)
        cls.client = TestClient(app, client=("127.0.0.1", 50000))

    def setUp(self):
        tts_cache.clear()
        tts_module._tts_rate_limiter._hits.clear()
        tts_socket_pool.reset_for_test()

    def test_loopback_is_never_limited(self):
        limit = tts_module._tts_rate_limiter.max_hits
        with patch.object(tts_module.settings, "stepfun_api_keys", "fake-key"):
            with patch("websockets.sync.client.connect", lambda url, **kw: _FakeSocket()):
                for i in range(limit + 3):
                    res = self.client.get("/tts/stream", params={"text": f"从{i}"})
                    self.assertEqual(res.status_code, 200, res.text)


if __name__ == "__main__":
    unittest.main()
