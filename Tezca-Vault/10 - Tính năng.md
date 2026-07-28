---
tags: [moc, features]
---

# 10 - Tính năng

[[00 - Home]] · [[01 - Kiến trúc tổng thể]]

Góc nhìn người dùng về những gì Tezca làm được.

## Danh sách
- [[Feature - Chẩn đoán phát âm]] 🎙️ — DSP + Gemini cross-check
- [[Feature - Voice Chat]] 💬 — hội thoại turn-based
- [[Feature - Quiz thích ứng]] 📝 — 6 dạng bài HSK 1-6
- [[Feature - Offline & Hiệu năng]] 🔌 — chạy không cần backend
- [[Feature - Phân tích học tập]] 📊 — dashboard + đề xuất
- [[Feature - Grammar Lab]] 📚 — luyện ngữ pháp Leitner

## Ánh xạ tính năng → module
| Tính năng | Frontend | Backend |
| :--- | :--- | :--- |
| Phát âm | [[PronunciationPractice]], [[speech-ai]] | `pinyin_scorer`, `tone_dsp_service` |
| Voice Chat | [[VoiceChat]], [[speech]] | `speech_ai_service` |
| Quiz | [[App]], [[chinese-learning-items]] | `question_generator`, `quiz_service` |
| Offline | [[api-core]], [[vocab-loader]] | — |
| Phân tích | [[App]], [[behavior-engine]] | `behavior_service` |
| Grammar | [[GrammarLab]], [[grammar-progress]] | `grammar_checker` |
