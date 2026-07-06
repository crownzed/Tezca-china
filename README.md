<div align="center">
  <img src="https://images.unsplash.com/photo-1546964124-0cce460f38ef?q=80&w=1200&auto=format&fit=crop" alt="Tezca Banner" width="100%" style="border-radius: 12px; margin-bottom: 20px; max-width: 800px;" />

  # 🏮 TEZCA 🏮

  **Nền tảng luyện thi HSK thích ứng thông minh — Tích hợp xử lý tín hiệu âm thanh số (DSP) & Trợ lý ngôn ngữ Gemini AI**

  <p align="center">
    <a href="https://github.com/crownzed/Tezca-china/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Status" /></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
    <a href="https://react.dev"><img src="https://img.shields.io/badge/frontend-React%2019-61dafb?style=flat-square&logo=react" alt="React 19" /></a>
    <a href="https://vite.dev"><img src="https://img.shields.io/badge/bundler-Vite%208-646cff?style=flat-square&logo=vite" alt="Vite 8" /></a>
    <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square&logo=fastapi" alt="FastAPI" /></a>
    <a href="https://python.org"><img src="https://img.shields.io/badge/python-3.10%2B-3776ab?style=flat-square&logo=python" alt="Python" /></a>
  </p>

  <h4>
    <a href="https://tezca-china.vercel.app">💻 Trải Nghiệm Demo</a>
    ·
    <a href="https://github.com/crownzed/Tezca-china/issues">🐛 Báo Lỗi</a>
    ·
    <a href="https://github.com/crownzed/Tezca-china/pulls">💡 Đóng Góp Ý Tưởng</a>
  </h4>
</div>

---

