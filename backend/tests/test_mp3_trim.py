"""Test cho mp3_trim — cắt lặng đầu/cuối bằng cách bỏ frame, không giải mã lại.

Chạy: cd backend && python -m pytest tests/test_mp3_trim.py

Vì sao module này tồn tại: đo 400 clip lấy mẫu của kho tĩnh, khoảng lặng ĐẦU trải
từ 120ms tới 760ms (trung vị 260ms). Cùng một cú bấm "Nghe" mà lúc kêu ngay lúc
trễ nửa giây thì người dùng đọc thành "máy lag". Provider không có tham số nào điều
khiển việc này (đã dò), nên phải cắt ở phía ta.

Điều được khoá ở đây, theo thứ tự nghiêm ngặt giảm dần:
  - KHÔNG BAO GIỜ trả bytes hỏng. Mọi ca bất định (không phải MP3, header rác,
    thiếu dependency giải mã) phải trả về bytes GỐC. Hàm này nằm trên đường phục vụ
    audio: "không làm gì" phải luôn là nhánh an toàn.
  - Cắt theo BIÊN FRAME. Cắt giữa frame là file hỏng, và lỗi đó chỉ nghe ra chứ
    không crash.
  - Giữ ID3. Bỏ tag thì một số browser đoán sai định dạng.
  - Giữ đủ đệm đầu. Bit reservoir cho phép frame tham chiếu tới ~511 byte của các
    frame TRƯỚC; cắt sát mép sinh một tiếng tách. Đệm 80ms đẩy chỗ lỗi đó vào phần
    im lặng.
"""
import os
import struct
import unittest

from app.services import mp3_trim


def _mpeg2_frame(payload_byte: int = 0x00, bitrate_idx: int = 12,
                 sr_idx: int = 1) -> bytes:
    """Một frame MPEG2 Layer III hợp lệ, mặc định 128kbps @24kHz (như StepFun).

    Dựng bằng tay thay vì lấy file thật: test phải chạy được mà không cần
    ``public/audio`` (CI có thể clone không kèm kho MP3 15k file).
    """
    # 11 bit sync + version 2 (10) + layer III (01) + no CRC (1)
    header = 0xFFF3_0000
    header |= (bitrate_idx & 0xF) << 12
    header |= (sr_idx & 0x3) << 10
    header |= 0b11 << 6          # channel mode: mono
    raw = struct.pack(">I", header)
    length = int(72000 * mp3_trim._BR_V2[bitrate_idx] / mp3_trim._SR_V2[sr_idx])
    return raw + bytes([payload_byte]) * (length - 4)


def _id3(size: int = 20) -> bytes:
    body = bytes(size)
    syncsafe = bytes([(size >> 21) & 0x7F, (size >> 14) & 0x7F,
                      (size >> 7) & 0x7F, size & 0x7F])
    return b"ID3\x04\x00\x00" + syncsafe + body


class FrameOffsetsTest(unittest.TestCase):
    def test_walks_a_clean_frame_sequence(self):
        data = _id3() + b"".join(_mpeg2_frame() for _ in range(6))
        id3_end, frames, samples = mp3_trim.frame_offsets(data)
        self.assertEqual(id3_end, 30)
        self.assertEqual(len(frames), 6)
        self.assertEqual(samples, 576)  # MPEG2 Layer III
        # Các frame phải liền kề nhau, không hở byte nào: nếu hở thì phép cắt sẽ
        # tính sai chỉ số và cắt vào giữa frame.
        for i in range(1, len(frames)):
            prev_off, prev_len = frames[i - 1]
            self.assertEqual(frames[i][0], prev_off + prev_len)

    def test_stops_at_garbage_instead_of_guessing(self):
        data = _id3() + _mpeg2_frame() + b"\x00" * 400 + _mpeg2_frame()
        _, frames, _ = mp3_trim.frame_offsets(data)
        self.assertEqual(len(frames), 1)

    def test_no_id3_is_fine(self):
        data = b"".join(_mpeg2_frame() for _ in range(4))
        id3_end, frames, _ = mp3_trim.frame_offsets(data)
        self.assertEqual(id3_end, 0)
        self.assertEqual(len(frames), 4)


