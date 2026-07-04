// Namespace dữ liệu học cục bộ (localStorage) theo từng người dùng, để hai tài
// khoản đăng nhập trên cùng một máy không dùng chung tiến độ. Dữ liệu trên server
// đã tách sẵn theo user_id; đây là lớp fallback offline tương ứng.
let currentUserId = null;

export function setCurrentUserId(id) {
  currentUserId = id || null;
}

export function getCurrentUserId() {
  return currentUserId;
}

// Gắn hậu tố user vào key. Khi chưa đăng nhập (currentUserId = null) giữ nguyên
// key gốc để không phá dữ liệu khách cũ.
export function scopedKey(key) {
  return currentUserId ? `${key}::${currentUserId}` : key;
}
