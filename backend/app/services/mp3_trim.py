"""Cắt khoảng lặng đầu/cuối của MP3 bằng cách BỎ FRAME, không giải mã lại.

Vì sao cần: đo trên 400 clip lấy mẫu của kho tĩnh, khoảng lặng ĐẦU trải từ 120ms
tới 760ms (trung vị 260ms). Cùng một thao tác "bấm Nghe" nên cho cùng một cảm giác
phản hồi; 640ms chênh lệch là thứ người dùng đọc thành "lúc nhanh lúc chậm".
Khoảng lặng CUỐI thì tệ hơn ở đường hội thoại: 760-940ms so với 195ms của /tts,
tức gần một giây chết sau mỗi câu.

Vì sao BỎ FRAME thay vì giải mã + mã hoá lại: môi trường không có encoder MP3 nào
(không ffmpeg, không lameenc, không pydub). Nhưng frame MP3 có độ dài tính được từ
header, nên cắt theo biên frame là phép sửa thuần cấu trúc — bytes còn lại y
nguyên, không mất thêm chất lượng vì nén lại.

RỦI RO đã cân và cách chặn: bit reservoir cho phép một frame tham chiếu tới ~511
byte main_data của các frame TRƯỚC nó. Bỏ frame đầu thì frame đầu tiên còn lại có
thể thiếu dữ liệu nó tham chiếu, sinh một tiếng tách. Vì vậy luôn CHỪA một khoảng
đệm im lặng (mặc định 80ms ~ 3 frame): chỗ lỗi nằm trong phần im lặng đó nên không
nghe ra. Cắt ĐUÔI không có rủi ro này — không frame nào tham chiếu về phía sau.
"""
from __future__ import annotations

import logging
import os
import struct
import tempfile

logger = logging.getLogger(__name__)

# Bảng bitrate/sample-rate của Layer III. MPEG2 và MPEG2.5 dùng chung bảng bitrate
# nhưng khác bảng sample rate. 24kHz (StepFun) là MPEG2; 44.1kHz (ElevenLabs) là
# MPEG1 — cả hai đều phải đi qua đây nên không được hardcode một bảng.
_BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SR_V1 = [44100, 48000, 32000, 0]
_SR_V2 = [22050, 24000, 16000, 0]
_SR_V25 = [11025, 12000, 8000, 0]

# Số mẫu mỗi frame: MPEG1 Layer III là 1152, MPEG2/2.5 Layer III là 576.
_SAMPLES_V1 = 1152
_SAMPLES_V2 = 576

# Đệm giữ lại. 80ms ≈ 3 frame ở 24kHz — đủ để tiếng tách do bit reservoir (nếu có)
# nằm trong phần im lặng. Đuôi giữ nhiều hơn: cắt sát làm câu nghe như bị ngắt.
DEFAULT_LEAD_PAD_MS = 80
DEFAULT_TAIL_PAD_MS = 150

# Ngưỡng "có tiếng": -45dB so với đỉnh của chính clip đó. Tương đối chứ không tuyệt
# đối, vì đỉnh giữa các provider lệch nhau (đo: -0.5 tới -4.1 dBFS).
_VOICE_FLOOR_DB = -45.0


def _id3_len(data: bytes) -> int:
    if len(data) < 10 or data[:3] != b"ID3":
        return 0
    size = 0
    for b in data[6:10]:
        size = (size << 7) | (b & 0x7F)
    return 10 + size


def frame_offsets(data: bytes) -> tuple[int, list[tuple[int, int]], int]:
    """Trả (độ dài ID3, [(offset, độ dài frame)], số mẫu mỗi frame).

    Dừng ở byte đầu tiên không phải header hợp lệ. Trả danh sách rỗng nếu không
    tìm được frame nào — caller phải coi đó là "không cắt được" và giữ nguyên bytes.
    """
    start = _id3_len(data)
    i = start
    frames: list[tuple[int, int]] = []
    samples = 0
    while i + 4 <= len(data):
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            break
        h = struct.unpack(">I", data[i:i + 4])[0]
        ver = (h >> 19) & 0x3
        layer = (h >> 17) & 0x3
        br_i = (h >> 12) & 0xF
        sr_i = (h >> 10) & 0x3
        pad = (h >> 9) & 0x1
        if layer != 1 or br_i in (0, 15) or sr_i == 3 or ver == 1:
            break
        if ver == 3:
            br, sr, samples = _BR_V1[br_i], _SR_V1[sr_i], _SAMPLES_V1
            coeff = 144000
        else:
            br, sr = _BR_V2[br_i], (_SR_V2 if ver == 2 else _SR_V25)[sr_i]
            samples = _SAMPLES_V2
            coeff = 72000
        if br == 0 or sr == 0:
            break
        length = int(coeff * br / sr) + pad
        if length <= 4 or i + length > len(data):
            break
        frames.append((i, length))
        i += length
    return start, frames, samples


