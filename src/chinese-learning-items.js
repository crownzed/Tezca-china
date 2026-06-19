const TONE_MARKS = {
  ā: '1', á: '2', ǎ: '3', à: '4',
  ē: '1', é: '2', ě: '3', è: '4',
  ī: '1', í: '2', ǐ: '3', ì: '4',
  ō: '1', ó: '2', ǒ: '3', ò: '4',
  ū: '1', ú: '2', ǔ: '3', ù: '4',
  ǖ: '1', ǘ: '2', ǚ: '3', ǜ: '4',
};

const CONFUSABLES = {
  买: ['卖'], 卖: ['买'], 四: ['十'], 十: ['四'], 在: ['再'], 再: ['在'],
  他: ['她', '它'], 她: ['他', '它'], 哪: ['那'], 那: ['哪'], 坐: ['座'], 座: ['坐'],
};

export function tonePatternFromPinyin(pinyin = '') {
  const digits = String(pinyin).match(/[1-5]/g);
  if (digits?.length) return digits.join('-');
  const tones = [...String(pinyin)].map(char => TONE_MARKS[char]).filter(Boolean);
  return tones.length ? tones.join('-') : 'neutral';
}

function removeToneDigits(pinyin = '') {
  return String(pinyin).toLowerCase().replace(/[1-5]/g, '').replace(/\s+/g, '');
}

function focusMetadata(word) {
  const hanzi = word.hanzi || '';
  const family = word.character_family || hanzi[0] || '';
  const confusable = word.confusable_words?.length
    ? word.confusable_words
    : [...hanzi].flatMap(char => CONFUSABLES[char] || []);
  return {
    word_id: word.word_id || null,
    hanzi,
    pinyin: word.pinyin || '',
    meaning_vi: word.meaning_vi || 'từ trọng tâm',
    tone_pattern: word.tone_pattern || tonePatternFromPinyin(word.pinyin),
    character_family: family,
    component_hint: word.component_hint || (family ? `Nhìn thành phần ${family}, rồi nối với âm và nghĩa.` : 'Nối chữ, âm, nghĩa và ví dụ trong một lượt.'),
    collocations: word.collocations?.length ? word.collocations : [`“${hanzi}”的意思`, `用“${hanzi}”造句`, `复习“${hanzi}”`],
    confusable_words: [...new Set(confusable)].slice(0, 3),
    topic: word.topic || 'core',
    frequency_band: word.frequency_band || `hsk${word.level || 1}`,
  };
}

export function assessPinyinInput(input, expected) {
  const typed = String(input || '').trim().toLowerCase();
  const target = String(expected || '').trim().toLowerCase();
  if (!typed || !target) return { correct: false, errorTag: 'production_error', message: 'Nhập pinyin để kiểm tra.' };
  if (typed === target) return { correct: true, errorTag: '', message: 'Pinyin đúng, gồm cả tone.' };
  if (removeToneDigits(typed) === removeToneDigits(target)) {
    return { correct: false, errorTag: 'tone_error', message: 'Âm đúng nhưng tone chưa đúng.' };
  }
  return { correct: false, errorTag: 'sound_error', message: 'Âm hoặc thứ tự syllable chưa đúng.' };
}

export function buildChineseLearningItems(plan) {
  const words = (plan?.focusWords || []).filter(item => item.hanzi).slice(0, plan?.mode?.id === 'micro' ? 1 : 3).map(focusMetadata);
  if (!words.length) return [];
  const items = [];
  const primary = words[0];

  items.push({ id: `character-${primary.hanzi}`, type: 'character_card', word: primary });
  if (primary.tone_pattern && primary.tone_pattern !== 'neutral') {
    items.push({ id: `tone-${primary.hanzi}`, type: 'tone_drill', word: primary });
  }
  if (primary.confusable_words.length) {
    items.push({ id: `confusion-${primary.hanzi}`, type: 'confusion_card', word: primary });
  }
  items.push({ id: `pinyin-${primary.hanzi}`, type: 'pinyin_typing', word: primary });

  if (plan?.mode?.id !== 'micro' && words.length >= 2) {
    items.push({
      id: `micro-reading-${words.map(word => word.hanzi).join('-')}`,
      type: 'micro_reading',
      words,
      sentence_cn: `今天我用“${words[0].hanzi}”和“${words[1].hanzi}”造一个短句，然后再复习一遍。`,
      sentence_vi: `Hôm nay tôi dùng “${words[0].hanzi}” và “${words[1].hanzi}” để đặt một câu ngắn, rồi ôn lại một lần nữa.`,
    });
  }

  if (plan?.mode?.id !== 'micro') {
    items.push({
      id: `guided-output-${primary.hanzi}`,
      type: 'guided_output',
      word: primary,
      prompt: `Đặt một câu tiếng Trung ngắn có dùng “${primary.hanzi}”.`,
    });
  }

  return items;
}
