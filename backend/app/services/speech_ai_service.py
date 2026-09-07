"""
Speech AI service — StepFun Step Plan + native Google Gemini.

Gemini native (``generativelanguage.googleapis.com``) nhận audio đầu vào, còn
relay vilao mà ``llm_generator_service`` dùng thì chỉ có text — nên hai tính năng
giọng nói gọi trực tiếp API native:

  Feature 1 — chấm phát âm:
    audio -> Gemini chép thành {hanzi, pinyin} -> ``pinyin_scorer`` chấm (tất
    định) -> ``_generate_phonetic_tip`` viết câu nhận xét từ chính kết quả chấm,
    ngay tại chỗ, KHÔNG có round-trip thứ hai.

  Feature 2 — hội thoại:
    audio -> StepFun ASR chép (Gemini là fallback) -> LLM trả lời. Bản
    ``stream_voice_chat`` phát transcript rồi từng CÂU qua SSE để client đọc câu
    1 trong lúc câu 2 còn đang sinh; ``voice_chat`` là bản một-lần cho ``/chat``.

Key không bao giờ ra khỏi backend; browser chỉ nói chuyện với router của ta.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import time
import urllib.error
import urllib.request

from ..settings import settings
from .pinyin_scorer import _extract_tone, score_pinyin
from .tone_dsp_service import ToneDspError, score_tones

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
TIMEOUT = 15

# Trần TỔNG thời gian cho cả vòng xoay key/attempt của một request.
#
# Vì sao cần cái này chứ không chỉ hạ ``TIMEOUT``: ladder là vòng lồng
# ``key × attempt``, nên TIMEOUT chỉ chặn được MỘT request. Với 5 key
# GEMINI_NATIVE_API_KEYS × 2 attempt × 15s, worst case là 150s — và trước khi
# gộp danh sách model bên dưới thì còn nhân 3 lần nữa thành 450s. fly.toml không
# đặt trần request nào, nên chuỗi đó chạy hết thật: người học thấy UI treo, còn
# fly giữ nguyên một worker suốt thời gian đó.
#
# 35s là ngân sách để ít nhất 2 key được thử trọn vẹn (2 × 15s = 30s) rồi còn
# chỗ báo lỗi. Hết deadline thì raise ngay thay vì bước vào attempt kế.
LADDER_DEADLINE_SEC = 35.0

# Chờ trước khi thử lại 429/503. Trước đây retry TỨC THÌ, mà 429 nghĩa là "đang
# quá hạn mức" — gọi lại ngay gần như chắc chắn 429 lần nữa, chỉ tốn một
# round-trip. Hai mốc cho MAX_RETRIES = 2 attempt.
_RETRY_BACKOFF_SEC = (0.5, 1.5)

# Model native Gemini để thử, theo thứ tự.
#
# CHỈ MỘT phần tử, có chủ ý. Trước đây chỗ này là ``[gemini_native_model,
# "gemini-flash-lite-latest", "gemini-3.1-flash-lite"]`` — lặp nguyên văn ở hai
# hàm — khiến ladder dài gấp 3. Nhưng hai model "dự phòng" đó không cứu được ca
# lỗi thật nào: 429/quota gắn với KEY (đã xoay vòng ở vòng trong), còn 404
# model-not-found thì thử model khác cùng key cũng vô nghĩa vì key nào cũng thấy
# cùng tập model. Đổi model là việc của ``GEMINI_NATIVE_MODEL`` trong env.
_CANDIDATE_MODELS = (settings.gemini_native_model,)


class _LadderDeadline:
    """Đồng hồ đếm ngược dùng chung cho cả ladder của MỘT request.

    ``time.monotonic()`` chứ không phải ``time.time()``: đồng hồ hệ thống có thể
    bị NTP nhảy lùi giữa lúc chạy, và khi đó deadline theo wall-clock sẽ giãn ra
    đúng lúc ta cần nó siết lại.
    """

    def __init__(self, budget_sec: float = LADDER_DEADLINE_SEC) -> None:
        self.budget = budget_sec
        self._start = time.monotonic()

    @property
    def remaining(self) -> float:
        return self.budget - (time.monotonic() - self._start)

    def expired(self) -> bool:
        return self.remaining <= 0

    def timeout_for(self, per_request: int = TIMEOUT) -> int:
        """Timeout cho request kế: không bao giờ vượt phần ngân sách còn lại.

        Nếu không kẹp lại, một attempt bắt đầu khi còn 2s ngân sách vẫn được
        phép chạy 15s — tức deadline bị vượt đúng ở attempt cuối, chỗ khó thấy
        nhất. Sàn 1s để urllib không nhận timeout <= 0.
        """
        return max(1, min(per_request, int(self.remaining)))


def _post(url: str, payload: dict, timeout: int = TIMEOUT) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _call_native_gemini(
    parts: list[dict],
    *,
    json_mode: bool = False,
    timeout: int = TIMEOUT,
    deadline: _LadderDeadline | None = None,
) -> str:
    """Call native Gemini generateContent, rotating through configured keys.

    ``parts`` is the list of content parts for a single user turn (text and/or
    inline audio). Returns the model's text output. Raises RuntimeError if all
    keys fail hoặc hết ngân sách ``LADDER_DEADLINE_SEC``.

    ``deadline`` cho phép caller đã tiêu một phần ngân sách (vd StepFun ASR thử
    trước rồi mới fallback sang đây) truyền tiếp đồng hồ, để tổng thời gian một
    request vẫn nằm trong một trần duy nhất thay vì mỗi tầng một trần riêng.
    """
    keys = settings.gemini_native_keys_list
    if not keys:
        raise RuntimeError("GEMINI_NATIVE_API_KEYS chưa được cấu hình.")

    clock = deadline or _LadderDeadline()

    payload: dict = {"contents": [{"role": "user", "parts": parts}]}
    if json_mode:
        payload["generationConfig"] = {"response_mime_type": "application/json"}

    errors: list[str] = []
    for model in _CANDIDATE_MODELS:
        for idx, key in enumerate(keys):
            url = f"{settings.gemini_native_url}/models/{model}:generateContent?key={key}"
            for attempt in range(MAX_RETRIES):
                if clock.expired():
                    errors.append(f"hết ngân sách {clock.budget:.0f}s")
                    raise RuntimeError("Gemini native API thất bại: " + " | ".join(errors[:6]))
                try:
                    result = _post(url, payload, clock.timeout_for(timeout))
                    cand = (result.get("candidates") or [{}])[0]
                    text = "".join(
                        p.get("text", "") for p in cand.get("content", {}).get("parts", [])
                    )
                    if text:
                        return text
                    errors.append(f"{model} key#{idx}: empty response")
                    break
                except urllib.error.HTTPError as e:
                    body = e.read().decode("utf-8")[:200] if hasattr(e, "read") else ""
                    errors.append(f"{model} key#{idx}: HTTP {e.code} {body}")
                    if e.code in (429, 500, 503) and attempt + 1 < MAX_RETRIES:
                        # Chờ trước khi thử lại: 429 = "đang quá hạn mức", gọi
                        # lại tức thì chỉ tốn thêm một round-trip. Không chờ quá
                        # phần ngân sách còn lại.
                        pause = min(_RETRY_BACKOFF_SEC[attempt], max(0.0, clock.remaining))
                        if pause > 0:
                            time.sleep(pause)
                        continue
                    break  # auth/quota errors: move to next key
                except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
                    errors.append(f"{model} key#{idx}: {e}")
                    continue

    raise RuntimeError("Gemini native API thất bại: " + " | ".join(errors[:6]))


def _parse_json(text: str) -> dict:
    """Tolerant JSON parse (strips ```json fences if present)."""
    t = text.strip()
    if t.startswith("```json"):
        t = t[7:]
    elif t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return json.loads(t.strip())


def _audio_part(audio_b64: str, mime_type: str) -> dict:
    return {"inline_data": {"mime_type": mime_type, "data": audio_b64}}


# ---------------------------------------------------------------------------
# Feature 1 — pronunciation scoring
# ---------------------------------------------------------------------------

def score_pronunciation(
    audio_b64: str,
    mime_type: str,
    target_hanzi: str,
    target_pinyin: str = "",
) -> dict:
    """Score the user's recording against ``target_hanzi``.

    Combines two complementary layers so neither can be gamed:

      Identity layer (what was said): Gemini transcribes the audio to hanzi +
      tone-marked pinyin; pinyin_scorer compares it to the target
      deterministically (missing/extra/wrong syllables, tone-mark mismatches).

      Acoustic layer (how tones were realized): tone_dsp_service extracts the
      real F0 contour and DTW-aligns each syllable against its Chao tone
      template — this verifies the actual pitch shape, which the LLM cannot.

    The final score blends both. The acoustic layer is best-effort: if the
    audio isn't decodable WAV or no F0 is found, scoring degrades gracefully to
    the identity layer alone rather than failing the request.
    """
    transcribe_prompt = (
        "Bạn là giám khảo phát âm tiếng Trung. Người học vừa cố đọc câu mục tiêu.\n"
        f"CÂU MỤC TIÊU (chữ Hán): {target_hanzi}\n"
        + (f"PINYIN MỤC TIÊU (tham khảo): {target_pinyin}\n" if target_pinyin else "")
        + "Hãy NGHE đoạn ghi âm và trả về JSON THUẦN (không markdown) gồm:\n"
        '{\n'
        '  "actual_hanzi": "chữ Hán đúng như người học đã đọc (có thể khác câu mục tiêu)",\n'
        '  "actual_pinyin": "pinyin của những gì người học thực sự đọc, có DẤU THANH, cách nhau bằng dấu cách",\n'
        '  "target_pinyin": "pinyin chuẩn của CÂU MỤC TIÊU, có DẤU THANH, cách nhau bằng dấu cách"\n'
        "}\n"
        "Quy tắc: mỗi âm tiết là một token tách bằng dấu cách; dùng dấu thanh "
        "(ā á ǎ à) chứ không dùng số. Chỉ trả JSON."
    )

    raw = _call_native_gemini(
        [{"text": transcribe_prompt}, _audio_part(audio_b64, mime_type)],
        json_mode=True,
    )
    data = _parse_json(raw)
    actual_pinyin = str(data.get("actual_pinyin", "")).strip()
    actual_hanzi = str(data.get("actual_hanzi", "")).strip()
    # Prefer DB-provided target pinyin; fall back to the model's transcription.
    resolved_target = (target_pinyin or str(data.get("target_pinyin", ""))).strip()

    if not resolved_target:
        raise RuntimeError("Không xác định được pinyin mục tiêu để chấm điểm.")

    breakdown = score_pinyin(resolved_target, actual_pinyin)
    identity_score = breakdown["score"]

    # --- Acoustic layer (best-effort) --------------------------------------
    target_tones = [_extract_tone(s) for s in resolved_target.split() if s]
    tone_result = _score_tones_safe(audio_b64, target_tones)

    if tone_result is not None:
        dsp_tone_accuracy = tone_result["tone_accuracy"]
        fluency = tone_result.get("fluency")
        prosody = tone_result.get("prosody")
        macro_feedback = tone_result.get("macro_feedback", "")
        # The acoustic layer measures tones from the real F0 contour, so we blend
        # against base_score (syllable identity, tones stripped) rather than
        # identity_score — that avoids scoring tones twice and keeps the 60/40
        # syllable/tone weighting pinyin_scorer was designed around.
        #
        # But DSP alone deciding 40% of the grade lets a lenient or mis-split
        # acoustic result inflate the score even when Gemini clearly heard a wrong
        # tone. So we cross-check: take the WORSE of the DSP accuracy and Gemini's
        # own tone-correct ratio. Either layer can veto a tone. (syllable_errors
        # are excluded here — they already lower base_score, so counting them again
        # would double-penalize the 0.6 term.)
        # Mẫu số là số slot có thanh XÁC ĐỊNH (tone_total) — cùng tập slot mà
        # DSP chấm (đã loại thanh nhẹ). Dùng len(target_tones) như trước sẽ pha
        # loãng tỉ lệ khi có âm thanh nhẹ. Khi không có slot nào chấm được, chỉ
        # dùng DSP (đã tự loại thanh nhẹ khỏi trung bình của nó).
        n_tone_slots = breakdown["tone_total"]
        if n_tone_slots > 0:
            gemini_tone_ratio = max(0.0, 1.0 - len(breakdown["tone_errors"]) / n_tone_slots)
            tone_accuracy = min(dsp_tone_accuracy, gemini_tone_ratio)
        else:
            tone_accuracy = dsp_tone_accuracy
        final_score = round(breakdown["base_score"] * 0.6 + tone_accuracy * 100 * 0.4)
        dsp_feedback = tone_result["feedback"]
        per_syllable = tone_result["per_syllable"]
        f0_contour = tone_result["user_f0_contour"]
    else:
        tone_accuracy = None
        final_score = identity_score
        dsp_feedback = ""
        per_syllable = []
        f0_contour = []
        fluency = None
        prosody = None
        macro_feedback = ""

    tip = _pronunciation_tip(
        target_hanzi,
        breakdown,
        dsp_feedback,
        per_syllable=per_syllable,
        fluency=fluency,
        prosody=prosody,
    )

    return {
        "score": final_score,
        "base_score": breakdown["base_score"],
        "identity_score": identity_score,
        "tone_accuracy": tone_accuracy,
        "target_hanzi": target_hanzi,
        "target_pinyin": resolved_target,
        "actual_hanzi": actual_hanzi,
        "actual_pinyin": actual_pinyin,
        "tone_errors": breakdown["tone_errors"],
        "syllable_errors": breakdown["syllable_errors"],
        "tone_syllables": per_syllable,
        "user_f0_contour": f0_contour,
        "fluency": fluency,
        "prosody": prosody,
        "detailed_feedback": dsp_feedback,
        "macro_feedback": macro_feedback,
        "tip": tip,
    }


def _score_tones_safe(audio_b64: str, target_tones: list[int]) -> dict | None:
    """Run acoustic tone scoring, returning None on any non-fatal failure.

    The DSP layer needs decodable WAV PCM and a detectable F0; if the clip is
    in another container or too noisy, we skip it rather than fail the whole
    pronunciation request (the identity score still stands).
    """
    if not target_tones:
        return None
    try:
        audio_bytes = base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError) as e:
        logger.info(f"DSP skipped: base64 decode failed ({e})")
        return None
    try:
        return score_tones(audio_bytes, target_tones)
    except ToneDspError as e:
        logger.info(f"DSP skipped: {e}")
        return None
    except Exception as e:  # numpy/parselmouth edge cases must not break scoring
        logger.warning(f"DSP error (non-fatal): {e}")
        return None


