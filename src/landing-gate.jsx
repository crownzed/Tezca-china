import { useState } from 'react';
import { useAuth } from './auth-core';
import { AuthGate } from './auth-ui.jsx';
import LandingPage from './landing-page.jsx';

// Chèn landing TRƯỚC AuthGate: người chưa đăng nhập thấy trang giới thiệu + demo
// phát âm; bấm đăng nhập/đăng ký mới chuyển sang màn AuthGate như cũ.
// Người đã có phiên (loading hoặc isAuthenticated) đi thẳng vào AuthGate → App,
// không thấy landing, nên luồng đăng nhập hiện tại không đổi.
export default function LandingGate({ children }) {
  const [entered, setEntered] = useState(false);
  const { isAuthenticated, loading } = useAuth();

  if (isAuthenticated || loading || entered) {
    return <AuthGate>{children}</AuthGate>;
  }
  return <LandingPage onEnter={() => setEntered(true)} />;
}
