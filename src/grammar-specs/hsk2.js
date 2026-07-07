// ============================================================
// GRAMMAR SPECS — HSK 2
// Mỗi cấu trúc là 1 spec: metadata + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, {NAME.field}) và 4 loại template.
// Nguyên tắc: filler curated theo ngữ cảnh để câu luôn hợp nghĩa + đúng cấp.
// Toàn bộ từ vựng ≤ HSK 2.
// ============================================================

export const hsk2 = [
  // ─── 1. Trợ từ 了 (hoàn thành / thay đổi) ─────────────
  {
    id: 'le-completed', title: 'Trợ từ 了 (hoàn thành / thay đổi)', level: 2,
    desc: '了 chỉ hành động đã hoàn thành hoặc sự thay đổi trạng thái',
    category: 'particle', partOfSpeech: 'Trợ từ động thái',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, trợ từ 了' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing completion with "le"' },
    ],
    point: {
      structure: 'Động từ + 了 (hành động hoàn thành)  ·  Câu + 了 (thay đổi trạng thái)',
      explain: '了 (le) đặt sau động từ để chỉ hành động đã hoàn thành (我吃了饭), hoặc đặt cuối câu để chỉ sự thay đổi/xuất hiện tình huống mới (下雨了). Phủ định "chưa làm" dùng 没 và BỎ 了 (我没吃饭).',
      examples: [
        { cn: '我吃了饭。', pinyin: 'Wǒ chī le fàn.', vi: 'Tôi ăn cơm rồi.' },
        { cn: '他买了一本书。', pinyin: 'Tā mǎi le yì běn shū.', vi: 'Anh ấy đã mua một quyển sách.' },
        { cn: '下雨了。', pinyin: 'Xià yǔ le.', vi: 'Trời mưa rồi.' },
      ],
      note: 'Phủ định quá khứ dùng 没 và không dùng 了: 我没吃饭 (KHÔNG nói 我没吃了饭).',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      ACT: [
        { v: '吃', o: '饭', vVi: 'ăn', oVi: 'cơm' },
        { v: '买', o: '书', vVi: 'mua', oVi: 'sách' },
        { v: '看', o: '电影', vVi: 'xem', oVi: 'phim' },
        { v: '喝', o: '茶', vVi: 'uống', oVi: 'trà' },
        { v: '学', o: '汉语', vVi: 'học', oVi: 'tiếng Hán' },
        { v: '做', o: '饭', vVi: 'nấu', oVi: 'cơm' },
        { v: '买', o: '衣服', vVi: 'mua', oVi: 'áo' },
        { v: '喝', o: '咖啡', vVi: 'uống', oVi: 'cà phê' },
      ],
      CHANGE: [
        { cn: '下雨', vi: 'Trời mưa' }, { cn: '天黑', vi: 'Trời tối' },
        { cn: '他饿', vi: 'Anh ấy đói' }, { cn: '我累', vi: 'Tôi mệt' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{ACT.v}___{ACT.o}。({SUBJ_vi} đã {ACT.vVi} {ACT.oVi} rồi)', answer: '了', distractors: ['的', '吗', '呢'], explain: '了 sau động từ chỉ hành động đã hoàn thành.' },
      { type: 'fill_blank', frame: '{CHANGE}___。({CHANGE_vi} rồi — thay đổi trạng thái)', answer: '了', distractors: ['的', '吗', '呢'], explain: '了 cuối câu chỉ tình huống mới xuất hiện.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} đã {ACT.vVi} {ACT.oVi}"', correct: '{SUBJ}{ACT.v}了{ACT.o}', distractors: ['{SUBJ}{ACT.v}{ACT.o}了吗', '{SUBJ}了{ACT.v}{ACT.o}', '{SUBJ}{ACT.v}的{ACT.o}'], explain: '了 đặt ngay sau động từ: 动词 + 了 + tân ngữ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} đã {ACT.vVi} {ACT.oVi}")?', correct: '{SUBJ}{ACT.v}了{ACT.o}。', errors: ['{SUBJ}了{ACT.v}{ACT.o}。', '{SUBJ}{ACT.v}{ACT.o}的。', '了{SUBJ}{ACT.v}{ACT.o}。'], explain: '了 nằm sau động từ, không đứng đầu câu hay thay 的.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG khi phủ định ("{SUBJ_vi} chưa {ACT.vVi} {ACT.oVi}")?', correct: '{SUBJ}没{ACT.v}{ACT.o}。', errors: ['{SUBJ}没{ACT.v}了{ACT.o}。', '{SUBJ}不{ACT.v}了{ACT.o}。', '{SUBJ}没{ACT.v}{ACT.o}了。'], explain: 'Phủ định dùng 没 và BỎ 了.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{ACT.v}', '了', '{ACT.o}'], explain: 'Trật tự: Chủ ngữ + động từ + 了 + tân ngữ.' },
    ],
  },

  // ─── 2. Bổ ngữ trình độ 得 ───────────────────────────
  {
    id: 'de-degree', title: 'Bổ ngữ trình độ 得', level: 2,
    desc: '得 nối động từ với bổ ngữ chỉ mức độ/kết quả (làm tốt đến đâu)',
    category: 'complement', partOfSpeech: 'Bổ ngữ trình độ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, bổ ngữ trình độ 得' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Degree complement with "de"' },
    ],
    point: {
      structure: 'Động từ + 得 + (很) + tính từ',
      explain: '得 (de) nối động từ với bổ ngữ trình độ, mô tả hành động được làm tốt/nhanh/… đến mức nào. Bổ ngữ thường có 很 đứng trước (他跑得很快). Phủ định: 得 + 不 + tính từ (跑得不快).',
      examples: [
        { cn: '他跑得很快。', pinyin: 'Tā pǎo de hěn kuài.', vi: 'Anh ấy chạy rất nhanh.' },
        { cn: '她说得很好。', pinyin: 'Tā shuō de hěn hǎo.', vi: 'Cô ấy nói rất hay.' },
        { cn: '我起得很早。', pinyin: 'Wǒ qǐ de hěn zǎo.', vi: 'Tôi dậy rất sớm.' },
      ],
      note: '得 (bổ ngữ) khác 的 (sở hữu) và 地 (trạng ngữ) — đọc đều là "de".',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' },
      ],
      ACT: [
        { v: '跑', adj: '快', vVi: 'chạy', adjVi: 'nhanh' },
        { v: '说', adj: '好', vVi: 'nói', adjVi: 'hay' },
        { v: '走', adj: '慢', vVi: 'đi', adjVi: 'chậm' },
        { v: '起', adj: '早', vVi: 'dậy', adjVi: 'sớm' },
        { v: '睡', adj: '晚', vVi: 'ngủ', adjVi: 'muộn' },
        { v: '吃', adj: '快', vVi: 'ăn', adjVi: 'nhanh' },
        { v: '写', adj: '好', vVi: 'viết', adjVi: 'đẹp' },
        { v: '来', adj: '早', vVi: 'đến', adjVi: 'sớm' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{ACT.v}___很{ACT.adj}。({SUBJ_vi} {ACT.vVi} rất {ACT.adjVi})', answer: '得', distractors: ['的', '地', '了'], explain: 'Bổ ngữ trình độ nối bằng 得, không phải 的/地.' },
      { type: 'fill_blank', frame: '{SUBJ}{ACT.v}得___{ACT.adj}。({SUBJ_vi} {ACT.vVi} không {ACT.adjVi})', answer: '不', distractors: ['没', '很', '太'], explain: 'Phủ định bổ ngữ: 得 + 不 + tính từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} {ACT.vVi} rất {ACT.adjVi}"', correct: '{SUBJ}{ACT.v}得很{ACT.adj}', distractors: ['{SUBJ}{ACT.v}的很{ACT.adj}', '{SUBJ}很{ACT.v}{ACT.adj}', '{SUBJ}{ACT.v}很{ACT.adj}得'], explain: 'Động từ + 得 + 很 + tính từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} {ACT.vVi} rất {ACT.adjVi}")?', correct: '{SUBJ}{ACT.v}得很{ACT.adj}。', errors: ['{SUBJ}{ACT.v}很{ACT.adj}。', '{SUBJ}很{ACT.adj}{ACT.v}。', '{SUBJ}得{ACT.v}很{ACT.adj}。'], explain: 'Thiếu 得 hoặc đặt sai chỗ đều sai.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{ACT.v}', '得', '很', '{ACT.adj}'], explain: 'Trật tự: Chủ ngữ + động từ + 得 + 很 + tính từ.' },
    ],
  },

  // ─── 3. So sánh với 比 ───────────────────────────────
  {
    id: 'bi-comparison', title: 'So sánh với 比', level: 2,
    desc: 'Cấu trúc A 比 B + tính từ để so sánh hơn kém',
    category: 'sentence-pattern', partOfSpeech: 'So sánh',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, câu so sánh với 比' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Comparing with "bi"' },
    ],
    point: {
      structure: 'A + 比 + B + tính từ',
      explain: '比 (bǐ) so sánh A với B: A 比 B + tính từ (我比他高 = tôi cao hơn anh ấy). KHÔNG dùng 很/太 trước tính từ trong câu 比. Phủ định "không bằng" dùng A 没有 B + tính từ.',
      examples: [
        { cn: '我比他高。', pinyin: 'Wǒ bǐ tā gāo.', vi: 'Tôi cao hơn anh ấy.' },
        { cn: '今天比昨天热。', pinyin: 'Jīntiān bǐ zuótiān rè.', vi: 'Hôm nay nóng hơn hôm qua.' },
        { cn: '这个比那个贵。', pinyin: 'Zhège bǐ nàge guì.', vi: 'Cái này đắt hơn cái kia.' },
      ],
      note: 'Trong câu 比 KHÔNG dùng 很/太: sai 我比他很高.',
    },
    slots: {
      CMP: [
        { a: '我', b: '他', adj: '高', aVi: 'Tôi', bVi: 'anh ấy', adjVi: 'cao' },
        { a: '今天', b: '昨天', adj: '热', aVi: 'Hôm nay', bVi: 'hôm qua', adjVi: 'nóng' },
        { a: '这个', b: '那个', adj: '贵', aVi: 'Cái này', bVi: 'cái kia', adjVi: 'đắt' },
        { a: '哥哥', b: '弟弟', adj: '高', aVi: 'Anh trai', bVi: 'em trai', adjVi: 'cao' },
        { a: '他', b: '我', adj: '忙', aVi: 'Anh ấy', bVi: 'tôi', adjVi: 'bận' },
        { a: '姐姐', b: '妹妹', adj: '大', aVi: 'Chị gái', bVi: 'em gái', adjVi: 'lớn tuổi' },
        { a: '这个菜', b: '那个菜', adj: '好吃', aVi: 'Món này', bVi: 'món kia', adjVi: 'ngon' },
        { a: '今天', b: '昨天', adj: '冷', aVi: 'Hôm nay', bVi: 'hôm qua', adjVi: 'lạnh' },
        { a: '我', b: '你', adj: '累', aVi: 'Tôi', bVi: 'bạn', adjVi: 'mệt' },
        { a: '这本书', b: '那本书', adj: '贵', aVi: 'Quyển sách này', bVi: 'quyển kia', adjVi: 'đắt' },
        { a: '他', b: '她', adj: '忙', aVi: 'Anh ấy', bVi: 'cô ấy', adjVi: 'bận' },
        { a: '这里', b: '那里', adj: '冷', aVi: 'Ở đây', bVi: 'ở kia', adjVi: 'lạnh' },
        { a: '妹妹', b: '哥哥', adj: '高', aVi: 'Em gái', bVi: 'anh trai', adjVi: 'cao' },
        { a: '这个', b: '那个', adj: '好', aVi: 'Cái này', bVi: 'cái kia', adjVi: 'tốt' },
        { a: '今天', b: '昨天', adj: '忙', aVi: 'Hôm nay', bVi: 'hôm qua', adjVi: 'bận' },
        { a: '弟弟', b: '哥哥', adj: '高', aVi: 'Em trai', bVi: 'anh trai', adjVi: 'cao' },
        { a: '那个菜', b: '这个菜', adj: '好吃', aVi: 'Món kia', bVi: 'món này', adjVi: 'ngon' },
        { a: '你', b: '我', adj: '忙', aVi: 'Bạn', bVi: 'tôi', adjVi: 'bận' },
        { a: '这里', b: '那里', adj: '热', aVi: 'Ở đây', bVi: 'ở kia', adjVi: 'nóng' },
        { a: '那本书', b: '这本书', adj: '贵', aVi: 'Quyển sách kia', bVi: 'quyển này', adjVi: 'đắt' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{CMP.a}___{CMP.b}{CMP.adj}。({CMP.aVi} {CMP.adjVi} hơn {CMP.bVi})', answer: '比', distractors: ['和', '跟', '没'], explain: '比 dùng để so sánh hơn kém: A 比 B + tính từ.' },
      { type: 'fill_blank', frame: '{CMP.a}___{CMP.b}{CMP.adj}。({CMP.aVi} không {CMP.adjVi} bằng {CMP.bVi})', answer: '没有', distractors: ['比', '不比', '和'], explain: 'Phủ định so sánh: A 没有 B + tính từ (A không bằng B).' },
      { type: 'meaning_to_char', prompt: 'Chọn "{CMP.aVi} {CMP.adjVi} hơn {CMP.bVi}"', correct: '{CMP.a}比{CMP.b}{CMP.adj}', distractors: ['{CMP.a}比{CMP.b}很{CMP.adj}', '{CMP.b}比{CMP.a}{CMP.adj}', '{CMP.a}和{CMP.b}{CMP.adj}'], explain: 'A 比 B + tính từ; không thêm 很.' },
      { type: 'grammar_judge', prompt: 'Câu so sánh nào ĐÚNG ("{CMP.aVi} {CMP.adjVi} hơn {CMP.bVi}")?', correct: '{CMP.a}比{CMP.b}{CMP.adj}。', errors: ['{CMP.a}比{CMP.b}很{CMP.adj}。', '{CMP.a}比{CMP.b}太{CMP.adj}。', '{CMP.a}很比{CMP.b}{CMP.adj}。'], explain: 'Trong câu 比 KHÔNG dùng 很/太.' },
      { type: 'sentence_order', tokens: ['{CMP.a}', '比', '{CMP.b}', '{CMP.adj}'], explain: 'Trật tự: A + 比 + B + tính từ.' },
    ],
  },

  // ─── 4. Vị trí với 在 ────────────────────────────────
  {
    id: 'zai-location', title: 'Vị trí với 在', level: 2,
    desc: '在 chỉ vị trí (ở đâu) và địa điểm diễn ra hành động',
    category: 'preposition', partOfSpeech: 'Giới từ / Động từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, giới từ chỉ nơi chốn 在' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing location with "zai"' },
    ],
    point: {
      structure: 'Chủ ngữ + 在 + nơi chốn (đang ở đâu)  ·  Chủ ngữ + 在 + nơi chốn + động từ (làm gì ở đâu)',
      explain: '在 (zài) làm động từ chỉ vị trí (我在家 = tôi ở nhà), hoặc làm giới từ đặt TRƯỚC động từ để chỉ nơi diễn ra hành động (我在家看电视). Cụm 在 + nơi chốn phải đứng trước động từ chính.',
      examples: [
        { cn: '我在家。', pinyin: 'Wǒ zài jiā.', vi: 'Tôi ở nhà.' },
        { cn: '他在学校。', pinyin: 'Tā zài xuéxiào.', vi: 'Anh ấy ở trường.' },
        { cn: '我在家看电视。', pinyin: 'Wǒ zài jiā kàn diànshì.', vi: 'Tôi xem tivi ở nhà.' },
      ],
      note: 'Cụm 在 + nơi chốn đứng TRƯỚC động từ: 我在家看书 (KHÔNG nói 我看书在家).',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '老师', vi: 'Giáo viên' },
      ],
      PLACE: [
        { cn: '家', vi: 'nhà' }, { cn: '学校', vi: 'trường' }, { cn: '公司', vi: 'công ty' },
        { cn: '商店', vi: 'cửa hàng' }, { cn: '医院', vi: 'bệnh viện' }, { cn: '房间', vi: 'phòng' },
      ],
      ACT: [
        { cn: '看电视', vi: 'xem tivi' }, { cn: '看书', vi: 'đọc sách' }, { cn: '吃饭', vi: 'ăn cơm' },
        { cn: '睡觉', vi: 'ngủ' }, { cn: '工作', vi: 'làm việc' }, { cn: '学习', vi: 'học' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{PLACE}。({SUBJ_vi} ở {PLACE_vi})', answer: '在', distractors: ['是', '有', '去'], explain: '在 chỉ vị trí: Chủ ngữ + 在 + nơi chốn.' },
      { type: 'fill_blank', frame: '{SUBJ}___{PLACE}{ACT}。({SUBJ_vi} {ACT_vi} ở {PLACE_vi})', answer: '在', distractors: ['是', '和', '的'], explain: '在 + nơi chốn đứng trước động từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} ở {PLACE_vi}"', correct: '{SUBJ}在{PLACE}', distractors: ['{SUBJ}是{PLACE}', '{SUBJ}有{PLACE}', '{PLACE}在{SUBJ}'], explain: 'Chủ ngữ + 在 + nơi chốn.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} {ACT_vi} ở {PLACE_vi}"', correct: '{SUBJ}在{PLACE}{ACT}', distractors: ['{SUBJ}{ACT}在{PLACE}', '{SUBJ}{PLACE}在{ACT}', '在{SUBJ}{PLACE}{ACT}'], explain: '在 + nơi chốn đứng trước động từ, không đứng sau.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} {ACT_vi} ở {PLACE_vi}")?', correct: '{SUBJ}在{PLACE}{ACT}。', errors: ['{SUBJ}{ACT}在{PLACE}。', '{SUBJ}在{ACT}{PLACE}。', '在{SUBJ}{PLACE}{ACT}。'], explain: 'Trật tự đúng: Chủ ngữ + 在 + nơi chốn + động từ.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '在', '{PLACE}'], explain: 'Trật tự: Chủ ngữ + 在 + nơi chốn.' },
    ],
  },

  // ─── 5. Phó từ 还 / 就 / 才 / 再 ─────────────────────
  {
    id: 'adv-hai-jiu-cai-zai', title: 'Phó từ 还 / 就 / 才 / 再', level: 2,
    desc: '还 (vẫn), 就 (ngay/sớm), 才 (mới/muộn), 再 (lại — lặp lại ở tương lai)',
    category: 'adverb', partOfSpeech: 'Phó từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, phó từ 还 / 就 / 才 / 再' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Adverbs "hai", "jiu", "cai", "zai"' },
    ],
    point: {
      structure: '还 (vẫn/còn) · 就 (ngay, sớm hơn dự kiến) · 才 (mới, muộn hơn dự kiến) · 再 (lại, lặp lại ở tương lai)',
      explain: '还 (hái) = vẫn/còn (việc chưa kết thúc). 就 (jiù) = ngay/liền, việc xảy ra SỚM. 才 (cái) = mới, việc xảy ra MUỘN. 再 (zài) = lại, hành động lặp lại trong TƯƠNG LAI. Cả bốn đều là phó từ, đứng trước động từ.',
      examples: [
        { cn: '他还在睡觉。', pinyin: 'Tā hái zài shuìjiào.', vi: 'Anh ấy vẫn đang ngủ.' },
        { cn: '我八点就到了。', pinyin: 'Wǒ bā diǎn jiù dào le.', vi: '8 giờ tôi đã đến rồi (sớm).' },
        { cn: '他九点才来。', pinyin: 'Tā jiǔ diǎn cái lái.', vi: '9 giờ anh ấy mới đến (muộn).' },
        { cn: '明天再说吧。', pinyin: 'Míngtiān zài shuō ba.', vi: 'Mai nói tiếp nhé.' },
      ],
      note: '就 nhấn "sớm/nhanh", 才 nhấn "muộn/chậm"; 再 chỉ lặp lại ở tương lai (khác 又 — quá khứ).',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      PLACE: [
        { cn: '家', vi: 'nhà' }, { cn: '学校', vi: 'trường' }, { cn: '公司', vi: 'công ty' }, { cn: '房间', vi: 'phòng' },
      ],
      VERB: [
        { cn: '说', vi: 'nói' }, { cn: '看', vi: 'xem' }, { cn: '做', vi: 'làm' },
        { cn: '吃', vi: 'ăn' }, { cn: '写', vi: 'viết' }, { cn: '来', vi: 'đến' },
      ],
      TIME_LATE: [
        { cn: '九点', vi: '9 giờ' }, { cn: '十点', vi: '10 giờ' }, { cn: '很晚', vi: 'rất muộn' },
        { cn: '十一点', vi: '11 giờ' }, { cn: '晚上', vi: 'buổi tối' },
      ],
      TIME_EARLY: [
        { cn: '八点', vi: '8 giờ' }, { cn: '六点', vi: '6 giờ' }, { cn: '很早', vi: 'rất sớm' },
        { cn: '七点', vi: '7 giờ' }, { cn: '早上', vi: 'buổi sáng' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '现在很晚了，{SUBJ}___在{PLACE}工作。({SUBJ_vi} vẫn đang làm việc ở {PLACE_vi})', answer: '还', distractors: ['就', '才', '再'], explain: '还 = vẫn/còn: việc chưa kết thúc.' },
      { type: 'fill_blank', frame: '{SUBJ}想___{VERB}一次。({SUBJ_vi} muốn {VERB_vi} lại một lần nữa)', answer: '再', distractors: ['还', '就', '才'], explain: '再 = lại, chỉ hành động lặp lại ở tương lai.' },
      { type: 'fill_blank', frame: '{SUBJ}{TIME_LATE}___到。({SUBJ_vi} mãi {TIME_LATE_vi} mới đến — muộn)', answer: '才', distractors: ['就', '还', '再'], explain: '才 nhấn mạnh việc xảy ra MUỘN hơn mong đợi.' },
      { type: 'fill_blank', frame: '{SUBJ}{TIME_EARLY}___到了。({SUBJ_vi} {TIME_EARLY_vi} đã đến ngay — sớm)', answer: '就', distractors: ['才', '还', '再'], explain: '就 nhấn mạnh việc xảy ra SỚM/nhanh.' },
      { type: 'grammar_judge', prompt: 'Câu nào có nghĩa "đến SỚM"?', correct: '{SUBJ}{TIME_EARLY}就到了。', errors: ['{SUBJ}{TIME_EARLY}才到了。', '{SUBJ}{TIME_EARLY}再到了。', '{SUBJ}就{TIME_EARLY}到了。'], explain: '就 chỉ sớm; 才 chỉ muộn; 再 chỉ lặp lại.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '明天', '再', '来'], explain: 'Trật tự: Chủ ngữ + thời gian + 再 + động từ.' },
    ],
  },

  // ─── 6. Phó từ 已经 / 正在 ───────────────────────────
  {
    id: 'adv-yijing-zhengzai', title: 'Phó từ 已经 / 正在', level: 2,
    desc: '已经 (đã…rồi) và 正在 (đang…)',
    category: 'adverb', partOfSpeech: 'Phó từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, phó từ 已经 / 正在' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "already" and progressive aspect' },
    ],
    point: {
      structure: '已经 + động từ + 了 (đã…rồi)  ·  正在 + động từ (đang…)',
      explain: '已经 (yǐjīng) = "đã…rồi", thường đi cùng 了 ở cuối (他已经走了). 正在 (zhèngzài) = "đang…", chỉ hành động đang diễn ra (我正在吃饭). Cả hai là phó từ, đứng trước động từ.',
      examples: [
        { cn: '他已经走了。', pinyin: 'Tā yǐjīng zǒu le.', vi: 'Anh ấy đã đi rồi.' },
        { cn: '我正在吃饭。', pinyin: 'Wǒ zhèngzài chī fàn.', vi: 'Tôi đang ăn cơm.' },
        { cn: '她已经到了。', pinyin: 'Tā yǐjīng dào le.', vi: 'Cô ấy đã đến rồi.' },
      ],
      note: '已经 hay đi kèm 了; 正在 nhấn mạnh hành động đang tiếp diễn.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      ACT: [
        { cn: '吃饭', vi: 'ăn cơm' }, { cn: '看书', vi: 'đọc sách' }, { cn: '工作', vi: 'làm việc' },
        { cn: '学习', vi: 'học' }, { cn: '睡觉', vi: 'ngủ' }, { cn: '看电视', vi: 'xem tivi' },
        { cn: '做饭', vi: 'nấu cơm' }, { cn: '上课', vi: 'học trên lớp' },
      ],
      DONE: [
        { cn: '走', vi: 'đi' }, { cn: '到', vi: 'đến nơi' }, { cn: '来', vi: 'đến' },
        { cn: '回家', vi: 'về nhà' }, { cn: '起床', vi: 'dậy' }, { cn: '吃饭', vi: 'ăn cơm' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{ACT}。({SUBJ_vi} đang {ACT_vi})', answer: '正在', distractors: ['已经', '就', '才'], explain: '正在 + động từ chỉ hành động đang diễn ra.' },
      { type: 'fill_blank', frame: '{SUBJ}___{DONE}了。({SUBJ_vi} đã {DONE_vi} rồi)', answer: '已经', distractors: ['正在', '还', '再'], explain: '已经…了 diễn tả việc đã hoàn tất.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} đang {ACT_vi}"', correct: '{SUBJ}正在{ACT}', distractors: ['{SUBJ}已经{ACT}了', '{SUBJ}{ACT}正在', '正在{SUBJ}{ACT}'], explain: 'Chủ ngữ + 正在 + động từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} đã {DONE_vi} rồi"', correct: '{SUBJ}已经{DONE}了', distractors: ['{SUBJ}正在{DONE}', '{SUBJ}{DONE}已经了', '{SUBJ}已经{DONE}'], explain: '已经 đứng trước động từ, 了 ở cuối.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} đã {DONE_vi} rồi")?', correct: '{SUBJ}已经{DONE}了。', errors: ['{SUBJ}已经{DONE}。', '{SUBJ}正在{DONE}了。', '已经{SUBJ}{DONE}了。'], explain: '已经 thường đi kèm 了 và đứng sau chủ ngữ.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '正在', '{ACT}'], explain: 'Trật tự: Chủ ngữ + 正在 + động từ.' },
    ],
  },

  // ─── 7. Liên từ 和 / 或者 / 还是 ─────────────────────
  {
    id: 'conj-he-huozhe-haishi', title: 'Liên từ 和 / 或者 / 还是', level: 2,
    desc: '和 (và), 或者 (hoặc — trần thuật), 还是 (hay — câu hỏi lựa chọn)',
    category: 'conjunction', partOfSpeech: 'Liên từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, liên từ 和 / 或者 / 还是' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Conjunctions "he", "huozhe", "haishi"' },
    ],
    point: {
      structure: 'A 和 B (và) · A 或者 B (hoặc — trần thuật) · A 还是 B？ (hay — câu hỏi)',
      explain: '和 (hé) = "và", nối hai danh từ. 或者 (huòzhě) = "hoặc", dùng trong câu TRẦN THUẬT. 还是 (háishi) = "hay", dùng trong câu HỎI lựa chọn. Câu có 还是 KHÔNG thêm 吗.',
      examples: [
        { cn: '我和他是朋友。', pinyin: 'Wǒ hé tā shì péngyou.', vi: 'Tôi và anh ấy là bạn.' },
        { cn: '你喝茶还是咖啡？', pinyin: 'Nǐ hē chá háishi kāfēi?', vi: 'Bạn uống trà hay cà phê?' },
        { cn: '茶或者咖啡，一个就行。', pinyin: 'Chá huòzhě kāfēi, yí ge jiù xíng.', vi: 'Trà hoặc cà phê, một cái là được.' },
      ],
      note: '或者 cho câu trần thuật, 还是 cho câu hỏi. 还是 đã hỏi rồi thì không thêm 吗.',
    },
    slots: {
      WHO: [
        { cn: '你', vi: 'Bạn' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' }, { cn: '你们', vi: 'Các bạn' },
      ],
      PAIR: [
        { a: '茶', b: '咖啡', aVi: 'trà', bVi: 'cà phê' },
        { a: '米饭', b: '鸡蛋', aVi: 'cơm', bVi: 'trứng' },
        { a: '苹果', b: '鱼', aVi: 'táo', bVi: 'cá' },
        { a: '猫', b: '狗', aVi: 'mèo', bVi: 'chó' },
        { a: '哥哥', b: '弟弟', aVi: 'anh trai', bVi: 'em trai' },
        { a: '姐姐', b: '妹妹', aVi: 'chị gái', bVi: 'em gái' },
        { a: '老师', b: '学生', aVi: 'giáo viên', bVi: 'học sinh' },
        { a: '我', b: '他', aVi: 'tôi', bVi: 'anh ấy' },
        { a: '水', b: '茶', aVi: 'nước', bVi: 'trà' },
        { a: '牛奶', b: '咖啡', aVi: 'sữa', bVi: 'cà phê' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{PAIR.a}___{PAIR.b}都在这儿。({PAIR.aVi} và {PAIR.bVi} đều ở đây)', answer: '和', distractors: ['或者', '还是', '比'], explain: '和 nối hai danh từ, nghĩa "và".' },
      { type: 'fill_blank', frame: '{WHO}喜欢{PAIR.a}___{PAIR.b}？({WHO_vi} thích {PAIR.aVi} hay {PAIR.bVi}?)', answer: '还是', distractors: ['和', '或者', '都'], explain: '还是 dùng trong câu hỏi lựa chọn.' },
      { type: 'fill_blank', frame: '{PAIR.a}___{PAIR.b}，一个就行。({PAIR.aVi} hoặc {PAIR.bVi}, một cái là được)', answer: '或者', distractors: ['还是', '吗', '比'], explain: '或者 dùng trong câu trần thuật, nghĩa "hoặc".' },
      { type: 'meaning_to_char', prompt: 'Chọn "{PAIR.aVi} và {PAIR.bVi}"', correct: '{PAIR.a}和{PAIR.b}', distractors: ['{PAIR.a}还是{PAIR.b}', '{PAIR.a}或者{PAIR.b}', '{PAIR.a}比{PAIR.b}'], explain: '"và" nối danh từ dùng 和.' },
      { type: 'grammar_judge', prompt: 'Câu HỎI "{WHO_vi} thích {PAIR.aVi} hay {PAIR.bVi}" nào ĐÚNG?', correct: '{WHO}喜欢{PAIR.a}还是{PAIR.b}？', errors: ['{WHO}喜欢{PAIR.a}或者{PAIR.b}？', '{WHO}喜欢{PAIR.a}和{PAIR.b}？', '{WHO}喜欢{PAIR.a}还是{PAIR.b}吗？'], explain: 'Câu hỏi lựa chọn dùng 还是, và không thêm 吗.' },
      { type: 'sentence_order', tokens: ['{PAIR.a}', '和', '{PAIR.b}'], explain: 'Trật tự: A + 和 + B (nối hai danh từ).' },
    ],
  },

  // ─── 8. Trợ từ động thái 着 ──────────────────────────
  {
    id: 'particle-zhe', title: 'Trợ từ 着 (trạng thái tiếp diễn)', level: 2,
    desc: '着 chỉ trạng thái duy trì hoặc hành động đi kèm',
    category: 'particle', partOfSpeech: 'Trợ từ động thái',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, trợ từ động thái 着' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Persistent state with "zhe"' },
    ],
    point: {
      structure: 'Động từ + 着 (trạng thái đang duy trì)  ·  V1 + 着 + V2 (làm V2 trong khi V1)',
      explain: '着 (zhe) đặt sau động từ chỉ trạng thái đang được duy trì (门开着 = cửa đang mở), hoặc chỉ một hành động diễn ra đồng thời với hành động khác (坐着看书 = ngồi đọc sách).',
      examples: [
        { cn: '他坐着看书。', pinyin: 'Tā zuò zhe kàn shū.', vi: 'Anh ấy ngồi đọc sách.' },
        { cn: '门开着。', pinyin: 'Mén kāi zhe.', vi: 'Cửa đang mở.' },
        { cn: '她笑着说话。', pinyin: 'Tā xiào zhe shuō huà.', vi: 'Cô ấy cười nói chuyện.' },
      ],
      note: '着 nhấn trạng thái/hành động ĐANG duy trì, khác 了 (hoàn thành) và 过 (đã từng).',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      V1: [
        { v: '坐', vVi: 'ngồi' }, { v: '站', vVi: 'đứng' }, { v: '笑', vVi: 'cười' },
      ],
      V2: [
        { cn: '看书', vi: 'đọc sách' }, { cn: '说话', vi: 'nói chuyện' },
        { cn: '吃饭', vi: 'ăn cơm' }, { cn: '喝茶', vi: 'uống trà' },
      ],
      THING: [
        { cn: '门', vi: 'Cửa' }, { cn: '电视', vi: 'Tivi' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{V1.v}___{V2}。({SUBJ_vi} {V1.vVi} {V2_vi})', answer: '着', distractors: ['了', '的', '过'], explain: 'V1 + 着 + V2: làm V2 trong lúc giữ tư thế V1.' },
      { type: 'fill_blank', frame: '{THING}开___。({THING_vi} đang mở/bật)', answer: '着', distractors: ['了', '过', '的'], explain: '着 chỉ trạng thái đang được duy trì.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} {V1.vVi} {V2_vi}"', correct: '{SUBJ}{V1.v}着{V2}', distractors: ['{SUBJ}{V1.v}了{V2}', '{SUBJ}{V1.v}过{V2}', '{SUBJ}{V2}{V1.v}着'], explain: 'Động từ tư thế + 着 + động từ chính.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} {V1.vVi} {V2_vi}")?', correct: '{SUBJ}{V1.v}着{V2}。', errors: ['{SUBJ}着{V1.v}{V2}。', '{SUBJ}{V1.v}{V2}着。', '着{SUBJ}{V1.v}{V2}。'], explain: '着 đặt ngay sau động từ tư thế (V1).' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{V1.v}', '着', '{V2}'], explain: 'Trật tự: Chủ ngữ + V1 + 着 + V2.' },
    ],
  },

  // ─── 9. Trợ từ động thái 过 ──────────────────────────
  {
    id: 'particle-guo', title: 'Trợ từ 过 (đã từng)', level: 2,
    desc: '过 chỉ kinh nghiệm "đã từng" làm việc gì đó',
    category: 'particle', partOfSpeech: 'Trợ từ động thái',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, trợ từ động thái 过' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing experience with "guo"' },
    ],
    point: {
      structure: 'Động từ + 过 (đã từng…)  ·  没 + động từ + 过 (chưa từng…)',
      explain: '过 (guo) đặt sau động từ chỉ kinh nghiệm "đã từng" (我去过中国). Phủ định dùng 没 + động từ + 过 (我没去过中国 = chưa từng). Câu hỏi thêm 吗 ở cuối (你去过中国吗？).',
      examples: [
        { cn: '我去过中国。', pinyin: 'Wǒ qù guo Zhōngguó.', vi: 'Tôi đã từng đến Trung Quốc.' },
        { cn: '你吃过中国菜吗？', pinyin: 'Nǐ chī guo Zhōngguó cài ma?', vi: 'Bạn đã từng ăn món Trung Quốc chưa?' },
        { cn: '我没看过这个电影。', pinyin: 'Wǒ méi kàn guo zhège diànyǐng.', vi: 'Tôi chưa từng xem bộ phim này.' },
      ],
      note: 'Phủ định "chưa từng" dùng 没…过, KHÔNG dùng 了.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      EXP: [
        { v: '去', o: '中国', vVi: 'đến', oVi: 'Trung Quốc' },
        { v: '吃', o: '中国菜', vVi: 'ăn', oVi: 'món Trung Quốc' },
        { v: '看', o: '这个电影', vVi: 'xem', oVi: 'bộ phim này' },
        { v: '学', o: '汉语', vVi: 'học', oVi: 'tiếng Hán' },
        { v: '来', o: '这儿', vVi: 'đến', oVi: 'đây' },
        { v: '喝', o: '茶', vVi: 'uống', oVi: 'trà' },
        { v: '坐', o: '飞机', vVi: 'đi', oVi: 'máy bay' },
        { v: '去', o: '北京', vVi: 'đến', oVi: 'Bắc Kinh' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{EXP.v}___{EXP.o}。({SUBJ_vi} đã từng {EXP.vVi} {EXP.oVi})', answer: '过', distractors: ['着', '的', '吗'], explain: '过 sau động từ chỉ kinh nghiệm "đã từng".' },
      { type: 'fill_blank', frame: '{SUBJ}没{EXP.v}___{EXP.o}。({SUBJ_vi} chưa từng {EXP.vVi} {EXP.oVi})', answer: '过', distractors: ['了', '着', '的'], explain: 'Phủ định: 没 + động từ + 过.' },
      { type: 'fill_blank', frame: '{SUBJ}{EXP.v}过{EXP.o}___？({SUBJ_vi} đã từng {EXP.vVi} {EXP.oVi} chưa?)', answer: '吗', distractors: ['了', '的', '呢'], explain: 'Câu hỏi kinh nghiệm: …过…吗？' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} đã từng {EXP.vVi} {EXP.oVi}"', correct: '{SUBJ}{EXP.v}过{EXP.o}', distractors: ['{SUBJ}{EXP.v}着{EXP.o}', '{SUBJ}{EXP.v}{EXP.o}过吗', '{SUBJ}过{EXP.v}{EXP.o}'], explain: 'Động từ + 过 + tân ngữ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} đã từng {EXP.vVi} {EXP.oVi}")?', correct: '{SUBJ}{EXP.v}过{EXP.o}。', errors: ['{SUBJ}过{EXP.v}{EXP.o}。', '{SUBJ}{EXP.v}{EXP.o}过。', '{SUBJ}没{EXP.v}过{EXP.o}了。'], explain: '过 đặt ngay sau động từ; không dùng chung 没…过…了.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{EXP.v}', '过', '{EXP.o}'], explain: 'Trật tự: Chủ ngữ + động từ + 过 + tân ngữ.' },
    ],
  },

  // ─── 10. Giới từ 从 / 到 / 离 ────────────────────────
  {
    id: 'prep-cong-dao-li', title: 'Giới từ 从 / 到 / 离', level: 2,
    desc: '从 (từ — điểm xuất phát), 到 (đến — điểm kết thúc), 离 (cách — khoảng cách)',
    category: 'preposition', partOfSpeech: 'Giới từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, giới từ 从 / 到 / 离' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Prepositions "cong", "dao", "li"' },
    ],
    point: {
      structure: '从 A 到 B (từ A đến B)  ·  A 离 B + gần/xa (A cách B bao xa)',
      explain: '从 (cóng) chỉ điểm xuất phát (không gian/thời gian). 到 (dào) chỉ điểm kết thúc. Hai từ hay đi cặp: 从…到… (从八点到十点). 离 (lí) chỉ khoảng cách giữa hai điểm, thường theo sau là 近/远 (学校离我家很近).',
      examples: [
        { cn: '我从家到学校。', pinyin: 'Wǒ cóng jiā dào xuéxiào.', vi: 'Tôi từ nhà đến trường.' },
        { cn: '课从八点到十点。', pinyin: 'Kè cóng bā diǎn dào shí diǎn.', vi: 'Lớp học từ 8 giờ đến 10 giờ.' },
        { cn: '学校离我家很近。', pinyin: 'Xuéxiào lí wǒ jiā hěn jìn.', vi: 'Trường cách nhà tôi rất gần.' },
      ],
      note: '离 dùng cho khoảng cách (近/远); 从 dùng cho điểm xuất phát.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' },
      ],
      ROUTE: [
        { a: '家', b: '学校', aVi: 'nhà', bVi: 'trường' },
        { a: '家', b: '公司', aVi: 'nhà', bVi: 'công ty' },
        { a: '学校', b: '家', aVi: 'trường', bVi: 'nhà' },
        { a: '公司', b: '商店', aVi: 'công ty', bVi: 'cửa hàng' },
        { a: '北京', b: '上海', aVi: 'Bắc Kinh', bVi: 'Thượng Hải' },
        { a: '商店', b: '医院', aVi: 'cửa hàng', bVi: 'bệnh viện' },
        { a: '家', b: '医院', aVi: 'nhà', bVi: 'bệnh viện' },
        { a: '学校', b: '公司', aVi: 'trường', bVi: 'công ty' },
      ],
      DIST: [
        { a: '学校', b: '我家', adj: '很近', aVi: 'Trường', bVi: 'nhà tôi', adjVi: 'rất gần' },
        { a: '公司', b: '我家', adj: '很远', aVi: 'Công ty', bVi: 'nhà tôi', adjVi: 'rất xa' },
        { a: '商店', b: '学校', adj: '不远', aVi: 'Cửa hàng', bVi: 'trường', adjVi: 'không xa' },
        { a: '医院', b: '公司', adj: '很近', aVi: 'Bệnh viện', bVi: 'công ty', adjVi: 'rất gần' },
        { a: '家', b: '商店', adj: '很远', aVi: 'Nhà', bVi: 'cửa hàng', adjVi: 'rất xa' },
        { a: '学校', b: '医院', adj: '不远', aVi: 'Trường', bVi: 'bệnh viện', adjVi: 'không xa' },
      ],
      TIME: [
        { a: '八点', b: '十点', aVi: '8 giờ', bVi: '10 giờ' },
        { a: '九点', b: '十二点', aVi: '9 giờ', bVi: '12 giờ' },
        { a: '早上', b: '中午', aVi: 'sáng', bVi: 'trưa' },
        { a: '星期一', b: '星期五', aVi: 'thứ Hai', bVi: 'thứ Sáu' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{ROUTE.a}去{ROUTE.b}。({SUBJ_vi} từ {ROUTE.aVi} đi {ROUTE.bVi})', answer: '从', distractors: ['到', '离', '在'], explain: '从 chỉ điểm xuất phát.' },
      { type: 'fill_blank', frame: '{SUBJ}从{ROUTE.a}___{ROUTE.b}。({SUBJ_vi} từ {ROUTE.aVi} đến {ROUTE.bVi})', answer: '到', distractors: ['从', '离', '在'], explain: '到 chỉ điểm kết thúc; cặp 从…到….' },
      { type: 'fill_blank', frame: '{DIST.a}___{DIST.b}{DIST.adj}。({DIST.aVi} cách {DIST.bVi} {DIST.adjVi})', answer: '离', distractors: ['从', '到', '在'], explain: '离 chỉ khoảng cách, theo sau là 近/远.' },
      { type: 'fill_blank', frame: '我们的课___{TIME.a}到{TIME.b}。(Lớp học từ {TIME.aVi} đến {TIME.bVi})', answer: '从', distractors: ['离', '在', '到'], explain: '从…到… cũng dùng cho thời gian.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{DIST.aVi} cách {DIST.bVi} {DIST.adjVi}"', correct: '{DIST.a}离{DIST.b}{DIST.adj}', distractors: ['{DIST.a}从{DIST.b}{DIST.adj}', '{DIST.a}到{DIST.b}{DIST.adj}', '{DIST.b}离{DIST.a}{DIST.adj}'], explain: 'A 离 B + gần/xa.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{DIST.aVi} cách {DIST.bVi} {DIST.adjVi}")?', correct: '{DIST.a}离{DIST.b}{DIST.adj}。', errors: ['{DIST.a}从{DIST.b}{DIST.adj}。', '{DIST.a}到{DIST.b}{DIST.adj}。', '离{DIST.a}{DIST.b}{DIST.adj}。'], explain: 'Khoảng cách dùng 离, không dùng 从/到.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '从', '{ROUTE.a}', '到', '{ROUTE.b}'], explain: 'Trật tự: Chủ ngữ + 从 + A + 到 + B.' },
    ],
  },

  // ─── 11. Giới từ 给 / 对 / 跟 ────────────────────────
  {
    id: 'prep-gei-dui-gen', title: 'Giới từ 给 / 对 / 跟', level: 2,
    desc: '给 (cho ai), 对 (đối với ai), 跟 (với/cùng ai)',
    category: 'preposition', partOfSpeech: 'Giới từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 2, giới từ 给 / 对 / 跟' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Prepositions "gei", "dui", "gen"' },
    ],
    point: {
      structure: '给 + ai + động từ (làm cho ai) · 对 + ai + tính từ (đối với ai) · 跟 + ai + động từ (cùng ai)',
      explain: '给 (gěi) = "cho ai" (我给你打电话). 对 (duì) = "đối với" (他对我很好). 跟 (gēn) = "với/cùng" (我跟朋友去). Cả ba là giới từ, cụm giới từ đứng TRƯỚC động từ chính.',
      examples: [
        { cn: '我给你打电话。', pinyin: 'Wǒ gěi nǐ dǎ diànhuà.', vi: 'Tôi gọi điện cho bạn.' },
        { cn: '他对我很好。', pinyin: 'Tā duì wǒ hěn hǎo.', vi: 'Anh ấy đối với tôi rất tốt.' },
        { cn: '我跟朋友去商店。', pinyin: 'Wǒ gēn péngyou qù shāngdiàn.', vi: 'Tôi đi cửa hàng cùng bạn.' },
      ],
      note: 'Cụm giới từ (给/对/跟 + đối tượng) đứng TRƯỚC động từ, không đứng sau.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' },
      ],
      PERSON: [
        { cn: '你', vi: 'bạn' }, { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' },
        { cn: '我', vi: 'tôi' }, { cn: '老师', vi: 'giáo viên' }, { cn: '朋友', vi: 'bạn bè' }, { cn: '妈妈', vi: 'mẹ' },
      ],
      GEI_ACT: [
        { cn: '打电话', vi: 'gọi điện' }, { cn: '买东西', vi: 'mua đồ' }, { cn: '做饭', vi: 'nấu cơm' },
      ],
      DUI_ADJ: [
        { cn: '很好', vi: 'rất tốt' }, { cn: '不好', vi: 'không tốt' }, { cn: '很客气', vi: 'rất lịch sự' },
      ],
      GEN_ACT: [
        { cn: '去商店', vi: 'đi cửa hàng' }, { cn: '学汉语', vi: 'học tiếng Hán' },
        { cn: '说话', vi: 'nói chuyện' }, { cn: '吃饭', vi: 'ăn cơm' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{PERSON}{GEI_ACT}。({SUBJ_vi} {GEI_ACT_vi} cho {PERSON_vi})', answer: '给', distractors: ['对', '跟', '和'], explain: '给 + ai + động từ: làm việc gì cho ai.' },
      { type: 'fill_blank', frame: '{SUBJ}___{PERSON}{DUI_ADJ}。({SUBJ_vi} đối với {PERSON_vi} {DUI_ADJ_vi})', answer: '对', distractors: ['给', '跟', '在'], explain: '对 + ai + tính từ: thái độ đối với ai.' },
      { type: 'fill_blank', frame: '{SUBJ}___{PERSON}{GEN_ACT}。({SUBJ_vi} {GEN_ACT_vi} cùng {PERSON_vi})', answer: '跟', distractors: ['给', '对', '在'], explain: '跟 + ai + động từ: cùng ai làm gì.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} {GEI_ACT_vi} cho {PERSON_vi}"', correct: '{SUBJ}给{PERSON}{GEI_ACT}', distractors: ['{SUBJ}对{PERSON}{GEI_ACT}', '{SUBJ}{GEI_ACT}给{PERSON}', '给{SUBJ}{PERSON}{GEI_ACT}'], explain: 'Chủ ngữ + 给 + ai + động từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} {GEI_ACT_vi} cho {PERSON_vi}")?', correct: '{SUBJ}给{PERSON}{GEI_ACT}。', errors: ['{SUBJ}{GEI_ACT}给{PERSON}。', '给{SUBJ}{PERSON}{GEI_ACT}。', '{SUBJ}给{GEI_ACT}{PERSON}。'], explain: 'Cụm 给 + đối tượng đứng trước động từ.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '给', '{PERSON}', '{GEI_ACT}'], explain: 'Trật tự: Chủ ngữ + 给 + đối tượng + động từ.' },
    ],
  },
];
