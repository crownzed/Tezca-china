import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Tự host dữ liệu nét chữ (hanzi-writer-data) trên chính origin của app thay vì
// nạp từ CDN jsdelivr — jsdelivr hay bị chặn ở TQ và không chạy được offline.
// Chỉ copy những chữ đơn thực sự xuất hiện trong kho từ vựng (~vài nghìn file)
// thay vì cả 9575 file, để thư mục public gọn.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules', 'hanzi-writer-data');
const outDir = join(root, 'public', 'hanzi-data');

function addChars(set, value) {
  const clean = String(value || '');
  for (const ch of clean) {
    if (/[一-鿿]/.test(ch)) set.add(ch);
  }
}

async function collectChars() {
  const chars = new Set();
  const { flashcardsData } = await import(pathToFileURL(join(root, 'src', 'data.js')).href);
  const bank = await import(pathToFileURL(join(root, 'src', 'vocab-bank.js')).href);

  for (const card of flashcardsData || []) {
    addChars(chars, card.character);
  }
  for (const list of [bank.hsk1, bank.hsk2, bank.hsk3, bank.hsk4, bank.hsk5]) {
    for (const card of list || []) addChars(chars, card.character);
  }

  try {
    const exportPath = join(root, 'backend', 'app', 'data', 'words_export.json');
    if (existsSync(exportPath)) {
      const payload = JSON.parse(readFileSync(exportPath, 'utf8'));
      for (const w of payload.words || []) addChars(chars, w.hanzi);
    }
  } catch (err) {
    console.error('Không đọc được words_export.json để lấy chữ tập viết:', err);
  }

  return [...chars];
}

async function main() {
  if (!existsSync(srcDir)) {
    console.error('Thiếu package hanzi-writer-data. Chạy `npm install` trước.');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const chars = await collectChars();
  let copied = 0;
  let cached = 0;
  let missing = 0;

  for (const ch of chars) {
    const file = `${ch}.json`;
    const from = join(srcDir, file);
    const to = join(outDir, file);
    if (!existsSync(from)) {
      missing += 1;
      continue;
    }
    if (existsSync(to)) {
      cached += 1;
      continue;
    }
    copyFileSync(from, to);
    copied += 1;
  }

  console.log(`hanzi-data ready: ${copied + cached} chars (${copied} new, ${cached} cached, ${missing} missing)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
