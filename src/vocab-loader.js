// ============================================================
// VOCAB-LOADER — Hợp nhất data.js + vocab-bank + mega-vocab
// Có xử lý lỗi, fallback nếu generator fail
// ============================================================

let cachedAllCards = null;

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

    const existingChars = new Set(richCards.map(c => c.character));
    bankCards.forEach(c => existingChars.add(c.character));

    const newMega = megaCards.filter(c => !existingChars.has(c.character));

    cachedAllCards = [...richCards, ...bankCards, ...newMega];
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
