import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const { normalizeFreezesRemaining } = await loadSource('src/hooks/useStreakData.js', {
  imports: {
    '../auth-core': { useAuth: () => ({ userId: 'learner', isAuthenticated: true }) },
    react: {
      useCallback: callback => callback,
      useEffect: () => {},
      useState: initial => [initial, () => {}],
    },
  },
  globals: {
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    localStorage: { getItem: () => null },
  },
});

test('normalizes freeze balances from the streak API without exposing negatives or fractions', () => {
  for (const [value, expected] of [
    [undefined, 0], [null, 0], ['', 0], ['bad', 0], [-1, 0], [-2.8, 0],
    [0, 0], ['1', 1], [1.9, 1], [2, 2], [Infinity, 0], [NaN, 0],
  ]) {
    assert.equal(normalizeFreezesRemaining(value), expected, String(value));
  }
});
