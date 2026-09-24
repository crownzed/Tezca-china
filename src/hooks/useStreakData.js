import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth-core';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

/**
 * Hook lấy thông tin streak hiện tại của user + last 7 days cho WeekChain.
 * @returns {{ currentStreak, longestStreak, studiedToday, broken, loading, last7Days, refresh }}
 */
export function useStreakData() {
  const { userId, isAuthenticated } = useAuth();
  const [data, setData] = useState({
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    studied_today: false,
    broken: false,
    last_7_days: [],
  });
  const [loadedKey, setLoadedKey] = useState(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const shouldFetch = Boolean(isAuthenticated && userId && userId !== 'local-user');
  const requestKey = `${isAuthenticated ? 'authenticated' : 'anonymous'}:${userId || ''}:${requestVersion}`;

  const fetchStreak = useCallback(() => {
    setRequestVersion(version => version + 1);
  }, []);

  useEffect(() => {
    if (!shouldFetch) return undefined;

    let cancelled = false;
    const rawAuth = localStorage.getItem('tezca_auth');
    let token = '';
    try {
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        token = parsed?.token || '';
      }
    } catch { /* corrupt data */ }

    fetch(`${API_BASE}/api/streak/current`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });

    return () => { cancelled = true; };
  }, [requestKey, shouldFetch]);

  const last7Days = (() => {
    if (Array.isArray(data.last_7_days) && data.last_7_days.length === 7) {
      return data.last_7_days.map(Boolean);
    }
    const days = Array(7).fill(false);
    days[6] = Boolean(data.studied_today);
    return days;
  })();

  return {
    currentStreak: data.current_streak,
    longestStreak: data.longest_streak,
    studiedToday: data.studied_today,
    broken: data.broken,
    loading: shouldFetch && loadedKey !== requestKey,
    last7Days,
    refresh: fetchStreak,
  };
}
