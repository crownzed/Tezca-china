// ============================================================
// VALIDATE-EXAM-PASSAGES — Cổng kiểm tra lúc build
//
// Kiểm tra ngân hàng đoạn văn chuẩn đề thi (选词填空 + 阅读理解) tại
// backend/app/data/exam_passages.json. Nội dung soạn tay nên dễ sai
// lệch: số {{n}} không khớp blanks, đáp án không nằm trong word_bank,
// option trùng, đoạn quá dài so với cấp HSK. Lỗi → exit 1, chặn build.
//
// Cùng bộ luật với backend/tests/test_exam_passages.py — sửa một bên
// thì sửa cả bên kia.
// ============================================================
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BANK_PATH = join(root, 'backend', 'app', 'data', 'exam_passages.json');

// Trần độ dài đoạn (số ký tự CJK) theo cấp. Rộng hơn trần của câu ví dụ
// đơn lẻ trong question_generator vì đây là đoạn nhiều câu.
export const PASSAGE_CJK_CAP = { 1: 45, 2: 70, 3: 120, 4: 160, 5: 200, 6: 240 };

const CLOZE_SKILLS = new Set(['pos', 'collocation', 'conjunction', 'logic']);
const READING_SKILLS = new Set(['scanning', 'skimming', 'inference', 'reference']);

const cjkCount = (s) => (s.match(/[㐀-鿿]/g) || []).length;

export function loadBank() {
  return JSON.parse(readFileSync(BANK_PATH, 'utf8'));
}

