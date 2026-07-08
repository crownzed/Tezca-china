"""Rate limiter in-memory nhẹ (sliding window) cho các endpoint nhạy cảm.

Không thêm dependency ngoài; đủ cho deploy single-instance (Render free tier).
Nếu sau này scale ra nhiều instance/worker, thay bằng backend chia sẻ (Redis).
Trạng thái nằm trong RAM của tiến trình, reset khi khởi động lại.
"""
from __future__ import annotations

import threading
import time


class RateLimiter:
    """Giới hạn số lần gọi theo key trong một cửa sổ trượt.

    ``max_hits`` lần trong ``window_seconds`` giây cho mỗi key. Vượt ngưỡng →
    ``allow`` trả False cho tới khi các lần cũ rời khỏi cửa sổ.
    """

    def __init__(self, max_hits: int, window_seconds: float) -> None:
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if t > cutoff]
            if len(hits) >= self.max_hits:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            # Dọn định kỳ để dict không phình vô hạn theo số key khác nhau.
            if len(self._hits) > 4096:
                self._prune(cutoff)
            return True

    def _prune(self, cutoff: float) -> None:
        stale = [k for k, v in self._hits.items() if not any(t > cutoff for t in v)]
        for k in stale:
            del self._hits[k]
