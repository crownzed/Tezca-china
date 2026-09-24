import { useCallback, useRef } from 'react';

/**
 * Hook cung cấp haptic feedback cho mobile devices.
 * Chỉ trigger trên touch devices (pointer: coarse) và khi user chưa disable.
 *
 * @returns {{ triggerHaptic: (pattern?: number[]) => void }}
 */
export function useHaptics() {
  const supportedRef = useRef(null);

  // Lazy-detect support on first call
  const isSupported = () => {
    if (supportedRef.current !== null) return supportedRef.current;
    if (typeof navigator === 'undefined' || !navigator.vibrate) {
      supportedRef.current = false;
      return false;
    }
    // Only enable on touch devices
    supportedRef.current = window.matchMedia('(pointer: coarse)').matches;
    return supportedRef.current;
  };

  const triggerHaptic = useCallback((pattern = [10]) => {
    if (!isSupported()) return;

    // Check user preference (opt-out via localStorage)
    try {
      if (localStorage.getItem('tezca_haptics') === 'off') return;
    } catch {
      // localStorage unavailable — proceed with haptic
    }

    try {
      navigator.vibrate(pattern);
    } catch {
      // vibrate not supported or blocked — silent fail
    }
  }, []);

  return { triggerHaptic };
}