def _voiced_bounds(data: bytes) -> tuple[float, float, float] | None:
    """Trả (giây bắt đầu có tiếng, giây kết thúc có tiếng, tổng giây).

    Giải mã bằng parselmouth — đã là dependency (praat-parselmouth) và đo được
    ~14ms cho một clip 40KB, tức không đáng kể so với 3.0s tổng hợp.
    """
    try:
        import numpy as np
        import parselmouth
    except Exception as exc:  # noqa: BLE001 — thiếu dep thì bỏ cắt, không làm chết request
        logger.warning("Không giải mã được để cắt lặng: %s", exc)
        return None

    path = None
    try:
        fd, path = tempfile.mkstemp(suffix=".mp3")
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        snd = parselmouth.Sound(path)
        y = snd.values[0].astype(np.float64)
        sr = snd.sampling_frequency
        if y.size < 256:
            return None
        peak = float(np.max(np.abs(y)))
        if peak <= 0:
            return None
        win = max(1, int(0.010 * sr))
        n = (y.size // win) * win
        rms = np.sqrt(np.mean(y[:n].reshape(-1, win) ** 2, axis=1))
        thr = max(peak * 10 ** (_VOICE_FLOOR_DB / 20), 1e-5)
        voiced = np.nonzero(rms > thr)[0]
        if voiced.size == 0:
            return None
        return (
            float(voiced[0]) * win / sr,
            float(voiced[-1] + 1) * win / sr,
            float(snd.duration),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Cắt lặng: giải mã thất bại (%s)", exc)
        return None
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


def trim_silence(
    data: bytes,
    lead_pad_ms: int = DEFAULT_LEAD_PAD_MS,
    tail_pad_ms: int = DEFAULT_TAIL_PAD_MS,
) -> bytes:
    """Cắt lặng đầu/cuối về đúng khoảng đệm, giữ nguyên ID3 và mọi frame còn lại.

    Trả về BYTES GỐC khi không chắc: không phải MP3, không parse được frame, không
    giải mã được, hoặc phép cắt không tiết kiệm được frame nào. Hàm này nằm trên
    đường phục vụ audio nên "không làm gì" phải luôn là nhánh an toàn.
    """
    if not data or len(data) < 512:
        return data

    id3_end, frames, samples_per_frame = frame_offsets(data)
    if len(frames) < 4 or samples_per_frame == 0:
        return data

    bounds = _voiced_bounds(data)
    if bounds is None:
        return data
    voice_start, voice_end, duration = bounds
    if duration <= 0:
        return data

    # Quy giây -> chỉ số frame qua TỶ LỆ thời lượng, không qua sample rate: một số
    # clip có encoder delay/padding nên số frame × mẫu/frame không khớp đúng thời
    # lượng parselmouth trả về. Dùng tỷ lệ thì lệch đó tự triệt tiêu.
    per_frame = duration / len(frames)
    keep_from = int(max(0.0, voice_start - lead_pad_ms / 1000.0) / per_frame)
    keep_to = min(len(frames),
                  int((voice_end + tail_pad_ms / 1000.0) / per_frame) + 1)
    if keep_to <= keep_from:
        return data

    # Cắt ít hơn 2 frame ở cả hai đầu thì không đáng: mỗi lần cắt là một lần frame
    # đầu mới phải chịu rủi ro bit reservoir.
    if keep_from < 2 and keep_to > len(frames) - 2:
        return data

    head = data[:id3_end]
    body_start = frames[keep_from][0]
    last_off, last_len = frames[keep_to - 1]
    return head + data[body_start:last_off + last_len]
