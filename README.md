# Tezca-china

Ứng dụng luyện thi HSK: tạo quiz theo cấp độ, chấm điểm và phân tích điểm yếu để đề xuất phần cần ôn.

## Tính năng

- **6 dạng quiz** — Từ vựng, Nghe, Hội thoại, Đọc hiểu, Dịch đoạn, Điền từ
- **Chọn câu thích ứng** — ưu tiên từ mới và từ hay sai, tránh lặp lại câu vừa làm
- **Kiểm tra tổng quát (General Check)** — trộn đủ các dạng để xác định trình độ đầu vào theo cấp HSK
- **Trung tâm phân tích** — hiệu suất theo dạng bài, theo cấp độ, xu hướng 8 phiên gần nhất và danh sách từ yếu
- **Đề xuất luyện tập** — gợi ý cấp độ + dạng bài phù hợp dựa trên dữ liệu học
- **Phát âm (TTS)** — đọc câu/đoạn tiếng Trung bằng Web Speech API
- **Hoạt động offline** — khi không có backend, app tự sinh câu hỏi và lưu tiến độ trong trình duyệt

## Kiến trúc

```
Frontend (React + Vite)          Backend (FastAPI + SQLAlchemy + SQLite)
  main.jsx → App.jsx               /api/quiz          tạo quiz thích ứng
    └─ api-core.js  ───────────►   /api/quiz/submit   chấm điểm, cập nhật tiến độ
        └─ vocab-loader.js         /api/stats         thống kê tổng quan
           (fallback offline)      /api/analytics     phân tích + đề xuất
```

`api-core.js` luôn gọi backend trước; nếu lỗi sẽ chuyển sang chế độ offline dùng dữ liệu từ vựng cục bộ (`data.js`, `vocab-bank.js`, `mega-vocab.js`) và lưu lịch sử vào `localStorage`.

> Lưu ý: logic sinh câu hỏi offline trong `api-core.js` được giữ song song với backend (`question_generator.py`). Khi thay đổi cách dựng câu/đoạn ở một bên, cần cập nhật bên còn lại để tránh lệch.

## Chạy dự án

### Frontend

```bash
npm install
npm run dev
```

### Backend (tùy chọn — app vẫn chạy offline nếu bỏ qua)

```bash
cd backend
pip install -r requirements.txt
python -m app.scripts.seed   # nạp dữ liệu từ vựng + ví dụ
uvicorn app.main:app --reload
```

Cấu hình API base qua biến môi trường `VITE_API_BASE` (mặc định `http://127.0.0.1:8000`).

## Công nghệ

React 19 + Vite · FastAPI · SQLAlchemy · SQLite
