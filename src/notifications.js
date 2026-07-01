// Nhắc học bằng Web Notification — chỉ chạy khi tab đang mở (SPA tĩnh, không có
// service worker/push server). Lên lịch một lần mỗi ngày vào giờ người dùng đặt:
// nếu giờ hôm nay đã qua thì hẹn cho ngày mai. Tự đặt lại sau mỗi lần bắn.

let timerId = null;

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'tezca-study-reminder' });
    return true;
  } catch {
    return false;
  }
}

// time: "HH:MM". Trả về số ms tới lần xuất hiện kế tiếp của giờ đó.
function msUntilNext(time) {
  const [h, m] = String(time || '20:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(Number.isFinite(h) ? h : 20, Number.isFinite(m) ? m : 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Hẹn nhắc hằng ngày vào giờ đã đặt. Gọi lại để áp lịch mới; trả hàm hủy.
export function scheduleDailyReminder({ time, title, body }) {
  cancelReminder();
  if (!notificationsSupported() || Notification.permission !== 'granted') return cancelReminder;
  const tick = () => {
    showNotification(title, body);
    timerId = window.setTimeout(tick, 24 * 60 * 60 * 1000);
  };
  timerId = window.setTimeout(tick, msUntilNext(time));
  return cancelReminder;
}

export function cancelReminder() {
  if (timerId) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}
