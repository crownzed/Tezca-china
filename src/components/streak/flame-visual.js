export function getStreakTier(currentStreak) {
  if (currentStreak >= 100) return 'golden';
  if (currentStreak >= 31) return 'inferno';
  if (currentStreak >= 8) return 'flame';
  return 'ember';
}

// Keep the hit area stable while the artwork grows with the streak.
export function getFlameScale(currentStreak) {
  const streak = Number.isFinite(currentStreak)
    ? Math.max(0, currentStreak)
    : 0;
  return 0.42 + 0.58 * Math.min(
    1,
    Math.log1p(streak) / Math.log1p(365),
  );
}

// A null baseline means the first load has not completed yet.
export function getStreakTransition(previousStreak, currentStreak, loading) {
  return {
    baseline: loading ? previousStreak : currentStreak,
    increased: !loading && previousStreak !== null
      && currentStreak > previousStreak && currentStreak > 0,
  };
}

// Falling/reset values are not new events; a freshly mounted scene starts at its current ID.
export function consumeBurst(previous, next) {
  return Number.isSafeInteger(next) && next > previous ? next : previous;
}

export function clampFlameDelta(delta) {
  return Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
}

export function getFlameVisualState({
  active,
  studiedToday = false,
  hardwareTier,
  reducedMotion,
  webglSupported,
  failed = false,
  modelReady = false,
  inView = true,
  pageVisible = true,
}) {
  const use3D = Boolean(active && webglSupported && !reducedMotion && hardwareTier !== 'low' && !failed);
  const showModel = use3D && modelReady;
  return {
    use3D,
    showModel,
    running: use3D && inView && pageVisible,
    particleCount: use3D ? Math.round((hardwareTier === 'medium' ? 55 : 95) * (studiedToday ? 1.4 : 1)) : 0,
    fallbackEmbers: active && !reducedMotion && !showModel ? (studiedToday ? 8 : 6) : 0,
  };
}