class TrimSafetyTest(unittest.TestCase):
    """Mọi ca bất định phải trả bytes GỐC, không phải bytes ngắn hơn."""

    def test_too_short_is_returned_unchanged(self):
        data = b"ID3" + b"\x00" * 100
        self.assertIs(mp3_trim.trim_silence(data), data)

    def test_empty_is_returned_unchanged(self):
        self.assertEqual(mp3_trim.trim_silence(b""), b"")

    def test_non_mp3_is_returned_unchanged(self):
        data = b"RIFF" + b"\x00" * 2000
        self.assertIs(mp3_trim.trim_silence(data), data)

    def test_too_few_frames_is_returned_unchanged(self):
        """Dưới 4 frame thì cắt xong chẳng còn gì; giữ nguyên."""
        data = _id3() + _mpeg2_frame() + _mpeg2_frame()
        self.assertIs(mp3_trim.trim_silence(data), data)

    def test_undecodable_audio_is_returned_unchanged(self):
        """Header hợp lệ nhưng payload là số 0 -> không có tiếng nào.

        Đây là ca quan trọng: nếu ``_voiced_bounds`` trả None mà ta vẫn cắt thì mọi
        clip im lặng sẽ bị cắt về rỗng.
        """
        data = _id3() + b"".join(_mpeg2_frame() for _ in range(30))
        self.assertIs(mp3_trim.trim_silence(data), data)


class TrimBoundaryTest(unittest.TestCase):
    """Cắt phải theo biên frame và giữ ID3 — kiểm bằng clip THẬT nếu có."""

    @classmethod
    def setUpClass(cls):
        root = os.path.join(os.path.dirname(__file__), "..", "..", "public", "audio")
        index = os.path.join(root, "index.json")
        cls.clip = None
        if not os.path.exists(index):
            return
        import json
        with open(index, encoding="utf-8") as fh:
            idx = json.load(fh)
        # Câu dài để chắc chắn có lặng đầu đáng kể mà cắt.
        for text, stem in idx.items():
            if 8 <= len(text) <= 14:
                path = os.path.join(root, f"{stem}.mp3")
                if os.path.exists(path):
                    with open(path, "rb") as fh:
                        cls.clip = fh.read()
                    cls.clip_text = text
                    break

    def setUp(self):
        if self.clip is None:
            self.skipTest("cần public/audio để kiểm trên clip thật")

    def test_result_is_frame_aligned_with_no_leftover_bytes(self):
        """Byte dư ở cuối = đã cắt giữa frame. Chỉ nghe ra, không crash."""
        cut = mp3_trim.trim_silence(self.clip)
        _, frames, _ = mp3_trim.frame_offsets(cut)
        self.assertGreater(len(frames), 0)
        last_off, last_len = frames[-1]
        self.assertEqual(len(cut) - (last_off + last_len), 0)

    def test_id3_tag_is_preserved(self):
        cut = mp3_trim.trim_silence(self.clip)
        self.assertEqual(cut[:3], self.clip[:3])
        self.assertEqual(
            mp3_trim.frame_offsets(cut)[0], mp3_trim.frame_offsets(self.clip)[0]
        )

    def test_result_is_shorter_but_not_drastically(self):
        """Cắt được nhưng không được ăn vào chữ. Lặng đầu+đuôi đo trên kho là
        ~500ms tổng, tức phần cắt phải nhỏ hơn nửa file."""
        cut = mp3_trim.trim_silence(self.clip)
        self.assertLess(len(cut), len(self.clip))
        self.assertGreater(len(cut), len(self.clip) * 0.5)

    def test_trimming_is_idempotent(self):
        """Cắt lần hai không được cắt thêm. Nếu có thì mỗi lần đi qua cache lại
        ngắn đi một chút, và cuối cùng mất chữ."""
        once = mp3_trim.trim_silence(self.clip)
        twice = mp3_trim.trim_silence(once)
        self.assertEqual(len(twice), len(once))

    def test_leading_silence_is_reduced_to_the_pad(self):
        """Đây là mục đích tồn tại của module: đầu âm về một mức CỐ ĐỊNH."""
        try:
            import numpy as np
            import parselmouth
        except ImportError:
            self.skipTest("cần parselmouth để đo khoảng lặng")

        import tempfile

        def lead_ms(data: bytes) -> float:
            fd, path = tempfile.mkstemp(suffix=".mp3")
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            try:
                snd = parselmouth.Sound(path)
                y = snd.values[0].astype(np.float64)
                sr = snd.sampling_frequency
                peak = float(np.max(np.abs(y))) or 1e-9
                win = max(1, int(0.010 * sr))
                n = (y.size // win) * win
                fr = np.sqrt(np.mean(y[:n].reshape(-1, win) ** 2, axis=1))
                v = np.nonzero(fr > max(peak * 10 ** (-45 / 20), 1e-5))[0]
                return float(v[0]) * win / sr * 1000 if v.size else 0.0
            finally:
                try:
                    os.remove(path)
                except OSError:
                    pass

        before = lead_ms(self.clip)
        after = lead_ms(mp3_trim.trim_silence(self.clip))
        self.assertLessEqual(
            after, mp3_trim.DEFAULT_LEAD_PAD_MS + 60,
            f"lặng đầu {before:.0f}ms -> {after:.0f}ms, vẫn quá mức đệm",
        )


if __name__ == "__main__":
    unittest.main()
