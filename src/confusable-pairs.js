// ============================================================
// CONFUSABLE-PAIRS — Dựng cặp từ DỄ NHẦM từ kho từ vựng.
//
// Nguồn 1 (tốt nhất): `confusables` trên thẻ — chính là confusable_words_json do
// enrichment_service.py sinh bằng LLM, giờ đã lộ qua /api/words. Cặp ở đây đã
// được kiểm "cùng từ loại, cùng cấp hoặc thấp hơn, đặt vào ngữ cảnh nhau thì SAI".
//
// Nguồn 2 (fallback): tự suy. Cần thiết vì DB có thể chưa chạy enrichment (dev.db
// hiện 0/313 từ có confusables) — không có fallback thì màn này trắng trơn. Suy
// theo 3 tín hiệu, mỗi tín hiệu là một kiểu nhầm thật của người Việt học Trung:
//   1. CHUNG CHỮ HÁN  (们/门 · 睛/晴): nhìn na ná, hay viết lẫn.
//   2. GẦN ÂM         (四/十 · shì/shí): chỉ khác thanh điệu hoặc phụ âm đầu.
//   3. GẦN NGHĨA      (nghĩa Việt trùng từ khoá): dịch ra tiếng Việt giống nhau
//      nên không biết chọn từ nào.
//
// Ghi rõ `reason` cho từng cặp để UI nói được VÌ SAO dễ nhầm, thay vì bắt người
// học tự đoán. Cặp suy máy móc yếu hơn cặp LLM nên luôn xếp sau (rank thấp hơn).
// ============================================================

// Bỏ dấu thanh + chuẩn hoá pinyin về chữ cái trần để so âm.
export function plainPinyin(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ü/g, 'v')
    .replace(/[^a-z]/g, '');
}

// Từ khoá nghĩa tiếng Việt: bỏ các từ chức năng để phần còn lại mới là nghĩa cốt.
// Không lọc thì "cái" / "của" / "người" làm mọi thứ trông giống nhau.
const VI_STOPWORDS = new Set([
  'là', 'của', 'và', 'các', 'những', 'một', 'cái', 'con', 'sự', 'việc', 'người',
  'có', 'không', 'được', 'cho', 'với', 'ở', 'thì', 'mà', 'này', 'đó', 'ấy',
  'rất', 'lại', 'đi', 'ra', 'vào', 'lên', 'xuống', 'chỉ', 'cũng', 'nữa',
]);

function viKeywords(meaning) {
  return String(meaning || '')
    .toLowerCase()
    .split(/[^a-zà-ỹ]+/i)
    .filter(token => token.length >= 2 && !VI_STOPWORDS.has(token));
}

// Có chung ít nhất một chữ Hán, nhưng KHÔNG phải một từ chứa trọn từ kia. 好/好吃
// chung chữ nhưng đó là quan hệ từ ghép, không phải nhầm mặt chữ.
function sharesCharacter(a, b) {
  if (a.includes(b) || b.includes(a)) return false;
  const setB = new Set([...b]);
  return [...a].some(char => setB.has(char));
}

// Gần âm: cùng chuỗi chữ cái (chỉ khác thanh điệu — kiểu nhầm nặng nhất), hoặc
// khác đúng 1 ký tự ở cùng độ dài (mà/mǎi, shì/shí).
function soundsAlike(a, b) {
  if (!a || !b || a === b) return false;
  if (a === b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
    if (diff > 1) return false;
  }
  return diff <= 1;
}

// Chuẩn hoá thẻ vocab-loader về shape gọn dùng trong module này.
function toEntry(card) {
  const level = Number(card.hskLevel ?? card.level) || 1;
  const hanzi = String(card.character || card.hanzi || '').trim();
  return {
    id: card.id,
    hanzi,
    pinyin: String(card.pinyin || '').trim(),
    meaning: String(card.meaning_vi || card.meaning || '').trim(),
    level,
    pos: String(card.category || '').trim(),
    examples: (Array.isArray(card.examples) ? card.examples : [])
      .map(row => ({ cn: String(row.cn || '').trim(), vi: String(row.vi || '').trim() }))
      .filter(row => row.cn),
    confusables: Array.isArray(card.confusables) ? card.confusables.filter(Boolean) : [],
    plain: plainPinyin(card.pinyin),
    keywords: viKeywords(card.meaning_vi || card.meaning),
  };
}

// Khoá cặp không phụ thuộc thứ tự — để 对/跟 và 跟/对 không thành hai cặp.
function pairKey(a, b) {
  return [a, b].sort().join('|');
}

const REASONS = {
  curated: { id: 'curated', label: 'Dễ nhầm khi dùng', rank: 4 },
  shape: { id: 'shape', label: 'Giống mặt chữ', rank: 3 },
  sound: { id: 'sound', label: 'Gần âm đọc', rank: 2 },
  meaning: { id: 'meaning', label: 'Nghĩa tiếng Việt gần nhau', rank: 1 },
};

// Câu ví dụ dùng làm đề: phải CHỨA từ đích để khoét lỗ được, và không chứa từ
// kia (nếu chứa cả hai thì cả hai đáp án đều "đúng" trong câu đó).
function pickPrompt(entry, other) {
  return entry.examples.find(row => row.cn.includes(entry.hanzi) && !row.cn.includes(other.hanzi)) || null;
}

/**
 * Dựng danh sách cặp dễ nhầm từ kho thẻ đã lọc cấp.
 * Trả về [{ key, a, b, reason, hasDrill }] — a/b là entry đầy đủ.
 */
