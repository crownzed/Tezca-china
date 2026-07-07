// ============================================================
// GRAMMAR SPECS — HSK 3
// Mỗi cấu trúc là 1 spec: metadata + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, {NAME.field}) và 4 loại template.
// Nguyên tắc: filler curated theo ngữ cảnh để câu luôn hợp nghĩa + đúng cấp.
// Lưu ý cấp 3: câu 把/被 cần động từ mang thành phần đi kèm (了 / bổ ngữ),
// KHÔNG để động từ trần.
// ============================================================

export const hsk3 = [
  // ─── 1. Câu chữ 把 ──────────────────────────────────
  {
    id: 'ba-sentence', title: 'Câu chữ 把', level: 3,
    desc: 'Cấu trúc 把 đưa tân ngữ lên trước động từ để nhấn mạnh xử lý/kết quả',
    category: 'sentence-pattern', partOfSpeech: 'Cấu trúc câu',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, câu chữ 把' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'The "ba" sentence' },
    ],
    point: {
      structure: 'Chủ ngữ + 把 + tân ngữ (xác định) + động từ + thành phần (了 / bổ ngữ)',
      explain: '把 (bǎ) đưa tân ngữ XÁC ĐỊNH lên trước động từ, nhấn mạnh việc xử lý tân ngữ và KẾT QUẢ tác động lên nó. Động từ KHÔNG được đứng trần — phải kèm 了, bổ ngữ kết quả/xu hướng, hoặc trạng ngữ. Tân ngữ phải là vật đã xác định (không dùng cho vật chung chung).',
      examples: [
        { cn: '我把作业做完了。', pinyin: 'Wǒ bǎ zuòyè zuò wán le.', vi: 'Tôi đã làm xong bài tập.' },
        { cn: '他把门关上了。', pinyin: 'Tā bǎ mén guān shàng le.', vi: 'Anh ấy đã đóng cửa lại.' },
        { cn: '请把手机放在桌子上。', pinyin: 'Qǐng bǎ shǒujī fàng zài zhuōzi shàng.', vi: 'Hãy để điện thoại lên bàn.' },
      ],
      note: 'Động từ trong câu 把 luôn cần thành phần đi kèm; KHÔNG nói 我把作业做 (thiếu 了/bổ ngữ).',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '老师', vi: 'Giáo viên' },
      ],
      // Mỗi filler gói obj + động-từ-có-thành-phần để 把+obj+verb luôn hợp nghĩa.
      // vb = động từ trần (dùng làm đáp án SAI "thiếu thành phần").
      ACTION: [
        { cn: '', obj: '作业', objVi: 'bài tập', verb: '做完了', verbVi: 'làm xong', vb: '做' },
        { cn: '', obj: '书', objVi: 'sách', verb: '看完了', verbVi: 'đọc xong', vb: '看' },
        { cn: '', obj: '饭', objVi: 'cơm', verb: '吃完了', verbVi: 'ăn hết', vb: '吃' },
        { cn: '', obj: '门', objVi: 'cửa', verb: '关上了', verbVi: 'đóng lại', vb: '关' },
        { cn: '', obj: '窗户', objVi: 'cửa sổ', verb: '打开了', verbVi: 'mở ra', vb: '打开' },
        { cn: '', obj: '衣服', objVi: 'quần áo', verb: '洗干净了', verbVi: 'giặt sạch', vb: '洗' },
        { cn: '', obj: '房间', objVi: 'căn phòng', verb: '打扫干净了', verbVi: 'dọn sạch', vb: '打扫' },
        { cn: '', obj: '手机', objVi: 'điện thoại', verb: '放在桌子上了', verbVi: 'để lên bàn', vb: '放' },
        { cn: '', obj: '行李', objVi: 'hành lý', verb: '放好了', verbVi: 'để gọn', vb: '放' },
        { cn: '', obj: '杯子', objVi: 'cái cốc', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
        { cn: '', obj: '蛋糕', objVi: 'bánh kem', verb: '吃完了', verbVi: 'ăn hết', vb: '吃' },
        { cn: '', obj: '水', objVi: 'nước', verb: '喝完了', verbVi: 'uống hết', vb: '喝' },
        { cn: '', obj: '东西', objVi: 'đồ đạc', verb: '放好了', verbVi: 'để gọn', vb: '放' },
        { cn: '', obj: '钱', objVi: 'tiền', verb: '找到了', verbVi: 'tìm thấy', vb: '找' },
        { cn: '', obj: '书', objVi: 'sách', verb: '放在桌子上了', verbVi: 'để lên bàn', vb: '放' },
        { cn: '', obj: '照片', objVi: 'bức ảnh', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{ACTION.obj}{ACTION.verb}。({SUBJ_vi} {ACTION.verbVi} {ACTION.objVi})', answer: '把', distractors: ['被', '在', '给'], explain: '把 đưa tân ngữ {ACTION.obj} lên trước động từ để nhấn mạnh xử lý.' },
      { type: 'fill_blank', frame: '请___{ACTION.obj}{ACTION.verb}。(Hãy {ACTION.verbVi} {ACTION.objVi})', answer: '把', distractors: ['被', '给', '对'], explain: '请 + 把 + tân ngữ + động từ + thành phần: câu đề nghị dùng chữ 把.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu chữ 把: "{SUBJ_vi} {ACTION.verbVi} {ACTION.objVi}"', correct: '{SUBJ}把{ACTION.obj}{ACTION.verb}', distractors: ['{SUBJ}{ACTION.verb}把{ACTION.obj}', '{SUBJ}把{ACTION.verb}{ACTION.obj}', '把{SUBJ}{ACTION.obj}{ACTION.verb}'], explain: 'Trật tự: Chủ ngữ + 把 + tân ngữ + động từ + thành phần.' },
      { type: 'grammar_judge', prompt: 'Câu chữ 把 nào ĐÚNG (động từ phải có thành phần đi kèm)?', correct: '{SUBJ}把{ACTION.obj}{ACTION.verb}。', errors: ['{SUBJ}把{ACTION.obj}{ACTION.vb}。', '{SUBJ}{ACTION.obj}把{ACTION.verb}。', '{SUBJ}把{ACTION.verb}{ACTION.obj}。'], explain: 'Động từ trong câu 把 không được đứng trần (sai: …{ACTION.vb}); phải kèm 了/bổ ngữ.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '把', '{ACTION.obj}', '{ACTION.verb}'], explain: 'Trật tự: Chủ ngữ + 把 + tân ngữ + động từ (kèm thành phần).' },
    ],
  },

  // ─── 2. Câu bị động 被 ──────────────────────────────
  {
    id: 'bei-passive', title: 'Câu bị động 被', level: 3,
    desc: '被 diễn tả bị động; động từ cần mang thành phần kết quả',
    category: 'sentence-pattern', partOfSpeech: 'Cấu trúc câu',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, câu bị động 被' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'The "bei" passive sentence' },
    ],
    point: {
      structure: 'Đối tượng chịu tác động + 被 (+ tác nhân) + động từ + thành phần (了 / bổ ngữ)',
      explain: '被 (bèi) tạo câu bị động: chủ ngữ là đối tượng CHỊU tác động. Tác nhân sau 被 có thể lược. Giống câu 把, động từ KHÔNG đứng trần — phải kèm 了 hoặc bổ ngữ. Câu 被 thường mang ý ngoài ý muốn/tiêu cực.',
      examples: [
        { cn: '我的钱包被偷了。', pinyin: 'Wǒ de qiánbāo bèi tōu le.', vi: 'Ví của tôi bị trộm rồi.' },
        { cn: '蛋糕被弟弟吃完了。', pinyin: 'Dàngāo bèi dìdi chī wán le.', vi: 'Bánh bị em trai ăn hết rồi.' },
        { cn: '杯子被打破了。', pinyin: 'Bēizi bèi dǎ pò le.', vi: 'Cái cốc bị làm vỡ rồi.' },
      ],
      note: 'Động từ sau 被 phải có thành phần (了/bổ ngữ); KHÔNG nói 钱包被偷 (thiếu 了).',
    },
    slots: {
      // Gói vật + tác nhân + động từ để câu bị động luôn hợp nghĩa.
      // vb = động từ trần (đáp án SAI "thiếu thành phần").
      ITEM: [
        { cn: '', th: '钱包', thVi: 'ví tiền', agent: '小偷', agentVi: 'kẻ trộm', verb: '偷走了', verbVi: 'trộm mất', vb: '偷' },
        { cn: '', th: '蛋糕', thVi: 'bánh kem', agent: '弟弟', agentVi: 'em trai', verb: '吃完了', verbVi: 'ăn hết', vb: '吃' },
        { cn: '', th: '杯子', thVi: 'cái cốc', agent: '妹妹', agentVi: 'em gái', verb: '打破了', verbVi: 'làm vỡ', vb: '打' },
        { cn: '', th: '自行车', thVi: 'xe đạp', agent: '同学', agentVi: 'bạn cùng lớp', verb: '借走了', verbVi: 'mượn đi', vb: '借' },
        { cn: '', th: '那本书', thVi: 'quyển sách đó', agent: '老师', agentVi: 'giáo viên', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
        { cn: '', th: '作业', thVi: 'bài tập', agent: '弟弟', agentVi: 'em trai', verb: '弄丢了', verbVi: 'làm mất', vb: '弄' },
        { cn: '', th: '衣服', thVi: 'quần áo', agent: '孩子', agentVi: 'đứa trẻ', verb: '弄脏了', verbVi: 'làm bẩn', vb: '弄' },
        { cn: '', th: '花', thVi: 'bông hoa', agent: '她', agentVi: 'cô ấy', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
        { cn: '', th: '手机', thVi: 'điện thoại', agent: '哥哥', agentVi: 'anh trai', verb: '弄坏了', verbVi: 'làm hỏng', vb: '弄' },
        { cn: '', th: '水', thVi: 'nước', agent: '他', agentVi: 'anh ấy', verb: '喝完了', verbVi: 'uống hết', vb: '喝' },
        { cn: '', th: '面包', thVi: 'bánh mì', agent: '狗', agentVi: 'con chó', verb: '吃完了', verbVi: 'ăn hết', vb: '吃' },
        { cn: '', th: '照片', thVi: 'bức ảnh', agent: '朋友', agentVi: 'người bạn', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
        { cn: '', th: '椅子', thVi: 'cái ghế', agent: '弟弟', agentVi: 'em trai', verb: '弄坏了', verbVi: 'làm hỏng', vb: '弄' },
        { cn: '', th: '房间', thVi: 'căn phòng', agent: '妈妈', agentVi: 'mẹ', verb: '打扫干净了', verbVi: 'dọn sạch', vb: '打扫' },
        { cn: '', th: '东西', thVi: 'đồ đạc', agent: '他', agentVi: 'anh ấy', verb: '拿走了', verbVi: 'lấy đi', vb: '拿' },
        { cn: '', th: '电脑', thVi: 'máy tính', agent: '弟弟', agentVi: 'em trai', verb: '用坏了', verbVi: 'dùng hỏng', vb: '用' },
        { cn: '', th: '词典', thVi: 'từ điển', agent: '同学', agentVi: 'bạn cùng lớp', verb: '借走了', verbVi: 'mượn đi', vb: '借' },
        { cn: '', th: '鱼', thVi: 'con cá', agent: '猫', agentVi: 'con mèo', verb: '吃完了', verbVi: 'ăn hết', vb: '吃' },
        { cn: '', th: '茶', thVi: 'trà', agent: '客人', agentVi: 'khách', verb: '喝完了', verbVi: 'uống hết', vb: '喝' },
        { cn: '', th: '裤子', thVi: 'cái quần', agent: '妹妹', agentVi: 'em gái', verb: '弄脏了', verbVi: 'làm bẩn', vb: '弄' },
        { cn: '', th: '桌子', thVi: 'cái bàn', agent: '孩子', agentVi: 'đứa trẻ', verb: '弄坏了', verbVi: 'làm hỏng', vb: '弄' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{ITEM.th}___{ITEM.agent}{ITEM.verb}。({ITEM.thVi} bị {ITEM.agentVi} {ITEM.verbVi})', answer: '被', distractors: ['把', '在', '给'], explain: '被 tạo bị động: {ITEM.thVi} là đối tượng chịu tác động.' },
      { type: 'fill_blank', frame: '{ITEM.th}___{ITEM.verb}。({ITEM.thVi} bị {ITEM.verbVi})', answer: '被', distractors: ['把', '让', '向'], explain: 'Tác nhân sau 被 có thể lược bỏ: 被 + động từ + thành phần.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu bị động "{ITEM.thVi} bị {ITEM.agentVi} {ITEM.verbVi}"', correct: '{ITEM.th}被{ITEM.agent}{ITEM.verb}', distractors: ['{ITEM.th}把{ITEM.agent}{ITEM.verb}', '{ITEM.agent}被{ITEM.th}{ITEM.verb}', '{ITEM.th}被{ITEM.verb}{ITEM.agent}'], explain: 'Đối tượng + 被 + tác nhân + động từ + thành phần.' },
      { type: 'grammar_judge', prompt: 'Câu bị động 被 nào ĐÚNG (động từ phải có thành phần)?', correct: '{ITEM.th}被{ITEM.agent}{ITEM.verb}。', errors: ['{ITEM.th}被{ITEM.agent}{ITEM.vb}。', '{ITEM.agent}被{ITEM.th}{ITEM.verb}。', '{ITEM.th}{ITEM.agent}被{ITEM.verb}。'], explain: 'Động từ sau 被 không được đứng trần (sai: …{ITEM.vb}); phải kèm 了/bổ ngữ.' },
      { type: 'sentence_order', tokens: ['{ITEM.th}', '被', '{ITEM.agent}', '{ITEM.verb}'], explain: 'Trật tự: Đối tượng + 被 + tác nhân + động từ (kèm thành phần).' },
    ],
  },

  // ─── 3. Liên từ 因为…所以 / 虽然…但是 ─────────────────
  {
    id: 'conjunctions', title: 'Liên từ 因为…所以 / 虽然…但是', level: 3,
    desc: 'Cặp liên từ nhân quả (因为…所以) và nhượng bộ (虽然…但是)',
    category: 'conjunction', partOfSpeech: 'Liên từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, cặp liên từ 因为…所以 / 虽然…但是' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "because… so…"; "although… but…"' },
    ],
    point: {
      structure: '因为 + nguyên nhân，所以 + kết quả   ·   虽然 + sự thật，但是 + tương phản',
      explain: '因为 (yīnwèi)…所以 (suǒyǐ)… diễn tả quan hệ NHÂN QUẢ ("vì… nên…"). 虽然 (suīrán)…但是 (dànshì)… diễn tả NHƯỢNG BỘ/TƯƠNG PHẢN ("tuy… nhưng…"). Tiếng Hán cho phép dùng CẢ HAI vế của cặp, khác tiếng Việt thường bỏ một vế.',
      examples: [
        { cn: '因为下雨，所以我没去。', pinyin: 'Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.', vi: 'Vì trời mưa nên tôi không đi.' },
        { cn: '虽然很贵，但是很漂亮。', pinyin: 'Suīrán hěn guì, dànshì hěn piàoliang.', vi: 'Tuy đắt nhưng rất đẹp.' },
        { cn: '因为他很努力，所以考得很好。', pinyin: 'Yīnwèi tā hěn nǔlì, suǒyǐ kǎo de hěn hǎo.', vi: 'Vì anh ấy cố gắng nên thi rất tốt.' },
      ],
      note: '因为 đi với 所以 (nhân quả); 虽然 đi với 但是 (tương phản). KHÔNG trộn 虽然…所以.',
    },
    slots: {
      // Cặp nhân quả: a gây ra b.
      CAUSE: [
        { cn: '', a: '今天下雨', aVi: 'hôm nay trời mưa', b: '我没去公园', bVi: 'tôi không đi công viên' },
        { cn: '', a: '他很努力', aVi: 'anh ấy rất cố gắng', b: '考得很好', bVi: 'thi rất tốt' },
        { cn: '', a: '我生病了', aVi: 'tôi bị ốm', b: '没去上课', bVi: 'không đi học' },
        { cn: '', a: '天气很冷', aVi: 'trời rất lạnh', b: '我穿了很多衣服', bVi: 'tôi mặc nhiều áo' },
        { cn: '', a: '这个菜很好吃', aVi: 'món này rất ngon', b: '我吃了很多', bVi: 'tôi ăn rất nhiều' },
        { cn: '', a: '他起晚了', aVi: 'anh ấy dậy muộn', b: '迟到了', bVi: 'bị muộn' },
        { cn: '', a: '我很累', aVi: 'tôi rất mệt', b: '想早点休息', bVi: 'muốn nghỉ sớm' },
        { cn: '', a: '路上堵车', aVi: 'trên đường kẹt xe', b: '我们迟到了', bVi: 'chúng tôi đến muộn' },
        { cn: '', a: '他喜欢中国文化', aVi: 'anh ấy thích văn hóa Trung Quốc', b: '开始学汉语', bVi: 'bắt đầu học tiếng Hán' },
        { cn: '', a: '外面很热', aVi: 'bên ngoài rất nóng', b: '我们在家看电视', bVi: 'chúng tôi ở nhà xem tivi' },
        { cn: '', a: '今天是周末', aVi: 'hôm nay là cuối tuần', b: '我不用上班', bVi: 'tôi không phải đi làm' },
        { cn: '', a: '他没带钱', aVi: 'anh ấy không mang tiền', b: '没买那本书', bVi: 'không mua quyển sách đó' },
        { cn: '', a: '火车快到了', aVi: 'tàu sắp đến rồi', b: '我们快走吧', bVi: 'chúng ta đi nhanh thôi' },
        { cn: '', a: '这里很安静', aVi: 'ở đây rất yên tĩnh', b: '我喜欢在这里看书', bVi: 'tôi thích đọc sách ở đây' },
        { cn: '', a: '他汉语说得好', aVi: 'anh ấy nói tiếng Hán giỏi', b: '找到了好工作', bVi: 'tìm được việc tốt' },
        { cn: '', a: '我饿了', aVi: 'tôi đói rồi', b: '想吃点东西', bVi: 'muốn ăn chút gì đó' },
      ],
      // Cặp nhượng bộ: b tương phản với a.
      CONC: [
        { cn: '', a: '这件衣服很贵', aVi: 'cái áo này rất đắt', b: '很漂亮', bVi: 'rất đẹp' },
        { cn: '', a: '汉语很难', aVi: 'tiếng Hán rất khó', b: '很有意思', bVi: 'rất thú vị' },
        { cn: '', a: '他很忙', aVi: 'anh ấy rất bận', b: '还是来了', bVi: 'vẫn đến' },
        { cn: '', a: '今天很热', aVi: 'hôm nay rất nóng', b: '我还想出去', bVi: 'tôi vẫn muốn ra ngoài' },
        { cn: '', a: '我很累', aVi: 'tôi rất mệt', b: '很高兴', bVi: 'rất vui' },
        { cn: '', a: '这个房间很小', aVi: 'căn phòng này rất nhỏ', b: '很干净', bVi: 'rất sạch' },
        { cn: '', a: '他年纪不大', aVi: 'anh ấy tuổi không lớn', b: '很聪明', bVi: 'rất thông minh' },
        { cn: '', a: '外面下雨', aVi: 'bên ngoài trời mưa', b: '我们玩得很开心', bVi: 'chúng tôi chơi rất vui' },
        { cn: '', a: '我学了很久', aVi: 'tôi học rất lâu', b: '还是不太懂', bVi: 'vẫn không hiểu lắm' },
        { cn: '', a: '菜很多', aVi: 'món ăn rất nhiều', b: '我都吃完了', bVi: 'tôi ăn hết cả' },
        { cn: '', a: '他很年轻', aVi: 'anh ấy rất trẻ', b: '很努力', bVi: 'rất chăm chỉ' },
        { cn: '', a: '这本书很长', aVi: 'quyển sách này rất dài', b: '我很快看完了', bVi: 'tôi đọc xong rất nhanh' },
        { cn: '', a: '路很远', aVi: 'đường rất xa', b: '我们走着去', bVi: 'chúng tôi đi bộ' },
        { cn: '', a: '天气不好', aVi: 'thời tiết không tốt', b: '我们还是去了', bVi: 'chúng tôi vẫn đi' },
        { cn: '', a: '他不是老师', aVi: 'anh ấy không phải giáo viên', b: '懂得很多', bVi: 'biết rất nhiều' },
        { cn: '', a: '时间很晚了', aVi: 'đã rất muộn rồi', b: '他还在工作', bVi: 'anh ấy vẫn làm việc' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '因为{CAUSE.a}，___{CAUSE.b}。(Vì {CAUSE.aVi} nên {CAUSE.bVi})', answer: '所以', distractors: ['但是', '虽然', '因为'], explain: '因为 (nguyên nhân) đi cặp với 所以 (kết quả).' },
      { type: 'fill_blank', frame: '___{CAUSE.a}，所以{CAUSE.b}。(Vì {CAUSE.aVi} nên {CAUSE.bVi})', answer: '因为', distractors: ['所以', '但是', '虽然'], explain: 'Vế nguyên nhân mở đầu bằng 因为, vế kết quả bằng 所以.' },
      { type: 'fill_blank', frame: '虽然{CONC.a}，___{CONC.b}。(Tuy {CONC.aVi} nhưng {CONC.bVi})', answer: '但是', distractors: ['所以', '因为', '而且'], explain: '虽然 (nhượng bộ) đi cặp với 但是 (tương phản).' },
      { type: 'meaning_to_char', prompt: 'Chọn "Vì {CAUSE.aVi} nên {CAUSE.bVi}"', correct: '因为{CAUSE.a}，所以{CAUSE.b}', distractors: ['虽然{CAUSE.a}，但是{CAUSE.b}', '所以{CAUSE.a}，因为{CAUSE.b}', '因为{CAUSE.a}，但是{CAUSE.b}'], explain: 'Nhân quả dùng 因为…所以…, đúng thứ tự nguyên nhân → kết quả.' },
      { type: 'grammar_judge', prompt: 'Cặp liên từ nào ĐÚNG cho quan hệ nhượng bộ "{CONC.aVi} nhưng {CONC.bVi}"?', correct: '虽然{CONC.a}，但是{CONC.b}。', errors: ['因为{CONC.a}，所以{CONC.b}。', '虽然{CONC.a}，所以{CONC.b}。', '因为{CONC.a}，但是{CONC.b}。'], explain: 'Nhượng bộ dùng 虽然…但是…; không trộn với 因为/所以.' },
      { type: 'sentence_order', tokens: ['因为', '{CAUSE.a}', '所以', '{CAUSE.b}'], explain: 'Trật tự: 因为 + nguyên nhân + 所以 + kết quả.' },
    ],
  },

  // ─── 4. Bổ ngữ kết quả ──────────────────────────────
  {
    id: 'complement-result', title: 'Bổ ngữ kết quả', level: 3,
    desc: 'Động từ + bổ ngữ kết quả (完/懂/到/见/会…) chỉ kết quả của hành động',
    category: 'complement', partOfSpeech: 'Bổ ngữ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, bổ ngữ kết quả' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Result complements' },
    ],
    point: {
      structure: 'Động từ + bổ ngữ kết quả (+ 了) + tân ngữ',
      explain: 'Bổ ngữ kết quả đứng LIỀN SAU động từ, cho biết kết quả của hành động: 完 (xong), 懂 (hiểu), 到 (được/thấy), 见 (thấy), 会 (biết), 好 (tốt/xong), 干净 (sạch), 清楚 (rõ). Phủ định dùng 没 và BỎ 了: 我没吃完.',
      examples: [
        { cn: '我吃完饭了。', pinyin: 'Wǒ chī wán fàn le.', vi: 'Tôi ăn xong cơm rồi.' },
        { cn: '我听懂了老师的话。', pinyin: 'Wǒ tīng dǒng le lǎoshī de huà.', vi: 'Tôi nghe hiểu lời thầy.' },
        { cn: '我没找到手机。', pinyin: 'Wǒ méi zhǎo dào shǒujī.', vi: 'Tôi chưa tìm thấy điện thoại.' },
      ],
      note: 'Bổ ngữ kết quả phải liền động từ; phủ định dùng 没 và bỏ 了.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '学生', vi: 'Học sinh' },
      ],
      // vc = động từ + bổ ngữ; v = động từ trần; comp = bổ ngữ; wrong = 3 bổ ngữ sai.
      RES: [
        { cn: '', vc: '吃完', v: '吃', comp: '完', obj: '饭', phraseVi: 'ăn xong cơm', wrong: ['懂', '到', '见'] },
        { cn: '', vc: '看完', v: '看', comp: '完', obj: '书', phraseVi: 'đọc xong sách', wrong: ['懂', '到', '见'] },
        { cn: '', vc: '做完', v: '做', comp: '完', obj: '作业', phraseVi: 'làm xong bài tập', wrong: ['懂', '到', '见'] },
        { cn: '', vc: '听懂', v: '听', comp: '懂', obj: '老师的话', phraseVi: 'nghe hiểu lời thầy', wrong: ['完', '到', '见'] },
        { cn: '', vc: '看懂', v: '看', comp: '懂', obj: '这本书', phraseVi: 'đọc hiểu quyển sách này', wrong: ['完', '到', '见'] },
        { cn: '', vc: '找到', v: '找', comp: '到', obj: '手机', phraseVi: 'tìm thấy điện thoại', wrong: ['完', '懂', '见'] },
        { cn: '', vc: '买到', v: '买', comp: '到', obj: '票', phraseVi: 'mua được vé', wrong: ['完', '懂', '见'] },
        { cn: '', vc: '看见', v: '看', comp: '见', obj: '他', phraseVi: 'nhìn thấy anh ấy', wrong: ['完', '懂', '到'] },
        { cn: '', vc: '听见', v: '听', comp: '见', obj: '声音', phraseVi: 'nghe thấy âm thanh', wrong: ['完', '懂', '到'] },
        { cn: '', vc: '写完', v: '写', comp: '完', obj: '作业', phraseVi: 'viết xong bài tập', wrong: ['懂', '到', '见'] },
        { cn: '', vc: '学会', v: '学', comp: '会', obj: '汉语', phraseVi: 'học được tiếng Hán', wrong: ['完', '到', '见'] },
        { cn: '', vc: '喝完', v: '喝', comp: '完', obj: '水', phraseVi: 'uống hết nước', wrong: ['懂', '到', '见'] },
        { cn: '', vc: '看清楚', v: '看', comp: '清楚', obj: '黑板', phraseVi: 'nhìn rõ bảng', wrong: ['完', '懂', '见'] },
        { cn: '', vc: '找到', v: '找', comp: '到', obj: '工作', phraseVi: 'tìm được việc làm', wrong: ['完', '懂', '见'] },
        { cn: '', vc: '听懂', v: '听', comp: '懂', obj: '这个词', phraseVi: 'nghe hiểu từ này', wrong: ['完', '到', '见'] },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{RES.v}___{RES.obj}了。({SUBJ_vi} {RES.phraseVi})', answer: '{RES.comp}', distractors: ['{RES.wrong.0}', '{RES.wrong.1}', '{RES.wrong.2}'], explain: 'Bổ ngữ kết quả {RES.comp} liền sau động từ {RES.v} cho biết kết quả.' },
      { type: 'fill_blank', frame: '{SUBJ}没{RES.v}___{RES.obj}。({SUBJ_vi} chưa {RES.phraseVi})', answer: '{RES.comp}', distractors: ['{RES.wrong.0}', '{RES.wrong.1}', '{RES.wrong.2}'], explain: 'Phủ định bổ ngữ kết quả dùng 没 và BỎ 了.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} {RES.phraseVi}"', correct: '{SUBJ}{RES.vc}{RES.obj}了', distractors: ['{SUBJ}{RES.v}{RES.obj}{RES.comp}了', '{SUBJ}{RES.comp}{RES.v}{RES.obj}了', '{SUBJ}{RES.obj}{RES.comp}{RES.v}了'], explain: 'Bổ ngữ kết quả phải LIỀN sau động từ: {RES.vc}.' },
      { type: 'grammar_judge', prompt: 'Vị trí bổ ngữ kết quả nào ĐÚNG?', correct: '{SUBJ}{RES.vc}{RES.obj}了。', errors: ['{SUBJ}{RES.v}{RES.obj}{RES.comp}了。', '{SUBJ}{RES.comp}{RES.v}{RES.obj}了。', '{SUBJ}{RES.obj}{RES.comp}{RES.v}了。'], explain: 'Bổ ngữ kết quả {RES.comp} phải liền động từ {RES.v}, không tách rời bởi tân ngữ.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{RES.vc}', '{RES.obj}', '了'], explain: 'Trật tự: Chủ ngữ + (động từ + bổ ngữ) + tân ngữ + 了.' },
    ],
  },

  // ─── 5. Liên từ 不但…而且 ────────────────────────────
  {
    id: 'conj-budan-erqie', title: 'Liên từ 不但…而且', level: 3,
    desc: 'Cặp liên từ tăng tiến 不但…而且 ("không những… mà còn…")',
    category: 'conjunction', partOfSpeech: 'Liên từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, cặp liên từ 不但…而且' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "not only… but also…" with "budan… erqie…"' },
    ],
    point: {
      structure: 'Chủ ngữ + 不但 + vế 1，而且 + vế 2 (tăng tiến)',
      explain: '不但 (búdàn)…而且 (érqiě)… diễn tả quan hệ TĂNG TIẾN ("không những… mà còn…"): vế 2 tiến thêm một bậc so với vế 1. Khi CÙNG một chủ ngữ, 不但 đứng sau chủ ngữ; hai vế nói về cùng đối tượng.',
      examples: [
        { cn: '他不但会说汉语，而且会说英语。', pinyin: 'Tā búdàn huì shuō Hànyǔ, érqiě huì shuō Yīngyǔ.', vi: 'Anh ấy không những biết tiếng Hán mà còn biết tiếng Anh.' },
        { cn: '她不但很聪明，而且很努力。', pinyin: 'Tā búdàn hěn cōngmíng, érqiě hěn nǔlì.', vi: 'Cô ấy không những thông minh mà còn chăm chỉ.' },
        { cn: '他不但喜欢唱歌，而且喜欢跳舞。', pinyin: 'Tā búdàn xǐhuān chànggē, érqiě xǐhuān tiàowǔ.', vi: 'Anh ấy không những thích hát mà còn thích nhảy.' },
      ],
      note: '不但 đi cặp với 而且 (tăng tiến); không trộn 不但…但是 (tương phản).',
    },
    slots: {
      SUBJ: [
        { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' }, { cn: '我的朋友', vi: 'Bạn của tôi' },
        { cn: '这个学生', vi: 'Học sinh này' }, { cn: '我妹妹', vi: 'Em gái tôi' }, { cn: '我们的老师', vi: 'Thầy của chúng tôi' },
      ],
      // Cặp phẩm chất về người: a và b đều thuộc cùng chủ ngữ, vế 2 tăng tiến.
      PAIR: [
        { cn: '', a: '会说汉语', aVi: 'biết nói tiếng Hán', b: '会说英语', bVi: 'biết nói tiếng Anh' },
        { cn: '', a: '很聪明', aVi: 'rất thông minh', b: '很努力', bVi: 'rất chăm chỉ' },
        { cn: '', a: '喜欢唱歌', aVi: 'thích hát', b: '喜欢跳舞', bVi: 'thích nhảy' },
        { cn: '', a: '会做中国菜', aVi: 'biết nấu món Trung Quốc', b: '做得很好', bVi: 'nấu rất ngon' },
        { cn: '', a: '长得漂亮', aVi: 'trông xinh đẹp', b: '很热情', bVi: 'rất nhiệt tình' },
        { cn: '', a: '学习好', aVi: 'học giỏi', b: '爱运动', bVi: 'thích vận động' },
        { cn: '', a: '工作认真', aVi: 'làm việc chăm chỉ', b: '对人很好', bVi: 'đối xử tốt với mọi người' },
        { cn: '', a: '会开车', aVi: 'biết lái xe', b: '开得很好', bVi: 'lái rất giỏi' },
        { cn: '', a: '喜欢看书', aVi: 'thích đọc sách', b: '喜欢写字', bVi: 'thích viết chữ' },
        { cn: '', a: '会说汉语', aVi: 'biết nói tiếng Hán', b: '会写汉字', bVi: 'biết viết chữ Hán' },
        { cn: '', a: '很有名', aVi: 'rất nổi tiếng', b: '很有钱', bVi: 'rất giàu' },
        { cn: '', a: '唱歌好听', aVi: 'hát hay', b: '跳舞好看', bVi: 'nhảy đẹp' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{PAIR.a}，而且{PAIR.b}。({SUBJ_vi} không những {PAIR.aVi} mà còn {PAIR.bVi})', answer: '不但', distractors: ['因为', '虽然', '所以'], explain: '不但 mở đầu vế 1 trong cặp tăng tiến 不但…而且.' },
      { type: 'fill_blank', frame: '{SUBJ}不但{PAIR.a}，___{PAIR.b}。({SUBJ_vi} không những {PAIR.aVi} mà còn {PAIR.bVi})', answer: '而且', distractors: ['但是', '所以', '因为'], explain: '而且 nối vế 2, tiến thêm một bậc so với vế 1.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} không những {PAIR.aVi} mà còn {PAIR.bVi}"', correct: '{SUBJ}不但{PAIR.a}，而且{PAIR.b}', distractors: ['{SUBJ}虽然{PAIR.a}，但是{PAIR.b}', '{SUBJ}因为{PAIR.a}，所以{PAIR.b}', '{SUBJ}不但{PAIR.a}，但是{PAIR.b}'], explain: 'Quan hệ tăng tiến dùng 不但…而且…, không dùng 但是/所以.' },
      { type: 'grammar_judge', prompt: 'Cặp liên từ "không những… mà còn…" nào ĐÚNG?', correct: '{SUBJ}不但{PAIR.a}，而且{PAIR.b}。', errors: ['{SUBJ}不但{PAIR.a}，但是{PAIR.b}。', '{SUBJ}虽然{PAIR.a}，而且{PAIR.b}。', '{SUBJ}因为{PAIR.a}，而且{PAIR.b}。'], explain: '不但 phải đi với 而且; ghép 不但…但是 hoặc 虽然…而且 đều sai.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '不但', '{PAIR.a}', '而且', '{PAIR.b}'], explain: 'Trật tự: Chủ ngữ + 不但 + vế 1 + 而且 + vế 2.' },
    ],
  },

  // ─── 6. Phân biệt 的 / 得 / 地 ───────────────────────
  {
    id: 'de-de-di', title: 'Phân biệt 的 / 得 / 地', level: 3,
    desc: 'Ba trợ từ đồng âm "de": 的 (định ngữ), 得 (bổ ngữ), 地 (trạng ngữ)',
    category: 'particle', partOfSpeech: 'Trợ từ kết cấu',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 3, phân biệt 的 / 得 / 地' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Comparing "de" (的), "de" (得) and "de" (地)' },
    ],
    point: {
      structure: 'Định ngữ + 的 + danh từ   ·   động từ + 得 + bổ ngữ trạng thái   ·   trạng ngữ + 地 + động từ',
      explain: 'Ba chữ đọc là "de": 的 nối định ngữ với DANH TỪ (漂亮的花). 得 (de) nối động/tính từ với BỔ NGỮ trạng thái đứng sau (跑得很快). 地 (de) nối trạng ngữ với ĐỘNG TỪ đứng sau (认真地学习).',
      examples: [
        { cn: '这是漂亮的花。', pinyin: 'Zhè shì piàoliang de huā.', vi: 'Đây là bông hoa đẹp.' },
        { cn: '他跑得很快。', pinyin: 'Tā pǎo de hěn kuài.', vi: 'Anh ấy chạy rất nhanh.' },
        { cn: '他认真地学习。', pinyin: 'Tā rènzhēn de xuéxí.', vi: 'Anh ấy học hành chăm chỉ.' },
      ],
      note: '的 + danh từ; 得 + bổ ngữ (sau động từ); 地 + động từ.',
    },
    slots: {
      // 的: định ngữ + danh từ
      DE1: [
        { cn: '', mod: '漂亮', modVi: 'đẹp', noun: '花', nounVi: 'bông hoa' },
        { cn: '', mod: '聪明', modVi: 'thông minh', noun: '学生', nounVi: 'học sinh' },
        { cn: '', mod: '红', modVi: 'đỏ', noun: '衣服', nounVi: 'áo' },
        { cn: '', mod: '好吃', modVi: 'ngon', noun: '菜', nounVi: 'món ăn' },
        { cn: '', mod: '新', modVi: 'mới', noun: '手机', nounVi: 'điện thoại' },
        { cn: '', mod: '热情', modVi: 'nhiệt tình', noun: '老师', nounVi: 'giáo viên' },
        { cn: '', mod: '干净', modVi: 'sạch sẽ', noun: '房间', nounVi: 'căn phòng' },
        { cn: '', mod: '有名', modVi: 'nổi tiếng', noun: '饭馆', nounVi: 'quán ăn' },
        { cn: '', mod: '好看', modVi: 'đẹp', noun: '照片', nounVi: 'bức ảnh' },
        { cn: '', mod: '便宜', modVi: 'rẻ', noun: '东西', nounVi: 'đồ' },
        { cn: '', mod: '贵', modVi: 'đắt', noun: '车', nounVi: 'chiếc xe' },
        { cn: '', mod: '白', modVi: 'trắng', noun: '裙子', nounVi: 'chiếc váy' },
        { cn: '', mod: '好', modVi: 'tốt', noun: '朋友', nounVi: 'người bạn' },
        { cn: '', mod: '忙', modVi: 'bận', noun: '工作', nounVi: 'công việc' },
      ],
      // 得: động từ + bổ ngữ trạng thái
      DE2: [
        { cn: '', verb: '跑', verbVi: 'chạy', adv: '很快', advVi: 'rất nhanh' },
        { cn: '', verb: '说', verbVi: 'nói', adv: '很好', advVi: 'rất giỏi' },
        { cn: '', verb: '唱', verbVi: 'hát', adv: '很好听', advVi: 'rất hay' },
        { cn: '', verb: '写', verbVi: 'viết', adv: '很漂亮', advVi: 'rất đẹp' },
        { cn: '', verb: '走', verbVi: 'đi', adv: '很慢', advVi: 'rất chậm' },
        { cn: '', verb: '吃', verbVi: 'ăn', adv: '很多', advVi: 'rất nhiều' },
        { cn: '', verb: '来', verbVi: 'đến', adv: '很早', advVi: 'rất sớm' },
        { cn: '', verb: '做', verbVi: 'làm', adv: '很好', advVi: 'rất tốt' },
        { cn: '', verb: '睡', verbVi: 'ngủ', adv: '很晚', advVi: 'rất muộn' },
        { cn: '', verb: '学', verbVi: 'học', adv: '很快', advVi: 'rất nhanh' },
        { cn: '', verb: '玩', verbVi: 'chơi', adv: '很开心', advVi: 'rất vui' },
        { cn: '', verb: '起', verbVi: 'dậy', adv: '很早', advVi: 'rất sớm' },
      ],
      // 地: trạng ngữ + động từ
      DE3: [
        { cn: '', adv: '认真', advVi: 'chăm chỉ', verb: '学习', verbVi: 'học' },
        { cn: '', adv: '高兴', advVi: 'vui vẻ', verb: '唱歌', verbVi: 'hát' },
        { cn: '', adv: '慢慢', advVi: 'từ từ', verb: '走', verbVi: 'đi' },
        { cn: '', adv: '努力', advVi: 'nỗ lực', verb: '工作', verbVi: 'làm việc' },
        { cn: '', adv: '安静', advVi: 'yên lặng', verb: '看书', verbVi: 'đọc sách' },
        { cn: '', adv: '热情', advVi: 'nhiệt tình', verb: '帮助我', verbVi: 'giúp tôi' },
        { cn: '', adv: '快乐', advVi: 'vui vẻ', verb: '生活', verbVi: 'sống' },
        { cn: '', adv: '小心', advVi: 'cẩn thận', verb: '开车', verbVi: 'lái xe' },
        { cn: '', adv: '认真', advVi: 'chăm chú', verb: '听', verbVi: 'nghe' },
        { cn: '', adv: '大声', advVi: 'to tiếng', verb: '说话', verbVi: 'nói chuyện' },
        { cn: '', adv: '高兴', advVi: 'vui vẻ', verb: '回家', verbVi: 'về nhà' },
        { cn: '', adv: '努力', advVi: 'chăm chỉ', verb: '学汉语', verbVi: 'học tiếng Hán' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '这是{DE1.mod}___{DE1.noun}。({DE1.nounVi} {DE1.modVi})', answer: '的', distractors: ['得', '地', '了'], explain: '的 nối định ngữ {DE1.mod} với danh từ {DE1.noun}.' },
      { type: 'fill_blank', frame: '他{DE2.verb}___{DE2.adv}。(anh ấy {DE2.verbVi} {DE2.advVi})', answer: '得', distractors: ['的', '地', '了'], explain: '得 nối động từ {DE2.verb} với bổ ngữ trạng thái {DE2.adv} đứng sau.' },
      { type: 'fill_blank', frame: '他{DE3.adv}___{DE3.verb}。(anh ấy {DE3.verbVi} một cách {DE3.advVi})', answer: '地', distractors: ['的', '得', '了'], explain: '地 nối trạng ngữ {DE3.adv} với động từ {DE3.verb} đứng sau.' },
      { type: 'grammar_judge', prompt: 'Câu dùng 得 ĐÚNG (bổ ngữ trạng thái) là?', correct: '他{DE2.verb}得{DE2.adv}。', errors: ['他{DE2.verb}的{DE2.adv}。', '他{DE2.verb}地{DE2.adv}。', '他得{DE2.verb}{DE2.adv}。'], explain: '得 đứng SAU động từ để dẫn bổ ngữ trạng thái: {DE2.verb}得{DE2.adv}.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{DE1.nounVi} {DE1.modVi}" (định ngữ + danh từ)', correct: '{DE1.mod}的{DE1.noun}', distractors: ['{DE1.mod}得{DE1.noun}', '{DE1.mod}地{DE1.noun}', '{DE1.noun}的{DE1.mod}'], explain: 'Định ngữ + 的 + danh từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{DE3.verbVi} một cách {DE3.advVi}" (trạng ngữ + động từ)', correct: '{DE3.adv}地{DE3.verb}', distractors: ['{DE3.adv}的{DE3.verb}', '{DE3.adv}得{DE3.verb}', '{DE3.verb}地{DE3.adv}'], explain: 'Trạng ngữ + 地 + động từ.' },
      { type: 'sentence_order', tokens: ['这', '是', '{DE1.mod}', '的', '{DE1.noun}'], explain: 'Trật tự: 这 + 是 + định ngữ + 的 + danh từ.' },
    ],
  },
];
