import { useEffect, useState, useRef } from 'react';
import { Award, CheckCircle2, Flame, KeyRound, Loader2, LogIn, LogOut, Medal, Pencil, Save, Trash2, Trophy, User, UserPlus, X } from 'lucide-react';
import { changePassword, deleteAccount, forgotPassword, getLeaderboard, getUserProfile, resetPassword, updateProfile } from './api-core';
import { useAuth } from './auth-core';
import { scopedKey } from './user-scope';
import SpaceVortexBackground from './components/SpaceVortexBackground.jsx';

function AuthForm({ mode, setMode }) {
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goMode = (next) => {
    setError('');
    setForgotSent(false);
    setMode(next);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(loginValue.trim(), password);
      } else if (mode === 'forgot') {
        await forgotPassword(forgotEmail.trim());
        setForgotSent(true);
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

  if (mode === 'forgot') {
    return (
      <>
        {forgotSent ? (
          <div className="auth-form auth-form__sent">
            <CheckCircle2 size={40} className="auth-form__sent-icon" />
            <p>Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư (kể cả thư rác).</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="auth-form__hint">Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
            <label>
              Email
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required autoComplete="email" />
            </label>

            {error && <p className="auth-form__error">{error}</p>}

            <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
              Gửi liên kết
            </button>
          </form>
        )}

        <p className="auth-modal__switch">
          <button type="button" onClick={() => goMode('login')}>Quay lại đăng nhập</button>
        </p>
      </>
    );
  }

  return (
    <>
      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === 'register' && (
          <>
            <label>
              Tên đăng nhập
              <input value={username} onChange={e => setUsername(e.target.value)} required minLength={3} autoComplete="username" />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label>
              Tên hiển thị (tuỳ chọn)
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64} />
            </label>
          </>
        )}
        {mode === 'login' && (
          <label>
            Tên đăng nhập hoặc email
            <input value={loginValue} onChange={e => setLoginValue(e.target.value)} required autoComplete="username" />
          </label>
        )}
        <label>
          Mật khẩu
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>

        {mode === 'login' && (
          <p className="auth-form__forgot">
            <button type="button" onClick={() => goMode('forgot')}>Quên mật khẩu?</button>
          </p>
        )}

        {error && <p className="auth-form__error">{error}</p>}

        <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
          {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>

      <p className="auth-modal__switch">
        {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
        {' '}
        <button type="button" onClick={() => goMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
        </button>
      </p>
    </>
  );
}

function AuthModal() {
  const { authModal, closeAuthModal } = useAuth();
  const [mode, setMode] = useState(authModal);

  return (
    <div className="auth-overlay" onClick={closeAuthModal}>
      <div className="auth-modal core-card" onClick={event => event.stopPropagation()}>
        <div className="auth-modal__header">
          <h3>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}</h3>
          <button type="button" className="auth-modal__close" onClick={closeAuthModal} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <AuthForm mode={mode} setMode={setMode} />
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const cardRef = useRef(null);
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const goHome = () => { window.location.href = '/'; };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirm) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Không đặt lại được mật khẩu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-gate" style={{ position: 'relative', overflow: 'hidden' }}>
      <SpaceVortexBackground active={true} cardRef={cardRef} />
      <div className="auth-gate__vignette" />
      <div ref={cardRef} className="auth-gate__card auth-gate__card--glass" style={{ position: 'relative', zIndex: 10 }}>
        <div className="auth-gate__brand">
          <img src="/logo.jpg" alt="Logo" />
          <h1>Đặt lại mật khẩu</h1>
        </div>

        {!token ? (
          <div className="auth-form auth-form__sent">
            <p>Liên kết không hợp lệ. Hãy yêu cầu gửi lại email đặt lại mật khẩu.</p>
            <button type="button" className="btn-primary auth-form__submit" onClick={goHome}>Về trang đăng nhập</button>
          </div>
        ) : done ? (
          <div className="auth-form auth-form__sent">
            <CheckCircle2 size={40} className="auth-form__sent-icon" />
            <p>Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.</p>
            <button type="button" className="btn-primary auth-form__submit" onClick={goHome}>Đăng nhập</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Mật khẩu mới
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            </label>
            <label>
              Xác nhận mật khẩu mới
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" />
            </label>

            {error && <p className="auth-form__error">{error}</p>}

            <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Đặt lại mật khẩu
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AuthGate({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState('login');
  const cardRef = useRef(null);

  if (loading) {
    return (
      <div className="auth-gate">
        <div className="auth-gate__loading"><Loader2 size={32} className="spin" /></div>
      </div>
    );
  }

  if (isAuthenticated) return children;

  return (
    <div className="auth-gate" style={{ position: 'relative', overflow: 'hidden' }}>
      <SpaceVortexBackground active={true} cardRef={cardRef} />
      <div className="auth-gate__vignette" />
      <div ref={cardRef} className="auth-gate__card auth-gate__card--glass" style={{ position: 'relative', zIndex: 10 }}>
        <div className="auth-gate__brand">
          <img src="/logo.jpg" alt="Logo" />
          <h1>Học tiếng Trung theo cách của tôi</h1>
          <p className={mode === 'login' ? 'auth-gate__slogan' : undefined}>{mode === 'login' ? 'Học là việc của bạn.' : 'Tạo tài khoản để bắt đầu hành trình học tiếng Trung theo cách của riêng bạn.'}</p>
        </div>
        <AuthForm mode={mode} setMode={setMode} />
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
  const [optIn, setOptIn] = useState(user?.leaderboard_opt_in ?? true);
  const [saving, setSaving] = useState(false);

  // Đồng bộ optIn khi prop user đổi — pattern điều chỉnh state lúc render.
  const [prevOptIn, setPrevOptIn] = useState(user?.leaderboard_opt_in);
  if (user?.leaderboard_opt_in !== prevOptIn) {
    setPrevOptIn(user?.leaderboard_opt_in);
    setOptIn(user?.leaderboard_opt_in ?? true);
  }

  const requestKey = `${period}:${isAuthenticated}`;
  const loading = data?.key !== requestKey;
  const board = data?.value;

  useEffect(() => {
    let alive = true;
    getLeaderboard(period)
      .then(result => { if (alive) setData({ key: requestKey, value: result }); })
      .catch(() => { if (alive) setData({ key: requestKey, value: { period, entries: [], me: null } }); });
    return () => { alive = false; };
  }, [period, isAuthenticated, requestKey]);

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

      {isAuthenticated && board?.me && (
        <article className="core-card leaderboard-me">
          <span>Hạng của bạn</span>
          <strong>{board.me.rank ? `#${board.me.rank}` : 'Chưa có hạng'}</strong>
          <strong className="leaderboard-points">{board.me.points} điểm</strong>
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
          {board?.entries?.length ? board.entries.map(entry => (
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
  const { authModal } = useAuth();
  if (!authModal) return null;
  return <AuthModal key={authModal} />;
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

function EditProfileSection() {
  const { user, updateLocalUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startEdit = () => {
    setDisplayName(user?.display_name ?? '');
    setEmail(user?.email ?? '');
    setError('');
    setSuccess('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const patch = {};
      const nextName = displayName.trim();
      const nextEmail = email.trim();
      if (nextName && nextName !== user.display_name) patch.display_name = nextName;
      if (nextEmail && nextEmail !== user.email) patch.email = nextEmail;
      if (!Object.keys(patch).length) {
        setEditing(false);
        return;
      }
      const updated = await updateProfile(patch);
      updateLocalUser(updated);
      setSuccess('Đã lưu hồ sơ.');
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Không lưu được hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="account-section core-card">
      <div className="account-section__header">
        <h4><Pencil size={18} /> Thông tin cá nhân</h4>
        {!editing && (
          <button type="button" className="btn-secondary account-section__edit" onClick={startEdit}>
            <Pencil size={14} /> Sửa
          </button>
        )}
      </div>

      {editing ? (
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            Tên hiển thị
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={64} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {error && <p className="account-form__error">{error}</p>}
          <div className="account-form__actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Lưu
            </button>
            <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={saving}>Huỷ</button>
          </div>
        </form>
      ) : (
        <div className="account-info">
          <div className="account-info__row"><span>Tên hiển thị</span><strong>{user?.display_name}</strong></div>
          <div className="account-info__row"><span>Tên đăng nhập</span><strong>@{user?.username}</strong></div>
          <div className="account-info__row"><span>Email</span><strong>{user?.email}</strong></div>
          {success && <p className="account-form__success">{success}</p>}
        </div>
      )}
    </section>
  );
}

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }
    setSaving(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setSuccess('Đã đổi mật khẩu.');
      reset();
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Không đổi được mật khẩu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="account-section core-card">
      <div className="account-section__header">
        <h4><KeyRound size={18} /> Mật khẩu</h4>
        {!open && (
          <button type="button" className="btn-secondary account-section__edit" onClick={() => { reset(); setSuccess(''); setOpen(true); }}>
            Đổi mật khẩu
          </button>
        )}
      </div>

      {open ? (
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            Mật khẩu hiện tại
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
          </label>
          <label>
            Mật khẩu mới
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
          <label>
            Xác nhận mật khẩu mới
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
          {error && <p className="account-form__error">{error}</p>}
          <div className="account-form__actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Lưu mật khẩu
            </button>
            <button type="button" className="btn-secondary" onClick={() => { reset(); setOpen(false); }} disabled={saving}>Huỷ</button>
          </div>
        </form>
      ) : (
        success && <p className="account-form__success">{success}</p>
      )}
    </section>
  );
}

function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async (event) => {
    event.preventDefault();
    setError('');
    setDeleting(true);
    try {
      await deleteAccount();
      // Dọn dữ liệu học cục bộ đã scope theo user TRƯỚC khi logout — sau logout
      // currentUserId về null nên scopedKey mất hậu tố, không trỏ đúng khóa nữa.
      ['coreStats', 'coreHistory', 'learningSessionSummaries'].forEach(key => {
        localStorage.removeItem(scopedKey(key));
      });
      logout();
    } catch (err) {
      setError(err.message || 'Không xoá được tài khoản.');
      setDeleting(false);
    }
  };

  const canDelete = confirmText.trim().toLowerCase() === (user?.username ?? '').toLowerCase();

  return (
    <section className="account-section account-section--danger core-card">
      <div className="account-section__header">
        <h4><Trash2 size={18} /> Xoá tài khoản</h4>
      </div>
      {open ? (
        <form className="account-form" onSubmit={handleDelete}>
          <p className="account-danger__warning">
            Hành động này không thể hoàn tác. Toàn bộ tài khoản sẽ bị xoá vĩnh viễn.
            Gõ lại tên đăng nhập <strong>{user?.username}</strong> để xác nhận.
          </p>
          <label>
            Tên đăng nhập
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="account-form__error">{error}</p>}
          <div className="account-form__actions">
            <button type="submit" className="btn-danger" disabled={!canDelete || deleting}>
              {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} Xoá vĩnh viễn
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setConfirmText(''); setError(''); setOpen(false); }} disabled={deleting}>Huỷ</button>
          </div>
        </form>
      ) : (
        <div className="account-danger__intro">
          <p>Xoá tài khoản và mọi dữ liệu đăng nhập khỏi hệ thống.</p>
          <button type="button" className="btn-danger" onClick={() => { setError(''); setOpen(true); }}>
            <Trash2 size={16} /> Xoá tài khoản
          </button>
        </div>
      )}
    </section>
  );
}

export function ProfilePanel() {
  const { isAuthenticated, user, openLogin, openRegister } = useAuth();
  const [profile, setProfile] = useState(null);

  const requestKey = `${isAuthenticated}:${user?.id ?? ''}`;
  const loading = profile?.key !== requestKey;

  useEffect(() => {
    let alive = true;
    getUserProfile()
      .then(data => { if (alive) setProfile({ key: requestKey, value: data }); })
      .catch(() => { if (alive) setProfile({ key: requestKey, value: { user: null, stats: null } }); });
    return () => { alive = false; };
  }, [isAuthenticated, user?.id, requestKey]);

  const stats = profile?.value?.stats;
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

      {isAuthenticated && (
        <section className="profile-account">
          <h4><User size={18} /> Quản lý tài khoản</h4>
          <EditProfileSection />
          <ChangePasswordSection />
          <DeleteAccountSection />
        </section>
      )}
    </div>
  );
}
