// ============================================================
// VALIDATE-GRAMMAR — Cổng kiểm tra lúc build
//
// Nở toàn bộ spec ngữ pháp qua engine và assert từng câu hỏi hợp lệ.
// Mô phỏng CHÍNH XÁC logic parse của GrammarLab (dragSegments) cho
// sentence_order để chặn câu ghép lại không khớp đáp án. Lỗi → exit 1,
// chặn build (vite) trước khi ship spec hỏng.
// ============================================================
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const specsUrl = pathToFileURL(join(root, 'src', 'grammar-specs', 'index.js')).href;
  const engineUrl = pathToFileURL(join(root, 'src', 'grammar-engine.js')).href;
  const { allGrammarSpecs } = await import(specsUrl);
  const { expandLesson } = await import(engineUrl);

  const errors = [];
  const warnings = [];
  let totalQuestions = 0;
  const summary = [];

  for (const spec of allGrammarSpecs) {
    const lesson = expandLesson(spec);
    const qs = lesson.questions || [];
    summary.push({ id: lesson.id, level: lesson.level, count: qs.length });
    totalQuestions += qs.length;

    // Conteo bajo chỉ cảnh báo, KHÔNG chặn build: một số cấu trúc (lượng từ,
    // đại từ nghi vấn) có ít biến thể tự nhiên — ép đủ 100 sẽ sinh câu rác.
    // Lỗi chặn build chỉ dành cho sai tính đúng đắn (bên dưới).
    if (qs.length < 6) {
      errors.push(`[${lesson.id}] chỉ sinh ${qs.length} câu (<6, quá ít — kiểm tra slots/templates)`);
    } else if (qs.length < 90) {
      warnings.push(`[${lesson.id}] sinh ${qs.length} câu (<90 — cân nhắc thêm filler/template)`);
    }

    qs.forEach((q, i) => {
      const tag = `[${lesson.id}#${i} type=${q.type}]`;
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`${tag} options phải ≥2 phần tử`);
        return;
      }
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        errors.push(`${tag} correctIndex ngoài khoảng`);
      }
      if (new Set(q.options).size !== q.options.length) {
        errors.push(`${tag} có option trùng: ${JSON.stringify(q.options)}`);
      }
      if (!q.question || !q.question.trim()) {
        errors.push(`${tag} question rỗng`);
      }
      if (!q.explanation || !q.explanation.trim()) {
        errors.push(`${tag} explanation rỗng`);
      }
      const placeholderLeft = [q.question, ...q.options, q.explanation]
        .filter(Boolean).find(s => /\{[A-Za-z0-9_.]+\}/.test(s));
      if (placeholderLeft) {
        errors.push(`${tag} còn placeholder chưa resolve: ${placeholderLeft}`);
      }
      if (q.type === 'sentence_order') {
        // Tái hiện GrammarLab.dragSegments: substring sau ASCII ':' đầu tiên,
        // split '/', trim, join('') phải === options[correctIndex].
        const idx = q.question.indexOf(':');
        if (idx === -1) {
          errors.push(`${tag} sentence_order thiếu ':' — không parse được token`);
          return;
        }
        if (q.question.includes('：')) {
          errors.push(`${tag} dùng ':' full-width — GrammarLab không split được`);
        }
        const content = q.question.substring(idx + 1);
        const tokens = content.split('/').map(s => s.trim()).filter(Boolean);
        const joined = tokens.join('');
        const correct = q.options[q.correctIndex];
        if (joined !== correct) {
          errors.push(`${tag} token ghép lại "${joined}" ≠ đáp án "${correct}"`);
        }
      }
    });
  }

  // In tóm tắt số câu mỗi cấu trúc.
  console.log('── Grammar bank ──');
  for (const s of summary) {
    const flag = s.count < 90 ? '  ⚠' : '';
    console.log(`  HSK${s.level} ${s.id}: ${s.count} câu${flag}`);
  }
  console.log(`Tổng: ${allGrammarSpecs.length} cấu trúc · ${totalQuestions} câu`);

  if (warnings.length) {
    console.warn(`\n⚠ ${warnings.length} cảnh báo (không chặn build):`);
    for (const w of warnings) console.warn('  ' + w);
  }

  if (errors.length) {
    console.error(`\n❌ ${errors.length} lỗi:`);
    for (const e of errors.slice(0, 50)) console.error('  ' + e);
    if (errors.length > 50) console.error(`  … và ${errors.length - 50} lỗi nữa`);
    process.exit(1);
  }
  console.log('✓ Validator pass');
}

main().catch(err => {
  console.error('Validator crash:', err);
  process.exit(1);
});