## 📌 Mục lục
1. [Giới thiệu](#-giới-thiệu)
2. [✨ Tính năng chính](#-tính-năng-chính)
3. [🛠 Công nghệ sử dụng](#-công-nghệ-sử-dụng)
4. [🚀 Hướng dẫn cài đặt & Chạy thử](#-hướng-dẫn-cài-đặt--chạy-thử)
5. [📸 Ảnh minh họa](#-ảnh-minh-họa)
6. [📂 Cấu trúc thư mục](#-cấu-trúc-thư-mục)
7. [🤝 Quy trình đóng góp](#-quy-trình-đóng-góp)
8. [📄 Giấy phép (License)](#-giấy-phép-license)

---

## 📖 Giới thiệu

**Tezca** là một ứng dụng luyện thi HSK thế hệ mới, kết hợp khả năng cá nhân hoá sâu sắc với các công nghệ AI và xử lý tín hiệu số (DSP) hiện đại. Không chỉ dừng lại ở các bài trắc nghiệm HSK truyền thống, Tezca mang đến khả năng chẩn đoán phát âm chuẩn xác cho người học tiếng Trung bằng cách so khớp cả hai phương diện: **Nhận diện ngữ nghĩa (Identity)** và **Phân tích âm học vật lý (Acoustic)**. 

Hệ thống hỗ trợ cơ chế hoạt động offline thông minh, tự động chuyển đổi giữa chế độ chạy server và cơ sở dữ liệu cục bộ nhằm tối ưu tốc độ, triệt tiêu độ trễ khởi động lạnh (cold-start) và đảm bảo hành trình học tập không bị gián đoạn.

---

## ✨ Tính năng chính

### 🎙️ Chẩn đoán Phát âm Toàn diện (DSP + Gemini Cross-Check)
*   **Lớp Định danh (Identity layer):** Gemini lắng nghe, nhận diện và chuyển đổi bản thu âm của người học thành Chữ Hán và Pinyin thực tế. Sau đó, công cụ `pinyin_scorer` tự động so sánh để tìm ra các lỗi thừa, thiếu hoặc sai lệch âm tiết/dấu thanh một cách tường minh.
*   **Lớp Âm học (Acoustic layer):** Dịch vụ `tone_dsp_service` phân tích đường tần số cơ bản (F0 contour) thực tế của giọng nói, áp dụng thuật toán Dynamic Time Warping (DTW) để căn khớp với các khuôn mẫu thanh điệu Chao tiêu chuẩn. Lớp này còn tính toán các chỉ số vĩ mô như độ lưu loát (fluency - tốc độ nói, số lượt tạm dừng, thời gian dừng) và ngữ điệu (prosody - dải cao độ, xu hướng hạ giọng cuối câu).
*   **Veto chéo (Cross-check):** Tránh hiện tượng nhiễu âm học hoặc đánh giá chủ quan bằng cách lấy giá trị nhỏ nhất (worse of) giữa độ chính xác của DSP và tỷ lệ thanh điệu đúng từ Gemini.
*   **Đóng gói JSON chẩn đoán:** Toàn bộ thông số đo đạc vật lý thô (khoảng cách sai lệch DTW từng âm, thời gian ngắt nghỉ, dải pitch) được cấu trúc hóa thành định dạng JSON để gửi thẳng cho Gemini làm ngữ cảnh đầu vào, giúp AI đóng vai trò huấn luyện viên ngữ âm đưa ra lời khuyên bằng tiếng Việt cực kỳ chi tiết, chính xác trong vòng tối đa 2 câu (không bịa lỗi hay hallucinate).

### 💬 Trò chuyện Giọng nói Trực tiếp (Voice Chat)
*   Luyện hội thoại tiếng Trung tự nhiên theo mô hình turn-based trực tiếp thông qua Gemini Native API.
*   Người học nói qua micro, AI tự nhận dạng và đưa ra câu phản hồi bằng chữ Hán ngắn gọn (phù hợp trình độ HSK 1-4) kèm theo nghĩa dịch tiếng Việt tương ứng.
*   Tự động phát âm câu trả lời của AI bằng bộ chuyển văn bản thành giọng nói (TTS).

### 📝 Luyện tập HSK Thích ứng (Adaptive Quiz)
*   Tạo quiz theo cấp độ HSK (1-6) thuộc 6 dạng bài chính: **Từ vựng** (vocab), **Nghe** (listening), **Đọc hiểu** (reading), **Dịch đoạn** (translation), **Điền từ** (cloze) và **Sắp xếp câu** (drag_drop).
*   Thuật toán chọn câu hỏi thông minh dựa trên lịch sử làm bài, ưu tiên phân phối từ mới và các từ thường xuyên bị làm sai, đồng thời tránh lặp lại câu hỏi vừa làm.
*   **Kiểm tra tổng quát (General Check):** Lược bỏ dạng sắp xếp câu để tạo bài đánh giá đầu vào ngẫu nhiên, xác định chính xác cấp độ HSK phù hợp.

### 🔌 Chạy offline & Tối ưu hóa Hiệu năng
*   Ứng dụng hoạt động mượt mà ngay cả khi không có kết nối internet hoặc backend chưa khởi động kịp thời.
*   Hệ thống tự động degrade về chế độ local sử dụng ngân hàng từ vựng cục bộ (`data.js`, `vocab-bank.js`, `mega-vocab.js`) và lưu tiến trình học tập thông qua `localStorage`.

### 🔐 Đồng bộ Namespace cục bộ theo userId
*   Các khóa lưu trữ tiến trình học tập tại trình duyệt (`localStorage`) được tự động phân tách theo userId hiện tại đăng nhập (`key::userId`).
*   Đảm bảo không xảy ra hiện tượng chồng chéo dữ liệu khi có nhiều người đăng nhập trên cùng một trình duyệt, đồng thời bảo toàn dữ liệu khách (guest) trước đó khi chưa login.

### 📊 Trung tâm Phân tích & Đề xuất Học tập
*   Phân tích chi tiết hiệu suất làm bài theo dạng bài, cấp độ và liệt kê danh sách từ vựng còn yếu.
*   Biểu đồ xu hướng Bezier mượt mà hiển thị hiệu năng qua 8 phiên học gần nhất kèm hiệu ứng tương tác trực quan.
*   Gợi ý lộ trình luyện tập thông minh dựa trên hành vi học thực tế thông qua `behavior-engine`.

---

## 🛠 Công nghệ sử dụng

| Tầng / Vai trò | Công nghệ chính | Mô tả |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 8 | Xây dựng giao diện ứng dụng tối tân, tốc độ phản hồi cực cao. |
| **Animation nét vẽ** | Hanzi Writer | Hiển thị thứ tự và hoạt họa các nét vẽ chữ Hán trực quan. |
| **Thiết kế & Icon** | Lucide React, CSS | Giao diện tối giản mang phong cách Zen hiện đại, hỗ trợ Dark/Light mode. |
| **Backend API** | FastAPI, Python 3.10+ | RESTful API hiệu năng cao, xử lý đa luồng bất đồng bộ. |
| **Xử lý tín hiệu (DSP)** | NumPy, Praat / Parselmouth | Trích xuất F0, tính toán sai lệch DTW thanh điệu và các chỉ số lưu loát. |
| **Trí tuệ nhân tạo (AI)** | Gemini Native API, DeepSeek (fallback) | Nhận diện giọng nói, trò chuyện ngôn ngữ tự nhiên và chẩn đoán ngữ âm. |
| **Cơ sở dữ liệu** | SQLite, SQLAlchemy (ORM) | Lưu trữ tiến trình cục bộ, hỗ trợ Turso (libSQL) cho môi trường production. |

---

## 🚀 Hướng dẫn cài đặt & Chạy thử

### Yêu cầu hệ thống
*   Node.js phiên bản 18 trở lên.
*   Python phiên bản 3.10 trở lên.

---

### 1. Cài đặt và chạy Frontend

Mở một cửa sổ dòng lệnh tại thư mục gốc của dự án:

```bash
# Cài đặt các gói phụ thuộc
npm install

# Chạy ứng dụng ở chế độ phát triển (Development)
npm run dev
```
Giao diện Web sẽ khả dụng tại địa chỉ mặc định: [http://localhost:5173](http://localhost:5173).

Để đóng gói phiên bản Production (nạp sẵn tài nguyên âm thanh và dữ liệu Hán tự):
```bash
npm run build
```

---

### 2. Cài đặt và chạy Backend (Tùy chọn)

Di chuyển vào thư mục `backend/`:

```bash
cd backend

# Khởi tạo môi trường ảo Python
python -m venv .venv

# Kích hoạt môi trường ảo (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Kích hoạt môi trường ảo (Linux / macOS)
# source .venv/bin/activate

# Cài đặt các gói thư viện cần thiết
pip install -r requirements.txt

# Nạp dữ liệu từ vựng HSK gốc và câu ví dụ mẫu vào database
python -m app.scripts.seed

# Khởi động máy chủ FastAPI
uvicorn app.main:app --reload --port 8000
```
*Mặc định, nếu không cấu hình biến môi trường `DATABASE_URL`, Backend sẽ tự động sử dụng cơ sở dữ liệu SQLite cục bộ tại `backend/dev.db`.*

---

### 3. Deploy và Cấu hình Môi trường Production

*   **Frontend (Vercel):** Cấu hình biến `VITE_API_BASE` trỏ tới URL API Backend trên production. Chạy lệnh:
    ```bash
    npm run deploy
    ```
*   **Backend (Fly.io + Turso):** Cấu hình các biến môi trường thiết yếu trên Fly.io:
    *   `DATABASE_URL`: Đường dẫn kết nối tới cơ sở dữ liệu Turso (libSQL).
    *   `TURSO_AUTH_TOKEN`: Token xác thực Turso.
    *   `JWT_SECRET`: Khóa bảo mật để ký và xác thực token JWT người dùng.
    *   `GEMINI_NATIVE_API_KEYS`: Danh sách API Key của Google Gemini phục vụ các tính năng Speech AI (phân tách bằng dấu phẩy).

---

## 📸 Ảnh minh họa

<div align="center">
  <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop" alt="Giao diện Dashboard của Tezca" width="100%" style="border-radius: 8px; margin-bottom: 15px; max-width: 600px;" />
  <p><i>Ảnh minh họa 1: Bảng điều khiển phân tích tiến trình học tập và đề xuất thích ứng</i></p>

  <img src="https://images.unsplash.com/photo-1616469829581-73993eb86b02?q=80&w=1200&auto=format&fit=crop" alt="Giao diện Luyện tập phát âm" width="100%" style="border-radius: 8px; margin-bottom: 15px; max-width: 600px;" />
  <p><i>Ảnh minh họa 2: Màn hình chấm điểm phát âm kết hợp phân tích thanh điệu thời gian thực</i></p>
</div>

---

## 📂 Cấu trúc thư mục

Dưới đây là sơ đồ cấu trúc thư mục rút gọn của phần mã nguồn Frontend (`src/`):

```text
src/
├── components/                     # Các thành phần giao diện dùng chung
│   ├── Conversation/               # Giao diện và lô-gích tooltip tra từ trong hội thoại
│   ├── Pronunciation/              # Component phụ trợ luyện phát âm (ScoreRing, Waveform...)
│   ├── CustomVocabInput.jsx        # Giao diện tự thêm từ vựng của người dùng
│   ├── PronunciationPractice.jsx   # Giao diện chính luyện phát âm & chấm điểm
│   └── VoiceChat.jsx               # Giao diện đàm thoại hai chiều bằng giọng nói với AI
├── assets/                         # Tài nguyên tĩnh (hình ảnh, logo...)
├── App.jsx                         # Thành phần gốc điều hướng giao diện và quản lý state chung
├── api-core.js                     # Core tích hợp API Backend và cơ chế Offline Fallback
├── auth-core.js                    # Quản lý trạng thái xác thực và token JWT
├── auth-ui.jsx                     # Form đăng nhập, đăng ký và modal điều khiển auth
├── behavior-engine.js              # Động cơ phân tích hành vi và cập nhật chỉ số EWMA
├── chinese-learning-items.js       # Xử lý lô-gích chấm điểm chữ Hán và Pinyin đầu vào
├── learning-session-planner.js     # Lập kế hoạch học tập hàng ngày cho từng cá nhân
├── speech.jsx                      # Quản lý phát âm tự động TTS (Web Speech API)
├── speech-ai.js                    # API trung gian ghi âm micro phía Client
├── user-scope.js                   # Xử lý phân tách Namespace local storage theo userId
└── vocab-loader.js                 # Bộ tải từ vựng cục bộ phục vụ chế độ offline
```

---

## 🤝 Quy trình đóng góp

Mọi ý kiến đóng góp nhằm cải thiện và phát triển dự án luôn được chào đón. Bạn có thể đóng góp theo các bước sau:

1. Fork dự án này về tài khoản cá nhân của bạn.
2. Tạo một nhánh mới để phát triển tính năng hoặc sửa lỗi (`git checkout -b feature/AmazingFeature`).
3. Commit các thay đổi của bạn (`git commit -m 'Add some AmazingFeature'`).
4. Push nhánh của bạn lên kho lưu trữ từ xa (`git push origin feature/AmazingFeature`).
5. Mở một Pull Request trên nhánh chính của dự án gốc để thảo luận và kiểm tra mã nguồn.

---

## 📄 Giấy phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Mọi chi tiết xin vui lòng xem nội dung tệp tin `LICENSE` (nếu có) hoặc liên hệ ban quản trị dự án.

---

<div align="center">
  <p>Thiết kế tinh tế và vận hành thông minh bởi <b>Tezca Development Team</b> ❤️</p>
</div>
