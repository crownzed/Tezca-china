import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const { getStreakTier, getFlameScale, getStreakTransition, consumeBurst, clampFlameDelta, getFlameVisualState } = await loadSource(
  'src/components/streak/flame-visual.js',
);

const capable = {
  active: true,
  studiedToday: false,
  hardwareTier: 'high',
  reducedMotion: false,
  webglSupported: true,
};

for (const [days, tier] of [[0, 'ember'], [7, 'ember'], [8, 'flame'], [30, 'flame'], [31, 'inferno'], [99, 'inferno'], [100, 'golden'], [365, 'golden']]) {
  test(`streak ${days} uses the ${tier} tier`, () => {
    assert.equal(getStreakTier(days), tier);
  });
}

test('flame scale safely clamps invalid and negative streak values', () => {
  for (const value of [undefined, null, '7', NaN, Infinity, -Infinity, -12]) {
    assert.equal(getFlameScale(value), 0.42, `invalid streak: ${String(value)}`);
  }
});

test('flame scale grows monotonically within finite bounds and plateaus at 365', () => {
  const values = [0, 1, 7, 30, 100, 365, 366, 1000000];
  const scales = values.map(getFlameScale);
  for (const scale of scales) {
    assert.ok(Number.isFinite(scale));
    assert.ok(scale >= 0.42 && scale <= 1);
  }
  for (let index = 1; index < scales.length; index += 1) {
    assert.ok(scales[index] >= scales[index - 1], `${values[index]} should not shrink`);
  }
  assert.equal(getFlameScale(365), 1);
  assert.equal(getFlameScale(366), 1);
  assert.equal(getFlameScale(Number.MAX_VALUE), 1);
  assert.ok(getFlameScale(0.5) > getFlameScale(0));
});

for (const { name, baseline, updates, expected } of [
  {
    name: 'initial hydration establishes a baseline without celebrating',
    baseline: null,
    updates: [[0, true], [14, true], [14, false], [14, false], [15, false]],
    expected: [[null, false], [null, false], [14, false], [14, false], [15, true]],
  },
  {
    name: 'a reload preserves a loaded baseline and celebrates an increase',
    baseline: 3,
    updates: [[3, true], [4, false], [4, false]],
    expected: [[3, false], [4, true], [4, false]],
  },
  {
    name: 'loading placeholders do not replace the last loaded streak',
    baseline: 3,
    updates: [[0, true], [99, true], [4, false]],
    expected: [[3, false], [3, false], [4, true]],
  },
  {
    name: 'an unchanged reload does not celebrate after a loading placeholder',
    baseline: 3,
    updates: [[0, true], [3, false]],
    expected: [[3, false], [3, false]],
  },
  {
    name: 'a loaded decrease resets the baseline without celebrating',
    baseline: 3,
    updates: [[3, true], [2, false], [0, false], [1, false]],
    expected: [[3, false], [2, false], [0, false], [1, true]],
  },
  {
    name: 'a loaded zero baseline celebrates the first earned day',
    baseline: 0,
    updates: [[0, false], [1, false], [1, false]],
    expected: [[0, false], [1, true], [1, false]],
  },
]) {
  test(name, () => {
    let previous = baseline;
    const actual = updates.map(([currentStreak, loading]) => {
      const transition = getStreakTransition(previous, currentStreak, loading);
      previous = transition.baseline;
      return [previous, transition.increased];
    });
    assert.deepEqual(actual, expected);
  });
}

test('each increasing burst ID is consumed once without lowering the watermark', () => {
  let watermark = 0;
  const consumed = [];
  for (const id of [0, 1, 1, 2, 0, 1, 2, 3, 12, 12, 11, 13]) {
    const next = consumeBurst(watermark, id);
    if (next > watermark) consumed.push(next);
    watermark = next;
  }
  assert.deepEqual(consumed, [1, 2, 3, 12, 13]);
  assert.equal(watermark, 13);
});

