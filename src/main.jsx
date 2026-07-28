import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './overhaul.css'
// Nạp SAU overhaul.css: dashboard dùng namespace `dash-` riêng nên không cần
// đấu !important với các rule cũ, chỉ cần nằm cuối cascade.
import './dashboard.css'
import './shell.css'
// Nạp cuối: quiz.css chỉ ăn trong phạm vi .qz nên không đụng tới các trang khác.
import './quiz.css'
import App from './App.jsx'
import { AuthProvider } from './auth-context.jsx'
import { ResetPasswordPage } from './auth-ui.jsx'
import LandingGate from './landing-gate.jsx'
import AdminApp from './admin-ui.jsx'
import { warmUpBackend } from './api-core.js'

// Ping /health sớm để đánh thức backend Render free-tier trước khi user bấm AI.
warmUpBackend()

// Sau khi deploy mới, các chunk lazy đổi hash tên file; tab cũ đang mở vẫn giữ
// index.html cũ trỏ tới chunk đã bị xóa -> "Failed to fetch dynamically imported
// module". Reload MỘT lần/session để lấy index.html + hash chunk mới. Không clear
// flag khi reload xong: nếu chunk 404 thật (build hỏng, không phải deploy) thì
// KHÔNG reload lặp — user thấy ErrorBoundary như thường.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('chunkReloaded') === '1') return;
  sessionStorage.setItem('chunkReloaded', '1');
  window.location.reload();
});

// Link đặt lại mật khẩu (gửi qua email) trỏ tới /reset-password?token=...
// SPA rewrite mọi path về index.html, nên nhận diện path ở đây và render trang
// reset ĐỘC LẬP — ngoài AuthGate — vì người dùng lúc này chưa đăng nhập.
const isResetRoute = window.location.pathname === '/reset-password';
// Trang /admin độc lập hoàn toàn: có phiên đăng nhập admin riêng (token tách
// khỏi user), nên render NGOÀI AuthProvider/AuthGate — không dùng phiên user.
const isAdminRoute = window.location.pathname === '/admin';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminRoute ? (
      <AdminApp />
    ) : (
      <AuthProvider>
        {isResetRoute ? (
          <ResetPasswordPage />
        ) : (
          <LandingGate>
            <App />
          </LandingGate>
        )}
      </AuthProvider>
    )}
  </StrictMode>,
)
