// ============================================================
// FISH RENDERER — Canvas2D rendering cho game merge cá
// Vẽ cá, hiệu ứng bơi uốn lượn (wobble), ánh sáng biển sâu,
// bọt nước, vệt di chuyển (trails), flash & ripple khi ghép.
// ============================================================

/** Màu sắc theo tier bộ thủ */
const TIER_COLORS = {
  1: { bg: '#3A80D2', fg: '#FFFFFF', glow: 'rgba(74,144,217,0.5)', ring: '#6BA8ED' },   // Xanh dương — cơ bản
  2: { bg: '#DE935F', fg: '#2C1B10', glow: 'rgba(222,147,95,0.5)', ring: '#EDB58C' },  // Cam ấm — trung cấp
  3: { bg: '#C97A7E', fg: '#2B1214', glow: 'rgba(201,122,126,0.5)', ring: '#E09CA0' }, // Hồng đỏ — hiếm
};

const RESULT_COLOR = { bg: '#EBB305', fg: '#2C1B00', glow: 'rgba(255,215,0,0.65)', ring: '#FFE875' };

/** Danh sách 10 loài cá đặc sắc dựa trên nguyên mẫu pixel art */
export const FISH_SPECIES = [
  'clownfish',  // 1. Cá hề Nemo (cam sọc trắng)
  'anglerfish', // 2. Cá lồng đèn (xanh đen đèn phát sáng)
  'betta',      // 3. Cá xiêm chọi (đỏ/tím vây xòe lớn)
  'pufferfish', // 4. Cá nóc (tròn vàng có gai)
  'koi',        // 5. Cá chép Koi (trắng đốm cam/đen)
  'swordfish',  // 6. Cá kiếm/cá cờ (xanh xám mỏ dài nhọn)
  'lionfish',   // 7. Cá sư tử (sọc nâu/đỏ gai nan quạt)
  'discus',     // 8. Cá dĩa/cá bướm (vàng xanh đốm tròn)
  'angelfish',  // 9. Cá thần tiên (tam giác sọc)
  'oranda',     // 10. Cá vàng đầu lân (u đỏ đuôi voan)
];

/** Tên tiếng Việt các loài cá */
export const SPECIES_NAMES = {
  clownfish: 'Cá Hề Nemo',
  anglerfish: 'Cá Lồng Đèn',
  betta: 'Cá Xiêm Chọi',
  pufferfish: 'Cá Nóc Vàng',
  koi: 'Cá Chép Koi',
  swordfish: 'Cá Kiếm',
  lionfish: 'Cá Sư Tử',
  discus: 'Cá Dĩa',
  angelfish: 'Cá Thần Tiên',
  oranda: 'Cá Vàng Đầu Lân',
};

/** Xác định loài cá dựa trên bộ thủ / trạng thái kết quả */
export function getFishSpecies(fish) {
  if (fish.species) return fish.species;
  if (fish.isResult) {
    const code = (fish.resultChar ? fish.resultChar.charCodeAt(0) : 0) || 0;
    return code % 2 === 0 ? 'oranda' : 'koi';
  }

  const r = fish.radical || '';
  const water = new Set(['氵', '水', '冫', '雨', '鱼', '舟', '海']);
  const fire = new Set(['日', '火', '灬', '目', '光', '赤', '白']);
  const wood = new Set(['木', '艹', '竹', '禾', '米', '纟', '糸', '羽']);
  const human = new Set(['亻', '人', '女', '子', '心', '忄', '口', '言', '讠', '身']);
  const earthMetal = new Set(['土', '石', '金', '钅', '田', '山', '王', '玉']);
  const dangerDark = new Set(['鬼', '黑', '月', '夕', '虫', '爪', '犭', '犬', '骨']);
  const royalPower = new Set(['龙', '马', '鸟', '车', '走', '辶', '门', '贝', '巾']);
  const speedMetal = new Set(['刀', '刂', '力', '戈', '弓', '矢', '矛', '斤']);

  if (water.has(r)) return 'angelfish';
  if (fire.has(r)) return 'lionfish';
  if (wood.has(r)) return 'betta';
  if (human.has(r)) return 'clownfish';
  if (earthMetal.has(r)) return 'pufferfish';
  if (dangerDark.has(r)) return 'anglerfish';
  if (royalPower.has(r)) return 'koi';
  if (speedMetal.has(r)) return 'swordfish';

  // Cá dĩa cho các bộ thủ còn lại dựa trên hash
  const code = r.charCodeAt(0) || 0;
  if (code % 10 === 3 || code % 10 === 7) return 'discus';
  return FISH_SPECIES[code % FISH_SPECIES.length];
}

/* --- Helpers vẽ mắt & miệng cá sinh động --- */
function drawFishEye(ctx, x, y, r, irisColor) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x + r * 0.15, y, r * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = irisColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x + r * 0.35, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x + r * 0.15, y + r * 0.28, r * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function drawFishMouth(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0.2, Math.PI * 0.7);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawNemoStripe(ctx, x1, y1, x2, y2, width, hasBulge = false) {
  ctx.save();
  ctx.beginPath();
  if (hasBulge) {
    ctx.moveTo(x1 - width * 0.4, y1);
    ctx.quadraticCurveTo(x1 + width * 0.6, (y1 + y2) * 0.5, x2 - width * 0.4, y2);
    ctx.lineTo(x2 + width * 0.4, y2);
    ctx.quadraticCurveTo(x1 + width * 1.2, (y1 + y2) * 0.5, x1 + width * 0.4, y1);
  } else {
    ctx.moveTo(x1 - width * 0.5, y1);
    ctx.lineTo(x2 - width * 0.5, y2);
    ctx.lineTo(x2 + width * 0.5, y2);
    ctx.lineTo(x1 + width * 0.5, y1);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/* --- 1. Cá Hề Nemo (Clownfish) --- */
function drawClownfishSpecies(ctx, r, tailWaggle, time, hash) {
  ctx.save();
  ctx.translate(-r * 0.9, 0);
  ctx.rotate(tailWaggle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.5, -r * 0.75, -r * 0.4);
  ctx.quadraticCurveTo(-r * 0.85, 0, -r * 0.75, r * 0.4);
  ctx.quadraticCurveTo(-r * 0.5, r * 0.5, 0, 0);
  ctx.fillStyle = '#FF7A29';
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-r * 0.75, 0, r * 0.4, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.72);
  ctx.quadraticCurveTo(-r * 0.1, -r * 1.15, r * 0.35, -r * 0.75);
  ctx.fillStyle = '#FF7A29';
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.88, 0, 0, Math.PI * 2);
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, '#FF8A3D');
  grad.addColorStop(0.5, '#FF6B1A');
  grad.addColorStop(1, '#E65100');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#C2410C';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  drawNemoStripe(ctx, r * 0.38, -r * 0.82, r * 0.38, r * 0.82, r * 0.22);
  drawNemoStripe(ctx, -r * 0.1, -r * 0.88, -r * 0.1, r * 0.88, r * 0.24, true);
  drawNemoStripe(ctx, -r * 0.65, -r * 0.55, -r * 0.65, r * 0.55, r * 0.18);

  const finFlap = Math.sin(time * 0.009 + hash) * 0.2;
  ctx.save();
  ctx.translate(r * 0.12, r * 0.3);
  ctx.rotate(finFlap);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.22, Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#FF8A3D';
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  drawFishEye(ctx, r * 0.65, -r * 0.18, r * 0.2, '#18181B');
  drawFishMouth(ctx, r * 1.05, r * 0.12, r * 0.16);
}

