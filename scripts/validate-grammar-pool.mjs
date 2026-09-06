// ============================================================
// VALIDATE-GRAMMAR-POOL — Integrity gate for the PDF grammar import.
//
// The source PDF does not label a per-entry HSK level, so this validator only
// checks facts that can be verified mechanically: 577 contiguous IDs/numbers,
// non-empty source records, valid page ranges, and the recorded source hash.
// ============================================================
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const poolPath = join(root, 'backend', 'app', 'data', 'grammar_pool.json');

// Đọc có kiểm soát: pool là file bắt buộc phải commit. Nếu thiếu (clone mới chưa
// có, hoặc ai đó xóa) thì readFileSync trần sẽ ném stack trace ENOENT thô giữa
// chuỗi build, không nói được cần làm gì. Thông báo rõ + exit 1 để log Vercel
// đọc ra ngay nguyên nhân.
let pool;
try {
  pool = JSON.parse(readFileSync(poolPath, 'utf8'));
} catch (error) {
  const reason = error.code === 'ENOENT'
    ? 'không tìm thấy file'
    : `không đọc/parse được (${error.message})`;
  console.error(`❌ Grammar pool ${reason}: backend/app/data/grammar_pool.json`);
  console.error('   File này PHẢI được commit. Sinh lại bằng:');
  console.error('   python scripts/import-grammar-pdf.py');
  process.exit(1);
}

const errors = [];

if (pool?.schema_version !== 1) errors.push('schema_version phải là 1');
if (!pool?.source || typeof pool.source !== 'object') errors.push('Thiếu source metadata');
if (pool?.source?.pages !== 564) errors.push(`pages phải là 564, nhận ${pool?.source?.pages}`);
if (pool?.source?.item_count !== 577) {
  errors.push(`source.item_count phải là 577, nhận ${pool?.source?.item_count}`);
}
if (!Array.isArray(pool?.items) || pool.items.length !== 577) {
  errors.push(`items phải có đúng 577 phần tử, nhận ${pool?.items?.length ?? 'không có'}`);
}

const numbers = Array.isArray(pool?.items) ? pool.items.map(item => item.number) : [];
for (let i = 0; i < 577; i += 1) {
  if (numbers[i] !== i + 1) errors.push(`Sai thứ tự tại vị trí ${i + 1}: ${numbers[i]}`);
}

for (const item of pool?.items || []) {
  const label = `grammar-pdf-${String(item.number).padStart(3, '0')}`;
  if (item.id !== label) errors.push(`${label}: id không khớp`);
  if (!item.title?.trim()) errors.push(`${label}: title rỗng`);
  if (!item.raw_text?.trim()) errors.push(`${label}: raw_text rỗng`);
  if (!Number.isInteger(item.page_start) || !Number.isInteger(item.page_end)) {
    errors.push(`${label}: page_start/page_end phải là số nguyên`);
  } else if (item.page_start < 2 || item.page_end < item.page_start || item.page_end > 564) {
    errors.push(`${label}: khoảng trang không hợp lệ`);
  }
}

const pdfPath = join(process.env.USERPROFILE || '', 'Downloads', pool.source?.filename || '');
if (statSafe(pdfPath)) {
  const actualHash = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
  if (pool.source.sha256 !== actualHash) {
    errors.push(`SHA-256 PDF không khớp: ${pool.source.sha256} != ${actualHash}`);
  }
}

if (errors.length) {
  console.error(`❌ Grammar pool có ${errors.length} lỗi:`);
  errors.slice(0, 30).forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(`✓ Grammar pool hợp lệ: ${pool.items.length} mục · ${pool.source.pages} trang`);

function statSafe(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
