// ============================================================
// SYNC-GRAMMAR-POOL — Frontend-readable copy of the canonical JSON pool.
//
// Source of truth: backend/app/data/grammar_pool.json
// Generated output: src/data/grammar-pool.js
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'backend', 'app', 'data', 'grammar_pool.json');
const outputPath = join(root, 'src', 'data', 'grammar-pool.js');
const pool = JSON.parse(readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(pool.items) || pool.items.length !== 577) {
  throw new Error(`grammar_pool.json phải có đúng 577 mục, nhận ${pool.items?.length ?? 'không có'}`);
}

const banner = [
  '// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY.',
  '// Nguồn: backend/app/data/grammar_pool.json',
  '// Sinh lại: node scripts/sync-grammar-pool.mjs',
  '',
].join('\n');

// Chỉ xuất DỮ LIỆU, không xuất hàm tìm kiếm. Trước đây file này còn sinh kèm
// một searchGrammarPool() nhưng không nơi nào import (GrammarLab chỉ lấy
// grammarReferencePool), và nó lệch ngữ nghĩa với server: query rỗng thì bản đó
// trả 20 mục đầu còn _ranked_matches() trong backend trả rỗng. Nguồn duy nhất
// cho tìm kiếm là /api/grammar/reference; lúc offline GrammarLab tự lọc.
const body = [
  `export const grammarPoolMeta = ${JSON.stringify(pool.source, null, 2)};`,
  '',
  `export const grammarReferencePool = ${JSON.stringify(pool.items, null, 2)};`,
  '',
  'export default grammarReferencePool;',
  '',
].join('\n');

mkdirSync(dirname(outputPath), { recursive: true });
const next = banner + body;
let previous = null;
try {
  previous = readFileSync(outputPath, 'utf8');
} catch {
  // First sync.
}

if (previous === next) {
  console.log(`✓ grammar-pool.js đã đồng bộ (${pool.items.length} mục)`);
} else {
  writeFileSync(outputPath, next, 'utf8');
  console.log(`✓ Ghi src/data/grammar-pool.js (${pool.items.length} mục)`);
}
