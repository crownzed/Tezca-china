import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const PAGE_SIZE = 500;

function word(id, level) {
  return {
    id,
    hanzi: `词${id}`,
    pinyin: `cí ${id}`,
    meaning_vi: `Nghĩa ${id}`,
    hsk_level: level,
    pos: 'n',
    examples: [],
  };
}

async function loadVocabLoader({ getWords, fallbackModules } = {}) {
  return loadSource('src/vocab-loader.js', {
    imports: {
      './api-core': { getWords: getWords || (async () => { throw new Error('offline'); }) },
      './data': fallbackModules?.data || { flashcardsData: [] },
      './mega-vocab': fallbackModules?.mega || { generateMegaVocab: () => [] },
    },
    globals: { Math },
  });
}

test('vocab loader collects every backend page before caching the six HSK levels', async () => {
  const source = [
    ...Array.from({ length: PAGE_SIZE }, (_, index) => word(index + 1, 1)),
    word(501, 5),
    word(502, 6),
  ];
  const calls = [];
  const loader = await loadVocabLoader({
    getWords: async (levels, options) => {
      calls.push({ levels, options: { ...options } });
      return { words: source.slice(options.offset, options.offset + options.limit) };
    },
  });

  const cards = await loader.loadAllFlashcards();
  assert.deepEqual(calls, [
    { levels: undefined, options: { offset: 0, limit: PAGE_SIZE } },
    { levels: undefined, options: { offset: PAGE_SIZE, limit: PAGE_SIZE } },
  ]);
  assert.equal(cards.filter(card => card.hskLevel === 5).length, 1);
  assert.equal(cards.filter(card => card.hskLevel === 6).length, 1);
  assert.equal(cards.find(card => card.hskLevel === 5)?.character, '词501');
  assert.equal(cards.find(card => card.hskLevel === 6)?.character, '词502');
});

test('vocab loader retains HSK 5 and HSK 6 cards in its offline fallback', async () => {
  const loader = await loadVocabLoader({
    fallbackModules: {
      data: { flashcardsData: [] },
      mega: {
        generateMegaVocab: () => [
          { id: 1, character: '遗产', pinyin: 'yíchǎn', meaning: 'Di sản', hskLevel: 5 },
          { id: 2, character: '渊博', pinyin: 'yuānbó', meaning: 'Uyên bác', hskLevel: 6 },
        ],
      },
    },
  });

  const cards = await loader.loadAllFlashcards();
  assert.deepEqual(JSON.parse(JSON.stringify(cards.map(card => [card.hskLevel, card.character]))), [
    [5, '遗产'],
    [6, '渊博'],
  ]);
  assert.ok(cards.every(card => card.id.startsWith('local-')));
});
