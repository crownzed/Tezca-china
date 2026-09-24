import { useEffect, useState } from 'react';
import { Flame, Trophy, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth-core';
import { useStreak } from '../hooks/useStreak';
import { useLeaderboard } from '../hooks/useLeaderboard';

/**
 * Component hiển thị streak cá nhân — đặt ở header hoặc dashboard.
 * Hiển thị số ngày liên tiếp, animation khi tăng chuỗi, trạng thái gãy.
 */
export function StreakDisplay({ className = '' }) {
  const { currentStreak, longestStreak, studiedToday, broken, loading } = useStreak();
  const { isAuthenticated } = useAuth();
  const [animate, setAnimate] = useState(false);

  // Trigger animation khi streak thay đổi
  useEffect(() => {
    let frame = null;
    let timer = null;

    if (currentStreak > 0) {
      frame = requestAnimationFrame(() => {
        setAnimate(true);
        timer = setTimeout(() => setAnimate(false), 1200);
      });
    } else {
      frame = requestAnimationFrame(() => setAnimate(false));
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [currentStreak]);

  if (!isAuthenticated || loading) return null;

  // Trạng thái chuỗi gãy
  if (broken && currentStreak === 0) {
    return (
      <div className={`streak-display streak-display--broken ${className}`}>
        <AlertCircle size={20} className="streak-icon" />
        <div className="streak-info">
          <span className="streak-label">Chuỗi đã gãy</span>
          <span className="streak-hint">Học hôm nay để bắt đầu lại!</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`streak-display ${animate ? 'streak-display--pulse' : ''} ${className}`}>
      <div className="streak-flame">
        <Flame
          size={24}
          className={`streak-flame-icon ${studiedToday ? 'streak-flame--active' : ''}`}
          fill={studiedToday ? 'currentColor' : 'none'}
        />
      </div>
      <div className="streak-info">
        <span className="streak-count">{currentStreak}</span>
        <span className="streak-label">ngày liên tiếp</span>
      </div>
      {longestStreak > 0 && (
        <div className="streak-best" title="Kỷ lục cá nhân">
          <Trophy size={14} />
          <span>{longestStreak}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Component bảng xếp hạng streak — top users theo streak cao nhất.
 * Có podium cho top 3 và highlight vị trí user hiện tại.
 */
export function StreakLeaderboard({ limit = 20, className = '' }) {
  const { userId, isAuthenticated } = useAuth();
  const { entries, me, loading } = useLeaderboard({ limit });

  if (loading) {
    return (
      <div className={`streak-leaderboard ${className}`}>
        <div className="streak-lb-loading">Đang tải bảng xếp hạng...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={`streak-leaderboard ${className}`}>
        <div className="streak-lb-empty">
          <TrendingUp size={32} />
          <p>Chưa có ai trong bảng xếp hạng.</p>
          <small>Hãy học mỗi ngày để xuất hiện ở đây!</small>
        </div>
      </div>
    );
  }

  // Tách top 3 cho podium, phần còn lại cho list
  const podiumEntries = entries.slice(0, 3);
  const restEntries = entries.slice(3);
  // Podium order: 2nd, 1st, 3rd (center is #1)
  const podiumOrder = [
    podiumEntries[1], // #2 left
    podiumEntries[0], // #1 center
    podiumEntries[2], // #3 right
  ].filter(Boolean);

  return (
    <div className={`streak-leaderboard ${className}`}>
      <div className="streak-lb-header">
        <Trophy size={20} />
        <h3>Bảng xếp hạng streak</h3>
      </div>

      {/* Podium — top 3 */}
      {podiumOrder.length > 0 && (
        <div className="streak-lb-podium">
          {podiumOrder.map((entry) => {
            const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
            return (
              <div key={entry.user_id} className="streak-lb-podium-entry">
                <span className="streak-lb-podium-medal">{medals[entry.rank] || `#${entry.rank}`}</span>
                <span className="streak-lb-podium-name">{entry.display_name || 'Ẩn danh'}</span>
                <span className="streak-lb-podium-streak">
                  <Flame size={14} />
                  {entry.longest_streak}
                </span>
                <span className="streak-lb-podium-label">cao nhất</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Highlight vị trí của user hiện tại nếu có */}
      {isAuthenticated && me && (
        <div className="streak-lb-me">
          <span className="streak-lb-me-rank">#{me.rank}</span>
          <span className="streak-lb-me-name">Bạn</span>
          <span className="streak-lb-me-streak">
            <Flame size={14} />
            {me.longest_streak} ngày
          </span>
        </div>
      )}

      {/* List entries (rank 4+) */}
      {restEntries.length > 0 && (
        <ol className="streak-lb-list">
          {restEntries.map((entry) => {
            const isMe = isAuthenticated && entry.user_id === userId;
            return (
              <li
                key={entry.user_id}
                className={`streak-lb-entry ${isMe ? 'streak-lb-entry--me' : ''}`}
              >
                <span className="streak-lb-rank">#{entry.rank}</span>
                <span className="streak-lb-name">{entry.display_name || 'Ẩn danh'}</span>
                <span className="streak-lb-streak">
                  <Flame size={14} />
                  <strong>{entry.longest_streak}</strong>
                  <small>cao nhất</small>
                </span>
                <span className="streak-lb-current">
                  {entry.current_streak} đang
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
