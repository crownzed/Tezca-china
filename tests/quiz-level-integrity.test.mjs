import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const contract = await loadSource('src/ordering-contract.js');
const plain = value => JSON.parse(JSON.stringify(value));

function card(id, hskLevel, character, meaning, exampleSentence = '') {
  return {
    id: `db-${id}`,
    hskLevel,
    character,
    pinyin: `pinyin-${id}`,
    meaning,
    exampleSentence,
    exampleVi: `Ví dụ ${id}`,
  };
}

async function apiWithCards(cards) {
  return loadSource('src/api-core.js', {
    imports: {
      './user-scope': { scopedKey: key => `quiz-scope:${key}` },
      './vocab-srs': { recordWordReview: () => ({ nextReviewAt: '2026-10-06T00:00:00.000Z' }) },
      './auto-confidence.js': { inferConfidence: () => 3 },
      './vocab-loader': { loadAllFlashcards: async () => structuredClone(cards) },
      './hsk-levels': {
        effectiveLevels: input => Array.isArray(input) && input.length ? [...input] : [1, 2, 3, 4, 5, 6],
      },
      './exam-items': { buildExamQuestions: () => [] },
      './ordering-contract.js': contract,
    },
    globals: {
      Math: Object.assign(Object.create(Math), { random: () => 0.999999 }),
      localStorage: { getItem: () => null, setItem: () => {} },
    },
  });
}

const hsk5 = [
  card(501, 5, '遗产', 'Di sản', '文化遗产。'),
  card(502, 5, '投资', 'Đầu tư', '投资教育。'),
  card(503, 5, '贸易', 'Mậu dịch', '国际贸易。'),
  card(504, 5, '贷款', 'Vay tiền', '银行贷款。'),
  card(505, 5, '利润', 'Lợi nhuận', '利润很高。'),
];
const hsk6 = [
  card(601, 6, '渊博', 'Uyên bác', '他的知识很渊博。'),
  card(602, 6, '斟酌', 'Cân nhắc kỹ', '请仔细斟酌。'),
  card(603, 6, '隽永', 'Sâu sắc', '这篇文章意味隽永。'),
  card(604, 6, '恪守', 'Tuân thủ nghiêm', '恪守承诺。'),
  card(605, 6, '豁达', 'Khoáng đạt', '他性格豁达。'),
];

test('local quiz preserves selected HSK levels and valid four-choice answers', async () => {
  const api = await apiWithCards([...hsk5, ...hsk6]);
  for (const quizType of ['vocab', 'listening', 'dialogue', 'translation', 'cloze']) {
    const generated = await api.localQuiz({ levels: [5], quiz_type: quizType, limit: 5 });
    assert.ok(generated.questions.length > 0, quizType);
    for (const question of generated.questions) {
      assert.equal(question.level, 5, `${quizType}: source level`);
      assert.equal(question.word.level, 5, `${quizType}: word level`);
      assert.equal(question.options.length, 4, `${quizType}: option count`);
      assert.equal(new Set(question.options).size, 4, `${quizType}: unique options`);
      assert.ok(question.correct_index >= 0 && question.correct_index < question.options.length);
      assert.ok(question.options[question.correct_index], `${quizType}: correct answer present`);
      assert.ok(hsk5.some(entry => entry.character === question.word.hanzi));
      assert.ok(!hsk6.some(entry => entry.character === question.word.hanzi));
    }
  }
});

test('multi-level local quizzes retain the source card level rather than the primary level', async () => {
  const api = await apiWithCards([...hsk5, ...hsk6]);
  const generated = await api.localQuiz({ levels: [5, 6], quiz_type: 'vocab', limit: 10 });
  assert.equal(generated.questions.length, 10);
  for (const question of generated.questions) {
    const source = [...hsk5, ...hsk6].find(entry => entry.id === question.word.word_id);
    assert.ok(source);
    assert.equal(question.level, source.hskLevel);
    assert.equal(question.word.level, source.hskLevel);
    assert.equal(question.options[question.correct_index], source.meaning);
  }
});

test('local quiz fails closed for a selected level without enough distinct distractors', async () => {
  const api = await apiWithCards([
    card(101, 1, '一', 'một'),
    card(102, 1, '二', 'hai'),
    card(103, 1, '三', 'ba'),
    ...hsk5,
  ]);
  const generated = await api.localQuiz({ levels: [1], quiz_type: 'vocab', limit: 10 });
  assert.deepEqual(plain(generated.questions), []);
});

test('drag-drop questions stay within the selected HSK level and preserve ordering metadata', async () => {
  const api = await apiWithCards([...hsk5, ...hsk6]);
  const generated = await api.localQuiz({ levels: [6], quiz_type: 'drag_drop', limit: 5 });
  assert.ok(generated.questions.length > 0);
  for (const question of generated.questions) {
    assert.equal(question.level, 6);
    assert.equal(question.word.level, 6);
    const ordering = contract.normalizeOrdering(question.metadata_json);
    assert.deepEqual(plain(ordering.correct_order), plain(ordering.segments.map((_, index) => index)));
  }
});
