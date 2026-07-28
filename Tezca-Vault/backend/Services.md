---
tags: [backend, services]
---

# Backend Services

Tầng logic nghiệp vụ (`backend/app/services/`). Được gọi bởi [[Routers]].

Xem tổng quan tầng: [[40 - Backend]]

## Speech / DSP
Nhóm phục vụ [[Feature - Chẩn đoán phát âm]] và [[Feature - Voice Chat]].

- **pinyin_scorer** — Chấm phát âm tất định so với pinyin mục tiêu (lớp Identity).
- **tone_dsp_service** — Phân tích F0/pitch (parselmouth), so khớp contour thanh điệu (lớp Acoustic). Đối tác FE: [[speech-ai]].
- **speech_ai_service** — Điều phối Gemini transcription / voice-chat.

## Auth
- **auth_service** — Băm mật khẩu, sinh token, xác thực người dùng. Router: [[Routers]] `auth.py`. FE: [[auth-core]], [[auth-context]].

## Session / Event / Quiz
Nhóm phục vụ [[Feature - Adaptive Quiz]] và [[Feature - Analytics & Đề xuất]].

- **session_service** — Vòng đời phiên học, grading (`selected_index == correct_index`).
- **event_service** — Ghi nhận learning event.
- **quiz_service** — Lắp ráp quiz.

## Spaced Repetition / Retrieval
- **srs_service**, **retrieval_service**, **retrieval_ladder_service**, **priority_service**, **acquisition_service** — Lập lịch ôn tập / truy hồi.

## Behavior / Difficulty
Đối tác backend của [[behavior-engine]] (FE).

- **behavior_service** — Trạng thái hành vi người học.
- **difficulty_service**, **item_difficulty** — Tinh chỉnh độ khó.

## Question / Distractor Generation
Phục vụ [[Feature - Adaptive Quiz]] và [[Feature - Tự thêm từ vựng]].

- **question_generator** — Sinh câu hỏi. ⚠️ Caps độ dài đoạn văn HSK1/2 có thể drop câu, xem [[TODO - Code Review#CR-ITEM-1.3]]; dummy drag-drop, xem [[TODO - Code Review#CR-ITEM-1.2]].
- **template_engine**, **llm_generator_service**, **distractor_policy**, **viet_distractor** — Sinh mẫu câu và đáp án nhiễu.

## Khác
- **grammar_checker** — Kiểm tra ngữ pháp. FE: [[GrammarLab]], [[Feature - Grammar Lab]].
- **output_service** — Chấm guided-output. Router: `custom_vocab.py`.
- **enrichment_service**, **chinese_metadata_service** — Làm giàu metadata.
- **repair_service** — Vòng lặp sửa lỗi.
- **leaderboard_service** — Bảng xếp hạng.
- **profile_service**, **learning_utils**, **tuning** — Hồ sơ, tiện ích, tinh chỉnh.
