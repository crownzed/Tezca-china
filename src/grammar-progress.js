// ============================================================
// GRAMMAR-PROGRESS — Lưu tiến độ luyện ngữ pháp cục bộ (offline)
// Tách RIÊNG khỏi coreStats/coreHistory của từ vựng: mục Ngữ pháp có
// thống kê, chuỗi ôn và lịch ôn tập độc lập.
//
// Namespace theo userId qua scopedKey() (giống readLocalStats trong
// api-core.js) để hai tài khoản trên cùng máy không dùng chung tiến độ.
//
// Ôn tập thông minh = Leitner boxes:
//   box 1..5, khoảng cách ôn (ngày) = LEITNER_INTERVALS[box-1].
//   Luyện 1 bài đạt ngưỡng (accuracy >= PASS_THRESHOLD) → lên box.
//   Dưới ngưỡng → tụt về box 1.
//   nextReviewAt = thời điểm luyện + interval(box) ngày.
// ============================================================

import { scopedKey } from './user-scope.js';

const STORAGE_KEY = 'grammarProgress';
const PASS_THRESHOLD = 70; // % đúng tối thiểu để coi là "qua" và lên box
const LEITNER_INTERVALS = [0, 1, 3, 7, 14]; // ngày, theo box 1..5
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Record mặc định cho bài chưa từng luyện.
function emptyRecord() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    mastery: 0,
    box: 0,
    lastPracticedAt: null,
    nextReviewAt: null,
  };
}

export function readGrammarProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeGrammarProgress(progress) {
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(progress));
  } catch {
    // localStorage đầy/khoá → bỏ qua, tiến độ chỉ mất phiên này.
  }
}

// Tiến độ của một bài (mặc định rỗng nếu chưa luyện).
export function getLessonProgress(lessonId) {
  const record = readGrammarProgress()[lessonId];
  return record ? { ...emptyRecord(), ...record } : emptyRecord();
}

// Ghi kết quả một lượt luyện của bài. Cập nhật mastery cộng dồn
// (giống công thức api-core: correct*14 - wrong*18, kẹp 0..100) và box Leitner.
export function recordGrammarResult(lessonId, { correct, total }) {
  const progress = readGrammarProgress();
  const prev = progress[lessonId] ? { ...emptyRecord(), ...progress[lessonId] } : emptyRecord();
  const wrong = Math.max(0, total - correct);
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const passed = accuracy >= PASS_THRESHOLD;

  const nextCorrect = prev.correct + correct;
  const nextWrong = prev.wrong + wrong;
  const mastery = clamp(nextCorrect * 14 - nextWrong * 18, 0, 100);
  const box = passed ? Math.min(5, Math.max(1, prev.box) + 1) : 1;
  const now = Date.now();
  const intervalDays = LEITNER_INTERVALS[box - 1] ?? 0;

  const record = {
    attempts: prev.attempts + 1,
    correct: nextCorrect,
    wrong: nextWrong,
    mastery,
    box,
    lastAccuracy: accuracy,
    lastPracticedAt: new Date(now).toISOString(),
    nextReviewAt: new Date(now + intervalDays * DAY_MS).toISOString(),
  };

  progress[lessonId] = record;
  writeGrammarProgress(progress);
  return record;
}

// Danh sách lessonId đã học và đến hạn ôn (nextReviewAt <= bây giờ).
// Bài chưa học (không có record) coi là "mới", KHÔNG tính vào due.
export function getDueLessons() {
  const progress = readGrammarProgress();
  const now = Date.now();
  return Object.entries(progress)
    .filter(([, record]) => record.nextReviewAt && new Date(record.nextReviewAt).getTime() <= now)
    .map(([lessonId]) => lessonId);
}

// Tổng quan cho dải "theo dõi tiến độ". totalLessons truyền từ grammar-db.
export function getGrammarSummary(totalLessons = 0) {
  const progress = readGrammarProgress();
  const records = Object.values(progress);
  const studied = records.length;
  const avgMastery = studied
    ? Math.round(records.reduce((sum, record) => sum + (record.mastery || 0), 0) / studied)
    : 0;
  return {
    studied,
    total: totalLessons,
    avgMastery,
    dueCount: getDueLessons().length,
  };
}
