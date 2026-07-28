---
tags: [feature, speech, dsp, ai]
---

# Feature - Chẩn đoán phát âm

Chấm điểm phát âm toàn diện: kết hợp lớp **Định danh** (Gemini nhận diện Hán tự + Pinyin, so khớp qua `pinyin_scorer`) và lớp **Âm học** (`tone_dsp_service` phân tích F0 contour + DTW với khuôn thanh điệu Chao, đo fluency & prosody). Cross-check lấy giá trị tệ hơn giữa DSP và Gemini để tránh nhiễu.

## Frontend
[[PronunciationPractice]] · [[speech-ai]] (ghi âm) · [[speech]] (TTS) · [[api-core]] (`scorePronunciation`)

## Backend
[[40 - Backend]] — `spech.py`, `pinyin_scorer.py`, `tone_dsp_service.py`, `speech_ai_service.py`

## Ghi chú kỹ thuật
- Đóng gói JSON chẩn đoán (DTW từng âm, thời gian ngắt nghỉ, dải pitch) gửi Gemini làm ngữ cảnh.
- Liên quan corpus hiệu chuẩn ngưỡng DSP — xem memory pronunciation corpus.

## MOC
[[10 - Tính năng]]
