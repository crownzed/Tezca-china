import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deferred, loadSource } from './helpers/load-source.mjs';

// VM modules receive explicit mocks only: no app imports, real fetch, SRS, or storage.
const fixtures = JSON.parse(await readFile(new URL('./fixtures/ordering-v1.json', import.meta.url), 'utf8'));
const deterministicMath = Object.assign(Object.create(Math), { random: () => 0.999999 });
const contract = await loadSource('src/ordering-contract.js', { globals: { Math: deterministicMath } });
const plain = value => JSON.parse(JSON.stringify(value));
const scope = key => `ordering-test:${key}`;
const initialStats = { attempts: 3, answered: 8, correct: 5 };
const now = Date.parse('2026-09-26T12:00:00.000Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
    json: async () => structuredClone(body),
  };
}

async function harness({ fetchImpl, cards = [] } = {}) {
  const requests = [];
  const reviews = [];
  const confidenceCalls = [];
  const writes = [];
  const stored = new Map([
    [scope('coreStats'), JSON.stringify(initialStats)],
    [scope('coreHistory'), '[]'],
  ]);
  let vocabLoads = 0;
  const localStorage = {
    getItem: key => stored.get(String(key)) ?? null,
    setItem(key, value) {
      writes.push({ key: String(key), value: String(value) });
      stored.set(String(key), String(value));
    },
    removeItem(key) { writes.push({ key: String(key), remove: true }); stored.delete(String(key)); },
    clear() { writes.push({ clear: true }); stored.clear(); },
  };
  const levels = value => Array.isArray(value) ? [...value] : [Number(value) || 1];
  const api = await loadSource('src/api-core.js', {
    imports: {
      './user-scope': { scopedKey: scope },
      './vocab-srs': {
        recordWordReview(word, outcome) {
          reviews.push({ word: plain(word), outcome: plain(outcome) });
          return { nextReviewAt: '2026-09-30T12:00:00.000Z' };
        },
      },
      './auto-confidence.js': {
        inferConfidence(input) { confidenceCalls.push(plain(input)); return input.correct ? 4 : 1; },
      },
      './vocab-loader': { loadAllFlashcards: async () => { vocabLoads += 1; return structuredClone(cards); } },
      './hsk-levels': { effectiveLevels: levels, primaryLevel: (value, fallback) => levels(value)[0] || fallback },
      './exam-items': { buildExamQuestions: () => [] },
      './ordering-contract.js': contract,
    },
    globals: {
      localStorage,
      Math: deterministicMath,
      Date: FixedDate,
      // Retry delays are mock microtasks, never real timers or background work.
      setTimeout: callback => { queueMicrotask(callback); return 0; },
      clearTimeout: () => {},
      fetch: async (url, options = {}) => {
        const request = {
          url: String(url), method: options.method || 'GET', headers: { ...(options.headers || {}) },
          body: options.body === undefined ? undefined : JSON.parse(options.body),
        };
        requests.push(request);
        if (!fetchImpl) throw new TypeError('Unexpected fetch in offline-only test');
        return fetchImpl(request);
      },
    },
  });
  return {
    api, requests, reviews, confidenceCalls, writes,
    get vocabLoads() { return vocabLoads; },
    read: key => JSON.parse(localStorage.getItem(scope(key))),
    mutations: () => ({ stored: [...stored.entries()], writes: plain(writes), reviews: plain(reviews) }),
  };
}

function fixtureMetadata(fixture) {
  const metadata = structuredClone(Object.hasOwn(fixture, 'metadata')
    ? fixture.metadata : { ...fixtures.base, ...fixture.patch });
  for (const key of fixture.omit || []) delete metadata[key];
  return metadata;
}

function dragQuestion(metadata = fixtures.base, extra = {}) {
  return {
    id: 701, quiz_type: 'drag_drop', local: true, offline: true,
    prompt: 'Sắp xếp các từ thành câu đúng', explanation: 'Phản hồi ngữ pháp.',
    options: ['feedback', 'other feedback'], correct_index: 0,
    word: { word_id: 37, hanzi: '想', pinyin: 'xiǎng', meaning_vi: 'muốn' },
    metadata_json: structuredClone(metadata), ...extra,
  };
}

function answer(question, selectedOrder, extra = {}) {
  return {
    user_id: 'test-user', session_id: 91, question_id: question.id,
    selected_index: question.correct_index, selected_order: selectedOrder, latency_ms: 1200,
    ...extra,
  };
}

const batch = answers => ({ user_id: 'test-user', level: 1, quiz_type: 'drag_drop', answers });

