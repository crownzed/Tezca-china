import { useState } from 'react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';

/**
 * LivingFlame — Ngọn lửa sống động đa tầng (Organic Multi-Layer Flame).
 *
 * Cấu trúc gồm:
 * 1. Radiant Aura / Corona (Quầng sáng nhiệt tỏa tròn nhiều lớp)
 * 2. Back Fire Tongue (Lớp lửa ngoài vươn cao với gradient đỏ-cam)
 * 3. Mid Blazing Core (Lớp lửa giữa vàng hoàng kim sống động)
 * 4. White-Hot Hearth (Lõi lửa nhiệt độ cao màu trắng - vàng chanh)
 * 5. Micro Spark Licks (Các lưỡi lửa nhỏ bốc lên)
 * 6. Tap / Hover Interaction: Chạm để làm bùng lửa kèm hiệu ứng flare
 *
 * @param {{
 *   studiedToday: boolean,
 *   currentStreak: number,
 *   tier?: 'ember' | 'flame' | 'inferno' | 'golden',
 *   onFlameTap?: () => void,
 * }} props
 */
export function LivingFlame({
  studiedToday = false,
  currentStreak = 0,
  tier = 'flame',
  onFlameTap,
}) {
  const reducedMotion = useReducedMotion();
  const [isFlaring, setIsFlaring] = useState(false);

  const handleTap = () => {
    if (reducedMotion) return;
    setIsFlaring(true);
    onFlameTap?.();
    setTimeout(() => setIsFlaring(false), 800);
  };

  const isActive = currentStreak > 0;

  return (
    <div
      className={[
        'living-flame-container',
        isActive ? 'living-flame--active' : 'living-flame--idle',
        studiedToday ? 'living-flame--burning' : 'living-flame--waiting',
        isFlaring ? 'living-flame--flare' : '',
        `living-flame--tier-${tier}`,
      ].filter(Boolean).join(' ')}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-label="Ngọn lửa chuỗi ngày học — bấm để thổi bùng lửa"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
    >
      {/* 1. Ambient Thermal Corona (Hào quang nhiệt tỏa tròn) */}
      <div className="living-flame-corona" aria-hidden="true" />
      <div className="living-flame-aura" aria-hidden="true" />

      {/* 2. Multi-layer Organic SVG Flame */}
      <svg
        viewBox="0 0 120 150"
        className="living-flame-svg"
        aria-hidden="true"
      >
        <defs>
          {/* Gradients cho từng tầng lửa theo nhiệt độ */}
          <linearGradient id="flame-outer-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--streak-fire-to, #991b1b)" />
            <stop offset="45%" stopColor="var(--streak-fire-from, #c2410c)" />
            <stop offset="85%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="flame-mid-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ea580c" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="85%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="flame-core-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>

          {/* Glow filter cho tia lửa */}
          <filter id="flame-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tầng 1: Lưỡi lửa nền phía sau (Back Swaying Tongue) */}
        <path
          className="living-flame-path living-flame-path--back"
          d="M 60 142
             C 32 142, 14 118, 18 86
             C 21 62, 38 46, 44 26
             C 48 40, 56 48, 60 38
             C 65 24, 62 12, 60 0
             C 74 16, 82 34, 82 52
             C 82 60, 78 68, 86 74
             C 96 82, 104 96, 102 114
             C 100 134, 84 142, 60 142 Z"
          fill="url(#flame-outer-grad)"
          filter="url(#flame-glow)"
        />

        {/* Tầng 2: Thân lửa giữa bốc cháy mạnh mẽ (Mid Blazing Tongue) */}
        <path
          className="living-flame-path living-flame-path--mid"
          d="M 60 138
             C 40 138, 26 120, 29 95
             C 31 75, 45 62, 50 44
             C 53 54, 58 60, 62 52
             C 66 40, 65 30, 63 18
             C 75 32, 80 48, 80 64
             C 80 72, 76 78, 83 85
             C 91 93, 93 108, 90 120
             C 87 134, 76 138, 60 138 Z"
          fill="url(#flame-mid-grad)"
        />

        {/* Tầng 3: Lõi lửa trắng sáng nhiệt độ cực cao (White-Hot Core) */}
        <path
          className="living-flame-path living-flame-path--core"
          d="M 60 132
             C 47 132, 38 120, 40 102
             C 42 88, 51 78, 55 64
             C 57 71, 61 74, 63 68
             C 66 59, 64 51, 62 42
             C 71 52, 74 65, 74 76
             C 74 88, 70 96, 75 102
             C 78 107, 79 116, 77 123
             C 74 130, 68 132, 60 132 Z"
          fill="url(#flame-core-grad)"
        />

        {/* Tầng 4: Lưỡi than nhảy múa (Dancing Hot Teardrop Hearth) */}
        <ellipse
          className="living-flame-hearth"
          cx="60"
          cy="116"
          rx="12"
          ry="16"
          fill="#ffffff"
          opacity="0.85"
        />

        {/* Lưỡi than siêu nhỏ phụ phụt lên */}
        <circle
          className="living-flame-spark living-flame-spark--1"
          cx="58"
          cy="28"
          r="2.5"
          fill="#fde047"
        />
        <circle
          className="living-flame-spark living-flame-spark--2"
          cx="70"
          cy="42"
          r="1.8"
          fill="#f97316"
        />
        <circle
          className="living-flame-spark living-flame-spark--3"
          cx="48"
          cy="50"
          r="2"
          fill="#fbbf24"
        />
      </svg>

      {/* Vòng tia hàn năng lượng khi bấm vào ngọn lửa */}
      <span className="living-flame-shockwave" aria-hidden="true" />
    </div>
  );
}
