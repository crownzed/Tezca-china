"""
Speech AI service — native Google Gemini (generativelanguage.googleapis.com).

The vilao.ai relay used by ``llm_generator_service`` is text-only, so the two
speech features call the native Gemini API directly (it ingests audio input):

  Feature 1 — pronunciation scoring:
    audio -> Gemini transcribes to {hanzi, pinyin} -> pinyin_scorer scores
    (deterministic) -> Gemini writes a short correction tip.

  Feature 2 — turn-based voice chat:
    audio -> Gemini hears + understands + replies (one call). The reply text is
    spoken on the client via the existing speak() TTS.

The API key never leaves the backend; the browser only talks to our routers.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import urllib.error
import urllib.request

from ..settings import settings
from .pinyin_scorer import _extract_tone, score_pinyin
from .tone_dsp_service import ToneDspError, score_tones

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
TIMEOUT = 90


def _post(url: str, payload: dict, timeout: int = TIMEOUT) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _call_native_gemini(parts: list[dict], *, json_mode: bool = False, timeout: int = TIMEOUT) -> str:
    """Call native Gemini generateContent, rotating through configured keys.

    ``parts`` is the list of content parts for a single user turn (text and/or
    inline audio). Returns the model's text output. Raises RuntimeError if all
    keys fail.
    """
    keys = settings.gemini_native_keys_list
    if not keys:
        raise RuntimeError("GEMINI_NATIVE_API_KEYS chưa được cấu hình.")

    model = settings.gemini_native_model
    payload: dict = {"contents": [{"role": "user", "parts": parts}]}
    if json_mode:
        payload["generationConfig"] = {"response_mime_type": "application/json"}

    errors: list[str] = []
    for idx, key in enumerate(keys):
        url = f"{settings.gemini_native_url}/models/{model}:generateContent?key={key}"
        for attempt in range(MAX_RETRIES):
            try:
                result = _post(url, payload, timeout)
                cand = (result.get("candidates") or [{}])[0]
                text = "".join(
                    p.get("text", "") for p in cand.get("content", {}).get("parts", [])
                )
                if text:
                    return text
                errors.append(f"key#{idx}: empty response ({json.dumps(result)[:160]})")
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8")[:200] if hasattr(e, "read") else ""
                errors.append(f"key#{idx}: HTTP {e.code} {body}")
                if e.code in (429, 500, 503) and attempt + 1 < MAX_RETRIES:
                    continue
                break  # auth/quota errors: move to next key
            except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
                errors.append(f"key#{idx}: {e}")
                continue

    raise RuntimeError("Gemini native API thất bại: " + " | ".join(errors))


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
        tone_accuracy = tone_result["tone_accuracy"]
        # Blend: identity dominates (did they say the right syllables?), acoustic
        # refines (did the tones have the right shape?). 65/35 split.
        final_score = round(identity_score * 0.65 + tone_accuracy * 100 * 0.35)
        dsp_feedback = tone_result["feedback"]
        per_syllable = tone_result["per_syllable"]
        f0_contour = tone_result["user_f0_contour"]
    else:
        tone_accuracy = None
        final_score = identity_score
        dsp_feedback = ""
        per_syllable = []
        f0_contour = []

    tip = _pronunciation_tip(target_hanzi, breakdown, dsp_feedback)

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
        "detailed_feedback": dsp_feedback,
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


def _pronunciation_tip(target_hanzi: str, breakdown: dict, dsp_feedback: str = "") -> str:
    """Ask Gemini for one short Vietnamese tip based on concrete errors.

    Feeds both the identity errors (from pinyin_scorer) and the acoustic
    diagnosis (from the DSP layer) so the tip can address tone *realization*,
    not just which syllable was wrong.
    """
    has_identity_err = bool(breakdown["tone_errors"] or breakdown["syllable_errors"])
    if not has_identity_err and not dsp_feedback:
        return "Phát âm chuẩn, giữ nguyên nhịp và thanh điệu như vậy."

    prompt = (
        "Bạn là giáo viên phát âm tiếng Trung. Người học đọc câu: "
        f"{target_hanzi}\n"
        f"Pinyin mục tiêu: {breakdown['target']}\n"
        f"Người học đọc: {breakdown['actual']}\n"
        f"Lỗi thanh điệu (nhận dạng): {json.dumps(breakdown['tone_errors'], ensure_ascii=False)}\n"
        f"Lỗi âm tiết: {json.dumps(breakdown['syllable_errors'], ensure_ascii=False)}\n"
        f"Phân tích âm học (đường F0/thanh điệu thực tế): {dsp_feedback or '(không có)'}\n"
        "Viết MỘT lời khuyên ngắn (tối đa 2 câu) bằng TIẾNG VIỆT, ưu tiên chỉ rõ "
        "âm/thanh cần sửa và cách sửa dựa trên phân tích âm học. Trả về văn bản "
        "thuần, không markdown."
    )
    try:
        return _call_native_gemini([{"text": prompt}]).strip()
    except RuntimeError:
        # Tip is non-critical; the deterministic score still stands.
        return dsp_feedback or "Chú ý các âm tiết bị sai thanh điệu được liệt kê bên dưới."


# ---------------------------------------------------------------------------
# Feature 2 — turn-based voice chat
# ---------------------------------------------------------------------------

def voice_chat(audio_b64: str, mime_type: str, history: list[dict]) -> dict:
    """Hear the user's utterance and produce a spoken-style reply.

    Returns {user_text, reply_cn, reply_vi}. The client speaks reply_cn via the
    existing speak() TTS.
    """
    history_lines = []
    for turn in history[-6:]:  # keep prompt bounded
        role = "Người học" if turn.get("role") == "user" else "AI"
        content = str(turn.get("text", "")).strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "(chưa có)"

    prompt = (
        "Bạn là bạn luyện hội thoại tiếng Trung thân thiện. Hãy NGHE đoạn ghi âm "
        "của người học và trả lời tự nhiên bằng tiếng Trung, đơn giản, phù hợp "
        "trình độ sơ-trung cấp (HSK 1-4).\n"
        f"Lịch sử hội thoại gần đây:\n{history_block}\n\n"
        "Trả về JSON THUẦN (không markdown):\n"
        '{\n'
        '  "user_text": "những gì người học vừa nói (chữ Hán)",\n'
        '  "reply_cn": "câu trả lời của bạn bằng chữ Hán, 1-2 câu ngắn",\n'
        '  "reply_vi": "bản dịch tiếng Việt của câu trả lời"\n'
        "}\n"
        "Chỉ trả JSON."
    )

    raw = _call_native_gemini(
        [{"text": prompt}, _audio_part(audio_b64, mime_type)],
        json_mode=True,
    )
    data = _parse_json(raw)
    return {
        "user_text": str(data.get("user_text", "")).strip(),
        "reply_cn": str(data.get("reply_cn", "")).strip(),
        "reply_vi": str(data.get("reply_vi", "")).strip(),
    }
