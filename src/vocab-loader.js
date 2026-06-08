// ============================================================
// VOCAB-LOADER — Hợp nhất data.js + vocab-bank + mega-vocab
// Có xử lý lỗi, fallback nếu generator fail
// ============================================================

let cachedAllCards = null;

function isReliableCard(card) {
  const level = Number(card.hskLevel ?? card.level);
  return Boolean(
    level >= 1
    && level <= 6
    && card.character
    && card.pinyin
    && card.pinyin !== '...'
    && card.meaning
    && card.meaning !== 'Từ ghép'
  );
}

export async function loadAllFlashcards() {
  if (cachedAllCards) return cachedAllCards;

  try {
    const [dataModule, bankModule, megaModule] = await Promise.all([
      import('./data'),
      import('./vocab-bank'),
      import('./mega-vocab')
    ]);

    const richCards = dataModule.flashcardsData || [];
    const bankSets = [bankModule.hsk1, bankModule.hsk2, bankModule.hsk3, bankModule.hsk4, bankModule.hsk5];
    const bankCards = bankSets.flat();

    let megaCards = [];
    try {
      megaCards = megaModule.generateMegaVocab(20000) || [];
    } catch (e) {
      console.warn('Mega vocab failed, using smaller pool:', e.message);
    }

    const byLevelAndChar = new Map();
    const addCard = (card) => {
      if (!isReliableCard(card)) return;
      const key = `${card.hskLevel}-${card.character}`;
      const current = byLevelAndChar.get(key);
      const score = (Array.isArray(card.examples) ? card.examples.length * 3 : 0) + (card.exampleSentence ? 2 : 0) + (card.mnemonic ? 1 : 0);
      const currentScore = current ? (Array.isArray(current.examples) ? current.examples.length * 3 : 0) + (current.exampleSentence ? 2 : 0) + (current.mnemonic ? 1 : 0) : -1;
      if (!current || score > currentScore) byLevelAndChar.set(key, card);
    };

    [...richCards, ...bankCards, ...megaCards].forEach(addCard);

    cachedAllCards = [...byLevelAndChar.values()].sort((a, b) => Number(a.hskLevel) - Number(b.hskLevel));
    return cachedAllCards;
  } catch (err) {
    console.error('Vocab loader error:', err);
    cachedAllCards = [];
    return [];
  }
}

export function getCounts(cards) {
  if (!cards || !cards.length) return {};
  const counts = {};
  cards.forEach(c => {
    const key = `HSK ${c.hskLevel}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}
