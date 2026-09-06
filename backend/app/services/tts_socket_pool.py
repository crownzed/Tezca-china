"""Giữ sẵn MỘT socket StepFun TTS đã bắt tay xong, cho câu kế tiếp của cuộc gọi.

Vì sao: phân rã 2.1s của ``/tts/stream`` (đo thật, xem ``bench_live_chat.py``):

    bắt tay WebSocket + tts.create : ~1.30s   <- chi phí THIẾT LẬP
    tổng hợp tới byte đầu tiên     : ~0.65s   <- việc thật

Hai phần ba độ trễ không phải là tổng hợp. Nếu socket được dọn sẵn TRONG LÚC câu
trước đang phát thì câu sau chỉ còn trả 0.65s, và TTS từ chặng chậm nhất của một
lượt hội thoại thành chặng nhanh nhất.

KHÔNG phải pool tái dùng, mà là "dọn sẵn rồi dùng một lần": đã đo, một session
StepFun chỉ phục vụ ĐÚNG MỘT lượt sinh — gửi câu thứ hai sau ``sentence.end`` thì
server không phản hồi gì và request treo tới timeout. Nên mỗi socket phát ra là
đóng luôn, và luồng nền hâm cái kế tiếp.

Hâm THEO NHU CẦU, không hâm vĩnh viễn: socket idle bị đóng sau ~60s, nên giữ mãi
nghĩa là bắt tay lại hai lần mỗi phút, 24/7, trên một máy mà phần lớn thời gian
không ai gọi. Chỉ hâm khi có request ``/tts/stream`` trong ``DEMAND_WINDOW_SEC``
vừa qua — tức đúng lúc đang có cuộc gọi.

Bắt tay KHÔNG tốn tiền: hoá đơn tính theo ký tự được tổng hợp, và socket hâm sẵn
chưa nhận text nào. Cái nó tiêu là một suất trong hạn mức kết nối đồng thời, nên
giữ đúng MỘT cái.
"""
from __future__ import annotations

import json
import logging
import threading
import time

from ..settings import settings

logger = logging.getLogger(__name__)

# Làm mới trước hạn: tài liệu StepFun nói socket idle bị đóng sau ~60s, và đo
# thật thì 30s vẫn sống. Phát ra một socket vừa chết còn TỆ HƠN không có gì —
# caller mất thêm một vòng thử rồi mới mở socket mới, tức chậm hơn cả đường cũ.
MAX_WARM_AGE_SEC = 40.0

# Ngoài cửa sổ này thì nhả socket. Trong một cuộc gọi, các câu cách nhau vài giây
# nên chỉ cần phủ khoảng nghỉ giữa hai lượt nói của người học.
DEMAND_WINDOW_SEC = 90.0

# Chờ tăng dần sau lỗi kết nối. Không có nó thì provider sập sẽ biến luồng nền
# thành vòng lặp bắt tay liên tục.
_RETRY_BACKOFF_SEC = (1.0, 3.0, 10.0, 30.0)

# Chu kỳ kiểm tra của luồng nền khi KHÔNG có tín hiệu gì. Chỉ là lưới an toàn:
# đường chính là ``_wake`` — được đánh thức ngay lúc socket bị lấy đi.
#
# Vì sao không thể chỉ dựa vào chu kỳ: đo thật cho thấy tick 2s + bắt tay 1.3s =
# tới 3.3s để bù lại một socket, DÀI HƠN khoảng nghỉ giữa hai lượt nói của người
# học (~3s). Kết quả là câu thứ ba của cuộc gọi vẫn miss dù pool đang chạy. Đánh
# thức ngay khi acquire() lấy socket thì bắt tay chạy song song với câu đang phát.
_TICK_SEC = 5.0


class WarmSocket:
    """Một socket đã gửi ``tts.create`` xong, sẵn sàng nhận text.

    ``close()`` phải an toàn khi gọi nhiều lần: cả caller (sau khi phát xong) và
    luồng nền (khi thấy quá tuổi) đều có thể gọi.
    """

    __slots__ = ("ws", "session_id", "created_at")

    def __init__(self, ws, session_id: str) -> None:
        self.ws = ws
        self.session_id = session_id
        self.created_at = time.monotonic()

    @property
    def age(self) -> float:
        return time.monotonic() - self.created_at

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:  # noqa: BLE001 — socket có thể đã chết; không có gì để làm
            pass


