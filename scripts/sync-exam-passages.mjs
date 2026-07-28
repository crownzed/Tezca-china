// ============================================================
// SYNC-EXAM-PASSAGES — Sinh bản copy cho frontend
//
// Nguồn sự thật duy nhất: backend/app/data/exam_passages.json.
// Script này validate rồi ghi src/data/exam-passages.js để frontend
// import tĩnh (luyện tập chạy client-side qua localQuestions).
//
// Xuất ra .js chứ không phải .json để import được y nhau ở Vite, ESLint
// và Node thuần (test/smoke script) — .json cần import attribute ở Node.
//
// Bản sinh ra ĐƯỢC COMMIT để dev/lint không cần chạy build trước.
// KHÔNG sửa tay src/data/exam-passages.js — sửa file backend rồi
// chạy `node scripts/sync-exam-passages.mjs`.
// ============================================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBank, validateBank } from './validate-exam-passages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(root, 'src', 'data', 'exam-passages.js');

const bank = loadBank();
const { errors, stats } = validateBank(bank);
if (errors.length) {
  console.error(`❌ Ngân hàng đoạn văn có ${errors.length} lỗi — không sync:`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
  process.exit(1);
}

// Bỏ các field _description/_skills (chỉ để đọc) khỏi bản frontend.
const payload = { cloze: bank.cloze, reading: bank.reading };
const banner = [
  '// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY.',
  '// Nguồn: backend/app/data/exam_passages.json',
  '// Sinh lại: node scripts/sync-exam-passages.mjs',
  '',
].join('\n');
const next = `${banner}export const examPassages = ${JSON.stringify(payload, null, 2)};\n\nexport default examPassages;\n`;

mkdirSync(dirname(OUT_PATH), { recursive: true });
let prev = null;
try {
  prev = readFileSync(OUT_PATH, 'utf8');
} catch {
  /* chưa có file */
}

if (prev === next) {
  console.log(`✓ exam-passages.js đã đồng bộ (${stats.cloze} cloze · ${stats.reading} reading)`);
} else {
  writeFileSync(OUT_PATH, next, 'utf8');
  console.log(`✓ Ghi src/data/exam-passages.js (${stats.cloze} cloze · ${stats.reading} reading · ${stats.items} câu)`);
}
