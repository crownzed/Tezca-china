import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clampFlameDelta, consumeBurst } from './flame-visual';

const MODEL_URL = `${import.meta.env.BASE_URL}models/streak/streak-flame-v1.glb`;
// The GLB is Y-up, with its front layers facing +Z. Keep framing separate from the asset.
const MODEL_Y = -1.15;
const CAMERA = { position: [0.55, 0.4, 5.2], fov: 36, near: 0.1, far: 20 };
const SWAY_AXIS = new Vector3(0, 0, 1);

const PALETTES = {
  ember: {
    outer: '#b94424', inner: '#eb792f', core: '#ffcf79',
    pedestal: '#513329', halo: '#a94a26', particle: '#ffac72', energy: 0.8,
  },
  flame: {
    outer: '#ed6320', inner: '#ffac35', core: '#ffe19a',
    pedestal: '#603b29', halo: '#e87829', particle: '#ffd39a', energy: 1,
  },
  inferno: {
    outer: '#bd2848', inner: '#fa613b', core: '#ffc589',
    pedestal: '#502d41', halo: '#c84265', particle: '#ffa7a1', energy: 1.12,
  },
  golden: {
    outer: '#d69924', inner: '#ffd04e', core: '#fff0b5',
    pedestal: '#79602d', halo: '#e3b74d', particle: '#fff0b3', energy: 1.05,
  },
};

const LAYERS = {
  StreakFlame_Outer: { color: 'outer', glow: 0.2, sway: 0.018, phase: 0 },
  StreakFlame_Inner: { color: 'inner', glow: 0.28, sway: 0.014, phase: 0.9 },
  StreakFlame_Core: { color: 'core', glow: 0.36, sway: 0.009, phase: 1.8 },
  StreakFlame_Pedestal: { color: 'pedestal', glow: 0.025, sway: 0, phase: 0 },
  StreakFlame_Halo: { color: 'halo', glow: 0.12, sway: 0.006, phase: 2.7 },
};

// Decorative scene: do not install R3F's pointer/raycast event handlers at all.
function noPointerEvents() {
  return { enabled: false, priority: 1 };
}

function configureScene({ gl, camera }) {
  gl.setClearColor(0x000000, 0);
  gl.toneMappingExposure = 1;
  camera.lookAt(0, 0.05, 0);
}

/** One transparent stage: cached GLB, studio lighting, and a single ember draw call. */
export default function FlameParticlesR3F({
  particleCount = 55,
  burstId = 0,
  tier = 'flame',
  studiedToday = false,
  running = true,
  onReady,
  onError,
}) {
  const statusRef = useRef({ ready: false, contextLost: false });
  const count = Number.isFinite(particleCount) ? Math.max(0, Math.floor(particleCount)) : 0;

  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      camera={CAMERA}
      frameloop={running ? 'always' : 'never'}
      events={noPointerEvents}
      onCreated={configureScene}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      resize={{ scroll: false }}
      aria-hidden="true"
    >
      <CanvasLifecycle statusRef={statusRef} onReady={onReady} onError={onError} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fff1db', '#504569', 1.1]} />
      <directionalLight position={[-3, 4, 5]} color="#fff2d9" intensity={2.4} />
      <directionalLight position={[3, 1, -2]} color="#9fbdff" intensity={1.35} />
      <Suspense fallback={null}>
        <FlameScene
          count={count}
          burstId={burstId}
          tier={tier}
          studiedToday={studiedToday}
          running={running}
          statusRef={statusRef}
          onReady={onReady}
        />
      </Suspense>
    </Canvas>
  );
}

function CanvasLifecycle({ statusRef, onReady, onError }) {
  const gl = useThree(state => state.gl);

  // This sibling of Suspense also observes context loss while the GLB is loading.
  useEffect(() => {
    const canvas = gl.domElement;
    const status = statusRef.current;
    status.contextLost = false;
    const handleContextLost = (event) => {
      event.preventDefault();
      if (status.contextLost) return;
      status.contextLost = true;
      if (status.ready) {
        status.ready = false;
        onReady?.(false);
      }
      onError?.(new Error('WebGL context lost while rendering the streak flame.'));
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      if (status.ready) {
        status.ready = false;
        onReady?.(false);
      }
    };
  }, [gl, onError, onReady, statusRef]);

  return null;
}

