---
tags: [moc, backend]
---

# 40 - Backend

[[00 - Home]] · [[01 - Kiến trúc tổng thể]] · [[20 - Frontend]]

FastAPI + SQLAlchemy, Python 3.10+, mã nguồn trong `backend/app/`.
DB: SQLite (`backend/dev.db`) mặc định, Turso/libSQL cho production.

> [!warning] Trạng thái deploy: ĐÃ XÓA FLY — chạy thuần local (từ 2026-07-16)
> App Fly `tezca-china` đã bị **xóa vĩnh viễn** (`fly apps destroy`) ngày 2026-07-16. Không còn máy, IP dedicated, image hay hostname `tezca-china.fly.dev`. Phí Fly = $0. Phát triển hoàn toàn local.
>
> **Chạy local:**
> - Backend: `cd backend && uvicorn app.main:app --reload` → tự dùng `sqlite:///./dev.db` (vì `backend/.env` không set `DATABASE_URL`).
> - Frontend: `npm run dev` → Vite tự trỏ API về `http://127.0.0.1:8000`.
>
> **Tàn dư cấu hình Fly còn trong repo (KHÔNG còn tác dụng, chỉ để tham khảo):**
> - `backend/fly.toml` — config cũ, app đã bị xóa nên `fly deploy` sẽ không tìm thấy app.
> - `backend/fly.secrets`, `backend/.turso.local` — secrets + token Turso cũ (local, đã gitignore).
> - `.env.production` — vẫn trỏ `VITE_API_BASE=https://tezca-china.fly.dev` (host này giờ đã chết).
>
> **Muốn deploy lại sau này:** phải tạo app Fly MỚI (`cd backend && fly launch`), rồi set lại secrets. Turso DB là dịch vụ riêng — kiểm tra dashboard Turso nếu cần. Không có CI auto-deploy.
>
> **Việc còn tồn (chưa xử lý — để sau):**
> - [ ] **Turso DB** — vẫn tồn tại, chưa đụng. Free-tier thường $0 nhưng nên tự kiểm tra dashboard Turso để chắc.
> - [ ] **Dọn tàn dư repo** — `backend/fly.toml`, `backend/fly.secrets`, `backend/.turso.local`, `.env.production` giờ trỏ host đã chết. Gỡ khi nào quyết dứt điểm không dùng Fly nữa.

## Core
`main.py` (app), `db.py`, `deps.py`, `models.py`, `schemas.py`, `settings.py`

## Routers (`routers/`)
| Router | Vai trò |
| :--- | :--- |
| `auth.py` | register / login / me / profile |
| `quiz.py` | sinh quiz + submit |
| `words.py` | `/api/words` — nguồn từ vựng |
| `speech.py` | pronunciation + chat |
| `tts.py` | audio TTS ⚠️ xem [[90 - Code Review & TODO]] CR-1.7 |
| `custom_vocab.py` | draft/save bài tập |
| `leaderboard.py` | bảng xếp hạng |

## Services (`services/`) theo nhóm

### Giọng nói & DSP
- `pinyin_scorer.py` — chấm phát âm xác định (deterministic)
- `tone_dsp_service.py` — F0/pitch contour (parselmouth) + DTW
- `speech_ai_service.py` — orchestrate Gemini transcription/voice-chat

### Spaced repetition / retrieval
- `srs_service.py`, `retrieval_service.py`, `retrieval_ladder_service.py`
- `priority_service.py`, `acquisition_service.py`

### Sinh câu hỏi
- `question_generator.py` ⚠️ CR-1.2, CR-1.3
- `template_engine.py`, `llm_generator_service.py`
- `distractor_policy.py`, `viet_distractor.py`

### Behavior & difficulty (song song [[behavior-engine]])
- `behavior_service.py`, `difficulty_service.py`, `item_difficulty.py`

### Session & sự kiện
- `session_service.py`, `event_service.py`, `quiz_service.py`

### Khác
- `auth_service.py`, `grammar_checker.py`, `output_service.py`
- `enrichment_service.py`, `chinese_metadata_service.py`, `repair_service.py`
- `leaderboard_service.py`, `profile_service.py`, `learning_utils.py`, `tuning.py`

## Liên quan
- [[Feature - Chẩn đoán phát âm]] — dùng `pinyin_scorer` + `tone_dsp_service`
- [[90 - Code Review & TODO]] — phần lớn findings nằm ở backend
