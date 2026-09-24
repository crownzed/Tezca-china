import { useCallback, useState } from 'react';
import { Vibrate, VibrateOff } from 'lucide-react';

/**
 * S2: Haptics toggle — discoverable UI cho audit finding.
 * Users có thể bật/tắt haptic feedback trực tiếp trong Streak page.
 *
 * Lưu ý: Toggle chỉ hiện trên thiết bị hỗ trợ vibration (pointer: coarse).
 * Desktop không rung nên không cần toggle.
 */
export function HapticsToggle() {
  // Chỉ render trên touch devices
  const [supported] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return !!navigator.vibrate && window.matchMedia('(pointer: coarse)').matches;
  });

  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('tezca_haptics') !== 'off';
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem('tezca_haptics', next ? 'on' : 'off');
    } catch {
      // localStorage unavailable
    }
    // Light tap feedback khi bật (chỉ khi vừa enable)
    if (next && navigator.vibrate) {
      try { navigator.vibrate([10]); } catch {
        // Vibration may fail when the browser or device blocks haptics.
      }
    }
  }, [enabled]);

  if (!supported) return null;

  return (
    <button
      className="haptics-toggle"
      onClick={toggle}
      aria-label={enabled ? 'Tắt rung phản hồi' : 'Bật rung phản hồi'}
      aria-pressed={enabled}
      title={enabled ? 'Rung phản hồi: Bật' : 'Rung phản hồi: Tắt'}
    >
      {enabled ? <Vibrate size={14} /> : <VibrateOff size={14} />}
      <span>{enabled ? 'Rung: Bật' : 'Rung: Tắt'}</span>
    </button>
  );
}
