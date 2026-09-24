// Real-time audio visualizer cho live call.
//
// Hiển thị RMS level từ actual audio data (không phải CSS animation thuần).
// Dùng canvas để vẽ waveform/pulse phản ứng theo năng lượng âm thanh thực.
// Lightweight: chỉ draw mỗi frame khi có update, không polling.

import { useRef, useEffect } from 'react';

/**
 * AudioVisualizer — hiển thị mức năng lượng âm thanh realtime.
 *
 * Props:
 *   rmsLevel: number (0.0 - 1.0) — current RMS từ AudioPlayer
 *   isActive: boolean — có đang trong call không
 *   color: string — màu chính (default: '#6366f1')
 *   size: number — kích thước canvas (default: 120)
 */
export function AudioVisualizer({
  rmsLevel = 0,
  isActive = false,
  color = '#6366f1',
  size = 120,
}) {
  const canvasRef = useRef(null);
  const smoothLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame;

    function drawFrame() {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Smooth transition cho level
      const target = isActive ? rmsLevel : 0;
      smoothLevelRef.current += (target - smoothLevelRef.current) * 0.15;
      const level = smoothLevelRef.current;

      ctx.clearRect(0, 0, w, h);

      if (!isActive || level < 0.01) {
        // Idle state: vòng tròn nhỏ tĩnh
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }

      // Active state: concentric rings pulsing with audio energy
      const maxRadius = Math.min(w, h) / 2 - 4;
      const baseRadius = 12;
      const pulseRadius = baseRadius + level * (maxRadius - baseRadius);

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.2 + level * 0.3;
      ctx.stroke();

      // Middle ring
      const midRadius = baseRadius + level * (maxRadius - baseRadius) * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.15 + level * 0.2;
      ctx.fill();

      // Core circle
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius + level * 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6 + level * 0.4;
      ctx.fill();

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(drawFrame);
    }

    frame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frame);
  }, [rmsLevel, isActive, color, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        display: 'block',
        borderRadius: '50%',
      }}
      aria-label="Audio visualizer"
      role="img"
    />
  );
}
