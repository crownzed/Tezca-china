import { useEffect, useRef, useState } from 'react';

// Classify the device into a performance tier so the galaxy can scale its
// star count, bloom passes, and the (expensive) full-viewport video layer.
// Read once via lazy state init — cheap heuristics, no observers needed.
function detectPerfTier() {
  if (typeof navigator === 'undefined') return 'high';
  const mem = navigator.deviceMemory || 4;          // GB, when exposed
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
  if (mem <= 2 || cores <= 2) return 'low';
  if (mobile || mem <= 4 || cores <= 4) return 'mid';
  return 'high';
}

// Per-tier knobs. Everything visual reads from here so tuning stays in one place.
const TIER_CONFIG = {
  low:  { starCount: 140, bloom: false, twinkle: false, video: false, coreBloom: false },
  mid:  { starCount: 260, bloom: false, twinkle: true,  video: true,  coreBloom: true },
  high: { starCount: 400, bloom: true,  twinkle: true,  video: true,  coreBloom: true },
};

export default function SpaceVortexBackground({ active = true, cardRef = null }) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const lastTimeRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [perfTier] = useState(detectPerfTier);
  const videoRef = useRef(null);

  const showVideo = TIER_CONFIG[perfTier].video && !reducedMotion;

  // Synchronize video playback with component state and prefers-reduced-motion
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active && !reducedMotion) {
      video.play().catch(() => {
        // Autoplay may be temporarily blocked by browser until user interaction
      });
    } else {
      video.pause();
    }
  }, [active, reducedMotion]);


  // Monitor prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleQueryChange = (e) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleQueryChange);
    return () => mediaQuery.removeEventListener('change', handleQueryChange);
  }, []);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cosmic (dark, primary) vs dawn (light) palettes. On the auth gate the
    // theme is fixed — the toggle lives in the app topbar, not here — so we can
    // read it once at effect start instead of observing for changes. Dark is
    // the default cosmic look; anything that isn't the dark theme gets dawn.
    const isDawn = document.documentElement.dataset.theme !== 'dark';
    const palette = isDawn
      ? {
          base: 'rgba(18, 18, 46, 0.30)',      // indigo pre-dawn wash
          neb1: ['rgba(245, 158, 11, 0.24)', 'rgba(251, 113, 133, 0.08)'], // amber → rose
          neb2: ['rgba(139, 92, 246, 0.20)', 'rgba(251, 191, 36, 0.05)'],  // violet → warm
          neb3: ['rgba(56, 189, 248, 0.12)', 'rgba(245, 158, 11, 0.02)'],  // sky → amber
          vignette: ['rgba(26, 22, 58, 0.10)', 'rgba(22, 20, 50, 0.38)', 'rgba(18, 18, 46, 0.72)'],
        }
      : {
          base: 'rgba(5, 3, 10, 0.35)',
          neb1: ['rgba(37, 99, 235, 0.28)', 'rgba(124, 58, 237, 0.08)'],   // cobalt → purple
          neb2: ['rgba(124, 58, 237, 0.24)', 'rgba(255, 40, 160, 0.05)'],  // violet → pink
          neb3: ['rgba(6, 182, 212, 0.14)', 'rgba(37, 99, 235, 0.02)'],    // cyan core
          vignette: ['rgba(6, 2, 18, 0.25)', 'rgba(5, 2, 15, 0.65)', 'rgba(3, 1, 8, 0.96)'],
        };

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let maxRadius = 0;
    let cardHalfW = 0;
    let cardHalfH = 0;

    // Handle high-DPI screens
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for performance
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Anchor the system center to the real login card, not the canvas center.
      // Falls back to canvas center if the card ref isn't available yet.
      const cardEl = cardRef?.current;
      if (cardEl) {
        const cardRect = cardEl.getBoundingClientRect();
        centerX = cardRect.left - rect.left + cardRect.width / 2;
        centerY = cardRect.top - rect.top + cardRect.height / 2;
        cardHalfW = cardRect.width / 2;
        cardHalfH = cardRect.height / 2;
      } else {
        centerX = width / 2;
        centerY = height / 2;
        cardHalfW = Math.min(210, width * 0.4);
        cardHalfH = 200;
      }
      // Farthest reachable corner from the (possibly off-center) system center.
      const dxMax = Math.max(centerX, width - centerX);
      const dyMax = Math.max(centerY, height - centerY);
      maxRadius = Math.sqrt(dxMax * dxMax + dyMax * dyMax);
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    // Track the card too: its height changes between login/register modes,
    // which shifts the true center the planets must orbit.
    if (cardRef?.current) {
      resizeObserver.observe(cardRef.current);
    }

    // Interactive mouse parallax offset
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (e) => {
      if (reducedMotion) return; // Honor prefers-reduced-motion: no cursor parallax
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 35; // Max 35px shift
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 35;
    };

    if (!reducedMotion) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // Initialize stars across 4 layers
    // Layer 0: Far, tiny, very slow
    // Layer 1: Mid, medium size, slow spiral
    // Layer 2: Close, larger, faster spiral
    // Layer 3: Floating cosmic dust (random floats, breaks uniform vortex)
    const tier = TIER_CONFIG[perfTier];
    const starCount = tier.starCount;
    const stars = [];

    const createStar = (initAllOver = false) => {
      const angle = Math.random() * Math.PI * 2;
      // If initializing, distribute all over. Else, generate at the outer boundary.
      const r = initAllOver 
        ? Math.random() * maxRadius 
        : maxRadius * (0.95 + Math.random() * 0.05);
      
      const layer = Math.floor(Math.random() * 4); // 0, 1, 2, 3
      
      let baseSpeed = 0.05 + Math.random() * 0.15;
      let size = 0.5 + Math.random() * 1.2;
      let color = 'rgba(255, 255, 255, '; // base color
      
      if (layer === 0) {
        // Deep stars
        baseSpeed = 0.01 + Math.random() * 0.03;
        size = 0.4 + Math.random() * 0.6;
        color = 'rgba(150, 180, 255, '; // bluish tint
      } else if (layer === 1) {
        // Mid stars
        baseSpeed = 0.04 + Math.random() * 0.06;
        size = 0.8 + Math.random() * 0.8;
        color = 'rgba(220, 200, 255, '; // purplish tint
      } else if (layer === 2) {
        // Close stars / Vortex drivers
        baseSpeed = 0.08 + Math.random() * 0.12;
        size = 1.4 + Math.random() * 1.0;
        color = 'rgba(255, 255, 255, ';
      } else {
        // Cosmic dust (drifting, different behavior)
        baseSpeed = 0.02 + Math.random() * 0.05;
        size = 1.5 + Math.random() * 1.5;
        color = 'rgba(0, 210, 255, '; // Cyan/Teal glow
      }

      return {
        angle,
        r,
        layer,
        baseSpeed,
        size,
        color,
        // Start with 0 opacity if spawning at outer edges to fade in
        opacity: initAllOver ? Math.random() * 0.8 + 0.2 : 0,
        fadeSpeed: 0.5 + Math.random() * 1.5,
        // Floating dust drift offsets
        driftX: (Math.random() - 0.5) * 0.2,
        driftY: (Math.random() - 0.5) * 0.2,
        // Twinkle: each star pulses opacity on its own phase + rate
        twPhase: Math.random() * Math.PI * 2,
        twRate: 1.5 + Math.random() * 2.5,
        twAmp: 0.4 + Math.random() * 0.4,
      };
    };

    // Populate initial stars
    for (let i = 0; i < starCount; i++) {
      stars.push(createStar(true));
    }

    // Shooting stars / Meteor manager
    let activeMeteor = null;
    const spawnMeteor = () => {
      if (activeMeteor || reducedMotion) return;
      
      const startAngle = Math.random() * Math.PI * 2;
      const startR = maxRadius * (0.6 + Math.random() * 0.3);
      
      const x = centerX + Math.cos(startAngle) * startR;
      const y = centerY + Math.sin(startAngle) * startR;
      
      // Direction: aiming towards the vortex center with some angle deviation
      const targetAngle = startAngle + Math.PI + (Math.random() - 0.5) * 0.5;
      const speed = 8 + Math.random() * 12;
      
      activeMeteor = {
        x,
        y,
        vx: Math.cos(targetAngle) * speed,
        vy: Math.sin(targetAngle) * speed,
        length: 60 + Math.random() * 90,
        thickness: 1.5 + Math.random() * 1.5,
        opacity: 1,
        color: Math.random() > 0.4 ? 'rgba(0, 210, 255, ' : 'rgba(255, 124, 237, ',
      };
    };

    // Nebula parameters
    let nebulaTime = 0;
    // Absolute elapsed clock (seconds) driving star twinkle, independent of the
    // vortex motion so twinkle keeps a gentle shimmer even in reduced-motion.
    let elapsed = 0;
    // Core "sun" energy: eased toward 1 while the cursor hovers near the card,
    // back to 0 otherwise. Drives the central glow's brightness + scale.
    let coreEnergy = 0;

    // Define 4 planets orbiting the login card (the central form)
    const basePlanets = [
      { rx: 240, ry: 150, speed: 0.14, size: 5, color: 'rgba(159, 117, 255, ', tilt: -0.12, hasRings: false }, // Inner Purple
      { rx: 330, ry: 200, speed: 0.10, size: 7, color: 'rgba(6, 182, 212, ', tilt: 0.16, hasRings: false },  // Cyan
      { rx: 430, ry: 260, speed: 0.06, size: 11, color: 'rgba(37, 99, 235, ', tilt: -0.22, hasRings: true }, // Cobalt Blue with Rings
      { rx: 530, ry: 320, speed: 0.035, size: 6, color: 'rgba(236, 72, 153, ', tilt: 0.28, hasRings: false } // Outer Magenta
    ];
    // Randomize initial positions (angles)
    const planetAngles = basePlanets.map(() => Math.random() * Math.PI * 2);



    // Render loop
    const render = (time) => {
      if (document.hidden) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      nebulaTime += reducedMotion ? delta * 0.15 : delta;
      elapsed += delta;

      // Mouse lerp for smooth parallax
      mouseX += (targetMouseX - mouseX) * 4 * delta;
      mouseY += (targetMouseY - mouseY) * 4 * delta;

      // Ease core energy toward the cursor's proximity to the card center.
      // targetMouseX/Y are in screen-shift units (±35); a small magnitude means
      // the cursor sits near the middle where the card lives → energize the core.
      const cursorMag = Math.hypot(targetMouseX, targetMouseY);
      const proximity = reducedMotion ? 0 : Math.max(0, 1 - cursorMag / 26);
      coreEnergy += (proximity - coreEnergy) * Math.min(1, delta * 3);

      // Clear canvas and draw a semi-transparent base for video overlay blending
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = palette.base;
      ctx.fillRect(0, 0, width, height);

      // --- Draw Dynamic Nebula Background Layers (Radial Gradients) ---
      ctx.globalCompositeOperation = 'screen';
      
      // Nebula 1: Deep Royal Blue/Cobalt
      const n1X = centerX + mouseX * 0.4 + Math.sin(nebulaTime * 0.15) * 60;
      const n1Y = centerY + mouseY * 0.4 + Math.cos(nebulaTime * 0.2) * 40;
      const n1R = maxRadius * (0.55 + Math.sin(nebulaTime * 0.08) * 0.05);
      const grad1 = ctx.createRadialGradient(n1X, n1Y, 0, n1X, n1Y, n1R);
      grad1.addColorStop(0, palette.neb1[0]);
      grad1.addColorStop(0.5, palette.neb1[1]);
      grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.arc(n1X, n1Y, n1R, 0, Math.PI * 2);
      ctx.fill();

      // Nebula 2: Cosmic Magenta/Deep Violet
      const n2X = centerX + mouseX * 0.6 - Math.cos(nebulaTime * 0.12) * 50;
      const n2Y = centerY + mouseY * 0.6 - Math.sin(nebulaTime * 0.18) * 50;
      const n2R = maxRadius * (0.45 + Math.cos(nebulaTime * 0.05) * 0.03);
      const grad2 = ctx.createRadialGradient(n2X, n2Y, 0, n2X, n2Y, n2R);
      grad2.addColorStop(0, palette.neb2[0]);
      grad2.addColorStop(0.4, palette.neb2[1]);
      grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(n2X, n2Y, n2R, 0, Math.PI * 2);
      ctx.fill();

      // Nebula 3: Soft Cyan Core Glow
      const n3X = centerX + mouseX * 0.2;
      const n3Y = centerY + mouseY * 0.2;
      const n3R = maxRadius * (0.35 + Math.sin(nebulaTime * 0.1) * 0.04);
      const grad3 = ctx.createRadialGradient(n3X, n3Y, 0, n3X, n3Y, n3R);
      grad3.addColorStop(0, palette.neb3[0]);
      grad3.addColorStop(0.6, palette.neb3[1]);
      grad3.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad3;
      ctx.beginPath();
      ctx.arc(n3X, n3Y, n3R, 0, Math.PI * 2);
      ctx.fill();

      // --- Central Core "Sun" glow (behind the card) ---
      // The card is the star the planets orbit; this soft luminous core sits
      // directly behind it. It breathes on its own slow cycle and brightens as
      // the cursor nears the center (coreEnergy). Gated to mid/high tiers.
      if (tier.coreBloom) {
        const breathe = 0.5 + Math.sin(elapsed * 0.6) * 0.5;      // 0..1 slow
        const intensity = 0.22 + breathe * 0.12 + coreEnergy * 0.26;
        const coreR = Math.max(cardHalfW, cardHalfH) * (2.1 + coreEnergy * 0.7);
        const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreR);
        const coreHue = isDawn ? '255, 214, 140' : '150, 200, 255'; // dawn gold vs cosmic ice-blue
        coreGrad.addColorStop(0, `rgba(${coreHue}, ${intensity.toFixed(3)})`);
        coreGrad.addColorStop(0.4, `rgba(${coreHue}, ${(intensity * 0.4).toFixed(3)})`);
        coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // --- Draw & Update Stars ---
      stars.forEach((star, idx) => {
        // Fade in stars starting at outer edges
        if (star.opacity < 1 && star.r > maxRadius * 0.5) {
          star.opacity += star.fadeSpeed * delta;
          if (star.opacity > 1) star.opacity = 1;
        }

        // Apply motion if not reducedMotion
        if (!reducedMotion) {
          if (star.layer === 3) {
            // Cosmic dust drifts in wave paths
            star.r -= star.baseSpeed * maxRadius * delta * 0.4;
            star.angle += star.driftX * delta * 2;
          } else {
            // Space Vortex convergence: r decreases, angle rotates
            const speedFactor = star.layer === 0 ? 0.02 : star.layer === 1 ? 0.06 : 0.12;
            star.r -= star.baseSpeed * maxRadius * delta * (star.r / maxRadius + 0.05);

            // Spiral spin: spin faster as stars get closer to center
            const spin = (0.01 + (1 - star.r / maxRadius) * 0.05) * speedFactor;
            star.angle += spin * delta * 12;
          }
        }

        // Project coordinate with mouse parallax
        const parallaxFactor = 0.2 + (star.layer * 0.25);
        const x = centerX + Math.cos(star.angle) * star.r + mouseX * parallaxFactor;
        const y = centerY + Math.sin(star.angle) * star.r + mouseY * parallaxFactor;

        // Visual fade out as stars get very close to center (vortex absorption)
        let displayOpacity = star.opacity;
        if (star.r < maxRadius * 0.15) {
          displayOpacity *= (star.r / (maxRadius * 0.15));
        }

        // Twinkle: gentle self-paced opacity shimmer (mid/high tiers, motion on).
        // Sine on each star's own phase so the field never pulses in unison.
        if (tier.twinkle && !reducedMotion) {
          const tw = 1 - star.twAmp * (0.5 + 0.5 * Math.sin(star.twPhase + elapsed * star.twRate));
          displayOpacity *= tw;
        }

        // Reset star if it reaches the center (absorbed) or goes off-bounds
        if (star.r <= 8 || x < -50 || x > width + 50 || y < -50 || y > height + 50 || displayOpacity <= 0.01) {
          stars[idx] = createStar(false);
          return;
        }

        // Render star
        ctx.fillStyle = `${star.color}${displayOpacity.toFixed(3)})`;
        
        // Draw soft glowing circles for foreground particles, simple squares/dots for background
        if (star.layer >= 2 && star.r > maxRadius * 0.2) {
          const glowRad = star.size * 2.6;
          const starGrad = ctx.createRadialGradient(x, y, 0, x, y, glowRad);
          starGrad.addColorStop(0, `${star.color}${displayOpacity.toFixed(3)})`);
          starGrad.addColorStop(0.3, `${star.color}${(displayOpacity * 0.4).toFixed(3)})`);
          starGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = starGrad;
          ctx.beginPath();
          ctx.arc(x, y, glowRad, 0, Math.PI * 2);
          ctx.fill();

          // Diffraction spikes: a bright 4-point cross flare on the biggest,
          // brightest close stars — the single detail that reads as "star" at a
          // glance. Length pulses with the twinkle so it sparkles. High tier only.
          if (tier.bloom && star.size > 1.9 && displayOpacity > 0.55) {
            const spike = star.size * (6 + 4 * Math.sin(star.twPhase + elapsed * star.twRate));
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const sg = ctx.createLinearGradient(x - spike, y, x + spike, y);
            sg.addColorStop(0, 'rgba(255,255,255,0)');
            sg.addColorStop(0.5, `${star.color}${(displayOpacity * 0.7).toFixed(3)})`);
            sg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = sg;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x - spike, y); ctx.lineTo(x + spike, y);
            ctx.moveTo(x, y - spike); ctx.lineTo(x, y + spike);
            ctx.stroke();
            ctx.restore();
          }
        } else {
          ctx.beginPath();
          ctx.arc(x, y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // --- Draw & Update Meteor ---
      if (activeMeteor) {
        if (!reducedMotion) {
          activeMeteor.x += activeMeteor.vx * delta * 60;
          activeMeteor.y += activeMeteor.vy * delta * 60;
          activeMeteor.opacity -= delta * 1.8;
        } else {
          activeMeteor.opacity = 0;
        }

        if (activeMeteor.opacity <= 0) {
          activeMeteor = null;
        } else {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          
          const tailX = activeMeteor.x - (activeMeteor.vx * 3);
          const tailY = activeMeteor.y - (activeMeteor.vy * 3);
          const metGrad = ctx.createLinearGradient(activeMeteor.x, activeMeteor.y, tailX, tailY);
          metGrad.addColorStop(0, `${activeMeteor.color}${activeMeteor.opacity.toFixed(3)})`);
          metGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          ctx.strokeStyle = metGrad;
          ctx.lineWidth = activeMeteor.thickness;
          ctx.lineCap = 'round';
          
          ctx.beginPath();
          ctx.moveTo(activeMeteor.x, activeMeteor.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
          
          ctx.restore();
        }
      } else if (Math.random() < 0.006 && !reducedMotion) {
        spawnMeteor();
      }

      // --- Draw & Update Planets and Orbits ---
      // Orbits are derived DIRECTLY from the live card size so the innermost
      // ring always hugs the card (never crossing the inputs) while the outer
      // rings stay inside the viewport. Radii interpolate between an inner
      // band (card + gap) and an outer band capped by available room + a
      // maximum spread, so the system stays clustered around the form instead
      // of being flung to the screen edges.
      const activePlanetsCount = width < 600 ? 3 : 4;

      // Room from the (card-anchored) center to each viewport edge.
      const roomX = Math.min(centerX, width - centerX);
      const roomY = Math.min(centerY, height - centerY);
      const edgeMargin = width < 600 ? 18 : 40;
      const maxSpreadX = width < 600 ? 70 : 360;
      const maxSpreadY = width < 600 ? 150 : 300;

      const innerRx = cardHalfW + (width < 600 ? 26 : 34);
      const innerRy = cardHalfH + (width < 600 ? 28 : 30);
      const outerRx = Math.max(innerRx + 40, Math.min(roomX - edgeMargin, innerRx + maxSpreadX));
      const outerRy = Math.max(innerRy + 40, Math.min(roomY - edgeMargin, innerRy + maxSpreadY));

      // Per-planet orbit radii (index 0 = innermost, hugs the card).
      const orbitRx = [];
      const orbitRy = [];
      for (let i = 0; i < activePlanetsCount; i++) {
        const t = activePlanetsCount === 1 ? 0 : i / (activePlanetsCount - 1);
        orbitRx.push(innerRx + (outerRx - innerRx) * t);
        orbitRy.push(innerRy + (outerRy - innerRy) * t);
      }
      const sizeScale = width < 600 ? 0.8 : 1;

      // Draw all orbits first (underneath the planets)
      ctx.lineWidth = 1.1;
      for (let i = 0; i < activePlanetsCount; i++) {
        const planet = basePlanets[i];
        const rx = orbitRx[i];
        const ry = orbitRy[i];

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, planet.tilt, 0, Math.PI * 2);
        ctx.strokeStyle = `${planet.color}0.16)`; // Translucent orbit line
        ctx.stroke();
        ctx.restore();
      }

      // Update and draw planets
      for (let i = 0; i < activePlanetsCount; i++) {
        const planet = basePlanets[i];
        const rx = orbitRx[i];
        const ry = orbitRy[i];

        // If not in reducedMotion mode, rotate the planet
        if (!reducedMotion) {
          planetAngles[i] += planet.speed * delta;
        }

        const theta = planetAngles[i];
        const cosTilt = Math.cos(planet.tilt);
        const sinTilt = Math.sin(planet.tilt);

        // Position on the ellipse before rotation
        const x0 = rx * Math.cos(theta);
        const y0 = ry * Math.sin(theta);

        // Rotate by tilt angle and add center offset + mouse parallax (slower parallax than foreground stars)
        const px = centerX + (x0 * cosTilt - y0 * sinTilt) + mouseX * 0.35;
        const py = centerY + (x0 * sinTilt + y0 * cosTilt) + mouseY * 0.35;

        const pr = planet.size * sizeScale;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // High-tier bloom: a wide, additive outer halo that reads as light
        // spilling past the planet. 'lighter' accumulates overlapping glows for
        // a true bloom rather than a flat disc. Skipped on low/mid tiers.
        if (tier.bloom) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const bloomRad = pr * 5.2;
          const bloomGrad = ctx.createRadialGradient(px, py, 0, px, py, bloomRad);
          bloomGrad.addColorStop(0, `${planet.color}0.34)`);
          bloomGrad.addColorStop(0.4, `${planet.color}0.12)`);
          bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = bloomGrad;
          ctx.beginPath();
          ctx.arc(px, py, bloomRad, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Soft glow surrounding the planet — kept modest so the form stays dominant
        const glowRad = pr * 3.0;
        const planetGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRad);
        planetGrad.addColorStop(0, `${planet.color}0.95)`);
        planetGrad.addColorStop(0.32, `${planet.color}0.38)`);
        planetGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = planetGrad;
        ctx.beginPath();
        ctx.arc(px, py, glowRad, 0, Math.PI * 2);
        ctx.fill();

        // Planet body with an off-center highlight for a lit-sphere feel.
        // Highlight faces the central core (the "sun"), so lighting is coherent.
        const toCoreAngle = Math.atan2(centerY - py, centerX - px);
        const hlx = px + Math.cos(toCoreAngle) * pr * 0.38;
        const hly = py + Math.sin(toCoreAngle) * pr * 0.38;
        const bodyGrad = ctx.createRadialGradient(
          hlx, hly, pr * 0.1,
          px, py, pr,
        );
        bodyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        bodyGrad.addColorStop(0.35, `${planet.color}0.95)`);
        bodyGrad.addColorStop(1, `${planet.color}0.9)`);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();

        // Rim light: a thin bright crescent on the core-facing edge — the
        // classic depth cue that separates the sphere from its own glow.
        const rimGrad = ctx.createRadialGradient(hlx, hly, pr * 0.6, px, py, pr);
        rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        rimGrad.addColorStop(0.82, 'rgba(255, 255, 255, 0)');
        rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0.55)');
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();

        // Optional Rings (e.g. for Cobalt giant)
        if (planet.hasRings) {
          ctx.beginPath();
          ctx.ellipse(px, py, pr * 2.1, pr * 0.45, planet.tilt + 0.15, 0, Math.PI * 2);
          ctx.strokeStyle = `${planet.color}0.5)`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.restore();
      }



      // --- Vignette Overlay for perfect readability ---
      const vignGrad = ctx.createRadialGradient(centerX, centerY, width * 0.15, centerX, centerY, maxRadius * 0.9);
      vignGrad.addColorStop(0, palette.vignette[0]);
      vignGrad.addColorStop(0.5, palette.vignette[1]);
      vignGrad.addColorStop(1, palette.vignette[2]);
      
      ctx.fillStyle = vignGrad;
      ctx.fillRect(0, 0, width, height);

      requestRef.current = requestAnimationFrame(render);
    };

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [active, reducedMotion]);

  return (
    <div
      className="space-vortex-container"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#040208',
      }}
    >
      {showVideo && (
        <video
          ref={videoRef}
          src="/grok-video.mp4"
          aria-hidden="true"
          autoPlay
          loop
          muted
          playsInline
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: -1,
            opacity: 0.65,
            pointerEvents: 'none',
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  );
}
