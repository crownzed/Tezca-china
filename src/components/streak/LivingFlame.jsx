import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';
import { consumeBurst, getFlameScale } from './flame-visual';

/**
 * LivingFlame — Native SVG/CSS flame with a stable interaction stage.
 * Interaction stays in the DOM so the visual supports keyboard, touch, and focus.
 *
 * @param {{
 *   studiedToday: boolean,
 *   currentStreak: number,
 *   tier?: 'ember' | 'flame' | 'inferno' | 'golden',
 *   burstId?: number,
 *   onFlameTap?: () => void,
 * }} props
 */
export function LivingFlame({
  studiedToday = false,
  currentStreak = 0,
  tier = 'ember',
  burstId = 0,
  onFlameTap,
}) {
  const reducedMotion = useReducedMotion();
  const [isFlaring, setIsFlaring] = useState(false);
  const [flareId, setFlareId] = useState(0);
  const flareTimerRef = useRef(null);
  const burstWatermarkRef = useRef(consumeBurst(0, burstId));
  const pendingTapBurstRef = useRef(null);
  const svgId = useId();

  const triggerFlare = useCallback(() => {
    if (reducedMotion) return;
    clearTimeout(flareTimerRef.current);
    setFlareId((previous) => previous + 1);
    setIsFlaring(true);
    flareTimerRef.current = setTimeout(() => {
      flareTimerRef.current = null;
      setIsFlaring(false);
    }, 800);
  }, [reducedMotion]);

  useEffect(() => () => clearTimeout(flareTimerRef.current), []);

  // The parent increments burstId for streak increases and taps. Seed the
  // watermark from the current ID so mounting never replays an old event.
  useEffect(() => {
    const nextBurst = consumeBurst(burstWatermarkRef.current, burstId);
    if (nextBurst === burstWatermarkRef.current) return;
    burstWatermarkRef.current = nextBurst;
    if (pendingTapBurstRef.current === nextBurst) {
      pendingTapBurstRef.current = null;
      return;
    }
    pendingTapBurstRef.current = null;
    triggerFlare();
  }, [burstId, triggerFlare]);

  const handleTap = () => {
    onFlameTap?.();
    if (reducedMotion) return;

    // The parent will echo this tap as the next burst ID. Mark that echo so
    // the event is animated once here rather than once here and once again
    // when the parent re-renders.
    const anticipatedBurst = burstId + 1;
    pendingTapBurstRef.current = Number.isSafeInteger(anticipatedBurst)
      ? anticipatedBurst
      : null;
    triggerFlare();
  };

  const isActive = currentStreak > 0 || studiedToday;
  const flameScale = getFlameScale(currentStreak);

  return (
    <div
      className={[
        'living-flame-container',
        isActive ? 'living-flame--active' : 'living-flame--idle',
        studiedToday ? 'living-flame--burning' : 'living-flame--waiting',
        isFlaring && !reducedMotion ? 'living-flame--flare' : '',
        `living-flame--tier-${tier}`,
      ].filter(Boolean).join(' ')}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-label="Ngọn lửa chuỗi ngày học — bấm để thổi bùng lửa"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) handleTap();
        }
      }}
    >
      <div
        className="living-flame-visual"
        aria-hidden="true"
        style={{ '--living-flame-scale': flameScale }}
      >
        <div className="living-flame-corona" />
        <div className="living-flame-aura" />

        <div className="living-flame-artwork">
          <svg viewBox="0 0 120 150" className="living-flame-svg" focusable="false">
            <defs>
              <linearGradient id={`${svgId}-body`} gradientUnits="userSpaceOnUse" x1="35" y1="24" x2="82" y2="126">
                <stop offset="0%" stopColor="var(--mascot-fire-top, #ff4424)" />
                <stop offset="100%" stopColor="var(--mascot-fire-base, #f66e19)" />
              </linearGradient>
              <linearGradient id={`${svgId}-face`} x1="30%" y1="0%" x2="65%" y2="100%">
                <stop offset="0%" stopColor="#ffbb46" />
                <stop offset="100%" stopColor="#ff8a21" />
              </linearGradient>
              <linearGradient id={`${svgId}-limb`} x1="0%" y1="0%" x2="75%" y2="100%">
                <stop offset="0%" stopColor="var(--mascot-fire-base, #f66e19)" />
                <stop offset="100%" stopColor="#ff9a26" />
              </linearGradient>
              <linearGradient id={`${svgId}-pupil`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="65%" stopColor="#35211c" />
                <stop offset="100%" stopColor="#93411d" />
              </linearGradient>
              <radialGradient id={`${svgId}-shadow`}>
                <stop offset="0%" stopColor="#9a421d" stopOpacity="0.24" />
                <stop offset="75%" stopColor="#9a421d" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#9a421d" stopOpacity="0" />
              </radialGradient>
            </defs>

            <ellipse className="living-flame-mascot-shadow" cx="60" cy="143" rx="40" ry="5.5" fill={`url(#${svgId}-shadow)`} />

            <g className="living-flame-mascot">
              <path
                className="living-flame-mascot-leg living-flame-mascot-leg--left"
                d="M 42 115 C 41 124, 42 132, 38 135 C 33 138, 35 142, 42 142
                   C 48 142, 52 140, 52 136 L 55 116 Z"
                fill={`url(#${svgId}-limb)`}
              />
              <path
                className="living-flame-mascot-leg living-flame-mascot-leg--right"
                d="M 65 116 L 66 136 C 66 141, 71 142, 78 142
                   C 85 142, 86 138, 81 135 L 78 115 Z"
                fill={`url(#${svgId}-limb)`}
              />

              <g className="living-flame-mascot-body">
                <path
                  className="living-flame-mascot-arm living-flame-mascot-arm--left"
                  d="M 27 86 C 18 87, 13 100, 12 112 C 11 123, 15 130, 23 128
                     C 29 127, 31 122, 29 117 C 27 112, 28 107, 32 101 Z"
                  fill={`url(#${svgId}-body)`}
                />
                <path
                  className="living-flame-mascot-arm living-flame-mascot-arm--right"
                  d="M 94 88 C 102 93, 106 105, 108 115 C 111 126, 105 132, 98 132
                     C 92 132, 88 127, 90 123 C 92 120, 94 123, 96 124
                     C 97 118, 91 110, 88 104 Z"
                  fill={`url(#${svgId}-limb)`}
                />

                {/* Overlapping tips keep a continuous silhouette as they flicker. */}
                <g fill={`url(#${svgId}-body)`}>
                  <path
                    className="living-flame-mascot-tip living-flame-mascot-tip--left"
                    d="M 27 62 C 29 47, 32 31, 38 22 C 42 33, 49 34, 51 49 L 46 67 Z"
                  />
                  <path
                    className="living-flame-mascot-tip living-flame-mascot-tip--center"
                    d="M 43 53 C 44 32, 59 25, 65 9 C 72 23, 70 34, 80 45 L 80 65 Z"
                  />
                  <path
                    className="living-flame-mascot-tip living-flame-mascot-tip--right"
                    d="M 74 61 C 78 46, 85 38, 92 28 C 91 44, 96 55, 99 69 L 86 80 Z"
                  />
                  <path
                    className="living-flame-mascot-outer"
                    d="M 60 125 C 37 125, 22 117, 19 100 C 17 86, 23 70, 27 59
                       C 30 50, 34 41, 43 43 C 51 44, 57 34, 66 39
                       C 73 42, 76 49, 83 47 C 90 44, 95 56, 99 70
                       C 106 87, 105 104, 94 115 C 86 123, 76 125, 60 125 Z"
                  />
                </g>

                <path
                  className="living-flame-mascot-inner"
                  d="M 61 119 C 42 119, 29 110, 29 93 C 29 79, 36 74, 41 64
                     C 44 59, 44 53, 46 49 C 51 55, 52 61, 55 64
                     C 58 56, 63 48, 65 44 C 68 55, 68 61, 73 66
                     C 77 61, 79 58, 80 54 C 81 67, 90 79, 91 93
                     C 93 109, 80 119, 61 119 Z"
                  fill={`url(#${svgId}-face)`}
                />

                <g className="living-flame-mascot-face">
                  <g className="living-flame-mascot-brows" fill="none" stroke="#7c2d1d" strokeWidth="3.8" strokeLinecap="round">
                    <path d="M 33 63 Q 41 57, 49 61" />
                    <path d="M 70 60 Q 78 57, 85 63" />
                  </g>

                  <g className="living-flame-mascot-eye living-flame-mascot-eye--left">
                    <ellipse cx="43" cy="83" rx="12.5" ry="16.5" fill="#fffdf2" />
                    <ellipse cx="45" cy="82" rx="8.5" ry="12.5" fill={`url(#${svgId}-pupil)`} />
                    <ellipse cx="43.5" cy="77" rx="4" ry="4.8" fill="#ffffff" />
                    <circle cx="48" cy="88" r="2" fill="#ffffff" />
                  </g>
                  <g className="living-flame-mascot-eye living-flame-mascot-eye--right">
                    <ellipse cx="77" cy="82" rx="12.5" ry="16.5" fill="#fffdf2" />
                    <ellipse cx="75" cy="81" rx="8.5" ry="12.5" fill={`url(#${svgId}-pupil)`} />
                    <ellipse cx="73.5" cy="76" rx="4" ry="4.8" fill="#ffffff" />
                    <circle cx="78" cy="87" r="2" fill="#ffffff" />
                  </g>

                  <g className="living-flame-mascot-mouth">
                    <path d="M 53 103 Q 60 107, 69 100 C 69 116, 55 117, 53 103 Z" fill="#842a1c" />
                    <path d="M 57 111 Q 62 107, 67 109 C 65 114, 59 115, 57 111 Z" fill="#f87945" />
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>

        <span key={flareId} className="living-flame-shockwave" />
      </div>
    </div>
  );
}
