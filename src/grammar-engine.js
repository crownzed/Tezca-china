// ============================================================
// GRAMMAR-ENGINE — Mở rộng spec template → bộ câu hỏi ngữ pháp
//
// Mỗi cấu trúc ngữ pháp được viết dạng "spec" gọn (metadata + slots +
// templates) trong src/grammar-specs/*. Engine này nở spec thành ~100 câu
// hỏi cụ thể, tương thích schema cũ mà GrammarLab đang render:
//   { type, question, options, correctIndex, explanation }
//
// 4 loại câu: fill_blank, sentence_order, meaning_to_char, grammar_judge.
// Chạy được cả trong trình duyệt (import trong grammar-db.js) lẫn Node
// (validator lúc build) — không phụ thuộc DOM.
// ============================================================
import { hsk1, hsk2, hsk3, hsk4, hsk5 } from './vocab-bank.js';

// ── Chỉ mục vocab theo cấp + loại từ ────────────────────────
// Dùng để resolve slot ref dạng '@noun@', '@verb@'… — chỉ rút từ ở cấp
// ≤ cấp bài để câu không lẫn từ vượt trình độ HSK.
const BANKS = { 1: hsk1, 2: hsk2, 3: hsk3, 4: hsk4, 5: hsk5 };

let _vocabIndex = null;

function buildVocabIndex() {
  if (_vocabIndex) return _vocabIndex;
  // index[category] = [{ cn, vi, level }] đã xếp theo level tăng dần.
  const index = {};
  for (const level of [1, 2, 3, 4, 5]) {
    for (const w of BANKS[level] || []) {
      const cat = w.category || 'noun';
      (index[cat] ||= []).push({ cn: w.character, vi: w.meaning, level: w.hskLevel });
    }
  }
  _vocabIndex = index;
  return index;
}

// Rút danh sách filler {cn, vi} cho một loại từ, giới hạn cấp ≤ maxLevel.
function vocabByCategory(category, maxLevel) {
  const index = buildVocabIndex();
  const pool = index[category] || [];
  return pool.filter(w => w.level <= maxLevel);
}

// ── PRNG tất định (mulberry32) — để câu sinh ổn định giữa các build ──
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lấy n phần tử ngẫu nhiên (dùng chung cho sampling mỗi phiên).
export function sampleN(arr, n, rng = Math.random) {
  if (arr.length <= n) return [...arr];
  const copy = [...arr];
  shuffleInPlace(copy, typeof rng === 'function' ? rng : Math.random);
  return copy.slice(0, n);
}

// ── Resolve slots ────────────────────────────────────────────
// slots: { NAME: [...fillers] | '@category@' }
// filler: chuỗi hanzi (tra vi từ vocab, fallback '') hoặc { cn, vi }.
function resolveSlots(slots, maxLevel) {
  const resolved = {};
  for (const [name, spec] of Object.entries(slots || {})) {
    if (typeof spec === 'string' && spec.startsWith('@') && spec.endsWith('@')) {
      const cat = spec.slice(1, -1);
      resolved[name] = vocabByCategory(cat, maxLevel);
    } else if (Array.isArray(spec)) {
      resolved[name] = spec.map(f => (typeof f === 'string' ? { cn: f, vi: '' } : f));
    } else {
      resolved[name] = [];
    }
  }
  return resolved;
}

// Tích Descartes có giới hạn: sinh tối đa `cap` tổ hợp, xáo trộn filler
// từng slot trước để lấy đa dạng thay vì luôn cùng vài tổ hợp đầu.
function slotCombinations(resolvedSlots, slotNames, cap, rng) {
  if (slotNames.length === 0) return [{}];
  const pools = slotNames.map(name => {
    const arr = [...(resolvedSlots[name] || [])];
    if (arr.length === 0) return [{ cn: '', vi: '' }];
    return shuffleInPlace(arr, rng);
  });
  const combos = [];
  const idx = new Array(slotNames.length).fill(0);
  const total = pools.reduce((acc, p) => acc * p.length, 1);
  const limit = Math.min(total, cap);
  for (let c = 0; c < limit; c += 1) {
    const combo = {};
    for (let s = 0; s < slotNames.length; s += 1) {
      combo[slotNames[s]] = pools[s][idx[s]];
    }
    combos.push(combo);
    // increment mixed-radix counter
    for (let s = slotNames.length - 1; s >= 0; s -= 1) {
      idx[s] += 1;
      if (idx[s] < pools[s].length) break;
      idx[s] = 0;
    }
  }
  return combos;
}

// Cú pháp placeholder trong frame/prompt/tokens:
//   {NAME}            → filler.cn
//   {NAME_vi}         → filler.vi
//   {NAME.field}      → filler.field           (vd {MW.noun})
//   {NAME.field.idx}  → filler.field[idx]      (vd {MW.wrong.0})
// Tên slot dùng để resolve luôn là segment đầu tiên (trước dấu chấm và _vi).
const PLACEHOLDER_RE = /\{([A-Za-z0-9_.]+)\}/g;

function parseToken(token) {
  // Trả { name, viFlag, path[] }.
  if (token.includes('.')) {
    const parts = token.split('.');
    return { name: parts[0], viFlag: false, path: parts.slice(1) };
  }
  if (token.endsWith('_vi')) {
    return { name: token.slice(0, -3), viFlag: true, path: [] };
  }
  return { name: token, viFlag: false, path: [] };
}

// Tên slot xuất hiện trong một chuỗi (chỉ lấy segment đầu — tên slot thật).
function slotsInText(text) {
  const names = new Set();
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    names.add(parseToken(m[1]).name);
  }
  return [...names];
}

