import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Circle, Clock, Loader2, Lock, LockOpen, LogIn, LogOut, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2, Users, Wifi } from 'lucide-react';
import {
  adminDeleteUser,
  adminGetConfig,
  adminListUsers,
  adminLogin,
  adminSetUserActive,
  adminUpdateConfig,
} from './api-core';

const ADMIN_TOKEN_KEY = 'hanziAdminToken';

// Coi là "đang trực tuyến" nếu heartbeat (last_seen_at) trong vòng 3 phút. Backend
// throttle ghi last_seen_at mỗi 60s, nên mốc có thể trễ tới 1 phút dù user vẫn
// đang thao tác — 3 phút cho biên an toàn, tránh nhấp nháy online/offline.
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

// Thời gian tương đối gọn cho cột hoạt động. Backend trả ISO không kèm offset
// (datetime.utcnow) nên ép về UTC bằng cách thêm 'Z' khi chuỗi chưa có timezone.
function formatRelative(iso) {
  if (!iso) return null;
  const hasTz = /[Z+]|-\d\d:\d\d$/.test(iso);
  const then = new Date(hasTz ? iso : `${iso}Z`).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return null;
  if (diff < 60 * 1000) return 'vừa xong';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(then).toLocaleDateString('vi-VN');
}

function AdminLogin({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await adminLogin({ email: email.trim(), password });
      onLoggedIn(data.token);
    } catch (err) {
      setError(err.message || 'Không đăng nhập được');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-gate">
      <div className="auth-gate__card auth-gate__card--glass admin-login-card">
        <div className="auth-gate__brand">
          <ShieldCheck size={40} />
          <h1>Quản trị hệ thống</h1>
          <p>Khu vực dành riêng cho quản trị viên.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email quản trị
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label>
            Mật khẩu
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          {error && <p className="auth-form__error" role="alert"><AlertCircle size={15} /> {error}</p>}
          <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}

// Chip trạng thái KHOÁ tài khoản (do admin điều khiển), KHÔNG phải "đang dùng":
// xanh = bình thường (login được), đỏ = đã khoá. Kèm icon + chữ để nhận biết
// được cả khi mù màu (color-not-only).
function StatusBadge({ active }) {
  return (
    <span className={`admin-badge ${active ? 'admin-badge--active' : 'admin-badge--locked'}`}>
      {active ? <CheckCircle2 size={13} /> : <Lock size={13} />}
      {active ? 'Bình thường' : 'Đã khoá'}
    </span>
  );
}

// Chip TRỰC TUYẾN thời gian thực, suy từ heartbeat last_seen_at. Tách hẳn khỏi
// StatusBadge (trạng thái khoá) vì đây mới là "user có đang dùng app hay không".
// Offline vẫn hiện mốc thấy cuối để biết rời đi bao lâu.
function OnlineBadge({ lastSeenAt }) {
  const online = isOnline(lastSeenAt);
  if (online) {
    return (
      <span className="admin-badge admin-badge--online">
        <Wifi size={13} /> Trực tuyến
      </span>
    );
  }
  const rel = formatRelative(lastSeenAt);
  return (
    <span className="admin-badge admin-badge--offline">
      <Circle size={9} /> {rel ? `Thấy cuối ${rel}` : 'Chưa online'}
    </span>
  );
}

function UsersSection({ token, onAuthError }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');       // id đang xử lý
  const [busyAction, setBusyAction] = useState(''); // 'toggle' | 'delete' — để spinner đúng nút
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListUsers(token);
      setUsers(data.users || []);
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không tải được danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, [token, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const total = users?.length || 0;
    const active = users?.filter(u => u.is_active).length || 0;
    const online = users?.filter(u => isOnline(u.last_seen_at)).length || 0;
    return { total, active, locked: total - active, online };
  }, [users]);

  const toggleActive = async (user) => {
    setBusyId(user.id); setBusyAction('toggle'); setError('');
    try {
      const updated = await adminSetUserActive(token, user.id, !user.is_active);
      setUsers(current => current.map(row => (row.id === updated.id ? updated : row)));
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không cập nhật được người dùng');
    } finally {
      setBusyId(''); setBusyAction('');
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Xoá vĩnh viễn tài khoản @${user.username}? Hành động này không thể hoàn tác.`)) return;
    setBusyId(user.id); setBusyAction('delete'); setError('');
    try {
      await adminDeleteUser(token, user.id);
      setUsers(current => current.filter(row => row.id !== user.id));
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không xoá được người dùng');
    } finally {
      setBusyId(''); setBusyAction('');
    }
  };

  return (
    <section className="core-card admin-section">
      <div className="admin-section__header">
        <h4><Users size={18} /> Người dùng</h4>
        <button type="button" className="btn-secondary admin-refresh-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Làm mới
        </button>
      </div>

      {/* KPI strip: tổng / trực tuyến / bình thường / đã khoá. "Trực tuyến" là
          hoạt động thật (heartbeat); "bình thường/khoá" là trạng thái admin. */}
      <div className="admin-stat-strip">
        <div className="admin-stat">
          <span>Tổng</span>
          <strong>{users ? counts.total : '—'}</strong>
        </div>
        <div className="admin-stat admin-stat--online">
          <span>Trực tuyến</span>
          <strong>{users ? counts.online : '—'}</strong>
        </div>
        <div className="admin-stat admin-stat--active">
          <span>Bình thường</span>
          <strong>{users ? counts.active : '—'}</strong>
        </div>
        <div className="admin-stat admin-stat--locked">
          <span>Đã khoá</span>
          <strong>{users ? counts.locked : '—'}</strong>
        </div>
      </div>

      {error && <p className="account-form__error" role="alert"><AlertCircle size={15} /> {error}</p>}

      {!users ? (
        <div className="admin-loading"><Loader2 size={24} className="spin" /></div>
      ) : users.length === 0 ? (
        <div className="admin-empty">
          <Users size={28} />
          <p>Chưa có người dùng nào.</p>
        </div>
      ) : (
        <div className="admin-user-list">
          {users.map(user => {
            const rowBusy = busyId === user.id;
            return (
              <article key={user.id} className={`admin-user-row ${user.is_active ? '' : 'admin-user-row--locked'} ${rowBusy ? 'admin-user-row--busy' : ''}`}>
                <div className="admin-user-info">
                  <div className="admin-user-name">
                    <strong>{user.display_name}</strong>
                    <span className="admin-user-handle">@{user.username}</span>
                  </div>
                  <span className="admin-user-email">{user.email}</span>
                  <div className="admin-user-meta">
                    <OnlineBadge lastSeenAt={user.last_seen_at} />
                    <StatusBadge active={user.is_active} />
                    {user.last_active_at
                      ? <span className="admin-user-activity"><Clock size={12} /> Học {formatRelative(user.last_active_at)}</span>
                      : <span className="admin-user-activity admin-user-activity--none"><Clock size={12} /> Chưa học</span>}
                    <span className="admin-user-date">Tạo {new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
                <div className="admin-user-actions">
                  <button
                    type="button"
                    className={`btn-secondary admin-action ${user.is_active ? 'admin-action--lock' : 'admin-action--unlock'}`}
                    onClick={() => toggleActive(user)}
                    disabled={rowBusy}
                    aria-label={user.is_active ? `Khoá ${user.username}` : `Mở khoá ${user.username}`}
                  >
                    {rowBusy && busyAction === 'toggle'
                      ? <Loader2 size={14} className="spin" />
                      : user.is_active ? <Lock size={14} /> : <LockOpen size={14} />}
                    {user.is_active ? 'Khoá' : 'Mở khoá'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger admin-action"
                    onClick={() => removeUser(user)}
                    disabled={rowBusy}
                    aria-label={`Xoá ${user.username}`}
                  >
                    {rowBusy && busyAction === 'delete' ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                    Xoá
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConfigSection({ token, onAuthError }) {
  const [config, setConfig] = useState(null); // giá trị gốc từ server
  const [draft, setDraft] = useState({});     // giá trị đang chỉnh
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await adminGetConfig(token);
      setConfig(data.config || {});
      setDraft(data.config || {});
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không tải được cấu hình');
    } finally {
      setLoading(false);
    }
  }, [token, onAuthError]);

  useEffect(() => { load(); }, [load]);

  // Field "dirty" = giá trị nháp khác giá trị gốc. So sánh dạng chuỗi vì input
  // luôn trả string (kể cả field số).
  const isDirty = useCallback(
    (key) => config != null && String(draft[key] ?? '') !== String(config[key] ?? ''),
    [config, draft],
  );
  const dirtyKeys = useMemo(
    () => (config ? Object.keys(config).filter(isDirty) : []),
    [config, isDirty],
  );

  const handleChange = (key, value) => {
    setSuccess('');
    setDraft(current => ({ ...current, [key]: value }));
  };

  const resetField = (key) => {
    setSuccess('');
    setDraft(current => ({ ...current, [key]: config[key] }));
  };

  const resetAll = () => {
    setSuccess('');
    setDraft(config);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!dirtyKeys.length) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updates = {};
      dirtyKeys.forEach(key => { updates[key] = draft[key]; });
      const data = await adminUpdateConfig(token, updates);
      setConfig(data.config || {});
      setDraft(data.config || {});
      setSuccess(`Đã lưu ${dirtyKeys.length} thay đổi (hiệu lực đến khi khởi động lại).`);
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không lưu được cấu hình');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="core-card admin-section">
      <div className="admin-section__header">
        <h4><ShieldCheck size={18} /> Cấu hình hệ thống</h4>
        <div className="admin-section__header-actions">
          {dirtyKeys.length > 0 && <span className="admin-dirty-count">{dirtyKeys.length} thay đổi chưa lưu</span>}
          <button type="button" className="btn-secondary admin-refresh-btn" onClick={load} disabled={loading || saving}>
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Tải lại
          </button>
        </div>
      </div>

      {error && <p className="account-form__error" role="alert"><AlertCircle size={15} /> {error}</p>}
      {success && <p className="account-form__success"><CheckCircle2 size={15} /> {success}</p>}

      {!config ? (
        <div className="admin-loading"><Loader2 size={24} className="spin" /></div>
      ) : (
        <form className="admin-config-form" onSubmit={handleSubmit}>
          <div className="admin-config-grid">
            {Object.keys(config).map(key => {
              const dirty = isDirty(key);
              const isNumber = typeof config[key] === 'number';
              return (
                <label key={key} className={`admin-config-field ${dirty ? 'admin-config-field--dirty' : ''}`}>
                  <span className="admin-config-label">
                    {key}
                    {dirty && <em className="admin-field-flag">đã đổi</em>}
                  </span>
                  <div className="admin-config-input">
                    <input
                      value={draft[key] ?? ''}
                      onChange={e => handleChange(key, e.target.value)}
                      type={isNumber ? 'number' : 'text'}
                      inputMode={isNumber ? 'numeric' : undefined}
                    />
                    {dirty && (
                      <button
                        type="button"
                        className="admin-field-reset"
                        onClick={() => resetField(key)}
                        title={`Hoàn tác — về "${config[key]}"`}
                        aria-label={`Hoàn tác ${key}`}
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="admin-config-actions">
            <button type="submit" className="btn-primary" disabled={saving || !dirtyKeys.length}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {dirtyKeys.length ? `Lưu ${dirtyKeys.length} thay đổi` : 'Không có thay đổi'}
            </button>
            {dirtyKeys.length > 0 && (
              <button type="button" className="btn-secondary" onClick={resetAll} disabled={saving}>
                <RotateCcw size={15} /> Hoàn tác tất cả
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || null; } catch { return null; }
  });

  const setAdminToken = useCallback((next) => {
    try {
      if (next) sessionStorage.setItem(ADMIN_TOKEN_KEY, next);
      else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch { /* ignore */ }
    setToken(next);
  }, []);

  const handleAuthError = useCallback(() => setAdminToken(null), [setAdminToken]);

  if (!token) return <AdminLogin onLoggedIn={setAdminToken} />;

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-topbar__brand">
          <ShieldCheck size={22} />
          <div>
            <h3>Bảng điều khiển quản trị</h3>
            <p>Quản lý người dùng và cấu hình hệ thống</p>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAdminToken(null)}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </header>
      <div className="admin-body">
        <UsersSection token={token} onAuthError={handleAuthError} />
        <ConfigSection token={token} onAuthError={handleAuthError} />
      </div>
    </div>
  );
}
