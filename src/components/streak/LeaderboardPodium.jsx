import { useState } from 'react';
import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';

/**
 * LeaderboardPodium — Top 3 podium với parallax tilt effect.
 * Center (#1) cao nhất, hai bên thấp hơn.
 *
 * @param {{ entries: Array<PodiumEntry>, onEntryClick?: (entry) => void }} props
 */

export function LeaderboardPodium({ entries, onEntryClick }) {
  const reducedMotion = useReducedMotion();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Render in rank order for screen readers; CSS grid-area handles visual positioning
  const podiumEntries = [1, 2, 3]
    .map(rank => entries.find(e => e.rank === rank))
    .filter(Boolean);

  const handleMouseMove = (e) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({ x: y * -8, y: x * 8 }); // max 8deg tilt
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const handleTouchMove = (e) => {
    if (reducedMotion || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((touch.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((touch.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({ x: y * -6, y: x * 6 });
  };

  const handleTouchEnd = () => {
    setTilt({ x: 0, y: 0 });
  };

  if (podiumEntries.length === 0) return null;

  return (
    <div
      className="leaderboard-podium"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={!reducedMotion ? {
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 100ms ease-out',
      } : undefined}
      role="list"
      aria-label="Top 3 bảng xếp hạng streak"
    >
      {podiumEntries.map((entry) => {
        const isCenter = entry.rank === 1;
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const rankDelta = entry.rankDeltaWeek ?? 0;
        // Stagger delay by rank for entrance animation
        const staggerDelay = entry.rank === 1 ? 0 : entry.rank === 2 ? 100 : 200;

        return (
          <div
            key={entry.user_id || entry.rank}
            className={[
              'podium-entry',
              isCenter ? 'podium-entry--first' : '',
              entry.rank === 2 ? 'podium-entry--rank2' : '',
              entry.rank === 3 ? 'podium-entry--rank3' : '',
            ].filter(Boolean).join(' ')}
            role="listitem"
            onClick={() => onEntryClick?.(entry)}
            tabIndex={onEntryClick ? 0 : undefined}
            onKeyDown={onEntryClick ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEntryClick(entry);
              }
            } : undefined}
            style={!reducedMotion ? { animationDelay: `${staggerDelay}ms` } : undefined}
          >
            {/* Rank delta indicator */}
            <span className={`podium-delta ${rankDeltaClass(rankDelta)}`}>
              {rankDeltaIcon(rankDelta)}
              {Math.abs(rankDelta) > 0 && Math.abs(rankDelta)}
            </span>

            {/* Medal — emoji hidden from screen readers, text alternative provided */}
            <span className="podium-medal">
              <span aria-hidden="true">{medals[entry.rank] || `#${entry.rank}`}</span>
              <span className="sr-only">Hạng {entry.rank}</span>
            </span>

            {/* Avatar placeholder with Halo for Rank 1 */}
            <div className="podium-avatar">
              {isCenter && <span className="podium-avatar-halo" aria-hidden="true" />}
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" loading="lazy" />
              ) : (
                <span>{(entry.displayName || '?')[0].toUpperCase()}</span>
              )}
            </div>

            {/* Name */}
            <span className="podium-name">
              {entry.displayName || 'Ẩn danh'}
            </span>

            {/* Streak count */}
            <span className="podium-streak">
              <Flame size={14} />
              <strong>{entry.currentStreak ?? entry.longest_streak ?? 0}</strong>
            </span>

            {/* Badges row */}
            {entry.badges?.length > 0 && (
              <div className="podium-badges">
                {entry.badges.slice(0, 3).map((badge, bi) => (
                  <span key={bi} className="podium-badge" title={badge.label}>
                    {badge.icon}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ──

function rankDeltaClass(delta) {
  if (delta > 0) return 'podium-delta--up';
  if (delta < 0) return 'podium-delta--down';
  return 'podium-delta--same';
}

function rankDeltaIcon(delta) {
  if (delta > 0) return <TrendingUp size={12} />;
  if (delta < 0) return <TrendingDown size={12} />;
  return <Minus size={12} />;
}
