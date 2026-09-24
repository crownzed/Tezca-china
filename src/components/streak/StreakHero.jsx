import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Trophy, CalendarCheck } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';
import { useHaptics } from '../../hooks/useHaptics';
import { scheduleDailyReminder, cancelReminder, requestNotificationPermission } from '../../notifications';
import { WeekChain } from './WeekChain';
import { FlameCanvas3D } from './FlameCanvas3D';
import { StreakCelebration } from './StreakCelebration';
import { MilestoneBadges } from './MilestoneBadges';
import { HapticsToggle } from './HapticsToggle';
import { FreezeButton } from './FreezeButton';
import { LivingFlame } from './LivingFlame';

/**
 * Milestone definitions — ngưỡng streak đáng chú ý.
 */
const MILESTONES = [
  { days: 3, icon: '🔥', label: '3 ngày' },
  { days: 7, icon: '⚡', label: '1 tuần' },
  { days: 14, icon: '💎', label: '2 tuần' },
  { days: 30, icon: '🏆', label: '1 tháng' },
  { days: 60, icon: '👑', label: '2 tháng' },
  { days: 100, icon: '🌟', label: '100 ngày' },
  { days: 365, icon: '🐉', label: '1 năm' },
];

/**
 * StreakHero — Hero zone với flame, counter, week-chain, milestones.
 * Component chính của trang Streak (P0).
 *
 * @param {{
 *   currentStreak: number,
 *   longestStreak: number,
 *   studiedToday: boolean,
 *   broken: boolean,
 *   last7Days: boolean[],
 *   loading?: boolean,
 *   freezesRemaining?: number,
 *   onStudyComplete?: () => void,
 *   onFreezeUsed?: () => void,
 * }} props
 */