_TONE_PRACTICE_TIPS = {
    1: "Thanh 1 cần giữ cao độ ổn định và bằng phẳng ở âm vực cao (55), không hạ giọng cuối âm.",
    2: "Thanh 2 cần vuốt giọng từ tầm trung lên cao dứt khoát (35), tương tự dấu sắc tiếng Việt nhưng ngân vang hơn.",
    3: "Thanh 3 cần hạ giọng thật sâu xuống đáy âm vực (21) rồi mới nhả nhẹ (4), tránh đọc nông như dấu hỏi.",
    4: "Thanh 4 cần bắt đầu từ âm vực cao nhất rồi giáng nhanh và dứt khoát xuống thấp (51), không kéo dài.",
    5: "Thanh nhẹ cần phát âm ngắn, nhẹ và lướt qua nhanh.",
}


def _generate_phonetic_tip(
    target_hanzi: str,
    breakdown: dict,
    dsp_feedback: str = "",
    *,
    per_syllable: list[dict] | None = None,
    fluency: dict | None = None,
    prosody: dict | None = None,
) -> str:
    """Generate precise, instantaneous Vietnamese phonetic feedback in <1ms.

    Eliminates a second round-trip Gemini call while providing 100% deterministic,
    pedagogically sound tips without any risk of LLM hallucination.
    """
    has_identity_err = bool(breakdown.get("tone_errors") or breakdown.get("syllable_errors"))
    macro_feedback = " ".join(
        d["feedback"] for d in (fluency, prosody) if d and d.get("feedback")
    )

    if not has_identity_err and not dsp_feedback and not macro_feedback:
        return "Phát âm chuẩn xác, cao độ và thanh điệu rất tốt, hãy giữ vững phong độ!"

    parts: list[str] = []

    # 1. Syllable errors (highest priority)
    syllable_errors = breakdown.get("syllable_errors") or []
    if syllable_errors:
        err = syllable_errors[0]
        exp = err.get("expected", "")
        got = err.get("got", "")
        parts.append(f"Từ '{exp}' bạn đọc thành '{got}', hãy chú ý phát âm chuẩn phụ âm đầu và phần vần.")

    # 2. Tone errors
    tone_errors = breakdown.get("tone_errors") or []
    if tone_errors and len(parts) < 2:
        err = tone_errors[0]
        syl = err.get("syllable", "")
        exp_t = err.get("expected_tone", 0)
        got_t = err.get("got_tone", 0)
        advice = _TONE_PRACTICE_TIPS.get(exp_t, "")
        parts.append(f"Âm tiết '{syl}' đọc nhầm thành thanh {got_t}. {advice}")

    # 3. DSP acoustic tone feedback (e.g. DTW slope issues)
    if dsp_feedback and len(parts) < 2:
        parts.append(dsp_feedback)

    # 4. Fluency / prosody feedback if needed
    if macro_feedback and len(parts) < 2:
        parts.append(macro_feedback)

    if not parts:
        return "Chú ý điều chỉnh thanh điệu các âm tiết chưa đạt để phát âm tự nhiên hơn."

    return " ".join(parts[:2])


