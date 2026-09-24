import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion, useWebGLSupport, useHardwareTier } from '../../hooks/useMotionPrefs';

/**
 * FlameCanvas3D — R3F particle overlay cho streak hero.
 * Floating ember particles khi streak active, burst khi tăng streak.
 *
 * M1: CSS fallback là default renderer. Chỉ escalate lên R3F khi
 * particle count > 150 hoặc cần 3D interaction. Giảm ~200KB gzipped
 * cho decorative effect.
 *
 * Fallback tiers:
 * 1. CSS-only embers (default cho ≤150 particles)
 * 2. WebGL + R3F available VÀ particleCount > 150 → Three.js Points
 * 3. No WebGL / reduced-motion → CSS-only embers
 *
 * @param {{
 *   active: boolean,
 *   streakCount: number,
 *   triggerBurst: boolean,
 * }} props
 */
export function FlameCanvas3D({ active, streakCount, triggerBurst, studiedToday = false }) {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebGLSupport();
  const tier = useHardwareTier();
  const burstKey = triggerBurst ? 1 : 0;

  // Particle count theo hardware tier và trạng thái học hôm nay
  const particleCount = useMemo(() => {
    if (reducedMotion || !active) return 0;
    const boost = studiedToday ? 1.4 : 1.0;
    switch (tier) {
      case 'low': return Math.round(25 * boost);
      case 'medium': return Math.round(55 * boost);
      default: return Math.round(95 * boost);
    }
  }, [reducedMotion, active, tier, studiedToday]);

  // Trigger burst effect through a render-stable key; the particle scene owns the imperative simulation.
  const containerRef = useRef(null);
  const [inView, setInView] = useState(true);

  // IntersectionObserver ngắt rendering khi cuộn ra ngoài viewport để tiết kiệm pin/GPU
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
    }, { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Không active hoặc ra khỏi tầm nhìn → không render gì ──
  if (!active || particleCount === 0 || !inView) {
    return <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
  }

  // Kích hoạt R3F khi WebGL khả dụng, không giảm chuyển động, và thiết bị không phải low-tier
  const useR3F = webglSupported && !reducedMotion && tier !== 'low';

  if (!useR3F) {
    return (
      <div ref={containerRef} className="flame-canvas-fallback" aria-hidden="true">
        {Array(Math.min(8, streakCount)).fill(null).map((_, i) => (
          <span
            key={i}
            className="flame-ember-css"
            style={{
              left: `${30 + ((i * 37) % 40)}%`,
              animationDelay: `${i * 150}ms`,
              animationDuration: `${1500 + (i * 173) % 1000}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flame-canvas-3d"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <Suspense fallback={null}>
        <R3FParticleScene
          key={particleCount}
          particleCount={particleCount}
          burstKey={burstKey}
        />
      </Suspense>
    </div>
  );
}

// Lazy-load R3F components để không block initial render
const R3FParticleScene = lazy(() => import('./FlameParticlesR3F.jsx'));
