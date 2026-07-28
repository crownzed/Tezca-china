// ============================================================
// VOCAB-SRS — Kho lịch ôn tập theo TỪNG TỪ ở chế độ local (offline)
//
// Backend đã có SM-2 đầy đủ (srs_service.py, cột next_review_at per-word trong
// UserProgress). Nhưng app chạy mặc định hoàn toàn bằng local, và ở đó chưa có
// kho SRS per-word: localLearningEvent chỉ tính next_review_at rồi vứt đi. File
// này vá đúng khoảng trống đó — mỗi câu trả lời cập nhật lịch ôn của từ trong
// localStorage, để phiên "Học hôm nay" kéo đúng từ đến hạn ra ôn trước.
//
// Namespace theo userId qua scopedKey() (giống grammar-progress.js / api-core.js)
// để hai tài khoản trên cùng máy không dùng chung tiến độ.
//
// Thuật toán = SM-2 lite, MIRROR srs_service.py (_quality + _update_interval) để
// hành vi local khớp backend, sau này dễ đồng bộ hai chiều:
//   quality (1..5) suy từ correct + confidence (+ latency).
//   quality < 3  → lặp lại (repetition=0, interval=1, lapses++).
//   quality >= 3 → nới interval theo ease, tăng repetition.
//   nextReviewAt = giờ + interval_days.
// ============================================================

import { scopedKey } from './user-scope.js';

const STORAGE_KEY = 'vocabSrs';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 45;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Khóa ổn định cho một từ: ưu tiên word_id (db-<id> hoặc id file local), fallback
// hanzi. Cùng shape với question.word mà App.jsx truyền vào recordLearningEvent.
export function wordKeyOf(word = {}) {
  const id = word.word_id ?? word.id;
  if (id !== null && id !== undefined && id !== '') return String(id);
  return word.hanzi || word.character || '';
}

// Record mặc định cho từ chưa từng ôn. Cùng ngữ nghĩa các cột UserProgress backend.
function emptyRecord() {
  return {
    word_id: null,
    hanzi: '',
    pinyin: '',
    level: 0,
    seen: 0,
    correct: 0,
    wrong: 0,
    ease: 2.5,
    interval_days: 0,
    repetition: 0,
    lapses: 0,
    mastery: 0,
    lastReviewAt: null,
    nextReviewAt: null,
  };
}

export function readVocabSrs() {
  try {
    const data = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeVocabSrs(store) {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(store));
  } catch {
    // localStorage đầy/khoá → bỏ qua, tiến độ chỉ mất phiên này.
  }
}

// Suy quality (1..5) từ tín hiệu trả lời — mirror SRSService._quality.
function qualityFrom(correct, confidence, latencyMs) {
  const conf = clamp(Number(confidence) || (correct ? 3 : 1), 1, 4);
  if (!correct) return conf >= 3 ? 1 : 2;
  if (conf <= 2) return 3;
  if (conf >= 4 && (latencyMs === null || latencyMs === undefined || latencyMs <= 5000)) return 5;
  return 4;
}

// Làm tròn nửa-về-chẵn (banker's rounding) — KHỚP Python round() built-in mà
// srs_service.py dùng. Math.round của JS làm tròn nửa LÊN (12.5→13) còn Python
// làm tròn nửa về số chẵn (12.5→12, 7.5→8). Ở các mốc interval*ease = x.5 chính
// xác, hai bên lệch 1 ngày → next_review_at local ≠ backend, phá mục tiêu mirror.
function roundHalfToEven(value) {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Cập nhật ease/repetition/interval/nextReviewAt — mirror SRSService._update_interval.
function applyInterval(record, quality, now) {
  let ease = Number(record.ease) || 2.5;
  let repetition = Number(record.repetition) || 0;
  let interval = Number(record.interval_days) || 0;

  if (quality < 3) {
    repetition = 0;
    interval = 1;
    record.lapses = (record.lapses || 0) + 1;
  } else {
    if (repetition === 0) {
      interval = quality === 5 ? 3 : 1;
    } else if (repetition === 1) {
      interval = Math.max(3, roundHalfToEven(interval * ease));
    } else if (repetition === 2) {
      interval = Math.max(7, roundHalfToEven(interval * ease));
    } else {
      interval = Math.max(1, roundHalfToEven(interval * ease));
    }
    repetition += 1;
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  record.ease = clamp(ease, 1.3, 3.2);
  record.repetition = repetition;
  record.interval_days = Math.min(interval, MAX_INTERVAL_DAYS);
  record.nextReviewAt = new Date(now + record.interval_days * DAY_MS).toISOString();
}

// Ghi kết quả một lượt ôn của từ. Trả về record đã cập nhật để caller
// (localLearningEvent) dùng nextReviewAt thật thay số cứng.
export function recordWordReview(word, { correct, confidence = null, latencyMs = null } = {}) {
  const key = wordKeyOf(word);
  if (!key) return null;

  const store = readVocabSrs();
  const record = store[key] ? { ...emptyRecord(), ...store[key] } : emptyRecord();
  const now = Date.now();

  record.word_id = word.word_id ?? word.id ?? record.word_id;
  record.hanzi = word.hanzi || word.character || record.hanzi;
  record.pinyin = word.pinyin || record.pinyin;
  record.level = Number(word.level ?? word.hskLevel ?? record.level) || 0;
  record.seen += 1;
  record.correct += correct ? 1 : 0;
  record.wrong += correct ? 0 : 1;
  record.lastReviewAt = new Date(now).toISOString();

  const quality = qualityFrom(correct, confidence, latencyMs);
  applyInterval(record, quality, now);

  record.mastery = clamp((record.mastery || 0) + (correct ? 12 : -18), 0, 100);

  store[key] = record;
  writeVocabSrs(store);
  return record;
}

// Danh sách record đến hạn ôn (nextReviewAt <= now), sort theo nextReviewAt TĂNG
// dần → từ quá hạn lâu nhất xếp trước (ôn trước để bảo vệ trí nhớ), mirror
// session_service.py. Từ chưa từng ôn (không có record) coi là "mới", KHÔNG tính vào due.
export function getDueWords(limit = 20) {
  const store = readVocabSrs();
  const now = Date.now();
  return Object.values(store)
    .filter(record => record.nextReviewAt && new Date(record.nextReviewAt).getTime() <= now)
    .sort((a, b) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime())
    .slice(0, limit);
}

// Tổng quan cho dải thống kê / today plan.
export function getSrsSummary() {
  const store = readVocabSrs();
  const records = Object.values(store);
  const now = Date.now();
  const dueCount = records.filter(
    record => record.nextReviewAt && new Date(record.nextReviewAt).getTime() <= now,
  ).length;
  return {
    studied: records.length,
    dueCount,
  };
}
