// Call status bar — timer and optional session-expiry warning.
// Buffer size is NOT a network-quality measurement. Realtime never reconnects.

import { useState, useEffect } from 'react';

function CallTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  return <span style={styles.timer}>{minutes}:{seconds}</span>;
}

/**
 * CallStatusBar
 *
 * Props:
 *   isActive: boolean — call đang diễn ra
 *   mode: 'pipeline' | 'realtime'
 *   sessionRemainingSec: number | null — giây còn lại trước khi session hết hạn
 */
export function CallStatusBar({
  isActive = false,
  mode = 'pipeline',
  sessionRemainingSec = null,
}) {
  const showWarning = Number.isFinite(sessionRemainingSec) && sessionRemainingSec <= 300;
  const warningMin = showWarning ? Math.max(0, Math.ceil(sessionRemainingSec / 60)) : 0;

  if (!isActive) return null;

  return (
    <div style={styles.bar}>
      <CallTimer />
      <span style={styles.quality}>
        {mode === 'realtime' ? 'Realtime (thử nghiệm)' : 'Pipeline'} · Đã kết nối
      </span>

      {showWarning && (
        <span style={styles.warning}>
          Còn {warningMin} phút
        </span>
      )}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '6px 16px',
    fontSize: '13px',
    fontFamily: 'monospace',
    color: '#a6adc8',
    background: '#181825',
    borderRadius: '8px',
    flexWrap: 'wrap',
  },
  timer: {
    fontWeight: 'bold',
    color: '#cdd6f4',
    fontSize: '15px',
  },
  quality: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  warning: {
    color: '#f9e2af',
    fontWeight: 'bold',
    animation: 'pulse 2s ease-in-out infinite',
  },
};
