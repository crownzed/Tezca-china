// ============================================================
// EXAM-ITEMS — Chuyển đoạn văn chuẩn đề thi thành câu hỏi quiz
//
// Nguồn dữ liệu: src/data/exam-passages.js (sinh từ
// backend/app/data/exam_passages.json qua scripts/sync-exam-passages.mjs —
// KHÔNG sửa tay file trong src/data).
//
// Hai dạng:
//  • 选词填空 (quiz_type 'cloze'): mỗi chỗ trống → 1 câu hỏi. Đoạn văn giữ
//    nguyên, chỗ đang hỏi hiện `____` (đúng MỘT chỗ, để renderer cũ
//    prompt.split(/_{2,}/) và animation điền từ vẫn chạy), các chỗ khác
//    hiện （2）（3）… cho học viên thấy toàn cảnh. 4 option = cả ngân hàng
//    từ dùng chung, trộn lại từng câu nên vị trí đáp án khác nhau.
//  • 阅读理解 (quiz_type 'reading'): mỗi câu hỏi con → 1 câu hỏi, tách
//    metadata_json.passage (đoạn) và metadata_json.stem (câu hỏi tiếng
//    Trung) để render riêng; prompt vẫn ghép đủ để làm fallback.
//
// Trường `word` giữ nguyên hợp đồng cũ (WordEncodeCard + recordWordReview
// SRS cục bộ) và CHỈ có ở cloze — đáp án cloze là một từ trong word bank. Câu
// reading để `word: null` vì đáp án là câu trả lời, không phải từ vựng.
// ============================================================
import { examPassages } from './data/exam-passages.js';

const BLANK_RE = /\{\{(\d+)\}\}/g;

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/** Số thứ tự chỗ trống dạng full-width để không lẫn với `____`. */
function blankLabel(index) {
  return `（${index}）`;
}

/**
 * Nở đoạn cloze: chỗ trống `asked` thành `____`, còn lại thành （n）.
 * Chỉ có duy nhất một `____` trong kết quả.
 */
function renderClozePassage(passage, askedIndex) {
  return String(passage).replace(BLANK_RE, (_match, raw) => (
    Number(raw) === askedIndex ? '____' : blankLabel(Number(raw))
  ));
}

/** Đoạn cloze với mọi chỗ trống đã điền đáp án — dùng trong phần giải thích. */
function renderClozeAnswered(passage, blanks) {
  const byIndex = new Map(blanks.map(b => [b.index, b.answer]));
  return String(passage).replace(BLANK_RE, (_match, raw) => byIndex.get(Number(raw)) ?? '____');
}

function wordBankEntry(passage, hanzi) {
  return (passage.word_bank || []).find(w => w.hanzi === hanzi) || null;
}

