import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const levelsSource = await readFile(new URL('../src/hsk-levels.js', import.meta.url), 'utf8');

test('dashboard focus selector uses the canonical six HSK levels', () => {
  assert.match(levelsSource, /export const ALL_LEVELS = \[1, 2, 3, 4, 5, 6\]/);
  assert.match(appSource, /import \{ ALL_LEVELS, primaryLevel, normalizeLevels,/);
  assert.match(appSource, /const FOCUS_LEVELS = ALL_LEVELS;/);
  assert.match(appSource, /levels=\{FOCUS_LEVELS\}/);
});

test('dashboard focus selector keeps the shared primary-level and persistence flow', () => {
  assert.match(appSource, /const checkLevel = primaryLevel\(selection, focusLevel \|\| 1\)/);
  assert.match(appSource, /window\.localStorage\.setItem\('hskFocusLevel', JSON\.stringify\(applied\)\)/);
});
