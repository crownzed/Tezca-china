import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion, useWebGLSupport, useHardwareTier } from '../../hooks/useMotionPrefs';
import { getFlameVisualState } from './flame-visual';

const FlameScene = lazy(() => import('./FlameParticlesR3F.jsx'));

// A decorative renderer failure must not replace the streak page with an error screen.
class FlameBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** One stable stage for the GLB, embers and SVG fallback. Visibility pauses, never remounts, the Canvas. */
export function FlameCanvas3D({ active, burstId = 0, tier = 'ember', studiedToday = false, children }) {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebGLSupport();
  const hardwareTier = useHardwareTier();
  const containerRef = useRef(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [modelReady, setModelReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => {
    setFailed(true);
    setModelReady(false);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting && entry.intersectionRatio >= 0.05);
    }, { threshold: [0, 0.05] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const { use3D, showModel, running, particleCount, fallbackEmbers } = getFlameVisualState({
    active, studiedToday, hardwareTier, reducedMotion, webglSupported,
    failed, modelReady, inView, pageVisible,
  });

  return (
    <div
      ref={containerRef}
      className={`flame-visual ${showModel ? 'flame-visual--ready' : ''}`}
      aria-hidden="true"
      data-renderer={showModel ? 'webgl' : 'svg'}
      data-running={inView && pageVisible && !reducedMotion}
    >
      {children}
      {use3D && (
        <div className="flame-canvas-3d" data-running={running}>
          <FlameBoundary onError={handleError}>
            <Suspense fallback={null}>
              <FlameScene
                particleCount={particleCount}
                burstId={burstId}
                tier={tier}
                studiedToday={studiedToday}
                running={running}
                onReady={setModelReady}
                onError={handleError}
              />
            </Suspense>
          </FlameBoundary>
        </div>
      )}
      {fallbackEmbers > 0 && (
        <div className="flame-canvas-fallback">
          {Array.from({ length: fallbackEmbers }, (_, i) => (
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
      )}
    </div>
  );
}
