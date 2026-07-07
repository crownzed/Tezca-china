// ============================================================
// CHINESE-TEXT — Thành phần hiển thị chữ Hán dùng chung
//   - ClickableChineseText: chữ Hán tap-để-tra (pinyin + nghĩa)
//   - TonedPinyin: pinyin tô màu theo thanh điệu
// Trích từ App.jsx để dùng lại ở GrammarLab và các nơi khác.
// ============================================================
import { useState } from 'react';
import { loadAllFlashcards } from '../vocab-loader.js';

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// Từ điển cấp module: nạp một lần, tra nhanh chữ → thẻ (pinyin/nghĩa).
const globalDictionary = new Map();
loadAllFlashcards().then(cards => {
  cards.forEach(c => {
    if (c.character && !globalDictionary.has(c.character)) {
      globalDictionary.set(c.character, c);
    }
  });
});

export function ClickableChineseText({ text, className = '' }) {
  const [activeIdx, setActiveIdx] = useState(null);

  if (!text) return null;

  return (
    <span className={`clickable-text ${className}`}>
      {text.split('').map((char, index) => {
        const card = globalDictionary.get(char);
        const hasDict = Boolean(card);
        return (
          <span
            key={index}
            className={`tap-char ${hasDict ? 'has-dict' : ''} ${activeIdx === index ? 'active' : ''}`}
            onClick={() => hasDict && setActiveIdx(prev => prev === index ? null : index)}
          >
            {char}
            {activeIdx === index && hasDict && (
              <span className="tap-tooltip" onClick={(e) => e.stopPropagation()}>
                <strong>{card.character}</strong>
                <em>{card.pinyin}</em>
                <small>{card.meaning}</small>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Tô màu thanh điệu theo dấu pinyin (doc 3.1: thanh điệu là khoá ghi nhớ).
// Phát hiện thanh qua dấu phụ trên nguyên âm, không cần số thanh.
const TONE_MARKS = {
  1: 'āēīōūǖĀĒĪŌŪǕ',
  2: 'áéíóúǘÁÉÍÓÚǗ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓǙ',
  4: 'àèìòùǜÀÈÌÒÙǛ',
};

function toneOfSyllable(syllable) {
  for (const ch of syllable) {
    for (const tone of [1, 2, 3, 4]) {
      if (TONE_MARKS[tone].includes(ch)) return tone;
    }
  }
  // Fallback: số thanh cuối âm tiết (vd "xue2") khi không có dấu phụ.
  const trailing = syllable.match(/[1-5](?!.*[1-5])/);
  if (trailing) return Number(trailing[0]);
  return 5; // không dấu → thanh nhẹ
}

// Nguyên âm có dấu thanh + nguyên âm trơn, dùng để dò ranh giới âm tiết.
const PINYIN_VOWELS = 'aeiouüvāēīōūǖáéíóúǘǎěǐǒǔǚàèìòùǜ';
const isPinyinVowel = (ch) => PINYIN_VOWELS.includes(ch.toLowerCase());

// Tách một token pinyin dính liền (vd "jīntiān") thành từng âm tiết.
// Âm tiết mới bắt đầu khi gặp phụ âm onset sau khi đã thấy nguyên âm,
// trừ các coda hợp lệ: n (khi không đứng trước nguyên âm), ng, r (erhua).
function splitPinyinToken(token) {
  const text = token.toLowerCase();
  const out = [];
  let cur = '';
  let sawVowel = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (isPinyinVowel(c)) {
      cur += c;
      sawVowel = true;
    } else if (!sawVowel) {
      cur += c; // phụ âm đầu (gồm cụm zh/ch/sh)
    } else if (c === 'n' && !(next && isPinyinVowel(next))) {
      cur += c; // n coda
    } else if (c === 'g' && cur.endsWith('n')) {
      cur += c; // ng coda
    } else if (c === 'r' && !(next && isPinyinVowel(next))) {
      cur += c; // r coda / erhua
    } else {
      if (cur) out.push(cur);
      cur = c;
      sawVowel = false;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function tonedPinyin(pinyin) {
  const text = cleanText(pinyin);
  if (!text) return [];
  // Tách theo khoảng trắng trước, rồi tách tiếp mỗi token dính liền.
  const syllables = text.split(/\s+/).flatMap(splitPinyinToken);
  return syllables.map((syllable, idx) => ({
    key: `${syllable}-${idx}`,
    text: syllable,
    tone: toneOfSyllable(syllable),
  }));
}

export function TonedPinyin({ pinyin, className = '' }) {
  const syllables = tonedPinyin(pinyin);
  if (!syllables.length) return null;
  return (
    <span className={`toned-pinyin ${className}`} aria-label={pinyin}>
      {syllables.map(part => (
        <span key={part.key} className={`tone-${part.tone}`}>{part.text}</span>
      ))}
    </span>
  );
}
