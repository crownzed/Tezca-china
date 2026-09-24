import { useEffect, useRef, useState } from 'react';

/**
 * M8: SSE hook — nhận streak updates real-time từ server.
 *
 * @param {string | null} token - JWT token (null = skip SSE)
 * @returns {{ data: object | null, connected: boolean }}
 */
export function useStreakStream(token) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    if (!token) return;

    const baseUrl = import.meta.env.VITE_API_URL || '';
    const url = `${baseUrl}/api/streak/stream?token=${encodeURIComponent(token)}`;

    let es;
    let reconnectTimer;

    const connect = () => {
      es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryDelayRef.current = 1000; // Reset backoff on success
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.error) {
            // Auth error — stop retrying
            es.close();
            setConnected(false);
            return;
          }
          setData(parsed);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Exponential backoff: 1s → 2s → 4s → ... → max 30s
        const delay = Math.min(retryDelayRef.current, 30000);
        retryDelayRef.current *= 2;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      es?.close();
      esRef.current = null;
    };
  }, [token]);

  return { data, connected };
}
