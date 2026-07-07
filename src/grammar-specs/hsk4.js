// ============================================================
// GRAMMAR SPECS — HSK 4
// Mỗi cấu trúc là 1 spec: metadata + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, {NAME.field}) và 4 loại template.
// HSK 4 ở đây là các bổ ngữ mức độ dễ nhầm — nhiều template + filler curated
// (mỗi tổ hợp hợp nghĩa, đúng sắc thái). Chữ Hán luôn sạch, đúng.
// ============================================================

export const hsk4 = [
  // ─── 1. Bổ ngữ mức độ 得不得了 ───────────────────────
  {
    id: 'de-bu-de-liao', title: 'Bổ ngữ mức độ 得不得了', level: 4,
    desc: 'Tính từ/động từ + 得不得了 diễn tả mức độ cực cao ("…vô cùng, …hết sức")',
    category: 'complement', partOfSpeech: 'Bổ ngữ mức độ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 4, bổ ngữ mức độ 得不得了' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "extremely" with "de bu de liao"' },
    ],
    point: {
      structure: '形容词/心理动词 + 得不得了',
      explain: '得不得了 (de bùdéliǎo) đặt SAU tính từ hoặc động từ tâm lý để diễn tả mức độ cực cao: "…vô cùng, …hết sức". 得 ở đây là trợ từ bổ ngữ, KHÔNG viết thành 的. Khác với 很/非常/特别 (đứng TRƯỚC tính từ), 得不得了 luôn đứng SAU.',
      examples: [
        { cn: '今天热得不得了。', pinyin: 'Jīntiān rè de bùdéliǎo.', vi: 'Hôm nay nóng kinh khủng.' },
        { cn: '他高兴得不得了。', pinyin: 'Tā gāoxìng de bùdéliǎo.', vi: 'Anh ấy vui không tả xiết.' },
        { cn: '我的头疼得不得了。', pinyin: 'Wǒ de tóu téng de bùdéliǎo.', vi: 'Đầu tôi đau kinh khủng.' },
      ],
      note: 'Dùng 得 (bổ ngữ) chứ không phải 的. 很/非常 đứng trước tính từ; 得不得了 đứng sau.',
    },
    slots: {
      // Tính từ/động từ tâm lý hợp với mức độ cực cao. Mỗi từ đều dùng tự nhiên
      // với 得不得了 (nóng/mệt/đói/vui/lo… đều có thể "vô cùng").
      ADJ: [
        { cn: '热', vi: 'nóng' }, { cn: '高兴', vi: 'vui' }, { cn: '累', vi: 'mệt' },
        { cn: '疼', vi: 'đau' }, { cn: '饿', vi: 'đói' }, { cn: '冷', vi: 'lạnh' },
        { cn: '忙', vi: 'bận' }, { cn: '紧张', vi: 'căng thẳng' }, { cn: '难受', vi: 'khó chịu' },
        { cn: '着急', vi: 'sốt ruột' }, { cn: '激动', vi: 'kích động' }, { cn: '担心', vi: 'lo lắng' },
        { cn: '害怕', vi: 'sợ hãi' }, { cn: '生气', vi: 'tức giận' }, { cn: '渴', vi: 'khát' },
        { cn: '困', vi: 'buồn ngủ' }, { cn: '开心', vi: 'vui vẻ' }, { cn: '伤心', vi: 'đau lòng' },
      ],
      // Chủ ngữ người, để đa dạng ngữ cảnh câu.
      SUBJ: [
        { cn: '我', vi: 'tôi' }, { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' },
        { cn: '孩子', vi: 'đứa trẻ' }, { cn: '妈妈', vi: 'mẹ' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{ADJ}___。({SUBJ_vi} {ADJ_vi} vô cùng)', answer: '得不得了', distractors: ['很', '非常', '太'], explain: '得不得了 đặt SAU tính từ để chỉ mức độ cực cao; 很/非常 đứng TRƯỚC.' },
      { type: 'fill_blank', frame: '他{ADJ}___。(anh ấy {ADJ_vi} vô cùng)', answer: '得不得了', distractors: ['非常', '特别', '十分'], explain: '很/非常/特别/十分 đều đứng trước tính từ; ở SAU tính từ phải dùng 得不得了.' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nói "{ADJ_vi} vô cùng"', correct: '{ADJ}得不得了', distractors: ['很{ADJ}得不得了', '{ADJ}不得了', '得不得了{ADJ}'], explain: 'Cấu trúc: Tính từ + 得不得了. Không thêm 很 phía trước, không đảo vị trí, không bỏ 得.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu "{SUBJ_vi} {ADJ_vi} vô cùng"', correct: '{SUBJ}{ADJ}得不得了', distractors: ['{SUBJ}很{ADJ}得', '{SUBJ}得不得了{ADJ}', '{SUBJ}{ADJ}的不得了'], explain: '{SUBJ}{ADJ}得不得了: chủ ngữ + tính từ + 得不得了, dùng 得.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{ADJ_vi}" ở mức cực cao)?', correct: '我{ADJ}得不得了。', errors: ['我{ADJ}的不得了。', '我不得了{ADJ}。', '我很{ADJ}不得了。'], explain: '得不得了 dùng 得 (không phải 的) và đứng SAU tính từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} {ADJ_vi} vô cùng")?', correct: '{SUBJ}{ADJ}得不得了。', errors: ['{SUBJ}{ADJ}得不得了得。', '{SUBJ}不得了{ADJ}了。', '{SUBJ}的{ADJ}不得了。'], explain: '得不得了 đứng ngay sau tính từ, không lặp 得, không tách.' },
      { type: 'sentence_order', tokens: ['天气', '热', '得', '不得了'], explain: 'Trật tự: chủ ngữ + tính từ + 得 + 不得了.' },
      { type: 'sentence_order', tokens: ['他', '高兴', '得', '不得了'], explain: 'Tính từ + 得不得了 chỉ mức độ cực cao.' },
      { type: 'sentence_order', tokens: ['孩子', '饿', '得', '不得了'], explain: 'Chủ ngữ + tính từ + 得 + 不得了.' },
      { type: 'grammar_judge', prompt: 'Cách diễn tả "mệt vô cùng" nào ĐÚNG?', correct: '累得不得了', errors: ['不得了累', '得累不得了', '累不得得了'], explain: '累得不得了 = mệt vô cùng; 得不得了 đứng sau tính từ.' },
    ],
  },

  // ─── 2. Bổ ngữ mức độ 得很 ───────────────────────────
  {
    id: 'de-hen-degree', title: 'Bổ ngữ mức độ 得很', level: 4,
    desc: 'Tính từ/động từ + 得很 diễn tả mức độ cao ("…lắm"), sắc thái khẩu ngữ',
    category: 'complement', partOfSpeech: 'Bổ ngữ mức độ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 4, bổ ngữ mức độ 得很' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "very" with "de hen"' },
    ],
    point: {
      structure: '形容词/心理动词 + 得很',
      explain: '得很 (de hěn) đặt SAU tính từ hoặc động từ tâm lý, nghĩa "…lắm, rất…", mang sắc thái khẩu ngữ. So sánh: 很 đứng TRƯỚC (很忙), còn 得很 đứng SAU (忙得很) — cùng nghĩa "rất" nhưng vị trí ngược nhau. 得 KHÔNG viết thành 的.',
      examples: [
        { cn: '这里的东西便宜得很。', pinyin: 'Zhèlǐ de dōngxi piányi de hěn.', vi: 'Đồ ở đây rẻ lắm.' },
        { cn: '他最近忙得很。', pinyin: 'Tā zuìjìn máng de hěn.', vi: 'Dạo này anh ấy bận lắm.' },
        { cn: '这个问题难得很。', pinyin: 'Zhège wèntí nán de hěn.', vi: 'Câu hỏi này khó lắm.' },
      ],
      note: '很 đứng trước tính từ (很忙); 得很 đứng sau (忙得很). Dùng 得 chứ không phải 的.',
    },
    slots: {
      // Tính từ chỉ tính chất, hợp với mức độ "…lắm".
      ADJ: [
        { cn: '好', vi: 'tốt' }, { cn: '难', vi: 'khó' }, { cn: '便宜', vi: 'rẻ' }, { cn: '贵', vi: 'đắt' },
        { cn: '大', vi: 'to' }, { cn: '小', vi: 'nhỏ' }, { cn: '漂亮', vi: 'đẹp' }, { cn: '重', vi: 'nặng' },
        { cn: '新', vi: 'mới' }, { cn: '干净', vi: 'sạch' }, { cn: '远', vi: 'xa' }, { cn: '近', vi: 'gần' },
        { cn: '快', vi: 'nhanh' }, { cn: '慢', vi: 'chậm' }, { cn: '甜', vi: 'ngọt' }, { cn: '咸', vi: 'mặn' },
        { cn: '舒服', vi: 'thoải mái' }, { cn: '方便', vi: 'tiện lợi' },
      ],
      // Động từ tâm lý / trạng thái, hợp với 得很.
      PADJ: [
        { cn: '忙', vi: 'bận' }, { cn: '累', vi: 'mệt' }, { cn: '高兴', vi: 'vui' },
        { cn: '紧张', vi: 'căng thẳng' }, { cn: '着急', vi: 'sốt ruột' }, { cn: '难过', vi: 'buồn' },
        { cn: '开心', vi: 'vui vẻ' }, { cn: '满意', vi: 'hài lòng' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '这个东西{ADJ}___。(cái này {ADJ_vi} lắm)', answer: '得很', distractors: ['很', '非常', '太'], explain: '得很 đứng SAU tính từ, nghĩa "…lắm"; 很/非常 đứng TRƯỚC.' },
      { type: 'fill_blank', frame: '他最近{PADJ}___。(dạo này anh ấy {PADJ_vi} lắm)', answer: '得很', distractors: ['很', '非常', '太'], explain: 'Động từ tâm lý + 得很 = "…lắm". Đứng sau, không đứng trước.' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nói "{ADJ_vi} lắm"', correct: '{ADJ}得很', distractors: ['很{ADJ}得', '{ADJ}很得', '得很{ADJ}'], explain: '…得很: tính từ + 得 + 很, đứng sau tính từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu "Cái này {ADJ_vi} lắm"', correct: '这个东西{ADJ}得很', distractors: ['这个东西很{ADJ}得', '这个东西{ADJ}的很', '这个东西得很{ADJ}'], explain: '这个东西 + tính từ + 得很; dùng 得, đứng sau.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{ADJ_vi} lắm")?', correct: '这个东西{ADJ}得很。', errors: ['这个东西{ADJ}的很。', '这个东西得很{ADJ}。', '这个东西很得{ADJ}。'], explain: 'Dùng 得 (không phải 的); 得很 đứng sau tính từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (trạng thái "{PADJ_vi} lắm")?', correct: '他{PADJ}得很。', errors: ['他{PADJ}的很。', '他得很{PADJ}。', '他很得{PADJ}。'], explain: '得很 đứng sau, dùng 得 chứ không phải 的.' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nói ĐÚNG dạng bổ ngữ 得很 nghĩa "bận lắm"', correct: '忙得很', distractors: ['忙很', '得很忙', '很得忙'], explain: '忙得很 dùng 得很 đứng sau (很忙 cũng đúng nhưng ở dạng khác).' },
      { type: 'sentence_order', tokens: ['这个', '东西', '便宜', '得', '很'], explain: 'Chủ ngữ + tính từ + 得 + 很.' },
      { type: 'sentence_order', tokens: ['他', '忙', '得', '很'], explain: 'Tính từ + 得很 = "…lắm".' },
      { type: 'sentence_order', tokens: ['这个', '问题', '难', '得', '很'], explain: 'Chủ ngữ + tính từ + 得 + 很.' },
    ],
  },
];
