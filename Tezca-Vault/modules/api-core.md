---
tags: [module, frontend, infra]
file: src/api-core.js
---

# api-core

`src/api-core.js` — HTTP client trung tâm (fetch + cold-start retry/backoff, bearer auth). Expose toàn bộ call backend: words, quiz, session events, stats, analytics, auth, leaderboard, speech, custom-vocab. Kèm fallback offline dựng quiz + analytics từ localStorage.

## Phụ thuộc
[[user-scope]] · dynamic import [[vocab-loader]]

## Được dùng bởi
[[App]] · [[auth-context]] · [[PronunciationPractice]] · [[VoiceChat]] · [[CustomVocabInput]] · [[vocab-loader]]

## Liên quan
[[Feature - Offline & Hiệu năng]]
⚠️ [[90 - Code Review & TODO]] CR-1.1 (POST không idempotent bị auto-retry → double-record)
