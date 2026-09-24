import { useEffect, useState, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';

/**
 * StreakCelebration — Confetti/sparkle burst khi streak tăng.
 * Tự cleanup sau animation hoàn tất.
 *
 * @param {{ trigger: boolean, onComplete?: () => void }} props
 */
export function StreakCelebration({ trigger, onComplete }) {
  const reducedMotion = useReducedMotion();
  const [particles, setParticles] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!trigger) return;

    if (reducedMotion) {
      // Reduced motion: chỉ flash nhẹ rồi gọi complete
      const timer = setTimeout(() => {
        onComplete?.();
      }, 150);
      return () => clearTimeout(timer);
    }

    // Generate confetti particles
    const colors = ['#f97316', '#dc2626', '#eab308', '#fbbf24', '#fb923c', '#fcd34d'];
    const count = 40;
    const newParticles = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const velocity = 120 + Math.random() * 180;
      return {
        id: i,
        x: 50, // percent
        y: 40, // percent
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 80,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 720,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        shape: Math.random() > 0.5 ? 'circle' : 'rect',
        delay: Math.random() * 100,
      };
    });

    let timer;
    const frame = requestAnimationFrame(() => {
      setParticles(newParticles);
      timer = setTimeout(() => {
        setParticles([]);
        onComplete?.();
      }, 1200);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [trigger, reducedMotion, onComplete]);

  if (!trigger) return null;
  if (particles.length === 0 && !reducedMotion) return null;

  // Reduced motion: simple flash overlay
  if (reducedMotion && trigger) {
    return (
      <div className="streak-celebration-flash" aria-hidden="true" />
    );
  }

  return (
    <div
      ref={containerRef}
      className="streak-celebration"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {particles.map(p => (
        <span
          key={p.id}
          className={`streak-confetti streak-confetti--${p.shape}`}
          style={{
            '--cx': `${p.x}%`,
            '--cy': `${p.y}%`,
            '--vx': `${p.vx}px`,
            '--vy': `${p.vy}px`,
            '--rot': `${p.rotation}deg`,
            '--rot-speed': `${p.rotationSpeed}deg`,
            '--color': p.color,
            '--size': `${p.size}px`,
            '--delay': `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
