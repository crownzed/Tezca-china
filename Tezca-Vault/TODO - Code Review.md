---
tags: [code-review, todo, quality]
---

# TODO - Code Review

Findings từ đợt review (nguồn: `TODO_code-review.md`). Phạm vi: `quiz_review.diff`, `review_diff.txt` — đã re-verify trên source hiện tại.

Về liên kết ngược: các module bị ảnh hưởng trỏ tới đây.

## Findings

### CR-ITEM-1.1 — POST không idempotent bị auto-retry → có thể ghi kép
- **Mức**: Warning (correctness)
- **Vị trí**: [[api-core]] `request()` (src/api-core.js:517-541)
- Retry once trên lỗi network **và** 502/503/504 cho *mọi* method. POST mutating (`recordLearningEvent`, `startQuiz`, `voiceChat`, `scorePronunciation`, session start/complete) có thể bị submit hai lần sau 504.
- **Fix đề xuất**: chỉ retry GET/HEAD.

### CR-ITEM-1.2 — Chuỗi dummy drag-drop có thể lọt ra option grid
- **Mức**: Warning (correctness / UX)
- **Vị trí**: [[App]] (render fallthrough), [[Services#question_generator]] (dummy source)
- Nếu drag_drop tới với `segments` rỗng nhưng có 4 `options`, ternary rơi xuống `option-grid` → hiển thị `__drag_drop_dummy_*`. Rủi ro nằm ở câu cache/tái sử dụng.
- **Fix đề xuất**: fail-safe khi `dragSegments.length === 0` (auto-skip / báo câu không khả dụng).

### CR-ITEM-1.3 — Cap độ dài đoạn văn HSK1/2 có thể âm thầm drop câu
- **Mức**: Warning (correctness / content)
- **Vị trí**: [[Services#question_generator]] (`_PARAGRAPH_CJK_CAP_BY_LEVEL`, `_within_cap`)
- Cap 16 CJK cho HSK1 rất chặt; `translation` trả `None` → drop câu. Batch reading/translation HSK1/2 có thể thiếu/rỗng.
- **Fix đề xuất**: nâng cap hoặc chọn ví dụ ngắn nhất thay vì trả `None`.

### CR-ITEM-1.4 — `normalizeForTts` chạy trước lookup audio index
- **Mức**: Suggestion
- **Vị trí**: [[speech]] `speak()` (src/speech.jsx:257-266)
- Text số/ký hiệu bị normalize trước khi tra `audioIndex` → không khớp key → luôn rơi về online TTS. Ảnh hưởng chủ yếu custom-vocab.

### CR-ITEM-1.5 — `scheduleDailyReminder` dựa vào setTimeout 24h
- **Mức**: Suggestion
- **Vị trí**: [[notifications]] (src/notifications.js:48-57)
- Tab nền bị throttle, OS sleep pause timer → fire time drift. Giới hạn cố hữu của SPA.

### CR-ITEM-1.6 — `.speech-toast` fixed position có thể chồng lấn
- **Mức**: Suggestion (UX)
- **Vị trí**: src/index.css `.speech-toast`, dùng bởi [[PronunciationPractice]] + [[VoiceChat]]
- Không auto-dismiss. Rủi ro thấp vì chỉ 1 feature hiển thị mỗi lúc.

### CR-ITEM-1.7 — `tts.py` luôn dùng `keys[0]`, không rotate
- **Mức**: Suggestion
- **Vị trí**: [[Routers]] `tts.py`
- `GEMINI_NATIVE_API_KEYS` số nhiều nhưng TTS ghim key đầu → 503 khi key đó hết quota. FE có fallback Youdao/Google/browser.

## Tests đề xuất
- **CR-TEST-2.1** — drag_drop đảm bảo `segments` non-empty + `correct_order` ≥2 token phân biệt.
- **CR-TEST-2.2** — POST 504 **không** retry; GET retry once.
- **CR-TEST-2.3** — HSK1/2 translation/reading trả đủ số câu yêu cầu.
- **CR-TEST-2.4** — `getLocalAudioSrc` trả `''` nếu không có trong index.
