---
tags: [module, frontend, speech]
file: src/speech.jsx
---

# speech

`src/speech.jsx` — Lớp TTS: `speak`/`stopSpeech`, unlock speech, preload audio-index, resolve audio-text cho câu hỏi, và chuẩn hóa số/ký hiệu tiếng Trung (port từ `scripts/tts_qa.py`). Standalone.

## Được dùng bởi
[[App]] · [[PronunciationPractice]] · [[VoiceChat]]

## Liên quan
[[Feature - Chẩn đoán phát âm]]
⚠️ [[90 - Code Review & TODO]] CR-1.4 (`normalizeForTts` chạy trước lookup audio-index → clip cục bộ bị bỏ qua với text số/ký hiệu)
