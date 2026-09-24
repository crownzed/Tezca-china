import { useEffect, useState } from 'react';
import { useAuth } from '../auth-core';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

/**
 * Hook fetch leaderboard streak + pagination.
 * @param {{ limit?: number, tab?: 'all' | 'friends' }} opts
 */
export function useLeaderboard({ limit = 20, tab = 'all' } = {}) {
  const { userId, isAuthenticated } = useAuth();
  const [entries, setEntries] = useState([]);
  const [me, setMe] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const requestKey = `${isAuthenticated ? 'authenticated' : 'anonymous'}:${userId || ''}:${tab}:${limit}`;

  useEffect(() => {
    let cancelled = false;

    let token = '';
    try {
      const rawAuth = localStorage.getItem('tezca_auth');
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        token = parsed?.token || '';
      }
    } catch { /* corrupt data */ }

    const endpoint = tab === 'friends'
      ? `${API_BASE}/api/streak/leaderboard/friends?limit=${limit}`
      : `${API_BASE}/api/streak/leaderboard?limit=${limit}`;

    fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (!cancelled && json) {
          setEntries(json.entries || []);
          setMe(json.me || null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });

    return () => { cancelled = true; };
  }, [limit, tab, requestKey]);

  return { entries, me, loading: loadedKey !== requestKey, userId, isAuthenticated };
}