export function StreakHero({
  currentStreak = 0,
  longestStreak = 0,
  studiedToday = false,
  broken = false,
  last7Days = [],
  loading = false,
  freezesRemaining = 0,
  onStudyComplete,
  onFreezeUsed,
}) {
  const reducedMotion = useReducedMotion();
  const { triggerHaptic } = useHaptics();
  const [animate, setAnimate] = useState(false);
  const prevStreakRef = useRef(currentStreak);
  const [flameBurst, setFlameBurst] = useState(false);
  const flameBurstTimerRef = useRef(null);

  // M3-fix: Hourly tick so urgencyLevel recomputes when hour changes
  const [hourTick, setHourTick] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHourTick(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Trigger pulse animation + haptic khi streak tăng
  useEffect(() => {
    let timer;
    const frame = requestAnimationFrame(() => {
      const increased = currentStreak > prevStreakRef.current && currentStreak > 0;
      prevStreakRef.current = currentStreak;
      setAnimate(increased);
      if (!increased) return;

      triggerHaptic([15, 40, 20]); // Nhịp rung kép phản hồi haptic khi tăng streak
      timer = setTimeout(() => setAnimate(false), reducedMotion ? 150 : 1200);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [currentStreak, reducedMotion, triggerHaptic]);

  useEffect(() => () => clearTimeout(flameBurstTimerRef.current), []);

  // M2: Streak tier for dynamic color theming
  const streakTier = useMemo(() => {
    if (currentStreak >= 100) return 'golden';
    if (currentStreak >= 31) return 'inferno';
    if (currentStreak >= 8) return 'flame';
    return 'ember';
  }, [currentStreak]);

  // M3: Urgency level based on hour of day (loss aversion)
  const urgencyLevel = useMemo(() => {
    if (studiedToday) return 'none';
    const hour = hourTick; // use ticked hour, not snapshot
    if (hour >= 22) return 'critical'; // 10PM+
    if (hour >= 20) return 'high';     // 8PM
    if (hour >= 18) return 'medium';   // 6PM
    return 'none';
  }, [studiedToday, hourTick]);

  // Next milestone calculation
  const nextMilestone = MILESTONES.find(m => m.days > currentStreak) || null;
  const progressToNext = nextMilestone
    ? Math.min(100, Math.round((currentStreak / nextMilestone.days) * 100))
    : 100;

  // S4: Auto-schedule study reminder based on urgency level.
  // Request permission once, then schedule daily push at escalation hour.
  useEffect(() => {
    if (studiedToday || currentStreak === 0) {
      cancelReminder();
      return;
    }
    // Schedule reminder at the hour urgency kicks in
    const reminderTime = urgencyLevel === 'critical' ? '21:30'
      : urgencyLevel === 'high' ? '19:30'
      : '17:30'; // medium or none → early nudge

    let cancelled = false;
    requestNotificationPermission().then((perm) => {
      if (cancelled || perm !== 'granted') return;
      scheduleDailyReminder({
        time: reminderTime,
        title: '🔥 Đừng gãy streak!',
        body: `Chuỗi ${currentStreak} ngày đang chờ bạn. Học ngay để giữ lửa!`,
      });
    });

    return () => {
      cancelled = true;
      cancelReminder();
    };
  }, [studiedToday, currentStreak, urgencyLevel]);

  // ── Broken state (Dormant Ember - Than hồng âm ỉ, khích lệ tâm lý) ──
  if (broken && currentStreak === 0) {
    return (
      <div className="streak-hero streak-hero--broken streak-hero--dormant">
        <div className="streak-hero-broken">
          <div className="streak-hero-broken-icon streak-hero-dormant-icon" aria-hidden="true">
            <Flame size={40} className="dormant-flame-icon" />
            <span className="dormant-sparkle-dot" />
          </div>
          <h2>Than hồng vẫn sáng</h2>
          <p>Chuỗi tạm ngắt, nhưng tàn tro tri thức vẫn ấm. Học một bài hôm nay để thổi bùng lại ngọn lửa!</p>
          <div className="streak-hero-broken-action">
            {onStudyComplete && (
              <button className="btn-primary btn-rekindle" onClick={onStudyComplete}>
                <Flame size={18} /> Thổi bùng ngọn lửa
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="streak-hero streak-hero--loading" role="status" aria-label="Đang tải streak">
        <div className="streak-hero-main">
          <div className="streak-hero-flame streak-hero-flame--skeleton" aria-hidden="true" />
          <div className="streak-hero-count">
            <strong className="streak-hero-skeleton-num">—</strong>
            <span>ngày liên tiếp</span>
          </div>
        </div>
      </div>
    );
  }

  // S3: Tapped flame bursts are replaced and cancelled so each tap owns its animation.
  const handleFlameTap = () => {
    setFlameBurst(true);
    triggerHaptic([20, 30]); // Phản hồi rung xúc giác khi chạm vào ngọn lửa
    clearTimeout(flameBurstTimerRef.current);
    flameBurstTimerRef.current = setTimeout(() => {
      flameBurstTimerRef.current = null;
      setFlameBurst(false);
    }, 800);
  };

  // ── Active state ──
  return (
    <div
      className={`streak-hero ${animate ? 'streak-hero--pulse' : ''}`}
      role="region"
      aria-label={`Streak hiện tại: ${currentStreak} ngày liên tiếp`}
      data-streak-tier={streakTier}
      data-urgency={urgencyLevel !== 'none' ? urgencyLevel : undefined}
    >
      {/* Decorative background glow */}
      <div className="streak-hero-bg" aria-hidden="true" />

      {/* 3D particle overlay — hạt lửa 3D xoáy đối lưu sống động */}
      <FlameCanvas3D
        active={currentStreak > 0 || studiedToday}
        streakCount={currentStreak}
        triggerBurst={animate || flameBurst}
        studiedToday={studiedToday}
      />

      {/* Celebration confetti */}
      <StreakCelebration trigger={animate} />

      <div className="streak-hero-main">
        {/* LivingFlame: Ngọn lửa 3D đa tầng hữu cơ sống động */}
        <div className="streak-hero-flame-wrap">
          <LivingFlame
            studiedToday={studiedToday}
            currentStreak={currentStreak}
            tier={streakTier}
            onFlameTap={handleFlameTap}
          />
        </div>

        {/* Big counter with Odometer rolling numbers */}
        <div className="streak-hero-count">
          <OdometerCounter value={currentStreak} reducedMotion={reducedMotion} />
          <span>ngày liên tiếp</span>
        </div>

        {/* Screen reader announcement for streak changes — polite to not interrupt audio */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {animate && currentStreak > 0 && `Chuỗi học tập tăng lên ${currentStreak} ngày liên tiếp!`}
        </div>

        {/* Week chain visualization */}
        <WeekChain days={last7Days} urgency={urgencyLevel} />

        {/* Progress to next milestone */}
        {nextMilestone && (
          <div className="streak-hero-progress" role="progressbar" aria-valuenow={progressToNext} aria-valuemin={0} aria-valuemax={100}>
            <div className="streak-hero-progress-bar">
              <span style={{ width: `${progressToNext}%` }} />
            </div>
            <small>
              {nextMilestone.icon} {progressToNext}% đến {nextMilestone.label}
            </small>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="streak-hero-meta">
        <div className="streak-hero-stat">
          <Trophy size={20} />
          <div>
            <strong>{longestStreak}</strong>
            <small>Kỷ lục cá nhân</small>
          </div>
        </div>
        <div className="streak-hero-stat">
          <CalendarCheck size={20} />
          <div>
            <strong>{studiedToday ? '✓' : '—'}</strong>
            <small>Hôm nay</small>
          </div>
        </div>
      </div>

      {/* Milestone badges — dùng component riêng để có unlock animation */}
      <MilestoneBadges
        currentStreak={currentStreak}
        milestones={MILESTONES}
        previousStreak={currentStreak}
      />

      {/* S2: Haptics toggle — discoverable UI for vibration opt-out */}
      <HapticsToggle />

      {/* S3: Freeze button — protect streak when can't study today */}
      {currentStreak > 0 && (
        <FreezeButton
          freezesRemaining={freezesRemaining}
          studiedToday={studiedToday}
          onFreezeUsed={onFreezeUsed}
        />
      )}
    </div>
  );
}

/**
 * OdometerCounter — Hiệu ứng số lật/cuộn dọc khi streak thay đổi.
 * Tôn trọng prefers-reduced-motion (chuyển sang hiển thị tức thì).
 */
function OdometerCounter({ value, reducedMotion }) {
  const digits = String(value).split('');

  if (reducedMotion) {
    return (
      <strong className="odometer-static" aria-live="polite">
        {value}
      </strong>
    );
  }

  return (
    <div className="odometer-container" aria-live="polite" aria-label={`${value} ngày liên tiếp`}>
      <span className="sr-only">{value}</span>
      <div className="odometer-digits" aria-hidden="true">
        {digits.map((digit, idx) => (
          <div key={`${idx}-${digits.length}`} className="odometer-digit-col">
            <div
              className="odometer-ribbon"
              style={{
                transform: `translateY(-${parseInt(digit, 10) * 10}%)`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n} className="odometer-number">
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