test('a mounted scene seeds its burst watermark without replaying historical events', () => {
  const watermark = consumeBurst(0, 8);
  assert.equal(consumeBurst(watermark, 8), 8);
  assert.equal(consumeBurst(watermark, 0), 8);
  assert.equal(consumeBurst(watermark, 9), 9);
});

test('invalid burst IDs never trigger an event', () => {
  for (const value of [undefined, null, '9', NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(consumeBurst(4, value), 4, `invalid ID: ${String(value)}`);
  }
});

test('animation deltas are finite, nonnegative and capped after a pause', () => {
  for (const [input, expected] of [[0, 0], [0.016, 0.016], [0.05, 0.05], [1, 0.05], [3600, 0.05], [-1, 0]]) {
    assert.equal(clampFlameDelta(input), expected);
  }
  for (const input of [NaN, Infinity, -Infinity, undefined, null, '0.016']) {
    assert.equal(clampFlameDelta(input), 0);
  }
});

test('loading keeps the SVG and fallback embers until the model has rendered', () => {
  assert.deepEqual({ ...getFlameVisualState(capable) }, {
    use3D: true,
    showModel: false,
    running: true,
    particleCount: 95,
    fallbackEmbers: 6,
  });
  assert.deepEqual({ ...getFlameVisualState({ ...capable, modelReady: true }) }, {
    use3D: true,
    showModel: true,
    running: true,
    particleCount: 95,
    fallbackEmbers: 0,
  });
});

for (const [name, gate, embers] of [
  ['inactive streak', { active: false }, 0],
  ['reduced motion', { reducedMotion: true }, 0],
  ['low hardware tier', { hardwareTier: 'low' }, 6],
  ['unsupported WebGL', { webglSupported: false }, 6],
  ['renderer or asset failure', { failed: true }, 6],
]) {
  test(`${name} keeps the SVG even if a previous model reported ready`, () => {
    assert.deepEqual({ ...getFlameVisualState({ ...capable, modelReady: true, ...gate }) }, {
      use3D: false,
      showModel: false,
      running: false,
      particleCount: 0,
      fallbackEmbers: embers,
    });
  });
}

for (const visibility of [{ inView: false }, { pageVisible: false }, { inView: false, pageVisible: false }]) {
  test(`visibility ${JSON.stringify(visibility)} pauses without removing the ready model`, () => {
    const state = getFlameVisualState({ ...capable, modelReady: true, ...visibility });
    assert.equal(state.use3D, true);
    assert.equal(state.showModel, true);
    assert.equal(state.running, false);
    assert.equal(state.fallbackEmbers, 0);
  });
}

test('loading offscreen keeps the fallback, and returning resumes rendering', () => {
  const paused = getFlameVisualState({ ...capable, inView: false });
  assert.equal(paused.use3D, true);
  assert.equal(paused.showModel, false);
  assert.equal(paused.running, false);
  assert.equal(paused.fallbackEmbers, 6);
  assert.equal(getFlameVisualState({ ...capable, inView: true }).running, true);
});

test('studying today boosts medium/high particle budgets without changing the renderer gate', () => {
  for (const [hardwareTier, resting, studied] of [['medium', 55, 77], ['high', 95, 133]]) {
    assert.equal(getFlameVisualState({ ...capable, hardwareTier }).particleCount, resting);
    const state = getFlameVisualState({ ...capable, hardwareTier, studiedToday: true });
    assert.equal(state.use3D, true);
    assert.equal(state.particleCount, studied);
    assert.equal(state.fallbackEmbers, 8);
  }
  const fallback = getFlameVisualState({ ...capable, hardwareTier: 'low', studiedToday: true });
  assert.equal(fallback.particleCount, 0);
  assert.equal(fallback.fallbackEmbers, 8);
  assert.equal(getFlameVisualState({ ...capable, studiedToday: true, reducedMotion: true }).fallbackEmbers, 0);
});
