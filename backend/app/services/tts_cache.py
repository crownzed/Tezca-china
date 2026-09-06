"""Cache audio TTS trong RAM, dùng chung cho MỌI provider của /tts.

Vì sao cần: /tts không cache gì cả, nên hai người học bấm "Nghe mẫu" trên cùng
một chữ là HAI lần gọi provider trả tiền — và trong một buổi học, cùng một từ
được đọc lại rất nhiều lần (flashcard lặp, quiz cùng bộ từ, SRS ôn lại). Kho MP3
tĩnh trong ``public/audio/`` chỉ phủ HSK1-4 (script chặn ``hsk_level <= 4``) nên
HSK5/6 luôn phải gọi cloud.

Chỉ có tầng RAM, KHÔNG có tầng đĩa — khác với ý tưởng ban đầu:
  - fly.io deploy dựng lại rootfs, nên cache đĩa cũng mất đúng lúc cache RAM mất;
    thứ duy nhất nó cứu được là restart tiến trình tại chỗ, việc hiếm và cache
    tự đầy lại trong vài phút.
  - Ngược lại, ghi đĩa trên máy shared-cpu-1x ephemeral là rủi ro thật (đầy đĩa
    làm chết cả app), và LRU trên đĩa cần theo dõi mtime + prune định kỳ.
Đánh đổi đó không đáng, nên bỏ tầng đĩa.

Giới hạn theo TỔNG SỐ BYTE chứ không theo số entry: máy fly chỉ có 512MB và
parselmouth/numpy đã cần phần lớn trong đó. Một clip từ đơn ~5-20KB, một câu
~40KB, nên trần 24MB giữ được cỡ 1000-4000 clip mà không bao giờ là bên gây OOM.
``functools.lru_cache`` không dùng được ở đây vì nó đếm entry, không đếm byte.
"""
from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict

# 24MB: đủ cho một buổi học nhiều người mà vẫn là phần nhỏ của 512MB.
MAX_CACHE_BYTES = 24 * 1024 * 1024
# Bỏ qua clip lớn bất thường: một entry chiếm cả cache sẽ đẩy hết phần còn lại ra.
MAX_ENTRY_BYTES = 2 * 1024 * 1024

_lock = threading.Lock()
# key -> (audio_bytes, media_type). OrderedDict + move_to_end = LRU.
_entries: OrderedDict[str, tuple[bytes, str]] = OrderedDict()
_total_bytes = 0

# Đếm để test và /health kiểm được cache có thật sự hoạt động.
hits = 0
misses = 0


def cache_key(text: str, **params: object) -> str:
    """Khoá sha256 từ text + mọi tham số ẢNH HƯỞNG tới bytes trả về.

    ``key_index`` KHÔNG nằm trong khoá: nó chỉ chọn key nào của cùng một provider,
    cùng voice, nên bytes như nhau — để vào khoá thì 3 worker build audio mỗi
    worker một cache riêng, mất trắng phần chia sẻ.

    ``no_gemini`` thì CÓ, vì nó đổi provider phục vụ khi StepFun không khả dụng
    (ElevenLabs thay vì Gemini) — tức đổi giọng thật. Chấp nhận trường hợp một
    text được cache hai lần cho hai biến thể: 2 lần gọi provider thay vì 1, vẫn
    hơn N lần, và không bao giờ trả giọng của provider khác.
    """
    parts = [text]
    for name in sorted(params):
        parts.append(f"{name}={params[name]}")
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def get(key: str) -> tuple[bytes, str] | None:
    """Bytes + media_type đã cache, hoặc None. Hit sẽ làm entry mới lại (LRU)."""
    global hits, misses
    with _lock:
        entry = _entries.get(key)
        if entry is None:
            misses += 1
            return None
        _entries.move_to_end(key)
        hits += 1
        return entry


def put(key: str, audio: bytes, media_type: str) -> None:
    """Lưu clip, đẩy entry cũ nhất ra khi vượt trần byte."""
    global _total_bytes
    size = len(audio)
    if not size or size > MAX_ENTRY_BYTES:
        return
    with _lock:
        old = _entries.pop(key, None)
        if old is not None:
            _total_bytes -= len(old[0])
        _entries[key] = (audio, media_type)
        _total_bytes += size
        while _total_bytes > MAX_CACHE_BYTES and _entries:
            _, (evicted, _mt) = _entries.popitem(last=False)
            _total_bytes -= len(evicted)


def stats() -> dict:
    with _lock:
        return {
            "entries": len(_entries),
            "bytes": _total_bytes,
            "hits": hits,
            "misses": misses,
        }


def clear() -> None:
    """Xoá sạch cache. Dùng trong test để lượt không rò giữa các ca."""
    global _total_bytes, hits, misses
    with _lock:
        _entries.clear()
        _total_bytes = 0
        hits = 0
        misses = 0