function FlameScene({ count, burstId, tier, studiedToday, running, statusRef, onReady }) {
  // No preload, Draco, or external decoders. Loader errors propagate through Canvas
  // to the parent's error boundary; cached geometry/materials are never disposed here.
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const modelGroupRef = useRef(null);
  const emberGroupRef = useRef(null);
  const modelRef = useRef(null);
  const particlesRef = useRef(null);
  const elapsedRef = useRef(0);
  const pulseRef = useRef(0);
  const previousBurstRef = useRef(consumeBurst(0, burstId));
  const palette = PALETTES[tier] || PALETTES.flame;

  // Disposable ownership starts in the effect, not useMemo/render. Every StrictMode
  // setup gets a fresh clone; cleanup only disposes materials owned by that setup.
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;
    const scene = gltf.scene.clone(true);
    const materials = [];
    const layers = [];
    try {
      scene.traverse((node) => {
        if (!node.isMesh) return;
        const config = LAYERS[node.name] || LAYERS.StreakFlame_Outer;
        const cloneMaterial = (source) => {
          const material = source.clone();
          materials.push({ material, config });
          return material;
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial)
          : cloneMaterial(node.material);
        node.castShadow = false;
        node.receiveShadow = false;
        layers.push({
          node,
          config,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          sway: new Quaternion(),
        });
      });
      if (layers.length === 0) throw new Error('The streak flame model contains no meshes.');
      group.add(scene);
    } catch (error) {
      materials.forEach(({ material }) => material.dispose());
      throw error;
    }
    const owned = { scene, materials, layers, frames: 0 };
    const status = statusRef.current;
    modelRef.current = owned;

    return () => {
      group.remove(scene);
      // Object3D clones need only detaching; geometry and textures belong to useLoader.
      materials.forEach(({ material }) => material.dispose());
      if (modelRef.current === owned) modelRef.current = null;
      if (status.ready) {
        status.ready = false;
        onReady?.(false);
      }
    };
  }, [gltf.scene, onReady, statusRef]);

  useEffect(() => {
    const group = emberGroupRef.current;
    if (!group) return;
    // Re-apply an in-flight burst after replacing buffers (for example when
    // studiedToday increases the particle budget). A simultaneous new burst
    // is handled by the burst effect below after this setup effect runs.
    const replayBurst = pulseRef.current > 0.02;
    const buffers = {
      positions: new Float32Array(count * 3),
      velocities: new Float32Array(count * 3),
      lives: new Float32Array(count),
      colors: new Float32Array(count * 3),
    };
    for (let i = 0; i < count; i++) {
      initParticle(buffers, i);
      buffers.positions[i * 3] += (Math.random() - 0.5) * 0.7;
      buffers.positions[i * 3 + 1] = -1 + Math.random() * 2.5;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('color', new BufferAttribute(buffers.colors, 3).setUsage(DynamicDrawUsage));
    const texture = createEmberTexture();
    const material = new PointsMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      size: 0.065,
      sizeAttenuation: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const points = new Points(geometry, material);
    // Positions change each frame; do not keep a stale automatically-computed bound.
    points.frustumCulled = false;
    group.add(points);
    const owned = { points, buffers, count };
    particlesRef.current = owned;
    if (replayBurst) burstParticles(owned);

    return () => {
      group.remove(points);
      if (particlesRef.current === owned) particlesRef.current = null;
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    };
  }, [count]);

  useEffect(() => {
    const energy = palette.energy * (studiedToday ? 1.2 : 0.8);
    modelRef.current?.materials.forEach(({ material, config }) => {
      // Retain glTF's PBR maps, roughness, metalness, and alpha/depth settings.
      // Modest emission leaves the key/rim highlights and layered volume readable.
      material.color?.set(palette[config.color]);
      material.emissive?.set(palette[config.color]);
      if ('emissiveIntensity' in material) material.emissiveIntensity = config.glow * energy;
    });
    const material = particlesRef.current?.points.material;
    if (material) {
      material.color.set(palette.particle);
      material.setValues({ opacity: studiedToday ? 0.82 : 0.6 });
    }
  }, [gltf.scene, count, palette, studiedToday]);

  // Seed with the current ID: mounting with a historical burst is not a new event.
  // Never lower the watermark (including on reset, count changes, or StrictMode replay).
  useEffect(() => {
    const next = consumeBurst(previousBurstRef.current, burstId);
    if (next === previousBurstRef.current) return;
    previousBurstRef.current = next;
    pulseRef.current = 1;
    if (particlesRef.current) burstParticles(particlesRef.current);
  }, [burstId]);

  useFrame((_, delta) => {
    if (!running || statusRef.current.contextLost) return;
    const model = modelRef.current;
    const group = modelGroupRef.current;
    if (!model || !group) return;
    const dt = clampFlameDelta(delta);
    elapsedRef.current += dt;
    const time = elapsedRef.current;
    const pulse = pulseRef.current;
    pulseRef.current = pulse > 0.001 ? pulse * Math.exp(-5 * dt) : 0;
    const energy = palette.energy * (studiedToday ? 1.2 : 0.8);

    group.position.y = MODEL_Y + Math.sin(time * 1.35) * 0.025;
    group.rotation.y = Math.sin(time * 0.8) * 0.025;
    group.scale.setScalar(1 + pulse * 0.055);
    for (const { node, config, position, quaternion, sway } of model.layers) {
      const wave = Math.sin(time * 1.9 + config.phase);
      node.position.setX(position.x + wave * config.sway * 0.45);
      node.quaternion.copy(quaternion).premultiply(sway.setFromAxisAngle(SWAY_AXIS, wave * config.sway));
    }
    for (const { material, config } of model.materials) {
      if ('emissiveIntensity' in material) {
        material.setValues({
          emissiveIntensity: config.glow * energy
            * (1 + Math.sin(time * 2.3 + config.phase) * 0.07 + pulse * 0.45),
        });
      }
    }
    const particles = particlesRef.current;
    if (particles) {
      animateParticles(particles, time, dt);
      particles.points.material.size = 0.065 * (studiedToday ? 1 : 0.9) * (1 + pulse * 0.45);
    }

    // useFrame runs BEFORE gl.render. Only the following frame can acknowledge
    // the first actual render containing the attached model, never loader resolution.
    if (model.frames > 0 && !statusRef.current.ready) {
      statusRef.current.ready = true;
      onReady?.(true);
    }
    model.frames = 1;
  });

  return (
    <>
      <group ref={modelGroupRef} position={[0, MODEL_Y, 0]} dispose={null} />
      <group ref={emberGroupRef} dispose={null} />
    </>
  );
}

function createEmberTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Neutral sprite: heat lives in vertex colors and tier tint, not a baked orange map.
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.65)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

function initParticle({ positions, velocities, lives, colors }, i) {
  const index = i * 3;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.5;
  positions[index] = Math.cos(angle) * radius;
  positions[index + 1] = -1.05 + Math.random() * 0.35;
  positions[index + 2] = 0.2 + Math.sin(angle) * radius * 0.65;
  velocities[index] = (Math.random() - 0.5) * 0.35;
  velocities[index + 1] = 0.55 + Math.random() * 0.8;
  velocities[index + 2] = (Math.random() - 0.5) * 0.18;
  lives[i] = 0.6 + Math.random() * 1.4;
  colors[index] = 1;
  colors[index + 1] = 0.85 + Math.random() * 0.15;
  colors[index + 2] = 0.45 + Math.random() * 0.4;
}

function burstParticles({ buffers, count, points }) {
  const { positions, velocities, lives, colors } = buffers;
  for (let i = 0; i < count; i++) {
    const index = i * 3;
    const angle = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.25) * Math.PI;
    const speed = 1.25 + Math.random() * 1.55;
    velocities[index] = Math.cos(angle) * Math.cos(phi) * speed * 0.48;
    velocities[index + 1] = Math.abs(Math.sin(phi)) * speed * 0.6 + 0.55;
    velocities[index + 2] = Math.sin(angle) * Math.cos(phi) * speed * 0.22;
    positions[index] = (Math.random() - 0.5) * 0.3;
    positions[index + 1] = -0.45 + Math.random() * 0.4;
    positions[index + 2] = 0.3 + (Math.random() - 0.5) * 0.3;
    lives[i] = 1 + Math.random() * 0.8;
    colors[index] = 1;
    colors[index + 1] = 0.95;
    colors[index + 2] = 0.7;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}

function animateParticles({ buffers, count, points }, time, dt) {
  const { positions, velocities, lives, colors } = buffers;
  // Time-based damping preserves the old convection/swirl without refresh-rate drift.
  const drag = Math.exp(-0.72 * dt);
  for (let i = 0; i < count; i++) {
    const index = i * 3;
    const y = positions[index + 1];
    const swirlX = Math.sin(time * 3 + y * 2.2 + i * 0.3) * 0.22;
    const swirlZ = Math.cos(time * 2.6 + y * 2.2 + i * 0.4) * 0.15;
    positions[index] += (velocities[index] + swirlX) * dt;
    positions[index + 1] += velocities[index + 1] * dt;
    positions[index + 2] += (velocities[index + 2] + swirlZ) * dt;
    velocities[index + 1] += (0.3 + Math.sin(time + i) * 0.08) * dt;
    velocities[index] *= drag;
    velocities[index + 2] *= drag;
    lives[i] -= dt * (0.55 + (i % 4) * 0.12);

    const lifeRatio = Math.max(0, Math.min(1, lives[i] / 1.5));
    if (lifeRatio > 0.65) {
      colors[index] = 1;
      colors[index + 1] = 0.9;
      colors[index + 2] = 0.45;
    } else if (lifeRatio > 0.25) {
      colors[index] = 1;
      colors[index + 1] = 0.4 + lifeRatio * 0.7;
      colors[index + 2] = 0.05;
    } else {
      colors[index] = 0.8 * (lifeRatio / 0.25);
      colors[index + 1] = 0.15 * (lifeRatio / 0.25);
      colors[index + 2] = 0.02 * (lifeRatio / 0.25);
    }
    // Recycle before embers run beyond the compact stage, including during a burst.
    if (lives[i] <= 0 || positions[index + 1] > 1.7 || Math.abs(positions[index]) > 1.35) {
      initParticle(buffers, i);
    }
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}
