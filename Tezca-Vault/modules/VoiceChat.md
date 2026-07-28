---
tags: [module, frontend, component, speech]
file: src/components/VoiceChat.jsx
---

# VoiceChat

`src/components/VoiceChat.jsx` — Feature 2: hội thoại giọng nói turn-based (record → Gemini reply → TTS).

## Phụ thuộc
[[api-core]] · [[speech]] · [[speech-ai]] · `components/Conversation/{ChatBubble,TypingIndicator,hanzi-lookup}`

## Được dùng bởi
[[App]] (lazy-load)

## Liên quan
[[Feature - Voice Chat]]
Backend: [[40 - Backend]] `speech_ai_service.py`, `spech.py`
