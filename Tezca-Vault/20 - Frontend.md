---
tags: [moc, frontend]
---

# 20 - Frontend

[[00 - Home]] · [[01 - Kiến trúc tổng thể]] · [[40 - Backend]]

React 19 + Vite 8, mã nguồn trong `src/`.

## Shell & điều hướng
- [[App]] — root SPA, nav/theme/dashboard, lazy-load feature

## Tầng dữ liệu & hạ tầng
- [[api-core]] — HTTP client + offline fallback
- [[vocab-loader]] — nạp/gộp từ vựng
- [[user-scope]] — namespace localStorage theo userId
- [[strategy-flags]] — cờ tính năng từ Vite env

## Auth
- [[auth-core]] — context + hook + primitives
- [[auth-context]] — AuthProvider (login/register/logout)

## Logic học tập
- [[behavior-engine]] — suy luận trạng thái người học (EWMA)
- [[learning-session-planner]] — kế hoạch phiên học hàng ngày
- [[chinese-learning-items]] — dựng chuỗi learning-item + chấm pinyin

## Ngữ pháp
- [[grammar-db]] — dataset ngữ pháp HSK 1-3 (tĩnh)
- [[grammar-progress]] — tiến trình Leitner cục bộ

## Giọng nói
- [[speech]] — tầng TTS + chuẩn hóa số/ký hiệu
- [[speech-ai]] — ghi âm mic → WAV 16kHz base64

## Tiện ích UI
- [[notifications]] — nhắc học hàng ngày (tab mở)

## Feature components (lazy)
- [[PronunciationPractice]]
- [[VoiceChat]]
- [[GrammarLab]]
- [[CustomVocabInput]]