// Exercise the same language-neutral fixtures through both public local API paths.
for (const fixture of fixtures.cases) {
  test(`API local ordering shared fixture: ${fixture.name}`, async () => {
    const h = await harness();
    const metadata = fixtureMetadata(fixture);
    const q = dragQuestion(metadata);
    const before = structuredClone(q.metadata_json);
    if (fixture.error) {
      const payload = answer(q, [0, 1, 2]);
      const state = h.mutations();
      await assert.rejects(h.api.recordLearningEvent(payload, q), { message: fixture.error });
      await assert.rejects(h.api.submitQuiz(batch([payload]), [q]), { message: fixture.error });
      assert.deepEqual(h.mutations(), state);
      assert.equal(h.confidenceCalls.length, 0);
    } else {
      const ordering = contract.normalizeOrdering(metadata);
      for (const expected of fixture.answers || [{ selected: plain(ordering.correct_order), correct: true }]) {
        const selection = structuredClone(expected.selected);
        const payload = answer(q, selection, { ordering_version: 'caller-cannot-override' });
        if (expected.error) {
          const state = h.mutations();
          await assert.rejects(h.api.recordLearningEvent(payload, q), { message: expected.error });
          await assert.rejects(h.api.submitQuiz(batch([payload]), [q]), { message: expected.error });
          assert.deepEqual(h.mutations(), state);
        } else {
          assert.equal(contract.gradeOrdering(metadata, selection), expected.correct);
          const review = await h.api.recordLearningEvent(payload, q);
          assert.equal(review.correct, expected.correct);
          assert.equal(review.offline, true);
          assert.equal(review.ordering_version, contract.ORDERING_VERSION);
          assert.deepEqual(plain(review.selected_order), selection);
          assert.notStrictEqual(review.selected_order, selection);
          assert.equal(review.confidence, expected.correct ? 4 : 1);
          assert.equal(h.confidenceCalls.at(-1).correct, expected.correct);
          assert.equal(h.reviews.at(-1).outcome.correct, expected.correct);
          assert.equal(review.next_review_at, '2026-09-30T12:00:00.000Z');
          const srsCount = h.reviews.length;
          const submitted = await h.api.submitQuiz(batch([payload]), [q]);
          assert.equal(submitted.score, expected.correct ? 1 : 0);
          assert.equal(submitted.total, 1);
          assert.equal(submitted.results[0].correct, expected.correct);
          assert.equal(h.reviews.length, srsCount, 'quiz submission does not double-write per-word SRS');
          const saved = h.read('coreHistory').at(-1).answers[0];
          assert.deepEqual(saved.selected_order, selection);
          assert.equal(saved.ordering_version, contract.ORDERING_VERSION);
          assert.equal(saved.correct, expected.correct);
        }
      }
    }
    assert.deepEqual(q.metadata_json, before);
    assert.equal(h.requests.length, 0);
  });
}

test('selected_index and a forged correct flag cannot grade duplicate or nonidentity drag answers', async () => {
  const h = await harness();
  const metadata = { ...fixtures.base, segments: ['想', '想', '办法。'], correct_order: [1, 0, 2] };
  const wrongQuestion = dragQuestion(metadata);
  const rightQuestion = dragQuestion(metadata, { id: 702 });
  const wrong = answer(wrongQuestion, [0, 1, 2], { selected_index: 0, correct: true });
  const right = answer(rightQuestion, [1, 0, 2], { selected_index: -99, correct: false });
  assert.equal(wrong.selected_order.map(i => metadata.segments[i]).join(''),
    right.selected_order.map(i => metadata.segments[i]).join(''));
  assert.equal((await h.api.recordLearningEvent(wrong, wrongQuestion)).correct, false);
  assert.equal((await h.api.recordLearningEvent(right, rightQuestion)).correct, true);
  const submitted = await h.api.submitQuiz(batch([wrong, right]), [wrongQuestion, rightQuestion]);
  assert.equal(submitted.score, 1);
  assert.deepEqual(plain(submitted.results.map(row => row.correct)), [false, true]);
  assert.deepEqual(h.read('coreHistory').at(-1).answers.map(row => row.correct), [false, true]);
});

test('missing selected_order rejects before SRS, stats, history, confidence, or transport', async () => {
  for (const local of [true, false]) {
    const h = await harness();
    const q = dragQuestion(fixtures.base, { local, offline: local });
    const payload = answer(q, undefined);
    delete payload.selected_order;
    const state = h.mutations();
    await assert.rejects(h.api.recordLearningEvent(payload, q), { message: 'ordering_selected_order' });
    await assert.rejects(h.api.submitQuiz(batch([payload]), [q]), { message: 'ordering_selected_order' });
    assert.deepEqual(h.mutations(), state);
    assert.equal(h.confidenceCalls.length, 0);
    assert.equal(h.requests.length, 0);
  }
});

