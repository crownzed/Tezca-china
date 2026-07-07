// ============================================================
// GRAMMAR-DB — Barrel ổn định cho mục Ngữ pháp.
//
// Dữ liệu thật nằm trong src/grammar-specs/*.js dưới dạng "spec" gọn
// (metadata + slots + templates). Engine (grammar-engine.js) nở mỗi spec
// thành ~100 câu hỏi cụ thể lúc chạy. File này chỉ re-export để
// GrammarLab.jsx (và mọi importer cũ) không phải đổi đường dẫn.
//
// Schema mỗi lesson giữ nguyên như trước:
//   { id, title, level, desc, category, partOfSpeech, sources, point,
//     questions: [{ type, question, options, correctIndex, explanation }] }
// question.type: fill_blank | sentence_order | meaning_to_char | grammar_judge
// ============================================================
import { allGrammarSpecs } from './grammar-specs/index.js';
import { expandLesson } from './grammar-engine.js';

export const grammarLessons = allGrammarSpecs.map(expandLesson);

// Gộp toàn bộ câu hỏi ngữ pháp (giống pattern quizQuestions trong data.js).
export const grammarQuestions = grammarLessons.flatMap(lesson =>
  lesson.questions.map(q => ({ ...q, hskLevel: lesson.level, lessonId: lesson.id }))
);

// Trả các bài ngữ pháp theo trình độ HSK.
export function getGrammarLessonsByLevel(level) {
  return grammarLessons.filter(lesson => lesson.level === Number(level));
}

// Trả các bài ngữ pháp theo loại từ (category).
export function getGrammarLessonsByCategory(category) {
  return grammarLessons.filter(lesson => lesson.category === category);
}