function resolveField(filler, viFlag, path) {
  if (path.length > 0) {
    let val = filler;
    for (const key of path) val = val == null ? undefined : val[key];
    return val == null ? '' : String(val);
  }
  if (viFlag) return filler.vi || '';
  return filler.cn || '';
}

function fillText(text, combo) {
  return text.replace(PLACEHOLDER_RE, (_full, token) => {
    const { name, viFlag, path } = parseToken(token);
    const f = combo[name];
    if (!f) return '';
    return resolveField(f, viFlag, path);
  });
}

// ── Dựng từng loại câu ───────────────────────────────────────
function permuteWrong(tokens, count, rng) {
  const correct = tokens.join('');
  const seen = new Set([correct]);
  const out = [];
  let guard = 0;
  while (out.length < count && guard < 60) {
    guard += 1;
    const shuffled = shuffleInPlace([...tokens], rng).join('');
    if (!seen.has(shuffled)) {
      seen.add(shuffled);
      out.push(shuffled);
    }
  }
  return out;
}

// Trả về câu hỏi chuẩn hoặc null nếu template + combo không hợp lệ.
function buildQuestion(template, combo, rng) {
  const explain = template.explain ? fillText(template.explain, combo) : '';
  switch (template.type) {
    case 'fill_blank': {
      const question = fillText(template.frame, combo);
      const answer = fillText(template.answer, combo);
      const distractors = (template.distractors || []).map(d => fillText(d, combo));
      if (!answer || distractors.some(d => !d)) return null;
      const options = [answer, ...distractors];
      if (new Set(options).size !== options.length) return null;
      return { type: 'fill_blank', question, options, correctIndex: 0, explanation: explain };
    }
    case 'meaning_to_char': {
      const question = fillText(template.prompt, combo);
      const correct = fillText(template.correct, combo);
      const distractors = (template.distractors || []).map(d => fillText(d, combo));
      if (!correct || distractors.some(d => !d)) return null;
      const options = [correct, ...distractors];
      if (new Set(options).size !== options.length) return null;
      return { type: 'meaning_to_char', question, options, correctIndex: 0, explanation: explain };
    }
    case 'grammar_judge': {
      const question = template.prompt ? fillText(template.prompt, combo) : 'Câu nào ĐÚNG ngữ pháp?';
      const correct = fillText(template.correct, combo);
      const errors = (template.errors || []).map(e => fillText(e, combo));
      if (!correct || errors.some(e => !e)) return null;
      const options = [correct, ...errors];
      if (new Set(options).size !== options.length) return null;
      return { type: 'grammar_judge', question, options, correctIndex: 0, explanation: explain };
    }
    case 'sentence_order': {
      const tokens = (template.tokens || []).map(t => fillText(t, combo)).filter(Boolean);
      if (tokens.length < 2 || new Set(tokens).size < 2) return null;
      const correct = tokens.join('');
      // Dùng ASCII ':' và ' / ' đúng logic parse của GrammarLab.
      const question = 'Sắp đúng: ' + tokens.join(' / ');
      const wrong = permuteWrong(tokens, 3, rng);
      if (wrong.length < 1) return null;
      const options = [correct, ...wrong];
      return { type: 'sentence_order', question, options, correctIndex: 0, explanation: explain };
    }
    default:
      return null;
  }
}

// ── Nở một spec thành lesson đầy đủ ─────────────────────────
const CAP_PER_LESSON = 100;
const _expandCache = new Map();

export function expandLesson(spec) {
  if (_expandCache.has(spec.id)) return _expandCache.get(spec.id);
  const rng = makeRng(hashSeed(spec.id));
  const maxLevel = spec.level;
  const resolved = resolveSlots(spec.slots, maxLevel);

  const seen = new Set();
  const templates = spec.templates || [];

  // Sinh TẤT CẢ câu khả dĩ của mỗi template thành một "làn" riêng, rồi
  // round-robin rút đều từ các làn tới khi đủ CAP. Cách này để template
  // nhiều biến thể (fill_blank có slots) bù cho template frame cố định
  // (chỉ sinh 1 câu) — không lãng phí hạn mức như chia cứng per-template.
  const lanes = [];
  for (const template of templates) {
    const frameText = [template.frame, template.prompt, ...(template.tokens || []), template.correct]
      .filter(Boolean).join(' ');
    const names = slotsInText(frameText + ' ' + [
      template.answer, ...(template.distractors || []), ...(template.errors || []),
    ].filter(Boolean).join(' '));
    // Trần combo rộng rãi để mỗi làn có sẵn nhiều câu cho round-robin.
    const combos = slotCombinations(resolved, names, CAP_PER_LESSON * 2, rng);
    const lane = [];
    for (const combo of combos) {
      const q = buildQuestion(template, combo, rng);
      if (!q) continue;
      const key = `${q.type}|${q.question}|${q.options[q.correctIndex]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lane.push(q);
    }
    if (lane.length) lanes.push(lane);
  }

  const questions = [];
  const cursors = new Array(lanes.length).fill(0);
  let exhausted = false;
  while (questions.length < CAP_PER_LESSON && !exhausted) {
    exhausted = true;
    for (let l = 0; l < lanes.length; l += 1) {
      if (cursors[l] < lanes[l].length) {
        questions.push(lanes[l][cursors[l]]);
        cursors[l] += 1;
        exhausted = false;
        if (questions.length >= CAP_PER_LESSON) break;
      }
    }
  }

  // Trộn để 4 loại câu xen kẽ.
  shuffleInPlace(questions, rng);
  const capped = questions;

  const lesson = {
    id: spec.id,
    title: spec.title,
    level: spec.level,
    desc: spec.desc,
    category: spec.category,
    partOfSpeech: spec.partOfSpeech,
    sources: spec.sources,
    point: spec.point,
    questions: capped,
  };
  _expandCache.set(spec.id, lesson);
  return lesson;
}