/* --- 2. Cá Thần Tiên (Angelfish) --- */
function drawAngelfishSpecies(ctx, r, tailWaggle, time, hash) {
  ctx.save();
  ctx.translate(-r * 0.7, 0);
  ctx.rotate(tailWaggle * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.75, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.5, 0, -r * 0.75, r * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
  ctx.fill();
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -r * 0.95);
  ctx.quadraticCurveTo(0, -r * 1.75, -r * 0.7, -r * 1.65);
  ctx.quadraticCurveTo(-r * 0.4, -r * 1.2, -r * 0.5, -r * 0.75);
  ctx.closePath();
  ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-r * 0.2, r * 0.95);
  ctx.quadraticCurveTo(0, r * 1.65, -r * 0.65, r * 1.5);
  ctx.quadraticCurveTo(-r * 0.35, r * 1.1, -r * 0.45, r * 0.7);
  ctx.closePath();
  ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const feelerSway = Math.sin(time * 0.007 + hash) * 6;
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(r * 0.1, r * 0.85);
  ctx.quadraticCurveTo(r * 0.15 + feelerSway, r * 1.5, -r * 0.1 + feelerSway, r * 1.85);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r * 1.15, 0);
  ctx.quadraticCurveTo(r * 0.5, -r * 1.1, -r * 0.2, -r * 1.05);
  ctx.lineTo(-r * 0.75, 0);
  ctx.lineTo(-r * 0.2, r * 1.05);
  ctx.quadraticCurveTo(r * 0.5, r * 1.1, r * 1.15, 0);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
  bodyGrad.addColorStop(0, '#BFDBFE');
  bodyGrad.addColorStop(0.5, '#60A5FA');
  bodyGrad.addColorStop(1, '#2563EB');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#1D4ED8';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(r * 0.55, -r * 0.85);
  ctx.lineTo(r * 0.55, r * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.0);
  ctx.lineTo(0, r * 1.0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, -r * 0.5);
  ctx.lineTo(-r * 0.45, r * 0.5);
  ctx.stroke();

  drawFishEye(ctx, r * 0.6, -r * 0.12, r * 0.19, '#1E3A8A');
  drawFishMouth(ctx, r * 1.12, r * 0.05, r * 0.12);
}

