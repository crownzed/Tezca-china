import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

// Load the real modules with explicit offline-only dependencies, without
// loading the full vocab bank, grammar database, app, or any network client.
const contract = await loadSource('src/ordering-contract.js');
const grammar = await loadSource('src/grammar-ordering.js', {
  imports: { './ordering-contract.js': contract },
});
const { expandLesson } = await loadSource('src/grammar-engine.js', {
  imports: {
    './ordering-contract.js': contract,
    './vocab-bank.js': { hsk1: [], hsk2: [], hsk3: [], hsk4: [], hsk5: [] },
  },
});
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = (metadata_json, options = ['想想办法。', '想办法。想']) => ({
  type: 'sentence_order', question: 'Sắp xếp các chip', options,
  correctIndex: 0, metadata_json,
});

function lesson(id, tokens) {
  return expandLesson({
    id, level: 1, title: id,
    templates: [{ type: 'sentence_order', tokens, explain: 'Thứ tự ngữ pháp.' }],
  });
}

test('generated grammar ordering uses canonical indexed, visibly scrambled metadata', () => {
  const q = lesson('test-grammar-indexed', ['我', '是', '学生。']).questions[0];
  assert.ok(q);
  assert.equal(q.type, 'sentence_order');
  const before = structuredClone(q.metadata_json);
  const metadata = contract.normalizeOrdering(q.metadata_json);
  assert.deepEqual(plain(metadata), {
    ordering_version: 'ordering-v1',
    segments: ['我', '是', '学生。'],
    correct_order: [0, 1, 2],
    scrambled_indices: plain(q.metadata_json.scrambled_indices),
  });
  assert.deepEqual(plain([...metadata.scrambled_indices].sort((a, b) => a - b)), [0, 1, 2]);
  const visible = metadata.scrambled_indices.map(i => metadata.segments[i]).join('');
  assert.notEqual(visible, q.options[q.correctIndex]);
  assert.equal(q.question, `Sắp đúng: ${metadata.scrambled_indices.map(i => metadata.segments[i]).join(' / ')}`);
  assert.equal(q.options[q.correctIndex], '我是学生。');
  assert.ok(q.options.every(option => typeof option === 'string'));
  assert.ok(q.options.slice(1).every(option => option !== '我是学生。'));
  assert.equal(new Set(q.options).size, q.options.length);
  assert.ok(grammar.normalizeGrammarOrdering(q));
  assert.equal(grammar.gradeGrammarOrdering(q, [0, 1, 2]), true);
  assert.equal(grammar.gradeGrammarOrdering(q, [1, 0, 2]), false);
  assert.deepEqual(plain(q.metadata_json), before);
});

test('indexed duplicate chips retain separate identities even with the same visible answer', () => {
  const q = lesson('test-grammar-duplicates', ['想', '想', '办法。']).questions[0];
  assert.ok(q);
  assert.deepEqual(plain(q.metadata_json.segments), ['想', '想', '办法。']);
  assert.notEqual(q.metadata_json.scrambled_indices.map(i => q.metadata_json.segments[i]).join(''), '想想办法。');
  assert.equal(q.options[q.correctIndex], '想想办法。');
  assert.equal(grammar.gradeGrammarOrdering(q, [0, 1, 2]), true);
  assert.equal(grammar.gradeGrammarOrdering(q, [1, 0, 2]), false);
  assert.equal(q.metadata_json.segments[0], q.metadata_json.segments[1]);
});

test('invalid generated chips and impossible visible scrambles are dropped', () => {
  for (const [id, tokens] of [
    ['test-grammar-empty', ['我', '', '是']],
    ['test-grammar-punctuation', ['我', '。', '是']],
    ['test-grammar-unscramblable', ['哈', '哈哈']],
    ['test-grammar-identical', ['哈', '哈']],
  ]) {
    assert.equal(lesson(id, tokens).questions.length, 0, id);
  }
});

test('non-identity canonical order grades indices, not the visible sentence', () => {
  const q = fixture({
    ordering_version: 'ordering-v1', segments: ['想', '想', '办法。'],
    correct_order: [1, 0, 2], scrambled_indices: [2, 0, 1],
  });
  const before = structuredClone(q.metadata_json);
  assert.ok(grammar.normalizeGrammarOrdering(q));
  assert.equal(grammar.gradeGrammarOrdering(q, [1, 0, 2]), true);
  assert.equal(grammar.gradeGrammarOrdering(q, [0, 1, 2]), false);
  assert.deepEqual(plain(q.metadata_json), before);
});

