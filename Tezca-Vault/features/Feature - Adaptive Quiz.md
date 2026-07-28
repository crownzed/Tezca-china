---
tags: [feature, quiz]
---

# Feature - Adaptive Quiz

Tạo quiz theo cấp HSK 1-6, 6 dạng bài: từ vựng, nghe, đọc hiểu, dịch đoạn, điền từ (cloze), sắp xếp câu (drag_drop). Thuật toán chọn câu dựa lịch sử làm bài, ưu tiên từ mới + từ hay sai, tránh lặp. General Check bỏ drag_drop để đánh giá đầu vào.

## Frontend
[[App]] (Quiz flow) · [[api-core]] (`startQuiz`, submit) · [[chinese-learning-items]]

## Backend
[[40 - Backend]] — `quiz.py`, `quiz_service.py`, `question_generator.py`, `distractor_policy.py`, `session_service.py`

## Rủi ro liên quan
[[TODO - Code Review]] — CR-ITEM-1.2 (drag-drop dummy leak), CR-ITEM-1.3 (paragraph cap drop câu)

## MOC
[[10 - Tính năng]]
