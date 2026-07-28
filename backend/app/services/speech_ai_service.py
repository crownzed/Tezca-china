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
from .conversation_bank_service import get_conversation_bank
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


def _pronunciation_tip(
    target_hanzi: str,
    breakdown: dict,
    dsp_feedback: str = "",
    *,
    per_syllable: list[dict] | None = None,
    fluency: dict | None = None,
    prosody: dict | None = None,
) -> str:
    """Ask Gemini, acting as a phonetics coach, for one short Vietnamese tip.

    Instead of hand-writing a prose summary, we pack ALL diagnostic signals into
    a single structured JSON block: identity errors (pinyin_scorer), per-syllable
    acoustic results (DTW distance vs each Chao template), and the macro layer
    (speech rate, pauses, pitch range, declination). Feeding measured numbers —
    not adjectives — is what lets the model say "thanh 4 của 'shì' chưa đủ dốc
    (độ lệch DTW 1.8)" instead of a generic tip, and keeps it from hallucinating
    errors that the acoustic layer didn't actually find.
    """
    has_identity_err = bool(breakdown["tone_errors"] or breakdown["syllable_errors"])
    macro_feedback = " ".join(
        d["feedback"] for d in (fluency, prosody) if d and d.get("feedback")
    )
    if not has_identity_err and not dsp_feedback and not macro_feedback:
        return "Phát âm chuẩn, giữ nguyên nhịp và thanh điệu như vậy."

    # Structured diagnostic payload. Everything the model needs to reason from,
    # in one JSON object — no prose, no adjectives it has to trust blindly.
    diagnosis = {
        "cau_muc_tieu": target_hanzi,
        "pinyin_muc_tieu": breakdown["target"],
        "nguoi_hoc_doc": breakdown["actual"],
        "loi_thanh_dieu": breakdown["tone_errors"],
        "loi_am_tiet": breakdown["syllable_errors"],
        # Per-syllable acoustic detail: DTW distance to the expected Chao tone
        # template. ~0 = khớp hình dáng, cao = lệch nhiều.
        "chi_tiet_am_hoc_tung_am_tiet": [
            {
                "vi_tri": s["pos"] + 1,
                "thanh": s["tone"],
                "do_lech_DTW": s["distance"],
                "dat": s["ok"],
                "chan_doan": s.get("feedback"),
            }
            for s in (per_syllable or [])
        ],
        "luu_loat": fluency,   # speech_rate, pause_count, total_pause_sec, span_sec
        "ngu_dieu_ca_cau": prosody,  # pitch_range_semitones, declination_semitones
    }

    prompt = (
        "Bạn là CHUYÊN GIA NGÔN NGỮ HỌC và huấn luyện viên ngữ âm tiếng Trung cho "
        "người Việt. Dưới đây là dữ liệu chẩn đoán ĐO ĐẠC được từ bản ghi âm của "
        "người học (đường cao độ F0 phân tích bằng Praat, khớp DTW với mẫu thanh "
        "điệu Chao, cùng số liệu lưu loát và ngữ điệu):\n\n"
        f"{json.dumps(diagnosis, ensure_ascii=False, indent=2)}\n\n"
        "Quy tắc phản hồi:\n"
        "- CHỈ dựa vào số liệu trên, TUYỆT ĐỐI không bịa lỗi không có trong dữ liệu.\n"
        "- Ưu tiên lỗi nghiêm trọng nhất (độ lệch DTW cao nhất, hoặc lỗi âm tiết).\n"
        "- Nếu số liệu tốt (không có lỗi), khen ngắn gọn và nói giữ nguyên.\n"
        "- Chỉ rõ âm tiết/thanh cụ thể và cách sửa bằng động tác giọng (ví dụ: bắt "
        "đầu từ âm vực cao rồi hạ giọng rơi mạnh cho thanh 4).\n"
        "Viết TỐI ĐA 2 câu bằng TIẾNG VIỆT, văn bản thuần, không markdown."
    )
    try:
        return _call_native_gemini([{"text": prompt}]).strip()
    except RuntimeError:
        # Tip is non-critical; the deterministic score still stands.
        return (
            dsp_feedback
            or macro_feedback
            or "Chú ý các âm tiết bị sai thanh điệu được liệt kê bên dưới."
        )


# ---------------------------------------------------------------------------
# Feature 2 — turn-based voice chat
# ---------------------------------------------------------------------------

def voice_chat(
    audio_b64: str,
    mime_type: str,
    history: list[dict],
    scenario_id: str = "",
    hsk_level: int = 0,
) -> dict:
    """Hear the user's utterance and produce a spoken-style reply.

    Returns {user_text, reply_cn, reply_vi, scenario_id}. The client speaks
    reply_cn via the existing speak() TTS.

    Vai và tình huống lấy từ ``conversation_bank_service``: prompt chung ("bạn
    luyện hội thoại thân thiện") khiến model nói giọng sách giáo khoa — mỗi lượt
    một câu hỏi mới, không phản hồi nội dung vừa nghe. Kịch bản cấp vai, few-shot
    nhịp đối đáp, và nước đi cứu hội thoại. Khi không tra được kịch bản nào
    (bank rỗng / id lạ), rơi về prompt chung để tính năng không chết.
    """
    history_lines = []
    for turn in history[-6:]:  # keep prompt bounded
        role = "Người học" if turn.get("role") == "user" else "AI"
        content = str(turn.get("text", "")).strip()
        if content:
            history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "(chưa có)"

    bank = get_conversation_bank()
    scenario = bank.get(scenario_id) if scenario_id else None
    if scenario is None and hsk_level:
        scenario = bank.pick(hsk_level)

    if scenario is not None:
        role_block = bank.system_prompt(scenario)
        resolved_id = str(scenario.get("id", ""))
    else:
        role_block = (
            "Bạn là bạn luyện hội thoại tiếng Trung thân thiện. Trả lời tự nhiên "
            "bằng tiếng Trung, đơn giản, phù hợp trình độ sơ-trung cấp (HSK 1-4). "
            "Phản hồi đúng nội dung người học vừa nói, không đổi chủ đề, không "
            "sửa lỗi ngữ pháp và không giảng bài."
        )
        resolved_id = ""

    prompt = (
        f"{role_block}\n\n"
        "Hãy NGHE đoạn ghi âm của người học và đáp lại đúng vai.\n"
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
        "scenario_id": resolved_id,
    }
