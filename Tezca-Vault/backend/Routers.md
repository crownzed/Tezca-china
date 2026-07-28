---
tags: [backend, routers, api]
---

# Backend Routers

Tầng HTTP của FastAPI (`backend/app/routers/`). Mỗi router nhận request, gọi [[Services|service]] tương ứng và trả schema.

Xem tổng quan tầng: [[40 - Backend]] · Client phía FE: [[api-core]]

## Danh sách router

| Router | Đường dẫn chính | Vai trò | Service gọi tới |
| :--- | :--- | :--- | :--- |
| `auth.py` | `/api/auth/*` | register / login / me / profile | [[Services#auth_service]] |
| `quiz.py` | `/api/quiz/*` | Sinh quiz + nộp bài | [[Services#quiz_service]], [[Services#question_generator]], [[Services#session_service]] |
| `words.py` | `/api/words` | Nguồn từ vựng chuẩn | — |
| `speech.py` | `/api/speech/*` | Chấm phát âm + voice chat | [[Services#pinyin_scorer]], [[Services#tone_dsp_service]], [[Services#speech_ai_service]] |
| `tts.py` | `/api/tts` | Sinh audio TTS (Gemini native) | — |
| `custom_vocab.py` | `/api/custom-vocab/*` | Draft / lưu bài tập tự tạo | [[Services#output_service]], [[Services#question_generator]] |
| `leaderboard.py` | `/api/leaderboard` | Bảng xếp hạng | [[Services#leaderboard_service]] |

## Liên kết tính năng

- `quiz.py` → [[Feature - Adaptive Quiz]]
- `speech.py` → [[Feature - Chẩn đoán phát âm]], [[Feature - Voice Chat]]
- `tts.py` → [[Feature - Voice Chat]] (⚠️ ghim `keys[0]`, xem [[TODO - Code Review#CR-ITEM-1.7]])
- `custom_vocab.py` → [[Feature - Tự thêm từ vựng]]
- `auth.py` → [[Feature - Namespace userId]]

## Ghi chú kỹ thuật

- Grading dùng `correct = selected_index == question.correct_index` (`session_service.py`); `correct_index=0` cho drag_drop/voice khớp với UI gửi `0` khi đúng.
- Core app: `main.py`, `db.py`, `deps.py`, `models.py`, `schemas.py`, `settings.py`.