/* --- 3. Cá Sư Tử (Lionfish) --- */
function drawLionfishSpecies(ctx, r, tailWaggle, time, hash) {
  const spineCount = 8;
  ctx.save();
  for (let i = 0; i < spineCount; i++) {
    const angle = -Math.PI * 0.85 + (i / (spineCount - 1)) * Math.PI * 0.75;
    const sway = Math.sin(time * 0.008 + i * 0.5 + hash) * 0.05;
    const len = r * (1.3 + (i % 2) * 0.35);
    const startX = -r * 0.5 + i * (r * 0.95 / spineCount);
    const startY = -r * 0.65;

    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angle + sway);
    ctx.strokeStyle = i % 2 === 0 ? '#B91C1C' : '#FEF3C7';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(len, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(-r * 0.8, 0);
  ctx.rotate(tailWaggle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.75, -r * 0.5);
  ctx.quadraticCurveTo(-r * 0.55, 0, -r * 0.75, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(185, 28, 28, 0.7)';
  ctx.fill();
  ctx.strokeStyle = '#FEF3C7';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.1, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FEF3C7';
  ctx.fill();
  ctx.strokeStyle = '#991B1B';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#991B1B';
  ctx.lineWidth = 3.5;
  [-r * 0.45, -r * 0.2, r * 0.08, r * 0.35].forEach((sx) => {
    ctx.beginPath();
    ctx.moveTo(sx, -r * 0.75);
    ctx.quadraticCurveTo(sx + r * 0.1, 0, sx - r * 0.05, r * 0.75);
    ctx.stroke();
  });

  ctx.save();
  ctx.translate(r * 0.1, r * 0.25);
  ctx.rotate(Math.sin(time * 0.009 + hash) * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 0.45, r * 0.4);
  ctx.lineTo(r * 0.15, r * 0.6);
  ctx.lineTo(-r * 0.2, r * 0.45);
  ctx.closePath();
  ctx.fillStyle = 'rgba(185, 28, 28, 0.75)';
  ctx.fill();
  ctx.strokeStyle = '#FEF3C7';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  drawFishEye(ctx, r * 0.6, -r * 0.15, r * 0.19, '#7F1D1D');
  drawFishMouth(ctx, r * 1.05, r * 0.1, r * 0.15);
}

/* --- 4. Cá Nóc Vàng (Pufferfish) --- */
function drawPufferfishSpecies(ctx, r, tailWaggle, time, hash) {
  const sphereR = r * 0.98;

  const spikeCount = 12;
  ctx.fillStyle = '#D97706';
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2;
    if (angle > -0.35 && angle < 0.35) continue;
    const px = Math.cos(angle) * sphereR;
    const py = Math.sin(angle) * sphereR;
    const tipX = Math.cos(angle) * (sphereR + r * 0.22);
    const tipY = Math.sin(angle) * (sphereR + r * 0.22);
    const perpX = -Math.sin(angle) * (r * 0.09);
    const perpY = Math.cos(angle) * (r * 0.09);

    ctx.beginPath();
    ctx.moveTo(px + perpX, py + perpY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(px - perpX, py - perpY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.save();
  ctx.translate(-sphereR * 0.9, 0);
  ctx.rotate(tailWaggle * 1.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.45, -r * 0.3);
  ctx.quadraticCurveTo(-r * 0.35, 0, -r * 0.45, r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#F59E0B';
  ctx.fill();
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, sphereR, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(r * 0.2, -r * 0.2, r * 0.1, 0, 0, sphereR);
  grad.addColorStop(0, '#FEF08A');
  grad.addColorStop(0.6, '#FBBF24');
  grad.addColorStop(1, '#D97706');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.32, r * 0.55, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
  ctx.fill();

  drawFishEye(ctx, sphereR * 0.5, -sphereR * 0.25, r * 0.24, '#18181B');

  ctx.beginPath();
  ctx.ellipse(sphereR * 0.95, sphereR * 0.12, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#92400E';
  ctx.fill();
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  ctx.translate(r * 0.1, r * 0.3);
  ctx.rotate(Math.sin(time * 0.02 + hash) * 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.2, r * 0.13, Math.PI * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = '#FCD34D';
  ctx.fill();
  ctx.strokeStyle = '#B45309';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/* --- 5. Cá Xiêm Chọi (Betta) — đỏ/tím vây xòe lớn như pixel art --- */
function drawBettaSpecies(ctx, r, tailWaggle, time, hash) {
  ctx.save();
  ctx.translate(-r * 0.7, 0);
  ctx.rotate(tailWaggle);

  const wave2 = Math.sin(time * 0.014 + hash) * 0.15;
  const lobes = 6;
  for (let i = 0; i < lobes; i++) {
    const lobeAngle = -Math.PI * 0.5 + (i / (lobes - 1)) * Math.PI + wave2;
    ctx.save();
    ctx.rotate(lobeAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.8, -r * 0.4, -r * 1.5, 0);
    ctx.quadraticCurveTo(-r * 0.8, r * 0.4, 0, 0);
    // Màu đỏ/tím đậm giống pixel art
    const tailGrad = ctx.createLinearGradient(0, 0, -r * 1.5, 0);
    tailGrad.addColorStop(0, '#DC2626');
    tailGrad.addColorStop(0.4, '#BE123C');
    tailGrad.addColorStop(0.7, '#9F1239');
    tailGrad.addColorStop(1, '#881337');
    ctx.fillStyle = tailGrad;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vây lưng lớn màu đỏ
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.7);
  ctx.quadraticCurveTo(-r * 0.05, -r * 1.45, -r * 0.85, -r * 1.25);
  ctx.quadraticCurveTo(-r * 0.55, -r * 0.85, -r * 0.55, -r * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
  ctx.fill();

  // Vây bụng dài
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, r * 0.7);
  ctx.quadraticCurveTo(0.05, r * 1.55, -r * 0.65, r * 1.35);
  ctx.quadraticCurveTo(-r * 0.35, r * 0.95, -r * 0.35, r * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(190, 18, 60, 0.9)';
  ctx.fill();

  // Thân cá màu đỏ/tím đậm
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.1, r * 0.75, 0, 0, Math.PI * 2);
  const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
  bodyGrad.addColorStop(0, '#EF4444');
  bodyGrad.addColorStop(0.5, '#DC2626');
  bodyGrad.addColorStop(1, '#991B1B');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#7F1D1D';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawFishEye(ctx, r * 0.62, -r * 0.14, r * 0.19, '#450A0A');
  drawFishMouth(ctx, r * 1.06, r * 0.1, r * 0.15);
}

/* --- 6. Cá Chép Koi (Koi) --- */
function drawKoiSpecies(ctx, r, tailWaggle, time, hash) {
  ctx.save();
  ctx.translate(-r * 0.9, 0);
  ctx.rotate(tailWaggle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.55, -r * 0.85, -r * 0.45);
  ctx.quadraticCurveTo(-r * 0.65, 0, -r * 0.85, r * 0.45);
  ctx.quadraticCurveTo(-r * 0.5, r * 0.55, 0, 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.25, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.ellipse(r * 0.45, -r * 0.15, r * 0.38, r * 0.28, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 0.2, r * 0.45, r * 0.3, -Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#18181B';
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, r * 0.2, r * 0.25, r * 0.18, Math.PI * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.55, r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 1.5;
  const whiskerSway = Math.sin(time * 0.01 + hash) * 3;
  ctx.beginPath();
  ctx.moveTo(r * 1.1, r * 0.15);
  ctx.quadraticCurveTo(r * 1.3, r * 0.25 + whiskerSway, r * 1.38, r * 0.45);
  ctx.stroke();

  ctx.save();
  ctx.translate(r * 0.15, r * 0.35);
  ctx.rotate(Math.sin(time * 0.009 + hash) * 0.18);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.35, r * 0.2, Math.PI * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  drawFishEye(ctx, r * 0.72, -r * 0.18, r * 0.19, '#18181B');
  drawFishMouth(ctx, r * 1.18, r * 0.08, r * 0.14);
}

/* --- 7. Cá Lồng Đèn (Anglerfish) --- */
function drawAnglerfishSpecies(ctx, r, tailWaggle, time, hash) {
  const escaWave = Math.sin(time * 0.007 + hash) * 4;
  ctx.save();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(r * 0.35, -r * 0.75);
  ctx.quadraticCurveTo(r * 0.75, -r * 1.65 + escaWave, r * 1.35, -r * 0.45 + escaWave);
  ctx.stroke();

  const bulbX = r * 1.35;
  const bulbY = -r * 0.45 + escaWave;
  ctx.shadowColor = '#06B6D4';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(bulbX, bulbY, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#22D3EE';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bulbX, bulbY, r * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.translate(-r * 0.8, 0);
  ctx.rotate(tailWaggle * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.55, -r * 0.4);
  ctx.lineTo(-r * 0.55, r * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#1E293B';
  ctx.fill();
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.92, 0, 0, Math.PI * 2);
  const darkGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.15);
  darkGrad.addColorStop(0, '#1E293B');
  darkGrad.addColorStop(1, '#090D16');
  ctx.fillStyle = darkGrad;
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(r * 0.65, r * 0.05);
  ctx.lineTo(r * 1.15, r * 0.05);
  ctx.lineTo(r * 1.1, r * 0.45);
  ctx.lineTo(r * 0.65, r * 0.35);
  ctx.closePath();
  ctx.fillStyle = '#450A0A';
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  for (let t = 0; t < 4; t++) {
    const tx = r * 0.72 + t * (r * 0.12);
    ctx.beginPath();
    ctx.moveTo(tx - 2, r * 0.4);
    ctx.lineTo(tx, r * 0.12);
    ctx.lineTo(tx + 2, r * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawFishEye(ctx, r * 0.55, -r * 0.25, r * 0.18, '#0891B2');
}

/* --- 8. Cá Vàng Đầu Lân (Oranda) --- */
function drawOrandaSpecies(ctx, r, tailWaggle, time, hash) {
  ctx.save();
  ctx.translate(-r * 0.75, 0);
  ctx.rotate(tailWaggle * 1.1);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.7, -r * 0.85, -r * 1.25, -r * 0.65);
  ctx.quadraticCurveTo(-r * 0.65, -r * 0.15, 0, 0);
  const tailGrad1 = ctx.createLinearGradient(0, 0, -r * 1.25, -r * 0.65);
  tailGrad1.addColorStop(0, '#F97316');
  tailGrad1.addColorStop(0.7, '#FED7AA');
  tailGrad1.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = tailGrad1;
  ctx.globalAlpha = 0.85;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.7, r * 0.85, -r * 1.25, r * 0.65);
  ctx.quadraticCurveTo(-r * 0.65, r * 0.15, 0, 0);
  ctx.fillStyle = tailGrad1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.12, r * 0.95, 0, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.12);
  bodyGrad.addColorStop(0, '#FED7AA');
  bodyGrad.addColorStop(0.5, '#F97316');
  bodyGrad.addColorStop(1, '#C2410C');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  const wenNodes = [
    { x: r * 0.35, y: -r * 0.7, r: r * 0.28 },
    { x: r * 0.58, y: -r * 0.62, r: r * 0.25 },
    { x: r * 0.2, y: -r * 0.78, r: r * 0.24 },
    { x: r * 0.45, y: -r * 0.9, r: r * 0.22 },
    { x: r * 0.7, y: -r * 0.45, r: r * 0.2 },
  ];
  ctx.fillStyle = '#DC2626';
  for (const n of wenNodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#F87171';
  for (const n of wenNodes) {
    ctx.beginPath();
    ctx.arc(n.x - n.r * 0.25, n.y - n.r * 0.25, n.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawFishEye(ctx, r * 0.65, -r * 0.12, r * 0.22, '#18181B');
  drawFishMouth(ctx, r * 1.05, r * 0.15, r * 0.16);

  ctx.save();
  ctx.translate(r * 0.1, r * 0.38);
  ctx.rotate(Math.sin(time * 0.009 + hash) * 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.34, r * 0.22, Math.PI * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(254, 215, 170, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#EA580C';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/* --- 9. Cá Kiếm / Cá Cờ (Swordfish/Marlin) — xanh xám mỏ dài nhọn --- */
function drawSwordfishSpecies(ctx, r, tailWaggle, time, hash) {
  // Đuôi hình lưỡi liềm
  ctx.save();
  ctx.translate(-r * 1.0, 0);
  ctx.rotate(tailWaggle * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.35, -r * 0.7, -r * 0.55, -r * 0.85);
  ctx.quadraticCurveTo(-r * 0.25, -r * 0.3, 0, 0);
  ctx.quadraticCurveTo(-r * 0.25, r * 0.3, -r * 0.55, r * 0.85);
  ctx.quadraticCurveTo(-r * 0.35, r * 0.7, 0, 0);
  const tailGrad = ctx.createLinearGradient(0, -r * 0.85, 0, r * 0.85);
  tailGrad.addColorStop(0, '#475569');
  tailGrad.addColorStop(0.5, '#64748B');
  tailGrad.addColorStop(1, '#475569');
  ctx.fillStyle = tailGrad;
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Vây lưng cao hình tam giác
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.55);
  ctx.lineTo(-r * 0.1, -r * 1.15);
  ctx.lineTo(r * 0.25, -r * 0.55);
  ctx.closePath();
  ctx.fillStyle = '#475569';
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Thân cá thuôn dài khí động học
  ctx.beginPath();
  ctx.moveTo(r * 1.6, 0);  // Mũi kiếm
  ctx.quadraticCurveTo(r * 0.8, -r * 0.65, 0, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.6, -r * 0.45, -r * 1.0, 0);
  ctx.quadraticCurveTo(-r * 0.6, r * 0.45, 0, r * 0.55);
  ctx.quadraticCurveTo(r * 0.8, r * 0.65, r * 1.6, 0);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
  bodyGrad.addColorStop(0, '#64748B');
  bodyGrad.addColorStop(0.35, '#94A3B8');
  bodyGrad.addColorStop(0.5, '#CBD5E1');
  bodyGrad.addColorStop(0.65, '#94A3B8');
  bodyGrad.addColorStop(1, '#475569');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Đường sọc ngang phân chia lưng/bụng
  ctx.beginPath();
  ctx.moveTo(r * 1.4, 0);
  ctx.quadraticCurveTo(r * 0.5, r * 0.08, -r * 0.8, 0);
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Vây ngực nhỏ
  ctx.save();
  ctx.translate(r * 0.15, r * 0.25);
  ctx.rotate(Math.sin(time * 0.01 + hash) * 0.15 + 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.28, r * 0.12, Math.PI * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#64748B';
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Mắt sắc bén
  drawFishEye(ctx, r * 0.75, -r * 0.15, r * 0.16, '#1E293B');

  // Miệng nhỏ
  ctx.beginPath();
  ctx.moveTo(r * 1.55, r * 0.02);
  ctx.lineTo(r * 1.6, 0);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* --- 10. Cá Dĩa (Discus Fish) — thân tròn dẹp, da cam vân sóng xanh ngọc lam biếc --- */
function drawDiscusSpecies(ctx, r, tailWaggle, time, hash) {
  // 1. Vây đuôi hình quạt tròn sọc cam
  ctx.save();
  ctx.translate(-r * 0.8, 0);
  ctx.rotate(tailWaggle * 1.1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-r * 0.35, -r * 0.45, -r * 0.55, -r * 0.4);
  ctx.quadraticCurveTo(-r * 0.45, 0, -r * 0.55, r * 0.4);
  ctx.quadraticCurveTo(-r * 0.35, r * 0.45, 0, 0);
  ctx.fillStyle = '#EA580C';
  ctx.fill();
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // 2. Vây lưng và vây bụng ôm tròn sát thân theo chu vi đĩa
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.75);
  ctx.quadraticCurveTo(0, -r * 1.15, r * 0.4, -r * 0.72);
  ctx.quadraticCurveTo(r * 0.1, -r * 0.85, -r * 0.5, -r * 0.75);
  ctx.fillStyle = '#EA580C';
  ctx.fill();
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.75);
  ctx.quadraticCurveTo(0, r * 1.12, r * 0.35, r * 0.72);
  ctx.quadraticCurveTo(r * 0.1, r * 0.85, -r * 0.45, r * 0.75);
  ctx.fillStyle = '#EA580C';
  ctx.fill();
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Thân cá đĩa tròn xoe phẳng
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.96, 0, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(r * 0.2, -r * 0.1, r * 0.1, 0, 0, r * 1.05);
  bodyGrad.addColorStop(0, '#FBBF24');
  bodyGrad.addColorStop(0.5, '#F97316');
  bodyGrad.addColorStop(1, '#C2410C');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#9A3412';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 4. Các đường vân sóng xanh ngọc lam (Electric Turquoise Zebra Stripes) đặc trưng cá đĩa
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';

  const stripeLevels = [-r * 0.7, -r * 0.48, -r * 0.25, -r * 0.05, r * 0.18, r * 0.42, r * 0.65];
  for (let idx = 0; idx < stripeLevels.length; idx++) {
    const yLvl = stripeLevels[idx];
    const waveFreq = 0.05;
    const wavePhase = idx * 1.2;

    ctx.beginPath();
    const startX = -r * 0.75 + Math.abs(yLvl) * 0.3;
    const endX = r * 0.7 - Math.abs(yLvl) * 0.25;

    for (let curX = startX; curX <= endX; curX += 8) {
      const curY = yLvl + Math.sin(curX * waveFreq + wavePhase) * (r * 0.09);
      if (curX === startX) ctx.moveTo(curX, curY);
      else ctx.lineTo(curX, curY);
    }
    ctx.stroke();
  }

  // 5. Vây ngực tròn mềm
  ctx.save();
  ctx.translate(r * 0.12, r * 0.15);
  ctx.rotate(Math.sin(time * 0.01 + hash) * 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.26, r * 0.16, Math.PI * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#2DD4BF';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // 6. Mắt đỏ hổ phách long lanh
  drawFishEye(ctx, r * 0.56, -r * 0.12, r * 0.21, '#7C2D12');

  // 7. Miệng nhỏ xinh
  drawFishMouth(ctx, r * 0.98, r * 0.1, r * 0.12);
}

/** Kích thước cá (normalized 0-1, scale theo canvas size) */
const FISH_RADIUS_BASE = 0.045;
// Tối thiểu 24px để đường kính đạt ≥48px (đáp ứng chuẩn mobile touch target ≥44px)
const FISH_RADIUS_MIN_PX = 24;

/** Kiểm tra chế độ prefers-reduced-motion của thiết bị (cached) */
let _reducedMotionCached = null;
function isReducedMotion() {
  if (_reducedMotionCached !== null) return _reducedMotionCached;
  if (typeof window === 'undefined' || !window.matchMedia) {
    _reducedMotionCached = false;
    return false;
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reducedMotionCached = mql.matches;
  // Listen for changes (user toggles setting)
  try {
    mql.addEventListener('change', (e) => { _reducedMotionCached = e.matches; });
  } catch {
    // Older browsers fallback
  }
  return _reducedMotionCached;
}

// Eagerly initialize on module load để hot path chỉ đọc boolean, không gọi function
const REDUCED_MOTION = isReducedMotion();

/**
 * Khởi tạo renderer. Trả về object với các method render/update/effect.
 * @param {HTMLCanvasElement} canvas
 */
export function createFishRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  // Visual effects list (ripple, flash, particles)
  const visualEffects = [];
  // Trails list for fast/dragged fish
  const trails = [];
  // Interactive water ripples
  const waterRipples = [];
  // Bioluminescent motes (phù du phát quang)
  const motes = Array.from({ length: 22 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    r: 1.2 + (i % 4) * 0.6,
    speedY: -0.0003 - (i % 3) * 0.0002,
    driftFreq: 0.001 + (i % 5) * 0.0005,
    phase: i * 1.37,
    hue: i % 3 === 0 ? '255, 225, 120' : '100, 240, 230', // vàng kim hoặc xanh ngọc
  }));

  /** Resize canvas theo container cha một cách an toàn (tránh recursion loop) */
  function resize() {
    const parent = canvas.parentElement || canvas;
    const rect = parent.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(Math.round(rect.width), 300);
    height = Math.max(Math.round(rect.height), 300);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  /** Tính bán kính cá thực tế (px) */
  function fishRadius() {
    const r = Math.min(width, height) * FISH_RADIUS_BASE;
    return Math.max(r, FISH_RADIUS_MIN_PX);
  }

  /** Convert normalized position (0-1) → pixel */
  function toPixel(nx, ny) {
    return { x: nx * width, y: ny * height };
  }

  /** Convert pixel → normalized */
  function toNormalized(px, py) {
    return { x: width > 0 ? px / width : 0, y: height > 0 ? py / height : 0 };
  }

  /** Tạo sóng nước tương tác khi chạm/click */
  function addWaterRipple(px, py) {
    if (REDUCED_MOTION) return;
    if (waterRipples.length > 8) waterRipples.shift();
    waterRipples.push({
      x: px,
      y: py,
      r: 4,
      maxR: fishRadius() * 2.8,
      alpha: 0.7,
      speed: 1.6,
    });
  }

  /** Hit test: kiểm tra điểm (px, py) có chạm vào cá nào không (touch margin +12px) */
  function hitTest(fishList, px, py, excludeId = null) {
    const r = fishRadius();
    const hitR = r * 1.25 + 8;
    const hitR2 = hitR * hitR;

    for (let i = fishList.length - 1; i >= 0; i--) {
      const f = fishList[i];
      if (f.id === excludeId) continue;
      const pos = toPixel(f.x, f.y);
      const dx = px - pos.x;
      const dy = py - pos.y;
      if (dx * dx + dy * dy <= hitR2) {
        return f;
      }
    }
    return null;
  }

  /** Kích hoạt hiệu ứng Merge Success tại vị trí normalized x, y */
  function triggerMergeSuccess(nx, ny) {
    const pos = toPixel(nx, ny);
    const reduced = REDUCED_MOTION;
    visualEffects.push({
      type: 'merge-success',
      x: pos.x,
      y: pos.y,
      startTime: performance.now(),
      duration: reduced ? 300 : 800,
    });

    // Tạo chùm hạt lấp lánh nở bung
    if (!reduced) {
      const particleCount = 18;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const speed = 1.8 + Math.random() * 3.2;
        visualEffects.push({
          type: 'sparkle',
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 3,
          color: Math.random() > 0.35 ? '#FFD700' : '#FFFFFF',
          startTime: performance.now(),
          duration: 600 + Math.random() * 400,
        });
      }
    }
  }

  /** Kích hoạt rung lắc khi merge fail */
  function triggerMergeFail(fishIds, fishList) {
    const now = performance.now();
    const idSet = new Set(fishIds);
    for (const f of fishList) {
      if (idSet.has(f.id)) {
        f.shakeUntil = now + 450;
      }
    }
  }

  /** Thêm hạt vệt nước (trail) sau cá */
  function addTrail(px, py, r) {
    if (REDUCED_MOTION) return;
    if (trails.length > 30) trails.shift();
    trails.push({
      x: px + (Math.random() - 0.5) * r * 0.4,
      y: py + (Math.random() - 0.5) * r * 0.4,
      r: 1.8 + Math.random() * 2.8,
      alpha: 0.5,
      decay: 0.022 + Math.random() * 0.02,
    });
  }

  /** Vẽ tia năng lượng ma thuật (Fusion Ray) nối các cá được chọn hoặc kéo gần nhau */
  function drawFusionRay(fish1, fish2, time) {
    const p1 = toPixel(fish1.x, fish1.y);
    const p2 = toPixel(fish2.x, fish2.y);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;

    // Proximity intensity: càng gần càng sáng/mạnh
    const maxDist = Math.min(width, height) * 0.4;
    const proximity = Math.max(0, 1 - dist / maxDist);
    const intensityBoost = 1 + proximity * 0.8;

    ctx.save();
    // Vầng hào quang sáng của tia nối
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(74, 180, 255, ${0.35 * intensityBoost})`;
    ctx.lineWidth = 6 + proximity * 4;
    ctx.stroke();

    // Tia sét thủy quang uốn sóng ở giữa
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    const segments = 6;
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const midX = p1.x + dx * t;
      const midY = p1.y + dy * t;
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const wave = Math.sin(time * 0.015 + i * 1.5) * 6;
      ctx.lineTo(midX + perpX * wave, midY + perpY * wave);
    }
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(255, 235, 120, ${Math.min(1, 0.85 * intensityBoost)})`;
    ctx.lineWidth = 2.2 + proximity * 1.5;
    ctx.stroke();

    // Hạt năng lượng chạy dọc theo tia
    const flowT = (time * 0.0015) % 1;
    const sparkX = p1.x + dx * flowT;
    const sparkY = p1.y + dy * flowT;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  /** Vẽ mạng lưới khúc xạ ánh sáng (Water Caustics) trên nền cát đáy biển */
  function drawWaterCaustics(time) {
    if (REDUCED_MOTION) return;
    const reducedTime = time * 0.0008;
    const seabedY = height - 70;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, seabedY, width, height - seabedY);
    ctx.clip();

    ctx.strokeStyle = 'rgba(140, 215, 255, 0.08)';
    ctx.lineWidth = 1.2;

    const spacing = 45;
    for (let x = -spacing; x < width + spacing; x += spacing) {
      ctx.beginPath();
      for (let y = seabedY; y < height; y += 12) {
        const waveX = x + Math.sin(y * 0.05 + reducedTime) * 12 + Math.cos(x * 0.03 + reducedTime * 0.8) * 8;
        if (y === seabedY) ctx.moveTo(waveX, y);
        else ctx.lineTo(waveX, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Vẽ sinh vật phù du phát quang (Bioluminescent Motes) */
  function drawBioluminescentMotes(time) {
    const reduced = REDUCED_MOTION;
    for (const m of motes) {
      if (!reduced) {
        m.y += m.speedY;
        if (m.y < -0.05) m.y = 1.05;
      }
      const px = (m.x * width + (reduced ? 0 : Math.sin(time * m.driftFreq + m.phase) * 18)) % width;
      const py = m.y * height;
      const alphaPulse = reduced ? 0.35 : 0.25 + Math.sin(time * 0.003 + m.phase) * 0.2;

      ctx.beginPath();
      ctx.arc(px, py, m.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${m.hue}, ${alphaPulse})`;
      ctx.shadowColor = `rgba(${m.hue}, 0.6)`;
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  /** Vẽ đáy bể cá (lớp cát uốn lượn, rong biển đung đưa, san hô & sỏi) */
  function drawSeabed(time) {
    const reduced = REDUCED_MOTION;
    const seabedY = height - 48;

    // 1. Lớp cát đáy biển (soft wavy sand dune)
    const sandGrad = ctx.createLinearGradient(0, seabedY - 12, 0, height);
    sandGrad.addColorStop(0, '#0a1a2e');
    sandGrad.addColorStop(0.35, '#10243b');
    sandGrad.addColorStop(1, '#183350');

    ctx.fillStyle = sandGrad;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, seabedY + 5);
    ctx.quadraticCurveTo(width * 0.25, seabedY - 10, width * 0.5, seabedY + 2);
    ctx.quadraticCurveTo(width * 0.75, seabedY + 14, width, seabedY - 4);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Gân sáng phản quang mặt cát
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, seabedY + 5);
    ctx.quadraticCurveTo(width * 0.25, seabedY - 10, width * 0.5, seabedY + 2);
    ctx.quadraticCurveTo(width * 0.75, seabedY + 14, width, seabedY - 4);
    ctx.stroke();

    // 2. Caustics phản quang
    drawWaterCaustics(time);

    // 3. Rong biển đung đưa mềm mại (Swaying seaweeds)
    const seaweedCount = 7;
    for (let s = 0; s < seaweedCount; s++) {
      const rootX = (s + 0.5) * (width / (seaweedCount + 0.1));
      const sway = reduced ? 0 : Math.sin(time * 0.002 + s * 1.4) * 18;
      const bladeH = 60 + (s % 3) * 22;

      ctx.save();
      const weedGrad = ctx.createLinearGradient(rootX, height, rootX + sway, height - bladeH);
      weedGrad.addColorStop(0, 'rgba(12, 68, 48, 0.9)');
      weedGrad.addColorStop(0.5, 'rgba(22, 115, 80, 0.8)');
      weedGrad.addColorStop(1, 'rgba(42, 168, 115, 0.65)');

      ctx.fillStyle = weedGrad;
      ctx.beginPath();
      ctx.moveTo(rootX - 5, height);
      ctx.quadraticCurveTo(rootX + sway * 0.5 - 6, height - bladeH * 0.5, rootX + sway, height - bladeH);
      ctx.quadraticCurveTo(rootX + sway * 0.5 + 4, height - bladeH * 0.5, rootX + 5, height);
      ctx.closePath();
      ctx.fill();

      // Cánh rong biển phụ
      const sway2 = reduced ? 0 : Math.sin(time * 0.0022 + s * 1.4 + 0.9) * 14;
      const bladeH2 = bladeH * 0.76;
      ctx.beginPath();
      ctx.moveTo(rootX - 2, height);
      ctx.quadraticCurveTo(rootX + sway2 * 0.5 - 4, height - bladeH2 * 0.5, rootX + sway2 - 10, height - bladeH2);
      ctx.quadraticCurveTo(rootX + sway2 * 0.5 + 3, height - bladeH2 * 0.5, rootX + 6, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 4. San hô & sỏi trang trí
    const corals = [
      { x: width * 0.1, color: 'rgba(195, 95, 125, 0.7)', r: 10 },
      { x: width * 0.35, color: 'rgba(65, 160, 145, 0.6)', r: 8 },
      { x: width * 0.65, color: 'rgba(215, 145, 75, 0.65)', r: 11 },
      { x: width * 0.88, color: 'rgba(150, 95, 185, 0.65)', r: 9 },
    ];

    for (const c of corals) {
      ctx.beginPath();
      ctx.arc(c.x, height - 14, c.r, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();

      // Sỏi nhỏ
      ctx.beginPath();
      ctx.arc(c.x + c.r * 1.25, height - 8, c.r * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 180, 210, 0.35)';
      ctx.fill();
    }
  }

  /** Vẽ background đại dương sâu + ánh sáng mặt trời + bong bóng + phù du + đáy biển */
  function drawBackground(time) {
    // 1. Gradient biển sâu dịu mắt
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#040b15');
    grad.addColorStop(0.25, '#071629');
    grad.addColorStop(0.65, '#0a203a');
    grad.addColorStop(1, '#0f2948');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const reduced = REDUCED_MOTION;

    // 2. Tia sáng mặt trời rọi xuống nước (Sunbeams)
    const beamCount = 4;
    ctx.save();
    for (let i = 0; i < beamCount; i++) {
      const offset = (i * 0.28 + (reduced ? 0 : Math.sin(time * 0.0006 + i) * 0.04)) * width;
      const beamGrad = ctx.createLinearGradient(offset, 0, offset + 70, height * 0.88);
      beamGrad.addColorStop(0, 'rgba(175, 225, 255, 0.075)');
      beamGrad.addColorStop(0.45, 'rgba(150, 210, 255, 0.028)');
      beamGrad.addColorStop(1, 'rgba(150, 210, 255, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(offset - 20, 0);
      ctx.lineTo(offset + 70, 0);
      ctx.lineTo(offset + 160, height);
      ctx.lineTo(offset + 10, height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 3. Phù du phát quang trôi nổi
    drawBioluminescentMotes(time);

    // 4. Bong bóng nước bồng bềnh
    const bubbleCount = 14;
    for (let i = 0; i < bubbleCount; i++) {
      const seed = i * 79.19;
      const speed = 0.018 + (i % 5) * 0.006;
      const cycleY = height + 40;
      const by = cycleY - ((time * speed + seed) % cycleY) - 10;
      const drift = reduced ? 0 : Math.sin(time * 0.0015 + i) * 14;
      const bx = (seed * 11 + drift) % width;
      const br = 2.4 + (i % 4) * 1.8;

      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 0.75;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx - br * 0.35, by - br * 0.35, Math.max(0.75, br * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();
    }

    // 5. Cập nhật và vẽ vệt nước (trails)
    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i];
      t.alpha -= t.decay;
      t.y -= 0.3;
      if (t.alpha <= 0) {
        trails.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190, 235, 255, ${t.alpha * 0.55})`;
      ctx.fill();
    }

    // 6. Sóng nước tương tác khi chạm (Water ripples)
    for (let i = waterRipples.length - 1; i >= 0; i--) {
      const rip = waterRipples[i];
      rip.r += rip.speed;
      rip.alpha = Math.max(0, 0.7 * (1 - rip.r / rip.maxR));

      if (rip.r >= rip.maxR || rip.alpha <= 0) {
        waterRipples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160, 225, 255, ${rip.alpha})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    // 7. Đáy cát, rong biển, san hô
    drawSeabed(time);
  }

  /** Vẽ một chú cá hoạt họa mỹ thuật cao cấp (Cá tiên lụa / Cá rồng thần) */
  function drawFish(fish, isSelected, isDragTarget, time) {
    const baseR = fishRadius();
    const pos = toPixel(fish.x, fish.y);
    const colors = fish.isResult ? RESULT_COLOR : (TIER_COLORS[fish.tier] || TIER_COLORS[1]);
    const reduced = REDUCED_MOTION;

    // Rung lắc khi merge fail (decay dần)
    let shakeOffset = 0;
    if (fish.shakeUntil && fish.shakeUntil > time) {
      const progress = (fish.shakeUntil - time) / 450;
      shakeOffset = Math.sin((fish.shakeUntil - time) * 0.08) * 8 * progress;
    }

    // Hướng bơi mặt cá
    const facingRight = (fish.vx || 0.01) >= 0;

    // Góc nghiêng khi bơi (banking tilt) + dao động bơi tự nhiên (wobble)
    const hash = (fish.id ? fish.id.charCodeAt(fish.id.length - 1) : 0) * 0.7;
    const wobbleAngle = (reduced || fish.isDragging)
      ? (fish.bankTilt || 0)
      : (fish.bankTilt || 0) + Math.sin(time * 0.005 + hash) * 0.08;
    const tailWaggle = (reduced || fish.isDragging)
      ? 0
      : Math.sin(time * 0.012 + hash) * 0.32;

    const wobbleScale = reduced
      ? 1
      : 1 + Math.sin(time * 0.006 + hash) * 0.028;

    // Spawn animation: scale 0→1 + fade in trong 500ms đầu tiên
    let spawnScale = 1;
    let spawnAlpha = 1;
    if (fish.createdAt) {
      const age = time - fish.createdAt;
      if (age < 500) {
        const t = age / 500;
        // Elastic ease-out cho cảm giác "bong bóng nổi lên"
        spawnScale = reduced ? t : 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 1.5);
        spawnAlpha = Math.min(1, t * 2); // Fade in nhanh hơn scale
      }
    }

    const currentR = baseR * (fish.scale || 1) * (fish.isDragging ? 1.16 : wobbleScale) * spawnScale;
    const drawX = pos.x + shakeOffset;
    const drawY = pos.y;

    // Emit trail khi kéo cá
    if (fish.isDragging) {
      addTrail(drawX, drawY, baseR);
    }

    ctx.save();
    if (spawnAlpha < 1) ctx.globalAlpha = spawnAlpha;
    ctx.translate(drawX, drawY);
    ctx.rotate(wobbleAngle);

    // Lật cá theo hướng bơi
    ctx.scale(facingRight ? 1 : -1, 1);

    // 1. Vầng hào quang sáng (Glow aura) khi selected, dragging hoặc là cá kết quả
    if (isSelected || fish.isDragging || fish.isResult) {
      const auraPulse = reduced ? 1.25 : 1.25 + Math.sin(time * 0.009) * 0.07;
      ctx.beginPath();
      ctx.ellipse(0, 0, currentR * 1.35 * auraPulse, currentR * 1.15 * auraPulse, 0, 0, Math.PI * 2);
      ctx.fillStyle = colors.glow;
      ctx.fill();

      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = fish.isDragging ? 24 : (isSelected ? 18 : 12);
    }

    // Drag target highlight: vòng tròn pulsing khi cá đang được kéo nhắm vào
    if (isDragTarget && !reduced) {
      const targetPulse = 1.4 + Math.sin(time * 0.012) * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, currentR * targetPulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + Math.sin(time * 0.01) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -time * 0.05;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Xác định loài cá & vẽ theo đặc trưng giải phẫu độc bản
    // Dùng species cache từ createFish(); fallback cho fish cũ từ localStorage
    const species = fish.species || getFishSpecies(fish);

    switch (species) {
      case 'clownfish':
        drawClownfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'angelfish':
        drawAngelfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'lionfish':
        drawLionfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'pufferfish':
        drawPufferfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'betta':
        drawBettaSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'koi':
        drawKoiSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'anglerfish':
        drawAnglerfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'swordfish':
        drawSwordfishSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'discus':
        drawDiscusSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
      case 'oranda':
      default:
        drawOrandaSpecies(ctx, currentR, tailWaggle, time, hash);
        break;
    }

    // Đặc trưng Cá Rồng Thần Kim Sắc (nếu là kết quả merge)
    if (fish.isResult) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(currentR * 0.35, -currentR * 0.8);
      ctx.lineTo(currentR * 0.55, -currentR * 1.35);
      ctx.lineTo(currentR * 0.65, -currentR * 0.75);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#FFE875';
      ctx.lineWidth = 1.4;
      const whiskerWag = Math.sin(time * 0.01 + hash) * 4;
      ctx.beginPath();
      ctx.moveTo(currentR * 1.05, currentR * 0.1);
      ctx.quadraticCurveTo(currentR * 1.35, currentR * 0.15 + whiskerWag, currentR * 1.5, currentR * 0.35);
      ctx.stroke();
    }

    // Viền trắng nổi bật khi được chọn
    if (isSelected) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, currentR * 1.16, currentR * 0.94, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Drag target indicator (vòng xoáy năng lượng hút khi kéo cá lên đây)
    if (isDragTarget) {
      ctx.save();
      const rot = (time * 0.003) % (Math.PI * 2);
      ctx.rotate(rot);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3.2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, currentR * 1.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // 3. Chữ Hán / Bộ thủ trung tâm (LUÔN XUÔI CHIỀU 100%, VIỀN NỔI BẬT)
    ctx.save();
    if (!facingRight) {
      ctx.scale(-1, 1);
    }

    const fontSize = Math.round(currentR * 0.9);
    ctx.font = `bold ${fontSize}px "Noto Sans SC", "Microsoft YaHei", -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const displayText = fish.isResult && fish.resultChar ? fish.resultChar : fish.radical;
    const textOffsetX = facingRight ? -currentR * 0.08 : currentR * 0.08;

    // Viền đen/tối sắc nét để chữ luôn nổi bật 100% trên mọi nền cá
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(6, 16, 30, 0.88)';
    ctx.lineJoin = 'round';
    ctx.strokeText(displayText, textOffsetX, 1);

    if (fish.isResult) {
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.fillText(displayText, textOffsetX, 1);
    ctx.restore(); // Text

    ctx.restore(); // Cá quay lật

    // 4. Huy hiệu tên bộ thủ & loài cá dạng pill badge
    if (currentR >= 22) {
      const shortName = fish.name_vi?.includes('(')
        ? fish.name_vi.match(/\(([^)]+)\)/)?.[1] || fish.name_vi
        : fish.name_vi || '';

      const badgeLabel = fish.isResult
        ? `${fish.resultChar} • ${SPECIES_NAMES[species] || 'Cá Thần'}`
        : (shortName ? `${shortName} • ${SPECIES_NAMES[species] || ''}` : (SPECIES_NAMES[species] || ''));

      if (badgeLabel) {
        const smallSize = Math.max(10, Math.round(currentR * 0.28));
        ctx.font = `600 ${smallSize}px system-ui, -apple-system, sans-serif`;
        const textMetrics = ctx.measureText(badgeLabel);
        const pillW = textMetrics.width + 12;
        const pillH = smallSize + 6;
        const pillX = drawX - pillW / 2;
        const pillY = drawY + currentR + 4;

        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fillStyle = fish.isResult ? 'rgba(30, 20, 0, 0.88)' : 'rgba(6, 16, 30, 0.8)';
        ctx.fill();
        ctx.strokeStyle = fish.isResult ? 'rgba(255, 215, 0, 0.45)' : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = fish.isResult ? '#FFD700' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeLabel, drawX, pillY + pillH / 2);
      }
    }

    ctx.globalAlpha = 1;
  }

  /** Vẽ các hiệu ứng thị giác (ripple, flash, sparkles) */
  function drawVisualEffects(time) {
    for (let i = visualEffects.length - 1; i >= 0; i--) {
      const fx = visualEffects[i];
      const elapsed = time - fx.startTime;
      const progress = elapsed / fx.duration;

      if (progress >= 1) {
        visualEffects.splice(i, 1);
        continue;
      }

      if (fx.type === 'merge-success') {
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const r = fishRadius() * (1 + easeOut * 2.8);
        const alpha = 1 - progress;

        // Vòng sóng nước ripple tỏa ra
        ctx.save();
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 215, 0, ${alpha * 0.85})`;
        ctx.lineWidth = Math.max(1, 4 * (1 - progress));
        ctx.stroke();

        // Vòng ripple thứ 2 nhỏ hơn trễ nhịp
        if (progress > 0.15) {
          const p2 = (progress - 0.15) / 0.85;
          const r2 = fishRadius() * (0.8 + p2 * 2.2);
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, r2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(180, 240, 255, ${(1 - p2) * 0.6})`;
          ctx.lineWidth = Math.max(1, 2.5 * (1 - p2));
          ctx.stroke();
        }

        // Chớp sáng flash nở nhanh ở tâm
        if (progress < 0.4) {
          const flashP = progress / 0.4;
          const flashGrad = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, fishRadius() * 1.8);
          flashGrad.addColorStop(0, `rgba(255, 255, 255, ${(1 - flashP) * 0.9})`);
          flashGrad.addColorStop(0.5, `rgba(255, 220, 100, ${(1 - flashP) * 0.6})`);
          flashGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
          ctx.fillStyle = flashGrad;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fishRadius() * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (fx.type === 'sparkle') {
        fx.x += fx.vx;
        fx.y += fx.vy;
        fx.vy += 0.04; // Trọng lực nhẹ rơi xuống
        const alpha = 1 - progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius * (1 - progress * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = fx.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Reusable buffer cho selected fish — tránh tạo mảng mới mỗi frame
  const _selectedBuf = [];

  /** Vẽ toàn bộ scene */
  function render(fishList, selectedIds, dragState, time) {
    drawBackground(time);

    // Thu thập cá được chọn vào buffer (không alloc mảng mới)
    _selectedBuf.length = 0;
    for (let i = 0; i < fishList.length; i++) {
      if (selectedIds.has(fishList[i].id)) {
        _selectedBuf.push(fishList[i]);
      }
    }

    // Vẽ tia liên kết năng lượng (Fusion Ray) giữa các cá được chọn
    if (_selectedBuf.length >= 2) {
      for (let i = 0; i < _selectedBuf.length - 1; i++) {
        drawFusionRay(_selectedBuf[i], _selectedBuf[i + 1], time);
      }
    }

    // Vẽ tia liên kết năng lượng khi đang kéo cá gần mục tiêu
    if (dragState?.targetId) {
      const draggingFish = fishList.find(f => f.isDragging);
      const targetFish = fishList.find(f => f.id === dragState.targetId);
      if (draggingFish && targetFish) {
        drawFusionRay(draggingFish, targetFish, time);
      }
    }

    // Vẽ cá không kéo trước
    for (const fish of fishList) {
      if (fish.isDragging) continue;
      const isSelected = selectedIds.has(fish.id);
      const isDragTarget = dragState?.targetId === fish.id;
      drawFish(fish, isSelected, isDragTarget, time);
    }

    // Vẽ cá đang kéo sau cùng để nổi trên tất cả
    for (const fish of fishList) {
      if (!fish.isDragging) continue;
      drawFish(fish, true, false, time);
    }

    // Vẽ hiệu ứng ripples & flashes trên cùng
    drawVisualEffects(time);

    // Hướng dẫn nếu bể trống
    if (fishList.length === 0) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Đang thả cá mới vào bể...', width / 2, height / 2);
    }
  }

  /** Cập nhật vị trí cá với động lực học bơi sinh thái (Thrust & Glide, Flocking, Soft Wall Steering) */
  function updatePositions(fishList, delta) {
    const r = fishRadius();
    const marginX = width > 0 ? (r + 12) / width : 0.05;
    const marginY = height > 0 ? (r + 12) / height : 0.05;
    const sepDist = width > 0 ? (r * 2.2) / width : 0.08;
    const sepDist2 = sepDist * sepDist;

    for (let i = 0; i < fishList.length; i++) {
      const fish = fishList[i];

      // Safety: auto-reset isDragging nếu cá không thực sự đang được kéo (stuck state)
      // Nếu cá có isDragging=true nhưng không có pointer active gần đó, reset sau 2 giây
      if (fish.isDragging && fish._dragStartTime) {
        const dragDuration = Date.now() - fish._dragStartTime;
        if (dragDuration > 2000) {
          fish.isDragging = false;
          fish._dragStartTime = null;
        }
      }

      if (fish.isDragging) continue;

      // Khởi tạo thuộc tính bơi lội tự nhiên nếu chưa có
      if (fish.heading === undefined) {
        fish.heading = Math.atan2(fish.vy || 0.001, fish.vx || 0.002);
        fish.targetHeading = fish.heading;
        // Tốc độ cơ bản chậm hơn để cá bơi nhẹ nhàng
        fish.baseSpeed = Math.max(0.0015, Math.min(0.004, Math.hypot(fish.vx || 0, fish.vy || 0))) || 0.0025;
        fish.thrustTimer = Math.random() * Math.PI * 2;
        fish.wanderTimer = Math.random() * 2;
        fish.bankTilt = 0;
      }

      // 1. Chu kỳ đạp đuôi bơi (Thrust & Glide) - nhịp chậm hơn
      fish.thrustTimer += delta * 1.5;
      const thrust = Math.max(0, Math.sin(fish.thrustTimer));
      // Tốc độ hiện tại: 60%-120% của baseSpeed (thay vì 65%-155%)
      const currentSpeed = fish.baseSpeed * (0.6 + thrust * 0.6);

      // 2. Tự định hướng lang thang tự nhiên (Wander)
      fish.wanderTimer -= delta;
      if (fish.wanderTimer <= 0) {
        fish.wanderTimer = 2.5 + Math.random() * 3.5;
        fish.targetHeading = fish.heading + (Math.random() - 0.5) * 0.9;
      }

      // 3. Né tránh đồng loại êm đềm (Soft Separation)
      // Chỉ xét j > i rồi áp dụng lực đối xứng → giảm một nửa số iteration
      let pushX = 0;
      let pushY = 0;
      for (let j = i + 1; j < fishList.length; j++) {
        const f2 = fishList[j];
        if (f2.isDragging) continue;
        const dx = fish.x - f2.x;
        const dy = fish.y - f2.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < sepDist2 && d2 > 0.000001) {
          const d = Math.sqrt(d2);
          const force = (sepDist - d) / sepDist * 0.008;
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          pushX += fx;
          pushY += fy;
          // Áp dụng lực ngược lại cho f2 (Newton's 3rd law)
          if (!f2._sepPush) f2._sepPush = { x: 0, y: 0 };
          f2._sepPush.x -= fx;
          f2._sepPush.y -= fy;
        }
      }
      // Cộng dồn lực đối xứng từ các cá đã xét trước đó
      if (fish._sepPush) {
        pushX += fish._sepPush.x;
        pushY += fish._sepPush.y;
        fish._sepPush.x = 0;
        fish._sepPush.y = 0;
      }

      // 4. Tránh va chạm thành bể mềm mại (Soft Wall Steering)
      const wallForce = 0.015;
      if (fish.x < marginX) pushX += wallForce * (1 - fish.x / marginX);
      if (fish.x > 1 - marginX) pushX -= wallForce * ((fish.x - (1 - marginX)) / marginX);
      if (fish.y < marginY) pushY += wallForce * (1 - fish.y / marginY);
      if (fish.y > 1 - marginY) pushY -= wallForce * ((fish.y - (1 - marginY)) / marginY);

      // Cập nhật hướng xoay mượt mà với vận tốc góc tối đa
      const desiredHeading = Math.atan2(
        Math.sin(fish.targetHeading) + pushY * 120,
        Math.cos(fish.targetHeading) + pushX * 120
      );

      let angleDiff = desiredHeading - fish.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const maxTurn = 3.2 * delta;
      const turnStep = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      fish.heading += turnStep;
      fish.bankTilt = Math.max(-0.35, Math.min(0.35, turnStep * 2.6));

      // Cập nhật vận tốc thực tế
      fish.vx = Math.cos(fish.heading) * currentSpeed + pushX * 0.1;
      fish.vy = Math.sin(fish.heading) * currentSpeed + pushY * 0.1;

      // Di chuyển cá - giảm multiplier từ 60 xuống 30 để bơi chậm hơn
      fish.x += fish.vx * delta * 30;
      fish.y += fish.vy * delta * 30;

      // Giới hạn biên bể
      fish.x = Math.max(marginX * 0.4, Math.min(1 - marginX * 0.4, fish.x));
      fish.y = Math.max(marginY * 0.4, Math.min(1 - marginY * 0.4, fish.y));
    }
  }

  return {
    resize,
    render,
    updatePositions,
    hitTest,
    toPixel,
    toNormalized,
    fishRadius,
    triggerMergeSuccess,
    triggerMergeFail,
    addWaterRipple,
  };
}
