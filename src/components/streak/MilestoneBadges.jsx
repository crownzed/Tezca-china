import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';

/**
 * MilestoneBadges — Horizontal badge row với unlock animations.
 * Hiển thị các mốc thành tích streak, animate khi đạt mốc mới.
 *
 * @param {{
 *   currentStreak: number,
 *   milestones?: Array<{ days: number, icon: string, label: string }>,
 *   previousStreak?: number,
 * }} props
 */

const DEFAULT_MILESTONES = [
  { days: 3, icon: '🔥', label: '3 ngày' },
  { days: 7, icon: '⚡', label: '1 tuần' },
  { days: 14, icon: '💎', label: '2 tuần' },
  { days: 30, icon: '🏆', label: '1 tháng' },
  { days: 60, icon: '👑', label: '2 tháng' },
  { days: 100, icon: '🌟', label: '100 ngày' },
  { days: 365, icon: '🐉', label: '1 năm' },
];

export function MilestoneBadges({
  currentStreak,
  milestones = DEFAULT_MILESTONES,
  previousStreak = 0,
}) {
  const reducedMotion = useReducedMotion();
  const [justUnlocked, setJustUnlocked] = useState(null);
  const prevRef = useRef(previousStreak);

  // Detect newly unlocked milestone
  useEffect(() => {
    if (currentStreak <= prevRef.current) {
      prevRef.current = currentStreak;
      return;
    }

    const newlyUnlocked = milestones.find(
      m => currentStreak >= m.days && prevRef.current < m.days
    );

    if (newlyUnlocked) {
      setJustUnlocked(newlyUnlocked.days);
      const timer = setTimeout(() => setJustUnlocked(null), reducedMotion ? 150 : 1500);
      prevRef.current = currentStreak;
      return () => clearTimeout(timer);
    }

    prevRef.current = currentStreak;
  }, [currentStreak, milestones, reducedMotion]);

  return (
    <div
      className="milestone-badges"
      role="list"
      aria-label="Mốc thành tích streak"
    >
      {milestones.map(m => {
        const reached = currentStreak >= m.days;
        const isNewUnlock = justUnlocked === m.days;
        const progress = Math.min(100, Math.round((currentStreak / m.days) * 100));

        return (
          <div
            key={m.days}
            className={[
              'milestone-badge',
              reached ? 'milestone-badge--reached' : 'milestone-badge--locked',
              isNewUnlock ? 'milestone-badge--unlocking' : '',
            ].filter(Boolean).join(' ')}
            role="listitem"
            aria-label={`${m.label}: ${reached ? 'đã đạt' : `${100 - progress}% còn lại`}`}
            title={reached ? `Đã đạt ${m.label}!` : `Còn ${m.days - currentStreak} ngày`}
          >
            {/* Badge face — front */}
            <div className="milestone-badge-face milestone-badge-face--front">
              <span className="milestone-badge-icon" aria-hidden="true">{m.icon}</span>
              <span className="milestone-badge-label">{m.label}</span>
            </div>

            {/* Progress ring for locked badges */}
            {!reached && (
              <svg
                className="milestone-badge-ring"
                viewBox="0 0 36 36"
                aria-hidden="true"
              >
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.1" />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${progress} 100`}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
            )}

            {/* Unlock sparkle effect */}
            {isNewUnlock && !reducedMotion && (
              <div className="milestone-badge-sparkle" aria-hidden="true">
                <span /><span /><span /><span /><span /><span />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
