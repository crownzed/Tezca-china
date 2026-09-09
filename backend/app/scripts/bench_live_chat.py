"""
Đo độ trễ THỰC của live chat (voice chat) — theo từng chặng, bằng key thật.

Vì sao cần file này: repo chưa từng có benchmark latency nào, nên mọi con số
"trước/sau" trong kế hoạch tối ưu đều là số của bản báo cáo, không rõ nguồn.
Không có baseline đo được thì không biết việc tối ưu có tác dụng thật hay không.

Chạy:
    cd backend && python -m app.scripts.bench_live_chat
    cd backend && python -m app.scripts.bench_live_chat --runs 3 --old

CẢNH BÁO: script gọi API TRẢ TIỀN thật (TTS + ASR provider chính, speech API). Một lượt
--runs 1 tiêu khoảng: 2 lượt TTS (~40 ký tự) + 1 lượt ASR (~3s audio) + 1 lượt
LLM stream. Mặc định 1 lần để không đốt quota; --old thêm 1 ASR + 1 LLM nữa.

Đo cái gì: thời gian tới TIẾNG ĐẦU TIÊN, không phải tổng thời gian. Đó là con số
người học cảm nhận — họ nói xong rồi chờ nghe câu trả lời, và câu 2 phát trong
lúc họ đang nghe câu 1 nên không tính vào độ trễ cảm nhận.

    ASR -> LLM tới câu 1 -> TTS câu 1  = tiếng đầu tiên

Đường CŨ (--old) để có baseline so sánh: /transcribe rồi /chat, hai request
speech API tách biệt, rồi TTS TRỌN câu trả lời.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import statistics
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.settings import settings  # noqa: E402
from app.services import speech_ai_service as svc  # noqa: E402
from app.services import tts_socket_pool  # noqa: E402
from app.routers import tts as tts_router  # noqa: E402

# Câu người học "nói". Chọn câu ngắn, thường gặp, có thanh điệu đủ dạng — dài
# hơn thì ASR chậm theo độ dài audio và làm mờ phần latency cố định.
SAMPLE_UTTERANCE = "你好，我今天想练习说中文。"


def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _synth_wav(text: str) -> tuple[bytes, float]:
    """Dựng audio đầu vào bằng chính TTS provider chính, xin thẳng WAV.

    Vì sao không đọc file trong ``public/audio``: kho đó là MP3, còn client thật
    (``speech-ai.js``) gửi WAV 16kHz mono — đo trên MP3 sẽ đo sai nhánh format
    của ``_stepfun_asr``. Không có ffmpeg trong môi trường này để chuyển.

    Cache ra ``%TEMP%`` theo hash của text: chạy lại script không phải trả tiền
    dựng lại đúng một đoạn audio giống hệt. Audio đầu vào không phải thứ đang đo.
    """
    cached = Path(tempfile.gettempdir()) / f"bench_live_chat_{_text_hash(text)}.wav"
    if cached.exists():
        return cached.read_bytes(), 0.0

    keys = settings.stepfun_keys_list
    if not keys:
        raise SystemExit("Cần TTS primary keys trong backend/.env để đo.")
    body = json.dumps(
        {
            "model": settings.stepfun_tts_model,
            "input": text,
            "voice": settings.stepfun_tts_voice,
            "response_format": "wav",
            "sample_rate": 16000,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        settings.stepfun_tts_url,
        data=body,
        headers={
            "Authorization": f"Bearer {keys[0]}",
            "Content-Type": "application/json",
            "Accept": "audio/wav",
        },
        method="POST",
    )
    started = time.monotonic()
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    cached.write_bytes(data)
    return data, (time.monotonic() - started) * 1000


def bench_new(audio_b64: str) -> dict:
    """Đường MỚI: stream_voice_chat, dừng đồng hồ ở câu tiếng Trung đầu tiên."""
    t0 = time.monotonic()
    transcript_ms = first_sentence_ms = None
    first_chunk_ms = None
    user_text = ""
    first_sentence = ""

    for frame in svc.stream_voice_chat(
        audio_b64=audio_b64, mime_type="audio/wav", history=[]
    ):
        # frame là chuỗi SSE "data: {...}\n\n" — parse lại đúng như client làm.
        payload = frame.split("data: ", 1)[-1].strip()
        if not payload:
            continue
        event = json.loads(payload)
        etype = event.get("type")
        if etype == "transcript" and transcript_ms is None:
            transcript_ms = (time.monotonic() - t0) * 1000
            user_text = event.get("user_text", "")
        elif etype == "chunk" and first_chunk_ms is None:
            first_chunk_ms = (time.monotonic() - t0) * 1000
        elif etype == "sentence" and first_sentence_ms is None:
            first_sentence_ms = (time.monotonic() - t0) * 1000
            first_sentence = event.get("text", "")
            break  # phần còn lại phát trong lúc người học nghe câu 1
        elif etype == "error":
            raise RuntimeError(event.get("detail", "lỗi không rõ"))

    if not first_sentence:
        raise RuntimeError("Stream không phát được câu nào.")

    t_tts = time.monotonic()
    # Đi qua ĐÚNG đường mà chế độ gọi dùng: socket streaming + pool hâm sẵn. Gọi
    # ``_stepfun_synth`` (HTTP) ở đây sẽ đo một đường mà client không còn dùng, và
    # bỏ qua toàn bộ phần tối ưu — sai lệch ~1.5s.
    tts_bytes = 0
    first_audio_ms = None
    for chunk in tts_router._stepfun_stream_synth(first_sentence):
        if first_audio_ms is None:
            first_audio_ms = (time.monotonic() - t_tts) * 1000
        tts_bytes += len(chunk)
    tts_ms = first_audio_ms if first_audio_ms is not None else (time.monotonic() - t_tts) * 1000
    if not tts_bytes:
        raise RuntimeError("TTS câu 1 thất bại.")

    return {
        "asr_ms": transcript_ms,
        "llm_first_chunk_ms": (first_chunk_ms or 0) - (transcript_ms or 0),
        "llm_first_sentence_ms": (first_sentence_ms or 0) - (transcript_ms or 0),
        "tts_ms": tts_ms,
        "time_to_first_audio_ms": (first_sentence_ms or 0) + tts_ms,
        "user_text": user_text,
        "first_sentence": first_sentence,
    }


def bench_old(audio_b64: str) -> dict:
    """Đường CŨ: /transcribe rồi /chat (hai request), TTS TRỌN câu trả lời.

    Ép ``transcribe_speech`` đi provider phụ bằng cách tắt tạm ``stepfun_keys_list``:
    đường cũ chưa có ASR provider chính, so sánh phải trung thực với thời điểm đó.
    """
    original = settings.stepfun_api_keys
    t0 = time.monotonic()
    try:
        settings.stepfun_api_keys = ""
        user_text = svc.transcribe_speech(audio_b64, "audio/wav")
    finally:
        settings.stepfun_api_keys = original
    asr_ms = (time.monotonic() - t0) * 1000

    t1 = time.monotonic()
    result = svc.voice_chat(
        audio_b64=audio_b64, mime_type="audio/wav", history=[], text=""
    )
    llm_ms = (time.monotonic() - t1) * 1000
    reply_cn = str(result.get("reply_cn", "")).strip()
    if not reply_cn:
        raise RuntimeError("voice_chat không trả về reply_cn.")

    t2 = time.monotonic()
    mp3 = tts_router._stepfun_synth(reply_cn)
    tts_ms = (time.monotonic() - t2) * 1000
    if mp3 is None:
        raise RuntimeError("TTS trọn câu thất bại.")

    return {
        "asr_ms": asr_ms,
        "llm_ms": llm_ms,
        "tts_ms": tts_ms,
        "time_to_first_audio_ms": asr_ms + llm_ms + tts_ms,
        "user_text": user_text,
        "reply_cn": reply_cn,
    }


def _fmt(ms: float | None) -> str:
    return "   n/a" if ms is None else f"{ms / 1000:6.2f}s"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--runs", type=int, default=1, help="số lượt đo (mặc định 1)")
    ap.add_argument("--old", action="store_true", help="đo cả đường cũ để so sánh")
    ap.add_argument("--text", default=SAMPLE_UTTERANCE, help="câu để dựng audio")
    args = ap.parse_args()

    print(f"Provider: primary keys={len(settings.stepfun_keys_list)} "
          f"speech keys={len(settings.gemini_native_keys_list)} "
          f"model={settings.gemini_native_model}")
    print(f'Câu mẫu: "{args.text}"')

    # Luồng hâm socket TTS: script này gọi service trực tiếp, không qua uvicorn, nên
    # phải tự khởi động — nếu không thì chặng TTS bị đo ở trạng thái luôn-miss và
    # cao hơn thực tế ~1.5s.
    tts_socket_pool.start()
    tts_socket_pool.note_demand()
    try:
        return _run(args)
    finally:
        tts_socket_pool.shutdown()


def _run(args) -> int:
    wav, synth_ms = _synth_wav(args.text)
    audio_b64 = base64.b64encode(wav).decode("ascii")
    print(f"Audio đầu vào: {len(wav):,} bytes WAV (dựng mất {synth_ms / 1000:.2f}s, "
          f"KHÔNG tính vào kết quả)\n")

    new_runs: list[dict] = []
    old_runs: list[dict] = []
    for i in range(1, args.runs + 1):
        try:
            r = bench_new(audio_b64)
            new_runs.append(r)
            print(f"[MỚI {i}] ASR {_fmt(r['asr_ms'])} | LLM→câu1 "
                  f"{_fmt(r['llm_first_sentence_ms'])} | TTS {_fmt(r['tts_ms'])} "
                  f"=> tiếng đầu {_fmt(r['time_to_first_audio_ms'])}")
            print(f"         nghe được: {r['user_text']!r} -> {r['first_sentence']!r}")
        except Exception as exc:  # noqa: BLE001
            print(f"[MỚI {i}] THẤT BẠI: {exc}")

        if args.old:
            try:
                r = bench_old(audio_b64)
                old_runs.append(r)
                print(f"[CŨ  {i}] ASR {_fmt(r['asr_ms'])} | LLM {_fmt(r['llm_ms'])} "
                      f"| TTS {_fmt(r['tts_ms'])} "
                      f"=> tiếng đầu {_fmt(r['time_to_first_audio_ms'])}")
            except Exception as exc:  # noqa: BLE001
                print(f"[CŨ  {i}] THẤT BẠI: {exc}")

    def summarize(label: str, runs: list[dict]) -> float | None:
        if not runs:
            return None
        vals = [r["time_to_first_audio_ms"] for r in runs]
        med = statistics.median(vals)
        print(f"\n{label}: n={len(vals)} min {_fmt(min(vals))} "
              f"trung vị {_fmt(med)} max {_fmt(max(vals))}")
        return med

    med_new = summarize("Tiếng đầu tiên — đường MỚI", new_runs)
    med_old = summarize("Tiếng đầu tiên — đường CŨ ", old_runs)
    if med_new and med_old:
        print(f"\nCải thiện: {(med_old - med_new) / 1000:.2f}s nhanh hơn "
              f"({med_old / med_new:.2f}x)")
    return 0 if new_runs else 1


if __name__ == "__main__":
    raise SystemExit(main())