test('an invalid later batch answer or missing question cannot partially write an earlier valid answer', async () => {
  for (const local of [true, false]) {
    for (const invalid of ['missing question', 'bad metadata', 'bad selection']) {
      const h = await harness();
      const first = dragQuestion(fixtures.base, { local, offline: local });
      const later = dragQuestion(fixtures.base, { id: 702, local, offline: local });
      const questions = [first, later];
      const answers = [answer(first, [0, 1, 2]), answer(later, [0, 1, 2])];
      let message;
      if (invalid === 'missing question') {
        questions.pop();
        message = 'question_not_found';
      } else if (invalid === 'bad metadata') {
        later.metadata_json.correct_order = [0, 0, 2];
        message = 'ordering_correct_order';
      } else {
        answers[1].selected_order = [0, 0, 2];
        message = 'ordering_selected_order';
      }
      const state = h.mutations();
      await assert.rejects(h.api.submitQuiz(batch(answers), questions), { message });
      assert.deepEqual(h.mutations(), state, `${invalid}, local=${local}`);
      assert.equal(h.requests.length, 0);
      assert.equal(h.confidenceCalls.length, 0);
    }
  }
});

test('missing or mismatched event questions and fallback batches fail closed without local writes', async () => {
  const h = await harness({ fetchImpl: async () => { throw new TypeError('mock network outage'); } });
  const q = dragQuestion();
  const state = h.mutations();
  await assert.rejects(h.api.recordLearningEvent(answer(q, [0, 1, 2], { question_id: 999 }), q),
    { message: 'question_not_found' });
  assert.equal(h.requests.length, 0);
  await assert.rejects(h.api.recordLearningEvent(answer(q, [0, 1, 2])), { message: 'question_not_found' });
  await assert.rejects(h.api.submitQuiz(batch([answer(q, [0, 1, 2])]), []), { message: 'question_not_found' });
  assert.deepEqual(h.mutations(), state);
  assert.equal(h.requests.length, 2);
});

test('local MCQ still uses selected_index, ignores ordering fields, and records its original history shape', async () => {
  const h = await harness();
  const q = dragQuestion({ ordering_version: 'broken' }, { quiz_type: 'vocab', correct_index: 1 });
  const other = { ...q, id: 702, correct_index: 2 };
  const right = answer(q, ['irrelevant'], { selected_index: 1 });
  const wrong = answer(other, [2], { selected_index: 0 });
  const review = await h.api.recordLearningEvent(right, q);
  assert.equal(review.correct, true);
  assert.equal(Object.hasOwn(review, 'selected_order'), false);
  assert.equal(Object.hasOwn(review, 'ordering_version'), false);
  assert.equal((await h.api.recordLearningEvent(wrong, other)).correct, false);
  const submitted = await h.api.submitQuiz({ ...batch([right, wrong]), quiz_type: 'vocab' }, [q, other]);
  assert.equal(submitted.score, 1);
  assert.equal(submitted.total, 2);
  assert.deepEqual(h.read('coreStats'), { attempts: 4, answered: 10, correct: 6 });
  const saved = h.read('coreHistory').at(-1).answers;
  assert.deepEqual(saved.map(row => row.selected_index), [1, 0]);
  assert.ok(saved.every(row => !Object.hasOwn(row, 'selected_order') && !Object.hasOwn(row, 'ordering_version')));
  assert.equal(h.reviews.length, 2);
  assert.equal(h.requests.length, 0);
});

test('remote event transport snapshots selected_order while server review remains authoritative', async () => {
  const pendingFetch = deferred();
  const h = await harness({ fetchImpl: () => pendingFetch.promise });
  const q = dragQuestion(fixtures.base, { local: false, offline: false });
  const selection = [0, 1, 2];
  const payload = answer(q, selection, { ordering_version: contract.ORDERING_VERSION });
  const state = h.mutations();
  const pending = h.api.recordLearningEvent(payload, q);
  selection.reverse();
  const server = {
    event_id: 81, question_id: q.id, correct: false, correct_index: 1, confidence: 2,
    selected_order: [0, 1, 2], ordering_version: contract.ORDERING_VERSION, explanation: 'Server authority.',
  };
  pendingFetch.resolve(jsonResponse(server));
  assert.deepEqual(plain(await pending), server);
  assert.deepEqual(h.requests[0].body.selected_order, [0, 1, 2]);
  assert.equal(h.requests[0].body.ordering_version, contract.ORDERING_VERSION);
  assert.equal(h.requests[0].body.confidence, 4, 'request inference uses the canonical local order');
  assert.ok(h.requests[0].url.endsWith('/api/session/event'));
  assert.equal(h.requests[0].method, 'POST');
  assert.deepEqual(h.mutations(), state, 'a successful server review never mirrors into local SRS');
});