test('unique legacy string order is normalized only with explicit, aligned options', () => {
  const q = fixture({
    segments: ['学生。', '我', '是'], correct_order: ['我', '是', '学生。'],
  }, ['我是学生。', '学生。我是']);
  const before = structuredClone(q.metadata_json);
  const normalized = grammar.normalizeGrammarOrdering(q);
  assert.deepEqual(plain(normalized), {
    ordering_version: 'ordering-v1', segments: ['我', '是', '学生。'],
    correct_order: [0, 1, 2], scrambled_indices: [2, 0, 1],
  });
  assert.equal(grammar.gradeGrammarOrdering(q, [0, 1, 2]), true);
  assert.equal(grammar.gradeGrammarOrdering(q, [2, 0, 1]), false);
  assert.deepEqual(plain(q.metadata_json), before);
});

test('unversioned, already-ordered legacy strings keep canonical grading without a forced scramble', () => {
  const q = fixture({
    segments: ['我', '来。'], correct_order: ['我', '来。'],
  }, ['我来。', '来。我']);
  const before = structuredClone(q.metadata_json);
  const normalized = grammar.normalizeGrammarOrdering(q);
  assert.deepEqual(plain(normalized), {
    ordering_version: 'ordering-v1', segments: ['我', '来。'],
    correct_order: [0, 1], scrambled_indices: [0, 1],
  });
  assert.equal(grammar.gradeGrammarOrdering(q, [0, 1]), true);
  assert.equal(grammar.gradeGrammarOrdering(q, [1, 0]), false);
  assert.equal(grammar.gradeGrammarOrdering(q, [0]), false);
  assert.throws(() => contract.normalizeOrdering(normalized), { message: 'ordering_visible_scramble' });
  assert.deepEqual(plain(q.metadata_json), before);
  assert.equal(grammar.normalizeGrammarOrdering(fixture(q.metadata_json, ['wrong', 'also wrong'])), null);
  assert.equal(grammar.normalizeGrammarOrdering(fixture(q.metadata_json, ['我来。', '我来。'])), null);
  assert.equal(grammar.normalizeGrammarOrdering({ ...q, question: '  ' }), null);
});

test('unversioned indexed orders may display the canonical sentence yet grade chip identities', () => {
  for (const [correct_order, scrambled_indices, correctSelection, wrongSelection] of [
    [[0, 1, 2], [1, 0, 2], [0, 1, 2], [1, 0, 2]],
    [[1, 0, 2], [0, 1, 2], [1, 0, 2], [0, 1, 2]],
  ]) {
    const q = fixture({ segments: ['想', '想', '办法。'], correct_order, scrambled_indices });
    const before = structuredClone(q.metadata_json);
    const normalized = grammar.normalizeGrammarOrdering(q);
    assert.deepEqual(plain(normalized.correct_order), correct_order);
    assert.deepEqual(plain(normalized.scrambled_indices), scrambled_indices);
    assert.equal(grammar.gradeGrammarOrdering(q, correctSelection), true);
    assert.equal(grammar.gradeGrammarOrdering(q, wrongSelection), false);
    assert.throws(() => contract.normalizeOrdering(normalized), { message: 'ordering_visible_scramble' });
    assert.deepEqual(plain(q.metadata_json), before);
  }
});

test('malformed and ambiguous ordering data fails closed, without guessing chip identities', () => {
  const valid = {
    ordering_version: 'ordering-v1', segments: ['想', '想', '办法。'],
    correct_order: [0, 1, 2], scrambled_indices: [2, 0, 1],
  };
  const invalid = [
    undefined,
    { segments: ['想', '办法。', '想'], correct_order: ['想', '想', '办法。'] },
    { segments: ['我', '是', '学生。'], correct_order: ['他', '是', '学生。'] },
    { segments: ['我', '是', '学生。'], correct_order: ['我', '是', '学生。'], scrambled_indices: [2, 0, 1] },
    { ...valid, correct_order: [0, 0, 2] },
    { ...valid, correct_order: [true, 1, 2] },
    { ...valid, scrambled_indices: [1, 0, 2] }, // equal-looking chips are not visibly scrambled
    { ...valid, scrambled_indices: [0, 0, 1] },
    { ...valid, accepted_orders: [[0, 1, 2]] },
  ];
  for (const metadata of invalid) {
    const q = fixture(metadata);
    assert.equal(grammar.normalizeGrammarOrdering(q), null);
    assert.equal(grammar.gradeGrammarOrdering(q, [0, 1, 2]), false);
  }
  assert.equal(grammar.normalizeGrammarOrdering(fixture(valid, ['wrong', 'also wrong'])), null);
  assert.equal(grammar.gradeGrammarOrdering(fixture(valid), [0, 1]), false);
  assert.equal(grammar.gradeGrammarOrdering(fixture(valid), [0, 0, 2]), false);
  assert.equal(grammar.gradeGrammarOrdering(fixture(valid), [false, 1, 2]), false);
});
