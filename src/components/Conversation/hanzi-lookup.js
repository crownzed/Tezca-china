// Tra cứu pinyin + nghĩa tiếng Việt theo TỪNG chữ Hán, phục vụ tooltip hội thoại.
// Nguồn dữ liệu là kho flashcard có sẵn (loadAllFlashcards). Chữ nào không có
// trong kho thì trả null -> UI bỏ qua tooltip cho chữ đó (degrade sạch).

let cache = null;
let building = null;

// Dựng map: ký tự Hán đơn -> { pinyin, meaning }. Với từ nhiều ký tự, ta vẫn
// tách từng ký tự để có dữ liệu ở mức chữ; ưu tiên giữ entry xuất hiện trước
// (kho đã sort theo HSK level nên chữ phổ biến/level thấp được ưu tiên).
async function build() {
  const map = new Map();
  try {
    const { loadAllFlashcards } = await import('../../vocab-loader.js');
    const cards = await loadAllFlashcards();
    for (const card of cards) {
      const word = String(card.character || '');
      // Từ đơn ký tự: gán trực tiếp pinyin + nghĩa của card.
      if (word.length === 1 && !map.has(word)) {
        map.set(word, { pinyin: card.pinyin || '', meaning: card.meaning || '' });
      }
    }
  } catch {
    /* kho lỗi -> map rỗng, tooltip tắt toàn bộ, không vỡ UI */
  }
  cache = map;
  return map;
}

export function ensureHanziIndex() {
  if (cache) return Promise.resolve(cache);
  if (!building) building = build();
  return building;
}

export function lookupHanzi(char) {
  if (!cache) return null;
  return cache.get(char) || null;
}

const HAN_RE = /[㐀-鿿]/;

export function isHanzi(char) {
  return HAN_RE.test(char);
}