export function buildConfusablePairs(cards, { limit = 60 } = {}) {
  const entries = cards.map(toEntry).filter(entry => entry.hanzi && entry.meaning && entry.pinyin);
  const byHanzi = new Map();
  entries.forEach(entry => { if (!byHanzi.has(entry.hanzi)) byHanzi.set(entry.hanzi, entry); });

  const pairs = new Map();
  const addPair = (a, b, reason) => {
    if (!a || !b || a.hanzi === b.hanzi) return;
    const key = pairKey(a.hanzi, b.hanzi);
    const existing = pairs.get(key);
    // Giữ lý do MẠNH nhất khi một cặp trúng nhiều tín hiệu.
    if (existing && existing.reason.rank >= reason.rank) return;
    // Sắp a/b theo hanzi để thứ tự hiển thị ổn định giữa các lần dựng.
    const [first, second] = a.hanzi <= b.hanzi ? [a, b] : [b, a];
    pairs.set(key, { key, a: first, b: second, reason });
  };

  // Nguồn 1: cặp curated từ enrichment. Chỉ nhận khi từ đối chiếu cũng nằm trong
  // pool đang lọc (cần đủ nghĩa/pinyin để render bảng so sánh).
  entries.forEach(entry => {
    entry.confusables.forEach(other => {
      const match = byHanzi.get(String(other).trim());
      if (match) addPair(entry, match, REASONS.curated);
    });
  });

  // Nguồn 2: tự suy. Chỉ so trong cùng nhóm để khỏi quét O(n²) toàn kho:
  // nhóm theo từng chữ Hán (chung mặt chữ), theo pinyin trần (gần âm), theo từ
  // khoá nghĩa (gần nghĩa).
  const byChar = new Map();
  const byPlain = new Map();
  const byKeyword = new Map();
  const push = (map, key, entry) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  };
  entries.forEach(entry => {
    [...entry.hanzi].forEach(char => push(byChar, char, entry));
    push(byPlain, entry.plain, entry);
    entry.keywords.forEach(word => push(byKeyword, word, entry));
  });

  byChar.forEach(group => {
    if (group.length < 2 || group.length > 12) return;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (sharesCharacter(group[i].hanzi, group[j].hanzi)) {
          addPair(group[i], group[j], REASONS.shape);
        }
      }
    }
  });

  byPlain.forEach(group => {
    if (group.length < 2 || group.length > 12) return;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        addPair(group[i], group[j], REASONS.sound);
      }
    }
  });

  // Gần âm khác 1 ký tự: so trong nhóm cùng độ dài pinyin, chặn nhóm quá lớn.
  const byLength = new Map();
  entries.forEach(entry => push(byLength, entry.plain.length, entry));
  byLength.forEach(group => {
    if (group.length < 2 || group.length > 400) return;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (soundsAlike(group[i].plain, group[j].plain)) {
          addPair(group[i], group[j], REASONS.sound);
        }
      }
    }
  });

  byKeyword.forEach(group => {
    if (group.length < 2 || group.length > 6) return;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        // Nghĩa gần nhau chỉ đáng học khi cùng từ loại — "học"(v) vs "học sinh"(n)
        // không phải chuyện chọn sai từ.
        if (group[i].pos && group[i].pos === group[j].pos) {
          addPair(group[i], group[j], REASONS.meaning);
        }
      }
    }
  });

  // Cặp có câu ví dụ khoét lỗ được thì mới drill được → xếp trước.
  const list = [...pairs.values()].map(pair => {
    const promptA = pickPrompt(pair.a, pair.b);
    const promptB = pickPrompt(pair.b, pair.a);
    return { ...pair, promptA, promptB, hasDrill: Boolean(promptA || promptB) };
  });

  list.sort((left, right) => {
    if (left.hasDrill !== right.hasDrill) return left.hasDrill ? -1 : 1;
    if (left.reason.rank !== right.reason.rank) return right.reason.rank - left.reason.rank;
    const levelLeft = Math.min(left.a.level, left.b.level);
    const levelRight = Math.min(right.a.level, right.b.level);
    if (levelLeft !== levelRight) return levelLeft - levelRight;
    return left.key.localeCompare(right.key);
  });

  return list.slice(0, limit);
}

/**
 * Dựng câu hỏi "điền từ đúng vào chỗ trống" cho một cặp. Mỗi câu khoét từ đích
 * khỏi câu ví dụ THẬT của nó, 2 lựa chọn = 2 từ trong cặp.
 */
export function buildPairDrill(pair) {
  const rows = [];
  const add = (target, other, prompt) => {
    if (!prompt) return;
    rows.push({
      id: `${pair.key}-${target.hanzi}-${rows.length}`,
      sentence: prompt.cn.split(target.hanzi).join('____'),
      sentenceVi: prompt.vi,
      answer: target.hanzi,
      options: [target.hanzi, other.hanzi].sort(),
      explain: `${target.hanzi} (${target.pinyin}) = ${target.meaning}. Còn ${other.hanzi} (${other.pinyin}) = ${other.meaning}.`,
    });
  };
  add(pair.a, pair.b, pair.promptA);
  add(pair.b, pair.a, pair.promptB);
  // Thêm câu từ các ví dụ còn lại (nếu có) để drill không chỉ 2 câu.
  pair.a.examples.slice(1).forEach(row => {
    if (row.cn.includes(pair.a.hanzi) && !row.cn.includes(pair.b.hanzi)) add(pair.a, pair.b, row);
  });
  pair.b.examples.slice(1).forEach(row => {
    if (row.cn.includes(pair.b.hanzi) && !row.cn.includes(pair.a.hanzi)) add(pair.b, pair.a, row);
  });
  return rows.slice(0, 6);
}
