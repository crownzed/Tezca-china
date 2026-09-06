"""Test cho tts_socket_pool — socket TTS hâm sẵn cho chế độ gọi.

Chạy: cd backend && python -m pytest tests/test_tts_socket_pool.py

Pool này tồn tại vì bắt tay + tts.create tốn ~1.30s trong tổng 2.1s của một câu
(đo thật). Luồng nền trả phần đó TRONG LÚC câu trước đang phát.

Những gì phải đúng, nếu sai thì pool tệ hơn không có:
  - socket quá tuổi KHÔNG được phát ra. Socket idle bị StepFun đóng sau ~60s;
    đưa cho caller một socket đã chết là bắt họ mất thêm một vòng thử rồi mới mở
    socket mới -> CHẬM HƠN đường không pool.
  - mỗi socket phát ra ĐÚNG MỘT lần. Hai request cùng nhận một socket thì request
    thứ hai đọc mất audio của request thứ nhất.
  - không có nhu cầu thì không giữ socket. Giữ mãi = bắt tay lại 2 lần/phút,
    24/7, trên máy phần lớn thời gian không ai gọi.
  - lỗi provider không được làm luồng nền chết hay quay vòng liên tục.
"""

import time
import unittest
from unittest.mock import patch

from app.services import tts_socket_pool as pool


class _FakeWs:
    """Socket giả, chỉ cần đếm số lần close()."""

    def __init__(self):
        self.closed = 0

    def close(self):
        self.closed += 1


def _warm(age_sec=0.0):
    """WarmSocket với tuổi giả — chỉnh created_at thay vì phải chờ thật."""
    socket = pool.WarmSocket(_FakeWs(), "sid-test")
    socket.created_at = time.monotonic() - age_sec
    return socket


class AcquireTest(unittest.TestCase):
    def setUp(self):
        pool.reset_for_test()

    def tearDown(self):
        pool.reset_for_test()

    def test_returns_none_when_empty(self):
        """Không có socket -> caller tự mở. Đây là đường suy giảm mềm: pool hỏng
        thì chỉ chậm về mức cũ, không làm chết tính năng."""
        self.assertIsNone(pool.acquire())
        self.assertEqual(pool.stats()["missed"], 1)

    def test_serves_a_fresh_socket(self):
        socket = _warm()
        pool._warm = socket
        self.assertIs(pool.acquire(), socket)
        self.assertEqual(pool.stats()["served"], 1)

    def test_a_socket_is_served_only_once(self):
        """Hai request cùng nhận một socket thì request thứ hai đọc mất audio của
        request thứ nhất."""
        pool._warm = _warm()
        first = pool.acquire()
        second = pool.acquire()
        self.assertIsNotNone(first)
        self.assertIsNone(second)

    def test_refuses_and_closes_a_stale_socket(self):
        """Quá tuổi -> đóng, báo miss. Phát ra socket sắp chết còn tệ hơn không
        phát gì: caller mất một vòng thử rồi mới mở lại."""
        socket = _warm(age_sec=pool.MAX_WARM_AGE_SEC + 1)
        pool._warm = socket
        self.assertIsNone(pool.acquire())
        self.assertEqual(socket.ws.closed, 1)
        stats = pool.stats()
        self.assertEqual(stats["expired"], 1)
        self.assertEqual(stats["missed"], 1)

    def test_max_age_stays_below_the_provider_idle_timeout(self):
        """StepFun đóng socket idle sau ~60s (tài liệu; đo thật 30s vẫn sống).
        Nếu ai nâng ngưỡng này lên quá 60s thì pool sẽ phát socket đã chết."""
        self.assertLess(pool.MAX_WARM_AGE_SEC, 60.0)


class MaintainDecisionTest(unittest.TestCase):
    """``_take_stale_or_idle`` là toàn bộ phần quyết định của luồng nền, tách ra
    để test được mà không phải chạy thread hay chờ thời gian thật."""

    def setUp(self):
        pool.reset_for_test()

    def tearDown(self):
        pool.reset_for_test()

    def test_no_demand_means_no_warming(self):
        doomed, need_new = pool._take_stale_or_idle()
        self.assertIsNone(doomed)
        self.assertFalse(need_new, "không có ai gọi thì không được bắt tay")

    def test_demand_with_empty_slot_asks_for_a_socket(self):
        pool.note_demand()
        doomed, need_new = pool._take_stale_or_idle()
        self.assertIsNone(doomed)
        self.assertTrue(need_new)

    def test_demand_with_fresh_socket_does_nothing(self):
        pool.note_demand()
        pool._warm = _warm()
        doomed, need_new = pool._take_stale_or_idle()
        self.assertIsNone(doomed)
        self.assertFalse(need_new, "đã có socket tươi thì đừng mở thêm")

    def test_stale_socket_is_handed_back_for_closing_and_replaced(self):
        pool.note_demand()
        socket = _warm(age_sec=pool.MAX_WARM_AGE_SEC + 1)
        pool._warm = socket
        doomed, need_new = pool._take_stale_or_idle()
        self.assertIs(doomed, socket)
        self.assertTrue(need_new)
        self.assertIsNone(pool._warm)

    def test_socket_is_released_when_demand_stops(self):
        """Ngừng gọi -> nhả socket. Nếu không thì máy idle vẫn bắt tay mãi."""
        socket = _warm()
        pool._warm = socket
        pool._last_demand_at = time.monotonic() - (pool.DEMAND_WINDOW_SEC + 1)
        doomed, need_new = pool._take_stale_or_idle()
        self.assertIs(doomed, socket)
        self.assertFalse(need_new)
        self.assertIsNone(pool._warm)

    def test_stale_socket_is_closed_outside_the_lock(self):
        """``close()`` chờ I/O mạng; giữ lock suốt lúc đó sẽ chặn mọi acquire()
        đang tới — đúng lúc cuộc gọi cần socket nhất. Nên hàm này chỉ TRẢ VỀ
        socket cần đóng, không tự đóng."""
        pool.note_demand()
        socket = _warm(age_sec=pool.MAX_WARM_AGE_SEC + 1)
        pool._warm = socket
        doomed, _ = pool._take_stale_or_idle()
        self.assertEqual(doomed.ws.closed, 0, "phải để caller đóng, ngoài lock")


