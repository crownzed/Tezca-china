import { Flame } from 'lucide-react';

/**
 * LeaderboardList — Scrollable list cho rank 4+.
 * Virtualized-ready (có thể wrap với @tanstack/react-virtual sau).
 *
 * @param {{
 *   entries: Array,
 *   currentUserId?: string,
 * }} props
 */
export function LeaderboardList({ entries, currentUserId }) {
  if (!entries || entries.length === 0) return null;

  // Filter out top 3 (shown in podium)
  const listEntries = entries.filter(e => e.rank > 3);

  if (listEntries.length === 0) return null;

  return (
    <ol className="leaderboard-list" role="list" aria-label="Bảng xếp hạng streak">
      {listEntries.map((entry, i) => {
        const isMe = currentUserId && entry.user_id === currentUserId;
        const rankDelta = entry.rankDeltaWeek ?? 0;

        return (
          <li
            key={entry.user_id || entry.rank}
            className={`leaderboard-list-entry ${isMe ? 'leaderboard-list-entry--me' : ''}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Rank */}
            <span className="lb-rank">#{entry.rank}</span>

            {/* Avatar */}
            <div className="lb-avatar">
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" loading="lazy" />
              ) : (
                <span>{(entry.displayName || '?')[0].toUpperCase()}</span>
              )}
            </div>

            {/* Name + friend indicator */}
            <div className="lb-info">
              <span className="lb-name">
                {entry.displayName || 'Ẩn danh'}
                {entry.isFriend && <span className="lb-friend-tag">Bạn</span>}
              </span>
              {/* Badges inline */}
              {entry.badges?.length > 0 && (
                <span className="lb-badges">
                  {entry.badges.slice(0, 2).map((b, bi) => (
                    <span key={bi} title={b.label}>{b.icon}</span>
                  ))}
                </span>
              )}
            </div>

            {/* Streak */}
            <span className="lb-streak">
              <Flame size={14} />
              <strong>{entry.currentStreak ?? entry.longest_streak ?? 0}</strong>
            </span>

            {/* Rank delta */}
            <span className={`lb-delta ${rankDeltaClass(rankDelta)}`}>
              {rankDelta > 0 ? `↑${rankDelta}` : rankDelta < 0 ? `↓${Math.abs(rankDelta)}` : '—'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function rankDeltaClass(delta) {
  if (delta > 0) return 'lb-delta--up';
  if (delta < 0) return 'lb-delta--down';
  return 'lb-delta--same';
}
