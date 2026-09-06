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
5. [🧠 Xây dựng AI — checklist chi tiết](#-xây-dựng-ai--checklist-chi-tiết)
6. [🔁 Lộ trình tự học của AI](#-lộ-trình-tự-học-của-ai)
7. [📸 Ảnh minh họa](#-ảnh-minh-họa)
8. [📂 Cấu trúc thư mục](#-cấu-trúc-thư-mục)
9. [🤝 Quy trình đóng góp](#-quy-trình-đóng-góp)
10. [📄 Giấy phép (License)](#-giấy-phép-license)

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
| **Trí tuệ nhân tạo (AI)** | StepFun Step Plan (sinh câu hỏi + TTS), Gemini Native API (giọng nói) | Nhận diện giọng nói, trò chuyện ngôn ngữ tự nhiên, chẩn đoán ngữ âm và sinh câu hỏi luyện tập. |
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
    *   `STEPFUN_API_KEYS`: API Key StepFun Step Plan cho TTS tiếng Trung (khuyến nghị khi cần giọng đọc rõ cho học tập).

---

## 🧠 Xây dựng AI — checklist chi tiết

Phần này là quy trình đầy đủ để dựng tầng AI của Tezca từ một repo trắng đến trạng thái chạy được trên production. Các giai đoạn có thứ tự phụ thuộc: **không bỏ qua giai đoạn trước**, vì mỗi bước sau đọc dữ liệu do bước trước sinh ra.

### Giai đoạn 0 — Cấu hình provider LLM (làm một lần)

Toàn bộ tính năng sinh nội dung đi qua một provider duy nhất. Khi không có key, hệ thống **không crash** mà tự degrade về ngân hàng câu hỏi tĩnh — nên nếu quiz vẫn chạy mà không thấy câu mới, hãy kiểm tra key trước tiên.

1. Tạo `backend/.env` từ mẫu:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Điền các biến theo bảng sau (tên biến lấy từ [settings.py](backend/app/settings.py)):

   | Biến | Bắt buộc | Ý nghĩa & lưu ý |
   | :--- | :---: | :--- |
   | `STEPFUN_API_KEYS` | ✅ | Key StepFun Step Plan, phân tách bằng dấu phẩy. **Provider AI chính**: dùng chung một bộ key cho cả chat (sinh câu hỏi, model `step-3.7-flash`) và TTS (`stepaudio-2.5-tts`, voice `zixinnansheng`). Chỉ cần đặt biến này là xong, không phải khai URL/model. **Không commit key.** |
   | `STEPFUN_CHAT_URL` | — | Mặc định `https://api.stepfun.ai/step_plan/v1/chat/completions`. Path `/step_plan/v1` là **bắt buộc** với key Step Plan: đo trên key thật, `/step_plan/v1` trả 200 còn `/v1` (trả tiền theo token) trả 402 `quota_exceeded`. |
   | `STEPFUN_CHAT_MODEL` | — | Mặc định `step-3.7-flash`. Các lựa chọn khác trong Step Plan: `step-3.5-flash`, `step-3.5-flash-2603` (model này chỉ nhận effort `low`/`high`). |
   | `STEPFUN_TTS_VOICE` | — | Mặc định `zixinnansheng` — giọng nam rõ, phù hợp đọc nội dung học tiếng Trung. Đã dò 9 giọng khác trong tài liệu StepFun: **tất cả trả 400 `voice_id does not exist`** trên Step Plan, và `GET /audio/voices` trả danh sách rỗng — đây là giọng duy nhất khả dụng, đừng mất công thử đổi. |
   | `STEPFUN_TTS_INSTRUCTION` | — | Chỉ dẫn giọng đọc cho câu ĐỌC LẺ (flashcard, quiz, luyện nghe); mặc định trung tính: rõ, tự nhiên, hơi chậm, đúng thanh điệu. Giữ trung tính có chủ ý — ở đó câu được nghe lặp nhiều lần nên đều đặn là ưu điểm. |
   | `STEPFUN_TTS_INSTRUCTION_CHAT` | — | Chỉ dẫn RIÊNG cho hội thoại (`/tts/stream`), sinh động hơn. Đo trên key thật so với chuỗi trung tính: **F0 trung vị 116→129Hz (+11%), cường độ +2.0dB**, ASR chép lại vẫn khớp nên thanh điệu không méo. Nếu sửa: phải dùng từ **dứt khoát** (`音调偏高`, `重音明显`) — mô tả mơ hồ kiểu `语调有自然起伏` đo ra không khác bản trung tính, và cụm `语速稍慢` còn đẩy giọng về kiểu phát thanh **phẳng hơn** cả mặc định. Luôn giữ `声调准确清晰` ở cuối. |
   | `STEPFUN_TTS_WS_URL` | — | Mặc định `wss://api.stepfun.ai/step_plan/v1/realtime/audio`. TTS streaming cho chế độ gọi: byte đầu ~0.65s so với ~3.0s của HTTP. Host `.ai` chứ không `.com` như tài liệu (đo thật: `.com` trả 401). |
   | `STEPFUN_TTS_SPEED` | — | Mặc định `0.9` — chỉ là **giá trị dự phòng** khi request không truyền `speed`; client hội thoại luôn truyền (bộ chọn 0.72/0.82/0.95). Tốc độ đi vào **request** để provider tổng hợp lại từ đầu, KHÔNG dùng `playbackRate` của browser (browser resample luồng đã nén). Đo trên key thật: 0.72 → 301ms/chữ, 0.82 → 261, 0.95 → 204, ASR khớp 3/3, bitrate vẫn 128kbps. Backend **kẹp** về `[0.5, 2.0]` chứ không trả 422: URL này nằm trong `new Audio(src)` nên một 422 chỉ hiện ra dưới dạng im lặng không lý do. |
   | `STEPFUN_ASR_URL` / `STEPFUN_ASR_MODEL` | — | Mặc định `.../step_plan/v1/audio/asr/sse` + `stepaudio-2.5-asr`. Chép âm cho Hội thoại AI — **đường chính** khi có `STEPFUN_API_KEYS`, nhanh hơn bắt một model đa năng vừa nghe vừa trả JSON. Gemini native vẫn là fallback vì Step Plan chỉ có 1 key (không xoay vòng được khi 429). Chỉ có bản HTTP+SSE: Step Plan không mở bản WebSocket song hướng. |
   | `GEMINI_API_KEYS` | — | Key relay vilao.ai — đường **dự phòng**, chỉ được chọn khi `STEPFUN_API_KEYS` và `LLM_API_KEYS` đều trống. Mỗi key là một "lượt": key cạn quota thì service tự chuyển sang key kế tiếp. Hết cả ba nguồn → mọi tính năng sinh nội dung tự tắt. |
   | `GEMINI_API_URL` | — | Mặc định `https://api.vilao.ai/v1/chat/completions`. Chỉ đổi khi relay đổi endpoint. |
   | `GEMINI_MODEL` | — | Mặc định `ram/gemini-3.5-flash-low`. |
   | `LLM_API_URL` / `LLM_API_KEYS` / `LLM_MODEL` | — | Bộ ba **ghi đè thủ công**, thắng cả StepFun lẫn `GEMINI_*`. Mọi provider đang dùng đều OpenAI-compatible `/chat/completions`, nên `LLM_API_URL` nhận cả URL gốc (`.../v1`) lẫn URL đầy đủ. **Đặt cả ba hoặc không đặt gì**: chỉ `LLM_API_KEYS` mới chuyển provider, nên đặt lẻ `LLM_API_URL` hay `LLM_MODEL` sẽ gửi key provider này tới endpoint provider kia — backend từ chối khởi động thay vì để lỗi rơi thành 401/404 lúc chạy. |
   | `LLM_JSON_MODE` | — | Để **trống** = tự quyết theo provider (StepFun hỗ trợ `response_format` → bật; vilao.ai không hỗ trợ → tắt, JSON ép bằng system prompt). Đặt `true`/`false` để ghi đè. |
   | `LLM_REASONING_EFFORT` | — | `low` / `medium` / `high`, hoặc để trống = tự quyết theo provider (StepFun → `low`; vilao → không gửi). Đây là đòn giảm latency có tác dụng thật, không phải cắt bớt prompt: đo trên `step-3.7-flash` cùng một prompt, mặc định 29s/3749 token, còn `json_object` + `low` chỉ 6s/457 token. Trần gateway ~121s. |
   | `GEMINI_NATIVE_API_KEYS` | ✅ (nếu dùng speech) | Key Google AI Studio thật (`generativelanguage.googleapis.com`), dùng cho pronunciation + voice chat (cần audio **đầu vào**, relay chỉ xử lý text) và TTS dự phòng. **Khác** `GEMINI_API_KEYS` ở trên. Đặt nhiều key: service xoay vòng khi một key 429, và đây là lý do Gemini giữ vai fallback cho ASR dù StepFun nhanh hơn. |
   | `GEMINI_NATIVE_MODEL` | — | Mặc định `gemini-3.5-flash-lite`. **Chỉ model này được thử** — danh sách model dự phòng đã bỏ vì nó chỉ làm ladder retry dài gấp 3 mà không cứu được ca lỗi nào (429 gắn với key, còn 404 model-not-found thì key nào cũng thấy cùng tập model). Đặt sai tên = 404 mọi request speech. |
   | `JWT_SECRET` | ✅ (production) | `settings` sẽ từ chối khởi động ở production nếu còn giá trị mặc định. |

3. Kiểm chứng cấu hình đã nạp — chạy trong `backend/`:
   ```bash
   python -c "from app.settings import settings as s; print(s.llm_provider, len(s.llm_keys_list), 'key(s)'); print(s.llm_api_url_effective, s.llm_model_effective)"
   ```
   Kết quả phải in số key > 0 (và `stepfun` nếu dùng cấu hình mặc định). Nếu in `0 key(s)`, `.env` chưa được đọc (sai thư mục làm việc) hoặc tên biến sai.

> ⚠️ **Không commit `.env`.** Mọi secret chỉ đọc từ environment; `.env.example` là tài liệu, không chứa giá trị thật.

### Giai đoạn 1 — Nền dữ liệu từ vựng

AI không sinh từ vựng từ hư không: nó cần bảng `words` làm neo. Mọi câu hỏi đều tham chiếu về một từ có thật trong DB.

```bash
cd backend

# 1. Nạp từ vựng HSK gốc + câu ví dụ mẫu (idempotent, chạy lại an toàn)
python -m app.scripts.seed

# 2. Bổ sung từ còn thiếu theo level (chọn script phù hợp)
python -m app.scripts.fill_hsk_vocab          # lấp các level còn khuyết
python -m app.scripts.fill_hsk4               # riêng HSK 4
python -m app.scripts.generate_hsk5_vocab     # sinh HSK 5 bằng LLM

# 3. Dịch nghĩa tiếng Việt cho từ chưa có
python -m app.scripts.translate_meanings

# 4. Chuẩn hoá pinyin (khoảng trắng, dấu thanh) — chạy SAU mọi bước nạp từ
python -m app.scripts.normalize_pinyin
python -m app.scripts.fix_pinyin_spacing
```

**Kiểm chứng trước khi sang giai đoạn 2:**
```bash
python -m app.scripts.audit_pinyin      # báo cáo sai lệch pinyin
python -m app.scripts.export_words      # xuất app/data/words_export.json để soát tay
```
Điều kiện đạt: mỗi level HSK 1–4 có đủ từ, `audit_pinyin` không còn lỗi severity cao. Pinyin sai ở giai đoạn này sẽ lan vào **mọi** câu hỏi và mọi điểm phát âm sau đó — sửa ở đây rẻ hơn sửa sau rất nhiều.

### Giai đoạn 2 — Làm giàu ngữ liệu (examples + confusables)

Đây là bước tốn thời gian LLM nhất. Nó sinh câu ví dụ và danh sách từ dễ nhầm (`confusable_words_json`) cho từng từ — dữ liệu mà [distractor_policy.py](backend/app/services/distractor_policy.py) sẽ dùng để chọn đáp án sai "vừa đủ khó".

```bash
# Cách A — chạy một lượt, dừng khi bạn đóng session
python -m app.scripts.enrich_examples

# Cách B (khuyến nghị cho khối lượng lớn) — pipeline tự-loop, bền với teardown
python -m app.scripts.enrich_pipeline
```

Vì sao nên dùng `enrich_pipeline`: nó được thiết kế chạy như **process HĐH độc lập**, tự lặp tới khi mọi từ HSK 1–4 đủ câu ví dụ, tối đa `MAX_PASSES = 4` vòng mỗi level, và thoát sạch khi hết tiến triển thay vì treo vô hạn. Nó cũng idempotent: cổng `words_needing_enrichment` bỏ qua từ đã đủ câu, nên chạy lại từ bất kỳ đâu cũng không tạo bản trùng.

**Theo dõi từ ngoài** (không cần giữ terminal):
```bash
tail -f backend/data/enrich_pipeline.log     # log tiến trình
ls backend/data/enrich_pipeline.done         # marker xuất hiện khi xong
```

**Việc bạn phải làm:** một số từ sẽ **luôn** fail validation (LLM trả câu vượt trần độ dài). Đó là hành vi mong đợi, không phải bug — pipeline bỏ qua chúng. Sau khi chạy xong, đọc log để lấy danh sách từ sót và tự viết câu ví dụ cho chúng nếu chúng là từ tần suất cao.

### Giai đoạn 3 — Ngân hàng câu hỏi

Có hai đường sinh câu hỏi, dùng cho hai mục đích khác nhau:

| Cách | Lệnh | Khi nào dùng |
| :--- | :--- | :--- |
| **Pre-generate** | `python -c "from app.db import SessionLocal; from app.scripts.pregenerate_questions import pregenerate_questions; db=SessionLocal(); print(pregenerate_questions(db))"` | Lấp đủ sàn: đảm bảo **mọi** cặp (level 1–6 × 6 dạng bài) có tối thiểu `TARGET_PER_TYPE = 20` câu. Chạy lần đầu và sau khi thêm từ mới. |
| **Upgrade bằng AI** | `python -m app.scripts.upgrade_quiz_bank_ai --levels 1 2 3 4 5 6 --count 20` | Nâng chất lượng bank đã có. Nhận `--levels`, `--types`, `--count` (1–20 câu mỗi level/type). |

Sáu dạng bài được sinh: `vocab`, `listening`, `cloze`, `translation`, `drag_drop`, `reading`.

**Hai cơ chế then chốt cần hiểu khi vận hành:**

- **Chống trùng lặp.** Các provider đang dùng (StepFun `step-3.7-flash`, và trước đó relay vilao.ai) trả output gần **tất định** — cùng prompt thì gần như cùng kết quả. [llm_generator_service.py](backend/app/services/llm_generator_service.py) xử lý bằng cách chèn một `nonce` ngẫu nhiên vào prompt và truyền `avoid_prompts` (12 prompt gần nhất đã có trong bank cho cùng cặp level+type). Nếu bạn thấy câu hỏi lặp lại, kiểm tra hai thứ này trước khi nghi model.
- **Cổng định dạng đoạn văn.** Prompt `cloze` phải chứa **đúng một** chuỗi `____`, vì renderer frontend tách prompt bằng `split(/_{2,}/)`. Các chỗ trống khác trong cùng đoạn phải ghi `（2）`,`（3）`… Ngoài ra đoạn phải có tối thiểu 16 ký tự Hán và 2 dấu kết câu (`。！？`) để bị coi là *đoạn* chứ không phải *câu rời*. Câu không đạt bị loại tự động.

**Hậu xử lý bắt buộc** — chạy sau mỗi lần sinh số lượng lớn:
```bash
python -m app.scripts.rebalance_answer_positions   # tránh đáp án dồn về một vị trí
python -m app.scripts.backfill_drag_prompts        # lấp prompt thiếu cho dạng sắp xếp câu
```
Bước rebalance không phải làm đẹp: LLM có thiên lệch vị trí đáp án, để nguyên thì người học đoán được đáp án bằng vị trí mà không cần biết tiếng Trung.

### Giai đoạn 4 — Ngân hàng đoạn văn chuẩn đề thi

Hai dạng 选词填空 (guided cloze) và 阅读理解 (reading) có ngân hàng viết tay riêng, tách khỏi câu sinh bằng LLM.

**Nguồn sự thật duy nhất:** [backend/app/data/exam_passages.json](backend/app/data/exam_passages.json). Bản sao phía frontend (`src/data/exam-passages.js`) được **sinh tự động** — không sửa tay.

Quy tắc viết một đoạn mới:

| Ràng buộc | Chi tiết |
| :--- | :--- |
| Ký hiệu chỗ trống | `{{n}}` trong `passage`, và `blanks[].index` phải khớp đúng `n`. |
| Word bank | Đúng **4** phần tử, dùng chung cho **cả đoạn**; mọi `blanks[].answer` phải nằm trong đó. |
| Trần độ dài | Theo `_passage_cjk_cap`: HSK 1→45, 2→65, 3→110, 4→130, 5→150, 6→180 ký tự Hán. Trần này **rộng hơn** trần của câu ví dụ đơn lẻ vì đoạn dài 3–6 câu. |
| Nhãn kỹ năng | `cloze`: `pos`, `collocation`, `conjunction`, `logic`. `reading`: `scanning`, `skimming`, `inference`, `reference`. |
| Reading | Mỗi đoạn nên có một câu hỏi chi tiết và một câu hỏi ý chính; 4 lựa chọn **đều bằng tiếng Trung**, độ dài tương đương. |

Sau khi sửa JSON, chạy đủ ba cổng:
```bash
node scripts/sync-exam-passages.mjs        # đồng bộ sang frontend
node scripts/validate-exam-passages.mjs    # cổng build phía frontend
cd backend && python -m pytest tests/test_exam_passages.py tests/test_exam_format_gate.py -q
```

> ⚠️ Luật kiểm tra được **nhân đôi** ở `scripts/validate-exam-passages.mjs` và `backend/tests/test_exam_passages.py`. Sửa luật một bên thì phải sửa cả bên kia, nếu không CI và build sẽ bất đồng.

Thứ tự lựa chọn được trộn bằng **seed tất định** (dựa trên id đoạn + số thứ tự), nên prompt/options của một câu luôn giống nhau giữa các lần sinh. Đây là điều kiện để không tạo row trùng và không lệch `correct_index` giữa lúc phục vụ và lúc chấm — đừng thay bằng `random.shuffle()` không seed.

Ngân hàng hội thoại làm tương tự với [conversation_scenarios.json](backend/app/data/conversation_scenarios.json) + `node scripts/validate-conversation-bank.mjs`.

### Giai đoạn 5 — Tầng Speech AI

Cần `GEMINI_NATIVE_API_KEYS` (key AI Studio thật, không phải key relay).

Kiến trúc chấm phát âm gồm hai lớp độc lập rồi **veto chéo**:

1. **Lớp định danh** — [speech_ai_service.py](backend/app/services/speech_ai_service.py) gửi audio cho Gemini, nhận về Hán tự + pinyin thực tế; [pinyin_scorer.py](backend/app/services/pinyin_scorer.py) so khớp để tìm âm tiết thừa/thiếu/sai thanh.
2. **Lớp âm học** — [tone_dsp_service.py](backend/app/services/tone_dsp_service.py) trích F0 contour, dùng DTW căn khớp với khuôn thanh điệu Chao chuẩn, tính thêm fluency (tốc độ, số lượt dừng) và prosody (dải cao độ, xu hướng hạ giọng cuối câu).
3. **Veto** — điểm cuối lấy giá trị **nhỏ hơn** giữa độ chính xác DSP và tỷ lệ thanh điệu đúng từ Gemini. Mục đích: một lớp bị nhiễu thì không tự nâng điểm được.

Kiểm chứng:
```bash
cd backend && python -m pytest tests/test_pinyin_scorer.py tests/test_speech_demo.py -q
```

Nếu Praat/Parselmouth chưa cài được trên máy bạn, lớp âm học sẽ không chạy; hãy xác nhận điều đó bằng test thay vì đoán qua điểm số trên UI.

#### Chất lượng đầu âm — ba lỗi đã đo và đã sửa

Ba khiếm khuyết dưới đây đều **đo được** bằng parselmouth trên audio thật, và cả ba đều biểu hiện ra ngoài như "âm thanh không ổn định" nên rất dễ bị gom thành một.

1. **Khoảng lặng đầu trải rộng.** Đo 400 clip lấy mẫu của kho tĩnh: lặng đầu từ **120ms tới 760ms** (trung vị 260ms). Cùng một cú bấm "Nghe" mà lúc kêu ngay lúc trễ nửa giây thì người dùng đọc thành "máy lag". Provider không có tham số nào điều khiển việc này (đã dò). Bản sửa: [mp3_trim.py](backend/app/services/mp3_trim.py) cắt lặng đầu/cuối **theo biên frame MPEG**, không giải mã và mã hoá lại (môi trường không có encoder MP3 nào — không ffmpeg, không lameenc). Sau khi sửa, `/tts` đo lại: **60ms cho cả 4 câu, chênh 0ms**.
   - Vì sao luôn chừa đệm 80ms đầu: bit reservoir cho phép một frame tham chiếu tới ~511 byte của các frame **trước** nó, nên cắt sát mép sinh một tiếng tách. Đệm đẩy chỗ lỗi đó vào phần im lặng.
   - Kho tĩnh 15.404 clip đã dựng **trước** bản sửa, và frontend ưu tiên clip local — chạy `python -m app.scripts.trim_audio_store --dry-run` rồi bỏ `--dry-run` để xử lý (thử 300 file: cắt 299, giảm 1.3MB).

2. **Bộ chọn tốc độ vô tác dụng ở hai mức chậm.** `SPEECH_RATES` có 0.72/0.82/0.95 nhưng `speech.jsx` kẹp `playbackRate` ở sàn **0.85** — nên 0.72 và 0.82 cho ra audio **y hệt nhau**, và mặc định 0.82 thật ra phát ở 0.85 (browser resample 3.7%). Nhân với `speed=0.9` phía server thì nhịp thật là 0.765x, không khớp nhãn nào. Bản sửa: tốc độ đi vào **query `speed`** để provider tổng hợp lại từ đầu, client phát ở `playbackRate` 1.0. Đo lại qua HTTP thật: **0.72 → 301ms/chữ, 0.82 → 261, 0.95 → 204**, đơn điệu, ASR khớp 3/3.

3. **Đứt tiếng giữa câu ở `/tts/stream`.** StepFun giao `mp3_stream` theo **chùm**: ~5 khối liền nhau (1.25s audio), **nghỉ 1.3–1.4s**, rồi phần còn lại. Tổng thể sinh nhanh hơn phát (0.46x thời gian thực) nhưng cái khe ở giữa dài hơn lượng audio vừa gửi, nên `<audio>` phát hết chỗ có rồi **đứng giữa chữ**. Mô phỏng kim phát trên 10 câu: 8/10 câu đứng, tệ nhất 686ms.
   - Sàn `playbackRate` 0.85 cũ **vô tình che lỗi này** (phát chậm 15% = thêm 15% đệm): @0.85x đo 0/10 câu đứng, @0.90x 1/10, @1.0x 3/10. Nên bản sửa (2) ở trên đã bỏ lớp đệm tình cờ đó và phải thay bằng lớp cố ý.
   - Bản sửa: `STREAM_HOLD_SEC` trong [tts.py](backend/app/routers/tts.py) gom khối trong 0.9s **kể từ khối đầu tiên** rồi mới xả. Mốc phải là khối đầu tiên chứ không phải lúc vào generator — bắt tay socket tốn tới 1.3s, dài hơn cả cửa sổ gom, nên tính từ đầu generator thì nhánh socket lạnh không gom được gì (đã đo: vẫn đứt 2/3 câu). Sau khi sửa: **0/3 câu đứt**, tiếng đầu ~2.1–2.5s (vẫn nhanh hơn `/tts` ~3.0s).
   - 0.9s là mức nhỏ nhất cho 0/10 câu đứng khi cộng thêm 200ms jitter mạng; 0.7s đủ khi mạng lý tưởng nhưng biên còn 0.

Hai thứ **không** sửa được bằng tham số, đã dò và ghi lại để không ai thử lại: `mp3_stream` khoá ở **64kbps** (`bitrate`/`audio_bitrate` bị bỏ qua, `response_format=mp3` cho 32kbps kèm nhịp vỡ hẳn, `sample_rate` 16k/24k đều ra 64kbps, 48k bị từ chối), và `mode=stream` trả 400 `invalid mode`. Đuôi lặng 800ms của đường WS thì bỏ dấu `。` cuối câu hạ được về ~200ms, nhưng **đã từ chối** bản sửa đó: ASR round-trip cho thấy nó làm model đọc chệch chữ (`太好了` → `太好啦`), tức đổi luôn nội dung người học nghe.

```bash
cd backend && python -m pytest tests/test_mp3_trim.py tests/test_tts_stream.py tests/test_tts_cache.py -q
```

### Giai đoạn 6 — Cổng chất lượng nội dung

Chạy **trước mỗi lần commit dữ liệu**, không phải sau khi deploy:

```bash
# Cổng tất định (không cần DB, không gọi LLM) — chặn lỗi cấu trúc
node scripts/validate-exam-passages.mjs
node scripts/validate-conversation-bank.mjs
node scripts/validate-grammar.mjs

# Cổng có DB
cd backend
python -m pytest tests -q                     # toàn bộ test suite
python -m app.scripts.audit_grammar           # kiểm ngữ pháp: rule-based + LLM
python app/scripts/cron_qa_runner.py          # tổng hợp QA, exit != 0 nếu có lỗi nặng
```

`cron_qa_runner.py` chạy 4 nhóm kiểm tra: pinyin, ngữ pháp/nội dung, tính toàn vẹn & đa dạng câu hỏi, và health metrics của DB. Nó ghi kết quả ra `backend/app/data/qa_report.json` và **thoát khác 0 khi có vấn đề critical/high** — dùng được làm gate trong bất kỳ pipeline nào.

Trên CI, [content-qa.yml](.github/workflows/content-qa.yml) chạy tự động **mỗi 8 giờ** và trên mỗi push đụng vào `backend/app/data/**`, `question_generator.py`, `template_engine.py`, `backend/app/scripts/**`, `backend/tests/**` hoặc `scripts/validate-*.mjs`. Báo cáo được upload làm artifact (giữ 30 ngày) và thất bại sẽ bắn Slack nếu có `SLACK_WEBHOOK_URL`.

Lệnh `npm run build` cũng là một cổng: nó chạy `generate-hanzi-data` → `sync-exam-passages` → `validate-grammar` → `validate-conversation-bank` → `vite build`. Build đỏ vì dữ liệu là đúng thiết kế, đừng bỏ qua bằng cách gọi `vite build` trực tiếp.

### Giai đoạn 7 — Đưa lên production

```bash
# Đồng bộ DB cục bộ lên Turso
cd backend && python -m app.scripts.mirror_to_turso
```

Biến môi trường cần đặt trên Fly.io: `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `GEMINI_API_KEYS`, `GEMINI_NATIVE_API_KEYS`. Trên Vercel: `VITE_API_BASE`.

Danh sách kiểm tra cuối:

- [ ] `JWT_SECRET` **không** còn là giá trị mặc định (settings sẽ chặn khởi động, nhưng hãy kiểm trước).
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` đã đặt — bỏ trống thì mọi route `/api/admin/*` trả 503. Hash bằng bcrypt, **không** lưu mật khẩu thô:
  ```bash
  python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('mat-khau-cua-ban'))"
  ```
- [ ] `CORS_ORIGINS` trỏ đúng domain frontend production.
- [ ] `cron_qa_runner.py` exit 0 trên dữ liệu production.
- [ ] Đã xác nhận quiz vẫn chạy khi cố tình bỏ trống key LLM (đường degrade về bank tĩnh còn nguyên).

---

## 🔁 Lộ trình tự học của AI

"Tự học" ở đây không phải fine-tune model. Nó là **vòng phản hồi đóng**: hệ thống quan sát hành vi người học, phân loại lỗi, rồi thay đổi câu hỏi kế tiếp — và một phần của vòng đó cần **bạn** can thiệp định kỳ. Phần này nói rõ chỗ nào máy tự làm, chỗ nào bạn phải làm.

### Trục thụ đắc: thay HSK level bằng trạng thái per-word

Nền tảng của cả vòng học nằm ở [acquisition_service.py](backend/app/services/acquisition_service.py). Nó thay trục "HSK 1–6" bằng trạng thái thụ đắc của **từng từ**, tiến hóa theo mức người học thực sự **dùng được** từ, không theo lịch thi:

```
UNKNOWN → RECOGNIZED → UNDERSTOOD → USABLE → MASTERED
 (chưa)    (nhận ra)    (hiểu nghĩa) (tự dùng) (thuần thục)
```

Nguyên tắc "tập nói như trẻ con": nghe/nhận diện **trước** → `RECOGNIZED`; hiểu nghĩa + gợi nhớ chủ động → `UNDERSTOOD`; sản sinh có hướng dẫn → `USABLE`; sản sinh tự do + trí nhớ ổn định → `MASTERED`.

Trạng thái này quyết định độ khó của mọi thứ phía sau — kể cả đáp án sai.

### Thang truy hồi L1–L8

[retrieval_ladder_service.py](backend/app/services/retrieval_ladder_service.py) định nghĩa 8 bậc truy hồi tăng dần, theo nguyên tắc *retrieval over exposure* (truy hồi mạnh hơn đọc lại):

| Bậc | Nhiệm vụ | Loại |
| :--- | :--- | :--- |
| L1 | hanzi → nghĩa | nhận diện (dễ nhất) |
| L2 | audio → nghĩa | nghe |
| L3 | pinyin → hanzi | nhận diện ngược |
| L4 | nghĩa → hanzi/pinyin | gợi nhớ chủ động |
| L5 | cloze trong câu | ngữ cảnh |
| L6 | nghe hội thoại → ý chính | nghe + ngữ cảnh |
| L7 | gõ pinyin / nói câu | sản sinh |
| L8 | tạo câu ngắn | sản sinh tự do (khó nhất) |

### Vòng 1 — Mỗi câu trả lời (máy tự làm, tức thời)

1. **Ghi nhận** — `LearningEvent` được lưu kèm `error_tag` do `classify_error` gán (ví dụ `tone_error`, `hanzi_error`).
2. **Cập nhật SRS** — [srs_service.py](backend/app/services/srs_service.py) đổi lịch ôn của từ đó.
3. **Cập nhật EWMA hành vi** — [behavior_service.py](backend/app/services/behavior_service.py) và `src/behavior-engine.js` phía client.
4. **Chọn độ khó câu kế** — [difficulty_service.py](backend/app/services/difficulty_service.py) không dùng ngưỡng cứng mà nhắm **luật 85%** (Wilson et al., 2019, *Nature Communications*): tốc độ học tối ưu khi tỉ lệ đúng quanh ~85%. Quá dễ (≈100%) là lãng phí lượt ôn; quá khó thì mất tín hiệu.
5. **Chọn đáp án sai** — [distractor_policy.py](backend/app/services/distractor_policy.py) trượt cửa sổ theo nấc thụ đắc: mới `RECOGNIZED` thì distractor **xa** đáp án (dễ loại trừ, xây tự tin); `MASTERED` thì distractor **gần nhất** (đồng âm/đồng tự) để kiểm tra phân biệt thật. Luôn lấy distractor khó nhất cho người mới sẽ khiến họ sai vì *chưa phân biệt nổi* thay vì vì *chưa thuộc* — sai vì lý do sai thì tín hiệu học vô nghĩa.

### Vòng 2 — Mỗi phiên học (máy tự làm, theo ngày)

[priority_service.py](backend/app/services/priority_service.py) xếp hàng đợi từ cần học bằng công thức trọng số, thay cho cách sort thô theo `(accuracy, level)` trước đây:

```
priority = due_urgency          * 0.35
         + forgetting_risk      * 0.20
         + error_need           * 0.20
         + goal_relevance       * 0.10
         + novelty_need         * 0.05
         + habit_fit            * 0.05
         - recent_repeat_penalty * 0.05
```

Song song, [repair_service.py](backend/app/services/repair_service.py) gom các `error_tag` sai gần đây và áp **repair mapping**: mỗi loại lỗi có một cách sửa và một dạng bài tương ứng. Đây là nơi tiêu thụ error taxonomy — trước khi có service này, các tag được gán nhưng không ai đọc, mapping nằm chết.

Kế hoạch ngày cuối cùng do `src/learning-session-planner.js` dựng, và [study_analysis_service.py](backend/app/services/study_analysis_service.py) sinh phần phân tích + đề xuất hiển thị trên dashboard.

### Vòng 3 — Mỗi 8 giờ (CI tự chạy, bạn đọc kết quả)

`content-qa.yml` chạy toàn bộ cổng chất lượng và ghi `qa_report.json`.

**Việc bạn phải làm:**
- [ ] Mở artifact `qa-report` khi CI đỏ, hoặc đọc thông báo Slack.
- [ ] Phân biệt hai loại lỗi: **lỗi cấu trúc** (JSON sai schema → sửa dữ liệu ngay) và **lỗi nội dung** (LLM sinh câu không tự nhiên → sửa prompt spec trong `llm_generator_service.py`).
- [ ] Nếu cùng một loại lỗi nội dung lặp lại nhiều chu kỳ, đó là tín hiệu sửa **spec**, không phải sửa từng câu.

### Vòng 4 — Hằng tuần / khi bank cạn (bạn chủ động)

Đây là phần vòng học **không** tự đóng được, cần bạn:

| Việc | Lệnh / hành động | Vì sao cần người |
| :--- | :--- | :--- |
| Bổ sung câu hỏi cho level bị người học "vét sạch" | `python -m app.scripts.upgrade_quiz_bank_ai --levels N --count 20` | Hệ thống biết bank cạn nhưng không tự tiêu tiền API. |
| Mở rộng ngân hàng đoạn văn | Viết tay vào `exam_passages.json` rồi chạy 3 cổng ở Giai đoạn 4 | Đoạn chuẩn đề thi cần phán đoán về độ tự nhiên mà validator không kiểm được. |
| Rà soát từ sót sau enrichment | Đọc `backend/data/enrich_pipeline.log` | Từ fail validation nhiều lần cần câu ví dụ viết tay. |
| Cân lại vị trí đáp án | `python -m app.scripts.rebalance_answer_positions` | Thiên lệch tích tụ dần theo mỗi đợt sinh mới. |
| Soát prompt spec | Sửa `_CLOZE_SPEC` / `_READING_SPEC` trong `llm_generator_service.py` | Chất lượng đầu ra bám vào spec; đây là đòn điều khiển mạnh nhất bạn có. |

### Bản đồ tín hiệu → engine

Dùng bảng này khi cần biết "sửa hành vi học ở đâu":

| Muốn thay đổi | Sửa ở |
| :--- | :--- |
| Chọn từ nào để học hôm nay | [priority_service.py](backend/app/services/priority_service.py) |
| Câu dễ/khó ra sao | [difficulty_service.py](backend/app/services/difficulty_service.py), [item_difficulty.py](backend/app/services/item_difficulty.py) |
| Đáp án sai gần/xa đáp án đúng | [distractor_policy.py](backend/app/services/distractor_policy.py), [viet_distractor.py](backend/app/services/viet_distractor.py) |
| Khi nào lên nấc thụ đắc | [acquisition_service.py](backend/app/services/acquisition_service.py) |
| Dạng bài nào cho bậc truy hồi nào | [retrieval_ladder_service.py](backend/app/services/retrieval_ladder_service.py) |
| Lỗi nào sửa bằng bài gì | [repair_service.py](backend/app/services/repair_service.py) |
| Lịch ôn tập | [srs_service.py](backend/app/services/srs_service.py), `src/vocab-srs.js` |
| Chất lượng câu AI sinh | [llm_generator_service.py](backend/app/services/llm_generator_service.py), [question_generator.py](backend/app/services/question_generator.py) |
| Ngữ liệu ví dụ & từ dễ nhầm | [enrichment_service.py](backend/app/services/enrichment_service.py) |

> 📌 **Về nguồn nội dung:** đừng lấy ngân hàng đề của các site thương mại (MandarinBean, HSK Online…) làm hạt giống — nội dung đó có bản quyền, và đưa qua một bước AI không làm sạch được nguồn gốc. Vòng bootstrap đúng là dùng chính `exam_passages.json` của bạn làm few-shot: pool càng lớn thì few-shot càng đa dạng, đoạn sinh ra càng ít giống nhau. Nếu cần văn phong người thật, dùng nguồn có giấy phép mở (Tatoeba CC-BY 2.0, Wikinews tiếng Trung CC-BY-SA) và ghi credit đúng license.

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