/** Trả về { errors, stats } — không throw, để caller quyết định. */
export function validateBank(bank) {
  const errors = [];
  const ids = new Set();
  const stats = { cloze: 0, reading: 0, items: 0, byLevel: {} };

  const bump = (level) => {
    stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
  };

  for (const p of bank.cloze || []) {
    const tag = `[${p.id}]`;
    stats.cloze += 1;
    bump(p.hsk_level);
    if (ids.has(p.id)) errors.push(`${tag} id trùng`);
    ids.add(p.id);

    const cap = PASSAGE_CJK_CAP[p.hsk_level];
    if (!cap) errors.push(`${tag} hsk_level không hợp lệ: ${p.hsk_level}`);
    else if (cjkCount(p.passage) > cap) {
      errors.push(`${tag} đoạn dài ${cjkCount(p.passage)} chữ Hán > trần ${cap} của HSK${p.hsk_level}`);
    }

    const markers = [...(p.passage || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const blanks = p.blanks || [];
    if (markers.length !== blanks.length) {
      errors.push(`${tag} có ${markers.length} chỗ {{n}} nhưng ${blanks.length} blanks`);
    }
    const markerSet = new Set(markers);
    if (markerSet.size !== markers.length) errors.push(`${tag} có {{n}} trùng số`);

    const bankWords = (p.word_bank || []).map((w) => w.hanzi);
    if (bankWords.length !== 4) errors.push(`${tag} word_bank phải đúng 4 mục, đang ${bankWords.length}`);
    if (new Set(bankWords).size !== bankWords.length) errors.push(`${tag} word_bank có hanzi trùng`);
    for (const w of p.word_bank || []) {
      if (!w.hanzi || !w.pinyin || !w.meaning_vi) errors.push(`${tag} word_bank thiếu field: ${JSON.stringify(w)}`);
    }

    for (const b of blanks) {
      stats.items += 1;
      const bt = `${tag}#${b.index}`;
      if (!markerSet.has(b.index)) errors.push(`${bt} không có {{${b.index}}} trong passage`);
      if (!bankWords.includes(b.answer)) errors.push(`${bt} đáp án "${b.answer}" không có trong word_bank`);
      if (!CLOZE_SKILLS.has(b.skill)) errors.push(`${bt} skill không hợp lệ: ${b.skill}`);
      if (!b.explanation || !b.explanation.trim()) errors.push(`${bt} explanation rỗng`);
    }
    // Mỗi từ trong ngân hàng nên được dùng đúng 1 lần khi đoạn có 4 chỗ trống,
    // để 4 option luôn là 4 lựa chọn phân biệt được.
    if (blanks.length === 4) {
      const answers = blanks.map((b) => b.answer);
      if (new Set(answers).size !== 4) errors.push(`${tag} 4 chỗ trống nhưng đáp án lặp: ${answers.join('/')}`);
    }
  }

  for (const p of bank.reading || []) {
    const tag = `[${p.id}]`;
    stats.reading += 1;
    bump(p.hsk_level);
    if (ids.has(p.id)) errors.push(`${tag} id trùng`);
    ids.add(p.id);

    const cap = PASSAGE_CJK_CAP[p.hsk_level];
    if (!cap) errors.push(`${tag} hsk_level không hợp lệ: ${p.hsk_level}`);
    else if (cjkCount(p.passage) > cap) {
      errors.push(`${tag} đoạn dài ${cjkCount(p.passage)} chữ Hán > trần ${cap} của HSK${p.hsk_level}`);
    }
    if (/\{\{\d+\}\}/.test(p.passage || '')) errors.push(`${tag} đoạn đọc hiểu không được chứa {{n}}`);

    const qs = p.questions || [];
    if (qs.length < 2) errors.push(`${tag} cần ≥2 câu hỏi, đang ${qs.length}`);
    if (!qs.some((q) => q.skill === 'skimming')) {
      errors.push(`${tag} thiếu câu hỏi ý chính (skill=skimming)`);
    }
    qs.forEach((q, i) => {
      stats.items += 1;
      const qt = `${tag}#q${i}`;
      if (!q.stem || !q.stem.trim()) errors.push(`${qt} stem rỗng`);
      else if (cjkCount(q.stem) === 0) errors.push(`${qt} stem phải là tiếng Trung`);
      const opts = q.options || [];
      if (opts.length !== 4) errors.push(`${qt} phải đúng 4 option, đang ${opts.length}`);
      if (new Set(opts).size !== opts.length) errors.push(`${qt} option trùng: ${JSON.stringify(opts)}`);
      if (opts.some((o) => !o || !o.trim())) errors.push(`${qt} có option rỗng`);
      if (typeof q.correct_index !== 'number' || q.correct_index < 0 || q.correct_index >= opts.length) {
        errors.push(`${qt} correct_index ngoài khoảng: ${q.correct_index}`);
      }
      if (!READING_SKILLS.has(q.skill)) errors.push(`${qt} skill không hợp lệ: ${q.skill}`);
      if (!q.explanation || !q.explanation.trim()) errors.push(`${qt} explanation rỗng`);
    });
  }

  // Đủ độ phủ: mỗi cấp HSK 1-6 phải có cả 2 dạng.
  for (const level of [1, 2, 3, 4, 5, 6]) {
    for (const type of ['cloze', 'reading']) {
      const n = (bank[type] || []).filter((p) => p.hsk_level === level).length;
      if (n === 0) errors.push(`[coverage] HSK${level} không có đoạn ${type} nào`);
    }
  }

  return { errors, stats };
}

function main() {
  const bank = loadBank();
  const { errors, stats } = validateBank(bank);

  console.log('── Exam passage bank ──');
  console.log(`  ${stats.cloze} đoạn 选词填空 · ${stats.reading} đoạn 阅读理解 · ${stats.items} câu hỏi sinh ra`);
  const levels = Object.keys(stats.byLevel).sort();
  console.log(`  Theo cấp: ${levels.map((l) => `HSK${l}=${stats.byLevel[l]}`).join(' ')}`);

  if (errors.length) {
    console.error(`\n❌ ${errors.length} lỗi:`);
    for (const e of errors.slice(0, 50)) console.error('  ' + e);
    if (errors.length > 50) console.error(`  … và ${errors.length - 50} lỗi nữa`);
    process.exit(1);
  }
  console.log('✓ Exam passage validator pass');
}

// Chỉ chạy khi được gọi trực tiếp; sync-exam-passages.mjs import validateBank.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
