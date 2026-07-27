// ============================================================
// THEME — nguồn sự thật duy nhất cho light/dark.
// Trước đây logic này nằm trong App.jsx; landing page render NGOÀI App
// (chưa đăng nhập) nhưng vẫn cần đọc/ghi cùng một khóa localStorage, nên tách
// ra đây để hai nơi không trôi lệch phiên bản palette.
// ============================================================

// Đổi hằng này khi palette thay đổi lớn: theme đã lưu của người dùng cũ bị coi
// là hết hạn và reset về 'light' để họ thấy palette mới.
export const THEME_PALETTE_VERSION = 'modern-zen-v1';

const THEME_COLOR = { light: '#FBF9F6', dark: '#0a1626' };

export function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  if (window.localStorage.getItem('themePaletteVersion') !== THEME_PALETTE_VERSION) return 'light';
  const savedTheme = window.localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return 'light';
}

// Áp theme lên <html> + cập nhật theme-color (thanh trạng thái mobile) và lưu lại.
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme] || THEME_COLOR.light);
  window.localStorage.setItem('theme', theme);
  window.localStorage.setItem('themePaletteVersion', THEME_PALETTE_VERSION);
}