def _open_warm_socket() -> WarmSocket:
    """Mở socket và gửi ``tts.create``. Ném khi thất bại.

    Tham số phải KHỚP TỪNG TRƯỜNG với ``tts.py:_stepfun_stream_synth``: nếu lệch,
    một cuộc gọi sẽ đổi giọng giữa câu tuỳ theo câu đó dùng socket hâm sẵn hay
    socket mở tại chỗ — lỗi khó truy nhất trong cả hệ thống này.
    """
    keys = settings.stepfun_keys_list
    if not keys:
        raise RuntimeError("STEPFUN_API_KEYS chưa được cấu hình.")

    from websockets.sync.client import connect

    url = f"{settings.stepfun_tts_ws_url}?model={settings.stepfun_tts_model}"
    ws = connect(
        url,
        additional_headers={"Authorization": f"Bearer {keys[0]}"},
        open_timeout=15,
        close_timeout=3,
    )
    try:
        session_id = json.loads(ws.recv(timeout=10))["data"]["session_id"]
        ws.send(json.dumps({
            "type": "tts.create",
            "data": {
                "session_id": session_id,
                "voice_id": settings.stepfun_tts_voice,
                "response_format": "mp3_stream",
                "sample_rate": settings.stepfun_tts_sample_rate,
                "mode": "sentence",
                "speed_ratio": settings.stepfun_tts_speed,
                "instruction": settings.stepfun_tts_instruction_chat,
                "text_normalization": "standard",
            },
        }, ensure_ascii=False))
        ws.recv(timeout=15)  # tts.response.created
    except Exception:
        try:
            ws.close()
        except Exception:  # noqa: BLE001
            pass
        raise
    return WarmSocket(ws, session_id)


# --- Trạng thái dùng chung ---------------------------------------------------
#
# ``_lock`` bảo vệ cả bốn biến dưới. Router chạy trên threadpool của anyio nên
# nhiều request có thể vào ``acquire()`` cùng lúc; không có lock thì hai request
# cùng nhận một socket và request thứ hai đọc mất audio của request thứ nhất.
_lock = threading.Lock()
_warm: WarmSocket | None = None
_last_demand_at = 0.0
_thread: threading.Thread | None = None
_stop = threading.Event()
# Đánh thức luồng nền ngay khi có việc, thay vì chờ hết chu kỳ. Xem ``_TICK_SEC``.
_wake = threading.Event()

# Đếm để test và /health thấy được pool có thật sự phục vụ.
stats_served = 0      # số lần caller nhận được socket hâm sẵn
stats_missed = 0      # số lần caller phải tự mở (không có sẵn)
stats_opened = 0      # số socket luồng nền đã hâm
stats_expired = 0     # số socket bị đóng vì quá tuổi mà không ai dùng


def note_demand() -> None:
    """Ghi nhận "đang có cuộc gọi", để luồng nền biết cần hâm.

    Gọi ở ĐẦU ``/tts/stream``, kể cả khi request đó rơi vào cache hit: câu tiếp
    theo của cùng cuộc gọi vẫn cần socket, và cuộc gọi mở đầu bằng vài câu quen
    (chào hỏi) thường là cache hit — nếu chỉ ghi nhận lúc cache miss thì đúng lúc
    cần nhất lại không hâm.
    """
    global _last_demand_at
    with _lock:
        _last_demand_at = time.monotonic()
    # Đánh thức ngay: request đầu tiên của một cuộc gọi phải kích hâm liền, không
    # chờ hết chu kỳ — nếu chờ thì câu thứ hai cũng miss.
    _wake.set()


def acquire() -> WarmSocket | None:
    """Lấy socket hâm sẵn nếu có và còn tươi. Caller SỞ HỮU nó và phải close().

    Trả None khi không có — caller tự mở như cũ. Đây là đường suy giảm mềm: pool
    hỏng thì chỉ chậm lại về mức cũ, không làm chết tính năng.
    """
    global _warm, stats_served, stats_missed, stats_expired
    doomed = None
    try:
        with _lock:
            socket = _warm
            _warm = None
            if socket is None:
                stats_missed += 1
                return None
            if socket.age > MAX_WARM_AGE_SEC:
                # Quá tuổi: đóng và báo miss. Phát ra một socket sắp chết còn tệ
                # hơn không phát gì — caller sẽ mất một vòng thử rồi mới mở lại.
                stats_expired += 1
                stats_missed += 1
                doomed = socket
                return None
            stats_served += 1
            return socket
    finally:
        # Chỗ vừa trống -> hâm cái kế NGAY, đừng chờ hết chu kỳ. Bắt tay 1.3s sẽ
        # chạy song song với câu vừa lấy đang phát, nên câu sau không phải trả.
        # Đặt trong ``finally`` để mọi nhánh return đều đánh thức.
        _wake.set()
        if doomed is not None:
            doomed.close()   # ngoài lock: close() có thể chờ I/O mạng


