// ============================================================
// GRAMMAR SPECS — HSK 6
// Mỗi cấu trúc là 1 spec: metadata + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, {NAME.field}) và 4 loại template.
// HSK 6 ở đây là phân biệt cận nghĩa nâng cao — nhiều template + filler
// curated theo tình huống thật. Chữ Hán luôn sạch, đúng, không lẫn tiếng Việt.
// ============================================================

export const hsk6 = [
  // ─── 1. Phân biệt 冤枉 / 委屈 ────────────────────────
  {
    id: 'yuan-wang-wei-qu', title: 'Phân biệt 冤枉 / 委屈', level: 6,
    desc: '冤枉 (bị oan / uổng phí) và 委屈 (tủi thân, ấm ức) — hai sắc thái "chịu thiệt"',
    category: 'vocabulary', partOfSpeech: 'Động từ / Tính từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 6, phân biệt 冤枉 / 委屈' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Distinguishing "yuanwang" and "weiqu"' },
    ],
    point: {
      structure: '冤枉 someone (đổ oan) / 冤枉 (uổng phí)  ·  (感到/受) 委屈 (thấy tủi thân)',
      explain: '冤枉 (yuānwang): (1) động từ "đổ oan, vu oan" cho ai — 冤枉了他; (2) tính từ "oan uổng, uổng phí" — 钱花得冤枉 (tiền tiêu uổng). 委屈 (wěiqu): cảm giác "tủi thân, ấm ức" khi bị đối xử bất công — 感到委屈, 受委屈; cũng có thể là động từ "làm ai chịu thiệt/ấm ức" — 委屈你了. Khác biệt: 冤枉 nhấn "bị buộc tội sai / phí phạm"; 委屈 nhấn "cảm xúc tủi thân bên trong".',
      examples: [
        { cn: '这件事不是他做的，你冤枉他了。', pinyin: 'Zhè jiàn shì bú shì tā zuò de, nǐ yuānwang tā le.', vi: 'Việc này không phải anh ấy làm, bạn đổ oan cho anh ấy rồi.' },
        { cn: '受了这么大的委屈，她忍不住哭了。', pinyin: 'Shòu le zhème dà de wěiqu, tā rěn bú zhù kū le.', vi: 'Chịu ấm ức lớn như vậy, cô ấy không nhịn được mà khóc.' },
        { cn: '这钱花得太冤枉了。', pinyin: 'Zhè qián huā de tài yuānwang le.', vi: 'Số tiền này tiêu thật là uổng phí.' },
      ],
      note: '冤枉 + tân ngữ (người) = đổ oan; 受/感到 + 委屈 = chịu/thấy tủi thân. 委屈 thiên cảm xúc, 冤枉 thiên bị buộc tội sai / phí phạm.',
    },
    slots: {
      PERSON: [
        { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' }, { cn: '小王', vi: 'Tiểu Vương' },
        { cn: '这个孩子', vi: 'đứa trẻ này' }, { cn: '同事', vi: 'đồng nghiệp' }, { cn: '弟弟', vi: 'em trai' },
        { cn: '老张', vi: 'lão Trương' }, { cn: '那个学生', vi: 'học sinh kia' }, { cn: '小李', vi: 'Tiểu Lý' },
        { cn: '邻居', vi: 'hàng xóm' }, { cn: '司机', vi: 'tài xế' },
      ],
      // Tình huống dùng 委屈 (tủi thân/ấm ức) — mỗi cái là chủ thể cảm xúc.
      FEEL: [
        { subj: '她', subjvi: 'cô ấy', full: 'Cô ấy cảm thấy rất tủi thân' },
        { subj: '孩子', subjvi: 'đứa trẻ', full: 'Đứa trẻ cảm thấy rất tủi thân' },
        { subj: '小李', subjvi: 'Tiểu Lý', full: 'Tiểu Lý cảm thấy rất tủi thân' },
        { subj: '员工', subjvi: 'nhân viên', full: 'Nhân viên cảm thấy rất tủi thân' },
        { subj: '妹妹', subjvi: 'em gái', full: 'Em gái cảm thấy rất tủi thân' },
        { subj: '他', subjvi: 'anh ấy', full: 'Anh ấy cảm thấy rất tủi thân' },
        { subj: '那位老人', subjvi: 'người già kia', full: 'Người già kia cảm thấy rất tủi thân' },
        { subj: '学生', subjvi: 'học sinh', full: 'Học sinh cảm thấy rất tủi thân' },
        { subj: '小张', subjvi: 'Tiểu Trương', full: 'Tiểu Trương cảm thấy rất tủi thân' },
        { subj: '这位母亲', subjvi: 'người mẹ này', full: 'Người mẹ này cảm thấy rất tủi thân' },
      ],
      // Tình huống dùng 冤枉 nghĩa "uổng phí" (tiền/công sức/thời gian).
      WASTE: [
        { thing: '这钱', thingvi: 'số tiền này', full: 'Số tiền này tiêu thật uổng phí' },
        { thing: '这份力气', thingvi: 'công sức này', full: 'Công sức này bỏ ra thật uổng phí' },
        { thing: '这些时间', thingvi: 'khoảng thời gian này', full: 'Khoảng thời gian này dùng thật uổng phí' },
        { thing: '这笔钱', thingvi: 'khoản tiền này', full: 'Khoản tiền này tiêu thật uổng phí' },
        { thing: '那番功夫', thingvi: 'công phu đó', full: 'Công phu đó bỏ ra thật uổng phí' },
        { thing: '那些精力', thingvi: 'công sức đó', full: 'Công sức đó dùng thật uổng phí' },
        { thing: '这份彩礼', thingvi: 'khoản sính lễ này', full: 'Khoản sính lễ này chi thật uổng phí' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '这件事不是{PERSON}做的，你___{PERSON}了。(bạn đổ oan cho {PERSON_vi})', answer: '冤枉', distractors: ['委屈', '委托', '冤家'], explain: '冤枉 + người = đổ oan, vu oan cho ai đó.' },
      { type: 'meaning_to_char', prompt: 'Chọn "Bạn đổ oan cho {PERSON_vi} rồi"', correct: '你冤枉{PERSON}了', distractors: ['你委屈{PERSON}了', '你委托{PERSON}了', '你冤家{PERSON}了'], explain: '冤枉 + người = vu oan; 委屈 người mang nghĩa "làm họ chịu thiệt", không phải "buộc tội sai".' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (đổ oan cho {PERSON_vi})?', correct: '你冤枉{PERSON}了。', errors: ['你委屈了{PERSON}冤枉。', '你委托{PERSON}冤枉了。', '你冤枉委屈{PERSON}。'], explain: '冤枉 đứng trước tân ngữ người, 了 ở cuối.' },
      { type: 'sentence_order', tokens: ['你', '冤枉', '{PERSON}', '了'], explain: '主语 + 冤枉 + 宾语(người) + 了: 你冤枉{PERSON}了.' },
      { type: 'fill_blank', frame: '受了很大的委屈，{FEEL.subj}哭了。({FEEL.subjvi} chịu ấm ức lớn nên khóc)', answer: '委屈', distractors: ['冤枉', '委托', '委员'], explain: '受委屈 = chịu ấm ức; 委屈 thiên cảm xúc tủi thân.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{FEEL.full}"', correct: '{FEEL.subj}感到很委屈', distractors: ['{FEEL.subj}感到很冤枉', '{FEEL.subj}感到很委托', '{FEEL.subj}感到很委员'], explain: '感到委屈 = cảm thấy tủi thân; đây là trạng thái cảm xúc.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{FEEL.subjvi} cảm thấy tủi thân")?', correct: '{FEEL.subj}感到很委屈。', errors: ['{FEEL.subj}感到很冤枉。', '{FEEL.subj}委屈感到很。', '{FEEL.subj}感到很委屈冤枉。'], explain: '感到 + 很 + 委屈; 委屈 chỉ cảm xúc, không thay bằng 冤枉.' },
      { type: 'sentence_order', tokens: ['{FEEL.subj}', '感到', '很', '委屈'], explain: 'Chủ ngữ + 感到 + 很 + 委屈: {FEEL.subj}感到很委屈.' },
      { type: 'fill_blank', frame: '{WASTE.thing}花得太___了。({WASTE.full})', answer: '冤枉', distractors: ['委屈', '委托', '冤家'], explain: '花得冤枉 = tiêu uổng phí; đây là nghĩa "uổng, phí" của 冤枉.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{WASTE.full}"', correct: '{WASTE.thing}花得太冤枉了', distractors: ['{WASTE.thing}花得太委屈了', '{WASTE.thing}花得太委托了', '{WASTE.thing}花得太委员了'], explain: '冤枉 mang nghĩa "uổng phí" cho tiền bạc/công sức; 委屈 chỉ cảm xúc, không dùng ở đây.' },
      { type: 'grammar_judge', prompt: 'Khác biệt cốt lõi giữa 冤枉 và 委屈?', correct: '冤枉 = bị buộc tội sai / uổng phí; 委屈 = cảm giác tủi thân bên trong', errors: ['Hai từ hoàn toàn đồng nghĩa, thay thế tự do', '冤枉 chỉ cảm xúc, 委屈 chỉ tiền bạc', '委屈 nghĩa là vu oan, 冤枉 nghĩa là tủi thân'], explain: '冤枉 thiên "oan/phí", 委屈 thiên "tủi thân, ấm ức".' },
      { type: 'sentence_order', tokens: ['她', '受', '了', '委屈'], explain: '受了委屈 = đã chịu ấm ức.' },
    ],
  },

  // ─── 2. Phân biệt 效果 / 结果 / 后果 ─────────────────
  {
    id: 'xiao-guo-jie-guo-hou-guo', title: 'Phân biệt 效果 / 结果 / 后果', level: 6,
    desc: '效果 (hiệu quả tích cực), 结果 (kết quả trung tính), 后果 (hậu quả tiêu cực)',
    category: 'vocabulary', partOfSpeech: 'Danh từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 6, phân biệt 效果 / 结果 / 后果' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Distinguishing "xiaoguo", "jieguo", "houguo"' },
    ],
    point: {
      structure: '效果 (tác dụng, thiên tốt) · 结果 (kết quả, trung tính) · 后果 (hậu quả, thiên xấu)',
      explain: '效果 (xiàoguǒ): tác dụng/hiệu quả do một biện pháp mang lại — thiên nghĩa tích cực (效果很好, 治疗效果). 结果 (jiéguǒ): kết quả cuối cùng của một quá trình — trung tính, có thể tốt hoặc xấu (比赛结果, 考试结果); còn dùng làm liên từ "kết cục là". 后果 (hòuguǒ): hậu quả — hầu như luôn TIÊU CỰC, đi với 严重/承担 (严重的后果, 承担后果).',
      examples: [
        { cn: '这个药的效果很好。', pinyin: 'Zhège yào de xiàoguǒ hěn hǎo.', vi: 'Thuốc này hiệu quả rất tốt.' },
        { cn: '比赛的结果出来了。', pinyin: 'Bǐsài de jiéguǒ chūlái le.', vi: 'Kết quả trận đấu đã có.' },
        { cn: '如果不小心，后果会很严重。', pinyin: 'Rúguǒ bù xiǎoxīn, hòuguǒ huì hěn yánzhòng.', vi: 'Nếu không cẩn thận, hậu quả sẽ rất nghiêm trọng.' },
      ],
      note: '效果 = tác dụng (thiên tốt); 结果 = kết quả (trung tính); 后果 = hậu quả (thiên xấu, đi với 严重/承担).',
    },
    slots: {
      // Ngữ cảnh cho 效果 (tác dụng tích cực do biện pháp mang lại).
      XIAO: [
        { ctx: '这个药', ctxvi: 'thuốc này', full: 'Tác dụng của thuốc này rất tốt' },
        { ctx: '新的教学方法', ctxvi: 'phương pháp dạy mới', full: 'Hiệu quả của phương pháp dạy mới rất tốt' },
        { ctx: '这种广告', ctxvi: 'kiểu quảng cáo này', full: 'Hiệu quả của kiểu quảng cáo này rất tốt' },
        { ctx: '这个治疗方案', ctxvi: 'phác đồ điều trị này', full: 'Hiệu quả của phác đồ điều trị này rất tốt' },
        { ctx: '锻炼', ctxvi: 'việc rèn luyện', full: 'Tác dụng của việc rèn luyện rất tốt' },
        { ctx: '这款护肤品', ctxvi: 'sản phẩm chăm sóc da này', full: 'Hiệu quả của sản phẩm chăm sóc da này rất tốt' },
        { ctx: '这次培训', ctxvi: 'đợt tập huấn này', full: 'Hiệu quả của đợt tập huấn này rất tốt' },
        { ctx: '这个方法', ctxvi: 'phương pháp này', full: 'Tác dụng của phương pháp này rất tốt' },
        { ctx: '这套复习计划', ctxvi: 'kế hoạch ôn tập này', full: 'Hiệu quả của kế hoạch ôn tập này rất tốt' },
        { ctx: '这种减肥方式', ctxvi: 'cách giảm cân này', full: 'Hiệu quả của cách giảm cân này rất tốt' },
      ],
      // Ngữ cảnh cho 结果 (kết quả trung tính của một quá trình).
      JIE: [
        { ctx: '比赛', ctxvi: 'trận đấu', full: 'Kết quả trận đấu đã có' },
        { ctx: '考试', ctxvi: 'kỳ thi', full: 'Kết quả kỳ thi đã có' },
        { ctx: '调查', ctxvi: 'cuộc điều tra', full: 'Kết quả cuộc điều tra đã có' },
        { ctx: '选举', ctxvi: 'cuộc bầu cử', full: 'Kết quả cuộc bầu cử đã có' },
        { ctx: '实验', ctxvi: 'thí nghiệm', full: 'Kết quả thí nghiệm đã có' },
        { ctx: '检查', ctxvi: 'cuộc kiểm tra', full: 'Kết quả cuộc kiểm tra đã có' },
        { ctx: '面试', ctxvi: 'buổi phỏng vấn', full: 'Kết quả buổi phỏng vấn đã có' },
        { ctx: '投票', ctxvi: 'cuộc bỏ phiếu', full: 'Kết quả cuộc bỏ phiếu đã có' },
        { ctx: '谈判', ctxvi: 'cuộc đàm phán', full: 'Kết quả cuộc đàm phán đã có' },
        { ctx: '抽签', ctxvi: 'buổi bốc thăm', full: 'Kết quả buổi bốc thăm đã có' },
      ],
      // Ngữ cảnh cho 后果 (hậu quả tiêu cực, nghiêm trọng).
      HOU: [
        { ctx: '酒后开车', ctxvi: 'lái xe sau khi uống rượu', full: 'Hậu quả của việc lái xe sau khi uống rượu rất nghiêm trọng' },
        { ctx: '乱砍树木', ctxvi: 'chặt phá cây bừa bãi', full: 'Hậu quả của việc chặt phá cây bừa bãi rất nghiêm trọng' },
        { ctx: '不遵守规则', ctxvi: 'không tuân thủ quy tắc', full: 'Hậu quả của việc không tuân thủ quy tắc rất nghiêm trọng' },
        { ctx: '乱用药', ctxvi: 'dùng thuốc bừa bãi', full: 'Hậu quả của việc dùng thuốc bừa bãi rất nghiêm trọng' },
        { ctx: '拖延治疗', ctxvi: 'trì hoãn điều trị', full: 'Hậu quả của việc trì hoãn điều trị rất nghiêm trọng' },
        { ctx: '污染环境', ctxvi: 'gây ô nhiễm môi trường', full: 'Hậu quả của việc gây ô nhiễm môi trường rất nghiêm trọng' },
        { ctx: '熬夜', ctxvi: 'thức khuya', full: 'Hậu quả của việc thức khuya rất nghiêm trọng' },
        { ctx: '轻信谣言', ctxvi: 'nhẹ dạ tin lời đồn', full: 'Hậu quả của việc nhẹ dạ tin lời đồn rất nghiêm trọng' },
        { ctx: '乱扔垃圾', ctxvi: 'vứt rác bừa bãi', full: 'Hậu quả của việc vứt rác bừa bãi rất nghiêm trọng' },
        { ctx: '偷税漏税', ctxvi: 'trốn thuế lậu thuế', full: 'Hậu quả của việc trốn thuế lậu thuế rất nghiêm trọng' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{XIAO.ctx}的___很好。({XIAO.full})', answer: '效果', distractors: ['后果', '结果', '效率'], explain: '效果 = tác dụng/hiệu quả tích cực do biện pháp mang lại; ở đây nghĩa tốt.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{XIAO.full}"', correct: '{XIAO.ctx}的效果很好', distractors: ['{XIAO.ctx}的后果很好', '{XIAO.ctx}的结果很好', '{XIAO.ctx}的效率很好'], explain: '效果很好 = tác dụng tốt; 后果 mang nghĩa xấu nên không hợp.' },
      { type: 'sentence_order', tokens: ['{XIAO.ctx}', '的', '效果', '很好'], explain: '…的效果很好: tác dụng tích cực.' },
      { type: 'fill_blank', frame: '{JIE.ctx}的___出来了。({JIE.full})', answer: '结果', distractors: ['效果', '后果', '成果'], explain: '结果 = kết quả cuối cùng của một quá trình, trung tính.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{JIE.full}"', correct: '{JIE.ctx}的结果出来了', distractors: ['{JIE.ctx}的效果出来了', '{JIE.ctx}的后果出来了', '{JIE.ctx}的效率出来了'], explain: '…的结果出来了: kết quả của quá trình, trung tính.' },
      { type: 'sentence_order', tokens: ['{JIE.ctx}', '的', '结果', '出来', '了'], explain: '…的结果出来了: kết quả cuối cùng đã có.' },
      { type: 'fill_blank', frame: '{HOU.ctx}的___很严重。({HOU.full})', answer: '后果', distractors: ['效果', '结果', '成果'], explain: '后果 = hậu quả tiêu cực, đi với 严重.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (kết hợp từ tự nhiên)?', correct: '{HOU.ctx}的后果很严重。', errors: ['{HOU.ctx}的效果很严重。', '{HOU.ctx}的成果很严重。', '{HOU.ctx}的效率很严重。'], explain: '后果 đi với 严重 (tiêu cực); 效果/成果 mang nghĩa tốt nên sai.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{HOU.full}"', correct: '{HOU.ctx}的后果很严重', distractors: ['{HOU.ctx}的效果很严重', '{HOU.ctx}的结果很严重', '{HOU.ctx}的效率很严重'], explain: '后果 + 很严重 là kết hợp tự nhiên cho ý tiêu cực.' },
      { type: 'fill_blank', frame: '你必须自己承担这个___。(tự gánh chịu hậu quả)', answer: '后果', distractors: ['效果', '结果', '效率'], explain: '承担后果 = gánh chịu hậu quả; 承担 hầu như chỉ đi với 后果.' },
      { type: 'meaning_to_char', prompt: 'Chọn "Hậu quả sẽ rất nghiêm trọng"', correct: '后果会很严重', distractors: ['效果会很严重', '结果会很严重', '成果会很严重'], explain: '严重的后果 là kết hợp cố định; 效果/结果 không đi tự nhiên với 严重.' },
      { type: 'grammar_judge', prompt: 'Từ nào mang sắc thái TIÊU CỰC nhất?', correct: '后果', errors: ['效果', '结果', '成果'], explain: '后果 hầu như luôn tiêu cực; 效果/成果 tích cực, 结果 trung tính.' },
      { type: 'grammar_judge', prompt: 'Từ nào TRUNG TÍNH (tốt hay xấu đều dùng được)?', correct: '结果', errors: ['效果', '后果', '效益'], explain: '结果 trung tính; 效果 thiên tốt, 后果 thiên xấu.' },
      { type: 'grammar_judge', prompt: 'Từ nào chỉ TÁC DỤNG tích cực do biện pháp mang lại?', correct: '效果', errors: ['后果', '结果', '结论'], explain: '效果 = tác dụng/hiệu quả (thiên tốt); 后果 xấu, 结果 trung tính.' },
    ],
  },
];
