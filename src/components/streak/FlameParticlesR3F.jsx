import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial } from 'three';

/**
 * Sinh texture đốm than hồng phát sáng mềm mại từ Canvas2D.
 * Tránh texture vuông sắc cạnh, cho hiệu ứng đốm lửa bùng sáng chân thực.
 */
function createEmberTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.2, 'rgba(255, 230, 130, 0.95)');
  grad.addColorStop(0.45, 'rgba(255, 120, 20, 0.75)');
  grad.addColorStop(0.75, 'rgba(220, 35, 0, 0.3)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();

  return new CanvasTexture(canvas);
}

/**
 * R3F Particle Scene — Hệ thống hạt lửa 3D sống động hiệu năng cao.
 * Sử dụng 1 Draw Call duy nhất với Three.js Points và BufferGeometry.
 *
 * @param {{ particleCount: number, burstKey: number }} props
 */
export default function FlameParticlesR3F({ particleCount, burstKey }) {
  return (
    <Canvas
      gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5], fov: 48 }}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      resize={{ scroll: false }}
    >
      <EmberParticles count={particleCount} burstKey={burstKey} />
    </Canvas>
  );
}

function EmberParticles({ count, burstKey }) {
  const groupRef = useRef(null);
  const pointsRef = useRef(null);
  const prevBurstRef = useRef(burstKey);
  const buffersRef = useRef(null);

  // Buffers and GPU resources belong to this scene, not React render state.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const buffers = {
      positions: new Float32Array(count * 3),
      velocities: new Float32Array(count * 3),
      lives: new Float32Array(count),
      sizes: new Float32Array(count),
      colors: new Float32Array(count * 3),
    };
    const { positions, velocities, lives, sizes, colors } = buffers;
    for (let i = 0; i < count; i++) {
      initParticle(positions, velocities, lives, sizes, colors, i);
      // Rải rác vị trí ban đầu theo chiều cao để không bị xuất phát cùng lúc
      positions[i * 3 + 1] = -1.2 + Math.random() * 2.2;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geometry.setAttribute('aLife', new BufferAttribute(lives, 1));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const texture = createEmberTexture();
    const material = new PointsMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      size: 0.42,
      sizeAttenuation: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const points = new Points(geometry, material);
    group.add(points);
    buffersRef.current = buffers;
    pointsRef.current = points;

    return () => {
      group.remove(points);
      pointsRef.current = null;
      buffersRef.current = null;
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    };
  }, [count]);

  // Burst effect — nổ bùng tia lửa đa hướng khi tăng streak hoặc người dùng chạm vào ngọn lửa
  useEffect(() => {
    if (burstKey === prevBurstRef.current) return;
    prevBurstRef.current = burstKey;

    const buffers = buffersRef.current;
    if (!buffers) return;
    const { positions, velocities, lives, sizes, colors } = buffers;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI;
      const speed = 2.5 + Math.random() * 4.5;

      velocities[i * 3] = Math.cos(angle) * Math.cos(phi) * speed;
      velocities[i * 3 + 1] = Math.abs(Math.sin(phi)) * speed + 1.2;
      velocities[i * 3 + 2] = Math.sin(angle) * Math.cos(phi) * speed * 0.6;

      positions[i * 3] = (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = -0.6 + Math.random() * 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

      lives[i] = 1.0 + Math.random() * 0.8;
      sizes[i] = 4.0 + Math.random() * 5.0;

      // Màu phát sáng cực đại lúc nổ
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 0.7;
    }
  }, [burstKey, count]);

  // Vòng lặp vật lý hạt chuyển động đối lưu xoáy cuộn hữu cơ (Vortex Swirl)
  useFrame((state, delta) => {
    if (document.hidden) return;
    const dt = Math.min(delta, 0.05);
    const pts = pointsRef.current;
    if (!pts) return;

    const buffers = buffersRef.current;
    if (!buffers) return;
    const { positions, velocities, lives, sizes, colors } = buffers;
    const time = state.clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const y = positions[i * 3 + 1];

      // Chuyển động xoáy sóng Sin tự nhiên như dòng khí nóng bốc lên
      const swirlX = Math.sin(time * 3.0 + y * 2.2 + i * 0.3) * 0.45;
      const swirlZ = Math.cos(time * 2.6 + y * 2.2 + i * 0.4) * 0.35;

      // Cập nhật tọa độ
      positions[i * 3] += (velocities[i * 3] + swirlX) * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += (velocities[i * 3 + 2] + swirlZ) * dt;

      // Gia tốc nhiệt bốc lên cao
      velocities[i * 3 + 1] += (0.9 + Math.sin(time + i) * 0.2) * dt;

      // Lực cản không khí
      velocities[i * 3] *= 0.988;
      velocities[i * 3 + 2] *= 0.988;

      // Suy hao thời gian sống
      lives[i] -= dt * (0.55 + (i % 4) * 0.12);

      // Chuyển đổi màu sắc dần theo nhiệt độ (từ trắng vàng -> cam lửa -> đỏ tàn tro)
      const lifeRatio = Math.max(0, Math.min(1, lives[i] / 1.5));
      if (lifeRatio > 0.65) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.45;
      } else if (lifeRatio > 0.25) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.4 + lifeRatio * 0.7;
        colors[i * 3 + 2] = 0.05;
      } else {
        colors[i * 3] = 0.8 * (lifeRatio / 0.25);
        colors[i * 3 + 1] = 0.15 * (lifeRatio / 0.25);
        colors[i * 3 + 2] = 0.02;
      }

      // Hạt tắt -> Hồi sinh hạt mới ở gốc ngọn lửa
      if (lives[i] <= 0) {
        initParticle(positions, velocities, lives, sizes, colors, i);
      }
    }

    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
  });

  return <group ref={groupRef} />;
}

function initParticle(pos, vel, life, size, col, i) {
  // Xuất phát từ vùng hình giọt nước tại gốc ngọn lửa
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.4;
  pos[i * 3] = Math.cos(angle) * radius;
  pos[i * 3 + 1] = -1.2 + Math.random() * 0.5;
  pos[i * 3 + 2] = Math.sin(angle) * radius * 0.5;

  // Vận tốc vút lên
  vel[i * 3] = (Math.random() - 0.5) * 0.8;
  vel[i * 3 + 1] = 1.3 + Math.random() * 2.2;
  vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;

  life[i] = 0.6 + Math.random() * 1.4;
  size[i] = 3.0 + Math.random() * 4.0;

  // Khởi tạo màu trắng vàng nhiệt độ cao
  col[i * 3] = 1.0;
  col[i * 3 + 1] = 0.85 + Math.random() * 0.15;
  col[i * 3 + 2] = 0.45 + Math.random() * 0.4;
}
