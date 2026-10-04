// ============================================================
// VALIDATE-GRAMMAR — Cổng kiểm tra lúc build
//
// Nở toàn bộ spec ngữ pháp qua engine và assert từng câu hỏi hợp lệ.
// Sentence ordering is validated against indexed metadata, never by parsing
// question punctuation. Errors → exit 1 before invalid specs can ship.
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
  const { normalizeOrdering, ORDERING_VERSION } = await import(pathToFileURL(join(root, 'src', 'ordering-contract.js')).href);

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
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
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
        if (q.metadata_json?.ordering_version !== ORDERING_VERSION) {
          errors.push(`${tag} thiếu ordering_version=${ORDERING_VERSION}`);
          return;
        }
        let ordering;
        try {
          ordering = normalizeOrdering(q.metadata_json);
        } catch (error) {
          errors.push(`${tag} metadata ordering không hợp lệ: ${error.message}`);
          return;
        }
        const { segments, correct_order: correctOrder, scrambled_indices: scrambledIndices } = ordering;
        const correct = correctOrder.map(index => segments[index]).join('');
        const scrambled = scrambledIndices.map(index => segments[index]);
        if (scrambled.join('') === correct) {
          errors.push(`${tag} các chip chưa được xáo trộn rõ ràng`);
        }
        if (q.options[q.correctIndex] !== correct) {
          errors.push(`${tag} đáp án đúng không khớp thứ tự chuẩn của metadata`);
        }
        if (!q.question.includes(scrambled.join(' / '))) {
          errors.push(`${tag} question không hiển thị các chip theo thứ tự đã xáo trộn`);
        }
        if (q.options.slice(0, q.correctIndex).concat(q.options.slice(q.correctIndex + 1))
          .some(option => option === correct)) {
          errors.push(`${tag} đáp án sai hiển thị giống đáp án đúng`);
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
