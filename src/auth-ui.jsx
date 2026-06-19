import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Eye, EyeOff, Flame, KeyRound, Loader2, LogIn, LogOut, Medal, Search, Shield, ShieldCheck, ShieldOff, Trophy, User, UserPlus, X, XCircle } from 'lucide-react';
import { adminListUsers, adminResetPassword, adminSetActive, adminSetRole, getLeaderboard, getUserProfile, updateProfile } from './api-core';
import { useAuth } from './auth-context';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', tone: '' };
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 1) return { score: 1, label: 'Yếu', tone: 'weak' };
  if (score <= 3) return { score: 2, label: 'Trung bình', tone: 'medium' };
  return { score: 3, label: 'Mạnh', tone: 'strong' };
}

function AuthModal() {
  const { authModal, closeAuthModal, login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (authModal) {
      setMode(authModal);
      setError('');
      setPassword('');
      setShowPassword(false);
      setTouched({});
    }
  }, [authModal]);

  if (!authModal) return null;

  const markTouched = (field) => setTouched(prev => ({ ...prev, [field]: true }));

  const fieldErrors = {};
  if (mode === 'register') {
    if (!username.trim()) fieldErrors.username = 'Vui lòng nhập tên đăng nhập';
    else if (username.trim().length < 3) fieldErrors.username = 'Tối thiểu 3 ký tự';
    else if (!USERNAME_RE.test(username.trim())) fieldErrors.username = 'Chỉ dùng chữ, số và dấu _';
    if (!email.trim()) fieldErrors.email = 'Vui lòng nhập email';
    else if (!EMAIL_RE.test(email.trim())) fieldErrors.email = 'Email không hợp lệ';
    if (!password) fieldErrors.password = 'Vui lòng nhập mật khẩu';
    else if (password.length < 6) fieldErrors.password = 'Mật khẩu tối thiểu 6 ký tự';
  } else {
    if (!loginValue.trim()) fieldErrors.login = 'Vui lòng nhập tên đăng nhập hoặc email';
    if (!password) fieldErrors.password = 'Vui lòng nhập mật khẩu';
  }

  const strength = mode === 'register' ? passwordStrength(password) : null;
  const isValid = Object.keys(fieldErrors).length === 0;
  const showErr = (field) => touched[field] && fieldErrors[field];

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isValid) {
      setTouched({ username: true, email: true, password: true, login: true });
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(loginValue.trim(), password);
      } else {
        await register({
          username: username.trim(),
          email: email.trim(),
          password,
          display_name: displayName.trim() || undefined,
        });
      }
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setTouched({});
  };

  return (
    <div className="auth-overlay" onClick={closeAuthModal}>
      <div className="auth-modal core-card" onClick={event => event.stopPropagation()}>
        <div className="auth-modal__header">
          <h3>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}</h3>
          <button type="button" className="auth-modal__close" onClick={closeAuthModal} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <>
              <label className={showErr('username') ? 'auth-field--invalid' : ''}>
                Tên đăng nhập
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onBlur={() => markTouched('username')}
                  autoComplete="username"
                  aria-invalid={Boolean(showErr('username'))}
                />
                {showErr('username') && <span className="auth-field__hint">{fieldErrors.username}</span>}
              </label>
              <label className={showErr('email') ? 'auth-field--invalid' : ''}>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => markTouched('email')}
                  autoComplete="email"
                  aria-invalid={Boolean(showErr('email'))}
                />
                {showErr('email') && <span className="auth-field__hint">{fieldErrors.email}</span>}
              </label>
              <label>
                Tên hiển thị (tuỳ chọn)
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64} />
              </label>
            </>
          )}
          {mode === 'login' && (
            <label className={showErr('login') ? 'auth-field--invalid' : ''}>
              Tên đăng nhập hoặc email
              <input
                value={loginValue}
                onChange={e => setLoginValue(e.target.value)}
                onBlur={() => markTouched('login')}
                autoComplete="username"
                aria-invalid={Boolean(showErr('login'))}
              />
              {showErr('login') && <span className="auth-field__hint">{fieldErrors.login}</span>}
            </label>
          )}
          <label className={showErr('password') ? 'auth-field--invalid' : ''}>
            Mật khẩu
            <span className="auth-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={() => markTouched('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-invalid={Boolean(showErr('password'))}
              />
              <button
                type="button"
                className="auth-input__toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {showErr('password') && <span className="auth-field__hint">{fieldErrors.password}</span>}
            {mode === 'register' && password && (
              <span className={`auth-strength auth-strength--${strength.tone}`}>
                <span className="auth-strength__bar"><i style={{ width: `${(strength.score / 3) * 100}%` }} /></span>
                <span className="auth-strength__label">{strength.label}</span>
              </span>
            )}
          </label>

          {error && <p className="auth-form__error">{error}</p>}

          <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>

        <p className="auth-modal__switch">
          {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
          {' '}
          <button type="button" onClick={switchMode}>
            {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
          </button>
        </p>
      </div>
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <Medal size={18} className="rank-badge rank-badge--gold" />;
  if (rank === 2) return <Medal size={18} className="rank-badge rank-badge--silver" />;
  if (rank === 3) return <Medal size={18} className="rank-badge rank-badge--bronze" />;
  return <span className="rank-badge rank-badge--plain">{rank}</span>;
}

export function LeaderboardPanel() {
  const { isAuthenticated, user, updateLocalUser } = useAuth();
  const [period, setPeriod] = useState('all_time');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optIn, setOptIn] = useState(user?.leaderboard_opt_in ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOptIn(user?.leaderboard_opt_in ?? true);
  }, [user?.leaderboard_opt_in]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLeaderboard(period)
      .then(result => { if (alive) setData(result); })
      .catch(() => { if (alive) setData({ period, entries: [], me: null }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period, isAuthenticated]);

  const toggleOptIn = async () => {
    if (!isAuthenticated) return;
    setSaving(true);
    try {
      const next = !optIn;
      const updated = await updateProfile({ leaderboard_opt_in: next });
      setOptIn(updated.leaderboard_opt_in);
      updateLocalUser(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <div>
          <h3><Trophy size={22} /> Bảng xếp hạng</h3>
          <p className="leaderboard-subtitle">Điểm = câu đúng × 10 + phiên hoàn thành × 50 + từ thuộc × 25</p>
        </div>
        <div className="leaderboard-tabs">
          <button type="button" className={period === 'all_time' ? 'active' : ''} onClick={() => setPeriod('all_time')}>Tất cả</button>
          <button type="button" className={period === 'weekly' ? 'active' : ''} onClick={() => setPeriod('weekly')}>Tuần này</button>
        </div>
      </div>

      {isAuthenticated && data?.me && (
        <article className="core-card leaderboard-me">
          <span>Hạng của bạn</span>
          <strong>{data.me.rank ? `#${data.me.rank}` : 'Chưa có hạng'}</strong>
          <strong className="leaderboard-points">{data.me.points} điểm</strong>
          <label className="leaderboard-optin">
            <input type="checkbox" checked={optIn} disabled={saving} onChange={toggleOptIn} />
            Hiển thị tên trên bảng xếp hạng
          </label>
        </article>
      )}

      {!isAuthenticated && (
        <article className="core-card leaderboard-guest">
          <p>Đăng nhập để lưu tiến độ và tham gia bảng xếp hạng.</p>
        </article>
      )}

      {loading ? (
        <div className="leaderboard-loading"><Loader2 size={24} className="spin" /></div>
      ) : (
        <div className="leaderboard-list">
          {data?.entries?.length ? data.entries.map(entry => (
            <article
              key={entry.user_id}
              className={`core-card leaderboard-row ${entry.user_id === user?.id ? 'leaderboard-row--me' : ''}`}
            >
              <RankBadge rank={entry.rank} />
              <div className="leaderboard-row__info">
                <strong>{entry.display_name}</strong>
                <span>{entry.quiz_count} bài · {entry.session_count} phiên · {entry.mastery_count} từ thuộc</span>
              </div>
              <strong className="leaderboard-points">{entry.points}</strong>
            </article>
          )) : (
            <article className="core-card leaderboard-empty">
              <p>Chưa có ai trên bảng xếp hạng. Hãy luyện tập và trở thành người đầu tiên!</p>
            </article>
          )}
        </div>
      )}
    </div>
  );
}

export function AuthControls() {
  const { isAuthenticated, user, openLogin, openRegister, logout, loading } = useAuth();

  if (loading) {
    return <span className="auth-controls auth-controls--loading"><Loader2 size={16} className="spin" /></span>;
  }

  if (isAuthenticated) {
    return (
      <div className="auth-controls">
        <span className="auth-user" title={user.email}>
          {user.display_name}
        </span>
        <button type="button" className="auth-btn" onClick={logout} title="Đăng xuất">
          <LogOut size={16} />
          <span className="hide-mobile">Đăng xuất</span>
        </button>
      </div>
    );
  }

  return (
    <div className="auth-controls">
      <button type="button" className="auth-btn" onClick={openLogin}>
        <LogIn size={16} />
        <span className="hide-mobile">Đăng nhập</span>
      </button>
      <button type="button" className="auth-btn auth-btn--primary" onClick={openRegister}>
        <UserPlus size={16} />
        <span className="hide-mobile">Đăng ký</span>
      </button>
    </div>
  );
}

export function AuthModalHost() {
  return <AuthModal />;
}

function StreakCard({ icon: Icon, label, value, tone = 'jade' }) {
  return (
    <article className={`core-card profile-stat profile-stat--${tone}`}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ProfilePanel() {
  const { isAuthenticated, user, openLogin, openRegister } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUserProfile()
      .then(data => { if (alive) setProfile(data); })
      .catch(() => { if (alive) setProfile({ user: null, stats: null }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isAuthenticated, user?.id]);

  const stats = profile?.stats;
  const earnedTitles = stats?.titles?.filter(item => item.earned) || [];
  const lockedTitles = stats?.titles?.filter(item => !item.earned) || [];

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h3><User size={22} /> Hồ sơ học tập</h3>
        <p className="profile-subtitle">
          {isAuthenticated
            ? `${user.display_name} · @${user.username}`
            : 'Đăng nhập để đồng bộ chuỗi ngày học và danh hiệu trên mọi thiết bị'}
        </p>
      </div>

      {!isAuthenticated && (
        <article className="core-card profile-guest">
          <p>Bạn đang xem dữ liệu học trên máy này. Đăng nhập để lưu tiến độ lâu dài.</p>
          <div className="profile-guest__actions">
            <button type="button" className="btn-primary" onClick={openLogin}><LogIn size={16} /> Đăng nhập</button>
            <button type="button" className="btn-secondary" onClick={openRegister}><UserPlus size={16} /> Đăng ký</button>
          </div>
        </article>
      )}

      {loading ? (
        <div className="profile-loading"><Loader2 size={24} className="spin" /></div>
      ) : stats && (
        <>
          <div className="profile-streak-grid">
            <StreakCard icon={Flame} label="Chuỗi hiện tại" value={`${stats.current_streak} ngày`} tone="gold" />
            <StreakCard icon={Award} label="Chuỗi dài nhất" value={`${stats.longest_streak} ngày`} tone="porcelain" />
            <StreakCard icon={User} label="Tổng ngày học" value={`${stats.study_days} ngày`} tone="jade" />
          </div>

          {stats.studied_today ? (
            <p className="profile-streak-note profile-streak-note--active">Hôm nay bạn đã học — giữ chuỗi nhé!</p>
          ) : stats.current_streak > 0 ? (
            <p className="profile-streak-note">Hãy học hôm nay để không mất chuỗi {stats.current_streak} ngày.</p>
          ) : (
            <p className="profile-streak-note">Bắt đầu học hôm nay để mở chuỗi ngày mới.</p>
          )}

          <div className="profile-summary-grid">
            <article className="core-card profile-summary-item">
              <span>Bài luyện</span>
              <strong>{stats.quiz_count}</strong>
            </article>
            <article className="core-card profile-summary-item">
              <span>Phiên học</span>
              <strong>{stats.session_count}</strong>
            </article>
            <article className="core-card profile-summary-item">
              <span>Từ thuộc</span>
              <strong>{stats.mastery_count}</strong>
            </article>
            <article className="core-card profile-summary-item">
              <span>Điểm</span>
              <strong>{stats.points}</strong>
            </article>
          </div>

          <section className="profile-titles">
            <div className="profile-titles__header">
              <h4><Award size={18} /> Danh hiệu</h4>
              <span>{stats.earned_titles}/{stats.titles?.length || 0} đã mở</span>
            </div>

            {earnedTitles.length > 0 && (
              <div className="title-grid">
                {earnedTitles.map(title => (
                  <article key={title.id} className="core-card title-card title-card--earned">
                    <strong>{title.label}</strong>
                    <span>{title.description}</span>
                  </article>
                ))}
              </div>
            )}

            {lockedTitles.length > 0 && (
              <>
                <p className="profile-titles__locked-label">Chưa mở khóa</p>
                <div className="title-grid">
                  {lockedTitles.map(title => (
                    <article key={title.id} className="core-card title-card title-card--locked">
                      <strong>{title.label}</strong>
                      <span>{title.description}</span>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AdminResetDialog({ target, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await adminResetPassword(target.id, password);
      onDone(`Đã đặt lại mật khẩu cho ${target.display_name || target.username}`);
    } catch (err) {
      setError(err.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal core-card" onClick={event => event.stopPropagation()}>
        <div className="auth-modal__header">
          <h3>Đặt lại mật khẩu</h3>
          <button type="button" className="auth-modal__close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <p className="admin-dialog__target">Tài khoản: <strong>{target.display_name || target.username}</strong> (@{target.username})</p>
          <label>
            Mật khẩu mới
            <span className="auth-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button type="button" className="auth-input__toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} tabIndex={-1}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          {error && <p className="auth-form__error">{error}</p>}
          <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
            Đặt lại mật khẩu
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [resetTarget, setResetTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminListUsers();
      setUsers(Array.isArray(list) ? list : list?.users || []);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q));
  }, [users, query]);

  const applyPatch = (id, patch) => {
    setUsers(current => current.map(u => (u.id === id ? { ...u, ...patch } : u)));
  };

  const handleToggleRole = async (target) => {
    const nextRole = target.role === 'admin' ? 'user' : 'admin';
    setBusyId(target.id);
    setError('');
    try {
      const updated = await adminSetRole(target.id, nextRole);
      applyPatch(target.id, { role: updated?.role ?? nextRole });
      setNotice(`${target.display_name || target.username} giờ là ${nextRole === 'admin' ? 'quản trị viên' : 'người dùng'}`);
    } catch (err) {
      setError(err.message || 'Không thể đổi vai trò');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (target) => {
    const nextActive = !target.is_active;
    setBusyId(target.id);
    setError('');
    try {
      const updated = await adminSetActive(target.id, nextActive);
      applyPatch(target.id, { is_active: updated?.is_active ?? nextActive });
      setNotice(`${nextActive ? 'Đã mở khóa' : 'Đã khóa'} ${target.display_name || target.username}`);
    } catch (err) {
      setError(err.message || 'Không thể đổi trạng thái');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h3><Shield size={22} /> Quản trị người dùng</h3>
          <p className="admin-subtitle">Quản lý vai trò, khóa/mở tài khoản và đặt lại mật khẩu.</p>
        </div>
        <div className="admin-search">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên, email..." />
        </div>
      </div>

      {notice && <p className="admin-notice"><CheckCircle2 size={16} /> {notice}</p>}
      {error && <p className="auth-form__error">{error}</p>}

      {loading ? (
        <div className="admin-loading"><Loader2 size={24} className="spin" /></div>
      ) : (
        <div className="admin-list">
          {filtered.length ? filtered.map(target => {
            const isSelf = target.id === user?.id;
            const isBusy = busyId === target.id;
            return (
              <article key={target.id} className={`core-card admin-row ${target.is_active ? '' : 'admin-row--locked'}`}>
                <div className="admin-row__info">
                  <strong>{target.display_name || target.username}</strong>
                  <span>@{target.username} · {target.email}</span>
                </div>
                <div className="admin-row__badges">
                  <span className={`admin-badge admin-badge--${target.role === 'admin' ? 'admin' : 'user'}`}>
                    {target.role === 'admin' ? <ShieldCheck size={13} /> : <User size={13} />}
                    {target.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                  </span>
                  <span className={`admin-badge admin-badge--${target.is_active ? 'active' : 'inactive'}`}>
                    {target.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {target.is_active ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </div>
                <div className="admin-row__actions">
                  <button type="button" className="admin-action" disabled={isBusy || isSelf} title={isSelf ? 'Không thể đổi vai trò của chính mình' : 'Đổi vai trò'} onClick={() => handleToggleRole(target)}>
                    {isBusy ? <Loader2 size={15} className="spin" /> : target.role === 'admin' ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                    <span className="hide-mobile">{target.role === 'admin' ? 'Gỡ admin' : 'Cấp admin'}</span>
                  </button>
                  <button type="button" className={`admin-action ${target.is_active ? 'admin-action--danger' : ''}`} disabled={isBusy || isSelf} title={isSelf ? 'Không thể khóa chính mình' : target.is_active ? 'Khóa tài khoản' : 'Mở khóa'} onClick={() => handleToggleActive(target)}>
                    {isBusy ? <Loader2 size={15} className="spin" /> : target.is_active ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                    <span className="hide-mobile">{target.is_active ? 'Khóa' : 'Mở khóa'}</span>
                  </button>
                  <button type="button" className="admin-action" disabled={isBusy} title="Đặt lại mật khẩu" onClick={() => setResetTarget(target)}>
                    <KeyRound size={15} />
                    <span className="hide-mobile">Mật khẩu</span>
                  </button>
                </div>
              </article>
            );
          }) : (
            <article className="core-card admin-empty"><p>Không tìm thấy người dùng nào.</p></article>
          )}
        </div>
      )}

      {resetTarget && (
        <AdminResetDialog
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={(msg) => { setResetTarget(null); setNotice(msg); }}
        />
      )}
    </div>
  );
}
