---
tags: [moc, home]
---

# 🏮 Tezca — Bản đồ Hệ thống

Nền tảng luyện thi HSK thích ứng: DSP chấm phát âm + Gemini AI. Vault này theo dõi **cả tính năng lẫn kiến trúc kỹ thuật**.

## Điều hướng nhanh
- [[01 - Kiến trúc tổng thể]] — sơ đồ tầng, luồng dữ liệu, offline fallback
- [[10 - Tính năng|Tính năng (Features)]] — góc nhìn người dùng
- [[20 - Frontend|Frontend (src/)]] — module React
- [[40 - Backend|Backend (FastAPI)]] — routers + services
- [[90 - Code Review & TODO]] — nợ kỹ thuật đang mở

## 5 tính năng cốt lõi
1. [[Feature - Chẩn đoán phát âm|🎙️ Chẩn đoán phát âm (DSP + Gemini)]]
2. [[Feature - Voice Chat|💬 Trò chuyện giọng nói]]
3. [[Feature - Quiz thích ứng|📝 Quiz HSK thích ứng]]
4. [[Feature - Offline & Hiệu năng|🔌 Offline & tối ưu hiệu năng]]
5. [[Feature - Phân tích học tập|📊 Phân tích & đề xuất học tập]]

## Ngăn xếp công nghệ
| Tầng | Công nghệ |
| :--- | :--- |
| Frontend | React 19, Vite 8, Hanzi Writer, Lucide |
| Backend | FastAPI, Python 3.10+ |
| DSP | NumPy, Praat / Parselmouth |
| AI | Gemini Native API (giọng nói), relay vilao.ai (sinh câu hỏi) |
| DB | SQLite / SQLAlchemy, Turso (libSQL) cho prod |

> [!note] Cách dùng vault
> Mở thư mục `Tezca-Vault/` như một vault Obsidian. Bật **Graph view** để thấy đồ thị phụ thuộc giữa các module. Mỗi note kỹ thuật liệt kê dependencies dưới dạng `[[wiki-link]]`.
