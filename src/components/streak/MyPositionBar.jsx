import { Flame, Trophy } from 'lucide-react';

/**
 * MyPositionBar — Sticky bottom bar hiển thị rank của user hiện tại.
 * Luôn visible khi scroll leaderboard.
 *
 * @param {{
 *   me: { rank: number, currentStreak: number, longestStreak: number, displayName?: string } | null,
 *   isAuthenticated: boolean,
 * }} props
 */
export function MyPositionBar({ me, isAuthenticated }) {
  if (!isAuthenticated || !me) return null;

  const rankDelta = me.rankDeltaWeek ?? 0;

  return (
    <div
      className="my-position-bar"
      role="status"
      aria-label={`Vị trí của bạn: hạng ${me.rank}`}
    >
      <span className="my-pos-rank">
        <Trophy size={16} />
        <strong>#{me.rank}</strong>
      </span>

      <span className="my-pos-name">Bạn</span>

      <span className="my-pos-streak">
        <Flame size={14} />
        <strong>{me.currentStreak ?? me.longest_streak ?? 0}</strong>
        <small>ngày</small>
      </span>

      {/* Near-miss motivation framing */}
      <span className="my-pos-nearmiss">
        {me.rank === 1
          ? '👑 Đang dẫn đầu bảng!'
          : me.rank <= 3
          ? '🥇 Đang giữ vững Top 3!'
          : me.rank <= 10
          ? `⚡ Chỉ kém #${me.rank - 1} một bước để bứt phá!`
          : `🔥 Tiến sát #${me.rank - 1}!`}
      </span>

      {rankDelta !== 0 && (
        <span className={`my-pos-delta ${rankDelta > 0 ? 'my-pos-delta--up' : 'my-pos-delta--down'}`}>
          {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
        </span>
      )}
    </div>
  );
}
