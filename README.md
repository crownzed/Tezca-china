# HànZì Dashboard - Professional UI Design

## 📋 Tổng quan

Dashboard hiện đại cho ứng dụng học Tiếng Trung **HànZì**, thiết kế theo phong cách Clean & Minimalist chuyên nghiệp.

## 🎨 Đặc điểm thiết kế

### Phong cách
- **Clean & Minimalist**: Gọn gàng, nhiều khoảng trắng
- **Professional**: Phong cách SaaS hiện đại (Duolingo + Coursera)
- **Trustworthy**: Tạo cảm giác đáng tin cậy, tập trung

### Bảng màu
- **Primary**: Deep Emerald Green (`#059669`)
- **Background**: Off-white (`#F9FAFB`)
- **Text**: Dark Gray (`#1F2937`) / Medium Gray (`#4B5563`)
- **Font**: Inter (Sans-serif hiện đại)

### Cấu trúc
```
┌─────────────┬──────────────────────────────────┐
│   Sidebar   │         Top Header               │
│             ├──────────────────────────────────┤
│   Logo      │                                  │
│             │        Card 1: Hero              │
│   Menu      │     (Bắt đầu học tự nhiên)       │
│   - Trang   │                                  │
│   - Luyện   ├──────────────────────────────────┤
│   - Từ vựng │        Card 2: Duration          │
│   - ...     │      (Học hôm nay)               │
│             ├──────────────────────────────────┤
│             │        Card 3: Habits            │
│             │     (Xây thói quen)              │
└─────────────┴──────────────────────────────────┘
```

## 🚀 Cài đặt & Chạy

### Prerequisites
- Node.js 18+ (workspace đã có Node v22)
- npm hoặc yarn

### Cài đặt
```bash
cd hanzi-dashboard
npm install
```

### Chạy Development
```bash
npm run dev
```
→ Mở trình duyệt tại `http://localhost:3000`

### Build Production
```bash
npm run build
npm run preview
```

## 📦 Cấu trúc thư mục

```
hanzi-dashboard/
├── index.html                 # Entry HTML
├── package.json               # Dependencies
├── vite.config.js            # Vite config
└── src/
    ├── main.jsx              # React entry point
    ├── App.jsx               # App wrapper
    ├── App.css               # Global styles
    └── components/
        ├── HanZiDashboard.jsx    # Main dashboard component
        └── HanZiDashboard.css    # Dashboard styles
```

## ✨ Tính năng UI

### 1. Sidebar Navigation
- Logo nổi bật
- 8 menu items với icons
- Active state highlight (viền trái xanh + background nhạt)
- Hover effects mượt mà

### 2. Top Header
- Toggle "Chế độ local"
- Nút Đăng nhập (Outline)
- Nút Đăng ký (Primary)
- Toggle Dark Mode (Moon/Sun icon)

### 3. Main Content Cards

#### Card 1: Hero - "Bắt đầu học tự nhiên"
- Background gradient xanh nhạt
- 4 category tags (Grid layout)
- CTA button to lớn, nổi bật

#### Card 2: "Học hôm nay"
- 3 duration cards (5 phút / 20 phút / 45 phút)
- Interactive hover (lift + border change)
- Icons sinh động

#### Card 3: "Xây thói quen"
- Background gradient vàng nhạt
- 3 habit stats (Cần ôn / Sửa lỗi / Từ mới)
- Icons + số liệu với màu riêng biệt

## 📱 Responsive Design

### Desktop (>1024px)
- Sidebar 260px
- Full layout 3-column grid

### Tablet (768px - 1024px)
- Sidebar 220px
- 2-column grids

### Mobile (<768px)
- Sidebar collapse → icon-only (70px)
- Menu labels ẩn
- 1-column layout
- Header wrap

### Small Mobile (<480px)
- Full single-column
- Reduced padding
- Smaller fonts

## 🎯 Hiệu ứng tương tác

### Hover Effects
- **Cards**: Shadow tăng (`shadow-sm` → `shadow-md`)
- **Buttons**: Lift -1px hoặc -2px + shadow
- **Category tags**: Lift -2px + border primary
- **Duration cards**: Lift -3px + background change

### Transitions
- Tất cả dùng `all 0.2s ease-in-out`
- Mượt mà, không giật lag

## 🌙 Dark Mode Support

Sử dụng CSS variables:
```css
.dark-mode {
  --color-bg: #111827;
  --color-white: #1F2937;
  --color-text-primary: #F9FAFB;
  ...
}
```

Toggle bằng state React (`isDarkMode`)

## 🔧 Tùy chỉnh

### Thay đổi màu chủ đạo
Sửa trong `HanZiDashboard.css`:
```css
:root {
  --color-primary: #059669;  /* Thay màu mới ở đây */
}
```

### Thêm menu items
Sửa trong `HanZiDashboard.jsx`:
```jsx
const menuItems = [
  { id: 'new', label: 'Menu mới', icon: <NewIcon /> },
  ...
];
```

### Thêm icons thật
Cài đặt `react-icons`:
```bash
npm install react-icons
```

Thay thế emoji icons:
```jsx
import { AiOutlineHome } from 'react-icons/ai';
const HomeIcon = () => <AiOutlineHome />;
```

## 📸 Screenshots Preview

(Chạy `npm run dev` để xem live)

### Light Mode
- Hero card: Gradient xanh mint
- Duration cards: Hover hiệu ứng lift
- Habits card: Gradient vàng nhạt

### Dark Mode
- Nền đen tối (#111827)
- Cards nền xám đậm (#1F2937)
- Text trắng nhạt (#F9FAFB)

## 🎨 Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#059669` | Buttons, active states |
| `--color-bg` | `#F9FAFB` | Page background |
| `--shadow-md` | `0 4px 6px...` | Card hover |
| `--radius-md` | `8px` | Standard border radius |

## 🚀 Next Steps

1. **Integrasi Backend**: Connect với API thật
2. **Icons Library**: Thay emoji bằng react-icons
3. **Animation**: Thêm Framer Motion cho transitions
4. **Testing**: Viết unit tests với Vitest
5. **Accessibility**: Kiểm tra WCAG compliance

## 📝 Notes

- Component đã sẵn sàng production
- CSS variables giúp dễ customize
- Responsive đầy đủ cho mọi device
- Hover effects mượt mà, chuyên nghiệp
- Code clean, comment rõ ràng

---

**Designed by:** Poseidon 🔱  
**Date:** 2026-06-17  
**Version:** 1.0.0
