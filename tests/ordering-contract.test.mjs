import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/ordering-v1.json', import.meta.url), 'utf8'));
const { normalizeOrdering, gradeOrdering, scrambleOrder } = await loadSource('src/ordering-contract.js');
const plain = value => JSON.parse(JSON.stringify(value));

for (const fixture of fixtures.cases) {
  test(`shared ordering: ${fixture.name}`, () => {
    const metadata = structuredClone(Object.hasOwn(fixture, 'metadata')
      ? fixture.metadata : { ...fixtures.base, ...fixture.patch });
    for (const key of fixture.omit || []) delete metadata[key];
    const before = structuredClone(metadata);
    if (fixture.error) {
      assert.throws(() => normalizeOrdering(metadata), { message: fixture.error });
    } else {
      const ordering = normalizeOrdering(metadata);
      if (fixture.normalized) assert.deepEqual(plain(ordering), fixture.normalized);
      else if (metadata.correct_order.every(Number.isInteger)) {
        assert.deepEqual(plain(ordering.correct_order), metadata.correct_order);
      }
      for (const answer of fixture.answers || []) {
        if (answer.error) {
          assert.throws(() => gradeOrdering(metadata, answer.selected), { message: answer.error });
        } else {
          assert.equal(gradeOrdering(metadata, answer.selected), answer.correct);
        }
      }
    }
    assert.deepEqual(metadata, before);
  });
}

test('scramble is visibly different even with identity RNG and duplicate tokens', () => {
  for (const [segments, correct] of [
    [['我', '是', '学生。'], [0, 1, 2]],
    [['想', '想', '办法。'], [0, 1, 2]],
    [['是', '我', '学生。'], [1, 0, 2]],
  ]) {
    for (const rng of [() => 0.999999, () => 0, () => 0.5]) {
      const scrambled = scrambleOrder(segments, correct, rng);
      assert.deepEqual([...scrambled].sort(), [0, 1, 2]);
      assert.notEqual(scrambled.map(i => segments[i]).join(''), correct.map(i => segments[i]).join(''));
    }
  }
});

test('impossible visible scramble and invalid RNG fail closed', () => {
  assert.throws(() => scrambleOrder(['哈', '哈哈'], [0, 1], () => 0.999), { message: 'ordering_unscramblable' });
  for (const value of [NaN, Infinity, -0.1, 1]) {
    assert.throws(() => scrambleOrder(['我', '来。'], [0, 1], () => value), { message: 'ordering_rng' });
  }
});
