// ============================================================
// VOCAB-LOADER — Hợp nhất data.js + vocab-bank + mega-vocab
// Có xử lý lỗi, fallback nếu generator fail
// ============================================================
import { flashcardsData } from './data';
import { getWords } from './api-core';
import { generateMegaVocab } from './mega-vocab';

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
    // Chi tiết ngữ nghĩa/lưu ý/cách dùng — do dual-professor enrichment sinh.
    // Từ chưa enrich sẽ có chuỗi rỗng/mảng trống, UI tự ẩn section tương ứng.
    semanticNotes: w.semantic_notes || '',
    usageNotes: w.usage_notes || '',
    usagePatterns: Array.isArray(w.usage_patterns) ? w.usage_patterns : [],
    characterAnalysis: w.character_analysis || '',
  };
}

const VOCAB_PAGE_SIZE = 500;

// Nguồn sự thật là DB backend (/api/words). Endpoint cố ý phân trang để không
// gửi ~5.7k từ trong một response; nạp hết các trang trước khi cache để HSK 5/6
// không bị mất chỉ vì đứng sau 500 từ đầu theo thứ tự cấp.
async function loadFromBackend() {
  const cards = [];
  for (let offset = 0; ; offset += VOCAB_PAGE_SIZE) {
    const data = await getWords(undefined, { offset, limit: VOCAB_PAGE_SIZE });
    const words = Array.isArray(data?.words) ? data.words : [];
    cards.push(...words.map(mapBackendWord).filter(isReliableCard));
    if (words.length < VOCAB_PAGE_SIZE) break;
  }
  return cards;
}

// Khoá SRS của một từ suy từ card.id (vocab-srs.wordKeyOf). Ba nguồn file local
// đánh id độc lập nhau và đều là số đếm từ 1 (data.js: 1..30, mega-vocab: 1..5000,
// vocab-bank: không có id) nên id trần KHÔNG định danh được từ: data.js#5 và
// mega-vocab#5 là hai từ khác nhau mà cùng khoá, còn từ trong vocab-bank thì không
// có khoá. Nặng hơn: số trần trùng luôn với word_id của DB backend, tức lịch ôn của
// một từ local có thể bị gộp vào một từ backend hoàn toàn khác.
//
// Đặt lại id theo (cấp, chữ) — đúng cặp mà dedupeCards dùng làm khoá trùng — nên id
// ổn định giữa các phiên và không đụng key space 'db-<id>' của backend.
function withLocalIds(cards) {
  return cards.map(card => ({
    ...card,
    id: `local-${card.hskLevel ?? card.level ?? 'x'}-${card.character}`,
  }));
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
    const richCards = flashcardsData || [];

    let megaCards = [];
    try {
      megaCards = generateMegaVocab(5000) || [];
    } catch (err) {
      console.warn('Mega vocab failed, using smaller pool:', err.message);
    }

    // mega-vocab là fallback sáu cấp đầy đủ. Không ghép vocab-bank ở đây: nó chỉ
    // có HSK 1–5 và từng làm nhánh offline thiếu toàn bộ HSK 6.
    return dedupeCards(withLocalIds([...richCards, ...megaCards]));
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
