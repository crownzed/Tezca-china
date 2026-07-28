// ============================================================
// VOCAB-LOADER — Hợp nhất data.js + vocab-bank + mega-vocab
// Có xử lý lỗi, fallback nếu generator fail
// ============================================================
import { getWords } from './api-core';

let cachedAllCards = null;
// Guard in-flight: hai lời gọi loadAllFlashcards() đồng thời (vd nhiều component
// mount cùng lúc) trước đây đều fetch backend rồi cùng ghi cache. Chia sẻ MỘT
// promise để chỉ nạp một lần; các caller sau chờ cùng kết quả.
let cachedAllCardsPromise = null;

// Điểm "giàu dữ liệu" của một thẻ — dùng để chọn bản tốt nhất khi trùng
// (level, character). Nhiều example + có câu ví dụ + có mnemonic = điểm cao hơn.
function cardRichness(card) {
  return (Array.isArray(card.examples) ? card.examples.length * 3 : 0)
    + (card.exampleSentence ? 2 : 0)
    + (card.mnemonic ? 1 : 0);
}

// Khử trùng theo (hskLevel, character), giữ bản giàu dữ liệu nhất.
function dedupeCards(cards) {
  const byLevelAndChar = new Map();
  for (const card of cards) {
    if (!isReliableCard(card)) continue;
    const key = `${card.hskLevel}-${card.character}`;
    const current = byLevelAndChar.get(key);
    if (!current || cardRichness(card) > cardRichness(current)) {
      byLevelAndChar.set(key, card);
    }
  }
  return [...byLevelAndChar.values()].sort((a, b) => Number(a.hskLevel) - Number(b.hskLevel));
}

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

// Map một dòng /api/words (WordOut) sang shape thẻ mà frontend đang dùng
// (character/hskLevel/meaning + examples[{cn,pinyin,vi}]).
function mapBackendWord(w) {
  const examples = Array.isArray(w.examples)
    ? w.examples
        .filter(e => e && e.cn)
        .map(e => ({ cn: e.cn, pinyin: '', vi: e.vi || '' }))
    : [];
  return {
    id: `db-${w.id}`,
    character: w.hanzi,
    pinyin: w.pinyin || '',
    meaning: w.meaning_vi || '',
    hskLevel: Number(w.hsk_level),
    category: w.pos || 'core',
    strokeCount: 0,
    examples,
    exampleSentence: examples[0]?.cn || '',
    examplePinyin: '',
    exampleVi: examples[0]?.vi || '',
    breakdown: w.radical ? [{ radical: w.radical, meaning: '' }] : [],
    mnemonic: w.component_hint || '',
    // Cặp dễ nhầm do pipeline enrichment sinh (confusable_words_json). DB dev có
    // thể chưa enrich => rỗng; ConfusablePairs tự suy cặp khi thiếu.
    confusables: Array.isArray(w.confusable_words) ? w.confusable_words.filter(Boolean) : [],
  };
}

// Nguồn sự thật là DB backend (/api/words). Trả thẳng khi lấy được đủ từ; nếu
// backend lỗi/ngủ (Render cold start) hoặc trả rỗng thì degrade sạch về file JS
// local để app vẫn dùng offline được.
async function loadFromBackend() {
  const data = await getWords();
  const words = data?.words || [];
  const cards = words.map(mapBackendWord).filter(isReliableCard);
  return cards;
}

async function _loadAllFlashcards() {
  try {
    const backendCards = await loadFromBackend();
    if (backendCards.length) {
      // Dedup cả nhánh backend: DB có thể có trùng (hanzi, hsk_level) do import
      // nhiều nguồn — trước đây nhánh này trả thẳng, để lọt thẻ trùng.
      return dedupeCards(backendCards);
    }
  } catch (err) {
    console.warn('Backend vocab unavailable, falling back to local files:', err.message);
  }

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
      megaCards = megaModule.generateMegaVocab(5000) || [];
    } catch (e) {
      console.warn('Mega vocab failed, using smaller pool:', e.message);
    }

    return dedupeCards([...richCards, ...bankCards, ...megaCards]);
  } catch (err) {
    console.error('Vocab loader error:', err);
    return [];
  }
}

export async function loadAllFlashcards() {
  if (cachedAllCards) return cachedAllCards;
  // Chia sẻ promise đang chạy để tránh nạp nhiều lần khi gọi đồng thời.
  if (cachedAllCardsPromise) return cachedAllCardsPromise;
  cachedAllCardsPromise = _loadAllFlashcards()
    .then(cards => {
      cachedAllCards = cards;
      return cards;
    })
    .finally(() => {
      // Cho phép thử lại nếu lần này rơi về mảng rỗng (backend ngủ + local lỗi).
      cachedAllCardsPromise = null;
    });
  return cachedAllCardsPromise;
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
