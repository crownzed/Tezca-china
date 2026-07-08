import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './overhaul.css'
import App from './App.jsx'
import { AuthProvider } from './auth-context.jsx'
import { AuthGate } from './auth-ui.jsx'
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
