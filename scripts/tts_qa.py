#!/usr/bin/env python3
"""Automated TTS QA harness for the Tezca-china audio pipeline.

The runtime plays MP3 clips listed in ``public/audio/index.json`` (text -> key);
each clip lives at ``public/audio/<key>.mp3`` and is downloaded at build time by
``scripts/generate-audio.mjs`` from Youdao/Google TTS.

This harness audits that corpus automatically, in tiers, and scores it in the QA
report format the team uses:

  Tier A  Integrity & stability  (always runs, fully offline)
          - file present, MPEG frame sync valid, not an HTML/JSON error page,
            not truncated/silent, plausible duration-per-syllable.
  Tier B  Tone / heteronym reference  (always runs, needs pypinyin)
          - canonical toned pinyin per text as ground truth; flags heteronyms
            (multi-reading chars) whose tone is context-dependent and easy to
            get wrong -- the real "incorrect tone" risk for Chinese TTS.
  Tier C  Pronunciation accuracy via STT  (runs only if a backend is available)
          - transcribes the clip, converts transcript + source to pinyin, diffs.
            Pluggable: OpenAI Whisper API, local ``whisper`` CLI, else skipped.

Usage:
  python scripts/tts_qa.py                 # audit whole corpus, write reports
  python scripts/tts_qa.py --text 我爱你    # audit a single string
  python scripts/tts_qa.py --limit 200     # sample first N entries
  python scripts/tts_qa.py --stt openai    # enable STT tier (needs OPENAI_API_KEY)
  python scripts/tts_qa.py --stt whisper   # enable STT tier (needs whisper CLI)

Exit code is non-zero when any clip lands in the FAIL bucket, so this can gate CI.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "public" / "audio"
INDEX_PATH = AUDIO_DIR / "index.json"
REPORT_JSON = ROOT / "scripts" / "tts_qa_report.json"
REPORT_MD = ROOT / "scripts" / "tts_qa_report.md"

# Youdao/Google clips are ~150-400ms per Chinese syllable. Anything far outside
# this band is either truncated (swallowed) or padded with silence/an error tone.
MIN_MS_PER_CHAR = 90
MAX_MS_PER_CHAR = 950
ABSOLUTE_MIN_MS = 180   # below this, even a 1-char clip is suspect
HTML_SNIFF = (b"<!doctype", b"<html", b"<?xml", b"{", b"error", b"<head")

# MPEG audio version / layer / bitrate / samplerate tables for native frame parse.
_BITRATES = {
    # (version_key, layer) -> [bitrate kbps by index]
    ("2.5", 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    ("2", 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    ("1", 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
}
_SAMPLE_RATES = {"1": [44100, 48000, 32000], "2": [22050, 24000, 16000], "2.5": [11025, 12000, 8000]}
_VERSIONS = {0b00: "2.5", 0b10: "2", 0b11: "1"}


@dataclass
class ClipResult:
    text: str
    key: str
    path: str
    exists: bool = False
    bytes: int = 0
    duration_ms: int = 0
    ms_per_char: float = 0.0
    pinyin: str = ""
    heteronyms: list[str] = field(default_factory=list)
    stt_text: str = ""
    stt_pinyin: str = ""
    issues: list[str] = field(default_factory=list)  # severity:message
    categories: list[str] = field(default_factory=list)  # integrity|duplicate|duration|heteronym|stt
    status: str = "PASS"  # PASS | WARN | FAIL

    def add(self, severity: str, message: str, category: str = "general") -> None:
        self.issues.append(f"{severity}:{message}")
        self.categories.append(category)
        order = {"PASS": 0, "WARN": 1, "FAIL": 2}
        if order[severity] > order[self.status]:
            self.status = severity

    def has(self, category: str) -> bool:
        return category in self.categories


# ---------------------------------------------------------------------------
# Tier A: integrity & duration (native, no ffmpeg)
# ---------------------------------------------------------------------------
def _mp3_duration_ms(path: Path) -> int:
    """Duration in ms via mutagen if present, else a native frame-sum fallback."""
    try:
        from mutagen.mp3 import MP3  # type: ignore

        return int(MP3(path).info.length * 1000)
    except Exception:
        pass
    return _native_duration_ms(path)


def _native_duration_ms(path: Path) -> int:
    """Sum MPEG frame durations. Handles the VBR Youdao/Google output."""
    data = path.read_bytes()
    i = 0
    n = len(data)
    total_samples = 0
    sample_rate = 0
    while i < n - 4:
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue
        hdr = data[i + 1 : i + 4]
        ver = _VERSIONS.get((hdr[0] >> 3) & 0b11)
        layer = (hdr[0] >> 1) & 0b11
        if ver is None or layer != 0b01:  # we only emit Layer III
            i += 1
            continue
        br_index = (hdr[1] >> 4) & 0x0F
        sr_index = (hdr[1] >> 2) & 0b11
        if br_index in (0, 15) or sr_index == 0b11:
            i += 1
            continue
        bitrate = _BITRATES[(ver, 3)][br_index] * 1000
        sample_rate = _SAMPLE_RATES[ver][sr_index]
        padding = (hdr[1] >> 1) & 0b1
        samples_per_frame = 1152 if ver == "1" else 576
        frame_len = int((samples_per_frame / 8 * bitrate) / sample_rate) + padding
        if frame_len <= 0:
            i += 1
            continue
        total_samples += samples_per_frame
        i += frame_len
    if sample_rate == 0:
        return 0
    return int((total_samples / sample_rate) * 1000)


def check_integrity(result: ClipResult, dup_keys: set[str] | None = None) -> None:
    path = Path(result.path)
    if not path.exists():
        result.add("FAIL", "file missing on disk", "integrity")
        return
    result.exists = True
    data = path.read_bytes()
    result.bytes = len(data)

    if len(data) < 80:
        result.add("FAIL", f"file too small ({len(data)}B) — empty/failed download", "integrity")
        return

    head = data[:64].lstrip().lower()
    if head.startswith(HTML_SNIFF):
        result.add("FAIL", "looks like an HTML/JSON error page, not audio", "integrity")
        return

    has_id3 = data[:3] == b"ID3"
    if not has_id3 and not (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        result.add("FAIL", "no MPEG frame sync / ID3 header — corrupt audio", "integrity")
        return

    # Duplicate-content detection: clips whose bytes are shared across many
    # different texts are a single junk/error file saved under many keys.
    if dup_keys and result.key in dup_keys:
        result.add("FAIL", "identical bytes shared across many texts — junk/error clip, not real speech", "duplicate")

    result.duration_ms = _mp3_duration_ms(path)
    if result.duration_ms <= 0:
        result.add("FAIL", "zero decodable duration — silent/corrupt", "integrity")
        return

    char_count = max(1, sum(1 for c in result.text if "一" <= c <= "鿿"))
    result.ms_per_char = round(result.duration_ms / char_count, 1)
    # A multi-char text in a near-zero clip is physically impossible speech.
    if char_count >= 2 and result.duration_ms < ABSOLUTE_MIN_MS:
        result.add("FAIL", f"{result.duration_ms}ms for {char_count} chars — truncated/empty", "duration")
    elif result.ms_per_char < MIN_MS_PER_CHAR:
        result.add("WARN", f"{result.ms_per_char}ms/char — likely swallowed syllables", "duration")
    elif result.ms_per_char > MAX_MS_PER_CHAR:
        result.add("WARN", f"{result.ms_per_char}ms/char — likely trailing silence or wrong clip", "duration")


# ---------------------------------------------------------------------------
# Tier B: tone / heteronym reference (pypinyin)
# ---------------------------------------------------------------------------
def check_pinyin(result: ClipResult) -> None:
    try:
        from pypinyin import pinyin, Style
        from pypinyin.contrib.tone_convert import to_tone
    except Exception:
        result.add("WARN", "pypinyin unavailable — tone reference skipped", "heteronym")
        return

    toned = pinyin(result.text, style=Style.TONE, heteronym=False)
    result.pinyin = " ".join(s[0] for s in toned)

    # Context-dependent readings: compare each char's phrase-aware reading to its
    # isolated single-char default. When they differ, the pronunciation depends
    # on context (tone sandhi like 一/不, neutral tone like 个, true heteronyms
    # like 长/漂) — precisely what a context-blind TTS, or a wrong pinyin label,
    # gets wrong. This is far less noisy than pypinyin's full heteronym list,
    # which includes archaic/rare readings that never occur in practice.
    for ch, reading in zip(result.text, toned):
        if not ("一" <= ch <= "鿿"):
            continue
        isolated = pinyin(ch, style=Style.TONE, heteronym=False)[0][0]
        if reading[0] != isolated:
            result.heteronyms.append(f"{ch}({isolated}→{reading[0]})")
    if result.heteronyms:
        result.add("WARN", "context-dependent reading: " + ", ".join(result.heteronyms), "heteronym")


# ---------------------------------------------------------------------------
# Tier C: pronunciation accuracy via STT (pluggable)
# ---------------------------------------------------------------------------
def stt_openai(path: Path) -> str:
    try:
        from openai import OpenAI
    except Exception:
        return ""
    if not os.environ.get("OPENAI_API_KEY"):
        return ""
    client = OpenAI()
    with open(path, "rb") as fh:
        resp = client.audio.transcriptions.create(
            model="whisper-1", file=fh, language="zh"
        )
    return getattr(resp, "text", "").strip()


def stt_whisper_cli(path: Path) -> str:
    exe = _which("whisper")
    if not exe:
        return ""
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(
                [exe, str(path), "--language", "zh", "--model", "base",
                 "--output_format", "txt", "--output_dir", tmp],
                check=True, capture_output=True, timeout=120,
            )
        except Exception:
            return ""
        out = Path(tmp) / (path.stem + ".txt")
        return out.read_text(encoding="utf-8").strip() if out.exists() else ""


def _which(name: str) -> str | None:
    from shutil import which
    return which(name)


def check_stt(result: ClipResult, backend: str) -> None:
    path = Path(result.path)
    if not path.exists():
        return
    transcript = stt_openai(path) if backend == "openai" else stt_whisper_cli(path)
    if not transcript:
        result.add("WARN", f"STT backend '{backend}' returned nothing — accuracy unverified", "stt")
        return
    result.stt_text = transcript
    try:
        from pypinyin import pinyin, Style

        src_py = " ".join(s[0] for s in pinyin(result.text, style=Style.TONE))
        stt_py = " ".join(s[0] for s in pinyin(transcript, style=Style.TONE))
        result.stt_pinyin = stt_py
        # Strip non-Chinese punctuation the STT may add.
        norm_src = "".join(c for c in result.text if "一" <= c <= "鿿")
        norm_stt = "".join(c for c in transcript if "一" <= c <= "鿿")
        if norm_src and norm_src not in norm_stt and norm_stt not in norm_src:
            result.add("FAIL", f"STT mismatch: heard '{transcript}' (py {stt_py}) vs '{result.text}' (py {src_py})", "stt")
    except Exception:
        if result.text not in transcript:
            result.add("FAIL", f"STT mismatch: heard '{transcript}' vs '{result.text}'", "stt")


# ---------------------------------------------------------------------------
# Text normalization (preventive — run BEFORE feeding text to TTS)
# ---------------------------------------------------------------------------
import re as _re

_CN_DIGITS = "零一二三四五六七八九"
_CN_UNITS = ["", "十", "百", "千"]
_CN_BIG = ["", "万", "亿"]
_SYMBOLS = {"+": "加", "-": "减", "=": "等于", "&": "和", "@": "艾特", "$": "美元", "#": "井号"}


def _int_to_chinese(num: int) -> str:
    """123 -> 一百二十三, 100 -> 一百, 10500 -> 一万零五百. Spoken-form, not digits."""
    if num == 0:
        return "零"
    neg = num < 0
    num = abs(num)
    groups = []  # 4-digit groups, least significant first
    while num > 0:
        groups.append(num % 10000)
        num //= 10000

    def four(n: int) -> str:
        s = ""
        zero_pending = False
        started = False
        for unit in (3, 2, 1, 0):
            d = (n // (10 ** unit)) % 10
            if d == 0:
                if started:
                    zero_pending = True
                continue
            if zero_pending:
                s += _CN_DIGITS[0]
                zero_pending = False
            # drop the leading 一 of 一十 (十 not 一十)
            if not (d == 1 and unit == 1 and not started):
                s += _CN_DIGITS[d]
            s += _CN_UNITS[unit]
            started = True
        return s

    parts = []
    for i in range(len(groups) - 1, -1, -1):
        g = groups[i]
        if g == 0:
            # internal zero group: insert a single 零 if a higher group already emitted
            if parts and not parts[-1].endswith(_CN_DIGITS[0]) and i < len(groups) - 1:
                parts.append(_CN_DIGITS[0])
            continue
        chunk = four(g)
        # leading zero inside a group when a higher group exists (e.g. 一万零五百)
        if parts and g < 1000 and i < len(groups) - 1:
            chunk = _CN_DIGITS[0] + chunk
        parts.append(chunk + _CN_BIG[i])
    result = "".join(parts).rstrip(_CN_DIGITS[0]) or _CN_DIGITS[0]
    return ("负" + result) if neg else result


def _number_to_chinese(token: str) -> str:
    """Whole numbers -> spoken Chinese; decimals -> 点 + digit-by-digit tail."""
    if "." in token:
        head, _, tail = token.partition(".")
        head_cn = _int_to_chinese(int(head)) if head else "零"
        tail_cn = "".join(_CN_DIGITS[int(d)] for d in tail)
        return f"{head_cn}点{tail_cn}"
    return _int_to_chinese(int(token))


def normalize_for_tts(text: str) -> str:
    """Expand numbers/symbols to spoken Chinese so the engine never guesses.

    The current corpus is pure Chinese, but custom-vocab input (CustomVocabInput)
    can introduce numbers/symbols. Call this in generate-audio.mjs' collector and
    in the runtime speak() path to make the pipeline robust to those cases.

    Examples:
      价格100元   -> 价格一百元
      打8折       -> 打八折
      CPU100%满载 -> CPU百分之一百满载   (note: 百分之 precedes the number)
      1+1=2      -> 一加一等于二
      温度37.5度  -> 温度三十七点五度
    """
    # Percent first, so word order is 百分之<number> (not <number>百分之).
    text = _re.sub(r"(\d+(?:\.\d+)?)\s*%", lambda m: "百分之" + _number_to_chinese(m.group(1)), text)
    # Remaining standalone numbers -> spoken Chinese.
    text = _re.sub(r"\d+(?:\.\d+)?", lambda m: _number_to_chinese(m.group(0)), text)
    # Arithmetic / misc symbols.
    return "".join(_SYMBOLS.get(ch, ch) for ch in text)


# ---------------------------------------------------------------------------
# Scoring & report
# ---------------------------------------------------------------------------
def score(results: list[ClipResult], stt_enabled: bool) -> dict:
    n = len(results) or 1
    fails = [r for r in results if r.status == "FAIL"]
    warns = [r for r in results if r.status == "WARN"]

    integrity_fail = sum(1 for r in results if r.has("integrity"))
    duplicate_fail = sum(1 for r in results if r.has("duplicate"))
    duration_warn = sum(1 for r in results if r.has("duration") and r.status == "WARN")
    hetero = sum(1 for r in results if r.heteronyms)
    stt_fail = sum(1 for r in results if any("STT mismatch" in i for i in r.issues))
    stt_checked = sum(1 for r in results if r.stt_text)

    # Distinct broken-audio clips (a clip flagged in several categories counts
    # once) — used for penalties so overlapping flags don't double-count.
    broken = sum(1 for r in results if r.status == "FAIL"
                 and (r.has("integrity") or r.has("duplicate") or r.has("duration")))

    # Audio quality (20%): a broken/duplicate clip is a hard quality failure;
    # duration warnings are softer.
    audio_q = round(10 * (1 - broken / n) - 2 * (duration_warn / n), 1)
    audio_q = max(0.0, min(10.0, audio_q))
    # Accuracy (40%): a junk/duplicate clip plays the wrong sound, so it is also
    # an accuracy failure. STT diff sharpens this when available.
    if stt_enabled and stt_checked:
        accuracy = round(10 * (1 - (stt_fail + broken) / n), 1)
    else:
        # Unverified by ear: cap, and still penalise known-broken clips fully.
        accuracy = round(min(8.0, 10 - 10 * (broken / n) - 4 * (hetero / n)), 1)
    accuracy = max(0.0, accuracy)
    # Intonation/prosody (40%): cannot be measured offline; reflects heteronym
    # tone-risk plus the broken clips that have no usable prosody at all.
    intonation = round(max(0.0, 9.0 - 3 * (hetero / n) - 6 * (broken / n)), 1)

    overall = round(accuracy * 0.4 + intonation * 0.4 + audio_q * 0.2, 1)
    return {
        "overall": overall,
        "accuracy": accuracy,
        "intonation": intonation,
        "audio_quality": audio_q,
        "accuracy_verified_by_stt": bool(stt_enabled and stt_checked),
        "counts": {
            "total": len(results),
            "fail": len(fails),
            "warn": len(warns),
            "integrity_fail": integrity_fail,
            "duplicate_fail": duplicate_fail,
            "duration_warn": duration_warn,
            "heteronym_risk": hetero,
            "stt_mismatch": stt_fail,
        },
    }


def write_reports(results: list[ClipResult], summary: dict, stt_enabled: bool) -> None:
    REPORT_JSON.write_text(json.dumps(
        {"summary": summary, "clips": [asdict(r) for r in results if r.status != "PASS"]},
        ensure_ascii=False, indent=2), encoding="utf-8")

    lines = []
    s = summary
    lines.append("# TTS QA Report\n")
    lines.append(f"- **Overall score (/10): {s['overall']}**")
    lines.append(f"- Accuracy: {s['accuracy']}/10  ·  Intonation: {s['intonation']}/10  ·  Audio quality: {s['audio_quality']}/10")
    if not stt_enabled:
        lines.append("- ⚠️ Accuracy is a *heteronym-risk proxy* (capped at 8.0): no STT backend was available to verify actual pronunciation. Intonation cannot be measured offline and reflects heteronym risk only.")
    c = s["counts"]
    lines.append(f"\n## Counts\n- clips: {c['total']}  ·  FAIL: {c['fail']}  ·  WARN: {c['warn']}")
    lines.append(f"- integrity failures: {c['integrity_fail']}  ·  duplicate/junk clips: {c['duplicate_fail']}  ·  duration warnings: {c['duration_warn']}  ·  heteronym tone-risk: {c['heteronym_risk']}  ·  STT mismatches: {c['stt_mismatch']}")

    dups = [r for r in results if r.has("duplicate")]
    if dups:
        lines.append(f"\n## Duplicate/junk clips ({len(dups)}) — highest priority")
        lines.append("These texts all map to the *same* audio bytes: a single error/placeholder clip saved under many keys. They play the wrong sound regardless of the text.")
        for r in dups[:60]:
            lines.append(f"- `{r.text}` ({r.key}.mp3, {r.bytes}B / {r.duration_ms}ms)")
        if len(dups) > 60:
            lines.append(f"- …and {len(dups) - 60} more (see JSON report)")

    fails = [r for r in results if r.status == "FAIL" and not r.has("duplicate")]
    if fails:
        lines.append("\n## Other integrity / pronunciation errors")
        for r in fails[:200]:
            for i in r.issues:
                if i.startswith("FAIL"):
                    lines.append(f"- `{r.text}` ({r.key}.mp3): {i[5:]}")

    hetero = [r for r in results if r.heteronyms]
    if hetero:
        lines.append("\n## Heteronym tone-risk (review these clips by ear)")
        for r in hetero[:60]:
            lines.append(f"- `{r.text}` -> {r.pinyin}  ⟶ ambiguous: {', '.join(r.heteronyms)}")

    lines.append("\n## Suggested fixes")
    lines.append("- **Purge & re-fetch duplicate/junk clips (do this first)**: delete every key flagged above from `public/audio/` and remove it from `index.json`, then re-run `generate-audio.mjs`. They are a single error clip cloned across many texts.")
    lines.append("- **Harden the downloader**: in `generate-audio.mjs`, reject a response unless `content-type` starts with `audio/` AND the decoded duration is ≥ ~180ms; also reject any payload whose md5 matches a known-bad/placeholder clip. The current `> 80 bytes && !json` gate lets the error clip through.")
    lines.append("- **Pin heteronym readings**: for the flagged chars, store a per-text pinyin override and pass it to the engine (SSML `<phoneme>` or a pinyin-driven TTS) instead of raw hanzi.")
    lines.append("- **Normalize before synthesis**: route text through `normalize_for_tts()` so digits/symbols from custom vocab never reach the engine raw.")
    lines.append("- **Enable STT in CI**: set `OPENAI_API_KEY` and run with `--stt openai` to turn the accuracy score from a proxy into a measured diff.")

    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
def load_index() -> dict[str, str]:
    if not INDEX_PATH.exists():
        sys.exit(f"index not found: {INDEX_PATH} (run `npm run build` or generate-audio.mjs first)")
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def find_duplicate_keys(index: dict[str, str], min_shared: int = 3) -> set[str]:
    """Keys whose MP3 bytes are shared by >= min_shared different texts.

    A genuine clip is unique to its text; bytes reused across many unrelated
    texts are a single error/placeholder file saved under many keys.
    """
    import hashlib
    from collections import defaultdict

    by_hash: dict[str, list[str]] = defaultdict(list)
    for text, key in index.items():
        path = AUDIO_DIR / f"{key}.mp3"
        if not path.exists():
            continue
        digest = hashlib.md5(path.read_bytes()).hexdigest()
        by_hash[digest].append(key)
    flagged: set[str] = set()
    for keys in by_hash.values():
        if len(set(keys)) >= min_shared:
            flagged.update(keys)
    return flagged


def audit_one(text: str, key: str, stt_backend: str | None, dup_keys: set[str]) -> ClipResult:
    r = ClipResult(text=text, key=key, path=str(AUDIO_DIR / f"{key}.mp3"))
    check_integrity(r, dup_keys)
    check_pinyin(r)
    if stt_backend:
        check_stt(r, stt_backend)
    return r


def purge_junk(index: dict[str, str], dup_keys: set[str]) -> int:
    """Remove duplicate/junk clips from disk and index.json.

    Reversible: public/audio is git-tracked, so `git restore public/audio`
    undoes this. After purging, the runtime (speech.jsx) finds no local file
    and falls back to live Youdao/Google/browser TTS for those texts.
    """
    junk_texts = [t for t, k in index.items() if k in dup_keys]
    if not junk_texts:
        print("Nothing to purge — no duplicate/junk clips found.")
        return 0

    removed_files = 0
    for key in dup_keys:
        path = AUDIO_DIR / f"{key}.mp3"
        if path.exists():
            path.unlink()
            removed_files += 1
    new_index = {t: k for t, k in index.items() if k not in dup_keys}
    INDEX_PATH.write_text(json.dumps(new_index, ensure_ascii=False), encoding="utf-8")

    print(f"Purged {removed_files} junk file(s) and {len(junk_texts)} index entr(ies).")
    print(f"index.json: {len(index)} → {len(new_index)} entries.")
    print("Re-run `node scripts/generate-audio.mjs` to re-fetch real clips (now guarded), "
          "or rely on runtime live-TTS fallback. Undo with `git restore public/audio`.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Automated TTS QA for the audio corpus.")
    ap.add_argument("--text", help="audit a single string (must already be in index.json)")
    ap.add_argument("--limit", type=int, default=0, help="audit only the first N entries")
    ap.add_argument("--stt", choices=["openai", "whisper"], help="enable the STT accuracy tier")
    ap.add_argument("--purge", action="store_true",
                    help="remediate: delete duplicate/junk clips from disk and index.json "
                         "so the runtime falls back to live TTS. Reversible via `git restore public/audio`.")
    args = ap.parse_args()

    index = load_index()
    items = list(index.items())
    if args.text:
        if args.text not in index:
            sys.exit(f"'{args.text}' is not in index.json")
        items = [(args.text, index[args.text])]
    elif args.limit:
        items = items[: args.limit]

    # Duplicate detection scans the FULL index (a clip is junk only relative to
    # the whole corpus), even when --text/--limit narrows what we report on.
    print("Scanning corpus for duplicate/junk clips…", file=sys.stderr)
    dup_keys = find_duplicate_keys(index)

    if args.purge:
        return purge_junk(index, dup_keys)

    print(f"Auditing {len(items)} clip(s)… STT={args.stt or 'off'}", file=sys.stderr)
    results = [audit_one(t, k, args.stt, dup_keys) for t, k in items]
    summary = score(results, stt_enabled=bool(args.stt))
    write_reports(results, summary, stt_enabled=bool(args.stt))

    s = summary
    print(f"\nOverall: {s['overall']}/10  |  Accuracy {s['accuracy']}  Intonation {s['intonation']}  Audio {s['audio_quality']}")
    c = s["counts"]
    print(f"FAIL {c['fail']}  WARN {c['warn']}  (integrity {c['integrity_fail']}, duplicate {c['duplicate_fail']}, duration {c['duration_warn']}, heteronym {c['heteronym_risk']}, stt {c['stt_mismatch']})")
    print(f"Reports: {REPORT_MD.relative_to(ROOT)} , {REPORT_JSON.relative_to(ROOT)}")
    return 1 if c["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
