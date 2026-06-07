// ============================================================
// MISTAKE TRACKER — Theo dõi từ sai, ưu tiên ôn tập
// Dùng Elo-style rating để đánh giá độ khó
// ============================================================

const KEY = 'mistakeData';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

export function recordAnswer(wordId, isCorrect, hskLevel) {
  const db = load();
  if (!db[wordId]) {
    db[wordId] = { seen: 0, correct: 0, streak: 0, lastSeen: 0, rating: 1000, hsk: hskLevel };
  }
  const c = db[wordId];
  c.seen++;
  c.lastSeen = Date.now();
  if (isCorrect) {
    c.correct++;
    c.streak = Math.min(c.streak + 1, 10);
    c.rating = Math.min(1000, c.rating + 20);
  } else {
    c.streak = 0;
    c.rating = Math.max(100, c.rating - 30);
  }
  save(db);
  return c;
}

export function getWeakWords(wordIds, limit = 20) {
  const db = load();
  const scored = wordIds.map(id => {
    const c = db[id];
    const score = c ? (1 - c.correct / Math.max(1, c.seen)) * 100 + (c.rating < 900 ? 50 : 0) : 0;
    return { id, score, seen: c?.seen || 0, rating: c?.rating || 1000 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.id);
}

export function getMistakeStats() {
  const db = load();
  const entries = Object.entries(db);
  const total = entries.length;
  const weak = entries.filter(([_,c]) => c.correct / Math.max(1,c.seen) < 0.6).length;
  const strong = entries.filter(([_,c]) => c.correct / Math.max(1,c.seen) >= 0.9).length;
  return { total, weak, strong, accuracy: total ? Math.round(entries.reduce((s,[_,c]) => s + c.correct, 0) / Math.max(1, entries.reduce((s,[_,c]) => s + c.seen, 0)) * 100) : 0 };
}