test('remote submit transports copied orders and returns server scoring, without offline stats or SRS', async () => {
  const pendingFetch = deferred();
  const h = await harness({ fetchImpl: () => pendingFetch.promise });
  const q = dragQuestion(fixtures.base, { local: false, offline: false });
  const selection = [0, 1, 2];
  const payload = batch([answer(q, selection, { ordering_version: contract.ORDERING_VERSION })]);
  const state = h.mutations();
  const pending = h.api.submitQuiz(payload, [q]);
  selection.reverse();
  const server = { score: 0, total: 1, results: [{ question_id: q.id, correct: false, explanation: 'Server authority.' }] };
  pendingFetch.resolve(jsonResponse(server));
  assert.deepEqual(plain(await pending), server);
  assert.deepEqual(h.requests[0].body.answers[0].selected_order, [0, 1, 2]);
  assert.equal(h.requests[0].body.answers[0].ordering_version, contract.ORDERING_VERSION);
  assert.ok(h.requests[0].url.endsWith('/api/quiz/submit'));
  assert.deepEqual(h.mutations(), state);
  const authoritative = await harness({ fetchImpl: async () => jsonResponse(server) });
  assert.deepEqual(plain(await authoritative.api.submitQuiz(payload, [])), server,
    'a successful remote submission need not have a locally cached question');
  assert.equal(authoritative.writes.length, 0);
  assert.equal(authoritative.reviews.length, 0);
});

test('network fallback event retains the original selection after caller mutation', async () => {
  const pendingFetch = deferred();
  const h = await harness({ fetchImpl: () => pendingFetch.promise });
  const q = dragQuestion(fixtures.base, { local: false, offline: false });
  const selection = [0, 1, 2];
  const pending = h.api.recordLearningEvent(answer(q, selection), q);
  selection.reverse();
  pendingFetch.reject(new TypeError('mock disconnect after sending'));
  const review = await pending;
  assert.equal(review.correct, true);
  assert.equal(review.offline, true);
  assert.deepEqual(plain(review.selected_order), [0, 1, 2]);
  assert.equal(review.ordering_version, contract.ORDERING_VERSION);
  assert.equal(h.reviews.length, 1);
  assert.equal(h.reviews[0].outcome.correct, true);
  assert.equal(h.writes.length, 0);
});

test('fallback history retains copied selected_order and canonical version, not later caller edits', async () => {
  const pendingFetch = deferred();
  const h = await harness({ fetchImpl: () => pendingFetch.promise });
  const q = dragQuestion(fixtures.base, { local: false, offline: false });
  const selection = [0, 1, 2];
  const payload = batch([answer(q, selection, { ordering_version: 'caller-cannot-override' })]);
  const pending = h.api.submitQuiz(payload, [q]);
  selection.reverse();
  payload.answers[0].selected_index = 99;
  pendingFetch.reject(new TypeError('mock disconnect after sending'));
  const submitted = await pending;
  assert.equal(submitted.score, 1);
  assert.equal(submitted.offline, true);
  const saved = h.read('coreHistory').at(-1).answers[0];
  assert.deepEqual(saved.selected_order, [0, 1, 2]);
  assert.equal(saved.selected_index, q.correct_index);
  assert.equal(saved.ordering_version, contract.ORDERING_VERSION);
  assert.deepEqual(h.requests[0].body.answers[0].selected_order, [0, 1, 2]);
  assert.deepEqual(h.read('coreStats'), { attempts: 4, answered: 9, correct: 6 });
  assert.equal(h.reviews.length, 0);
});

for (const status of [400, 401, 403, 404, 409, 422, 429]) {
  test(`HTTP ${status} rejects event and submission without any offline writes`, async () => {
    const h = await harness({ fetchImpl: async () => jsonResponse({ detail: 'mock client rejection' }, status) });
    const q = dragQuestion(fixtures.base, { local: false, offline: false });
    const payload = answer(q, [0, 1, 2]);
    const state = h.mutations();
    await assert.rejects(h.api.recordLearningEvent(payload, q), { status, message: 'mock client rejection' });
    await assert.rejects(h.api.submitQuiz(batch([payload]), [q]), { status, message: 'mock client rejection' });
    assert.deepEqual(h.mutations(), state);
    assert.equal(h.requests.length, 2, 'write requests must not retry or fall back on client rejection');
  });
}

