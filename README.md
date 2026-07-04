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

## Deploy online

**Frontend (Firebase Hosting):** https://tiengtrung-49e13.web.app

```bash
npm run deploy
```

**Backend online** — chọn một trong hai cách:

### Cách 1: Google Cloud Run (cùng project Firebase)

1. Bật billing cho project `tiengtrung-49e13`: [Google Cloud Billing](https://console.cloud.google.com/billing/linkedaccount?project=tiengtrung-49e13)
2. Deploy API:
   ```bash
   npm run deploy:api
   ```
3. Bật proxy `/api` trên Hosting và deploy lại:
   ```bash
   npm run deploy:all
   ```

### Cách 2: Fly.io + Turso (đang dùng)

1. Deploy backend từ thư mục `backend/` (có `fly.toml`): `fly deploy`
2. Set secrets trên Fly: `DATABASE_URL` (Turso libSQL), `TURSO_AUTH_TOKEN`, `JWT_SECRET`, các API key
3. Trỏ `.env.production` sang URL Fly:
   ```
   VITE_API_BASE=https://tezca-china.fly.dev
   ```
4. Deploy lại frontend: `npm run deploy` (Firebase) hoặc `vercel --prod`

> Khi chưa có backend online, app vẫn chạy được ở chế độ offline trên Firebase.

## Công nghệ

React 19 + Vite · FastAPI · SQLAlchemy · Turso (libSQL) · Fly.io · Vercel/Firebase