def _pronunciation_tip(
    target_hanzi: str,
    breakdown: dict,
    dsp_feedback: str = "",
    *,
    per_syllable: list[dict] | None = None,
    fluency: dict | None = None,
    prosody: dict | None = None,
) -> str:
    """Instantaneous phonetic feedback for sub-second response times."""
    return _generate_phonetic_tip(
        target_hanzi,
        breakdown,
        dsp_feedback,
        per_syllable=per_syllable,
        fluency=fluency,
        prosody=prosody,
    )


# ---------------------------------------------------------------------------
# Feature 2 — turn-based voice chat
# ---------------------------------------------------------------------------

def transcribe_speech(
    audio_b64: str,
    mime_type: str,
    *,
    deadline: _LadderDeadline | None = None,
) -> str:
    """Chép một lượt nói tiếng Trung thành chữ Hán.

    StepFun ASR (``stepaudio-2.5-asr``) là đường CHÍNH: nó là model chuyên chép
    âm nên nhanh hơn hẳn việc bắt một model đa năng vừa nghe vừa trả JSON.

    Gemini vẫn là fallback, có chủ ý — không thay hẳn: hiện chỉ có MỘT key Step
    Plan (không xoay vòng được khi nó 429/hỏng), còn GEMINI_NATIVE_API_KEYS có
    năm. Bỏ Gemini là đánh đổi độ bền lấy tốc độ ở đúng tính năng mà lỗi đồng
    nghĩa với "không nói được câu nào".

    ``deadline`` để caller đang stream chia chung ngân sách thời gian, xem
    ``_LadderDeadline``.
    """
    clock = deadline or _LadderDeadline()


    if settings.stepfun_keys_list:
        try:
            text = _stepfun_asr(audio_b64, mime_type, deadline=clock)
            if text:
                return text
            logger.info("StepFun ASR trả chuỗi rỗng — fallback sang Gemini")
        except Exception as exc:  # noqa: BLE001 — mọi lỗi đều phải rơi xuống Gemini
            logger.warning("StepFun ASR lỗi (%s) — fallback sang Gemini", exc)

    prompt = (
        "Nghe đoạn ghi âm tiếng Trung của người học và chép lại chính xác bằng "
        "chữ Hán. Không sửa ngữ pháp, không trả lời nội dung. Trả về JSON thuần: "
        '{"user_text":"..."}'
    )
    raw = _call_native_gemini(
        [{"text": prompt}, _audio_part(audio_b64, mime_type)],
        json_mode=True,
        deadline=clock,
    )
    text = str(_parse_json(raw).get("user_text", "")).strip()
    if not text:
        raise RuntimeError("Không nhận dạng được nội dung giọng nói.")
    return text


