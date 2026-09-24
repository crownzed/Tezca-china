import { useStreakData } from './useStreakData';

/** Streak fields used by the compact header display. */
export function useStreak() {
  const { currentStreak, longestStreak, studiedToday, broken, loading } = useStreakData();
  return { currentStreak, longestStreak, studiedToday, broken, loading };
}