for (const failure of ['network', 500, 502, 503, 504]) {
  test(`${failure} failure falls back to canonical event and submission grading`, async () => {
    const h = await harness({ fetchImpl: async () => {
      if (failure === 'network') throw new TypeError('mock network outage');
      return jsonResponse({ detail: 'mock server outage' }, failure);
    } });
    const q = dragQuestion(fixtures.base, { local: false, offline: false });
    const review = await h.api.recordLearningEvent(answer(q, [2, 1, 0]), q);
    assert.equal(review.correct, false);
    assert.equal(review.offline, true);
    assert.equal(review.ordering_version, contract.ORDERING_VERSION);
    assert.equal(h.reviews.length, 1);
    assert.equal(h.reviews[0].outcome.correct, false);
    assert.equal(h.writes.length, 0);
    const submitted = await h.api.submitQuiz(batch([answer(q, [0, 1, 2])]), [q]);
    assert.equal(submitted.offline, true);
    assert.equal(submitted.score, 1);
    assert.equal(h.read('coreHistory').at(-1).answers[0].ordering_version, contract.ORDERING_VERSION);
    assert.deepEqual(h.read('coreStats'), { attempts: 4, answered: 9, correct: 6 });
    assert.equal(h.requests.length, 2, 'non-idempotent writes do not retry');
  });
}

test('localQuiz generates whole-word indexed chips, attached punctuation, and a visibly different scramble', async () => {
  const makeCard = (id, character, exampleSentence) => ({
    id, character, exampleSentence, hskLevel: 1, pinyin: 'test', meaning: `meaning ${id}`, exampleVi: `example ${id}`,
  });
  const cards = [
    makeCard(1, '想', '我想想办法。'),
    makeCard(2, '学习', '“学习”，学习。'),
    makeCard(3, '中文', '我学习中文。'),
    makeCard(4, '学习', '学习。'), // Only one meaningful chip.
    makeCard(5, '老师', '我在学习中文。'), // Target is absent.
    makeCard(6, '快乐', ''), // No example: never invent a target-word-only exercise.
    makeCard(7, '哈', '哈哈'), // All chip identities have identical text.
  ];
  const before = structuredClone(cards);
  const h = await harness({ cards });
  const generated = await h.api.localQuiz({ levels: [1], quiz_type: 'drag_drop', limit: cards.length });
  assert.equal(generated.offline, true);
  assert.deepEqual(plain(generated.questions.map(q => q.word.word_id)).sort((a, b) => a - b), [1, 2, 3]);
  for (const q of generated.questions) {
    const ordering = contract.normalizeOrdering(q.metadata_json);
    const original = cards.find(card => card.id === q.word.word_id).exampleSentence;
    const correct = ordering.correct_order.map(i => ordering.segments[i]).join('');
    assert.equal(q.local, true);
    assert.equal(q.offline, true);
    assert.equal(ordering.ordering_version, contract.ORDERING_VERSION);
    assert.equal(correct, original);
    assert.ok(ordering.segments.every(segment => /[\p{L}\p{N}]/u.test(segment)), 'no punctuation-only chips');
    assert.deepEqual(plain([...ordering.scrambled_indices].sort((a, b) => a - b)),
      ordering.segments.map((_, i) => i).map(Number).slice().reduce((out, i) => [...out, i], []));
    assert.notEqual(ordering.scrambled_indices.map(i => ordering.segments[i]).join(''), correct);
  }
  const byWord = new Map(generated.questions.map(q => [q.word.word_id, q]));
  assert.deepEqual(plain(byWord.get(1).metadata_json.segments), ['我', '想', '想', '办法。']);
  assert.deepEqual(plain(byWord.get(2).metadata_json.segments), ['“学习”，', '学习。']);
  assert.deepEqual(plain(byWord.get(3).metadata_json.segments), ['我学习', '中文。']);
  assert.deepEqual(cards, before);
  assert.equal(h.vocabLoads, 1);
  assert.equal(h.requests.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(h.reviews.length, 0);
  const duplicate = byWord.get(1);
  const swapped = [0, 2, 1, 3];
  assert.equal(swapped.map(i => duplicate.metadata_json.segments[i]).join(''), '我想想办法。');
  assert.equal((await h.api.recordLearningEvent(answer(duplicate, swapped), duplicate)).correct, false);
  const submitted = await h.api.submitQuiz(batch([answer(duplicate, [0, 1, 2, 3])]), [duplicate]);
  assert.equal(submitted.score, 1);
});