class DemandWindowTest(unittest.TestCase):
    def setUp(self):
        pool.reset_for_test()

    def tearDown(self):
        pool.reset_for_test()

    def test_window_covers_a_pause_between_turns(self):
        """Trong một cuộc gọi, hai câu cách nhau vài giây. Cửa sổ phải phủ được
        khoảng người học đang nghĩ, nếu không socket bị nhả giữa cuộc gọi."""
        self.assertGreaterEqual(pool.DEMAND_WINDOW_SEC, 30.0)


class LifecycleTest(unittest.TestCase):
    def setUp(self):
        pool.reset_for_test()

    def tearDown(self):
        pool.reset_for_test()

    def test_start_is_idempotent(self):
        pool.start()
        first = pool._thread
        pool.start()
        self.assertIs(pool._thread, first, "gọi start() hai lần không được tạo 2 luồng")

    def test_thread_is_a_daemon(self):
        """Luồng chỉ giữ một socket ra ngoài, không có state cần dọn — không được
        phép chặn tiến trình thoát."""
        pool.start()
        self.assertTrue(pool._thread.daemon)

    def test_shutdown_closes_the_warm_socket(self):
        """Không đóng thì mỗi lần fly deploy để lại một kết nối treo phía StepFun."""
        socket = _warm()
        pool._warm = socket
        pool.shutdown()
        self.assertEqual(socket.ws.closed, 1)
        self.assertIsNone(pool._warm)

    def test_background_thread_warms_on_demand_then_stops(self):
        """Vòng đời thật, với ``_open_warm_socket`` được patch: có nhu cầu thì hâm,
        và socket hâm được phải đến tay ``acquire()``."""
        made = []

        def fake_open():
            socket = _warm()
            made.append(socket)
            return socket

        with patch.object(pool, "_open_warm_socket", fake_open):
            pool.note_demand()
            pool.start()
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline and not made:
                time.sleep(0.05)
            self.assertTrue(made, "luồng nền phải hâm khi đang có nhu cầu")
            got = pool.acquire()
        self.assertIs(got, made[0])
        self.assertEqual(pool.stats()["opened"], 1)

    def test_open_failure_does_not_kill_the_thread(self):
        """Provider sập không được làm luồng chết, cũng không được quay vòng liên
        tục — backoff phải chặn lại."""
        calls = []

        def failing_open():
            calls.append(time.monotonic())
            raise OSError("StepFun không nối được")

        with patch.object(pool, "_open_warm_socket", failing_open):
            pool.note_demand()
            pool.start()
            time.sleep(3)
            alive = pool._thread.is_alive()
            attempts = len(calls)
        self.assertTrue(alive, "luồng nền phải sống sót qua lỗi provider")
        self.assertGreaterEqual(attempts, 1)
        self.assertLessEqual(attempts, 4, f"backoff không có tác dụng: {attempts} lần trong 3s")

    def test_acquire_wakes_the_warmer_immediately(self):
        """Đây là điều kiện để câu thứ ba trở đi cũng nhanh.

        Đo thật trước khi có ``_wake``: chu kỳ 2s + bắt tay 1.3s = 3.3s để bù lại
        một socket, DÀI HƠN khoảng nghỉ giữa hai lượt nói (~3s) — nên câu 3 vẫn
        miss dù pool đang chạy. Lấy socket phải kích hâm ngay, để bắt tay chạy
        song song với câu vừa lấy đang phát.
        """
        opened = []

        def fake_open():
            socket = _warm()
            opened.append(socket)
            return socket

        with patch.object(pool, "_open_warm_socket", fake_open):
            pool.note_demand()
            pool.start()
            # Chờ socket đầu tiên.
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline and not opened:
                time.sleep(0.05)
            self.assertTrue(opened, "không hâm được socket đầu tiên")

            pool.acquire()          # lấy đi -> phải kích hâm ngay
            taken_at = time.monotonic()
            deadline = taken_at + 2  # NGẮN hơn _TICK_SEC: nếu phải chờ chu kỳ thì trượt
            while time.monotonic() < deadline and len(opened) < 2:
                time.sleep(0.05)
            refill_delay = time.monotonic() - taken_at

        self.assertGreaterEqual(
            len(opened), 2,
            f"không hâm lại trong {refill_delay:.1f}s — acquire() phải đánh thức luồng nền",
        )
        self.assertLess(
            refill_delay, pool._TICK_SEC,
            "hâm lại chỉ xảy ra sau khi hết chu kỳ, tức _wake không có tác dụng",
        )


if __name__ == "__main__":
    unittest.main()
