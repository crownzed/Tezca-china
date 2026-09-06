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

// Khóa ổn định cho một từ. Ưu tiên word_id, fallback hanzi.
//
// Cùng một từ đến từ hai nguồn với hai kiểu id: câu quiz từ backend mang word_id
// dạng SỐ (WordFocusOut.word_id: int) còn kho thẻ mang 'db-<id>'
// (vocab-loader.mapBackendWord). Không chuẩn hoá thì 42 và 'db-42' thành HAI record
// cho MỘT từ — trả lời đúng từ đó trong quiz (lúc /api/session/event lỗi và rơi về
// ghi local) nuôi một lịch, ôn thẻ/gõ lại nuôi lịch khác, và getDueWords đếm nó hai
// lần. Chốt dạng 'db-<số>' làm dạng chuẩn vì kho thẻ đã dùng nó; chuẩn theo hướng
// ngược lại sẽ làm mọi record đã lưu không tra được nữa.
//
// id không phải số (vd cloze đề thi: '<passage>-<blank>') giữ nguyên.
export function wordKeyOf(word = {}) {
  const id = word.word_id ?? word.id;
  if (id !== null && id !== undefined && id !== '') {
    const raw = String(id);
    return /^\d+$/.test(raw) ? `db-${raw}` : raw;
  }
  return word.hanzi || word.character || '';
}

// Record mặc định cho từ chưa từng ôn. Cùng ngữ nghĩa các cột UserProgress backend.
function emptyRecord() {
  return {
    word_id: null,
    hanzi: '',
    pinyin: '',
    meaning: '',
    level: 0,
    seen: 0,
    correct: 0,
    wrong: 0,
    ease: 2.5,
    interval_days: 0,
    repetition: 0,
    lapses: 0,
    mastery: 0,
    starred: false,
    lastReviewAt: null,
    nextReviewAt: null,
  };
}

// Các key kho đã chạy migrate khoá trong phiên này. Theo KEY (không phải một cờ
// boolean) vì scopedKey đổi khi người dùng đăng nhập/đổi tài khoản giữa phiên —
// một cờ chung sẽ bỏ qua migrate cho tài khoản thứ hai.
const migratedStores = new Set();

// Bản ghi cũ dùng khoá là SỐ TRẦN (trước khi wordKeyOf chuẩn hoá về 'db-<số>').
// Gộp chúng sang khoá chuẩn để lịch ôn đã tích luỹ không bị mất. Trùng khoá thì
// giữ bản có `seen` lớn hơn: đó là bản đã ôn nhiều lần hơn, tức nhiều dữ liệu hơn.
function migrateLegacyKeys(store) {
  const legacyKeys = Object.keys(store).filter(key => /^\d+$/.test(key));
  if (!legacyKeys.length) return store;
  const next = { ...store };
  legacyKeys.forEach(key => {
    const target = `db-${key}`;
    const incoming = next[key];
    const existing = next[target];
    if (!existing || (incoming?.seen || 0) > (existing.seen || 0)) next[target] = incoming;
    delete next[key];
  });
  return next;
}

export function readVocabSrs() {
  const storageKey = scopedKey(STORAGE_KEY);
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (!data || typeof data !== 'object') return {};
    if (migratedStores.has(storageKey)) return data;
    migratedStores.add(storageKey);
    const migrated = migrateLegacyKeys(data);
    if (migrated !== data) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(migrated));
      } catch {
        // Không ghi được thì vẫn trả bản đã gộp cho phiên này.
      }
    }
    return migrated;
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

// Record hiện tại của một từ (null nếu chưa từng ôn). Dùng cho auto-confidence.js
// để đọc tiền sử lapses/repetition TRƯỚC khi ghi lượt mới — nhờ đó suy được từ
// này có "mong manh" hay không, thay vì phải hỏi người học.
export function getWordRecord(word) {
  const key = wordKeyOf(word || {});
  if (!key) return null;
  const record = readVocabSrs()[key];
  return record ? { ...emptyRecord(), ...record } : null;
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
  record.meaning = word.meaning_vi || word.meaning || record.meaning;
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

// --- Starred (từ đã đánh dấu ★) ---
// Đánh dấu nằm CHUNG record SRS (không tách store riêng) để một từ chỉ có một
// nguồn sự thật. Đánh dấu một từ chưa từng ôn vẫn tạo record (seen=0) — chỉ để
// ghim, không đụng lịch ôn. Lưu meaning/pinyin kèm theo để trang starred hiển
// thị được mà không phải nạp lại kho từ.
export function setStarred(word, starred = true) {
  const key = wordKeyOf(word);
  if (!key) return false;

  const store = readVocabSrs();
  const record = store[key] ? { ...emptyRecord(), ...store[key] } : emptyRecord();
  record.word_id = word.word_id ?? word.id ?? record.word_id;
  record.hanzi = word.hanzi || word.character || record.hanzi;
  record.pinyin = word.pinyin || record.pinyin;
  record.meaning = word.meaning_vi || word.meaning || record.meaning;
  record.level = Number(word.level ?? word.hskLevel ?? record.level) || 0;
  record.starred = Boolean(starred);

  store[key] = record;
  writeVocabSrs(store);
  return record.starred;
}

// Đảo trạng thái ★, trả về trạng thái mới.
export function toggleStarred(word) {
  return setStarred(word, !isStarred(word));
}

export function isStarred(word) {
  const key = wordKeyOf(word);
  if (!key) return false;
  return Boolean(readVocabSrs()[key]?.starred);
}

// Danh sách từ đã ★, mới đánh dấu gần nhất không đảm bảo thứ tự (object key
// order) — sort theo hanzi cho ổn định.
export function getStarredWords() {
  return Object.values(readVocabSrs())
    .filter(record => record.starred)
    .sort((a, b) => String(a.hanzi).localeCompare(String(b.hanzi)));
}
