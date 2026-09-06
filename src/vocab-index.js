// ============================================================
// VOCAB-INDEX — Tra từ vựng có trong MỘT ĐOẠN chữ Hán.
//
// Có màn luyện tập chấm ở mức CÂU chứ không mức từ (luyện dịch, phát âm cả câu).
// Kho SRS lại khoá theo từng từ (vocab-srs.wordKeyOf). Muốn "SRS bao quát toàn
// hệ thống" thì phải nối được hai mức đó: dịch đúng câu 我昨天去商店 là bằng chứng
// thật rằng người học đang nhớ 昨天, 去, 商店 — nhưng chỉ khi ta biết ba cụm đó là
// từ trong kho, không phải cắt bừa từng chữ.
//
// Cách cắt: KHỚP DÀI NHẤT TRƯỚC (longest-match) trên chính kho flashcard đang
// dùng làm nguồn từ vựng. Không kéo thêm thư viện phân từ (jieba) vì kho từ ở đây
// mới là tập cần tính điểm — một cụm không có trong kho thì cũng không có lịch ôn
// để cập nhật, phân từ đúng đến đâu cũng vô dụng.
// ============================================================

import { loadAllFlashcards } from './vocab-loader.js';

// Chỉ ghép tối đa 4 chữ: từ HSK dài nhất trong kho là 4 chữ (thành ngữ), quét dài
// hơn chỉ tốn vòng lặp.
const MAX_WORD_LEN = 4;
const HAN_RE = /[㐀-鿿]/;

let cache = null;
let building = null;

async function build() {
  const byHanzi = new Map();
  try {
    const cards = await loadAllFlashcards();
    for (const card of cards) {
      const hanzi = String(card.character || card.hanzi || '').trim();
      if (!hanzi || byHanzi.has(hanzi)) continue;
      byHanzi.set(hanzi, {
        word_id: card.id,
        hanzi,
        pinyin: card.pinyin || '',
        meaning_vi: card.meaning_vi || card.meaning || '',
        level: Number(card.hskLevel ?? card.level) || 0,
      });
    }
  } catch {
    // Kho lỗi → index rỗng. Caller chỉ mất phần cộng điểm mức câu, không vỡ UI.
  }
  cache = byHanzi;
  return byHanzi;
}

export function ensureVocabIndex() {
  if (cache) return Promise.resolve(cache);
  if (!building) building = build();
  return building;
}

// Các từ trong kho xuất hiện trong `text`, cắt theo khớp dài nhất, KHÔNG trùng
// lặp vùng ký tự. Trả record shape mà vocab-srs.recordWordReview đọc được.
//
// `limit` chặn số từ tính điểm cho một câu: một câu dài có thể chứa cả chục từ,
// ghi hết thì một lượt dịch đúng nhấc lịch ôn của cả chục từ cùng lúc — làm nhoè
// ý nghĩa của "đến hạn ôn". Ưu tiên từ DÀI (nội dung chính của câu) khi phải cắt.
export function matchWordsInText(text, limit = 8) {
  const index = cache;
  if (!index || !text) return [];
  const chars = String(text);
  const found = [];
  let i = 0;
  while (i < chars.length) {
    if (!HAN_RE.test(chars[i])) {
      i += 1;
      continue;
    }
    let hit = null;
    for (let len = Math.min(MAX_WORD_LEN, chars.length - i); len >= 1; len -= 1) {
      const candidate = chars.slice(i, i + len);
      const entry = index.get(candidate);
      if (entry) {
        hit = { entry, len };
        break;
      }
    }
    if (hit) {
      found.push(hit.entry);
      i += hit.len;
    } else {
      i += 1;
    }
  }

  if (found.length <= limit) return found;
  // Cắt bớt: giữ từ dài trước, nhưng trả về theo đúng thứ tự xuất hiện trong câu.
  const keep = new Set(
    [...found]
      .sort((a, b) => b.hanzi.length - a.hanzi.length)
      .slice(0, limit)
      .map(entry => entry.hanzi),
  );
  return found.filter(entry => keep.has(entry.hanzi));
}
