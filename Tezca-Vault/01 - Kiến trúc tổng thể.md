---
tags: [moc, architecture]
---

# 01 - Kiến trúc tổng thể

[[00 - Home]] · [[10 - Tính năng]] · [[20 - Frontend]] · [[40 - Backend]]

## Sơ đồ tầng
```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 / Vite 8)  — src/         │
│  App.jsx (shell) ── lazy ──> Feature comps    │
│         │                                     │
│         ▼                                     │
│  api-core.js  ◄── offline fallback ──► localStorage
│         │  (fetch + cold-start retry)         │
└─────────┼─────────────────────────────────────┘
          │ HTTP (VITE_API_BASE)
┌─────────▼─────────────────────────────────────┐
│  Backend (FastAPI / Python 3.10+) — backend/   │
│  routers/  ──>  services/  ──>  models (ORM)   │
│                     │                          │
│    ┌────────────────┼────────────────┐         │
│    ▼                ▼                ▼         │
│  DSP           Gemini AI          SRS/Quiz     │
│ (parselmouth) (speech_ai)      (srs/question)  │
└──────────────────┬─────────────────────────────┘
                   ▼
        SQLite (dev.db) / Turso (prod)
```

## Nguyên tắc thiết kế then chốt

### Offline-first fallback
`api-core.js` là điểm nghẽn trung tâm: mọi lệnh gọi backend đi qua đây. Nếu backend chưa sẵn sàng (cold-start) hoặc mất mạng, hệ thống tự degrade về chế độ local — dựng quiz + analytics từ `localStorage` và ngân hàng từ vựng cục bộ. Xem [[api-core]] và [[Feature - Offline & Hiệu năng]].

### Namespace theo userId
Mọi khóa `localStorage` được phân tách theo user đăng nhập qua [[user-scope]] (`key::userId`), tránh chồng chéo dữ liệu nhiều người trên cùng trình duyệt.

### Chẩn đoán phát âm 2 lớp + veto chéo
- **Identity layer**: Gemini nhận diện → `pinyin_scorer` so khớp âm tiết/thanh.
- **Acoustic layer**: `tone_dsp_service` phân tích F0 contour + DTW.
- **Cross-check**: lấy giá trị tệ hơn (worse-of) giữa DSP và Gemini để chống hallucinate.

Chi tiết: [[Feature - Chẩn đoán phát âm]].

### Song song frontend ↔ backend cho behavior
Suy luận trạng thái người học tồn tại ở **cả hai phía**: [[behavior-engine]] (client, EWMA) và `behavior_service.py` (server). Cần đồng bộ logic khi thay đổi.

## Bản đồ phụ thuộc (tóm tắt)
- Shell: [[App]] lazy-load 4 feature component
- HTTP: [[api-core]] ← [[user-scope]], dynamic import [[vocab-loader]]
- Auth: [[auth-core]] (primitives) + [[auth-context]] (provider)
- Học tập: [[learning-session-planner]] → [[behavior-engine]]

## Liên quan
- [[90 - Code Review & TODO]] — CR-ITEM-1.1 nằm ngay ở tầng `api-core` retry
