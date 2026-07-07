// ============================================================
// GRAMMAR SPECS — HSK 5
// Mỗi cấu trúc là 1 spec: metadata + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, {NAME.field}) và 4 loại template.
// HSK 5 ở đây là các phó từ ngữ khí tinh tế — nhiều template + filler curated
// theo ngữ cảnh thật (đúng sắc thái). Chữ Hán luôn sạch, đúng.
// ============================================================

export const hsk5 = [
  // ─── 1. Phó từ ngữ khí 倒 (nâng cao) ────────────────
  {
    id: 'dao-advanced', title: 'Phó từ ngữ khí 倒 (nâng cao)', level: 5,
    desc: '倒 diễn tả sự trái với dự đoán, nhượng bộ, hoặc giọng phản bác nhẹ',
    category: 'adverb', partOfSpeech: 'Phó từ ngữ khí',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 5, phó từ ngữ khí 倒' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing contrast with "dao"' },
    ],
    point: {
      structure: '主语 + 倒 + 谓语',
      explain: '倒 (dào) là phó từ ngữ khí, đứng SAU chủ ngữ và TRƯỚC vị ngữ. Nó diễn tả: (1) điều trái với dự đoán ("hóa ra lại…"), (2) sự nhượng bộ ("thì cũng…, nhưng…"), (3) giọng phản bác/mỉa mai nhẹ ("ngược lại thì…"). Khác với 倒 (dǎo) nghĩa "ngã, đổ" — ở đây đọc dào và mang chức năng ngữ khí.',
      examples: [
        { cn: '这件衣服看起来一般，穿上倒挺好看。', pinyin: 'Zhè jiàn yīfu kàn qǐlái yìbān, chuān shàng dào tǐng hǎokàn.', vi: 'Cái áo này trông thường thôi, mặc vào hóa ra lại khá đẹp.' },
        { cn: '东西不贵，质量倒不错。', pinyin: 'Dōngxi bú guì, zhìliàng dào búcuò.', vi: 'Đồ không đắt, chất lượng lại khá tốt.' },
        { cn: '你说得倒容易，做起来就难了。', pinyin: 'Nǐ shuō de dào róngyì, zuò qǐlái jiù nán le.', vi: 'Anh nói thì dễ, làm mới khó.' },
      ],
      note: '倒 đứng sau chủ ngữ, trước vị ngữ. Không đặt cuối câu, không đặt trước chủ ngữ.',
    },
    slots: {
      // Mỗi SCENE là một tình huống "trái dự đoán" hoàn chỉnh: lead = mệnh đề
      // đầu (kỳ vọng thấp), subj = chủ ngữ mệnh đề sau, adj = vị ngữ (tích cực).
      // Ghép '{lead}，{subj}倒{adj}' luôn hợp nghĩa "…nhưng lại…".
      SCENE: [
        { lead: '东西不贵', subj: '质量', subjvi: 'chất lượng', adj: '不错', adjvi: 'khá tốt', full: 'Đồ không đắt, chất lượng lại khá tốt' },
        { lead: '房间不大', subj: '环境', subjvi: 'môi trường', adj: '很安静', adjvi: 'rất yên tĩnh', full: 'Phòng không to, môi trường lại rất yên tĩnh' },
        { lead: '这家店不起眼', subj: '菜', subjvi: 'món ăn', adj: '很好吃', adjvi: 'rất ngon', full: 'Quán này không nổi bật, món ăn lại rất ngon' },
        { lead: '天气预报说有雨', subj: '今天', subjvi: 'hôm nay', adj: '很晴朗', adjvi: 'rất quang đãng', full: 'Dự báo nói có mưa, hôm nay lại rất quang đãng' },
        { lead: '价格便宜', subj: '做工', subjvi: 'tay nghề gia công', adj: '很好', adjvi: 'rất tốt', full: 'Giá rẻ, tay nghề gia công lại rất tốt' },
        { lead: '他平时不爱说话', subj: '这次', subjvi: 'lần này', adj: '很健谈', adjvi: 'rất hoạt ngôn', full: 'Thường ngày anh ấy ít nói, lần này lại rất hoạt ngôn' },
        { lead: '工作很累', subj: '心情', subjvi: 'tâm trạng', adj: '不差', adjvi: 'không tệ', full: 'Công việc rất mệt, tâm trạng lại không tệ' },
        { lead: '考试很难', subj: '成绩', subjvi: 'điểm số', adj: '挺好', adjvi: 'khá ổn', full: 'Bài thi rất khó, điểm số lại khá ổn' },
        { lead: '他年纪不大', subj: '经验', subjvi: 'kinh nghiệm', adj: '很丰富', adjvi: 'rất phong phú', full: 'Anh ấy tuổi không lớn, kinh nghiệm lại rất phong phú' },
        { lead: '路很远', subj: '交通', subjvi: 'giao thông', adj: '很方便', adjvi: 'rất thuận tiện', full: 'Đường rất xa, giao thông lại rất thuận tiện' },
        { lead: '这本书很厚', subj: '内容', subjvi: 'nội dung', adj: '很有趣', adjvi: 'rất thú vị', full: 'Cuốn sách này rất dày, nội dung lại rất thú vị' },
        { lead: '房子很旧', subj: '位置', subjvi: 'vị trí', adj: '很好', adjvi: 'rất tốt', full: 'Nhà rất cũ, vị trí lại rất tốt' },
        { lead: '他嘴上不说', subj: '心里', subjvi: 'trong lòng', adj: '很清楚', adjvi: 'rất rõ', full: 'Miệng anh ấy không nói, trong lòng lại rất rõ' },
        { lead: '这道题看着简单', subj: '过程', subjvi: 'quá trình', adj: '很复杂', adjvi: 'rất phức tạp', full: 'Bài này nhìn thì đơn giản, quá trình lại rất phức tạp' },
        { lead: '天很冷', subj: '屋里', subjvi: 'trong nhà', adj: '很暖和', adjvi: 'rất ấm áp', full: 'Trời rất lạnh, trong nhà lại rất ấm áp' },
        { lead: '菜看起来一般', subj: '味道', subjvi: 'hương vị', adj: '很地道', adjvi: 'rất đúng vị', full: 'Món ăn nhìn thường thôi, hương vị lại rất đúng vị' },
        { lead: '这部手机不贵', subj: '功能', subjvi: 'chức năng', adj: '很全', adjvi: 'rất đầy đủ', full: 'Điện thoại này không đắt, chức năng lại rất đầy đủ' },
        { lead: '她学得晚', subj: '进步', subjvi: 'sự tiến bộ', adj: '很快', adjvi: 'rất nhanh', full: 'Cô ấy học muộn, tiến bộ lại rất nhanh' },
        { lead: '这条路不宽', subj: '车', subjvi: 'xe cộ', adj: '不多', adjvi: 'không nhiều', full: 'Con đường này không rộng, xe cộ lại không nhiều' },
        { lead: '任务很重', subj: '大家', subjvi: 'mọi người', adj: '不慌', adjvi: 'không hoảng', full: 'Nhiệm vụ rất nặng, mọi người lại không hoảng' },
        { lead: '价钱不高', subj: '服务', subjvi: 'dịch vụ', adj: '很周到', adjvi: 'rất chu đáo', full: 'Giá không cao, dịch vụ lại rất chu đáo' },
      ],
      GOOD: [
        { cn: '不错', vi: 'khá tốt' }, { cn: '好看', vi: 'đẹp' }, { cn: '便宜', vi: 'rẻ' },
        { cn: '安静', vi: 'yên tĩnh' }, { cn: '舒服', vi: 'thoải mái' }, { cn: '实用', vi: 'thực dụng' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SCENE.lead}，{SCENE.subj}___{SCENE.adj}。({SCENE.full})', answer: '倒', distractors: ['都', '才', '却'], explain: '倒 diễn tả điều trái với dự đoán, đứng sau chủ ngữ {SCENE.subj}, trước vị ngữ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SCENE.full}"', correct: '{SCENE.lead}，{SCENE.subj}倒{SCENE.adj}', distractors: ['{SCENE.lead}，{SCENE.subj}{SCENE.adj}倒', '{SCENE.lead}，倒{SCENE.subj}{SCENE.adj}', '{SCENE.lead}，{SCENE.subj}都{SCENE.adj}'], explain: '倒 đứng sau chủ ngữ ({SCENE.subj}), trước vị ngữ ({SCENE.adj}).' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (倒 chỉ điều trái dự đoán)?', correct: '{SCENE.subj}倒{SCENE.adj}。', errors: ['{SCENE.subj}{SCENE.adj}倒。', '倒{SCENE.subj}{SCENE.adj}。', '{SCENE.subj}倒倒{SCENE.adj}。'], explain: '倒 đứng ngay trước vị ngữ, không đặt cuối câu, không đặt trước chủ ngữ, không lặp.' },
      { type: 'sentence_order', tokens: ['{SCENE.subj}', '倒', '{SCENE.adj}'], explain: 'Chủ ngữ + 倒 + vị ngữ: {SCENE.subj}倒{SCENE.adj}.' },
      { type: 'fill_blank', frame: '这件衣服看起来一般，穿上___{GOOD}。(mặc vào hóa ra lại {GOOD_vi})', answer: '倒', distractors: ['也', '再', '就'], explain: '倒 nối ý trái ngược: nhìn thường nhưng mặc vào lại {GOOD_vi}.' },
      { type: 'fill_blank', frame: '你说得___容易，做起来就难了。(nói thì dễ)', answer: '倒', distractors: ['很', '太', '最'], explain: '倒 mang giọng phản bác nhẹ: "nói thì dễ (nhưng…)".' },
      { type: 'grammar_judge', prompt: 'Vị trí của 倒 trong câu là?', correct: 'Sau chủ ngữ, trước vị ngữ (谓语)', errors: ['Cuối câu, sau vị ngữ', 'Trước chủ ngữ, đầu câu', 'Chỉ dùng một mình, không cần vị ngữ'], explain: '倒 là phó từ ngữ khí, luôn đứng trước vị ngữ.' },
      { type: 'sentence_order', tokens: ['房间', '倒', '很', '安静'], explain: '倒 đứng trước cụm vị ngữ 很安静.' },
    ],
  },

  // ─── 2. Phó từ 很是 (nhấn mạnh) ─────────────────────
  {
    id: 'hen-shi-emphasis', title: 'Phó từ 很是 (nhấn mạnh)', level: 5,
    desc: '很是 nhấn mạnh mức độ mạnh hơn 很, mang sắc thái trang trọng/văn viết',
    category: 'adverb', partOfSpeech: 'Phó từ mức độ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 5, phó từ nhấn mạnh 很是' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Emphatic degree with "hen shi"' },
    ],
    point: {
      structure: '很是 + 形容词/心理动词',
      explain: '很是 (hěn shì) là phó từ mức độ, đứng TRƯỚC tính từ (thường hai âm tiết) hoặc động từ tâm lý, nhấn mạnh mạnh hơn 很 và mang sắc thái trang trọng, thiên văn viết. Thường đi với tính từ hai âm tiết (很是高兴, 很是担心); ít dùng với tính từ đơn âm ngắn.',
      examples: [
        { cn: '听到这个消息，他很是高兴。', pinyin: 'Tīng dào zhège xiāoxi, tā hěn shì gāoxìng.', vi: 'Nghe tin này, anh ấy rất đỗi vui mừng.' },
        { cn: '大家对结果很是满意。', pinyin: 'Dàjiā duì jiéguǒ hěn shì mǎnyì.', vi: 'Mọi người rất hài lòng với kết quả.' },
        { cn: '他最近很是忙碌。', pinyin: 'Tā zuìjìn hěn shì mánglù.', vi: 'Dạo này anh ấy khá là bận rộn.' },
      ],
      note: '很是 đứng TRƯỚC tính từ (khác 得很 đứng sau). Hợp với tính từ 2 âm tiết, văn viết.',
    },
    slots: {
      // Tính từ / động từ tâm lý hai âm tiết, hợp với 很是 (văn viết).
      ADJ: [
        { cn: '高兴', vi: 'vui mừng' }, { cn: '满意', vi: 'hài lòng' }, { cn: '担心', vi: 'lo lắng' },
        { cn: '着急', vi: 'sốt ruột' }, { cn: '生气', vi: 'tức giận' }, { cn: '奇怪', vi: 'kỳ lạ' },
        { cn: '忙碌', vi: 'bận rộn' }, { cn: '得意', vi: 'đắc ý' }, { cn: '感动', vi: 'cảm động' },
        { cn: '紧张', vi: 'căng thẳng' }, { cn: '兴奋', vi: 'phấn khích' }, { cn: '失望', vi: 'thất vọng' },
        { cn: '惊讶', vi: 'kinh ngạc' }, { cn: '苦恼', vi: 'khổ não' }, { cn: '为难', vi: 'khó xử' },
        { cn: '开心', vi: 'vui vẻ' }, { cn: '疲惫', vi: 'mệt mỏi' }, { cn: '满足', vi: 'mãn nguyện' },
      ],
      SUBJ: [
        { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' }, { cn: '老师', vi: 'giáo viên' },
        { cn: '大家', vi: 'mọi người' }, { cn: '父母', vi: 'cha mẹ' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '大家对结果___满意。(mọi người rất hài lòng — nhấn mạnh, văn viết)', answer: '很是', distractors: ['得很', '不得了', '极了'], explain: '很是 đứng TRƯỚC tính từ; 得很/不得了/极了 đều đứng SAU.' },
      { type: 'fill_blank', frame: '听到这个消息，{SUBJ}___{ADJ}。({SUBJ_vi} rất đỗi {ADJ_vi})', answer: '很是', distractors: ['是很', '很得', '得是'], explain: '很是 = phó từ nhấn mạnh, đứng trước tính từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nhấn mạnh "rất đỗi {ADJ_vi}" (văn viết)', correct: '很是{ADJ}', distractors: ['{ADJ}很是', '是很{ADJ}', '{ADJ}得很是'], explain: '很是 + tính từ; đứng trước, không đảo, không đặt sau.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu "{SUBJ_vi} rất đỗi {ADJ_vi}"', correct: '{SUBJ}很是{ADJ}', distractors: ['{SUBJ}{ADJ}很是', '{SUBJ}是很{ADJ}是', '{SUBJ}很是很{ADJ}'], explain: '很是 đứng ngay trước tính từ, không đảo, không lặp 很.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ("{SUBJ_vi} rất đỗi {ADJ_vi}")?', correct: '{SUBJ}很是{ADJ}。', errors: ['{SUBJ}{ADJ}很是。', '{SUBJ}是很{ADJ}很是。', '{SUBJ}很是很{ADJ}。'], explain: '很是 đứng trước tính từ, không lặp 很, không đặt sau.' },
      { type: 'grammar_judge', prompt: 'Điểm khác nhau giữa 很是 và 得很 về vị trí?', correct: '很是 đứng TRƯỚC tính từ, 得很 đứng SAU tính từ', errors: ['Cả hai đều đứng sau tính từ', 'Cả hai đều đứng trước tính từ', '很是 đứng cuối câu, 得很 đứng đầu câu'], explain: '很是{ADJ} (trước) ≠ {ADJ}得很 (sau).' },
      { type: 'meaning_to_char', prompt: 'Chọn "Mọi người rất hài lòng với kết quả"', correct: '大家对结果很是满意', distractors: ['大家对结果满意很是', '大家很是对结果是满意', '大家对结果是很满意很是'], explain: '很是 đứng ngay trước tính từ 满意.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '很是', '{ADJ}'], explain: 'Chủ ngữ + 很是 + tính từ: {SUBJ}很是{ADJ}.' },
      { type: 'sentence_order', tokens: ['大家', '很是', '满意'], explain: '很是 đứng trước tính từ hai âm tiết 满意.' },
    ],
  },
];
