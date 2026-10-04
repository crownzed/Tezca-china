import { useEffect, useState } from 'react';

/**
 * Hook phát hiện prefers-reduced-motion.
 * Cập nhật real-time khi user thay đổi setting OS.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * Hook phát hiện WebGL2 availability.
 * Three.js 0.185 / React Three Fiber requires WebGL2 for its renderer.
 */
export function useWebGLSupport() {
  const [supported] = useState(() => {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      const available = Boolean(gl);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return available;
    } catch {
      return false;
    }
  });

  return supported;
}

/**
 * Hook đếm số hardware concurrency cho particle count scaling.
 */
export function useHardwareTier() {
  const [tier] = useState(() => {
    if (typeof navigator === 'undefined') return 'high';
    const cores = navigator.hardwareConcurrency || 4;
    if (cores <= 2) return 'low';
    if (cores <= 4) return 'medium';
    return 'high';
  });

  return tier;
}
