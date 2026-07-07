import { useEffect, useState, useRef } from 'react';
import { Award, Flame, Loader2, LogIn, LogOut, Medal, Trophy, User, UserPlus, X } from 'lucide-react';
import { getLeaderboard, getUserProfile, updateProfile } from './api-core';
import { useAuth } from './auth-core';
import SpaceVortexBackground from './components/SpaceVortexBackground.jsx';

function AuthForm({ mode, setMode }) {
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
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

        {error && <p className="auth-form__error">{error}</p>}

        <button className="btn-primary auth-form__submit" type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
          {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>

      <p className="auth-modal__switch">
        {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
        {' '}
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
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
    </div>
  );
}
