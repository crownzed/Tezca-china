import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Helper to create a soft glowing circle texture for particles and the horizon sun
function createGlowTexture(colorStr = 'rgba(255,255,255,1)', size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
  grad.addColorStop(0, colorStr);
  grad.addColorStop(0.3, colorStr.replace(',1)', ',0.5)'));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Helper to create procedural seamless noise heightmap for water micro-ripples
function createWaterBumpTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Neutral grey heightmap base (corresponds to zero height in bump mapping)
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  // Draw many small overlapping sine-like wave shapes to construct a water ripple heightmap
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 25 + Math.random() * 55;
    
    // Draw a radial gradient centered at x,y that transitions from lighter grey to transparent
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const intensity = 0.06 + Math.random() * 0.14;
    grad.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
    grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Set wrapping modes so it tiles seamlessly across the infinite sea mesh
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export default function DragonPhoenixBackground({ active = true, subtle = false }) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    // Scene setup with deep indigo-black mist
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060210, 0.015);

    // Camera setup - Subtle mode sits further back; login mode has close-up dramatic perspective
    const fov = subtle ? 45 : 55;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
    camera.position.set(0, 6, subtle ? 44 : 32);
    camera.lookAt(0, -2, -15);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    const ambientLight = new THREE.AmbientLight(0x0b061c, 1.2);
    scene.add(ambientLight);

    // Directional light representing sunset glow on waves
    const sunLight = new THREE.DirectionalLight(0xffb700, 2.5);
    sunLight.position.set(0, 10, -50);
    scene.add(sunLight);

    // Subtle blue-teal fill light from the bottom front
    const fillLight = new THREE.DirectionalLight(0x00d2ff, 1.5);
    fillLight.position.set(0, -10, 20);
    scene.add(fillLight);

    // Shiny sun point light to create golden specular highlights on the water
    const sunPointLight = new THREE.PointLight(0xffaa00, 4.0, 150);
    sunPointLight.position.set(0, 3, -48);
    scene.add(sunPointLight);

    // ─── 1. MẶT BIỂN LƯỚI KÉP & ẢNH THỰC TẾ (Double-Grid Moiré Water Plane & Real Image Texture) ───
    // Dựng lưới sóng biển với mật độ segment đủ để uốn mịn
    const GRID_W = 120;
    const GRID_H = 120;
    const SEG_W = 55;
    const SEG_H = 55;
    const waterGeo = new THREE.PlaneGeometry(GRID_W, GRID_H, SEG_W, SEG_H);
    waterGeo.rotateX(-Math.PI / 2); // Nằm ngang làm mặt nước
    waterGeo.translate(0, -4, -10); // Đặt hơi chìm dưới trục camera

    // Load ảnh thực tế bãi biển vô tận để dán lên mặt sóng nước 3D
    const textureLoader = new THREE.TextureLoader();
    const waterTexture = textureLoader.load('/infinite-beach.png');
    waterTexture.colorSpace = THREE.SRGBColorSpace;
    waterTexture.wrapS = THREE.RepeatWrapping;
    waterTexture.wrapT = THREE.RepeatWrapping;
    waterTexture.repeat.set(1, 1);

    // Generate procedural micro-ripples bump map for high frequency details
    const bumpTexture = createWaterBumpTexture();

    // Lớp nền 1: Sử dụng MeshStandardMaterial để phản chiếu ánh sáng óng ánh thật hơn
    const waterMatBase = new THREE.MeshStandardMaterial({
      map: waterTexture,
      bumpMap: bumpTexture,
      bumpScale: 0.18,
      roughness: 0.20, // Bóng bảy phản chiếu tốt
      metalness: 0.15,
      transparent: true,
      opacity: subtle ? 0.35 : 0.88,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const waterMeshBase = new THREE.Mesh(waterGeo, waterMatBase);
    scene.add(waterMeshBase);

    // Lớp lưới 2: Lưới ngọc lam (Teal/Jade) mảnh làm đường dạ quang nổi bật
    const waterMat1 = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      wireframe: true,
      transparent: true,
      opacity: subtle ? 0.05 : 0.16,
      depthWrite: false
    });
    const waterMesh1 = new THREE.Mesh(waterGeo, waterMat1);
    scene.add(waterMesh1);

    // Lớp lưới 3: Lưới xanh dương (Cyan/Indigo) lệch trục nhẹ để tạo hiệu ứng ảo ảnh Moiré khi chuyển động
    const waterMat2 = new THREE.MeshBasicMaterial({
      color: 0x00a2ff,
      wireframe: true,
      transparent: true,
      opacity: subtle ? 0.04 : 0.12,
      depthWrite: false
    });
    const waterMesh2 = new THREE.Mesh(waterGeo, waterMat2);
    waterMesh2.position.y = 0.04;
    scene.add(waterMesh2);

    // ─── 1.5 DỰNG VÒM KHÔNG GIAN VŨ TRỤ (Sky Dome / Space Sphere) ───
    const skyGeo = new THREE.SphereGeometry(150, 32, 32);
    const skyTexture = textureLoader.load('/sky-dome.png');
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide, // Vẽ mặt trong quả cầu bao trùm scene
      depthWrite: false
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyDome);

    // Cache lại mảng vị trí của mesh mặt nước để cập nhật bằng CPU nhanh chóng
    const waterPosAttr = waterGeo.attributes.position;
    const originalPositions = waterPosAttr.clone();

    // ─── 2. HẠT CÁT BIỂN PHÁT SÁNG SINH HỌC (Bioluminescent Sand Particles) ───
    const particleCount = subtle ? 100 : 250;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);
    const particleOffsets = new Float32Array(particleCount);

    const particleGlowTex = createGlowTexture('rgba(0,255,200,1)', 32);

    for (let i = 0; i < particleCount; i++) {
      // Phân bố các hạt cát phát sáng ở khu vực cận cảnh màn hình (bờ biển)
      const x = (Math.random() - 0.5) * 45;
      const y = -5.0 + (Math.random() - 0.5) * 1.5;
      const z = Math.random() * 22 - 6; // Đặt gần camera hơn
      
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;

      particleSpeeds[i] = 0.4 + Math.random() * 0.8;
      particleOffsets[i] = Math.random() * Math.PI * 2;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.45,
      map: particleGlowTex,
      transparent: true,
      opacity: subtle ? 0.25 : 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const sandField = new THREE.Points(particleGeo, particleMat);
    scene.add(sandField);

    // ─── 3. MẶT TRỜI ZEN (Glowing Horizon Sun Ring) ─────────────────────
    const sunRingGeo = new THREE.RingGeometry(5.0, 5.2, 32);
    const sunGlowTex = createGlowTexture('rgba(255,180,0,1)', 64);
    const sunRingMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      map: sunGlowTex,
      transparent: true,
      opacity: subtle ? 0.15 : 0.40,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const sunRing = new THREE.Mesh(sunRingGeo, sunRingMat);
    sunRing.position.set(0, 1.8, -48); // Đặt chính giữa chân trời
    scene.add(sunRing);

    // ─── 4. ĐƯỜNG CẬN CẢNH (Glowing Horizon Line) ──────────────────────
    const horizonGeo = new THREE.PlaneGeometry(100, 0.15);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0xffbb00,
      transparent: true,
      opacity: subtle ? 0.10 : 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const horizonLine = new THREE.Mesh(horizonGeo, horizonMat);
    horizonLine.position.set(0, -3.8, -47.9);
    scene.add(horizonLine);

    // Motion & Mouse check
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const onMouseMove = (event) => {
      // Nhận tọa độ chuột chuẩn hóa từ -1 đến 1
      targetMouseRef.current.x = (event.clientX / window.innerWidth - 0.5) * 2;
      targetMouseRef.current.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    // Render một khung tĩnh duy nhất (dành cho chế độ giảm chuyển động)
    const renderStaticFrame = () => {
      // Tạo sóng biển tĩnh đẹp đẽ
      const time = 12.0;
      const count = waterPosAttr.count;
      for (let i = 0; i < count; i++) {
        const x = originalPositions.getX(i);
        const z = originalPositions.getZ(i);
        
        // Công thức sóng chồng sóng để tạo các vân uốn lượn phong phú
        const w1 = Math.sin(x * 0.08 + time) * Math.cos(z * 0.08 + time) * 1.8;
        const w2 = Math.sin(-x * 0.15 + time * 1.5) * Math.cos(z * 0.12 - time * 0.8) * 0.7;
        const w3 = Math.sin(z * 0.28 + time * 2.0) * 0.3;
        
        waterPosAttr.setY(i, originalPositions.getY(i) + w1 + w2 + w3);
      }
      waterPosAttr.needsUpdate = true;
      waterGeo.computeVertexNormals();

      renderer.render(scene, camera);
    };

    // Animation Loop
    const clock = new THREE.Clock();
    let frameId = null;

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();
      const timeCoeff = subtle ? 0.45 : 0.9; // Sóng lăn tăn chậm hơn khi ở màn hình chính
      const time = elapsed * timeCoeff;

      // 1. CAMERA PARALLAX (Chạy mượt bằng Lerp)
      // Trong subtle mode tắt bớt góc lắc để tránh nhấp nháy khi cuộn trang
      if (!subtle) {
        mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
        mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;
        camera.position.x = mouseRef.current.x * 5;
        camera.position.y = 6 - mouseRef.current.y * 3.5;
        camera.lookAt(0, -2, -15);
      }

      // 2. CẬP NHẬT SÓNG BIỂN BẰNG CÔNG THỨC GERSTNER WAVES
      const count = waterPosAttr.count;
      for (let i = 0; i < count; i++) {
        const x = originalPositions.getX(i);
        const z = originalPositions.getZ(i);
        
        // Sự kết hợp đa tầng Sine để tạo vân giao thoa ảo ảnh thị giác moiré tối ưu
        const w1 = Math.sin(x * 0.07 + time * 1.4) * Math.cos(z * 0.07 + time * 1.1) * 1.9;
        const w2 = Math.sin(-x * 0.13 + time * 1.9) * Math.cos(z * 0.11 - time * 1.3) * 0.8;
        const w3 = Math.sin(z * 0.24 + time * 2.5) * 0.35;
        
        waterPosAttr.setY(i, originalPositions.getY(i) + w1 + w2 + w3);
      }
      waterPosAttr.needsUpdate = true;
      waterGeo.computeVertexNormals();

      // Cát phát sáng dập dềnh theo nhịp sóng cận cảnh
      const sandPositions = particleGeo.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const speed = particleSpeeds[i];
        const offset = particleOffsets[i];
        
        // Dịch chuyển hạt cát theo hình oval nhỏ (tịnh tiến x và y) giả lập bọt dạt bờ
        sandPositions[i * 3] += Math.sin(time * 0.8 * speed + offset) * 0.015;
        sandPositions[i * 3 + 1] += Math.cos(time * 0.6 * speed + offset) * 0.008;
      }
      particleGeo.attributes.position.needsUpdate = true;

      // 3. HIỆU ỨNG MẶT TRỜI ZEN NHẤP NHÁY HÀO QUANG
      const sunScale = 1.0 + Math.sin(time * 1.5) * 0.04;
      sunRing.scale.set(sunScale, sunScale, 1.0);

      // 3.5 XOAY VÒM TRỜI VŨ TRỤ TẠO CHIỀU SÂU (Slow Celestial Rotation)
      skyDome.rotation.y = time * 0.003;
      skyDome.rotation.x = Math.sin(time * 0.001) * 0.03;

      // 3.8 DI CHUYỂN RIPPLES NƯỚC (Drifting micro-ripples texture offset)
      bumpTexture.offset.x = time * 0.015;
      bumpTexture.offset.y = time * 0.02;

      renderer.render(scene, camera);
    };

    const startOrStop = () => {
      cancelAnimationFrame(frameId);
      frameId = null;
      if (motionQuery.matches) {
        window.removeEventListener('pointermove', onMouseMove);
        renderStaticFrame();
      } else {
        window.addEventListener('pointermove', onMouseMove, { passive: true });
        clock.start();
        animate();
      }
    };

    const handleResize = () => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      if (motionQuery.matches) renderStaticFrame();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    motionQuery.addEventListener('change', startOrStop);
    startOrStop();

    // Dọn dẹp tài nguyên khi unmount tránh rò rỉ bộ nhớ (WebGL Memory Leak)
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onMouseMove);
      motionQuery.removeEventListener('change', startOrStop);

      // Geometries
      waterGeo.dispose();
      particleGeo.dispose();
      sunRingGeo.dispose();
      horizonGeo.dispose();
      skyGeo.dispose();

      // Materials
      waterMatBase.dispose();
      waterMat1.dispose();
      waterMat2.dispose();
      particleMat.dispose();
      sunRingMat.dispose();
      horizonMat.dispose();
      skyMat.dispose();

      // Textures
      waterTexture.dispose();
      bumpTexture.dispose();
      particleGlowTex.dispose();
      sunGlowTex.dispose();
      skyTexture.dispose();

      renderer.dispose();
    };
  }, [active, subtle]);

  return (
    <div
      className="dragon-phoenix-container"
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
        background: 'transparent'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: 0.90
        }}
      />
    </div>
  );
}