function baseId(passageId, suffix) {
  // id số để tương thích các chỗ so sánh/khoá theo id; ổn định theo passage.
  let hash = 0;
  const seed = `${passageId}#${suffix}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000000;
  }
  return hash;
}

/** Một đoạn 选词填空 → N câu hỏi (N = số chỗ trống). */
export function buildClozeQuestions(passage) {
  const blanks = [...(passage.blanks || [])].sort((a, b) => a.index - b.index);
  const bankWords = (passage.word_bank || []).map(w => w.hanzi);
  if (bankWords.length !== 4 || !blanks.length) return [];

  const answered = renderClozeAnswered(passage.passage, blanks);

  return blanks.map((blank) => {
    const options = shuffleArray(bankWords);
    const correctIndex = options.indexOf(blank.answer);
    if (correctIndex < 0) return null;
    const entry = wordBankEntry(passage, blank.answer);
    return {
      id: baseId(passage.id, `b${blank.index}`),
      level: passage.hsk_level,
      local: true,
      offline: true,
      quiz_type: 'cloze',
      prompt: renderClozePassage(passage.passage, blank.index),
      options,
      correct_index: correctIndex,
      audio_text: '',
      explanation: `${blank.explanation} · Đoạn đầy đủ: ${answered}`,
      word: {
        word_id: `${passage.id}-${blank.index}`,
        hanzi: blank.answer,
        pinyin: entry?.pinyin || '',
        meaning_vi: entry?.meaning_vi || '',
        component_hint: '',
        confusable_words: bankWords.filter(w => w !== blank.answer),
      },
      metadata_json: {
        source: 'exam_bank',
        question_subtype: 'guided_cloze',
        passage_id: passage.id,
        blank_index: blank.index,
        blank_total: blanks.length,
        skill: blank.skill,
        topic: passage.topic,
        word_bank: passage.word_bank,
      },
    };
  }).filter(Boolean);
}

/** Một đoạn 阅读理解 → N câu hỏi (N = số câu hỏi con). */
export function buildReadingQuestions(passage) {
  const questions = passage.questions || [];
  return questions.map((question, order) => {
    const options = question.options || [];
    if (options.length !== 4) return null;
    const correctValue = options[question.correct_index];
    const shuffled = shuffleArray(options);
    const correctIndex = shuffled.indexOf(correctValue);
    if (correctIndex < 0) return null;
    return {
      id: baseId(passage.id, `q${order}`),
      level: passage.hsk_level,
      local: true,
      offline: true,
      quiz_type: 'reading',
      prompt: `${passage.passage}\n\n${question.stem}`,
      options: shuffled,
      correct_index: correctIndex,
      audio_text: '',
      explanation: question.explanation,
      // KHÔNG gắn `word`: đáp án 阅读理解 là một câu/cụm trả lời, không phải một
      // từ vựng. Nếu gắn, recordWordReview sẽ ghi cả câu vào kho SRS như một từ
      // (rồi getDueWords/getSrsSummary đếm nó là "từ đã học") và WordEncodeCard
      // hiển thị câu đó ở ô hanzi. Câu reading chấm điểm/ghi event bình thường,
      // chỉ không cập nhật lịch ôn per-word — khớp backend (word_id NULL).
      word: null,
      metadata_json: {
        source: 'exam_bank',
        question_subtype: 'reading_comp_mc',
        passage_id: passage.id,
        passage: passage.passage,
        stem: question.stem,
        question_order: order,
        question_total: questions.length,
        skill: question.skill,
        topic: passage.topic,
      },
    };
  }).filter(Boolean);
}

const BUILDERS = { cloze: buildClozeQuestions, reading: buildReadingQuestions };

export function hasExamBank(quizType) {
  return Boolean(BUILDERS[quizType]) && Array.isArray(examPassages[quizType]);
}

/** Danh sách đoạn của một dạng, lọc theo tập cấp HSK (rỗng = mọi cấp). */
export function examPassagesFor(quizType, levelSet) {
  const all = examPassages[quizType] || [];
  if (!levelSet || !levelSet.size) return all;
  return all.filter(p => levelSet.has(Number(p.hsk_level)));
}

/**
 * Dựng đề từ ngân hàng đoạn văn.
 * Giữ các câu của cùng một đoạn LIỀN NHAU và ĐÚNG THỨ TỰ (học viên đọc đoạn
 * một lần rồi trả lời hết), chỉ trộn ở mức đoạn. Trộn xen kẽ các cấp đã chọn
 * để đề không dồn hết một cấp.
 */
export function buildExamQuestions({ quizType, levels, limit }) {
  const builder = BUILDERS[quizType];
  if (!builder) return [];

  const levelSet = new Set((levels || []).map(Number));
  const passages = examPassagesFor(quizType, levelSet);
  if (!passages.length) return [];

  // Nhóm theo cấp rồi round-robin để trải đều các cấp đã chọn.
  const byLevel = new Map();
  for (const passage of shuffleArray(passages)) {
    const level = Number(passage.hsk_level);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(passage);
  }
  const orderedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  const ordered = [];
  let cursor = 0;
  while (ordered.length < passages.length) {
    let added = false;
    for (const level of orderedLevels) {
      const queue = byLevel.get(level);
      if (cursor < queue.length) {
        ordered.push(queue[cursor]);
        added = true;
      }
    }
    if (!added) break;
    cursor += 1;
  }

  const questions = [];
  for (const passage of ordered) {
    const built = builder(passage);
    if (!built.length) continue;
    // Không cắt giữa đoạn: chỉ nhận đoạn nếu còn đủ chỗ, trừ khi đề còn rỗng.
    if (limit && questions.length && questions.length + built.length > limit) continue;
    questions.push(...built);
    if (limit && questions.length >= limit) break;
  }
  return limit ? questions.slice(0, Math.max(limit, 1)) : questions;
}