# mime của client -> ``format.type`` mà StepFun nhận. Client hiện luôn gửi WAV
# 16kHz mono 16-bit (``speech-ai.js`` tự encode, không dùng MediaRecorder), nên
# nhánh wav là đường chạy thật; webm giữ cho trường hợp client khác.
_STEPFUN_ASR_FORMATS = {"audio/wav": "wav", "audio/webm": "ogg", "audio/mpeg": "mp3"}


def _stepfun_asr(
    audio_b64: str,
    mime_type: str,
    *,
    deadline: _LadderDeadline | None = None,
) -> str:
    """Chép âm qua StepFun ASR SSE. Trả chuỗi rỗng khi không nhận ra gì.

    Chỉ khai ``format.type``, không khai ``rate``/``bits``/``channel``: tài liệu
    chỉ bắt buộc ba trường đó cho ``type: "pcm"`` thô. Với ``wav`` thì header
    RIFF đã mang sẵn sample rate và số channel, nên khai thêm chỉ tạo cơ hội cho
    hai nguồn nói khác nhau.

    Ném RuntimeError khi lỗi — caller (``transcribe_speech``) bắt và rơi xuống
    Gemini.
    """
    keys = settings.stepfun_keys_list
    if not keys:
        raise RuntimeError("STEPFUN_API_KEYS chưa được cấu hình.")

    fmt = _STEPFUN_ASR_FORMATS.get((mime_type or "").split(";")[0].strip().lower())
    if not fmt:
        raise RuntimeError(f"StepFun ASR không nhận định dạng {mime_type!r}.")

    clock = deadline or _LadderDeadline()
    body = json.dumps(
        {
            "audio": {
                "data": audio_b64,
                "input": {
                    "transcription": {
                        "model": settings.stepfun_asr_model,
                        "language": "zh",
                        # ITN bật (mặc định của API) để "2025年" ra chữ số thay vì
                        # đọc chữ; timestamp tắt vì ta chỉ cần văn bản.
                        "enable_itn": True,
                        "enable_timestamp": False,
                    },
                    "format": {"type": fmt},
                },
            }
        },
        ensure_ascii=False,
    ).encode("utf-8")

    errors: list[str] = []
    for idx, api_key in enumerate(keys):
        if clock.expired():
            errors.append(f"hết ngân sách {clock.budget:.0f}s")
            break
        req = urllib.request.Request(
            settings.stepfun_asr_url,
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=clock.timeout_for()) as resp:
                return _read_asr_sse(resp)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:200] if hasattr(exc, "read") else ""
            errors.append(f"key#{idx}: HTTP {exc.code} {detail}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"key#{idx}: {exc}")

    raise RuntimeError("StepFun ASR thất bại: " + " | ".join(errors[:4]))


def _read_asr_sse(resp) -> str:
    """Gộp các ``transcript.text.delta`` của một stream ASR thành văn bản.

    Ưu tiên ``text`` của ``transcript.text.done`` khi có: đó là bản chốt của
    server, đã qua ITN. Chỉ khi thiếu nó mới dùng chuỗi delta đã cộng dồn — nếu
    kết nối đứt giữa stream thì phần đã nghe được vẫn dùng được, tốt hơn là mất
    trắng cả lượt nói.
    """
    delta_text = ""
    for line_bytes in resp:
        line = line_bytes.decode("utf-8", "ignore").strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        etype = event.get("type", "")
        if etype == "transcript.text.delta":
            delta_text += str(event.get("delta", ""))
        elif etype == "transcript.text.done":
            return (str(event.get("text", "")) or delta_text).strip()
        elif etype == "error":
            raise RuntimeError(f"StepFun ASR: {event.get('message', 'lỗi không rõ')}")
    return delta_text.strip()


def voice_chat(
    audio_b64: str,
    mime_type: str,
    history: list[dict],
    text: str = "",
    *,
    deadline: _LadderDeadline | None = None,
) -> dict:
    """Hear or read one free-form turn and continue the same AI conversation.

    ``deadline`` để caller đã tiêu một phần ngân sách truyền tiếp đồng hồ. Bắt
    buộc với ``stream_voice_chat``: nó gọi hàm này làm fallback SAU khi ladder
    stream đã chạy hết ~35s, nên nếu ở đây mở đồng hồ mới thì trần tổng bị NHÂN
    ĐÔI (đo thật: 71s cho một lượt lỗi hoàn toàn, trong khi trần khai báo là 35s).
    """
    history_lines = []
    for turn in history[-6:]:  # keep prompt bounded
        role = "Người học" if turn.get("role") == "user" else "AI"
        content = str(turn.get("text", "")).strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "(chưa có)"

    role_block = (
        "Bạn là Tezca AI, trợ lý hội thoại tiếng Trung dành cho người Việt. "
        "Trả lời trực tiếp điều người dùng vừa hỏi và giữ mạch các lượt trước. "
        "Nếu họ hỏi kiến thức, hãy giải thích ngắn gọn thay vì chuyển sang một "
        "chủ đề dựng sẵn. Không nhắc tới HSK, vai diễn hay kịch bản. "
        "QUAN TRỌNG: reply_cn CHỈ được chứa tiếng Trung giản thể. "
        "Không chèn tiếng Việt, tiếng Anh, pinyin, chữ Latin hay bất kỳ ngôn ngữ "
        "nào khác vào reply_cn. Mọi giải thích/dịch nghĩa chỉ nằm ở reply_vi."
    )

    user_text = str(text or "").strip()
    input_instruction = (
        "Đọc tin nhắn người dùng và tiếp tục cuộc trò chuyện."
        if user_text
        else "Nghe đoạn ghi âm và tiếp tục cuộc trò chuyện."
    )
    prompt = (
        f"{role_block}\n\n"
        f"{input_instruction}\n"
        f"Lịch sử hội thoại gần đây:\n{history_block}\n\n"
        "Trả về JSON THUẦN (không markdown):\n"
        '{\n'
        '  "user_text": "những gì người học vừa nói (chữ Hán)",\n'
        '  "reply_cn": "câu trả lời tiếng Trung tự nhiên, tối đa 3 câu",\n'
        '  "reply_vi": "bản dịch hoặc giải thích ngắn bằng tiếng Việt"\n'
        "}\n"
        "Chỉ trả JSON."
    )

    parts = [{"text": prompt}]
    if user_text:
        parts.append({"text": f"Tin nhắn người học: {user_text}"})
    if audio_b64:
        parts.append(_audio_part(audio_b64, mime_type))

    raw = _call_native_gemini(parts, json_mode=True, deadline=deadline)
    data = _parse_json(raw)
    return {
        "user_text": str(data.get("user_text", "")).strip() or user_text,
        "reply_cn": str(data.get("reply_cn", "")).strip(),
        "reply_vi": str(data.get("reply_vi", "")).strip(),
    }


# Ranh giới câu tiếng Trung. Có cả `\n` vì model xuống dòng giữa REPLY_CN và
# REPLY_VI — dấu xuống dòng đó chốt đúng câu cuối của phần tiếng Trung.
_SENTENCE_ENDINGS = "。！？!?…\n"
# Dấu đóng đi SAU dấu kết câu vẫn thuộc câu đó (「他说：“你好。”」), nên gộp vào
# trước khi phát đi thay vì để rơi sang câu sau.
_SENTENCE_TRAILERS = "”』」）)》…"

_REPLY_VI_MARKER = "REPLY_VI:"


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _strip_partial_marker(text: str) -> str:
    """Bỏ phần đầu dở dang của ``REPLY_VI:`` ở cuối chuỗi.

    Stream có thể dừng giữa lúc model đang viết nhãn, để lại "REPLY_V" ở đuôi
    phần tiếng Trung. Không cắt thì rác đó đi vào câu trả lời và vào TTS.
    """
    for cut in range(len(_REPLY_VI_MARKER) - 1, 0, -1):
        if text.endswith(_REPLY_VI_MARKER[:cut]):
            return text[:-cut]
    return text


def _split_complete_sentences(text: str) -> tuple[list[str], int]:
    """Các câu ĐÃ hoàn chỉnh trong ``text`` + số ký tự đã tiêu thụ.

    Chỉ trả câu đã gặp dấu kết; phần đuôi chưa kết câu để lại cho chunk sau. Nhờ
    vậy TTS không bao giờ nhận nửa câu — đọc nửa câu rồi nối tiếp nửa sau tạo
    chỗ ngắt sai chỗ, nghe tệ hơn là chờ thêm vài trăm ms.
    """
    sentences: list[str] = []
    start = 0
    i = 0
    while i < len(text):
        if text[i] in _SENTENCE_ENDINGS:
            end = i + 1
            while end < len(text) and text[end] in _SENTENCE_TRAILERS:
                end += 1
            piece = text[start:end].strip()
            if piece:
                sentences.append(piece)
            start = end
            i = end
            continue
        i += 1
    return sentences, start


def stream_voice_chat(
    audio_b64: str = "",
    mime_type: str = "",
    history: list[dict] | None = None,
    text: str = "",
):
    """Stream một lượt hội thoại, phát sự kiện SSE theo tiến độ.

    Khác ``voice_chat`` ở hai chỗ, cả hai đều để giảm thời gian tới TIẾNG ĐẦU
    TIÊN chứ không phải tổng thời gian:

    1. Chép âm TRƯỚC bằng ``transcribe_speech`` (StepFun ASR, Gemini fallback) và
       phát ``transcript`` ngay. Người học thấy bong bóng chat của mình trong khi
       LLM còn đang nghĩ. Đổi lại, LLM nhận VĂN BẢN thay vì audio — nên prompt chỉ
       cần sinh REPLY_CN + REPLY_VI, không phải kiêm cả USER_TEXT như trước.
    2. Phát ``sentence`` mỗi khi chốt được một câu tiếng Trung, để client gọi TTS
       câu 1 trong lúc câu 2 còn đang sinh.

    Sự kiện phát ra:
      {"type": "transcript", "user_text": ...}
      {"type": "chunk", "text": ...}          — văn bản tăng dần, để hiện dần
      {"type": "sentence", "index": n, "text": ...}  — câu đã chốt, để đọc
      {"type": "done", "user_text": ..., "reply_cn": ..., "reply_vi": ...}
      {"type": "error", "detail": ...}
    """
    clock = _LadderDeadline()
    user_text = str(text or "").strip()

    # --- 1) Transcript trước, phát ngay ------------------------------------
    if not user_text and audio_b64:
        try:
            user_text = transcribe_speech(audio_b64, mime_type, deadline=clock)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Stream ASR thất bại: %s", exc)
            yield _sse({"type": "error", "detail": "Không nhận dạng được giọng nói."})
            return
    if not user_text:
        yield _sse({"type": "error", "detail": "Không có nội dung để trả lời."})
        return
    yield _sse({"type": "transcript", "user_text": user_text})

    # --- 2) Stream câu trả lời ---------------------------------------------
    keys = settings.gemini_native_keys_list
    if not keys:
        yield _sse({"type": "error", "detail": "Chưa cấu hình GEMINI_NATIVE_API_KEYS"})
        return

    history_lines = []
    for turn in (history or [])[-6:]:
        role = "Người học" if turn.get("role") == "user" else "AI"
        content = str(turn.get("text", "")).strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "(chưa có)"

    prompt = (
        "Bạn là Tezca AI, trợ lý hội thoại tiếng Trung dành cho người Việt. "
        "Trả lời trực tiếp điều người dùng vừa hỏi và giữ mạch các lượt trước. "
        "Nếu họ hỏi kiến thức, hãy giải thích ngắn gọn thay vì chuyển sang một "
        "chủ đề dựng sẵn. Không nhắc tới HSK, vai diễn hay kịch bản. "
        "QUAN TRỌNG: phần REPLY_CN CHỈ được chứa tiếng Trung giản thể thuần tuý. "
        "Không chèn tiếng Việt, tiếng Anh, pinyin, chữ Latin hay bất kỳ ngôn ngữ "
        "nào khác vào REPLY_CN. Mọi giải thích/dịch nghĩa chỉ nằm ở dòng REPLY_VI.\n\n"
        f"Lịch sử hội thoại gần đây:\n{history_block}\n\n"
        f"Người học vừa nói: {user_text}\n\n"
        "Định dạng trả về BẮT BUỘC theo đúng 2 dòng sau (không markdown, không "
        "thêm dòng khác):\n"
        "REPLY_CN: <câu trả lời tiếng Trung tự nhiên, tối đa 3 câu, mỗi câu kết "
        "bằng 。！hoặc ？>\n"
        f"{_REPLY_VI_MARKER} <bản dịch hoặc giải thích ngắn bằng tiếng Việt>\n"
    )
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}

    accumulated = ""
    emitted_len = 0  # số ký tự phần REPLY_CN đã phát dưới dạng câu hoàn chỉnh
    sentence_index = 0
    stream_succeeded = False

    for idx, key in enumerate(keys):
        if stream_succeeded or clock.expired():
            break
        url = (
            f"{settings.gemini_native_url}/models/{settings.gemini_native_model}"
            f":streamGenerateContent?key={key}&alt=sse"
        )
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=clock.timeout_for()) as resp:
                stream_succeeded = True
                for line_bytes in resp:
                    if not line_bytes.startswith(b"data: "):
                        continue
                    line_str = line_bytes[6:].decode("utf-8", "ignore").strip()
                    if not line_str or line_str == "[DONE]":
                        continue
                    try:
                        d = json.loads(line_str)
                        cand = (d.get("candidates") or [{}])[0]
                        chunk = "".join(
                            p.get("text", "") for p in cand.get("content", {}).get("parts", [])
                        )
                    except Exception:  # noqa: BLE001 — một dòng lỗi không giết cả stream
                        continue
                    if not chunk:
                        continue
                    accumulated += chunk
                    yield _sse({"type": "chunk", "text": chunk})

                    if "REPLY_CN:" not in accumulated:
                        continue
                    cn_section = accumulated.split("REPLY_CN:")[-1].split(_REPLY_VI_MARKER)[0]
                    if len(cn_section) <= emitted_len:
                        continue
                    sentences, consumed = _split_complete_sentences(cn_section[emitted_len:])
                    for piece in sentences:
                        sentence_index += 1
                        yield _sse(
                            {"type": "sentence", "index": sentence_index, "text": piece}
                        )
                    emitted_len += consumed
                break
        except Exception as exc:  # noqa: BLE001
            logger.warning("Stream key#%d thất bại: %s", idx, exc)
            stream_succeeded = False
            continue

    # --- 3) Chốt kết quả ---------------------------------------------------
    # ``cn_raw`` giữ NGUYÊN VĂN phần tiếng Trung — không strip. ``emitted_len``
    # đếm ký tự trên chuỗi này, nên phần đuôi cũng phải cắt trên chính nó. Cắt
    # trên bản đã ``.strip()`` sẽ lệch đúng bằng số ký tự trắng bị bỏ ở đầu (sau
    # "REPLY_CN:" luôn có một dấu cách), tức câu cuối bị mất chữ đầu.
    cn_raw = ""
    reply_vi = ""
    if "REPLY_CN:" in accumulated:
        cn_raw = accumulated.split("REPLY_CN:")[-1].split(_REPLY_VI_MARKER)[0]
    if _REPLY_VI_MARKER in accumulated:
        reply_vi = accumulated.split(_REPLY_VI_MARKER)[-1].strip()
    reply_cn = _strip_partial_marker(cn_raw).strip()

    if not reply_cn:
        # Stream không cho ra câu nào (đứt kết nối, model trả sai định dạng) →
        # lượt không-stream. Truyền ``text=user_text`` và KHÔNG gửi lại audio: đã
        # chép xong ở bước 1 nên chép lần nữa vừa tốn quota vừa có thể ra khác.
        try:
            res = voice_chat(
                audio_b64="",
                mime_type="",
                history=history or [],
                text=user_text,
                deadline=clock,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Fallback voice_chat thất bại: %s", exc)
            yield _sse({"type": "error", "detail": "Không tạo được câu trả lời."})
            return
        reply_cn = res.get("reply_cn", "")
        reply_vi = res.get("reply_vi", "")
        sentences, _ = _split_complete_sentences(reply_cn)
        for piece in sentences or ([reply_cn] if reply_cn else []):
            sentence_index += 1
            yield _sse({"type": "sentence", "index": sentence_index, "text": piece})
    else:
        # Câu cuối thường không có dấu kết (model dừng ở REPLY_VI hoặc hết token)
        # nên chưa được phát ở vòng trên. Phát nốt phần đuôi.
        tail = _strip_partial_marker(cn_raw[emitted_len:]).strip()
        if tail:
            sentence_index += 1
            yield _sse({"type": "sentence", "index": sentence_index, "text": tail})

    yield _sse(
        {
            "type": "done",
            "user_text": user_text,
            "reply_cn": reply_cn,
            "reply_vi": reply_vi,
        }
    )
