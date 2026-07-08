import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogIn, LogOut, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import {
  adminDeleteUser,
  adminGetConfig,
  adminListUsers,
  adminLogin,
  adminSetUserActive,
  adminUpdateConfig,
} from './api-core';

const ADMIN_TOKEN_KEY = 'hanziAdminToken';

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
      <div className="auth-gate__card auth-gate__card--glass">
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
          {error && <p className="auth-form__error">{error}</p>}
          <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}

function UsersSection({ token, onAuthError }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await adminListUsers(token);
      setUsers(data.users || []);
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không tải được danh sách người dùng');
    }
  }, [token, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (user) => {
    setBusyId(user.id);
    setError('');
    try {
      const updated = await adminSetUserActive(token, user.id, !user.is_active);
      setUsers(current => current.map(row => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err.message || 'Không cập nhật được người dùng');
    } finally {
      setBusyId('');
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Xoá vĩnh viễn tài khoản @${user.username}? Hành động này không thể hoàn tác.`)) return;
    setBusyId(user.id);
    setError('');
    try {
      await adminDeleteUser(token, user.id);
      setUsers(current => current.filter(row => row.id !== user.id));
    } catch (err) {
      setError(err.message || 'Không xoá được người dùng');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="account-section core-card">
      <div className="account-section__header">
        <h4>Người dùng {users ? `(${users.length})` : ''}</h4>
        <button type="button" className="btn-secondary account-section__edit" onClick={load}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>
      {error && <p className="account-form__error">{error}</p>}
      {!users ? (
        <div className="profile-loading"><Loader2 size={24} className="spin" /></div>
      ) : users.length === 0 ? (
        <p>Chưa có người dùng nào.</p>
      ) : (
        <div className="admin-user-list">
          {users.map(user => (
            <article key={user.id} className={`core-card admin-user-row ${user.is_active ? '' : 'admin-user-row--locked'}`}>
              <div className="admin-user-info">
                <strong>{user.display_name} <span>@{user.username}</span></strong>
                <span>{user.email}</span>
                <small>
                  {user.is_active ? 'Đang hoạt động' : 'Đã khoá'} · Tạo {new Date(user.created_at).toLocaleDateString('vi-VN')}
                </small>
              </div>
              <div className="admin-user-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => toggleActive(user)}
                  disabled={busyId === user.id}
                >
                  {busyId === user.id ? <Loader2 size={14} className="spin" /> : null}
                  {user.is_active ? 'Khoá' : 'Mở khoá'}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => removeUser(user)}
                  disabled={busyId === user.id}
                >
                  <Trash2 size={14} /> Xoá
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ConfigSection({ token, onAuthError }) {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setSuccess('');
    try {
      const data = await adminGetConfig(token);
      setConfig(data.config || {});
      setDraft(data.config || {});
    } catch (err) {
      if (err.message === 'Forbidden') { onAuthError(); return; }
      setError(err.message || 'Không tải được cấu hình');
    }
  }, [token, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Chỉ gửi field đã đổi để không ghi đè thừa.
      const updates = {};
      Object.keys(draft).forEach(key => {
        if (String(draft[key]) !== String(config[key])) updates[key] = draft[key];
      });
      if (!Object.keys(updates).length) {
        setSuccess('Không có thay đổi để lưu.');
        return;
      }
      const data = await adminUpdateConfig(token, updates);
      setConfig(data.config || {});
      setDraft(data.config || {});
      setSuccess('Đã lưu cấu hình (hiệu lực đến khi khởi động lại).');
    } catch (err) {
      setError(err.message || 'Không lưu được cấu hình');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="account-section core-card">
      <div className="account-section__header">
        <h4>Cấu hình hệ thống</h4>
        <button type="button" className="btn-secondary account-section__edit" onClick={load}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>
      {error && <p className="account-form__error">{error}</p>}
      {!config ? (
        <div className="profile-loading"><Loader2 size={24} className="spin" /></div>
      ) : (
        <form className="account-form" onSubmit={handleSubmit}>
          {Object.keys(config).map(key => (
            <label key={key}>
              {key}
              <input
                value={draft[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                type={typeof config[key] === 'number' ? 'number' : 'text'}
              />
            </label>
          ))}
          {success && <p className="account-form__success">{success}</p>}
          <div className="account-form__actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Lưu cấu hình
            </button>
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
    <div className="profile-page admin-page">
      <div className="profile-header">
        <h3><ShieldCheck size={22} /> Bảng điều khiển quản trị</h3>
        <button type="button" className="btn-secondary" onClick={() => setAdminToken(null)}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
      <UsersSection token={token} onAuthError={handleAuthError} />
      <ConfigSection token={token} onAuthError={handleAuthError} />
    </div>
  );
}