def _take_stale_or_idle() -> tuple[WarmSocket | None, bool]:
    """Một bước quyết định, chạy TRỌN trong lock.

    Trả ``(socket_cần_đóng, cần_hâm_cái_mới)``. Việc đóng để caller làm NGOÀI lock:
    ``close()`` có thể chờ I/O mạng, giữ lock suốt lúc đó sẽ chặn mọi ``acquire()``
    đang tới — đúng lúc một cuộc gọi cần socket nhất.
    """
    global _warm, stats_expired
    with _lock:
        has_demand = (time.monotonic() - _last_demand_at) < DEMAND_WINDOW_SEC
        current = _warm

        if not has_demand:
            # Hết nhu cầu: nhả socket đang giữ. Giữ mãi nghĩa là bắt tay lại hai
            # lần mỗi phút, 24/7, trên một máy phần lớn thời gian không ai gọi.
            _warm = None
            return current, False

        if current is not None and current.age > MAX_WARM_AGE_SEC:
            _warm = None
            stats_expired += 1
            return current, True

        return None, current is None


def _maintain() -> None:
    """Luồng nền: giữ đúng MỘT socket tươi trong lúc đang có cuộc gọi."""
    global _warm, stats_opened
    failures = 0
    while not _stop.is_set():
        try:
            doomed, need_new = _take_stale_or_idle()
            if doomed is not None:
                doomed.close()
            if not need_new:
                failures = 0
                # Chờ tín hiệu, KHÔNG chờ hết chu kỳ: ``acquire()`` và
                # ``note_demand()`` đều set ``_wake``, nên phản ứng gần như tức
                # thì. ``_TICK_SEC`` chỉ còn là lưới an toàn cho trường hợp không
                # ai đánh thức (socket già đi trong lúc pool đang rỗi).
                _wake.wait(_TICK_SEC)
                _wake.clear()
                continue

            _wake.clear()
            socket = _open_warm_socket()
            failures = 0
            handed_over = False
            with _lock:
                if _warm is None and not _stop.is_set():
                    _warm = socket
                    stats_opened += 1
                    handed_over = True
            if not handed_over:
                # Ai đó đã đặt socket khác vào chỗ trong lúc ta bắt tay, hoặc app
                # đang tắt. Bỏ cái vừa mở, đừng để nó treo lơ lửng.
                socket.close()
        except Exception as exc:  # noqa: BLE001 — luồng nền KHÔNG được phép chết
            wait = _RETRY_BACKOFF_SEC[min(failures, len(_RETRY_BACKOFF_SEC) - 1)]
            failures += 1
            logger.warning("Hâm socket TTS thất bại (%s) — thử lại sau %.0fs", exc, wait)
            _stop.wait(wait)


def start() -> None:
    """Khởi động luồng nền. An toàn khi gọi nhiều lần.

    Luồng là daemon: nó chỉ giữ một socket ra ngoài, không có state cần dọn dẹp,
    nên không được phép chặn tiến trình thoát.
    """
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            return
        _stop.clear()
        _thread = threading.Thread(target=_maintain, name="tts-warm-socket", daemon=True)
        _thread.start()


def shutdown() -> None:
    """Dừng luồng nền và đóng socket đang giữ. Dùng khi tắt app và trong test."""
    global _warm, _thread
    _stop.set()
    _wake.set()   # gỡ luồng khỏi ``_wake.wait`` để nó thấy cờ dừng ngay
    thread = _thread
    if thread is not None and thread.is_alive():
        thread.join(timeout=3)
    with _lock:
        socket, _warm = _warm, None
        _thread = None
    if socket is not None:
        socket.close()


def stats() -> dict:
    with _lock:
        return {
            "warm": _warm is not None,
            "warm_age": round(_warm.age, 1) if _warm else None,
            "served": stats_served,
            "missed": stats_missed,
            "opened": stats_opened,
            "expired": stats_expired,
        }


def reset_for_test() -> None:
    """Xoá sạch trạng thái để lượt không rò giữa các ca test."""
    global _warm, _last_demand_at, stats_served, stats_missed, stats_opened, stats_expired
    shutdown()
    with _lock:
        _warm = None
        _last_demand_at = 0.0
        stats_served = stats_missed = stats_opened = stats_expired = 0
    _stop.clear()
    _wake.clear()
