// ============================================================
// DATA.JS — Comprehensive Chinese Learning Data
// Flashcards (30+), Chat Scenarios (4), Survival Guides (8),
// Quiz Questions (20+)
// All translations in Vietnamese for Vietnamese learners.
// ============================================================

// ============================================================
// 1. FLASHCARDS DATA — 30 cards across HSK 1–6
// ============================================================
export const flashcardsData = [
  // ─── HSK 1 (8 cards) ────────────────────────────────────
  {
    id: 1,
    character: '我',
    pinyin: 'wǒ',
    meaning: 'Tôi',
    hskLevel: 1,
    breakdown: [
      { radical: '手', meaning: 'Tay (Thủ — dạng biến thể)' },
      { radical: '戈', meaning: 'Cây mác / vũ khí (Qua)' }
    ],
    mnemonic: 'Bàn tay (手) cầm vũ khí (戈) để bảo vệ chính mình — đó là TÔI.',
    examples: [
      { cn: '我是越南人。', pinyin: 'Wǒ shì Yuènán rén.', vi: 'Tôi là người Việt Nam.' },
      { cn: '我今年二十岁。', pinyin: 'Wǒ jīnnián èrshí suì.', vi: 'Tôi năm nay 20 tuổi.' },
      { cn: '我爱我的家人。', pinyin: 'Wǒ ài wǒ de jiārén.', vi: 'Tôi yêu gia đình tôi.' },
    ],
    strokeCount: 7,
    category: 'pronoun'
  },
  {
    id: 2,
    character: '你',
    pinyin: 'nǐ',
    meaning: 'Bạn',
    hskLevel: 1,
    breakdown: [
      { radical: '亻', meaning: 'Người (Nhân)' },
      { radical: '尔', meaning: 'Ngươi / bạn (Nhĩ — cổ)' }
    ],
    mnemonic: 'Một người (亻) đứng cạnh và chỉ về phía ngươi (尔) — chính là BẠN.',
    examples: [
      { cn: '你叫什么名字？', pinyin: 'Nǐ jiào shénme míngzì?', vi: 'Bạn tên gì?' },
      { cn: '你是哪国人？', pinyin: 'Nǐ shì nǎ guó rén?', vi: 'Bạn là người nước nào?' },
      { cn: '你吃了吗？', pinyin: 'Nǐ chī le ma?', vi: 'Bạn ăn chưa?' },
    ],
    strokeCount: 7,
    category: 'pronoun'
  },
  {
    id: 3,
    character: '好',
    pinyin: 'hǎo',
    meaning: 'Tốt, Đẹp',
    hskLevel: 1,
    breakdown: [
      { radical: '女', meaning: 'Phụ nữ (Nữ)' },
      { radical: '子', meaning: 'Con cái (Tử)' }
    ],
    mnemonic: 'Phụ nữ (女) có con cái (子) bên cạnh — đó là điều TỐT ĐẸP nhất trên đời.',
    examples: [
      { cn: '你好吗？', pinyin: 'Nǐ hǎo ma?', vi: 'Bạn khỏe không?' },
      { cn: '这个电影很好。', pinyin: 'Zhège diànyǐng hěn hǎo.', vi: 'Bộ phim này rất hay.' },
      { cn: '你说得很好。', pinyin: 'Nǐ shuō de hěn hǎo.', vi: 'Bạn nói rất hay.' },
    ],
    strokeCount: 6,
    category: 'adjective'
  },
  {
    id: 4,
    character: '大',
    pinyin: 'dà',
    meaning: 'Lớn, To',
    hskLevel: 1,
    breakdown: [
      { radical: '大', meaning: 'Lớn (Đại) — tượng hình người dang rộng tay' }
    ],
    mnemonic: 'Một người dang hai tay ra rộng hết cỡ, thể hiện sự TO LỚN.',
    examples: [
      { cn: '中国很大。', pinyin: 'Zhōngguó hěn dà.', vi: 'Trung Quốc rất lớn.' },
      { cn: '这个西瓜很大。', pinyin: 'Zhège xīguā hěn dà.', vi: 'Quả dưa hấu này rất to.' },
      { cn: '我大的儿子很聪明。', pinyin: 'Wǒ dà de érzi hěn cōngmíng.', vi: 'Con trai lớn của tôi rất thông minh.' },
    ],
    strokeCount: 3,
    category: 'adjective'
  },
  {
    id: 5,
    character: '人',
    pinyin: 'rén',
    meaning: 'Người',
    hskLevel: 1,
    breakdown: [
      { radical: '人', meaning: 'Người (Nhân) — tượng hình người bước đi' }
    ],
    mnemonic: 'Hai nét tựa vào nhau như hai chân bước đi — đó là NGƯỜI.',
    examples: [
      { cn: '这个人很好。', pinyin: 'Zhège rén hěn hǎo.', vi: 'Người này rất tốt.' },
      { cn: '那边有两个人。', pinyin: 'Nà biān yǒu liǎng gè rén.', vi: 'Bên kia có hai người.' },
      { cn: '中国人很多。', pinyin: 'Zhōngguó rén hěn duō.', vi: 'Người Trung Quốc rất đông.' },
    ],
    strokeCount: 2,
    category: 'noun'
  },
  {
    id: 6,
    character: '水',
    pinyin: 'shuǐ',
    meaning: 'Nước',
    hskLevel: 1,
    breakdown: [
      { radical: '水', meaning: 'Nước (Thủy) — tượng hình dòng nước chảy' }
    ],
    mnemonic: 'Những giọt nước bắn tung tóe ra hai bên dòng chảy — đó là NƯỚC.',
    examples: [
      { cn: '请给我一杯水。', pinyin: 'Qǐng gěi wǒ yī bēi shuǐ.', vi: 'Xin cho tôi một cốc nước.' },
      { cn: '我想喝水。', pinyin: 'Wǒ xiǎng hē shuǐ.', vi: 'Tôi muốn uống nước.' },
      { cn: '水里有很多鱼。', pinyin: 'Shuǐ lǐ yǒu hěn duō yú.', vi: 'Trong nước có nhiều cá.' },
    ],
    strokeCount: 4,
    category: 'noun'
  },
  {
    id: 7,
    character: '中',
    pinyin: 'zhōng',
    meaning: 'Giữa, Trung',
    hskLevel: 1,
    breakdown: [
      { radical: '口', meaning: 'Miệng / ô vuông (Khẩu)' },
      { radical: '丨', meaning: 'Nét sổ dọc (Cổn)' }
    ],
    mnemonic: 'Một mũi tên (丨) cắm trúng chính giữa bia (口) — đó là TRUNG TÂM.',
    examples: [
      { cn: '我在学中文。', pinyin: 'Wǒ zài xué Zhōngwén.', vi: 'Tôi đang học tiếng Trung.' },
      { cn: '我们中午见。', pinyin: 'Wǒmen zhōngwǔ jiàn.', vi: 'Chúng ta gặp nhau trưa nay.' },
      { cn: '中心在那边。', pinyin: 'Zhōngxīn zài nà biān.', vi: 'Trung tâm ở bên kia.' },
    ],
    strokeCount: 4,
    category: 'noun'
  },
  {
    id: 8,
    character: '学',
    pinyin: 'xué',
    meaning: 'Học',
    hskLevel: 1,
    breakdown: [
      { radical: '⺍', meaning: 'Tay với lấy (Trảo biến thể)' },
      { radical: '冖', meaning: 'Mái che (Mịch)' },
      { radical: '子', meaning: 'Con cái (Tử)' }
    ],
    mnemonic: 'Đứa trẻ (子) ngồi dưới mái nhà (冖) giơ tay (⺍) nắm bắt kiến thức — đó là HỌC.',
    examples: [
      { cn: '我们一起学吧！', pinyin: 'Wǒmen yīqǐ xué ba!', vi: 'Chúng ta cùng học đi!' },
      { cn: '他在学汉语。', pinyin: 'Tā zài xué Hànyǔ.', vi: 'Anh ấy đang học tiếng Hán.' },
      { cn: '学中文很有趣。', pinyin: 'Xué Zhōngwén hěn yǒuqù.', vi: 'Học tiếng Trung rất thú vị.' },
    ],
    strokeCount: 8,
    category: 'verb'
  },

  // ─── HSK 2 (5 cards) ────────────────────────────────────
  {
    id: 9,
    character: '休',
    pinyin: 'xiū',
    meaning: 'Nghỉ ngơi',
    hskLevel: 2,
    breakdown: [
      { radical: '亻', meaning: 'Người (Nhân)' },
      { radical: '木', meaning: 'Cây (Mộc)' }
    ],
    mnemonic: 'Một người (亻) tựa lưng vào gốc cây (木) — hình ảnh NGHỈ NGƠI thật lý tưởng.',
    examples: [
      { cn: '你应该休息一下。', pinyin: 'Nǐ yīnggāi xiūxi yíxià.', vi: 'Bạn nên nghỉ ngơi một chút.' },
      { cn: '周末我在家休息。', pinyin: 'Zhōumò wǒ zài jiā xiūxi.', vi: 'Cuối tuần tôi ở nhà nghỉ ngơi.' },
      { cn: '休息好了吗？', pinyin: 'Xiūxi hǎo le ma?', vi: 'Nghỉ ngơi tốt chưa?' },
    ],
    strokeCount: 6,
    category: 'verb'
  },
  {
    id: 10,
    character: '走',
    pinyin: 'zǒu',
    meaning: 'Đi, Đi bộ',
    hskLevel: 2,
    breakdown: [
      { radical: '土', meaning: 'Đất (Thổ)' },
      { radical: '止', meaning: 'Dừng / bàn chân (Chỉ — biến thể)' }
    ],
    mnemonic: 'Bàn chân (止) bước trên mặt đất (土) — đó là ĐI.',
    examples: [
      { cn: '我们走吧！', pinyin: 'Wǒmen zǒu ba!', vi: 'Chúng ta đi thôi!' },
      { cn: '我走路去上学。', pinyin: 'Wǒ zǒulù qù shàngxué.', vi: 'Tôi đi bộ đến trường.' },
      { cn: '你走得太快了。', pinyin: 'Nǐ zǒu de tài kuài le.', vi: 'Bạn đi nhanh quá.' },
    ],
    strokeCount: 7,
    category: 'verb'
  },
  {
    id: 11,
    character: '买',
    pinyin: 'mǎi',
    meaning: 'Mua',
    hskLevel: 2,
    breakdown: [
      { radical: '乛', meaning: 'Nét ngang móc' },
      { radical: '头', meaning: 'Đầu (Đầu — giản thể)' }
    ],
    mnemonic: 'Bỏ tiền ra để lấy hàng về — nghĩ đến việc MUA sắm là thấy vui.',
    examples: [
      { cn: '我想买这个。', pinyin: 'Wǒ xiǎng mǎi zhège.', vi: 'Tôi muốn mua cái này.' },
      { cn: '他在买衣服。', pinyin: 'Tā zài mǎi yīfu.', vi: 'Anh ấy đang mua quần áo.' },
      { cn: '买东西要比较价格。', pinyin: 'Mǎi dōngxi yào bǐjiào jiàgé.', vi: 'Mua đồ phải so sánh giá.' },
    ],
    strokeCount: 6,
    category: 'verb'
  },
  {
    id: 12,
    character: '吃',
    pinyin: 'chī',
    meaning: 'Ăn',
    hskLevel: 2,
    breakdown: [
      { radical: '口', meaning: 'Miệng (Khẩu)' },
      { radical: '乞', meaning: 'Xin / cầu (Khất)' }
    ],
    mnemonic: 'Miệng (口) đang xin (乞) đồ ăn — đó là hành động ĂN.',
    examples: [
      { cn: '你想吃什么？', pinyin: 'Nǐ xiǎng chī shénme?', vi: 'Bạn muốn ăn gì?' },
      { cn: '我吃了午饭。', pinyin: 'Wǒ chī le wǔfàn.', vi: 'Tôi đã ăn trưa rồi.' },
      { cn: '一起吃饭吧。', pinyin: 'Yīqǐ chīfàn ba.', vi: 'Cùng ăn cơm nhé.' },
    ],
    strokeCount: 6,
    category: 'verb'
  },
  {
    id: 13,
    character: '说',
    pinyin: 'shuō',
    meaning: 'Nói',
    hskLevel: 2,
    breakdown: [
      { radical: '讠', meaning: 'Lời nói (Ngôn — giản thể)' },
      { radical: '兑', meaning: 'Đổi (Đoài)' }
    ],
    mnemonic: 'Dùng lời nói (讠) để trao đổi (兑) ý kiến — đó là NÓI.',
    examples: [
      { cn: '请你说慢一点。', pinyin: 'Qǐng nǐ shuō màn yīdiǎn.', vi: 'Xin bạn nói chậm một chút.' },
      { cn: '他会说三种语言。', pinyin: 'Tā huì shuō sān zhǒng yǔyán.', vi: 'Anh ấy nói được ba thứ tiếng.' },
      { cn: '你说得对。', pinyin: 'Nǐ shuō de duì.', vi: 'Bạn nói đúng.' },
    ],
    strokeCount: 9,
    category: 'verb'
  },

  // ─── HSK 3 (5 cards) ────────────────────────────────────
  {
    id: 14,
    character: '茶',
    pinyin: 'chá',
    meaning: 'Trà',
    hskLevel: 3,
    breakdown: [
      { radical: '艹', meaning: 'Cỏ (Thảo)' },
      { radical: '人', meaning: 'Người (Nhân)' },
      { radical: '木', meaning: 'Cây (Mộc)' }
    ],
    mnemonic: 'Người (人) đứng giữa cỏ (艹) và cây (木) để hái lá pha TRÀ.',
    examples: [
      { cn: '你喜欢喝什么茶？', pinyin: 'Nǐ xǐhuān hē shénme chá?', vi: 'Bạn thích uống trà gì?' },
      { cn: '请给我一杯茶。', pinyin: 'Qǐng gěi wǒ yī bēi chá.', vi: 'Làm ơn cho tôi một tách trà.' },
      { cn: '茶很热。', pinyin: 'Chá hěn rè.', vi: 'Trà rất nóng.' },
    ],
    strokeCount: 9,
    category: 'noun'
  },
  {
    id: 15,
    character: '花',
    pinyin: 'huā',
    meaning: 'Hoa',
    hskLevel: 3,
    breakdown: [
      { radical: '艹', meaning: 'Cỏ (Thảo)' },
      { radical: '化', meaning: 'Biến hóa (Hóa)' }
    ],
    mnemonic: 'Từ cỏ (艹) biến hóa (化) thành cánh HOA rực rỡ.',
    examples: [
      { cn: '这朵花很漂亮。', pinyin: 'Zhè duǒ huā hěn piàoliang.', vi: 'Bông hoa này rất đẹp.' },
      { cn: '他送花给女朋友。', pinyin: 'Tā sòng huā gěi nǚpéngyou.', vi: 'Anh ấy tặng hoa cho bạn gái.' },
      { cn: '春天花开。', pinyin: 'Chūntiān huā kāi.', vi: 'Mùa xuân hoa nở.' },
    ],
    strokeCount: 7,
    category: 'noun'
  },
  {
    id: 16,
    character: '鸡',
    pinyin: 'jī',
    meaning: 'Gà',
    hskLevel: 3,
    breakdown: [
      { radical: '又', meaning: 'Lại (Hựu)' },
      { radical: '鸟', meaning: 'Chim (Điểu)' }
    ],
    mnemonic: 'Con chim (鸟) mà cứ kêu "cục cục" liên tục (又) — đó là con GÀ.',
    examples: [
      { cn: '我喜欢吃鸡肉。', pinyin: 'Wǒ xǐhuān chī jīròu.', vi: 'Tôi thích ăn thịt gà.' },
      { cn: '早上公鸡打鸣。', pinyin: 'Zǎoshang gōngjī dǎmíng.', vi: 'Buổi sáng gà trống gáy.' },
      { cn: '鸡蛋很营养。', pinyin: 'Jīdàn hěn yíngyǎng.', vi: 'Trứng gà rất bổ dưỡng.' },
    ],
    strokeCount: 7,
    category: 'noun'
  },
  {
    id: 17,
    character: '猫',
    pinyin: 'māo',
    meaning: 'Mèo',
    hskLevel: 3,
    breakdown: [
      { radical: '犭', meaning: 'Thú vật (Khuyển — biến thể)' },
      { radical: '苗', meaning: 'Mầm non (Miêu)' }
    ],
    mnemonic: 'Con thú (犭) nhỏ nhắn như mầm non (苗) — đó là con MÈO dễ thương.',
    examples: [
      { cn: '她家有三只猫。', pinyin: 'Tā jiā yǒu sān zhī māo.', vi: 'Nhà cô ấy có ba con mèo.' },
      { cn: '猫很可爱。', pinyin: 'Māo hěn kě ài.', vi: 'Mèo rất dễ thương.' },
      { cn: '你的猫叫什么名字？', pinyin: 'Nǐ de māo jiào shénme míngzi?', vi: 'Mèo của bạn tên gì?' },
    ],
    strokeCount: 11,
    category: 'noun'
  },
  {
    id: 18,
    character: '鱼',
    pinyin: 'yú',
    meaning: 'Cá',
    hskLevel: 3,
    breakdown: [
      { radical: '鱼', meaning: 'Cá (Ngư) — tượng hình con cá có đầu, thân, đuôi' }
    ],
    mnemonic: 'Hình dáng chữ giống con cá bơi trong nước, trên là đầu, giữa là thân, dưới là đuôi — CÁ.',
    examples: [
      { cn: '今天的鱼很新鲜。', pinyin: 'Jīntiān de yú hěn xīnxiān.', vi: 'Cá hôm nay rất tươi.' },
      { cn: '我喜欢吃鱼。', pinyin: 'Wǒ xǐhuān chī yú.', vi: 'Tôi thích ăn cá.' },
      { cn: '水里有很多鱼。', pinyin: 'Shuǐ lǐ yǒu hěn duō yú.', vi: 'Trong nước có nhiều cá.' },
    ],
    strokeCount: 8,
    category: 'noun'
  },

  // ─── HSK 4 (5 cards) ────────────────────────────────────
  {
    id: 19,
    character: '赢',
    pinyin: 'yíng',
    meaning: 'Thắng, Chiến thắng',
    hskLevel: 4,
    breakdown: [
      { radical: '亡', meaning: 'Chết (Vong)' },
      { radical: '口', meaning: 'Miệng (Khẩu)' },
      { radical: '月', meaning: 'Mặt trăng / thịt (Nguyệt)' },
      { radical: '贝', meaning: 'Vỏ sò / tiền (Bối)' },
      { radical: '凡', meaning: 'Bình phàm (Phàm)' }
    ],
    mnemonic: 'Để THẮNG, cần: ý chí không sợ chết (亡), giao tiếp giỏi (口), sức khỏe (月), tiền bạc (贝) và tâm thái bình thường (凡).',
    exampleSentence: '我们赢了比赛！',
    examplePinyin: 'Wǒmen yíng le bǐsài!',
    exampleVi: 'Chúng tôi đã thắng trận đấu!',
    strokeCount: 17,
    category: 'verb'
  },
  {
    id: 20,
    character: '输',
    pinyin: 'shū',
    meaning: 'Thua',
    hskLevel: 4,
    breakdown: [
      { radical: '车', meaning: 'Xe (Xa)' },
      { radical: '俞', meaning: 'Thuyền rỗng (Du)' }
    ],
    mnemonic: 'Xe (车) chở hàng đi mất hết, thuyền cũng rỗng (俞) — THUA trắng tay.',
    exampleSentence: '这次我们输了。',
    examplePinyin: 'Zhè cì wǒmen shū le.',
    exampleVi: 'Lần này chúng tôi thua rồi.',
    strokeCount: 12,
    category: 'verb'
  },
  {
    id: 21,
    character: '竞',
    pinyin: 'jìng',
    meaning: 'Cạnh tranh, Thi đấu',
    hskLevel: 4,
    breakdown: [
      { radical: '立', meaning: 'Đứng (Lập)' },
      { radical: '兄', meaning: 'Anh (Huynh)' }
    ],
    mnemonic: 'Hai anh em (兄) cùng đứng (立) lên tranh tài — đó là CẠNH TRANH.',
    exampleSentence: '竞争非常激烈。',
    examplePinyin: 'Jìngzhēng fēicháng jīliè.',
    exampleVi: 'Cạnh tranh cực kỳ khốc liệt.',
    strokeCount: 10,
    category: 'verb'
  },
  {
    id: 22,
    character: '梦',
    pinyin: 'mèng',
    meaning: 'Giấc mơ',
    hskLevel: 4,
    breakdown: [
      { radical: '林', meaning: 'Rừng (Lâm)' },
      { radical: '夕', meaning: 'Buổi tối (Tịch)' }
    ],
    mnemonic: 'Buổi tối (夕) nằm trong rừng (林) ngủ say — bắt đầu mơ GIẤC MƠ kỳ diệu.',
    exampleSentence: '我的梦想是当老师。',
    examplePinyin: 'Wǒ de mèngxiǎng shì dāng lǎoshī.',
    exampleVi: 'Ước mơ của tôi là làm giáo viên.',
    strokeCount: 11,
    category: 'noun'
  },
  {
    id: 23,
    character: '愿',
    pinyin: 'yuàn',
    meaning: 'Nguyện, Mong muốn',
    hskLevel: 4,
    breakdown: [
      { radical: '原', meaning: 'Nguồn gốc / đồng bằng (Nguyên)' },
      { radical: '心', meaning: 'Trái tim (Tâm)' }
    ],
    mnemonic: 'Điều mong muốn gốc rễ (原) từ đáy lòng trái tim (心) — đó là NGUYỆN VỌNG.',
    exampleSentence: '我愿意帮助你。',
    examplePinyin: 'Wǒ yuànyì bāngzhù nǐ.',
    exampleVi: 'Tôi sẵn lòng giúp bạn.',
    strokeCount: 14,
    category: 'verb'
  },

  // ─── HSK 5 (4 cards) ────────────────────────────────────
  {
    id: 24,
    character: '糟糕',
    pinyin: 'zāogāo',
    meaning: 'Tồi tệ, Hỏng bét',
    hskLevel: 5,
    breakdown: [
      { radical: '米', meaning: 'Gạo (Mễ)' },
      { radical: '曹', meaning: 'Bọn / nhóm (Tào)' },
      { radical: '羔', meaning: 'Cừu non (Cao)' }
    ],
    mnemonic: 'Gạo (米) để lâu bị lên men hỏng, bánh (糕) làm từ đó cũng hỏng theo — TỒI TỆ, HỎNG BÉT!',
    exampleSentence: '糟糕！我忘带钱包了。',
    examplePinyin: 'Zāogāo! Wǒ wàng dài qiánbāo le.',
    exampleVi: 'Tệ quá! Tôi quên mang ví rồi.',
    strokeCount: 25,
    category: 'adjective'
  },
  {
    id: 25,
    character: '尴尬',
    pinyin: 'gāngà',
    meaning: 'Ngượng ngùng, Lúng túng',
    hskLevel: 5,
    breakdown: [
      { radical: '尢', meaning: 'Khập khiễng (Uông)' },
      { radical: '監/介', meaning: 'Giám sát / ở giữa' }
    ],
    mnemonic: 'Bước đi khập khiễng (尢) bị mọi người nhìn (監) — cảm giác NGƯỢNG NGÙNG, LÚNG TÚNG vô cùng.',
    exampleSentence: '那个场面很尴尬。',
    examplePinyin: 'Nàge chǎngmiàn hěn gāngà.',
    exampleVi: 'Cảnh tượng đó rất ngượng ngùng.',
    strokeCount: 22,
    category: 'adjective'
  },
  {
    id: 26,
    character: '奋斗',
    pinyin: 'fèndòu',
    meaning: 'Phấn đấu',
    hskLevel: 5,
    breakdown: [
      { radical: '大', meaning: 'Lớn (Đại)' },
      { radical: '田', meaning: 'Ruộng (Điền)' },
      { radical: '斗', meaning: 'Đấu / chiến đấu (Đấu)' }
    ],
    mnemonic: 'Người lớn (大) ra ruộng (田) chiến đấu (斗) cật lực — đó là PHẤN ĐẤU.',
    exampleSentence: '我们要为未来奋斗。',
    examplePinyin: 'Wǒmen yào wèi wèilái fèndòu.',
    exampleVi: 'Chúng ta phải phấn đấu vì tương lai.',
    strokeCount: 12,
    category: 'verb'
  },
  {
    id: 27,
    character: '繁荣',
    pinyin: 'fánróng',
    meaning: 'Phồn vinh, Thịnh vượng',
    hskLevel: 5,
    breakdown: [
      { radical: '敏', meaning: 'Nhanh nhạy (Mẫn)' },
      { radical: '糸', meaning: 'Tơ lụa (Mịch)' },
      { radical: '艹', meaning: 'Cỏ (Thảo)' },
      { radical: '木', meaning: 'Cây (Mộc)' }
    ],
    mnemonic: 'Tơ lụa (糸) dệt phức tạp tinh xảo (繁), cây cối (木) mọc xanh tươi (荣) — một xã hội PHỒN VINH, THỊNH VƯỢNG.',
    exampleSentence: '这个城市越来越繁荣。',
    examplePinyin: 'Zhège chéngshì yuèláiyuè fánróng.',
    exampleVi: 'Thành phố này ngày càng phồn vinh.',
    strokeCount: 23,
    category: 'adjective'
  },

  // ─── HSK 6 (3 cards) ────────────────────────────────────
  {
    id: 28,
    character: '渊博',
    pinyin: 'yuānbó',
    meaning: 'Uyên bác, Sâu rộng',
    hskLevel: 6,
    breakdown: [
      { radical: '氵', meaning: 'Nước (Thủy)' },
      { radical: '米', meaning: 'Gạo (Mễ)' },
      { radical: '十', meaning: 'Mười (Thập)' },
      { radical: '寸', meaning: 'Tấc (Thốn)' }
    ],
    mnemonic: 'Kiến thức sâu như vực nước (渊) và rộng lớn bao la (博) — đó là sự UYÊN BÁC.',
    exampleSentence: '他的知识非常渊博。',
    examplePinyin: 'Tā de zhīshì fēicháng yuānbó.',
    exampleVi: 'Kiến thức của anh ấy cực kỳ uyên bác.',
    strokeCount: 23,
    category: 'adjective'
  },
  {
    id: 29,
    character: '瞻仰',
    pinyin: 'zhānyǎng',
    meaning: 'Chiêm ngưỡng, Ngưỡng mộ nhìn lên',
    hskLevel: 6,
    breakdown: [
      { radical: '目', meaning: 'Mắt (Mục)' },
      { radical: '詹', meaning: 'Nói nhiều (Chiêm)' },
      { radical: '亻', meaning: 'Người (Nhân)' },
      { radical: '卬', meaning: 'Ngẩng lên (Ngang)' }
    ],
    mnemonic: 'Mắt (目) ngước lên cao để chiêm (瞻), người (亻) ngẩng đầu lên ngưỡng mộ (仰) — CHIÊM NGƯỠNG.',
    exampleSentence: '我们去瞻仰了烈士陵园。',
    examplePinyin: 'Wǒmen qù zhānyǎng le lièshì língyuán.',
    exampleVi: 'Chúng tôi đã đi chiêm ngưỡng nghĩa trang liệt sĩ.',
    strokeCount: 24,
    category: 'verb'
  },
  {
    id: 30,
    character: '磅礴',
    pinyin: 'pángbó',
    meaning: 'Bàng bạc, Hùng vĩ, Hoành tráng',
    hskLevel: 6,
    breakdown: [
      { radical: '石', meaning: 'Đá (Thạch)' },
      { radical: '旁', meaning: 'Bên cạnh (Bàng)' },
      { radical: '薄', meaning: 'Mỏng / rộng (Bạc — biến thể)' }
    ],
    mnemonic: 'Những tảng đá (石) khổng lồ trải rộng bao la (旁/薄) tạo nên cảnh tượng HÙNG VĨ, HOÀNH TRÁNG.',
    examples: [
      { cn: '长城气势磅礴。', pinyin: 'Chángchéng qìshì pángbó.', vi: 'Vạn Lý Trường Thành có khí thế hùng vĩ.' },
      { cn: '这首歌磅礴有力。', pinyin: 'Zhè shǒu gē pángbó yǒulì.', vi: 'Bài hát này hùng tráng mạnh mẽ.' },
      { cn: '磅礴的山脉。', pinyin: 'Pángbó de shānmài.', vi: 'Dãy núi hùng vĩ.' },
    ],
    strokeCount: 31,
    category: 'adjective'
  },

  // ─── NEW HSK 1 (7 cards) ─────────────────────────────────
  {
    id: 31, character: '不', pinyin: 'bù', meaning: 'Không', hskLevel: 1, category: 'adverb', strokeCount: 4,
    examples: [
      { cn: '这不是我的。', pinyin: 'Zhè bù shì wǒ de.', vi: 'Đây không phải của tôi.' },
      { cn: '我不想去。', pinyin: 'Wǒ bù xiǎng qù.', vi: 'Tôi không muốn đi.' },
      { cn: '不好吃。', pinyin: 'Bù hǎochī.', vi: 'Không ngon.' },
    ],
    breakdown: [{ radical: '一', meaning: 'Một (Nhất)' }, { radical: '小', meaning: 'Nhỏ (Tiểu)' }],
    mnemonic: 'Một (一) gạch ngang rồi hất lên — phủ định KHÔNG.'
  },
  {
    id: 32, character: '一', pinyin: 'yī', meaning: 'Một', hskLevel: 1, category: 'noun', strokeCount: 1,
    examples: [
      { cn: '我有一本书。', pinyin: 'Wǒ yǒu yī běn shū.', vi: 'Tôi có một quyển sách.' },
      { cn: '一个人。', pinyin: 'Yī gè rén.', vi: 'Một người.' },
      { cn: '第一课。', pinyin: 'Dì yī kè.', vi: 'Bài học thứ nhất.' },
    ],
    breakdown: [{ radical: '一', meaning: 'Một (Nhất) — tượng hình một nét ngang' }],
    mnemonic: 'Một nét ngang đơn giản — là số MỘT.'
  },
  {
    id: 33, character: '是', pinyin: 'shì', meaning: 'Là', hskLevel: 1, category: 'verb', strokeCount: 9,
    examples: [
      { cn: '我是越南人。', pinyin: 'Wǒ shì Yuènán rén.', vi: 'Tôi là người Việt Nam.' },
      { cn: '这是书。', pinyin: 'Zhè shì shū.', vi: 'Đây là sách.' },
      { cn: '他是老师。', pinyin: 'Tā shì lǎoshī.', vi: 'Anh ấy là giáo viên.' },
    ],
    breakdown: [{ radical: '日', meaning: 'Mặt trời / ngày (Nhật)' }, { radical: '正', meaning: 'Chính / đúng (Chính)' }],
    mnemonic: 'Mặt trời (日) chiếu sáng đúng (正) — đó LÀ sự thật.'
  },
  {
    id: 34, character: '有', pinyin: 'yǒu', meaning: 'Có', hskLevel: 1, category: 'verb', strokeCount: 6,
    examples: [
      { cn: '她有一只猫。', pinyin: 'Tā yǒu yī zhī māo.', vi: 'Cô ấy có một con mèo.' },
      { cn: '他有钱。', pinyin: 'Tā yǒu qián.', vi: 'Anh ấy có tiền.' },
      { cn: '有没有时间？', pinyin: 'Yǒu méiyǒu shíjiān?', vi: 'Có thời gian không?' },
    ],
    breakdown: [{ radical: '月', meaning: 'Thịt (Nguyệt)' }, { radical: '又', meaning: 'Lại (Hựu)' }],
    mnemonic: 'Tay (又) cầm miếng thịt (月) — CÓ đồ ăn trong tay.'
  },
  {
    id: 35, character: '去', pinyin: 'qù', meaning: 'Đi (đến)', hskLevel: 1, category: 'verb', strokeCount: 5,
    examples: [
      { cn: '你去哪儿？', pinyin: 'Nǐ qù nǎr?', vi: 'Bạn đi đâu?' },
      { cn: '我去学校。', pinyin: 'Wǒ qù xuéxiào.', vi: 'Tôi đi học.' },
      { cn: '我们一起去。', pinyin: 'Wǒmen yīqǐ qù.', vi: 'Chúng ta cùng đi.' },
    ],
    breakdown: [{ radical: '土', meaning: 'Đất (Thổ)' }, { radical: '厶', meaning: 'Riêng tư (Tư)' }],
    mnemonic: 'Rời khỏi mặt đất (土) đi đến nơi riêng (厶) — ĐI đến chỗ khác.'
  },
  {
    id: 36, character: '来', pinyin: 'lái', meaning: 'Đến', hskLevel: 1, category: 'verb', strokeCount: 7,
    examples: [
      { cn: '他来越南了。', pinyin: 'Tā lái Yuènán le.', vi: 'Anh ấy đến Việt Nam rồi.' },
      { cn: '快来这里！', pinyin: 'Kuài lái zhèlǐ!', vi: 'Nhanh đến đây!' },
      { cn: '明天来我家。', pinyin: 'Míngtiān lái wǒ jiā.', vi: 'Ngày mai đến nhà tôi.' },
    ],
    breakdown: [{ radical: '木', meaning: 'Cây (Mộc)' }, { radical: '从', meaning: 'Từ / theo (Tòng)' }],
    mnemonic: 'Cây (木) từ đâu ĐẾN đây? Hình dáng chữ giống cây thập giá.'
  },
  {
    id: 37, character: '小', pinyin: 'xiǎo', meaning: 'Nhỏ, Bé', hskLevel: 1, category: 'adjective', strokeCount: 3,
    examples: [
      { cn: '这只猫很小。', pinyin: 'Zhè zhī māo hěn xiǎo.', vi: 'Con mèo này rất nhỏ.' },
      { cn: '我小时候。', pinyin: 'Wǒ xiǎo shíhou.', vi: 'Lúc tôi còn nhỏ.' },
      { cn: '小意思。', pinyin: 'Xiǎo yìsi.', vi: 'Chút ý nhỏ.' },
    ],
    breakdown: [{ radical: '小', meaning: 'Nhỏ (Tiểu) — tượng hình 3 chấm nhỏ' }],
    mnemonic: 'Ba chấm nhỏ xíu — đó là NHỎ, BÉ.'
  },

  // ─── NEW HSK 2 (6 cards) ─────────────────────────────────
  {
    id: 38, character: '看', pinyin: 'kàn', meaning: 'Xem, Nhìn', hskLevel: 2, category: 'verb', strokeCount: 9,
    examples: [
      { cn: '请看这里。', pinyin: 'Qǐng kàn zhèlǐ.', vi: 'Xin nhìn đây.' },
      { cn: '我看电视。', pinyin: 'Wǒ kàn diànshì.', vi: 'Tôi xem tivi.' },
      { cn: '看书。', pinyin: 'Kàn shū.', vi: 'Đọc sách.' },
    ],
    breakdown: [{ radical: '手', meaning: 'Tay (Thủ)' }, { radical: '目', meaning: 'Mắt (Mục)' }],
    mnemonic: 'Tay (手) che trên mắt (目) để NHÌN xa.'
  },
  {
    id: 39, character: '听', pinyin: 'tīng', meaning: 'Nghe', hskLevel: 2, category: 'verb', strokeCount: 7,
    examples: [
      { cn: '请听我说。', pinyin: 'Qǐng tīng wǒ shuō.', vi: 'Xin hãy nghe tôi nói.' },
      { cn: '我听不懂。', pinyin: 'Wǒ tīng bù dǒng.', vi: 'Tôi nghe không hiểu.' },
      { cn: '听音乐。', pinyin: 'Tīng yīnyuè.', vi: 'Nghe nhạc.' },
    ],
    breakdown: [{ radical: '口', meaning: 'Miệng (Khẩu)' }, { radical: '斤', meaning: 'Cân / rìu (Cân)' }],
    mnemonic: 'Miệng (口) nói, tai NGHE — âm thanh nặng như cân (斤).'
  },
  {
    id: 40, character: '写', pinyin: 'xiě', meaning: 'Viết', hskLevel: 2, category: 'verb', strokeCount: 5,
    examples: [
      { cn: '请写你的名字。', pinyin: 'Qǐng xiě nǐ de míngzì.', vi: 'Xin hãy viết tên bạn.' },
      { cn: '我写信。', pinyin: 'Wǒ xiě xìn.', vi: 'Tôi viết thư.' },
      { cn: '写错了。', pinyin: 'Xiě cuò le.', vi: 'Viết sai rồi.' },
    ],
    breakdown: [{ radical: '冖', meaning: 'Mái che (Mịch)' }, { radical: '与', meaning: 'Cùng với (Dữ)' }],
    mnemonic: 'Dưới mái nhà (冖), tay cầm bút VIẾT chữ.'
  },
  {
    id: 41, character: '读', pinyin: 'dú', meaning: 'Đọc', hskLevel: 2, category: 'verb', strokeCount: 10,
    examples: [
      { cn: '请读这段话。', pinyin: 'Qǐng dú zhè duàn huà.', vi: 'Xin hãy đọc đoạn này.' },
      { cn: '我读完了。', pinyin: 'Wǒ dú wán le.', vi: 'Tôi đã đọc xong.' },
      { cn: '读课文。', pinyin: 'Dú kèwén.', vi: 'Đọc bài khóa.' },
    ],
    breakdown: [{ radical: '讠', meaning: 'Lời nói (Ngôn)' }, { radical: '卖', meaning: 'Bán (Mại)' }],
    mnemonic: 'Lời nói (讠) ĐƯỢC bán (卖) ra — đó là ĐỌC to.'
  },
  {
    id: 42, character: '坐', pinyin: 'zuò', meaning: 'Ngồi', hskLevel: 2, category: 'verb', strokeCount: 7,
    examples: [
      { cn: '请坐。', pinyin: 'Qǐng zuò.', vi: 'Mời ngồi.' },
      { cn: '我坐车去。', pinyin: 'Wǒ zuò chē qù.', vi: 'Tôi đi xe đến.' },
      { cn: '坐下吧。', pinyin: 'Zuò xià ba.', vi: 'Ngồi xuống đi.' },
    ],
    breakdown: [{ radical: '土', meaning: 'Đất (Thổ)' }, { radical: '人', meaning: 'Người (Nhân)' }],
    mnemonic: 'Hai người (人人) NGỒI trên mặt đất (土).'
  },
  {
    id: 43, character: '开', pinyin: 'kāi', meaning: 'Mở', hskLevel: 2, category: 'verb', strokeCount: 4,
    examples: [
      { cn: '请开门。', pinyin: 'Qǐng kāi mén.', vi: 'Xin mở cửa.' },
      { cn: '请开窗。', pinyin: 'Qǐng kāi chuāng.', vi: 'Xin mở cửa sổ.' },
      { cn: '开车。', pinyin: 'Kāi chē.', vi: 'Lái xe.' },
    ],
    breakdown: [{ radical: '廾', meaning: 'Hai tay (Củng)' }],
    mnemonic: 'Hai tay (廾) MỞ toang cánh cổng.'
  },

  // ─── NEW HSK 3 (8 cards) ─────────────────────────────────
  {
    id: 44, character: '书', pinyin: 'shū', meaning: 'Sách', hskLevel: 3, category: 'noun', strokeCount: 4,
    examples: [
      { cn: '我喜欢看书。', pinyin: 'Wǒ xǐhuān kàn shū.', vi: 'Tôi thích đọc sách.' },
      { cn: '这本书很好看。', pinyin: 'Zhè běn shū hěn hǎokàn.', vi: 'Cuốn sách này rất hay.' },
      { cn: '书店在哪？', pinyin: 'Shūdiàn zài nǎ?', vi: 'Hiệu sách ở đâu?' },
    ],
    breakdown: [{ radical: '乙', meaning: 'Nét cong' }],
    mnemonic: 'Hình dáng chữ giống quyển SÁCH mở ra.'
  },
  {
    id: 45, character: '电', pinyin: 'diàn', meaning: 'Điện', hskLevel: 3, category: 'noun', strokeCount: 5,
    examples: [
      { cn: '请关电。', pinyin: 'Qǐng guān diàn.', vi: 'Xin tắt điện.' },
      { cn: '手机没电了。', pinyin: 'Shǒujī méi diàn le.', vi: 'Điện thoại hết pin.' },
      { cn: '充电器在哪？', pinyin: 'Chōngdiàn qì zài nǎ?', vi: 'Sạc pin ở đâu?' },
    ],
    breakdown: [{ radical: '田', meaning: 'Ruộng (Điền)' }, { radical: '乚', meaning: 'Nét cong' }],
    mnemonic: 'Ruộng (田) cần ĐIỆN.'
  },
  {
    id: 46, character: '脑', pinyin: 'nǎo', meaning: 'Não, Óc', hskLevel: 3, category: 'noun', strokeCount: 10,
    examples: [
      { cn: '电脑很贵。', pinyin: 'Diànnǎo hěn guì.', vi: 'Máy tính rất đắt.' },
      { cn: '动动脑筋。', pinyin: 'Dòng dong nǎojīn.', vi: 'Động não một chút.' },
      { cn: '他脑子很好。', pinyin: 'Tā nǎozi hěn hǎo.', vi: 'Anh ấy rất thông minh.' },
    ],
    breakdown: [{ radical: '月', meaning: 'Thịt (Nguyệt)' }, { radical: '凶', meaning: 'Hung dữ (Hung)' }],
    mnemonic: 'Bộ phận thịt (月) trong hộp sọ (凶) — NÃO bộ.'
  },
  {
    id: 47, character: '喝', pinyin: 'hē', meaning: 'Uống', hskLevel: 3, category: 'verb', strokeCount: 12,
    examples: [
      { cn: '你想喝什么？', pinyin: 'Nǐ xiǎng hē shénme?', vi: 'Bạn muốn uống gì?' },
      { cn: '我喝茶。', pinyin: 'Wǒ hē chá.', vi: 'Tôi uống trà.' },
      { cn: '多喝水。', pinyin: 'Duō hē shuǐ.', vi: 'Uống nhiều nước.' },
    ],
    breakdown: [{ radical: '口', meaning: 'Miệng (Khẩu)' }, { radical: '曷', meaning: 'Sao / gì (Hạt)' }],
    mnemonic: 'Miệng (口) UỐNG nước.'
  },
  {
    id: 48, character: '饭', pinyin: 'fàn', meaning: 'Cơm', hskLevel: 3, category: 'noun', strokeCount: 7,
    examples: [
      { cn: '你吃饭了吗？', pinyin: 'Nǐ chīfàn le ma?', vi: 'Bạn ăn cơm chưa?' },
      { cn: '该吃饭了。', pinyin: 'Gāi chīfàn le.', vi: 'Đến giờ ăn cơm rồi.' },
      { cn: '饭店在那边。', pinyin: 'Fàndiàn zài nà biān.', vi: 'Nhà hàng ở bên kia.' },
    ],
    breakdown: [{ radical: '饣', meaning: 'Đồ ăn (Thực)' }, { radical: '反', meaning: 'Trái lại (Phản)' }],
    mnemonic: 'Đồ ăn (饣) — CƠM là chính.'
  },
  {
    id: 49, character: '菜', pinyin: 'cài', meaning: 'Rau, Món ăn', hskLevel: 3, category: 'noun', strokeCount: 11,
    examples: [
      { cn: '这个菜很好吃。', pinyin: 'Zhège cài hěn hǎochī.', vi: 'Món này rất ngon.' },
      { cn: '我去买菜。', pinyin: 'Wǒ qù mǎi cài.', vi: 'Tôi đi mua rau.' },
      { cn: '中国菜很有名。', pinyin: 'Zhōngguó cài hěn yǒumíng.', vi: 'Món Trung Quốc rất nổi tiếng.' },
    ],
    breakdown: [{ radical: '艹', meaning: 'Cỏ (Thảo)' }, { radical: '采', meaning: 'Hái (Thái)' }],
    mnemonic: 'Hái (采) rau cỏ (艹) về nấu — MÓN ĂN.'
  },
  {
    id: 50, character: '车', pinyin: 'chē', meaning: 'Xe', hskLevel: 3, category: 'noun', strokeCount: 4,
    examples: [
      { cn: '这是你的车吗？', pinyin: 'Zhè shì nǐ de chē ma?', vi: 'Đây là xe của bạn phải không?' },
      { cn: '我坐车去。', pinyin: 'Wǒ zuò chē qù.', vi: 'Tôi đi xe đến.' },
      { cn: '车站到了。', pinyin: 'Chēzhàn dào le.', vi: 'Đến bến xe rồi.' },
    ],
    breakdown: [{ radical: '车', meaning: 'Xe (Xa) — tượng hình cái xe nhìn từ trên' }],
    mnemonic: 'Hình dáng chữ giống cái XE nhìn từ trên xuống.'
  },
  {
    id: 51, character: '手', pinyin: 'shǒu', meaning: 'Tay', hskLevel: 3, category: 'noun', strokeCount: 4,
    examples: [
      { cn: '请洗手。', pinyin: 'Qǐng xǐ shǒu.', vi: 'Xin rửa tay.' },
      { cn: '手很冷。', pinyin: 'Shǒu hěn lěng.', vi: 'Tay rất lạnh.' },
      { cn: '举手。', pinyin: 'Jǔ shǒu.', vi: 'Giơ tay.' },
    ],
    breakdown: [{ radical: '手', meaning: 'Tay (Thủ) — tượng hình bàn tay có 5 ngón' }],
    mnemonic: 'Hình dáng chữ giống bàn TAY với các ngón.'
  },

  // ─── NEW HSK 4 (6 cards) ─────────────────────────────────
  { id: 52, character: '爱', pinyin: 'ài', meaning: 'Yêu, Thích', hskLevel: 4, category: 'verb', strokeCount: 10, exampleSentence: '我爱你。', examplePinyin: 'Wǒ ài nǐ.', exampleVi: 'Anh yêu em.', breakdown: [{ radical: '爫', meaning: 'Tay (Trảo)' }, { radical: '冖', meaning: 'Mái che' }, { radical: '友', meaning: 'Bạn (Hữu)' }, { radical: '心', meaning: 'Tim (Tâm)' }], mnemonic: 'Dùng tay (爫) che chở (冖) cho bạn (友) bằng cả trái tim (心) — YÊU.' },
  { id: 53, character: '家', pinyin: 'jiā', meaning: 'Nhà, Gia đình', hskLevel: 4, category: 'noun', strokeCount: 10, exampleSentence: '我家有三口人。', examplePinyin: 'Wǒ jiā yǒu sān kǒu rén.', exampleVi: 'Nhà tôi có ba người.', breakdown: [{ radical: '宀', meaning: 'Mái nhà (Miên)' }, { radical: '豕', meaning: 'Heo (Thỉ)' }], mnemonic: 'Dưới mái nhà (宀) có con heo (豕) — GIA ĐÌNH ấm no.' },
  { id: 54, character: '学', pinyin: 'xué', meaning: 'Học', hskLevel: 4, category: 'verb', strokeCount: 8, exampleSentence: '我在学中文。', examplePinyin: 'Wǒ zài xué Zhōngwén.', exampleVi: 'Tôi đang học tiếng Trung.', breakdown: [{ radical: '⺍', meaning: 'Tay' }, { radical: '冖', meaning: 'Mái nhà' }, { radical: '子', meaning: 'Con' }], mnemonic: 'Đứa trẻ (子) dưới mái nhà (冖) giơ tay (⺍) HỌC.' },
  { id: 55, character: '老', pinyin: 'lǎo', meaning: 'Già, Cũ', hskLevel: 4, category: 'adjective', strokeCount: 6, exampleSentence: '他是一位老师。', examplePinyin: 'Tā shì yī wèi lǎoshī.', exampleVi: 'Anh ấy là giáo viên.', breakdown: [{ radical: '耂', meaning: 'Già (Lão)' }, { radical: '匕', meaning: 'Cái thìa (Chủy)' }], mnemonic: 'Người GIÀ chống gậy.' },
  { id: 56, character: '朋', pinyin: 'péng', meaning: 'Bạn', hskLevel: 4, category: 'noun', strokeCount: 8, exampleSentence: '他是我的朋友。', examplePinyin: 'Tā shì wǒ de péngyǒu.', exampleVi: 'Anh ấy là bạn của tôi.', breakdown: [{ radical: '月', meaning: 'Mặt trăng (Nguyệt)' }, { radical: '月', meaning: 'Mặt trăng (Nguyệt)' }], mnemonic: 'Hai mặt trăng (月月) sáng soi cho nhau — tri kỷ, BẠN BÈ.' },
  { id: 57, character: '友', pinyin: 'yǒu', meaning: 'Bạn bè', hskLevel: 4, category: 'noun', strokeCount: 4, exampleSentence: '我们是好朋友。', examplePinyin: 'Wǒmen shì hǎo péngyǒu.', exampleVi: 'Chúng tôi là bạn tốt.', breakdown: [{ radical: '𠂇', meaning: 'Tay trái' }, { radical: '又', meaning: 'Lại (Hựu)' }], mnemonic: 'Hai bàn tay (𠂇又) nắm nhau — BẠN BÈ.' },

  // ─── NEW HSK 5 (5 cards) ─────────────────────────────────
  { id: 58, character: '感', pinyin: 'gǎn', meaning: 'Cảm thấy', hskLevel: 5, category: 'verb', strokeCount: 13, exampleSentence: '我感觉不舒服。', examplePinyin: 'Wǒ gǎnjué bù shūfú.', exampleVi: 'Tôi cảm thấy không khỏe.', breakdown: [{ radical: '咸', meaning: 'Mặn (Hàm)' }, { radical: '心', meaning: 'Tim (Tâm)' }], mnemonic: 'Trái tim (心) cảm nhận vị mặn (咸) — CẢM GIÁC.' },
  { id: 59, character: '谢', pinyin: 'xiè', meaning: 'Cảm ơn', hskLevel: 5, category: 'verb', strokeCount: 12, exampleSentence: '谢谢你。', examplePinyin: 'Xièxiè nǐ.', exampleVi: 'Cảm ơn bạn.', breakdown: [{ radical: '讠', meaning: 'Lời nói (Ngôn)' }, { radical: '射', meaning: 'Bắn (Xạ)' }], mnemonic: 'Lời nói (讠) bắn (射) ra — CẢM ƠN.' },
  { id: 60, character: '机', pinyin: 'jī', meaning: 'Máy, Cơ hội', hskLevel: 5, category: 'noun', strokeCount: 6, exampleSentence: '我的手机没电了。', examplePinyin: 'Wǒ de shǒujī méi diàn le.', exampleVi: 'Điện thoại của tôi hết pin rồi.', breakdown: [{ radical: '木', meaning: 'Gỗ (Mộc)' }, { radical: '几', meaning: 'Mấy / ghế (Kỷ)' }], mnemonic: 'Cỗ MÁY bằng gỗ (木) đặt trên bàn (几).' },
  { id: 61, character: '关', pinyin: 'guān', meaning: 'Đóng, Quan tâm', hskLevel: 5, category: 'verb', strokeCount: 6, exampleSentence: '请关上门。', examplePinyin: 'Qǐng guān shàng mén.', exampleVi: 'Xin đóng cửa lại.', breakdown: [{ radical: '丷', meaning: 'Hai chấm' }, { radical: '天', meaning: 'Trời (Thiên)' }], mnemonic: 'ĐÓNG cổng trời (天) lại.' },
  { id: 62, character: '笑', pinyin: 'xiào', meaning: 'Cười', hskLevel: 5, category: 'verb', strokeCount: 10, exampleSentence: '她笑得很可爱。', examplePinyin: 'Tā xiào de hěn kě ài.', exampleVi: 'Cô ấy cười rất dễ thương.', breakdown: [{ radical: '⺮', meaning: 'Tre (Trúc)' }, { radical: '夭', meaning: 'Yểu điệu/Chết yểu' }], mnemonic: 'Mặt CƯỜI đến nỗi ống tre (⺮) cũng rung.' },

  // ─── NEW HSK 6 (5 cards) ─────────────────────────────────
  { id: 63, character: '旅', pinyin: 'lǚ', meaning: 'Du lịch', hskLevel: 6, category: 'noun', strokeCount: 10, exampleSentence: '我喜欢旅行。', examplePinyin: 'Wǒ xǐhuān lǚxíng.', exampleVi: 'Tôi thích du lịch.', breakdown: [{ radical: '方', meaning: 'Phương' }, { radical: '人', meaning: 'Người' }, { radical: '衣', meaning: 'Áo' }, { radical: '𠂉', meaning: 'Nhân biến thể' }], mnemonic: 'Người (人) mang áo (衣) đi khắp phương (方) — DU LỊCH.' },
  { id: 64, character: '行', pinyin: 'xíng', meaning: 'Đi, Làm được', hskLevel: 6, category: 'verb', strokeCount: 6, exampleSentence: '行，没问题。', examplePinyin: 'Xíng, méi wèntí.', exampleVi: 'Được, không vấn đề.', breakdown: [{ radical: '彳', meaning: 'Bước đi (Sách)' }, { radical: '亍', meaning: 'Bước dừng' }], mnemonic: 'Bước đi (彳) rồi dừng (亍) — ĐI.' },
  { id: 65, character: '医', pinyin: 'yī', meaning: 'Y tế, Khám bệnh', hskLevel: 6, category: 'noun', strokeCount: 7, exampleSentence: '我去医院。', examplePinyin: 'Wǒ qù yīyuàn.', exampleVi: 'Tôi đi bệnh viện.', breakdown: [{ radical: '匚', meaning: 'Hộp (Phương)' }, { radical: '矢', meaning: 'Tên (Thỉ)' }], mnemonic: 'Hộp (匚) đựng mũi tên (矢) — Y TẾ.' },
  { id: 66, character: '院', pinyin: 'yuàn', meaning: 'Viện, Sân', hskLevel: 6, category: 'noun', strokeCount: 9, exampleSentence: '她在医院工作。', examplePinyin: 'Tā zài yīyuàn gōngzuò.', exampleVi: 'Cô ấy làm việc ở bệnh viện.', breakdown: [{ radical: '阝', meaning: 'Đồi (Phụ)' }, { radical: '完', meaning: 'Hoàn thành' }], mnemonic: 'Khu đất rộng (阝) hoàn chỉnh (完) — VIỆN.' },
  { id: 67, character: '问', pinyin: 'wèn', meaning: 'Hỏi', hskLevel: 6, category: 'verb', strokeCount: 6, exampleSentence: '我可以问你吗？', examplePinyin: 'Wǒ kěyǐ wèn nǐ ma?', exampleVi: 'Tôi có thể hỏi bạn không?', breakdown: [{ radical: '门', meaning: 'Cửa (Môn)' }, { radical: '口', meaning: 'Miệng (Khẩu)' }], mnemonic: 'Miệng (口) HỎI ở cửa (门).' },

  // ─── NEW HSK 4-6 bổ sung (6 cards) ───────────────────────
  { id: 68, character: '漂', pinyin: 'piào', meaning: 'Đẹp', hskLevel: 4, category: 'adjective', strokeCount: 14, exampleSentence: '她真漂亮。', examplePinyin: 'Tā zhēn piàoliang.', exampleVi: 'Cô ấy thật xinh đẹp.', breakdown: [{ radical: '氵', meaning: 'Nước' }, { radical: '票', meaning: 'Vé' }], mnemonic: 'Nước (氵) làm sạch tờ vé (票) — sạch ĐẸP.' },
  { id: 69, character: '亮', pinyin: 'liàng', meaning: 'Sáng', hskLevel: 4, category: 'adjective', strokeCount: 9, exampleSentence: '天亮了。', examplePinyin: 'Tiān liàng le.', exampleVi: 'Trời sáng rồi.', breakdown: [{ radical: '亠', meaning: 'Đầu' }, { radical: '口', meaning: 'Miệng' }, { radical: '儿', meaning: 'Con' }], mnemonic: 'Miệng (口) và con (儿) — SÁNG.' },
  { id: 70, character: '冷', pinyin: 'lěng', meaning: 'Lạnh', hskLevel: 4, category: 'adjective', strokeCount: 7, exampleSentence: '今天很冷。', examplePinyin: 'Jīntiān hěn lěng.', exampleVi: 'Hôm nay rất lạnh.', breakdown: [{ radical: '冫', meaning: 'Băng (Băng)' }, { radical: '令', meaning: 'Khiến (Lệnh)' }], mnemonic: 'Băng (冫) LẠNH.' },
  { id: 71, character: '热', pinyin: 'rè', meaning: 'Nóng', hskLevel: 4, category: 'adjective', strokeCount: 10, exampleSentence: '今天很热。', examplePinyin: 'Jīntiān hěn rè.', exampleVi: 'Hôm nay rất nóng.', breakdown: [{ radical: '执', meaning: 'Cầm' }, { radical: '灬', meaning: 'Lửa (Hỏa)' }], mnemonic: 'Cầm (执) lửa (灬) — NÓNG.' },
  { id: 72, character: '新', pinyin: 'xīn', meaning: 'Mới', hskLevel: 5, category: 'adjective', strokeCount: 13, exampleSentence: '我买了新手机。', examplePinyin: 'Wǒ mǎi le xīn shǒujī.', exampleVi: 'Tôi đã mua điện thoại mới.', breakdown: [{ radical: '亲', meaning: 'Thân' }, { radical: '斤', meaning: 'Cân' }], mnemonic: 'Cân (斤) MỚI.' },
  { id: 73, character: '多', pinyin: 'duō', meaning: 'Nhiều', hskLevel: 4, category: 'adjective', strokeCount: 6, exampleSentence: '你多大？', examplePinyin: 'Nǐ duō dà?', exampleVi: 'Bạn bao nhiêu tuổi?', breakdown: [{ radical: '夕', meaning: 'Tối (Tịch)' }], mnemonic: 'Hai buổi tối (夕夕) — NHIỀU.' }
];

// ============================================================
// 2. CHAT SCENARIOS — 4 complete multi-step dialog trees
// ============================================================
export const chatScenarios = [
  // ─── Scenario 1: Order Trà Sữa ──────────────────────────
  {
    id: 'milk_tea',
    title: 'Order Trà Sữa',
    description: 'Bạn bước vào một quán trà sữa ở Trung Quốc. Hãy gọi đồ uống yêu thích của mình bằng tiếng Trung!',
    difficulty: 'beginner',
    icon: '🧋',
    messages: [
      { sender: 'bot', text: '你好！欢迎光临！请问想喝点什么？', pinyin: 'Nǐ hǎo! Huānyíng guānglín! Qǐngwèn xiǎng hē diǎn shénme?', vi: 'Xin chào! Hoan nghênh quý khách! Bạn muốn uống gì ạ?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我要一杯珍珠奶茶。', pinyin: 'Wǒ yào yī bēi zhēnzhū nǎichá.', vi: 'Tôi muốn một cốc trà sữa trân châu.', isCorrect: true, feedback: 'Tuyệt vời! Gọi đúng cách rồi. 珍珠奶茶 là trà sữa trân châu — thức uống phổ biến nhất!', nextStepId: 'step2' },
          { text: '给我一瓶啤酒。', pinyin: 'Gěi wǒ yī píng píjiǔ.', vi: 'Cho tôi một chai bia.', isCorrect: false, feedback: 'Đây là quán trà sữa, không phải quán nhậu nhé! Thử gọi trà sữa xem.', nextStepId: 'step1' },
          { text: '有什么推荐吗？', pinyin: 'Yǒu shénme tuījiàn ma?', vi: 'Có gợi ý gì không?', isCorrect: true, feedback: 'Hay lắm! Hỏi gợi ý cũng là cách giao tiếp tự nhiên.', nextStepId: 'step2' }
        ],
        botResponse: { text: '好的！要大杯还是中杯？', pinyin: 'Hǎo de! Yào dà bēi háishì zhōng bēi?', vi: 'Vâng! Lấy cốc lớn hay cốc vừa?' }
      },
      {
        id: 'step2',
        options: [
          { text: '大杯，谢谢。', pinyin: 'Dà bēi, xièxiè.', vi: 'Cốc lớn, cảm ơn.', isCorrect: true, feedback: 'Đúng rồi! 大杯 = cốc lớn. Thêm 谢谢 rất lịch sự!', nextStepId: 'step3' },
          { text: '中杯吧。', pinyin: 'Zhōng bēi ba.', vi: 'Cốc vừa đi.', isCorrect: true, feedback: 'OK! 中杯 = cốc vừa. Thêm 吧 nghe tự nhiên hơn.', nextStepId: 'step3' },
          { text: '最小的。', pinyin: 'Zuì xiǎo de.', vi: 'Cái nhỏ nhất.', isCorrect: false, feedback: 'Thường quán trà sữa chỉ có 大杯 (lớn) và 中杯 (vừa). Hãy chọn lại nhé!', nextStepId: 'step2' }
        ],
        botResponse: { text: '糖分要几分甜？冰量呢？', pinyin: 'Tángfèn yào jǐ fēn tián? Bīngliàng ne?', vi: 'Độ đường muốn bao nhiêu? Còn lượng đá thì sao?' }
      },
      {
        id: 'step3',
        options: [
          { text: '半糖少冰。', pinyin: 'Bàn táng shǎo bīng.', vi: 'Nửa đường ít đá.', isCorrect: true, feedback: 'Chuẩn luôn! 半糖 = nửa đường, 少冰 = ít đá. Rất phổ biến ở TQ!', nextStepId: 'step4' },
          { text: '全糖加冰。', pinyin: 'Quán táng jiā bīng.', vi: 'Đường nguyên kem thêm đá.', isCorrect: true, feedback: 'Được thôi! 全糖 = full đường, 加冰 = thêm đá. Bạn thích ngọt nhỉ!', nextStepId: 'step4' },
          { text: '无糖去冰。', pinyin: 'Wú táng qù bīng.', vi: 'Không đường bỏ đá.', isCorrect: true, feedback: 'Lành mạnh đấy! 无糖 = không đường, 去冰 = bỏ đá.', nextStepId: 'step4' }
        ],
        botResponse: { text: '好的，一共十五块。微信还是支付宝？', pinyin: 'Hǎo de, yígòng shíwǔ kuài. Wēixìn háishì Zhīfùbǎo?', vi: 'Vâng, tổng cộng 15 tệ. WeChat hay Alipay?' }
      },
      {
        id: 'step4',
        options: [
          { text: '微信支付。', pinyin: 'Wēixìn zhīfù.', vi: 'Thanh toán bằng WeChat.', isCorrect: true, feedback: 'Tuyệt! WeChat Pay là cách thanh toán phổ biến nhất ở TQ.', nextStepId: null },
          { text: '支付宝。', pinyin: 'Zhīfùbǎo.', vi: 'Alipay.', isCorrect: true, feedback: 'OK! Alipay cũng rất phổ biến.', nextStepId: null },
          { text: '可以用现金吗？', pinyin: 'Kěyǐ yòng xiànjīn ma?', vi: 'Dùng tiền mặt được không?', isCorrect: true, feedback: 'Được, nhưng ở TQ hiện giờ rất ít người dùng tiền mặt. Biết hỏi câu này cũng hay!', nextStepId: null }
        ],
        botResponse: { text: '好的，请稍等。祝你喝得开心！', pinyin: 'Hǎo de, qǐng shāo děng. Zhù nǐ hē de kāixīn!', vi: 'Vâng, xin đợi một chút. Chúc bạn uống vui vẻ!' }
      }
    ]
  },

  // ─── Scenario 2: Đi Taxi ────────────────────────────────
  {
    id: 'taxi',
    title: 'Đi Taxi',
    description: 'Bạn cần bắt taxi ở Trung Quốc để đến một địa điểm. Hãy giao tiếp với tài xế!',
    difficulty: 'beginner',
    icon: '🚕',
    messages: [
      { sender: 'bot', text: '你好，请问去哪里？', pinyin: 'Nǐ hǎo, qǐngwèn qù nǎlǐ?', vi: 'Xin chào, bạn muốn đi đâu?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '师傅，我要去火车站。', pinyin: 'Shīfu, wǒ yào qù huǒchē zhàn.', vi: 'Bác tài, tôi muốn đi ga tàu hỏa.', isCorrect: true, feedback: 'Tuyệt! Gọi tài xế là 师傅 rất lịch sự. 火车站 = ga tàu hỏa.', nextStepId: 'step2' },
          { text: '去机场，谢谢。', pinyin: 'Qù jīchǎng, xièxiè.', vi: 'Đi sân bay, cảm ơn.', isCorrect: true, feedback: 'Hay! 机场 = sân bay. Nói ngắn gọn, dễ hiểu.', nextStepId: 'step2' },
          { text: '随便开。', pinyin: 'Suíbiàn kāi.', vi: 'Chạy đại đi.', isCorrect: false, feedback: 'Haha, bạn phải nói rõ muốn đi đâu chứ! Tài xế sẽ không biết đường đâu.', nextStepId: 'step1' }
        ],
        botResponse: { text: '好的。你赶时间吗？走高速还是普通路？', pinyin: 'Hǎo de. Nǐ gǎn shíjiān ma? Zǒu gāosù háishì pǔtōng lù?', vi: 'OK. Bạn có gấp không? Đi đường cao tốc hay đường thường?' }
      },
      {
        id: 'step2',
        options: [
          { text: '不赶时间，走普通路吧。', pinyin: 'Bù gǎn shíjiān, zǒu pǔtōng lù ba.', vi: 'Không gấp, đi đường thường đi.', isCorrect: true, feedback: 'Thông minh! Đường thường sẽ rẻ hơn vì không mất phí cao tốc.', nextStepId: 'step3' },
          { text: '赶时间，走高速吧。', pinyin: 'Gǎn shíjiān, zǒu gāosù ba.', vi: 'Gấp lắm, đi cao tốc đi.', isCorrect: true, feedback: 'OK! 高速 = cao tốc, nhanh hơn nhưng sẽ tốn thêm phí nhé.', nextStepId: 'step3' }
        ],
        botResponse: { text: '大概需要三十分钟。', pinyin: 'Dàgài xūyào sānshí fēnzhōng.', vi: 'Khoảng cần 30 phút.' }
      },
      {
        id: 'step3',
        options: [
          { text: '好的，没问题。', pinyin: 'Hǎo de, méi wèntí.', vi: 'OK, không vấn đề gì.', isCorrect: true, feedback: '没问题 = không vấn đề gì — câu cửa miệng rất hay dùng!', nextStepId: 'step4' },
          { text: '能快一点吗？', pinyin: 'Néng kuài yīdiǎn ma?', vi: 'Có thể nhanh hơn không?', isCorrect: true, feedback: 'Được, nhưng nhớ an toàn nhé! 能...吗 là cấu trúc xin phép lịch sự.', nextStepId: 'step4' },
          { text: '太久了，我不去了。', pinyin: 'Tài jiǔ le, wǒ bú qù le.', vi: 'Lâu quá, tôi không đi nữa.', isCorrect: false, feedback: 'Ơ, sao lại hủy? 30 phút ở TQ là bình thường thôi! Thử lại nhé.', nextStepId: 'step3' }
        ],
        botResponse: { text: '到了！一共四十五块钱。', pinyin: 'Dào le! Yígòng sìshíwǔ kuài qián.', vi: 'Đến rồi! Tổng cộng 45 tệ.' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，微信扫码支付。', pinyin: 'Hǎo de, Wēixìn sǎomǎ zhīfù.', vi: 'OK, quét mã WeChat thanh toán.', isCorrect: true, feedback: 'Chuẩn! 扫码 = quét mã QR — cách trả tiền taxi phổ biến nhất ở TQ.', nextStepId: null },
          { text: '给你五十，不用找了。', pinyin: 'Gěi nǐ wǔshí, bú yòng zhǎo le.', vi: 'Đưa 50, không cần thối.', isCorrect: true, feedback: '不用找了 = không cần thối. Rất hào phóng! Tài xế sẽ vui lắm.', nextStepId: null },
          { text: '可以开发票吗？', pinyin: 'Kěyǐ kāi fāpiào ma?', vi: 'Cho xin hóa đơn được không?', isCorrect: true, feedback: '发票 = hóa đơn. Rất hữu ích khi đi công tác cần thanh toán lại!', nextStepId: null }
        ],
        botResponse: { text: '谢谢！慢走，再见！', pinyin: 'Xièxiè! Màn zǒu, zàijiàn!', vi: 'Cảm ơn! Đi cẩn thận, tạm biệt!' }
      }
    ]
  },

  // ─── Scenario 3: Mua sắm Taobao ────────────────────────
  {
    id: 'taobao',
    title: 'Mua sắm Taobao',
    description: 'Bạn muốn mua một chiếc áo trên Taobao và nhắn tin hỏi shop. Hãy mặc cả và đặt hàng!',
    difficulty: 'intermediate',
    icon: '🛒',
    messages: [
      { sender: 'bot', text: '亲，欢迎光临本店！有什么可以帮您的？', pinyin: 'Qīn, huānyíng guānglín běn diàn! Yǒu shénme kěyǐ bāng nín de?', vi: 'Bạn thân mến, chào mừng đến shop! Có gì em giúp được ạ?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '你好，这件衣服有M码吗？', pinyin: 'Nǐ hǎo, zhè jiàn yīfú yǒu M mǎ ma?', vi: 'Chào bạn, áo này có size M không?', isCorrect: true, feedback: 'Tốt lắm! 件 là lượng từ cho áo, 码 = size/mã.', nextStepId: 'step2' },
          { text: '这个颜色还有别的吗？', pinyin: 'Zhège yánsè hái yǒu bié de ma?', vi: 'Màu này có màu khác không?', isCorrect: true, feedback: 'Hay! 颜色 = màu sắc, 别的 = cái khác.', nextStepId: 'step2' },
          { text: '给我最贵的。', pinyin: 'Gěi wǒ zuì guì de.', vi: 'Cho tôi cái đắt nhất.', isCorrect: false, feedback: 'Đại gia quá! Nhưng mua sắm online nên hỏi rõ sản phẩm trước nhé.', nextStepId: 'step1' }
        ],
        botResponse: { text: '有的，亲！M码有黑色和白色。这款质量很好哦！', pinyin: 'Yǒu de, qīn! M mǎ yǒu hēisè hé báisè. Zhè kuǎn zhìliàng hěn hǎo ó!', vi: 'Có ạ! Size M có màu đen và trắng. Mẫu này chất lượng tốt lắm!' }
      },
      {
        id: 'step2',
        options: [
          { text: '多少钱？可以便宜一点吗？', pinyin: 'Duōshǎo qián? Kěyǐ piányi yīdiǎn ma?', vi: 'Bao nhiêu tiền? Giảm giá được không?', isCorrect: true, feedback: '可以便宜一点吗 là câu mặc cả kinh điển! Rất hữu ích khi mua hàng.', nextStepId: 'step3' },
          { text: '有没有优惠券？', pinyin: 'Yǒu méiyǒu yōuhuìquàn?', vi: 'Có coupon giảm giá không?', isCorrect: true, feedback: 'Thông minh! 优惠券 = coupon/voucher giảm giá. Taobao luôn có!', nextStepId: 'step3' },
          { text: '太贵了，算了。', pinyin: 'Tài guì le, suàn le.', vi: 'Đắt quá, thôi vậy.', isCorrect: false, feedback: 'Đừng bỏ cuộc! Thử mặc cả trước đã.', nextStepId: 'step2' }
        ],
        botResponse: { text: '原价一百二，现在活动价八十八。买两件还能再减十块！', pinyin: 'Yuánjià yībǎi èr, xiànzài huódòng jià bāshíbā. Mǎi liǎng jiàn hái néng zài jiǎn shí kuài!', vi: 'Giá gốc 120, giờ giá khuyến mãi 88. Mua 2 cái còn giảm thêm 10 tệ!' }
      },
      {
        id: 'step3',
        options: [
          { text: '好的，那我买两件，一黑一白。', pinyin: 'Hǎo de, nà wǒ mǎi liǎng jiàn, yī hēi yī bái.', vi: 'OK, vậy tôi mua 2 cái, một đen một trắng.', isCorrect: true, feedback: 'Tuyệt vời! 一黑一白 = một đen một trắng. Mua đôi tiết kiệm hơn!', nextStepId: 'step4' },
          { text: '能不能再便宜一点？七十块行吗？', pinyin: 'Néng bù néng zài piányi yīdiǎn? Qīshí kuài xíng ma?', vi: 'Giảm thêm được không? 70 tệ được không?', isCorrect: true, feedback: 'Mặc cả thêm! 行吗 = được không — cách hỏi lịch sự.', nextStepId: 'step4' }
        ],
        botResponse: { text: '好的亲！已经帮您改好价格了。请确认收货地址。', pinyin: 'Hǎo de qīn! Yǐjīng bāng nín gǎi hǎo jiàgé le. Qǐng quèrèn shōuhuò dìzhǐ.', vi: 'OK bạn! Đã sửa giá xong rồi. Xin xác nhận địa chỉ nhận hàng.' }
      },
      {
        id: 'step4',
        options: [
          { text: '地址没问题，我现在下单。', pinyin: 'Dìzhǐ méi wèntí, wǒ xiànzài xià dān.', vi: 'Địa chỉ không vấn đề, tôi đặt hàng ngay.', isCorrect: true, feedback: '下单 = đặt đơn hàng. Xong rồi! Giờ chờ hàng về thôi.', nextStepId: null },
          { text: '大概几天能到？', pinyin: 'Dàgài jǐ tiān néng dào?', vi: 'Khoảng mấy ngày tới?', isCorrect: true, feedback: '几天能到 = mấy ngày tới. Câu hỏi thực tế rất cần thiết khi mua online!', nextStepId: null },
          { text: '可以包邮吗？', pinyin: 'Kěyǐ bāo yóu ma?', vi: 'Miễn phí ship được không?', isCorrect: true, feedback: '包邮 = bao gồm phí ship / free ship. Taobao nhiều shop bao ship luôn!', nextStepId: null }
        ],
        botResponse: { text: '感谢您的购买！大概三到五天就能收到。有问题随时联系我们哦！', pinyin: 'Gǎnxiè nín de gòumǎi! Dàgài sān dào wǔ tiān jiù néng shōudào. Yǒu wèntí suíshí liánxì wǒmen ó!', vi: 'Cảm ơn bạn mua hàng! Khoảng 3-5 ngày sẽ nhận được. Có vấn đề gì liên hệ bất cứ lúc nào nhé!' }
      }
    ]
  },

  // ─── Scenario 4: Khám bệnh ──────────────────────────────
  {
    id: 'hospital',
    title: 'Khám bệnh',
    description: 'Bạn bị ốm và cần đi khám bệnh ở bệnh viện Trung Quốc. Hãy mô tả triệu chứng và làm theo hướng dẫn của bác sĩ!',
    difficulty: 'advanced',
    icon: '🏥',
    messages: [
      { sender: 'bot', text: '你好，请先到挂号处挂号。请问你要看什么科？', pinyin: 'Nǐ hǎo, qǐng xiān dào guàhào chù guàhào. Qǐngwèn nǐ yào kàn shénme kē?', vi: 'Xin chào, vui lòng đến quầy đăng ký trước. Bạn muốn khám khoa nào?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我想挂内科，我感觉不舒服。', pinyin: 'Wǒ xiǎng guà nèikē, wǒ gǎnjué bù shūfú.', vi: 'Tôi muốn đăng ký khoa nội, tôi cảm thấy không khỏe.', isCorrect: true, feedback: '内科 = khoa nội, 不舒服 = không khỏe. Rất tốt khi biết nói tên khoa!', nextStepId: 'step2' },
          { text: '我不知道应该看什么科。', pinyin: 'Wǒ bù zhīdào yīnggāi kàn shénme kē.', vi: 'Tôi không biết nên khám khoa nào.', isCorrect: true, feedback: 'Không sao! Nói thẳng là không biết, nhân viên sẽ hướng dẫn bạn.', nextStepId: 'step2' },
          { text: '不用挂号，直接看病。', pinyin: 'Bú yòng guàhào, zhíjiē kànbìng.', vi: 'Không cần đăng ký, khám luôn.', isCorrect: false, feedback: 'Ở TQ bắt buộc phải 挂号 (đăng ký) trước khi khám nhé!', nextStepId: 'step1' }
        ],
        botResponse: { text: '好的，请到三楼内科诊室。医生会叫你的号。你哪里不舒服？', pinyin: 'Hǎo de, qǐng dào sān lóu nèikē zhěnshì. Yīshēng huì jiào nǐ de hào. Nǐ nǎlǐ bù shūfú?', vi: 'Vâng, mời lên tầng 3 phòng khám nội. Bác sĩ sẽ gọi số của bạn. Bạn khó chịu ở đâu?' }
      },
      {
        id: 'step2',
        options: [
          { text: '我头疼，还有点发烧和咳嗽。', pinyin: 'Wǒ tóuténg, hái yǒudiǎn fāshāo hé késou.', vi: 'Tôi đau đầu, còn hơi sốt và ho nữa.', isCorrect: true, feedback: '头疼 = đau đầu, 发烧 = sốt, 咳嗽 = ho. Mô tả triệu chứng rõ ràng!', nextStepId: 'step3' },
          { text: '我肚子疼，拉肚子。', pinyin: 'Wǒ dùzi téng, lā dùzi.', vi: 'Tôi đau bụng, tiêu chảy.', isCorrect: true, feedback: '肚子疼 = đau bụng, 拉肚子 = tiêu chảy. Có thể do ăn uống không hợp!', nextStepId: 'step3' },
          { text: '我全身都不舒服。', pinyin: 'Wǒ quánshēn dōu bù shūfú.', vi: 'Tôi khó chịu toàn thân.', isCorrect: false, feedback: 'Nói chung chung quá, bác sĩ cần biết cụ thể hơn. Hãy mô tả rõ triệu chứng!', nextStepId: 'step2' }
        ],
        botResponse: { text: '明白了。这种情况持续多久了？有没有吃过药？', pinyin: 'Míngbái le. Zhè zhǒng qíngkuàng chíxù duōjiǔ le? Yǒu méiyǒu chī guò yào?', vi: 'Hiểu rồi. Tình trạng này kéo dài bao lâu rồi? Đã uống thuốc gì chưa?' }
      },
      {
        id: 'step3',
        options: [
          { text: '大概两天了，我吃了感冒药但没有用。', pinyin: 'Dàgài liǎng tiān le, wǒ chī le gǎnmào yào dàn méiyǒu yòng.', vi: 'Khoảng 2 ngày rồi, tôi uống thuốc cảm nhưng không hiệu quả.', isCorrect: true, feedback: '感冒药 = thuốc cảm, 没有用 = không hiệu quả. Thông tin rất hữu ích cho bác sĩ!', nextStepId: 'step4' },
          { text: '从昨天开始的，还没吃药。', pinyin: 'Cóng zuótiān kāishǐ de, hái méi chī yào.', vi: 'Từ hôm qua, chưa uống thuốc.', isCorrect: true, feedback: '从...开始 = bắt đầu từ..., 还没 = chưa. Cấu trúc rất chuẩn!', nextStepId: 'step4' }
        ],
        botResponse: { text: '我先给你量一下体温和血压。然后开一些药，你按时吃药，多喝水，好好休息。', pinyin: 'Wǒ xiān gěi nǐ liáng yíxià tǐwēn hé xuèyā. Ránhòu kāi yīxiē yào, nǐ ànshí chī yào, duō hē shuǐ, hǎohǎo xiūxi.', vi: 'Để tôi đo nhiệt độ và huyết áp trước. Sau đó kê thuốc, bạn uống thuốc đúng giờ, uống nhiều nước, nghỉ ngơi cho tốt.' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，谢谢医生。请问药在哪里取？', pinyin: 'Hǎo de, xièxiè yīshēng. Qǐngwèn yào zài nǎlǐ qǔ?', vi: 'Vâng, cảm ơn bác sĩ. Cho hỏi lấy thuốc ở đâu?', isCorrect: true, feedback: '取药 = lấy thuốc. Thường ở tầng 1 quầy dược (药房/取药处).', nextStepId: null },
          { text: '医生，这个病严重吗？', pinyin: 'Yīshēng, zhège bìng yánzhòng ma?', vi: 'Bác sĩ, bệnh này có nặng không?', isCorrect: true, feedback: '严重 = nghiêm trọng/nặng. Hỏi thêm để yên tâm là rất tốt!', nextStepId: null },
          { text: '需要住院吗？', pinyin: 'Xūyào zhùyuàn ma?', vi: 'Cần nằm viện không?', isCorrect: true, feedback: '住院 = nằm viện. Câu hỏi quan trọng khi bệnh nặng!', nextStepId: null }
        ],
        botResponse: { text: '不严重，放心吧。请到一楼药房取药。祝你早日康复！', pinyin: 'Bù yánzhòng, fàngxīn ba. Qǐng dào yī lóu yàofáng qǔ yào. Zhù nǐ zǎorì kāngfù!', vi: 'Không nặng, yên tâm nhé. Mời xuống tầng 1 quầy thuốc lấy thuốc. Chúc bạn mau khỏe!' }
      }
    ]
  },

  // ─── Scenario 5: Gọi xe DiDi ────────────────────────────
  {
    id: 'didi',
    title: 'Gọi xe DiDi',
    description: 'Bạn đang đứng trên đường ở Bắc Kinh và cần bắt taxi hoặc gọi DiDi. Hãy nói với tài xế điểm đến của mình!',
    difficulty: 'beginner',
    icon: '🚕',
    messages: [
      { sender: 'bot', text: '你好，请问去哪儿？', pinyin: 'Nǐ hǎo, qǐngwèn qù nǎr?', vi: 'Xin chào, đi đâu vậy?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '去火车站，多少钱？', pinyin: 'Qù huǒchēzhàn, duōshǎo qián?', vi: 'Đi ga tàu hỏa, bao nhiêu tiền?', isCorrect: true, feedback: 'Tuyệt! 火车站 = ga tàu hỏa. Hỏi giá trước rất thông minh!', nextStepId: 'step2' },
          { text: '去天安门广场。', pinyin: 'Qù Tiān ān mén Guǎngchǎng.', vi: 'Đi Quảng trường Thiên An Môn.', isCorrect: true, feedback: '天安门 = cổng chính vào Tử Cấm Thành. Điểm du lịch nổi tiếng!', nextStepId: 'step2' },
          { text: '随便开。', pinyin: 'Suíbiàn kāi.', vi: 'Lái đại đi.', isCorrect: false, feedback: 'Tài xế sẽ không hiểu bạn muốn đi đâu đâu! Hãy nói rõ điểm đến.', nextStepId: 'step1' }
        ],
        botResponse: { text: '好的，请上车。大概二十分钟到。', pinyin: 'Hǎo de, qǐng shàng chē. Dàgài èrshí fēnzhōng dào.', vi: 'Được, mời lên xe. Khoảng 20 phút đến.' }
      },
      {
        id: 'step2',
        options: [
          { text: '能不能快一点？我赶时间。', pinyin: 'Néng bù néng kuài yīdiǎn? Wǒ gǎn shíjiān.', vi: 'Nhanh hơn được không? Tôi gấp.', isCorrect: true, feedback: '赶时间 = gấp thời gian. Câu này rất hữu dụng khi bạn vội!', nextStepId: 'step3' },
          { text: '请开空调，太热了。', pinyin: 'Qǐng kāi kōngtiáo, tài rè le.', vi: 'Bật điều hòa đi, nóng quá.', isCorrect: true, feedback: '空调 = điều hòa. Có thể nói 太冷了 khi muốn tắt điều hòa.', nextStepId: 'step3' },
          { text: '我晕车，开慢点。', pinyin: 'Wǒ yùn chē, kāi màn diǎn.', vi: 'Tôi say xe, đi chậm chút.', isCorrect: true, feedback: '晕车 = say xe. Từ rất cần thiết khi di chuyển!', nextStepId: 'step3' }
        ],
        botResponse: { text: '没问题。前面有点堵车，我走另一条路。', pinyin: 'Méi wèntí. Qiánmiàn yǒudiǎn dǔchē, wǒ zǒu lìng yī tiáo lù.', vi: 'Không vấn đề. Phía trước hơi tắc, tôi đi đường khác.' }
      },
      {
        id: 'step3',
        options: [
          { text: '到了，多少钱？能扫码支付吗？', pinyin: 'Dào le, duōshǎo qián? Néng sǎo mǎ zhīfù ma?', vi: 'Đến rồi, bao nhiêu tiền? Quét mã trả được không?', isCorrect: true, feedback: '扫码支付 = thanh toán quét mã. Ở TQ thanh toán QR là phổ biến nhất!', nextStepId: null },
          { text: '多少钱？给你现金。', pinyin: 'Duōshǎo qián? Gěi nǐ xiànjīn.', vi: 'Bao nhiêu tiền? Đưa tiền mặt.', isCorrect: true, feedback: '现金 = tiền mặt. Ở TQ nhiều nơi vẫn nhận tiền mặt.', nextStepId: null }
        ],
        botResponse: { text: '一共三十五块。扫这个码就可以。谢谢，再见！', pinyin: 'Yīgòng sānshíwǔ kuài. Sǎo zhège mǎ jiù kěyǐ. Xièxiè, zàijiàn!', vi: 'Tổng cộng 35 tệ. Quét mã này là được. Cảm ơn, tạm biệt!' }
      }
    ]
  },

  // ─── Scenario 6: Tại sân bay ──────────────────────────────
  {
    id: 'airport',
    title: 'Tại sân bay',
    description: 'Bạn đến sân bay quốc tế ở Thượng Hải. Hãy làm thủ tục check-in, qua an ninh và lên máy bay!',
    difficulty: 'intermediate',
    icon: '✈️',
    messages: [
      { sender: 'bot', text: '您好，请出示护照和机票。有行李要托运吗？', pinyin: 'Nín hǎo, qǐng chūshì hùzhào hé jīpiào. Yǒu xíngli yào tuōyùn ma?', vi: 'Xin chào, vui lòng xuất trình hộ chiếu và vé máy bay. Có hành lý cần ký gửi không?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '有，我有一个行李箱托运。', pinyin: 'Yǒu, wǒ yǒu yī gè xínglixiāng tuōyùn.', vi: 'Có, tôi có một vali ký gửi.', isCorrect: true, feedback: '行李箱 = vali, 托运 = ký gửi. Hoàn hảo!', nextStepId: 'step2' },
          { text: '没有，只有随身行李。', pinyin: 'Méiyǒu, zhǐyǒu suíshēn xíngli.', vi: 'Không, chỉ có hành lý xách tay.', isCorrect: true, feedback: '随身行李 = hành lý xách tay. Đúng từ ngữ!', nextStepId: 'step2' },
          { text: '我不坐飞机了。', pinyin: 'Wǒ bù zuò fēijī le.', vi: 'Tôi không đi máy bay nữa.', isCorrect: false, feedback: 'Sao lại thế? Đã đến sân bay rồi mà!', nextStepId: 'step1' }
        ],
        botResponse: { text: '好的，请把行李放在传送带上。这是你的登机牌，请在B12号登机口登机。', pinyin: 'Hǎo de, qǐng bǎ xíngli fàng zài chuánsòng dài shàng. Zhè shì nǐ de dēngjīpái, qǐng zài B12 hào dēngjīkǒu dēngjī.', vi: 'Vâng, vui lòng để hành lý lên băng chuyền. Đây là thẻ lên máy bay của bạn, mời lên cửa B12.' }
      },
      {
        id: 'step2',
        options: [
          { text: '安检口在哪里？', pinyin: 'Ānjiǎn kǒu zài nǎlǐ?', vi: 'Cửa an ninh ở đâu?', isCorrect: true, feedback: '安检 = kiểm tra an ninh. Cần hỏi ngay sau khi check-in!', nextStepId: 'step3' },
          { text: '请问免税店在哪里？', pinyin: 'Qǐngwèn miǎnshuì diàn zài nǎlǐ?', vi: 'Xin hỏi cửa hàng miễn thuế ở đâu?', isCorrect: true, feedback: '免税店 = cửa hàng miễn thuế. Mua sắm ở sân bay TQ rất thú vị!', nextStepId: 'step3' },
          { text: '我饿了，哪里有餐厅？', pinyin: 'Wǒ è le, nǎlǐ yǒu cāntīng?', vi: 'Tôi đói rồi, nhà hàng ở đâu?', isCorrect: true, feedback: '餐厅 = nhà hàng. Ăn trước khi bay là ý hay!', nextStepId: 'step3' }
        ],
        botResponse: { text: '往前走，左边就是安检。过了安检有免税店和餐厅。', pinyin: 'Wǎng qián zǒu, zuǒbiān jiùshì ānjiǎn. Guò le ānjiǎn yǒu miǎnshuì diàn hé cāntīng.', vi: 'Đi thẳng phía trước, bên trái là cửa an ninh. Qua an ninh có cửa hàng miễn thuế và nhà hàng.' }
      },
      {
        id: 'step3',
        options: [
          { text: '请问B12登机口怎么走？', pinyin: 'Qǐngwèn B12 dēngjīkǒu zěnme zǒu?', vi: 'Xin hỏi cửa lên máy bay B12 đi thế nào?', isCorrect: true, feedback: '登机口 = cửa lên máy bay. Cần xác nhận trước giờ bay!', nextStepId: 'step4' },
          { text: '飞机会晚点吗？', pinyin: 'Fēijī huì wǎndiǎn ma?', vi: 'Máy bay có bị delay không?', isCorrect: true, feedback: '晚点 = trễ giờ / delay. Hỏi để chủ động thời gian!', nextStepId: 'step4' }
        ],
        botResponse: { text: '沿着指示牌走，大约五分钟。现在开始登机了，请快点！', pinyin: 'Yánzhe zhǐshipái zǒu, dàyuē wǔ fēnzhōng. Xiànzài kāishǐ dēngjī le, qǐng kuài diǎn!', vi: 'Đi theo bảng chỉ dẫn, khoảng 5 phút. Hiện tại đang lên máy bay rồi, nhanh lên!' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，我马上过去。谢谢！', pinyin: 'Hǎo de, wǒ mǎshàng guòqù. Xièxiè!', vi: 'OK, tôi qua ngay. Cảm ơn!', isCorrect: true, feedback: '马上过去 = qua ngay. Phản xạ nhanh nhạy! Chuyến bay vui vẻ!', nextStepId: null },
          { text: '请问这个航班有餐食吗？', pinyin: 'Qǐngwèn zhège hángbān yǒu cānshí ma?', vi: 'Cho hỏi chuyến bay này có đồ ăn không?', isCorrect: true, feedback: '餐食 = suất ăn. Các hãng bay TQ thường có cơm hoặc mì.', nextStepId: null }
        ],
        botResponse: { text: '有餐食的，祝您旅途愉快！', pinyin: 'Yǒu cānshí de, zhù nín lǚtú yúkuài!', vi: 'Có ạ, chúc bạn thượng lộ bình an!' }
      }
    ]
  },

  // ─── Scenario 7: Mua sắm ở chợ ────────────────────────────
  {
    id: 'market',
    title: 'Mua sắm ở chợ Trung Quốc',
    description: 'Bạn đang đi chợ ở Thành Đô. Hãy mặc cả và mua trái cây tươi bằng tiếng Trung!',
    difficulty: 'beginner',
    icon: '🏪',
    messages: [
      { sender: 'bot', text: '你好！想买点什么？都是今天刚到的，非常新鲜！', pinyin: 'Nǐ hǎo! Xiǎng mǎi diǎn shénme? Dōu shì jīntiān gāng dào de, fēicháng xīnxiān!', vi: 'Chào bạn! Muốn mua gì thế? Đều là hàng mới về hôm nay, rất tươi!' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '这个苹果多少钱一斤？', pinyin: 'Zhège píngguǒ duōshǎo qián yī jīn?', vi: 'Táo này bao nhiêu một cân?', isCorrect: true, feedback: '斤 (jīn) = cân (500g). Đơn vị cân ở chợ TQ là 斤 nhé!', nextStepId: 'step2' },
          { text: '草莓怎么卖？', pinyin: 'Cǎoméi zěnme mài?', vi: 'Dâu tây bán thế nào?', isCorrect: true, feedback: '怎么卖 = bán thế nào / giá bao nhiêu. Cách hỏi tự nhiên ở chợ!', nextStepId: 'step2' },
          { text: '给我来两斤猪肉。', pinyin: 'Gěi wǒ lái liǎng jīn zhūròu.', vi: 'Cho tôi hai cân thịt lợn.', isCorrect: true, feedback: '猪肉 = thịt lợn. 牛肉 = thịt bò, 鸡肉 = thịt gà.', nextStepId: 'step2' }
        ],
        botResponse: { text: '苹果八块钱一斤。草莓今天特价，十五块两斤！', pinyin: 'Píngguǒ bā kuài qián yī jīn. Cǎoméi jīntiān tèjià, shíwǔ kuài liǎng jīn!', vi: 'Táo 8 tệ một cân. Dâu hôm nay giá đặc biệt, 15 tệ hai cân!' }
      },
      {
        id: 'step2',
        options: [
          { text: '太贵了，能便宜点吗？十块两斤行不行？', pinyin: 'Tài guì le, néng piányi diǎn ma? Shí kuài liǎng jīn xíng bù xíng?', vi: 'Đắt quá, giảm được không? 10 tệ 2 cân được không?', isCorrect: true, feedback: 'Mặc cả điêu luyện! 行不行 = được không — câu hỏi mặc cả hiệu quả!', nextStepId: 'step3' },
          { text: '好的，我要两斤苹果。', pinyin: 'Hǎo de, wǒ yào liǎng jīn píngguǒ.', vi: 'OK, tôi lấy 2 cân táo.', isCorrect: true, feedback: 'Đúng rồi! 要 + số lượng = muốn mua bao nhiêu.', nextStepId: 'step3' }
        ],
        botResponse: { text: '行吧行吧，看你这么有诚意，十块两斤给你！还要别的吗？', pinyin: 'Xíng ba xíng ba, kàn nǐ zhème yǒu chéngyì, shí kuài liǎng jīn gěi nǐ! Hái yào bié de ma?', vi: 'Được được, thấy bạn thành tâm, 10 tệ 2 cân cho bạn! Còn gì nữa không?' }
      },
      {
        id: 'step3',
        options: [
          { text: '再要一斤橙子。一共多少钱？', pinyin: 'Zài yào yī jīn chéngzi. Yīgòng duōshǎo qián?', vi: 'Thêm một cân cam. Tổng cộng bao nhiêu?', isCorrect: true, feedback: '橙子 = cam. 一共 = tổng cộng. Rất chuyên nghiệp!', nextStepId: 'step4' },
          { text: '够了够了，多少钱？能微信支付吗？', pinyin: 'Gòu le gòu le, duōshǎo qián? Néng Wēixìn zhīfù ma?', vi: 'Đủ rồi đủ rồi, bao nhiêu? Trả WeChat được không?', isCorrect: true, feedback: '微信支付 = WeChat Pay. Ở chợ TQ quét mã WeChat là phổ biến!', nextStepId: 'step4' }
        ],
        botResponse: { text: '总共十八块。扫这个码支付。拿好，慢走啊！', pinyin: 'Zǒnggòng shíbā kuài. Sǎo zhège mǎ zhīfù. Ná hǎo, màn zǒu a!', vi: 'Tổng cộng 18 tệ. Quét mã này thanh toán. Cầm chắc nhé, đi cẩn thận!' }
      },
      {
        id: 'step4',
        options: [
          { text: '谢谢老板！', pinyin: 'Xièxiè lǎobǎn!', vi: 'Cảm ơn ông chủ!', isCorrect: true, feedback: '老板 = ông chủ. Gọi người bán hàng là 老板 rất lịch sự và thân thiện!', nextStepId: null }
        ],
        botResponse: { text: '不客气！下次再来啊！', pinyin: 'Bù kèqì! Xià cì zài lái a!', vi: 'Không có gì! Lần sau lại đến nhé!' }
      }
    ]
  },

  // ─── Scenario 8: Thăm nhà bạn Trung Quốc ─────────────────
  {
    id: 'visit_home',
    title: 'Thăm nhà bạn người Trung Quốc',
    description: 'Bạn được mời đến nhà bạn học người Trung Quốc chơi. Hãy giao tiếp lịch sự và thể hiện văn hóa!',
    difficulty: 'intermediate',
    icon: '🏠',
    messages: [
      { sender: 'bot', text: '欢迎欢迎！快进来坐！随便坐，别客气！', pinyin: 'Huānyíng huānyíng! Kuài jìnlái zuò! Suíbiàn zuò, bié kèqì!', vi: 'Chào mừng! Nhanh vào ngồi đi! Cứ tự nhiên, đừng khách sáo!' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '谢谢阿姨！这是送给您的水果。', pinyin: 'Xièxiè āyí! Zhè shì sòng gěi nín de shuǐguǒ.', vi: 'Cảm ơn cô! Đây là quà tặng cô ạ.', isCorrect: true, feedback: 'Tuyệt vời! Mang quà đến nhà là phép lịch sự cơ bản của người TQ. 阿姨 = cô/dì!', nextStepId: 'step2' },
          { text: '你家真漂亮！', pinyin: 'Nǐ jiā zhēn piàoliang!', vi: 'Nhà bạn đẹp thật!', isCorrect: true, feedback: 'Khen nhà là cách mở đầu câu chuyện tuyệt vời. 真漂亮 = thật đẹp!', nextStepId: 'step2' },
          { text: '我饿了，有吃的吗？', pinyin: 'Wǒ è le, yǒu chī de ma?', vi: 'Tôi đói rồi, có gì ăn không?', isCorrect: false, feedback: 'Hơi thẳng quá! Nên chào hỏi và khen nhà trước đã.', nextStepId: 'step1' }
        ],
        botResponse: { text: '哎呀，来就来嘛，还带什么礼物！太客气了！快坐下，我给你倒茶。', pinyin: 'Āiyā, lái jiù lái ma, hái dài shénme lǐwù! Tài kèqì le! Kuài zuòxià, wǒ gěi nǐ dào chá.', vi: 'Trời ơi, đến chơi là vui rồi, còn mang quà gì! Khách sáo quá! Mau ngồi xuống, tôi pha trà cho.' }
      },
      {
        id: 'step2',
        options: [
          { text: '谢谢！您太客气了。需要帮忙吗？', pinyin: 'Xièxiè! Nín tài kèqì le. Xūyào bāngmáng ma?', vi: 'Cảm ơn! Cô khách sáo quá. Cần cháu giúp gì không?', isCorrect: true, feedback: 'Rất lịch sự! Người TQ thích khách đề nghị giúp đỡ.', nextStepId: 'step3' },
          { text: '这茶真好喝！是什么茶？', pinyin: 'Zhè chá zhēn hǎohē! Shì shénme chá?', vi: 'Trà này ngon quá! Là trà gì vậy?', isCorrect: true, feedback: 'Khen trà của chủ nhà! 好喝 = ngon (đồ uống). Người TQ rất thích khen trà của họ.', nextStepId: 'step3' }
        ],
        botResponse: { text: '这是铁观音，福建的乌龙茶。不用帮忙，坐着就好。你们先聊，我去做饭。', pinyin: 'Zhè shì tiěguānyīn, Fújiàn de wūlóng chá. Bùyòng bāngmáng, zuòzhe jiù hǎo. Nǐmen xiān liáo, wǒ qù zuòfàn.', vi: 'Đây là trà Thiết Quan Âm, trà ô long Phúc Kiến. Không cần giúp đâu, cứ ngồi chơi. Các con nói chuyện đi, mẹ đi nấu cơm.' }
      },
      {
        id: 'step3',
        options: [
          { text: '阿姨做的菜真好吃！您太厉害了！', pinyin: 'Āyí zuò de cài zhēn hǎochī! Nín tài lìhài le!', vi: 'Cô nấu ngon quá! Cô giỏi thật!', isCorrect: true, feedback: 'Khen đồ ăn là văn hóa quan trọng nhất khi đến nhà người TQ! 厉害 = giỏi/đỉnh!', nextStepId: 'step4' },
          { text: '这个菜辣得刚刚好，我很喜欢。', pinyin: 'Zhège cài là de gānggāng hǎo, wǒ hěn xǐhuān.', vi: 'Món này cay vừa phải, tôi rất thích.', isCorrect: true, feedback: 'Tinh tế! Khen cụ thể một món ăn thể hiện bạn thực sự thưởng thức!', nextStepId: 'step4' }
        ],
        botResponse: { text: '喜欢就多吃点！来，再添一碗饭。', pinyin: 'Xǐhuān jiù duō chī diǎn! Lái, zài tiān yī wǎn fàn.', vi: 'Thích thì ăn nhiều vào! Nào, thêm bát cơm nữa.' }
      },
      {
        id: 'step4',
        options: [
          { text: '谢谢阿姨，我吃饱了。今天真开心！', pinyin: 'Xièxiè āyí, wǒ chī bǎo le. Jīntiān zhēn kāixīn!', vi: 'Cảm ơn cô, cháu no rồi. Hôm nay thật vui!', isCorrect: true, feedback: '说饱了 = nói đã no. Kết thúc bữa ăn lịch sự!', nextStepId: 'step5' },
          { text: '太好吃了，我还想再来一碗。', pinyin: 'Tài hǎochī le, wǒ hái xiǎng zài lái yī wǎn.', vi: 'Ngon quá, cháu muốn ăn thêm bát nữa.', isCorrect: true, feedback: 'Khen đến mức ăn thêm là niềm tự hào của người nấu! Chủ nhà sẽ rất vui!', nextStepId: 'step5' }
        ],
        botResponse: { text: '好好好，多吃点！年轻人就是要多吃。', pinyin: 'Hǎo hǎo hǎo, duō chī diǎn! Niánqīng rén jiùshì yào duō chī.', vi: 'Được được, ăn nhiều vào! Người trẻ phải ăn nhiều mới khỏe.' }
      },
      {
        id: 'step5',
        options: [
          { text: '时间不早了，我该走了。谢谢招待！', pinyin: 'Shíjiān bù zǎo le, wǒ gāi zǒu le. Xièxiè zhāodài!', vi: 'Không còn sớm nữa, tôi phải đi rồi. Cảm ơn sự tiếp đãi!', isCorrect: true, feedback: '招待 = chiêu đãi/tiếp đãi. Câu nói lịch sự khi ra về!', nextStepId: null },
          { text: '下次请来我家吃饭！', pinyin: 'Xià cì qǐng lái wǒ jiā chīfàn!', vi: 'Lần sau mời các bạn sang nhà tôi ăn cơm!', isCorrect: true, feedback: 'Đáp lễ rất văn hóa! Mời lại là thể hiện tình cảm qua lại!', nextStepId: null }
        ],
        botResponse: { text: '不再坐一会儿吗？...好吧，路上小心，下次再来玩啊！', pinyin: 'Bù zài zuò yīhuìr ma?... Hǎo ba, lùshàng xiǎoxīn, xià cì zài lái wán a!', vi: 'Không ngồi thêm chút nữa sao?... Thôi được rồi, đi đường cẩn thận, lần sau lại đến chơi nhé!' }
      }
    ]
  },

  // ─── Scenario 9: Ở quán cà phê ────────────────────────────
  {
    id: 'coffee',
    title: 'Ở quán cà phê Starbucks',
    description: 'Bạn vào một quán cà phê ở Bắc Kinh để làm việc. Hãy gọi đồ uống yêu thích của mình!',
    difficulty: 'beginner',
    icon: '☕',
    messages: [
      { sender: 'bot', text: '您好，欢迎光临！请问您喝点什么？', pinyin: 'Nín hǎo, huānyíng guānglín! Qǐngwèn nín hē diǎn shénme?', vi: 'Xin chào, hoan nghênh quý khách! Quý khách uống gì ạ?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我要一杯冰拿铁。', pinyin: 'Wǒ yào yī bēi bīng nátiě.', vi: 'Tôi muốn một cốc latte đá.', isCorrect: true, feedback: '拿铁 = latte. 冰 = đá. 热拿铁 = latte nóng. Rất chuẩn!', nextStepId: 'step2' },
          { text: '一杯美式咖啡，少冰。', pinyin: 'Yī bēi měishì kāfēi, shǎo bīng.', vi: 'Một cốc Americano, ít đá.', isCorrect: true, feedback: '美式咖啡 = Americano. 少冰 = ít đá. Hay lắm!', nextStepId: 'step2' },
          { text: '给我啤酒。', pinyin: 'Gěi wǒ píjiǔ.', vi: 'Cho tôi bia.', isCorrect: false, feedback: 'Đây là quán cà phê, không bán bia đâu!', nextStepId: 'step1' }
        ],
        botResponse: { text: '好的，冰拿铁。大杯还是中杯？', pinyin: 'Hǎo de, bīng nátiě. Dà bēi háishì zhōng bēi?', vi: 'Vâng, latte đá. Cốc lớn hay cốc vừa?' }
      },
      {
        id: 'step2',
        options: [
          { text: '大杯，谢谢。多少钱？', pinyin: 'Dà bēi, xièxiè. Duōshǎo qián?', vi: 'Cốc lớn, cảm ơn. Bao nhiêu tiền?', isCorrect: true, feedback: '32块 (32 tệ) cho latte đá size lớn ở Starbucks TQ. Rất hợp lý!', nextStepId: 'step3' },
          { text: '中杯就行了。可以手机支付吗？', pinyin: 'Zhōng bēi jiù xíng le. Kěyǐ shǒujī zhīfù ma?', vi: 'Cốc vừa là được. Trả bằng điện thoại được không?', isCorrect: true, feedback: '手机支付 = thanh toán di động. Ở TQ ai cũng dùng điện thoại trả tiền!', nextStepId: 'step3' }
        ],
        botResponse: { text: '大杯冰拿铁三十二块。请扫这个码支付。', pinyin: 'Dà bēi bīng nátiě sānshí èr kuài. Qǐng sǎo zhège mǎ zhīfù.', vi: 'Latte đá cốc lớn 32 tệ. Mời quét mã này thanh toán.' }
      },
      {
        id: 'step3',
        options: [
          { text: '已经付了。请问有WiFi吗？密码是多少？', pinyin: 'Yǐjīng fù le. Qǐngwèn yǒu WiFi ma? Mìmǎ shì duōshǎo?', vi: 'Đã trả rồi. Cho hỏi có WiFi không? Mật khẩu là gì?', isCorrect: true, feedback: '密码 = mật khẩu. Câu hỏi quen thuộc khi vào quán cà phê!', nextStepId: null },
          { text: '好的，这里有插座可以充电吗？', pinyin: 'Hǎo de, zhèlǐ yǒu chāzuò kěyǐ chōngdiàn ma?', vi: 'OK, ở đây có ổ cắm sạc pin không?', isCorrect: true, feedback: '插座 = ổ cắm điện. 充电 = sạc pin. Rất thực tế!', nextStepId: 'step4' }
        ],
        botResponse: { text: 'WiFi密码是八个八。插座在墙边就有。请慢用！', pinyin: 'WiFi mìmǎ shì bā gè bā. Chāzuò zài qiáng biān jiù yǒu. Qǐng màn yòng!', vi: 'Mật khẩu WiFi là 8 số 8. Ổ cắm ở cạnh tường. Mời dùng!' }
      },
      {
        id: 'step4',
        options: [
          { text: '你们有甜品吗？我想来一块蛋糕。', pinyin: 'Nǐmen yǒu tiánpǐn ma? Wǒ xiǎng lái yī kuài dàngāo.', vi: 'Có đồ ngọt không? Tôi muốn một miếng bánh.', isCorrect: true, feedback: '甜品 = đồ tráng miệng. 蛋糕 = bánh kem. Cà phê + bánh = bộ đôi hoàn hảo!', nextStepId: null },
          { text: '不用了，谢谢。有外卖杯吗？', pinyin: 'Búyòng le, xièxiè. Yǒu wàimài bēi ma?', vi: 'Không cần đâu, cảm ơn. Có cốc mang đi không?', isCorrect: true, feedback: '外卖 = mang đi / takeaway. Ở TQ gọi 外卖 cũng là gọi đồ giao tận nhà.', nextStepId: null }
        ],
        botResponse: { text: '今天有提拉米苏和芝士蛋糕，都是新鲜做的！外卖杯有的，我帮您打包。', pinyin: 'Jīntiān yǒu tílāmǐsū hé zhīshì dàngāo, dōu shì xīnxiān zuò de! Wàimài bēi yǒu de, wǒ bāng nín dǎbāo.', vi: 'Hôm nay có tiramisu và cheesecake, đều mới làm! Có cốc takeaway, để tôi gói cho bạn.' }
      }
    ]
  },

  // ─── Scenario 10: Ở hiệu thuốc ────────────────────────────
  {
    id: 'pharmacy',
    title: 'Mua thuốc ở hiệu thuốc',
    description: 'Bạn bị cảm nhẹ và cần ra hiệu thuốc mua thuốc. Hãy mô tả triệu chứng cho dược sĩ!',
    difficulty: 'beginner',
    icon: '💊',
    messages: [
      { sender: 'bot', text: '你好，请问哪里不舒服？', pinyin: 'Nǐ hǎo, qǐngwèn nǎlǐ bù shūfú?', vi: 'Xin chào, anh/chị khó chịu ở đâu?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我感冒了，打喷嚏，流鼻涕。', pinyin: 'Wǒ gǎnmào le, dǎ pēntì, liú bítì.', vi: 'Tôi bị cảm, hắt hơi, chảy nước mũi.', isCorrect: true, feedback: '打喷嚏 = hắt hơi, 流鼻涕 = chảy nước mũi. Mô tả rất chính xác!', nextStepId: 'step2' },
          { text: '我嗓子疼，有点咳嗽。', pinyin: 'Wǒ sǎngzi téng, yǒudiǎn késou.', vi: 'Tôi đau họng, hơi ho.', isCorrect: true, feedback: '嗓子疼 = đau họng, 咳嗽 = ho. Triệu chứng cảm điển hình!', nextStepId: 'step2' },
          { text: '我全身都疼。', pinyin: 'Wǒ quánshēn dōu téng.', vi: 'Tôi đau toàn thân.', isCorrect: false, feedback: 'Nên nói cụ thể hơn để dược sĩ tư vấn đúng thuốc!', nextStepId: 'step1' }
        ],
        botResponse: { text: '明白了，就是普通感冒。我给您拿点感冒药。有发烧吗？', pinyin: 'Míngbai le, jiùshì pǔtōng gǎnmào. Wǒ gěi nín ná diǎn gǎnmào yào. Yǒu fāshāo ma?', vi: 'Hiểu rồi, chỉ là cảm thường thôi. Tôi lấy thuốc cảm cho anh. Có sốt không?' }
      },
      {
        id: 'step2',
        options: [
          { text: '没有发烧，就是不舒服。', pinyin: 'Méiyǒu fāshāo, jiùshì bù shūfú.', vi: 'Không sốt, chỉ khó chịu thôi.', isCorrect: true, feedback: '发烧 = sốt. 没有发烧 = không sốt. Câu trả lời rõ ràng!', nextStepId: 'step3' },
          { text: '有一点发烧，三十七度五。', pinyin: 'Yǒu yīdiǎn fāshāo, sānshíqī dù wǔ.', vi: 'Hơi sốt, 37.5 độ.', isCorrect: true, feedback: '度 = độ. 三十七度五 = 37.5 độ. Nói chính xác rất tốt!', nextStepId: 'step3' }
        ],
        botResponse: { text: '不严重，吃两三天药就好了。药一天三次，一次两粒，饭后吃。', pinyin: 'Bù yánzhòng, chī liǎng sān tiān yào jiù hǎo le. Yào yī tiān sān cì, yī cì liǎng lì, fàn hòu chī.', vi: 'Không nặng, uống 2-3 ngày là khỏi. Thuốc ngày 3 lần, mỗi lần 2 viên, uống sau bữa ăn.' }
      },
      {
        id: 'step3',
        options: [
          { text: '好的，谢谢。还要注意什么吗？', pinyin: 'Hǎo de, xièxiè. Hái yào zhùyì shénme ma?', vi: 'OK, cảm ơn. Còn cần chú ý gì không?', isCorrect: true, feedback: '注意 = chú ý. Luôn hỏi thêm lời khuyên từ dược sĩ!', nextStepId: null },
          { text: '多少钱？可以用医保吗？', pinyin: 'Duōshǎo qián? Kěyǐ yòng yībǎo ma?', vi: 'Bao nhiêu tiền? Dùng bảo hiểm y tế được không?', isCorrect: true, feedback: '医保 = bảo hiểm y tế. Ở TQ nhiều hiệu thuốc chấp nhận bảo hiểm.', nextStepId: 'step4' }
        ],
        botResponse: { text: '一共二十五块。多喝热水，好好休息。祝你早日康复！', pinyin: 'Yīgòng èrshíwǔ kuài. Duō hē rè shuǐ, hǎohāo xiūxi. Zhù nǐ zǎorì kāngfù!', vi: 'Tổng cộng 25 tệ. Uống nhiều nước ấm, nghỉ ngơi tốt. Chúc bạn mau khỏe!' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，谢谢！这些药有什么副作用吗？', pinyin: 'Hǎo de, xièxiè! Zhèxiē yào yǒu shénme fùzuòyòng ma?', vi: 'OK cảm ơn! Mấy thuốc này có tác dụng phụ gì không?', isCorrect: true, feedback: '副作用 = tác dụng phụ. Luôn hỏi về tác dụng phụ khi mua thuốc mới!', nextStepId: null },
          { text: '好的，我记住了。能给我一个袋子吗？', pinyin: 'Hǎo de, wǒ jìzhù le. Néng gěi wǒ yī gè dàizi ma?', vi: 'OK tôi nhớ rồi. Cho tôi một cái túi được không?', isCorrect: true, feedback: '袋子 = túi. Ở TQ thường phải trả tiền túi (几毛钱) ở hiệu thuốc.', nextStepId: null }
        ],
        botResponse: { text: '这个药可能会有点犯困，建议不要开车。袋子里有说明书，不舒服的话随时回来。祝您早日康复！', pinyin: 'Zhège yào kěnéng huì yǒudiǎn fànkùn, jiànyì bùyào kāichē. Dàizi lǐ yǒu shuōmíngshū, bù shūfú de huà suíshí huílái. Zhù nín zǎorì kāngfù!', vi: 'Thuốc này có thể gây buồn ngủ, khuyên không nên lái xe. Trong túi có tờ hướng dẫn, không thoải mái thì quay lại bất cứ lúc nào. Chúc bạn mau khỏe!' }
      }
    ]
  },

  // ─── Scenario 11: Đi siêu thị ─────────────────────────────
  {
    id: 'supermarket',
    title: 'Đi siêu thị mua sắm',
    description: 'Bạn vào siêu thị ở Trung Quốc để mua đồ ăn và đồ dùng hàng ngày. Hãy tìm đồ và tự tính tiền!',
    difficulty: 'beginner',
    icon: '🏬',
    messages: [
      { sender: 'bot', text: '欢迎光临！请问需要什么帮助吗？', pinyin: 'Huānyíng guānglín! Qǐngwèn xūyào shénme bāngzhù ma?', vi: 'Chào mừng đến siêu thị! Cần giúp gì không ạ?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '请问牛奶在哪个货架？', pinyin: 'Qǐngwèn niúnǎi zài nǎge huòjià?', vi: 'Cho hỏi sữa ở kệ nào?', isCorrect: true, feedback: '货架 = kệ hàng. Cách hỏi rất tự nhiên trong siêu thị!', nextStepId: 'step2' },
          { text: '有打折的商品吗？', pinyin: 'Yǒu dǎzhé de shāngpǐn ma?', vi: 'Có đồ giảm giá không?', isCorrect: true, feedback: '打折 = giảm giá. Ở siêu thị TQ thường có khu vực打折 riêng!', nextStepId: 'step2' },
          { text: '厕所在哪里？', pinyin: 'Cèsuǒ zài nǎlǐ?', vi: 'Nhà vệ sinh ở đâu?', isCorrect: true, feedback: '厕所 = nhà vệ sinh. Câu hỏi cần thiết!', nextStepId: 'step2' }
        ],
        botResponse: { text: '牛奶在第二排，靠左边。打折商品在入口处有标示。', pinyin: 'Niúnǎi zài dì èr pái, kào zuǒbiān. Dǎzhé shāngpǐn zài rùkǒu chù yǒu biāoshì.', vi: 'Sữa ở kệ thứ hai, bên trái. Hàng giảm giá có biển ở lối vào.' }
      },
      {
        id: 'step2',
        options: [
          { text: '我要买面包、鸡蛋和水果。', pinyin: 'Wǒ yào mǎi miànbāo, jīdàn hé shuǐguǒ.', vi: 'Tôi muốn mua bánh mì, trứng và hoa quả.', isCorrect: true, feedback: 'Danh sách mua đồ rõ ràng! 面包 = bánh mì, 鸡蛋 = trứng.', nextStepId: 'step3' },
          { text: '这个牛奶今天到期吗？', pinyin: 'Zhège niúnǎi jīntiān dàoqī ma?', vi: 'Sữa này hết hạn hôm nay à?', isCorrect: true, feedback: '到期 = đến hạn/hết hạn. Kiểm tra hạn sử dụng rất quan trọng!', nextStepId: 'step3' }
        ],
        botResponse: { text: '不是的，这个牛奶还有一周才过期。收银台在那边，请排队结账。', pinyin: 'Bù shì de, zhège niúnǎi hái yǒu yī zhōu cái guòqī. Shōuyíntái zài nàbiān, qǐng páiduì jiézhàng.', vi: 'Không phải, sữa này còn một tuần mới hết hạn. Quầy thanh toán ở đằng kia, mời xếp hàng.' }
      },
      {
        id: 'step3',
        options: [
          { text: '请问购物袋多少钱？', pinyin: 'Qǐngwèn gòuwù dài duōshǎo qián?', vi: 'Cho hỏi túi mua sắm bao nhiêu tiền?', isCorrect: true, feedback: '购物袋 = túi mua sắm. Ở TQ túi nilon thường mất phí 0.5-1 tệ!', nextStepId: null },
          { text: '我用会员卡可以积分吗？', pinyin: 'Wǒ yòng huìyuán kǎ kěyǐ jīfēn ma?', vi: 'Tôi dùng thẻ thành viên tích điểm được không?', isCorrect: true, feedback: '会员卡 = thẻ thành viên. 积分 = tích điểm. Người TQ hay dùng thẻ tích điểm!', nextStepId: 'step4' }
        ],
        botResponse: { text: '购物袋五毛钱一个。有会员卡可以积分，年底能换礼品哦！', pinyin: 'Gòuwù dài wǔ máo qián yī gè. Yǒu huìyuán kǎ kěyǐ jīfēn, niándǐ néng huàn lǐpǐn ó!', vi: 'Túi mua sắm 5 hào một cái. Có thẻ thành viên được tích điểm, cuối năm đổi quà nhé!' }
      },
      {
        id: 'step4',
        options: [
          { text: '我没有会员卡，现在能办吗？', pinyin: 'Wǒ méiyǒu huìyuán kǎ, xiànzài néng bàn ma?', vi: 'Tôi không có thẻ thành viên, đăng ký bây giờ được không?', isCorrect: true, feedback: '办卡 = đăng ký thẻ. Siêu thị TQ thường làm thẻ miễn phí tại quầy!', nextStepId: null },
          { text: '我自己扫商品可以吗？有自助结账吗？', pinyin: 'Wǒ zìjǐ sǎo shāngpǐn kěyǐ ma? Yǒu zìzhù jiézhàng ma?', vi: 'Tôi tự quét hàng được không? Có tự thanh toán không?', isCorrect: true, feedback: '自助结账 = tự thanh toán (self-checkout). Siêu thị TQ có khu vực này!', nextStepId: null }
        ],
        botResponse: { text: '可以免费办会员卡，报手机号就行。自助结账在右边，扫商品码然后手机支付就可以。', pinyin: 'Kěyǐ miǎnfèi bàn huìyuán kǎ, bào shǒujī hào jiù xíng. Zìzhù jiézhàng zài yòubiān, sǎo shāngpǐn mǎ ránhòu shǒujī zhīfù jiù kěyǐ.', vi: 'Có thể làm thẻ miễn phí, báo số điện thoại là được. Self-checkout ở bên phải, quét mã hàng rồi trả bằng điện thoại.' }
      }
    ]
  },

  // ─── Scenario 12: Ở bưu điện / gửi hàng ──────────────────
  {
    id: 'post_office',
    title: 'Gửi hàng ở bưu điện',
    description: 'Bạn muốn gửi một bưu kiện từ Trung Quốc về Việt Nam. Hãy ra bưu điện và làm thủ tục gửi hàng!',
    difficulty: 'intermediate',
    icon: '📦',
    messages: [
      { sender: 'bot', text: '你好，请问要寄什么？寄到国内还是国外？', pinyin: 'Nǐ hǎo, qǐngwèn yào jì shénme? Jì dào guónèi háishì guówài?', vi: 'Xin chào, muốn gửi gì? Gửi trong nước hay nước ngoài?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我要寄一个包裹到越南。', pinyin: 'Wǒ yào jì yī gè bāoguǒ dào Yuènán.', vi: 'Tôi muốn gửi một bưu kiện về Việt Nam.', isCorrect: true, feedback: '包裹 = bưu kiện/gói hàng. 寄 = gửi. Câu nói hoàn chỉnh!', nextStepId: 'step2' },
          { text: '寄明信片到日本多少钱？', pinyin: 'Jì míngxìnpiàn dào Rìběn duōshǎo qián?', vi: 'Gửi bưu thiếp sang Nhật bao nhiêu tiền?', isCorrect: true, feedback: '明信片 = bưu thiếp. 日本 = Nhật Bản. Rõ ràng, chính xác!', nextStepId: 'step2' }
        ],
        botResponse: { text: '寄到越南的包裹。请把东西放在秤上称一下。里面是什么物品？', pinyin: 'Jì dào Yuènán de bāoguǒ. Qǐng bǎ dōngxi fàng zài chèng shàng chēng yīxià. Lǐmiàn shì shénme wùpǐn?', vi: 'Gửi về Việt Nam. Mời để đồ lên cân. Bên trong là đồ gì?' }
      },
      {
        id: 'step2',
        options: [
          { text: '是一些衣服和零食，大概两公斤。', pinyin: 'Shì yīxiē yīfu hé língshí, dàgài liǎng gōngjīn.', vi: 'Là quần áo và đồ ăn vặt, khoảng 2 kg.', isCorrect: true, feedback: '零食 = đồ ăn vặt. 公斤 = kg. Mô tả rất chi tiết!', nextStepId: 'step3' },
          { text: '是文件，很重要的合同。', pinyin: 'Shì wénjiàn, hěn zhòngyào de hétong.', vi: 'Là tài liệu, hợp đồng rất quan trọng.', isCorrect: true, feedback: '文件 = văn kiện/tài liệu. 合同 = hợp đồng. Nên gửi có bảo hiểm!', nextStepId: 'step3' }
        ],
        botResponse: { text: '好的，两公斤到越南大概一百二十块。空运十天到，海运要一个月。您选哪种？', pinyin: 'Hǎo de, liǎng gōngjīn dào Yuènán dàgài yībǎi èrshí kuài. Kōngyùn shí tiān dào, hǎiyùn yào yī gè yuè. Nín xuǎn nǎ zhǒng?', vi: 'Vâng, 2 kg gửi Việt Nam khoảng 120 tệ. Hàng không 10 ngày, đường biển 1 tháng. Anh chọn loại nào?' }
      },
      {
        id: 'step3',
        options: [
          { text: '空运吧，越快越好。要填什么单子？', pinyin: 'Kōngyùn ba, yuè kuài yuè hǎo. Yào tián shénme dānzi?', vi: 'Gửi máy bay đi, càng nhanh càng tốt. Cần điền giấy gì?', isCorrect: true, feedback: '空运 = đường hàng không. 单子 = tờ đơn/mẫu. Cần điền 报关单 (tờ khai hải quan)!', nextStepId: null },
          { text: '海运便宜，选海运。能追踪包裹吗？', pinyin: 'Hǎiyùn piányi, xuǎn hǎiyùn. Néng zhuīzōng bāoguǒ ma?', vi: 'Đường biển rẻ hơn, chọn đường biển. Có thể theo dõi bưu kiện không?', isCorrect: true, feedback: '追踪 = theo dõi. Ở TQ bưu điện có mã theo dõi (追踪号) cho mỗi kiện hàng!', nextStepId: 'step4' }
        ],
        botResponse: { text: '请填这张报关单和地址单。付完钱会给您追踪号码。谢谢！', pinyin: 'Qǐng tián zhè zhāng bàoguān dān hé dìzhǐ dān. Fù wán qián huì gěi nín zhuīzōng hàomǎ. Xièxiè!', vi: 'Mời điền tờ khai hải quan và form địa chỉ. Sau khi trả tiền sẽ có mã theo dõi. Cảm ơn!' }
      },
      {
        id: 'step4',
        options: [
          { text: '需要买保险吗？这个包裹比较贵重。', pinyin: 'Xūyào mǎi bǎoxiǎn ma? Zhège bāoguǒ bǐjiào guìzhòng.', vi: 'Có cần mua bảo hiểm không? Gói hàng này khá có giá trị.', isCorrect: true, feedback: '保险 = bảo hiểm. 贵重 = có giá trị. Nên mua bảo hiểm cho hàng giá trị!', nextStepId: null },
          { text: '好的，谢谢。请问有纸箱卖吗？', pinyin: 'Hǎo de, xièxiè. Qǐngwèn yǒu zhǐxiāng mài ma?', vi: 'OK cảm ơn. Bán thùng giấy không ạ?', isCorrect: true, feedback: '纸箱 = thùng các tông. Bưu điện TQ có bán hộp đóng hàng!', nextStepId: null }
        ],
        botResponse: { text: '建议您买保险，保价费是百分之一。纸箱我们有，小号五块，大号十块。我帮您打包吧！', pinyin: 'Jiànyì nín mǎi bǎoxiǎn, bǎojià fèi shì bǎi fēn zhī yī. Zhǐxiāng wǒmen yǒu, xiǎohào wǔ kuài, dàhào shí kuài. Wǒ bāng nín dǎbāo ba!', vi: 'Khuyên bạn mua bảo hiểm, phí bảo hiểm là 1%. Có thùng các tông, nhỏ 5 tệ to 10 tệ. Để tôi đóng gói cho bạn!' }
      }
    ]
  },

  // ─── Scenario 13: Gọi món ở nhà hàng ──────────────────────
  {
    id: 'restaurant',
    title: 'Gọi món ở nhà hàng Trung Quốc',
    description: 'Bạn đến một nhà hàng Trung Quốc với bạn bè. Hãy gọi món, gọi thêm nước và tính tiền!',
    difficulty: 'intermediate',
    icon: '🍜',
    messages: [
      { sender: 'bot', text: '欢迎光临！请问几位？这边请坐，这是菜单。', pinyin: 'Huānyíng guānglín! Qǐngwèn jǐ wèi? Zhè biān qǐng zuò, zhè shì càidān.', vi: 'Hoan nghênh quý khách! Mấy người ạ? Mời ngồi bên này, đây là menu.' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '两个人。有包间吗？', pinyin: 'Liǎng gè rén. Yǒu bāojiān ma?', vi: 'Hai người. Có phòng riêng không?', isCorrect: true, feedback: '包间 = phòng riêng / VIP room. Nhà hàng TQ thường có phòng riêng!', nextStepId: 'step2' },
          { text: '三位，给我们靠窗的位置。', pinyin: 'Sān wèi, gěi wǒmen kào chuāng de wèizhì.', vi: 'Ba người, cho chúng tôi chỗ gần cửa sổ.', isCorrect: true, feedback: '靠窗 = cạnh cửa sổ. Cách nói rất tự nhiên!', nextStepId: 'step2' }
        ],
        botResponse: { text: '好的，包间在二楼。这是菜单，点好了叫我。', pinyin: 'Hǎo de, bāojiān zài èr lóu. Zhè shì càidān, diǎn hǎo le jiào wǒ.', vi: 'Vâng, phòng riêng ở tầng 2. Đây là menu, gọi xong thì gọi tôi nhé.' }
      },
      {
        id: 'step2',
        options: [
          { text: '我们要一个宫保鸡丁、一个麻婆豆腐和一个炒青菜。', pinyin: 'Wǒmen yào yī gè Gōngbǎo jīdīng, yī gè Mápó dòufu hé yī gè chǎo qīngcài.', vi: 'Chúng tôi muốn một Kung Pao gà, một Đậu phụ Mapo và một rau xào.', isCorrect: true, feedback: '宫保鸡丁 = gà Kung Pao, 麻婆豆腐 = đậu phụ Mapo! Món kinh điển!', nextStepId: 'step3' },
          { text: '你们有什么推荐菜？', pinyin: 'Nǐmen yǒu shénme tuījiàn cài?', vi: 'Nhà hàng có món gì đề xuất?', isCorrect: true, feedback: '推荐菜 = món được đề xuất. Cách hỏi rất hay để khám phá ẩm thực!', nextStepId: 'step3' },
          { text: '我要一份蛋炒饭。', pinyin: 'Wǒ yào yī fèn dàn chǎo fàn.', vi: 'Tôi muốn một phần cơm rang trứng.', isCorrect: true, feedback: '蛋炒饭 = cơm rang trứng. Món đơn giản nhưng đúng chuẩn TQ!', nextStepId: 'step3' }
        ],
        botResponse: { text: '好的，都是招牌菜！要不要来点饮料？我们有可乐、雪碧和青岛啤酒。', pinyin: 'Hǎo de, dōu shì zhāopái cài! Yào bù yào lái diǎn yǐnliào? Wǒmen yǒu kělè, xuěbì hé Qīngdǎo píjiǔ.', vi: 'Vâng, đều là món đặc sắc! Có muốn gọi đồ uống không? Có cola, sprite và bia Thanh Đảo.' }
      },
      {
        id: 'step3',
        options: [
          { text: '来两瓶青岛啤酒，谢谢。', pinyin: 'Lái liǎng píng Qīngdǎo píjiǔ, xièxiè.', vi: 'Cho 2 chai bia Thanh Đảo, cảm ơn.', isCorrect: true, feedback: '青岛啤酒 = bia Thanh Đảo. Thương hiệu bia nổi tiếng nhất TQ!', nextStepId: 'step4' },
          { text: '我要一壶热茶就好。', pinyin: 'Wǒ yào yī hú rè chá jiù hǎo.', vi: 'Tôi chỉ cần một ấm trà nóng thôi.', isCorrect: true, feedback: '一壶 = một ấm. Trà là văn hóa không thể thiếu khi ăn ở TQ!', nextStepId: 'step4' }
        ],
        botResponse: { text: '好嘞！马上给您上菜。还需要什么随时叫我。', pinyin: 'Hǎo lei! Mǎshàng gěi nín shàng cài. Hái xūyào shénme suíshí jiào wǒ.', vi: 'Vâng ạ! Lên món ngay. Cần gì thêm cứ gọi tôi nhé.' }
      },
      {
        id: 'step4',
        options: [
          { text: '服务员，买单！可以刷卡吗？', pinyin: 'Fúwùyuán, mǎidān! Kěyǐ shuākǎ ma?', vi: 'Phục vụ ơi, tính tiền! Có thể quẹt thẻ không?', isCorrect: true, feedback: '买单 = tính tiền. 刷卡 = quẹt thẻ. Từ vựng cần thiết khi ăn xong!', nextStepId: null },
          { text: '这些菜打包，我要带走。', pinyin: 'Zhèxiē cài dǎbāo, wǒ yào dài zǒu.', vi: 'Mấy món này gói lại, tôi mang về.', isCorrect: true, feedback: '打包 = gói mang đi. Ở TQ gói đồ ăn thừa mang về rất phổ biến!', nextStepId: null }
        ],
        botResponse: { text: '一共一百八十六块。可以刷卡也可以用手机支付。这是打包的菜，慢走！', pinyin: 'Yīgòng yībǎi bāshíliù kuài. Kěyǐ shuākǎ yě kěyǐ yòng shǒujī zhīfù. Zhè shì dǎbāo de cài, màn zǒu!', vi: 'Tổng cộng 186 tệ. Có thể quẹt thẻ hoặc trả bằng điện thoại. Đây là đồ gói mang đi, đi cẩn thận nhé!' }
      }
    ]
  },

  // ─── Scenario 14: Thuê nhà ──────────────────────────────
  {
    id: 'rental',
    title: 'Thuê nhà ở Trung Quốc',
    description: 'Bạn cần tìm một căn hộ để thuê ở Thượng Hải. Hãy xem nhà, hỏi giá và thương lượng với chủ nhà!',
    difficulty: 'intermediate',
    icon: '🏠',
    messages: [
      { sender: 'bot', text: '你好，是来看房的吗？请进请进！这间是一室一厅，朝南采光很好。', pinyin: 'Nǐ hǎo, shì lái kàn fáng de ma? Qǐng jìn qǐng jìn! Zhè jiān shì yī shì yī tīng, cháo nán cǎiguāng hěn hǎo.', vi: 'Xin chào, đến xem nhà phải không? Mời vào! Căn này 1 phòng ngủ 1 phòng khách, hướng nam thoáng sáng.' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '房子看起来很干净。一个月多少钱？', pinyin: 'Fángzi kàn qǐlái hěn gānjìng. Yī gè yuè duōshǎo qián?', vi: 'Nhà trông sạch đấy. Một tháng bao nhiêu?', isCorrect: true, feedback: '干净 = sạch sẽ. Hỏi giá thuê luôn là việc đầu tiên!', nextStepId: 'step2' },
          { text: '这个小区安不安全？有保安吗？', pinyin: 'Zhège xiǎoqū ān bù ānquán? Yǒu bǎoān ma?', vi: 'Khu này an toàn không? Có bảo vệ không?', isCorrect: true, feedback: '小区 = khu dân cư. 保安 = bảo vệ. Hỏi an ninh rất quan trọng!', nextStepId: 'step2' },
          { text: '有没有家具和家电？', pinyin: 'Yǒu méiyǒu jiājù hé jiādiàn?', vi: 'Có đồ nội thất và thiết bị không?', isCorrect: true, feedback: '家具 = đồ nội thất. 家电 = thiết bị điện gia dụng.', nextStepId: 'step2' }
        ],
        botResponse: { text: '家具家电都齐全。房租一个月三千五，押一付三。水电煤气另算。', pinyin: 'Jiājù jiādiàn dōu qíquán. Fángzū yī gè yuè sānqiān wǔ, yā yī fù sān. Shuǐdiàn méiqì lìng suàn.', vi: 'Nội thất thiết bị đầy đủ. Tiền thuê 3500 tệ/tháng, đặt cọc 1 tháng trả 3 tháng. Điện nước ga tính riêng.' }
      },
      {
        id: 'step2',
        options: [
          { text: '三千五有点贵，能便宜一点吗？', pinyin: 'Sānqiān wǔ yǒudiǎn guì, néng piányi yīdiǎn ma?', vi: '3500 hơi đắt, giảm được không?', isCorrect: true, feedback: 'Mặc cả tiền thuê nhà là chuyện thường ở TQ! Cứ thử hỏi xem.', nextStepId: 'step3' },
          { text: '押一付三是怎样的？可以月付吗？', pinyin: 'Yā yī fù sān shì zěnyàng de? Kěyǐ yuè fù ma?', vi: 'Đặt cọc 1 trả 3 là thế nào? Trả hàng tháng được không?', isCorrect: true, feedback: '押一付三 = cọc 1 tháng, trả 3 tháng một lần. Hỏi rõ điều khoản trước khi ký!', nextStepId: 'step3' },
          { text: '我能看看合同吗？', pinyin: 'Wǒ néng kàn kàn hétong ma?', vi: 'Tôi xem hợp đồng được không?', isCorrect: true, feedback: '合同 = hợp đồng. Luôn đọc kỹ hợp đồng trước khi ký!', nextStepId: 'step3' }
        ],
        botResponse: { text: '合同在这里。如果年付的话可以三千三一个月。最短租期一年。', pinyin: 'Hétong zài zhèlǐ. Rúguǒ nián fù dehuà kěyǐ sānqiān sān yī gè yuè. Zuì duǎn zūqī yī nián.', vi: 'Hợp đồng đây. Nếu trả theo năm thì 3300 tệ/tháng. Thời hạn thuê tối thiểu 1 năm.' }
      },
      {
        id: 'step3',
        options: [
          { text: '好，我决定租了。什么时候可以搬进来？', pinyin: 'Hǎo, wǒ juédìng zū le. Shénme shíhòu kěyǐ bān jìnlái?', vi: 'OK, tôi quyết định thuê. Khi nào có thể dọn vào?', isCorrect: true, feedback: '搬进来 = dọn vào. Chốt hợp đồng xong là dọn vào ở ngay!', nextStepId: 'step4' },
          { text: '我再考虑考虑，可以留个联系方式吗？', pinyin: 'Wǒ zài kǎolǜ kǎolǜ, kěyǐ liú gè liánxì fāngshì ma?', vi: 'Tôi suy nghĩ thêm, để lại cách liên lạc được không?', isCorrect: true, feedback: '考虑 = cân nhắc. 联系方式 = phương thức liên lạc. Không phải vội!', nextStepId: 'step4' }
        ],
        botResponse: { text: '随时可以搬！明天就可以入住。这是钥匙和门禁卡。如果有什么问题随时联系我。', pinyin: 'Suíshí kěyǐ bān! Míngtiān jiù kěyǐ rùzhù. Zhè shì yàoshi hé ménjìn kǎ. Rúguǒ yǒu shénme wèntí suíshí liánxì wǒ.', vi: 'Lúc nào cũng được! Mai có thể vào ở. Đây là chìa khóa và thẻ ra vào. Có vấn đề gì liên hệ tôi bất cứ lúc nào.' }
      },
      {
        id: 'step4',
        options: [
          { text: '太好了！请问附近有超市和地铁站吗？', pinyin: 'Tài hǎo le! Qǐngwèn fùjìn yǒu chāoshì hé dìtiě zhàn ma?', vi: 'Tuyệt vời! Gần đây có siêu thị và ga tàu điện không?', isCorrect: true, feedback: '地铁站 = ga tàu điện ngầm. Cực kỳ quan trọng khi chọn chỗ ở!', nextStepId: null },
          { text: '好的，谢谢！网费怎么交？', pinyin: 'Hǎo de, xièxiè! Wǎng fèi zěnme jiāo?', vi: 'OK cảm ơn! Tiền mạng đóng thế nào?', isCorrect: true, feedback: '网费 = tiền internet. Ở TQ đa số tự đăng ký mạng riêng.', nextStepId: null }
        ],
        botResponse: { text: '出门左转两百米有超市，地铁站在小区门口。网费自己报装，一个月大概一百块。欢迎入住！', pinyin: 'Chū mén zuǒ zhuǎn liǎng bǎi mǐ yǒu chāoshì, dìtiě zhàn zài xiǎoqū ménkǒu. Wǎng fèi zìjǐ bào zhuāng, yī gè yuè dàgài yī bǎi kuài. Huānyíng rùzhù!', vi: 'Ra cửa rẽ trái 200m có siêu thị, ga tàu điện ở cổng khu nhà. Tiền mạng tự đăng ký, khoảng 100 tệ/tháng. Chào mừng đến ở!' }
      }
    ]
  },

  // ─── Scenario 15: Mở tài khoản ngân hàng ─────────────────
  {
    id: 'bank',
    title: 'Mở tài khoản ngân hàng',
    description: 'Bạn cần mở một tài khoản ngân hàng tại Trung Quốc. Hãy đến ngân hàng và làm thủ tục với nhân viên!',
    difficulty: 'advanced',
    icon: '🏦',
    messages: [
      { sender: 'bot', text: '您好，欢迎光临中国银行。请问需要办理什么业务？', pinyin: 'Nín hǎo, huānyíng guānglín Zhōngguó Yínháng. Qǐngwèn xūyào bànlǐ shénme yèwù?', vi: 'Xin chào, hoan nghênh đến Ngân hàng Trung Quốc. Cần làm giao dịch gì ạ?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我想开一个储蓄账户。需要什么材料？', pinyin: 'Wǒ xiǎng kāi yī gè chǔxù zhànghù. Xūyào shénme cáiliào?', vi: 'Tôi muốn mở một tài khoản tiết kiệm. Cần giấy tờ gì?', isCorrect: true, feedback: '储蓄账户 = tài khoản tiết kiệm. 材料 = tài liệu/giấy tờ.', nextStepId: 'step2' },
          { text: '我来办银行卡，外国人可以开户吗？', pinyin: 'Wǒ lái bàn yínháng kǎ, wàiguó rén kěyǐ kāihù ma?', vi: 'Tôi đến làm thẻ ngân hàng, người nước ngoài mở tài khoản được không?', isCorrect: true, feedback: '外国人 = người nước ngoài. TQ cho phép người nước ngoài mở tài khoản!', nextStepId: 'step2' }
        ],
        botResponse: { text: '可以的，外国人开户需要护照和签证，还要有在中国的手机号和住址。您带护照了吗？', pinyin: 'Kěyǐ de, wàiguó rén kāihù xūyào hùzhào hé qiānzhèng, hái yào yǒu zài Zhōngguó de shǒujī hào hé zhùzhǐ. Nín dài hùzhào le ma?', vi: 'Được ạ. Người nước ngoài mở tài khoản cần hộ chiếu và visa, còn có số điện thoại TQ và địa chỉ. Anh mang hộ chiếu chưa?' }
      },
      {
        id: 'step2',
        options: [
          { text: '带了，这是我的护照和工作签证。', pinyin: 'Dài le, zhè shì wǒ de hùzhào hé gōngzuò qiānzhèng.', vi: 'Mang rồi, đây là hộ chiếu và visa lao động của tôi.', isCorrect: true, feedback: '工作签证 = visa lao động. Đây là hai loại giấy tờ quan trọng nhất!', nextStepId: 'step3' },
          { text: '我有护照，但是签证是旅游签可以吗？', pinyin: 'Wǒ yǒu hùzhào, dànshì qiānzhèng shì lǚyóu qiān kěyǐ ma?', vi: 'Tôi có hộ chiếu nhưng visa du lịch thì được không?', isCorrect: true, feedback: '旅游签 = visa du lịch. Thường cần visa dài hạn mới mở được tài khoản.', nextStepId: 'step3' }
        ],
        botResponse: { text: '好的，我先复印一下您的证件。请填一下这张开户申请表，包括手机号和住址。', pinyin: 'Hǎo de, wǒ xiān fùyìn yīxià nín de zhèngjiàn. Qǐng tián yīxià zhè zhāng kāihù shēnqǐng biǎo, bāokuò shǒujī hào hé zhùzhǐ.', vi: 'Vâng, tôi photo giấy tờ trước. Mời điền đơn đăng ký mở tài khoản, bao gồm số điện thoại và địa chỉ.' }
      },
      {
        id: 'step3',
        options: [
          { text: '好的，请问最低存款是多少？', pinyin: 'Hǎo de, qǐngwèn zuì dī cúnkuǎn shì duōshǎo?', vi: 'OK, cho hỏi số dư tối thiểu là bao nhiêu?', isCorrect: true, feedback: '最低存款 = số dư tối thiểu. Một số ngân hàng TQ yêu cầu giữ tối thiểu!', nextStepId: 'step4' },
          { text: '这个账户可以在手机上管理吗？有APP吗？', pinyin: 'Zhège zhànghù kěyǐ zài shǒujī shàng guǎnlǐ ma? Yǒu APP ma?', vi: 'Tài khoản này quản lý trên điện thoại được không? Có app không?', isCorrect: true, feedback: 'APP = ứng dụng mobile. Các ngân hàng TQ đều có app riêng!', nextStepId: 'step4' }
        ],
        botResponse: { text: '没有最低存款要求。我们有手机银行APP，可以转账、缴费、查余额。我现在帮您开户。', pinyin: 'Méiyǒu zuì dī cúnkuǎn yāoqiú. Wǒmen yǒu shǒujī yínháng APP, kěyǐ zhuǎnzhàng, jiǎofèi, chá yú\'é. Wǒ xiànzài bāng nín kāihù.', vi: 'Không có yêu cầu số dư tối thiểu. Chúng tôi có app ngân hàng, có thể chuyển khoản, đóng phí, xem số dư. Để tôi mở tài khoản cho bạn.' }
      },
      {
        id: 'step4',
        options: [
          { text: '谢谢！多久能拿到银行卡？', pinyin: 'Xièxiè! Duōjiǔ néng ná dào yínháng kǎ?', vi: 'Cảm ơn! Bao lâu nhận được thẻ?', isCorrect: true, feedback: '银行卡 = thẻ ngân hàng. Thường nhận ngay hoặc gửi qua bưu điện trong vòng 1 tuần!', nextStepId: null },
          { text: '好的，这是我的手机号。请帮我开通网上银行。', pinyin: 'Hǎo de, zhè shì wǒ de shǒujī hào. Qǐng bāng wǒ kāitōng wǎngshàng yínháng.', vi: 'OK, đây là số điện thoại của tôi. Làm ơn mở ngân hàng trực tuyến giúp tôi.', isCorrect: true, feedback: '网上银行 = ngân hàng trực tuyến. Cần kích hoạt để chuyển tiền online!', nextStepId: null }
        ],
        botResponse: { text: '卡马上可以给您。这是您的卡和网银U盾。初始密码在信封里，请尽快修改。欢迎使用中国银行！', pinyin: 'Kǎ mǎshàng kěyǐ gěi nín. Zhè shì nín de kǎ hé wǎng yín U dùn. Chūshǐ mìmǎ zài xìnfēng lǐ, qǐng jǐnkuài xiūgǎi. Huānyíng shǐyòng Zhōngguó Yínháng!', vi: 'Thẻ có ngay. Đây là thẻ và U盾 (token bảo mật) của bạn. Mật khẩu ban đầu trong phong bì, hãy đổi sớm. Chào mừng sử dụng Ngân hàng Trung Quốc!' }
      }
    ]
  },

  // ─── Scenario 16: Gọi điện thoại đặt lịch ──────────────
  {
    id: 'phone_call',
    title: 'Gọi điện thoại đặt lịch hẹn',
    description: 'Bạn cần gọi điện thoại để đặt lịch hẹn khám bệnh. Hãy nghe và trả lời qua điện thoại bằng tiếng Trung!',
    difficulty: 'advanced',
    icon: '📞',
    messages: [
      { sender: 'bot', text: '喂，您好！这里是友谊医院预约中心。请问有什么可以帮助您的？', pinyin: 'Wèi, nín hǎo! Zhèlǐ shì Yǒuyì Yīyuàn yùyuē zhōngxīn. Qǐngwèn yǒu shénme kěyǐ bāngzhù nín de?', vi: 'A lô, xin chào! Đây là trung tâm đặt lịch bệnh viện Hữu Nghị. Tôi có thể giúp gì cho bạn?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '你好，我想预约下周二看内科。', pinyin: 'Nǐ hǎo, wǒ xiǎng yùyuē xià zhōu èr kàn nèikē.', vi: 'Xin chào, tôi muốn đặt lịch khám nội khoa thứ 2 tuần sau.', isCorrect: true, feedback: '预约 = đặt trước. 内科 = khoa nội. Câu đặt lịch chuẩn!', nextStepId: 'step2' },
          { text: '请问你们周末上班吗？我想约周六。', pinyin: 'Qǐngwèn nǐmen zhōumò shàngbān ma? Wǒ xiǎng yuē zhōuliù.', vi: 'Cho hỏi cuối tuần có làm việc không? Tôi muốn đặt thứ 7.', isCorrect: true, feedback: '周末 = cuối tuần. 上班 = làm việc. Nhiều bệnh viện TQ làm cả thứ 7!', nextStepId: 'step2' }
        ],
        botResponse: { text: '下周二内科可以，上午十点和下午两点都有号。您方便哪个时间？', pinyin: 'Xià zhōu èr nèikē kěyǐ, shàngwǔ shí diǎn hé xiàwǔ liǎng diǎn dōu yǒu hào. Nín fāngbiàn nǎge shíjiān?', vi: 'Thứ 2 tuần sau khoa nội được, sáng 10h và chiều 2h đều còn số. Bạn tiện lúc nào?' }
      },
      {
        id: 'step2',
        options: [
          { text: '上午十点吧。需要带什么证件？', pinyin: 'Shàngwǔ shí diǎn ba. Xūyào dài shénme zhèngjiàn?', vi: 'Sáng 10h đi. Cần mang giấy tờ gì?', isCorrect: true, feedback: '证件 = giấy tờ tùy thân. Khi đi khám nhớ mang 身份证 (CMND) nhé!', nextStepId: 'step3' },
          { text: '下午两点。我能约王医生吗？', pinyin: 'Xiàwǔ liǎng diǎn. Wǒ néng yuē Wáng yīshēng ma?', vi: 'Chiều 2h. Tôi có thể đặt bác sĩ Vương không?', isCorrect: true, feedback: 'Bệnh viện TQ cho phép chọn bác sĩ theo yêu cầu.', nextStepId: 'step3' }
        ],
        botResponse: { text: '好的，上午十点王医生有号。请带上身份证和医保卡。请留下您的姓名和手机号。', pinyin: 'Hǎo de, shàngwǔ shí diǎn Wáng yīshēng yǒu hào. Qǐng dài shàng shēnfèn zhèng hé yībǎo kǎ. Qǐng liú xià nín de xìngmíng hé shǒujī hào.', vi: 'Vâng, sáng 10h bác sĩ Vương còn số. Mang theo CMND và thẻ bảo hiểm. Xin để lại họ tên và số điện thoại.' }
      },
      {
        id: 'step3',
        options: [
          { text: '我叫张三，手机号13800138000。', pinyin: 'Wǒ jiào Zhāng Sān, shǒujī hào yāo sān bā líng líng yāo sān bā líng líng líng.', vi: 'Tôi tên Trương Tam, số điện thoại 13800138000.', isCorrect: true, feedback: 'Đọc số điện thoại: 1=yāo, 2=liǎng, 0=líng. Ở TQ hay dùng 幺 cho số 1!', nextStepId: 'step4' },
          { text: '我姓李，手机号是…你能打给我吗？', pinyin: 'Wǒ xìng Lǐ, shǒujī hào shì… Nǐ néng dǎ gěi wǒ ma?', vi: 'Tôi họ Lý, số điện thoại là... Anh gọi cho tôi được không?', isCorrect: false, feedback: 'Nên đọc số điện thoại trực tiếp để nhân viên ghi lại nhé!', nextStepId: 'step3' }
        ],
        botResponse: { text: '好的，张三先生，下周二上午十点，内科王医生。我们会发短信确认。谢谢！', pinyin: 'Hǎo de, Zhāng Sān xiānsheng, xià zhōu èr shàngwǔ shí diǎn, nèikē Wáng yīshēng. Wǒmen huì fā duǎnxìn quèrèn. Xièxiè!', vi: 'Vâng, anh Trương Tam, thứ 2 tuần sau 10h sáng, khoa nội bác sĩ Vương. Chúng tôi sẽ gửi tin nhắn xác nhận. Cảm ơn!' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，谢谢！我准时到。', pinyin: 'Hǎo de, xièxiè! Wǒ zhǔnshí dào.', vi: 'OK cảm ơn! Tôi sẽ đến đúng giờ.', isCorrect: true, feedback: '准时 = đúng giờ. Người TQ rất coi trọng giờ giấc!', nextStepId: null },
          { text: '如果我去不了，可以取消预约吗？', pinyin: 'Rúguǒ wǒ qù bù liǎo, kěyǐ qǔxiāo yùyuē ma?', vi: 'Nếu tôi không đi được, có thể hủy lịch không?', isCorrect: true, feedback: '取消 = hủy bỏ. 预约 = cuộc hẹn. Nên hủy trước 24h.', nextStepId: null }
        ],
        botResponse: { text: '可以的，提前一天打电话取消就行。祝您健康！再见！', pinyin: 'Kěyǐ de, tíqián yī tiān dǎ diànhuà qǔxiāo jiù xíng. Zhù nín jiànkāng! Zàijiàn!', vi: 'Được ạ, gọi hủy trước 1 ngày là được. Chúc bạn khỏe! Tạm biệt!' }
      }
    ]
  },

  // ─── Scenario 17: Ở tiệm cắt tóc ──────────────────────────
  {
    id: 'barber',
    title: 'Cắt tóc ở tiệm',
    description: 'Bạn vào một tiệm cắt tóc ở Trung Quốc. Hãy nói kiểu tóc bạn muốn và giao tiếp với thợ cắt tóc!',
    difficulty: 'intermediate',
    icon: '💇',
    messages: [
      { sender: 'bot', text: '您好，欢迎光临！想剪头发还是做发型？', pinyin: 'Nín hǎo, huānyíng guānglín! Xiǎng jiǎn tóufa háishì zuò fàxíng?', vi: 'Xin chào! Muốn cắt tóc hay tạo kiểu?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '我想剪头发，剪短一点就好。', pinyin: 'Wǒ xiǎng jiǎn tóufa, jiǎn duǎn yīdiǎn jiù hǎo.', vi: 'Tôi muốn cắt tóc, cắt ngắn một chút thôi.', isCorrect: true, feedback: '剪头发 = cắt tóc. 剪短 = cắt ngắn. Câu nói cơ bản khi vào tiệm!', nextStepId: 'step2' },
          { text: '我想换个发型，有什么推荐吗？', pinyin: 'Wǒ xiǎng huàn gè fàxíng, yǒu shénme tuījiàn ma?', vi: 'Tôi muốn đổi kiểu tóc, có gợi ý gì không?', isCorrect: true, feedback: '发型 = kiểu tóc. Hỏi thợ cắt tóc gợi ý là cách hay!', nextStepId: 'step2' },
          { text: '给我剃光头。', pinyin: 'Gěi wǒ tì guāngtóu.', vi: 'Cạo đầu trọc cho tôi.', isCorrect: true, feedback: '光头 = đầu trọc! Cũng được, nhưng suy nghĩ kỹ trước khi cạo nhé!', nextStepId: 'step2' }
        ],
        botResponse: { text: '好的，请先洗头。这边请坐。你想剪多短？刘海要修一下吗？', pinyin: 'Hǎo de, qǐng xiān xǐ tóu. Zhè biān qǐng zuò. Nǐ xiǎng jiǎn duō duǎn? Liúhǎi yào xiū yīxià ma?', vi: 'Vâng, mời gội đầu trước. Bạn muốn cắt bao nhiêu ngắn? Có cần sửa mái không?' }
      },
      {
        id: 'step2',
        options: [
          { text: '剪短两厘米就行，刘海修一下。', pinyin: 'Jiǎn duǎn liǎng límǐ jiù xíng, liúhǎi xiū yīxià.', vi: 'Cắt ngắn 2cm thôi, sửa mái một chút.', isCorrect: true, feedback: '厘米 = cm. 刘海 = tóc mái. Nói số đo cụ thể rất chuyên nghiệp!', nextStepId: 'step3' },
          { text: '你看着剪吧，相信你的技术。', pinyin: 'Nǐ kànzhe jiǎn ba, xiāngxìn nǐ de jìshù.', vi: 'Anh cắt đẹp là được, tin tay nghề anh.', isCorrect: true, feedback: '技术 = tay nghề. Khen thợ trước khi cắt là cách hay để được phục vụ tốt!', nextStepId: 'step3' }
        ],
        botResponse: { text: '好嘞！保证让你满意。剪完再给你吹一下。', pinyin: 'Hǎo lei! Bǎozhèng ràng nǐ mǎnyì. Jiǎn wán zài gěi nǐ chuī yīxià.', vi: 'OK! Đảm bảo anh hài lòng. Cắt xong sấy cho anh luôn.' }
      },
      {
        id: 'step3',
        options: [
          { text: '剪得不错！多少钱？', pinyin: 'Jiǎn dé bùcuò! Duōshǎo qián?', vi: 'Cắt đẹp đấy! Bao nhiêu tiền?', isCorrect: true, feedback: '不错 = không tồi. Khen thợ xong rồi hỏi giá là đúng thứ tự!', nextStepId: 'step4' },
          { text: '有点短了，不过还行吧。多少钱？', pinyin: 'Yǒudiǎn duǎn le, bùguò hái xíng ba. Duōshǎo qián?', vi: 'Hơi ngắn, nhưng cũng tạm được. Bao nhiêu?', isCorrect: false, feedback: 'Nên nói ý kiến khi cắt, không thì khó sửa sau khi đã cắt xong!', nextStepId: 'step3' }
        ],
        botResponse: { text: '男士剪发三十块，女士剪发五十块。办会员卡打八折。', pinyin: 'Nánshì jiǎn fà sānshí kuài, nǚshì jiǎn fà wǔshí kuài. Bàn huìyuán kǎ dǎ bā zhé.', vi: 'Cắt tóc nam 30 tệ, nữ 50 tệ. Làm thẻ thành viên giảm 20%.' }
      },
      {
        id: 'step4',
        options: [
          { text: '好的，给你现金。', pinyin: 'Hǎo de, gěi nǐ xiànjīn.', vi: 'OK, đưa tiền mặt.', isCorrect: true, feedback: '现金 = tiền mặt. Ở tiệm cắt tóc nhỏ vẫn nhận tiền mặt.', nextStepId: null },
          { text: '我办一张会员卡，下次再来。', pinyin: 'Wǒ bàn yī zhāng huìyuán kǎ, xià cì zài lái.', vi: 'Tôi làm thẻ thành viên, lần sau lại đến.', isCorrect: true, feedback: '办卡 = làm thẻ. Thường được giảm giá và tích điểm!', nextStepId: null },
          { text: '微信支付可以吗？', pinyin: 'Wēixìn zhīfù kěyǐ ma?', vi: 'Trả WeChat được không?', isCorrect: true, feedback: 'Tất nhiên! Ở TQ tiệm nhỏ cũng có WeChat Pay!', nextStepId: null }
        ],
        botResponse: { text: '欢迎下次再来！洗完头三天别洗太勤，对头发好。再见！', pinyin: 'Huānyíng xià cì zài lái! Xǐ wán tóu sān tiān bié xǐ tài qín, duì tóufa hǎo. Zàijiàn!', vi: 'Lần sau lại đến nhé! Sau khi cắt 3 ngày đừng gội đầu nhiều quá, tốt cho tóc. Tạm biệt!' }
      }
    ]
  },

  // ─── Scenario 18: Sửa điện thoại / sửa đồ ─────────────────
  {
    id: 'repair',
    title: 'Sửa điện thoại / đồ điện tử',
    description: 'Điện thoại của bạn bị hỏng màn hình và bạn cần ra tiệm sửa đồ điện tử ở Trung Quốc. Hãy nói vấn đề và hỏi giá!',
    difficulty: 'intermediate',
    icon: '🔧',
    messages: [
      { sender: 'bot', text: '你好，手机坏了吗？什么问题？', pinyin: 'Nǐ hǎo, shǒujī huài le ma? Shénme wèntí?', vi: 'Chào bạn, hỏng điện thoại à? Vấn đề gì thế?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '手机屏幕摔碎了，能换屏吗？多少钱？', pinyin: 'Shǒujī píngmù shuāi suì le, néng huàn píng ma? Duōshǎo qián?', vi: 'Màn hình điện thoại vỡ rồi, thay màn được không? Bao nhiêu?', isCorrect: true, feedback: '屏幕 = màn hình. 换屏 = thay màn. Máy TQ sửa rẻ hơn nhiều so với VN!', nextStepId: 'step2' },
          { text: '电池不耐用了，换电池多少钱？', pinyin: 'Diànchí bù nàiyòng le, huàn diànchí duōshǎo qián?', vi: 'Pin không trụ được nữa, thay pin bao nhiêu?', isCorrect: true, feedback: '电池 = pin. 不耐用 = không bền/dùng không được lâu.', nextStepId: 'step2' },
          { text: '手机开不了机了。', pinyin: 'Shǒujī kāi bù liǎo jī le.', vi: 'Điện thoại không mở được nữa.', isCorrect: true, feedback: '开不了机 = không mở máy được. Cần kiểm tra mainboard.', nextStepId: 'step2' }
        ],
        botResponse: { text: '我看看。换屏的话国产屏两百，原装屏三百五。电池换一块一百二。', pinyin: 'Wǒ kàn kàn. Huàn píng dehuà guóchǎn píng liǎng bǎi, yuánzhuāng píng sānbǎi wǔ. Diànchí huàn yī kuài yībǎi èr.', vi: 'Để tôi xem. Thay màn hình loại TQ 200 tệ, zin 350 tệ. Thay pin 120 tệ.' }
      },
      {
        id: 'step2',
        options: [
          { text: '换国产屏吧，便宜一点。多久能修好？', pinyin: 'Huàn guóchǎn píng ba, piányi yīdiǎn. Duōjiǔ néng xiū hǎo?', vi: 'Thay màn TQ đi, rẻ hơn. Bao lâu sửa xong?', isCorrect: true, feedback: '国产 = sản xuất trong nước. 原装 = chính hãng. Chọn 国产 rẻ hơn.', nextStepId: 'step3' },
          { text: '原装屏吧，质量好。能便宜一点吗？', pinyin: 'Yuánzhuāng píng ba, zhìliàng hǎo. Néng piányi yīdiǎn ma?', vi: 'Màn zin đi, chất lượng tốt. Giảm được không?', isCorrect: true, feedback: 'Mặc cả ở tiệm sửa đồ TQ cũng được! Thử hỏi xem.', nextStepId: 'step3' }
        ],
        botResponse: { text: '二十分钟就好，你在这等会儿。先帮你备份数据吧？', pinyin: 'Èrshí fēnzhōng jiù hǎo, nǐ zài zhè děng huìr. Xiān bāng nǐ bèifèn shùjù ba?', vi: '20 phút xong, anh chờ ở đây nhé. Backup dữ liệu trước không?' }
      },
      {
        id: 'step3',
        options: [
          { text: '好的，先备份到电脑里。谢谢！', pinyin: 'Hǎo de, xiān bèifèn dào diànnǎo lǐ. Xièxiè!', vi: 'OK, backup vào máy tính trước. Cảm ơn!', isCorrect: true, feedback: '备份 = sao lưu. 数据 = dữ liệu. Rất quan trọng trước khi sửa!', nextStepId: 'step4' },
          { text: '不用备份了，直接修吧。', pinyin: 'Búyòng bèifèn le, zhíjiē xiū ba.', vi: 'Khỏi backup, sửa luôn đi.', isCorrect: false, feedback: 'Rủi ro lắm! Nên backup trước khi sửa nhé.', nextStepId: 'step3' }
        ],
        botResponse: { text: '好！已经备份好了。现在开始修，您坐一会儿，有WiFi。', pinyin: 'Hǎo! Yǐjīng bèifèn hǎo le. Xiànzài kāishǐ xiū, nín zuò yīhuìr, yǒu WiFi.', vi: 'OK! Backup xong rồi. Giờ bắt đầu sửa, anh ngồi chơi, có WiFi.' }
      },
      {
        id: 'step4',
        options: [
          { text: '修好了吗？我看看效果。不错，多少钱？', pinyin: 'Xiū hǎo le ma? Wǒ kàn kàn xiàoguǒ. Bùcuò, duōshǎo qián?', vi: 'Sửa xong chưa? Tôi xem thử. Đẹp đấy, bao nhiêu?', isCorrect: true, feedback: '效果 = hiệu quả. Kiểm tra kỹ trước khi trả tiền nhé!', nextStepId: null },
          { text: '修好了，谢谢！有保修吗？', pinyin: 'Xiū hǎo le, xièxiè! Yǒu bǎoxiū ma?', vi: 'Sửa xong rồi, cảm ơn! Có bảo hành không?', isCorrect: true, feedback: '保修 = bảo hành. Các tiệm uy tín thường bảo hành 1-3 tháng!', nextStepId: null }
        ],
        botResponse: { text: '修好了，您看看。国产屏保三个月。一共两百块。欢迎下次光临！', pinyin: 'Xiū hǎo le, nín kàn kàn. Guóchǎn píng bǎo sān gè yuè. Yīgòng liǎng bǎi kuài. Huānyíng xià cì guānglín!', vi: 'Sửa xong rồi, anh xem đi. Màn TQ bảo hành 3 tháng. Tổng cộng 200 tệ. Lần sau lại đến nhé!' }
      }
    ]
  },

  // ─── Scenario 19: Đi xem phim ──────────────────────────────
  {
    id: 'cinema',
    title: 'Đi xem phim ở rạp',
    description: 'Bạn rủ bạn đi xem phim ở rạp Trung Quốc. Hãy mua vé, chọn phim và chọn đồ ăn!',
    difficulty: 'beginner',
    icon: '🎬',
    messages: [
      { sender: 'bot', text: '你好，欢迎光临！今天想看什么电影？', pinyin: 'Nǐ hǎo, huānyíng guānglín! Jīntiān xiǎng kàn shénme diànyǐng?', vi: 'Chào bạn, chào mừng đến rạp! Hôm nay muốn xem phim gì?' }
    ],
    steps: [
      {
        id: 'step1',
        options: [
          { text: '今天有什么电影在放？我想看动作片。', pinyin: 'Jīntiān yǒu shénme diànyǐng zài fàng? Wǒ xiǎng kàn dòngzuò piàn.', vi: 'Hôm nay có phim gì đang chiếu? Tôi muốn xem phim hành động.', isCorrect: true, feedback: '动作片 = phim hành động. Nói rõ thể loại mình thích!', nextStepId: 'step2' },
          { text: '最近很火的《流浪地球3》还有票吗？', pinyin: 'Zuìjìn hěn huǒ de «Liúlàng Dìqiú Sān» hái yǒu piào ma?', vi: 'Phim "The Wandering Earth 3" đang hot còn vé không?', isCorrect: true, feedback: '火 = hot/nổi tiếng. 流浪地球 = Thảm cầu lưu lạc — bom tấn TQ!', nextStepId: 'step2' },
          { text: '有英文电影吗？', pinyin: 'Yǒu Yīngwén diànyǐng ma?', vi: 'Có phim tiếng Anh không?', isCorrect: true, feedback: 'Rạp TQ có chiếu phim nước ngoài, thường có phụ đề Trung!', nextStepId: 'step2' }
        ],
        botResponse: { text: '《流浪地球3》今天有好几场。下午两点半、五点二十和晚上八点。想看哪场？', pinyin: '«Liúlàng Dìqiú Sān» jīntiān yǒu hǎo jǐ chǎng. Xiàwǔ liǎng diǎn bàn, wǔ diǎn èrshí hé wǎnshàng bā diǎn. Xiǎng kàn nǎ chǎng?', vi: '"The Wandering Earth 3" hôm nay có nhiều suất. 2:30 chiều, 5:20 chiều và 8 giờ tối. Xem suất nào?' }
      },
      {
        id: 'step2',
        options: [
          { text: '晚上八点吧。两张票多少钱？', pinyin: 'Wǎnshàng bā diǎn ba. Liǎng zhāng piào duōshǎo qián?', vi: 'Suất 8h tối đi. Hai vé bao nhiêu?', isCorrect: true, feedback: '张 = lượng từ cho vé. 两张票 = hai vé. Câu hỏi chuẩn!', nextStepId: 'step3' },
          { text: '下午两点半的，有情侣座吗？', pinyin: 'Xiàwǔ liǎng diǎn bàn de, yǒu qínglǚ zuò ma?', vi: 'Suất 2:30 chiều, có ghế đôi không?', isCorrect: true, feedback: '情侣座 = ghế đôi (couple seat). Rạp TQ có loại ghế này!', nextStepId: 'step3' }
        ],
        botResponse: { text: '晚上八点，普通票一张六十，两张一百二。3D电影要加十块。', pinyin: 'Wǎnshàng bā diǎn, pǔtōng piào yī zhāng liùshí, liǎng zhāng yībǎi èr. 3D diànyǐng yào jiā shí kuài.', vi: 'Suất 8h tối, vé thường 60 tệ/vé, hai vé 120 tệ. Phim 3D thêm 10 tệ.' }
      },
      {
        id: 'step3',
        options: [
          { text: '来两份爆米花和两杯可乐。', pinyin: 'Lái liǎng fèn bàomǐhuā hé liǎng bēi kělè.', vi: 'Cho hai phần bỏng ngô và hai cốc cola.', isCorrect: true, feedback: '爆米花 = bỏng ngô. Ở rạp TQ combo bỏng + nước rẻ hơn mua lẻ!', nextStepId: 'step4' },
          { text: '不用了，谢谢。能选座位吗？', pinyin: 'Búyòng le, xièxiè. Néng xuǎn zuòwèi ma?', vi: 'Thôi, cảm ơn. Chọn ghế được không?', isCorrect: true, feedback: '选座位 = chọn chỗ. Rạp TQ cho chọn ghế trên sơ đồ!', nextStepId: 'step4' }
        ],
        botResponse: { text: '爆米花大份二十五，中份十八。可乐八块一杯。总的一百七十九。这边选座位。', pinyin: 'Bàomǐhuā dà fèn èrshíwǔ, zhōng fèn shíbā. Kělè bā kuài yī bēi. Zǒng de yībǎi qīshíjiǔ. Zhè biān xuǎn zuòwèi.', vi: 'Bỏng ngô lớn 25 tệ, vừa 18 tệ. Cola 8 tệ/cốc. Tổng cộng 179 tệ. Mời chọn ghế bên này.' }
      },
      {
        id: 'step4',
        options: [
          { text: '选第六排中间的位置。手机支付可以吗？', pinyin: 'Xuǎn dì liù pái zhōngjiān de wèizhì. Shǒujī zhīfù kěyǐ ma?', vi: 'Chọn hàng 6 ở giữa. Trả bằng điện thoại được không?', isCorrect: true, feedback: '中间 = ở giữa. Mua vé online ở TQ có thể chọn trước chỗ!', nextStepId: null },
          { text: '这电影有多长？几点结束？', pinyin: 'Zhè diànyǐng yǒu duō cháng? Jǐ diǎn jiéshù?', vi: 'Phim này dài bao lâu? Mấy giờ kết thúc?', isCorrect: true, feedback: '多长 = dài bao lâu (thời gian). Hỏi để tính giờ về!', nextStepId: null }
        ],
        botResponse: { text: '电影两个小时，十点十分结束。总共一百七十九块，扫这个码支付。祝您观影愉快！', pinyin: 'Diànyǐng liǎng gè xiǎoshí, shí diǎn shí fēn jiéshù. Zǒnggòng yībǎi qīshíjiǔ kuài, sǎo zhège mǎ zhīfù. Zhù nín guānyǐng yúkuài!', vi: 'Phim 2 tiếng, kết thúc lúc 10h10. Tổng cộng 179 tệ, quét mã này thanh toán. Chúc bạn xem phim vui vẻ!' }
      }
    ]
  }
];

// ============================================================
// 3. SURVIVAL GUIDES — 8 rich guide entries
// ============================================================
export const survivalGuides = [
  // ─── Guide 1: Gọi Trà Sữa ──────────────────────────────
  {
    id: 'milk_tea_guide',
    title: 'Cách gọi Trà Sữa ở Trung Quốc',
    icon: '🧋',
    category: 'food',
    sections: [
      {
        heading: 'Các loại trà sữa phổ biến',
        content: 'Ở TQ, trà sữa (奶茶 nǎichá) là thức uống quốc dân. Từ quán vỉa hè tới thương hiệu lớn như 喜茶 (Xǐchá - Heytea), 蜜雪冰城 (Mìxuě Bīngchéng - Mixue) đều có.',
        phrases: [
          { cn: '珍珠奶茶', pinyin: 'zhēnzhū nǎichá', vi: 'Trà sữa trân châu' },
          { cn: '乌龙奶茶', pinyin: 'wūlóng nǎichá', vi: 'Trà sữa ô long' },
          { cn: '抹茶拿铁', pinyin: 'mǒchá nátie', vi: 'Matcha latte' },
          { cn: '芋泥波波', pinyin: 'yùní bōbō', vi: 'Khoai môn trân châu' },
          { cn: '杨枝甘露', pinyin: 'yángzhī gānlù', vi: 'Chè xoài bưởi' },
          { cn: '柠檬茶', pinyin: 'níngméng chá', vi: 'Trà chanh' }
        ]
      },
      {
        heading: 'Cách chọn size, đường, đá',
        content: 'Khi gọi, nhân viên sẽ hỏi bạn chọn kích cỡ (大杯/中杯), độ đường (糖分 tángfèn) và lượng đá (冰量 bīngliàng).',
        phrases: [
          { cn: '大杯', pinyin: 'dà bēi', vi: 'Cốc lớn' },
          { cn: '中杯', pinyin: 'zhōng bēi', vi: 'Cốc vừa' },
          { cn: '全糖', pinyin: 'quán táng', vi: 'Full đường (100%)' },
          { cn: '七分糖', pinyin: 'qī fēn táng', vi: 'Bảy phần đường (70%)' },
          { cn: '半糖', pinyin: 'bàn táng', vi: 'Nửa đường (50%)' },
          { cn: '三分糖', pinyin: 'sān fēn táng', vi: 'Ba phần đường (30%)' },
          { cn: '无糖', pinyin: 'wú táng', vi: 'Không đường' },
          { cn: '正常冰', pinyin: 'zhèngcháng bīng', vi: 'Đá bình thường' },
          { cn: '少冰', pinyin: 'shǎo bīng', vi: 'Ít đá' },
          { cn: '去冰', pinyin: 'qù bīng', vi: 'Bỏ đá' },
          { cn: '常温', pinyin: 'chángwēn', vi: 'Nhiệt độ thường' },
          { cn: '热的', pinyin: 'rè de', vi: 'Nóng' }
        ]
      },
      {
        heading: 'Topping phổ biến',
        content: 'Nhiều quán cho phép thêm topping (加料 jiāliào). Đây là những topping thường gặp:',
        phrases: [
          { cn: '珍珠', pinyin: 'zhēnzhū', vi: 'Trân châu' },
          { cn: '椰果', pinyin: 'yēguǒ', vi: 'Thạch dừa' },
          { cn: '布丁', pinyin: 'bùdīng', vi: 'Pudding' },
          { cn: '芋圆', pinyin: 'yùyuán', vi: 'Viên khoai môn' },
          { cn: '红豆', pinyin: 'hóngdòu', vi: 'Đậu đỏ' },
          { cn: '奶盖', pinyin: 'nǎigài', vi: 'Kem phô mai (cheese foam)' }
        ]
      }
    ]
  },

  // ─── Guide 2: WeChat Pay & Alipay ──────────────────────
  {
    id: 'mobile_payment',
    title: 'WeChat Pay & Alipay — Thanh toán di động',
    icon: '💳',
    category: 'payment',
    sections: [
      {
        heading: 'Tại sao phải biết?',
        content: 'Ở Trung Quốc, gần như mọi thứ đều thanh toán qua điện thoại. Tiền mặt (现金 xiànjīn) rất ít khi được chấp nhận, đặc biệt ở thành phố lớn.',
        phrases: [
          { cn: '手机支付', pinyin: 'shǒujī zhīfù', vi: 'Thanh toán bằng điện thoại' },
          { cn: '扫码', pinyin: 'sǎo mǎ', vi: 'Quét mã (QR)' },
          { cn: '付款码', pinyin: 'fùkuǎn mǎ', vi: 'Mã thanh toán' },
          { cn: '收款码', pinyin: 'shōukuǎn mǎ', vi: 'Mã nhận tiền' }
        ]
      },
      {
        heading: 'Cách thiết lập WeChat Pay (微信支付)',
        content: 'Bước 1: Tải WeChat (微信 Wēixìn). Bước 2: Đăng ký tài khoản bằng số điện thoại. Bước 3: Vào 我 (Tôi) → 服务 (Dịch vụ) → liên kết thẻ ngân hàng TQ hoặc nạp tiền.',
        phrases: [
          { cn: '绑定银行卡', pinyin: 'bǎngdìng yínháng kǎ', vi: 'Liên kết thẻ ngân hàng' },
          { cn: '充值', pinyin: 'chōngzhí', vi: 'Nạp tiền' },
          { cn: '余额', pinyin: 'yú\'é', vi: 'Số dư' },
          { cn: '转账', pinyin: 'zhuǎnzhàng', vi: 'Chuyển khoản' }
        ]
      },
      {
        heading: 'Các câu hữu ích khi thanh toán',
        content: 'Khi đến quầy thanh toán, bạn chỉ cần nói phương thức và quét mã.',
        phrases: [
          { cn: '我扫你还是你扫我？', pinyin: 'Wǒ sǎo nǐ háishì nǐ sǎo wǒ?', vi: 'Tôi quét bạn hay bạn quét tôi?' },
          { cn: '可以用微信支付吗？', pinyin: 'Kěyǐ yòng Wēixìn zhīfù ma?', vi: 'Dùng WeChat Pay được không?' },
          { cn: '支付成功了', pinyin: 'Zhīfù chénggōng le', vi: 'Thanh toán thành công rồi' },
          { cn: '没有网络，付不了', pinyin: 'Méiyǒu wǎngluò, fù bù liǎo', vi: 'Không có mạng, không thanh toán được' }
        ]
      }
    ]
  },

  // ─── Guide 3: Từ lóng giới trẻ TQ ──────────────────────
  {
    id: 'slang_guide',
    title: 'Từ lóng giới trẻ Trung Quốc',
    icon: '🗣️',
    category: 'slang',
    sections: [
      {
        heading: 'Từ lóng trên mạng phổ biến',
        content: 'Giới trẻ TQ dùng rất nhiều từ lóng trên WeChat, Douyin (TikTok TQ), Weibo. Biết những từ này sẽ giúp bạn hiểu văn hóa mạng TQ.',
        phrases: [
          { cn: '666', pinyin: 'liù liù liù', vi: 'Quá giỏi, quá đỉnh (vì 溜 liù = trơn tru, thuần thục)' },
          { cn: '牛逼 / 牛', pinyin: 'niúbī / niú', vi: 'Bá đạo, ghê vậy (khen ngợi)' },
          { cn: '哈哈哈', pinyin: 'hāhāhā', vi: 'Hahaha (cười, giống "lol")' },
          { cn: '呵呵', pinyin: 'hēhē', vi: 'Hehe (nhưng mang ý mỉa mai, khinh thường!)' },
          { cn: '内卷', pinyin: 'nèijuǎn', vi: 'Cạnh tranh khốc liệt vô nghĩa (involution)' },
          { cn: '躺平', pinyin: 'tǎng píng', vi: 'Nằm yên, bỏ cuộc, không cố gắng nữa (lie flat)' },
          { cn: '摆烂', pinyin: 'bǎi làn', vi: 'Mặc kệ, buông xuôi (bản nâng cấp của 躺平)' },
          { cn: 'YYDS', pinyin: 'yǒngyuǎn de shén', vi: 'Vĩnh viễn là thần = GOAT (永远的神)' },
          { cn: '绝绝子', pinyin: 'jué jué zi', vi: 'Tuyệt vời quá, quá đỉnh' },
          { cn: '社死', pinyin: 'shè sǐ', vi: 'Chết xã hội = ngại muốn chui xuống đất' }
        ]
      },
      {
        heading: 'Biểu cảm và emoji TQ',
        content: 'Người TQ cũng dùng emoji/sticker khác với VN. Ví dụ: 😊 ở TQ có thể mang ý mỉa mai (giống 呵呵). Sticker trên WeChat mới là cách thể hiện cảm xúc chính.',
        phrases: [
          { cn: '表情包', pinyin: 'biǎoqíng bāo', vi: 'Gói sticker/meme' },
          { cn: '斗图', pinyin: 'dòu tú', vi: 'Chiến sticker (gửi sticker qua lại chọc nhau)' },
          { cn: '点赞', pinyin: 'diǎn zàn', vi: 'Like / thả tim' },
          { cn: '转发', pinyin: 'zhuǎnfā', vi: 'Chia sẻ / repost' }
        ]
      }
    ]
  },

  // ─── Guide 4: Đi xe bus / metro ────────────────────────
  {
    id: 'transport_guide',
    title: 'Đi xe bus & Metro ở Trung Quốc',
    icon: '🚇',
    category: 'transport',
    sections: [
      {
        heading: 'Đi Metro (地铁 dìtiě)',
        content: 'Metro ở TQ rất tiện và rẻ. Bạn có thể mua vé tại máy bán vé tự động hoặc dùng app. Nhớ qua máy soi an ninh (安检 ānjiǎn) trước khi vào.',
        phrases: [
          { cn: '地铁站', pinyin: 'dìtiě zhàn', vi: 'Ga metro' },
          { cn: '几号线', pinyin: 'jǐ hào xiàn', vi: 'Tuyến số mấy' },
          { cn: '换乘', pinyin: 'huànchéng', vi: 'Chuyển tuyến' },
          { cn: '下一站', pinyin: 'xià yī zhàn', vi: 'Trạm tiếp theo' },
          { cn: '终点站', pinyin: 'zhōngdiǎn zhàn', vi: 'Trạm cuối' },
          { cn: '请注意安全', pinyin: 'qǐng zhùyì ānquán', vi: 'Xin chú ý an toàn' },
          { cn: '请先下后上', pinyin: 'qǐng xiān xià hòu shàng', vi: 'Vui lòng xuống trước lên sau' }
        ]
      },
      {
        heading: 'Đi xe bus (公交车 gōngjiāo chē)',
        content: 'Xe bus ở TQ có thể thanh toán bằng thẻ 交通卡 (jiāotōng kǎ) hoặc quét mã QR. Giá thường là 1-2 tệ.',
        phrases: [
          { cn: '公交车', pinyin: 'gōngjiāo chē', vi: 'Xe bus' },
          { cn: '公交卡', pinyin: 'gōngjiāo kǎ', vi: 'Thẻ xe bus' },
          { cn: '上车', pinyin: 'shàng chē', vi: 'Lên xe' },
          { cn: '下车', pinyin: 'xià chē', vi: 'Xuống xe' },
          { cn: '到站了', pinyin: 'dào zhàn le', vi: 'Tới trạm rồi' },
          { cn: '请问到...怎么走？', pinyin: 'Qǐngwèn dào... zěnme zǒu?', vi: 'Xin hỏi đến... đi thế nào?' }
        ]
      },
      {
        heading: 'Hỏi đường cơ bản',
        content: 'Khi cần hỏi đường, bạn có thể nhờ người qua đường hoặc dùng app 高德地图 (Gaode Map) / 百度地图 (Baidu Map).',
        phrases: [
          { cn: '请问...在哪里？', pinyin: 'Qǐngwèn...zài nǎlǐ?', vi: 'Xin hỏi ... ở đâu?' },
          { cn: '离这里远吗？', pinyin: 'Lí zhèlǐ yuǎn ma?', vi: 'Cách đây xa không?' },
          { cn: '往前走', pinyin: 'wǎng qián zǒu', vi: 'Đi thẳng phía trước' },
          { cn: '往左拐', pinyin: 'wǎng zuǒ guǎi', vi: 'Rẽ trái' },
          { cn: '往右拐', pinyin: 'wǎng yòu guǎi', vi: 'Rẽ phải' }
        ]
      }
    ]
  },

  // ─── Guide 5: Gọi đồ ăn qua Meituan ───────────────────
  {
    id: 'meituan_guide',
    title: 'Gọi đồ ăn qua Meituan (美团外卖)',
    icon: '🛵',
    category: 'food',
    sections: [
      {
        heading: 'Meituan là gì?',
        content: '美团外卖 (Měituán Wàimài) là app giao đồ ăn lớn nhất TQ, tương tự GrabFood hay ShopeeFood ở VN. App thứ hai phổ biến là 饿了么 (Èle me — "Đói rồi à?").',
        phrases: [
          { cn: '外卖', pinyin: 'wàimài', vi: 'Đồ ăn giao tận nơi / delivery' },
          { cn: '下单', pinyin: 'xià dān', vi: 'Đặt đơn' },
          { cn: '配送', pinyin: 'pèisòng', vi: 'Giao hàng' },
          { cn: '骑手', pinyin: 'qíshǒu', vi: 'Shipper (người giao hàng)' }
        ]
      },
      {
        heading: 'Các bước đặt đồ ăn',
        content: 'Bước 1: Mở app, chọn nhà hàng. Bước 2: Chọn món (选菜 xuǎn cài). Bước 3: Thêm vào giỏ hàng (加入购物车 jiārù gòuwù chē). Bước 4: Xác nhận địa chỉ và thanh toán.',
        phrases: [
          { cn: '菜单', pinyin: 'càidān', vi: 'Menu / Thực đơn' },
          { cn: '加入购物车', pinyin: 'jiārù gòuwù chē', vi: 'Thêm vào giỏ hàng' },
          { cn: '结算', pinyin: 'jiésuàn', vi: 'Thanh toán / Tính tiền' },
          { cn: '满减', pinyin: 'mǎn jiǎn', vi: 'Giảm giá khi đạt mức tối thiểu' },
          { cn: '配送费', pinyin: 'pèisòng fèi', vi: 'Phí giao hàng' },
          { cn: '预计送达时间', pinyin: 'yùjì sòng dá shíjiān', vi: 'Thời gian giao dự kiến' }
        ]
      },
      {
        heading: 'Nhắn tin cho shipper',
        content: 'Đôi khi shipper sẽ gọi hoặc nhắn tin cho bạn. Đây là một số câu thường gặp:',
        phrases: [
          { cn: '你好，外卖到了，请下楼取。', pinyin: 'Nǐ hǎo, wàimài dào le, qǐng xià lóu qǔ.', vi: 'Xin chào, đồ ăn tới rồi, xuống lấy nhé.' },
          { cn: '请放在门口，谢谢。', pinyin: 'Qǐng fàng zài ménkǒu, xièxiè.', vi: 'Để trước cửa giúp, cảm ơn.' },
          { cn: '好的，马上下来。', pinyin: 'Hǎo de, mǎshàng xià lái.', vi: 'OK, xuống ngay.' },
          { cn: '送错了', pinyin: 'sòng cuò le', vi: 'Giao nhầm rồi' }
        ]
      }
    ]
  },

  // ─── Guide 6: Văn hóa tip & chia tiền ──────────────────
  {
    id: 'tipping_culture',
    title: 'Văn hóa Tip & Chia tiền ở Trung Quốc',
    icon: '💰',
    category: 'culture',
    sections: [
      {
        heading: 'Có cần tip không?',
        content: 'Câu trả lời ngắn gọn: KHÔNG. Ở Trung Quốc, không có văn hóa tip (小费 xiǎofèi). Thậm chí, tip có thể khiến người nhận cảm thấy bị xúc phạm hoặc bối rối.',
        phrases: [
          { cn: '小费', pinyin: 'xiǎofèi', vi: 'Tiền tip' },
          { cn: '不用找了', pinyin: 'bú yòng zhǎo le', vi: 'Không cần thối (cách tip gián tiếp duy nhất)' },
          { cn: '这是给你的', pinyin: 'zhè shì gěi nǐ de', vi: 'Cái này cho bạn' }
        ]
      },
      {
        heading: 'Chia tiền khi ăn nhóm',
        content: 'Người TQ thường tranh nhau trả tiền (抢着买单 qiǎng zhe mǎidān) thay vì chia đều. Nếu ai mời bạn ăn, đừng cố chia tiền — hãy nhận lời và lần sau mời lại.',
        phrases: [
          { cn: '我来买单', pinyin: 'wǒ lái mǎidān', vi: 'Để tôi trả' },
          { cn: '今天我请客', pinyin: 'jīntiān wǒ qǐngkè', vi: 'Hôm nay tôi mời' },
          { cn: '下次我请', pinyin: 'xià cì wǒ qǐng', vi: 'Lần sau tôi mời' },
          { cn: 'AA制', pinyin: 'AA zhì', vi: 'Chia đều (giới trẻ hay dùng)' },
          { cn: '抢着买单', pinyin: 'qiǎng zhe mǎidān', vi: 'Tranh nhau trả tiền' },
          { cn: '别客气', pinyin: 'bié kèqi', vi: 'Đừng khách sáo' }
        ]
      }
    ]
  },

  // ─── Guide 7: Gõ tiếng Trung trên điện thoại ──────────
  {
    id: 'typing_chinese',
    title: 'Gõ tiếng Trung trên điện thoại',
    icon: '⌨️',
    category: 'tech',
    sections: [
      {
        heading: 'Phương pháp nhập liệu Pinyin',
        content: 'Cách phổ biến nhất là dùng bàn phím Pinyin (拼音输入法 pīnyīn shūrù fǎ). Bạn gõ pinyin không dấu, điện thoại sẽ gợi ý chữ Hán. Ví dụ: gõ "nihao" → chọn 你好.',
        phrases: [
          { cn: '拼音输入法', pinyin: 'pīnyīn shūrù fǎ', vi: 'Phương pháp nhập bằng pinyin' },
          { cn: '手写输入', pinyin: 'shǒuxiě shūrù', vi: 'Nhập bằng viết tay' },
          { cn: '语音输入', pinyin: 'yǔyīn shūrù', vi: 'Nhập bằng giọng nói' },
          { cn: '键盘', pinyin: 'jiànpán', vi: 'Bàn phím' }
        ]
      },
      {
        heading: 'Cách cài đặt bàn phím tiếng Trung',
        content: 'iPhone: Vào Settings → General → Keyboard → Add Keyboard → Chinese Simplified (Pinyin). Android: Vào Cài đặt → Ngôn ngữ → Thêm bàn phím → 中文简体拼音.',
        phrases: [
          { cn: '设置', pinyin: 'shèzhì', vi: 'Cài đặt' },
          { cn: '添加键盘', pinyin: 'tiānjiā jiànpán', vi: 'Thêm bàn phím' },
          { cn: '简体中文', pinyin: 'jiǎntǐ Zhōngwén', vi: 'Tiếng Trung giản thể' },
          { cn: '繁体中文', pinyin: 'fántǐ Zhōngwén', vi: 'Tiếng Trung phồn thể' }
        ]
      },
      {
        heading: 'Mẹo gõ nhanh',
        content: 'Gõ chữ cái đầu của mỗi âm tiết: "bkq" → 不客气. Dùng tính năng gợi ý (联想 liánxiǎng) để chọn từ nhanh hơn. Học cách gõ các ký tự đặc biệt: "v" thay cho "ü" (ví dụ: gõ "nv" → 女).',
        phrases: [
          { cn: '联想功能', pinyin: 'liánxiǎng gōngnéng', vi: 'Tính năng gợi ý từ' },
          { cn: '候选词', pinyin: 'hòuxuǎn cí', vi: 'Từ gợi ý (candidates)' },
          { cn: '切换键盘', pinyin: 'qiēhuàn jiànpán', vi: 'Chuyển đổi bàn phím' }
        ]
      }
    ]
  },

  // ─── Guide 8: Phỏng vấn xin việc ──────────────────────
  {
    id: 'job_interview',
    title: 'Phỏng vấn xin việc bằng tiếng Trung',
    icon: '💼',
    category: 'culture',
    sections: [
      {
        heading: 'Giới thiệu bản thân',
        content: 'Khi phỏng vấn (面试 miànshì), phần tự giới thiệu (自我介绍 zìwǒ jièshào) là quan trọng nhất. Chuẩn bị khoảng 1-2 phút.',
        phrases: [
          { cn: '面试官您好', pinyin: 'Miànshì guān nín hǎo', vi: 'Chào anh/chị phỏng vấn' },
          { cn: '我叫...，来自越南', pinyin: 'Wǒ jiào..., láizì Yuènán', vi: 'Tôi tên..., đến từ Việt Nam' },
          { cn: '我毕业于...大学', pinyin: 'Wǒ bìyè yú...dàxué', vi: 'Tôi tốt nghiệp trường đại học...' },
          { cn: '我有...年工作经验', pinyin: 'Wǒ yǒu...nián gōngzuò jīngyàn', vi: 'Tôi có ... năm kinh nghiệm' },
          { cn: '我的专业是...', pinyin: 'Wǒ de zhuānyè shì...', vi: 'Chuyên ngành của tôi là...' }
        ]
      },
      {
        heading: 'Câu hỏi phỏng vấn thường gặp',
        content: 'Dưới đây là những câu hỏi phổ biến mà nhà tuyển dụng hay hỏi:',
        phrases: [
          { cn: '你为什么想加入我们公司？', pinyin: 'Nǐ wèishénme xiǎng jiārù wǒmen gōngsī?', vi: 'Tại sao bạn muốn gia nhập công ty chúng tôi?' },
          { cn: '你的优点和缺点是什么？', pinyin: 'Nǐ de yōudiǎn hé quēdiǎn shì shénme?', vi: 'Ưu điểm và khuyết điểm của bạn là gì?' },
          { cn: '你的期望薪资是多少？', pinyin: 'Nǐ de qīwàng xīnzī shì duōshǎo?', vi: 'Mức lương mong muốn của bạn là bao nhiêu?' },
          { cn: '你能接受加班吗？', pinyin: 'Nǐ néng jiēshòu jiābān ma?', vi: 'Bạn có chấp nhận tăng ca không?' },
          { cn: '你还有什么问题吗？', pinyin: 'Nǐ hái yǒu shénme wèntí ma?', vi: 'Bạn còn câu hỏi nào không?' }
        ]
      },
      {
        heading: 'Từ vựng công sở quan trọng',
        content: 'Biết những từ này sẽ giúp bạn giao tiếp tốt trong môi trường công việc ở TQ.',
        phrases: [
          { cn: '简历', pinyin: 'jiǎnlì', vi: 'CV / Sơ yếu lý lịch' },
          { cn: '职位', pinyin: 'zhíwèi', vi: 'Vị trí / Chức vụ' },
          { cn: '全职', pinyin: 'quánzhí', vi: 'Toàn thời gian (full-time)' },
          { cn: '兼职', pinyin: 'jiānzhí', vi: 'Bán thời gian (part-time)' },
          { cn: '实习', pinyin: 'shíxí', vi: 'Thực tập' },
          { cn: '五险一金', pinyin: 'wǔ xiǎn yī jīn', vi: '5 bảo hiểm 1 quỹ (phúc lợi cơ bản ở TQ)' },
          { cn: '试用期', pinyin: 'shìyòng qī', vi: 'Thời gian thử việc' },
          { cn: '合同', pinyin: 'hétóng', vi: 'Hợp đồng' }
        ]
      }
    ]
  },

  // ─── Guide 9: Khi không hiểu — ứng xử ngôn ngữ ──────────
  {
    id: 'not_understand',
    title: 'Khi không hiểu — nói thế nào?',
    icon: '😅',
    category: 'culture',
    sections: [
      {
        heading: 'Câu nói khi không nghe rõ',
        content: 'Khi bạn không nghe rõ hoặc không hiểu, đừng ngại hỏi lại. Người Trung Quốc rất tôn trọng người chịu hỏi để hiểu đúng.',
        phrases: [
          { cn: '请再说一遍。', pinyin: 'Qǐng zài shuō yī biàn.', vi: 'Xin nói lại một lần nữa.' },
          { cn: '你说得太快了，我听不懂。', pinyin: 'Nǐ shuō de tài kuài le, wǒ tīng bù dǒng.', vi: 'Bạn nói nhanh quá, tôi nghe không hiểu.' },
          { cn: '可以慢一点说吗？', pinyin: 'Kěyǐ màn yīdiǎn shuō ma?', vi: 'Có thể nói chậm một chút được không?' },
          { cn: '什么意思？', pinyin: 'Shénme yìsi?', vi: 'Có nghĩa là gì?' },
          { cn: '我不明白。', pinyin: 'Wǒ bù míngbai.', vi: 'Tôi không hiểu.' }
        ]
      },
      {
        heading: 'Để xác nhận lại',
        content: 'Sau khi nghe, bạn nên xác nhận lại để tránh hiểu nhầm. Người TQ thích điều này vì nó thể hiện sự cẩn thận.',
        phrases: [
          { cn: '你的意思是…吗？', pinyin: 'Nǐ de yìsi shì… ma?', vi: 'Ý bạn là… phải không?' },
          { cn: '我这样理解对吗？', pinyin: 'Wǒ zhèyàng lǐjiě duì ma?', vi: 'Tôi hiểu như vậy có đúng không?' },
          { cn: '你能写下来吗？', pinyin: 'Nǐ néng xiě xiàlái ma?', vi: 'Bạn có thể viết ra được không?' },
          { cn: '这个字怎么写？', pinyin: 'Zhège zì zěnme xiě?', vi: 'Chữ này viết thế nào?' }
        ]
      },
      {
        heading: 'Khi không biết từ',
        content: 'Không sao cả! Dùng cách diễn đạt đơn giản hoặc chỉ tay vào vật đó.',
        phrases: [
          { cn: '这个用中文怎么说？', pinyin: 'Zhège yòng Zhōngwén zěnme shuō?', vi: 'Cái này nói bằng tiếng Trung thế nào?' },
          { cn: '那个东西叫什么？', pinyin: 'Nàge dōngxi jiào shénme?', vi: 'Cái kia gọi là gì?' },
          { cn: '我忘了这个词。', pinyin: 'Wǒ wàng le zhège cí.', vi: 'Tôi quên từ này rồi.' },
          { cn: '有没有更简单的说法？', pinyin: 'Yǒu méiyǒu gèng jiǎndān de shuōfǎ?', vi: 'Có cách nói đơn giản hơn không?' }
        ]
      }
    ]
  },

  // ─── Guide 10: Xin lỗi và sửa sai ─────────────────────
  {
    id: 'apologize',
    title: 'Xin lỗi và sửa lỗi giao tiếp',
    icon: '🙏',
    category: 'culture',
    sections: [
      {
        heading: 'Các cách xin lỗi thông dụng',
        content: 'Người Trung Quốc dùng "对不起" cho lỗi nặng và "不好意思" cho lỗi nhẹ. Phân biệt đúng sẽ thể hiện bạn hiểu văn hóa.',
        phrases: [
          { cn: '对不起。', pinyin: 'Duìbuqǐ.', vi: 'Xin lỗi (lỗi nặng).' },
          { cn: '不好意思。', pinyin: 'Bù hǎoyìsi.', vi: 'Xin lỗi / Ngại quá (lỗi nhẹ).' },
          { cn: '是我的错。', pinyin: 'Shì wǒ de cuò.', vi: 'Là lỗi của tôi.' },
          { cn: '我不是故意的。', pinyin: 'Wǒ bùshì gùyì de.', vi: 'Tôi không cố ý.' },
          { cn: '麻烦你了。', pinyin: 'Máfan nǐ le.', vi: 'Làm phiền bạn rồi.' }
        ]
      },
      {
        heading: 'Cách đáp lại lời xin lỗi',
        content: 'Khi ai đó xin lỗi bạn, đừng nói "không sao" một cách máy móc. Hãy dùng các câu này một cách linh hoạt.',
        phrases: [
          { cn: '没关系。', pinyin: 'Méi guānxi.', vi: 'Không có gì / Không sao.' },
          { cn: '没事儿。', pinyin: 'Méi shìr.', vi: 'Không sao đâu (thân mật).' },
          { cn: '别在意。', pinyin: 'Bié zàiyì.', vi: 'Đừng bận tâm.' },
          { cn: '不用道歉。', pinyin: 'Bùyòng dàoqiàn.', vi: 'Không cần xin lỗi đâu.' }
        ]
      },
      {
        heading: 'Khi nói sai — sửa lại',
        content: 'Nói sai là chuyện bình thường khi học ngôn ngữ. Học cách tự sửa lỗi sẽ giúp bạn tự tin hơn.',
        phrases: [
          { cn: '我说错了，应该是…', pinyin: 'Wǒ shuō cuò le, yīnggāi shì…', vi: 'Tôi nói sai rồi, phải là…' },
          { cn: '让我重新说一遍。', pinyin: 'Ràng wǒ chóngxīn shuō yī biàn.', vi: 'Để tôi nói lại một lần.' },
          { cn: '我的发音不太标准。', pinyin: 'Wǒ de fāyīn bù tài biāozhǔn.', vi: 'Phát âm của tôi chưa chuẩn lắm.' },
          { cn: '请帮我纠正。', pinyin: 'Qǐng bāng wǒ jiūzhèng.', vi: 'Xin hãy giúp tôi sửa lỗi.' }
        ]
      }
    ]
  },

  // ─── Guide 11: Văn hóa giao tiếp TQ ────────────────────
  {
    id: 'comm_culture',
    title: 'Văn hóa giao tiếp Trung Quốc',
    icon: '🏮',
    category: 'culture',
    sections: [
      {
        heading: 'Xưng hô — cách gọi người khác',
        content: 'Ở Trung Quốc, cách xưng hô rất quan trọng. Gọi đúng thể hiện sự tôn trọng và tạo thiện cảm.',
        phrases: [
          { cn: '师傅', pinyin: 'shīfu', vi: 'Bác tài / Thầy (gọi tài xế, thợ)' },
          { cn: '阿姨', pinyin: 'āyí', vi: 'Cô / Dì (gọi phụ nữ trung niên)' },
          { cn: '叔叔', pinyin: 'shūshu', vi: 'Chú (gọi đàn ông trung niên)' },
          { cn: '美女', pinyin: 'měinǚ', vi: 'Chị đẹp (gọi phụ nữ trẻ - thân mật)' },
          { cn: '帅哥', pinyin: 'shuàigē', vi: 'Anh đẹp trai (gọi nam trẻ - thân mật)' },
          { cn: '小姐姐', pinyin: 'xiǎo jiějie', vi: 'Chị gái (cách gọi dễ thương)' }
        ]
      },
      {
        heading: 'Thể diện (面子) — Điều tế nhị',
        content: '"面子" (miànzi) là khái niệm quan trọng nhất trong giao tiếp TQ. Đừng làm ai mất mặt, đừng chỉ trích trực tiếp trước đám đông.',
        phrases: [
          { cn: '给个面子。', pinyin: 'Gěi gè miànzi.', vi: 'Nể mặt một chút.' },
          { cn: '给我点面子吧。', pinyin: 'Gěi wǒ diǎn miànzi ba.', vi: 'Cho tôi chút thể diện đi.' },
          { cn: '不好意思拒绝。', pinyin: 'Bù hǎoyìsi jùjué.', vi: 'Ngại từ chối quá.' },
          { cn: '这样不太好吧。', pinyin: 'Zhèyàng bù tài hǎo ba.', vi: 'Như vậy không tốt lắm nhỉ (cách nói giảm nhẹ).' }
        ]
      },
      {
        heading: 'Khen và đáp lại lời khen',
        content: 'Người TQ thường khiêm tốn khi được khen. Họ thường phủ nhận hoặc nói "哪里哪里" (đâu có). Đừng nói "cảm ơn" một cách đơn giản — hãy đáp lại một cách khiêm tốn.',
        phrases: [
          { cn: '哪里哪里。', pinyin: 'Nǎlǐ nǎlǐ.', vi: 'Đâu có đâu có (khiêm tốn đáp lại khen).' },
          { cn: '你过奖了。', pinyin: 'Nǐ guò jiǎng le.', vi: 'Bạn khen quá lời rồi.' },
          { cn: '我做得还不够好。', pinyin: 'Wǒ zuò de hái bùgòu hǎo.', vi: 'Tôi làm vẫn chưa đủ tốt.' },
          { cn: '你中文说得真好！', pinyin: 'Nǐ Zhōngwén shuō de zhēn hǎo!', vi: 'Bạn nói tiếng Trung thật tốt!' }
        ]
      }
    ]
  },

  // ─── Guide 12: Tình huống khẩn cấp ────────────────────
  {
    id: 'emergency',
    title: 'Tình huống khẩn cấp — cần biết',
    icon: '🚨',
    category: 'culture',
    sections: [
      {
        heading: 'Cấp cứu — gọi 120',
        content: 'Số cấp cứu ở Trung Quốc là 120 (xe cứu thương), 110 (cảnh sát), 119 (cứu hỏa). Hãy nhớ các câu sau để mô tả tình huống khẩn cấp.',
        phrases: [
          { cn: '救命！', pinyin: 'Jiùmìng!', vi: 'Cứu tôi với!' },
          { cn: '快叫救护车！', pinyin: 'Kuài jiào jiùhù chē!', vi: 'Gọi xe cứu thương nhanh lên!' },
          { cn: '我朋友受伤了。', pinyin: 'Wǒ péngyou shòushāng le.', vi: 'Bạn tôi bị thương rồi.' },
          { cn: '这里有人晕倒了。', pinyin: 'Zhèlǐ yǒu rén yūndǎo le.', vi: 'Ở đây có người ngất rồi.' },
          { cn: '请帮帮我！', pinyin: 'Qǐng bāng bāng wǒ!', vi: 'Làm ơn giúp tôi!' }
        ]
      },
      {
        heading: 'Mất đồ / Bị trộm',
        content: 'Nếu bị mất đồ, hãy đến đồn cảnh sát (派出所 pàichūsuǒ) gần nhất. Báo mất đồ càng sớm càng tốt.',
        phrases: [
          { cn: '我的钱包被偷了。', pinyin: 'Wǒ de qiánbāo bèi tōu le.', vi: 'Ví của tôi bị trộm rồi.' },
          { cn: '我要报警。', pinyin: 'Wǒ yào bàojǐng.', vi: 'Tôi muốn báo cảnh sát.' },
          { cn: '我的护照丢了。', pinyin: 'Wǒ de hùzhào diū le.', vi: 'Hộ chiếu của tôi bị mất rồi.' },
          { cn: '大使馆的电话是多少？', pinyin: 'Dàshǐguǎn de diànhuà shì duōshǎo?', vi: 'Số điện thoại đại sứ quán là bao nhiêu?' }
        ]
      },
      {
        heading: 'Ở hiệu thuốc / bệnh viện',
        content: 'Khi ốm đột xuất, bạn cần biết cách mô tả triệu chứng và mua thuốc cơ bản.',
        phrases: [
          { cn: '我发烧了。', pinyin: 'Wǒ fāshāo le.', vi: 'Tôi bị sốt rồi.' },
          { cn: '我肚子疼。', pinyin: 'Wǒ dùzi téng.', vi: 'Tôi đau bụng.' },
          { cn: '我过敏了。', pinyin: 'Wǒ guòmǐn le.', vi: 'Tôi bị dị ứng.' },
          { cn: '附近有医院吗？', pinyin: 'Fùjìn yǒu yīyuàn ma?', vi: 'Gần đây có bệnh viện không?' },
          { cn: '我需要看医生。', pinyin: 'Wǒ xūyào kàn yīshēng.', vi: 'Tôi cần khám bác sĩ.' }
        ]
      }
    ]
  },

  // ─── Guide 13: Giao tiếp điện thoại ────────────────────
  {
    id: 'phone_etiquette',
    title: 'Giao tiếp qua điện thoại',
    icon: '📞',
    category: 'culture',
    sections: [
      {
        heading: 'Nghe và gọi — những câu đầu tiên',
        content: 'Người Trung Quốc thường bắt đầu cuộc gọi bằng "喂" (wèi) thay vì "你好". Đây là từ đặc trưng khi nghe điện thoại.',
        phrases: [
          { cn: '喂？', pinyin: 'Wèi?', vi: 'A lô?' },
          { cn: '请问是…吗？', pinyin: 'Qǐngwèn shì… ma?', vi: 'Xin hỏi có phải là… không?' },
          { cn: '我想找…', pinyin: 'Wǒ xiǎng zhǎo…', vi: 'Tôi muốn tìm / gặp…' },
          { cn: '你打错了。', pinyin: 'Nǐ dǎ cuò le.', vi: 'Bạn gọi nhầm số rồi.' },
          { cn: '请稍等。', pinyin: 'Qǐng shāo děng.', vi: 'Xin chờ một chút.' }
        ]
      },
      {
        heading: 'Khi tín hiệu kém / nghe không rõ',
        content: 'Đừng ngại nói khi nghe không rõ qua điện thoại. Dùng các câu sau một cách lịch sự.',
        phrases: [
          { cn: '听得到吗？', pinyin: 'Tīng dé dào ma?', vi: 'Nghe thấy không?' },
          { cn: '信号不好。', pinyin: 'Xìnhào bù hǎo.', vi: 'Tín hiệu không tốt.' },
          { cn: '你能大点声吗？', pinyin: 'Nǐ néng dà diǎn shēng ma?', vi: 'Bạn có thể nói to hơn được không?' },
          { cn: '我一会儿再打给你。', pinyin: 'Wǒ yīhuìr zài dǎ gěi nǐ.', vi: 'Tôi lát nữa gọi lại cho bạn.' },
          { cn: '发短信给我吧。', pinyin: 'Fā duǎnxìn gěi wǒ ba.', vi: 'Nhắn tin cho tôi nhé.' }
        ]
      },
      {
        heading: 'Kết thúc cuộc gọi',
        content: 'Cách kết thúc cuộc gọi cũng quan trọng. Thường kết thúc bằng "好" rồi mới nói "再见".',
        phrases: [
          { cn: '好，就这样。', pinyin: 'Hǎo, jiù zhèyàng.', vi: 'OK, vậy nhé.' },
          { cn: '谢谢，再见。', pinyin: 'Xièxiè, zàijiàn.', vi: 'Cảm ơn, tạm biệt.' },
          { cn: '辛苦你了。', pinyin: 'Xīnkǔ nǐ le.', vi: 'Vất vả cho bạn rồi (cảm ơn vì đã giúp).' },
          { cn: '我们微信联系。', pinyin: 'Wǒmen Wēixìn liánxì.', vi: 'Chúng ta liên lạc qua WeChat nhé.' }
        ]
      }
    ]
  }
];

// ============================================================
// 4. QUIZ SETS — 6 themed sets × 20 questions (HSK 1–3 focus)
// ============================================================
export const quizSets = [
  // ─── Set 1: Chào hỏi & Giới thiệu ────────────────────────
  {
    id: 'greetings', title: 'Chào hỏi & Giới thiệu', icon: '👋', level: 1,
    desc: 'Các câu chào hỏi, giới thiệu tên, quốc tịch cơ bản',
    questions: [
      { type: 'char_to_meaning', question: '你', options: ['Bạn','Tôi','Anh ấy','Cô ấy'], correctIndex: 0, explanation: '你 (nǐ) = Bạn. Đại từ ngôi thứ hai.' },
      { type: 'char_to_meaning', question: '我', options: ['Tôi','Bạn','Họ','Nó'], correctIndex: 0, explanation: '我 (wǒ) = Tôi. Đại từ ngôi thứ nhất.' },
      { type: 'char_to_meaning', question: '他', options: ['Cô ấy','Anh ấy','Nó','Tôi'], correctIndex: 1, explanation: '他 (tā) = Anh ấy.' },
      { type: 'char_to_meaning', question: '她', options: ['Anh ấy','Nó','Cô ấy','Tôi'], correctIndex: 2, explanation: '她 (tā) = Cô ấy.' },
      { type: 'char_to_meaning', question: '好', options: ['Tốt','Xấu','Lớn','Nhỏ'], correctIndex: 0, explanation: '好 (hǎo) = Tốt, đẹp.' },
      { type: 'char_to_meaning', question: '名字', options: ['Tên','Tuổi','Địa chỉ','Nghề'], correctIndex: 0, explanation: '名字 (míngzì) = Tên.' },
      { type: 'meaning_to_char', question: 'Là', options: ['是','不','有','在'], correctIndex: 0, explanation: '是 (shì) = Là. Động từ "to be" cơ bản.' },
      { type: 'meaning_to_char', question: 'Không', options: ['不','是','很','也'], correctIndex: 0, explanation: '不 (bù) = Không. Từ phủ định cơ bản.' },
      { type: 'meaning_to_char', question: 'Rất', options: ['不','很','大','都'], correctIndex: 1, explanation: '很 (hěn) = Rất.' },
      { type: 'meaning_to_char', question: 'Cũng', options: ['很','不','也','都'], correctIndex: 2, explanation: '也 (yě) = Cũng.' },
      { type: 'pinyin_to_char', question: 'nǐ hǎo', options: ['你好','我好','你大','他好'], correctIndex: 0, explanation: '你好 (nǐ hǎo) = Xin chào.' },
      { type: 'pinyin_to_char', question: 'wǒ shì', options: ['我是','你是','他有','你不'], correctIndex: 0, explanation: '我是 (wǒ shì) = Tôi là.' },
      { type: 'fill_blank', question: '你___吗？(Bạn khỏe không?)', options: ['好','大','是','不'], correctIndex: 0, explanation: '你好吗？(Nǐ hǎo ma?) = Bạn khỏe không?' },
      { type: 'fill_blank', question: '我___越南人。(Tôi là người Việt Nam)', options: ['是','不','很','也'], correctIndex: 0, explanation: '我是越南人。(Wǒ shì Yuènán rén.)' },
      { type: 'fill_blank', question: '___叫小明。(Tôi tên là Tiểu Minh)', options: ['我','你','他','她'], correctIndex: 0, explanation: '我叫小明。(Wǒ jiào Xiǎomíng.)' },
      { type: 'fill_blank', question: '我___是老师。(Tôi không phải là giáo viên)', options: ['不','很','也','是'], correctIndex: 0, explanation: '我不是老师。Dùng 不 để phủ định.' },
      { type: 'char_to_meaning', question: '谢谢', options: ['Cảm ơn','Xin lỗi','Tạm biệt','Chào'], correctIndex: 0, explanation: '谢谢 (xièxie) = Cảm ơn.' },
      { type: 'char_to_meaning', question: '再见', options: ['Chào','Tạm biệt','Cảm ơn','Xin lỗi'], correctIndex: 1, explanation: '再见 (zàijiàn) = Tạm biệt.' },
      { type: 'meaning_to_char', question: 'Xin lỗi', options: ['谢谢','再见','对不起','你好'], correctIndex: 2, explanation: '对不起 (duìbuqǐ) = Xin lỗi.' },
      { type: 'pinyin_to_char', question: 'Xièxie', options: ['再见','你好','谢谢','对不起'], correctIndex: 2, explanation: '谢谢 (Xièxie) = Cảm ơn.' }
    ]
  },

  // ─── Set 2: Gia đình & Số đếm ───────────────────────────
  {
    id: 'family', title: 'Gia đình & Số đếm', icon: '👨‍👩‍👧', level: 1,
    desc: 'Từ vựng về gia đình, số đếm 1-10',
    questions: [
      { type: 'char_to_meaning', question: '妈妈', options: ['Mẹ','Bố','Anh','Chị'], correctIndex: 0, explanation: '妈妈 (māma) = Mẹ.' },
      { type: 'char_to_meaning', question: '爸爸', options: ['Mẹ','Bố','Em','Bạn'], correctIndex: 1, explanation: '爸爸 (bàba) = Bố.' },
      { type: 'char_to_meaning', question: '哥哥', options: ['Chị','Em trai','Anh trai','Bố'], correctIndex: 2, explanation: '哥哥 (gēge) = Anh trai.' },
      { type: 'char_to_meaning', question: '姐姐', options: ['Em gái','Chị gái','Mẹ','Bạn'], correctIndex: 1, explanation: '姐姐 (jiějie) = Chị gái.' },
      { type: 'char_to_meaning', question: '朋友', options: ['Gia đình','Bạn bè','Hàng xóm','Đồng nghiệp'], correctIndex: 1, explanation: '朋友 (péngyǒu) = Bạn bè.' },
      { type: 'meaning_to_char', question: 'Một', options: ['二','一','三','十'], correctIndex: 1, explanation: '一 (yī) = Một.' },
      { type: 'meaning_to_char', question: 'Ba', options: ['一','二','三','四'], correctIndex: 2, explanation: '三 (sān) = Ba.' },
      { type: 'meaning_to_char', question: 'Năm', options: ['四','五','六','七'], correctIndex: 1, explanation: '五 (wǔ) = Năm.' },
      { type: 'meaning_to_char', question: 'Mười', options: ['九','十','百','千'], correctIndex: 1, explanation: '十 (shí) = Mười.' },
      { type: 'meaning_to_char', question: 'Con trai', options: ['女儿','妈妈','爸爸','儿子'], correctIndex: 3, explanation: '儿子 (érzi) = Con trai.' },
      { type: 'pinyin_to_char', question: 'māma', options: ['爸爸','妈妈','哥哥','姐姐'], correctIndex: 1, explanation: '妈妈 (māma) = Mẹ.' },
      { type: 'pinyin_to_char', question: 'sān', options: ['一','二','三','四'], correctIndex: 2, explanation: '三 (sān) = Số ba.' },
      { type: 'fill_blank', question: '我有___个苹果。(Tôi có một quả táo)', options: ['一','二','三','四'], correctIndex: 0, explanation: '一个 (yī gè) = một cái.' },
      { type: 'fill_blank', question: '我___是医生。(Bố tôi là bác sĩ)', options: ['妈妈','爸爸','哥哥','姐姐'], correctIndex: 1, explanation: '我爸爸 (wǒ bàba) = Bố tôi.' },
      { type: 'fill_blank', question: '她是我___。(Cô ấy là chị tôi)', options: ['哥哥','弟弟','姐姐','朋友'], correctIndex: 2, explanation: '姐姐 = chị gái. 哥哥 = anh trai.' },
      { type: 'fill_blank', question: '你___岁？(Bạn mấy tuổi?)', options: ['几','多','很','不'], correctIndex: 0, explanation: '几 (jǐ) = mấy. Dùng hỏi số lượng nhỏ.' },
      { type: 'char_to_meaning', question: '老师', options: ['Bác sĩ','Giáo viên','Học sinh','Công an'], correctIndex: 1, explanation: '老师 (lǎoshī) = Giáo viên.' },
      { type: 'meaning_to_char', question: 'Học sinh', options: ['老师','医生','学生','工人'], correctIndex: 2, explanation: '学生 (xuéshēng) = Học sinh.' },
      { type: 'pinyin_to_char', question: 'bàba', options: ['妈妈','爸爸','哥哥','弟弟'], correctIndex: 1, explanation: '爸爸 (bàba) = Bố.' },
      { type: 'fill_blank', question: '我___岁。(Tôi 10 tuổi)', options: ['十','五','三','七'], correctIndex: 0, explanation: '十 (shí) = 10. 我十岁 = Tôi 10 tuổi.' }
    ]
  },

  // ─── Set 3: Đồ ăn & Thức uống ──────────────────────────
  {
    id: 'food', title: 'Đồ ăn & Thức uống', icon: '🍜', level: 2,
    desc: 'Từ vựng ăn uống, gọi món cơ bản',
    questions: [
      { type: 'char_to_meaning', question: '水', options: ['Nước','Lửa','Đất','Gió'], correctIndex: 0, explanation: '水 (shuǐ) = Nước.' },
      { type: 'char_to_meaning', question: '茶', options: ['Cà phê','Trà','Sữa','Nước'], correctIndex: 1, explanation: '茶 (chá) = Trà.' },
      { type: 'char_to_meaning', question: '饭', options: ['Mì','Bánh','Cơm','Súp'], correctIndex: 2, explanation: '饭 (fàn) = Cơm.' },
      { type: 'char_to_meaning', question: '吃', options: ['Uống','Nấu','Ăn','Mua'], correctIndex: 2, explanation: '吃 (chī) = Ăn.' },
      { type: 'char_to_meaning', question: '喝', options: ['Ăn','Uống','Nấu','Mua'], correctIndex: 1, explanation: '喝 (hē) = Uống.' },
      { type: 'char_to_meaning', question: '苹果', options: ['Chuối','Cam','Táo','Nho'], correctIndex: 2, explanation: '苹果 (píngguǒ) = Táo.' },
      { type: 'meaning_to_char', question: 'Sữa bò', options: ['牛奶','咖啡','可乐','茶水'], correctIndex: 0, explanation: '牛奶 (niúnǎi) = Sữa bò.' },
      { type: 'meaning_to_char', question: 'Cà phê', options: ['牛奶','咖啡','可乐','茶水'], correctIndex: 1, explanation: '咖啡 (kāfēi) = Cà phê.' },
      { type: 'meaning_to_char', question: 'Bánh mì', options: ['米饭','面条','面包','蛋糕'], correctIndex: 2, explanation: '面包 (miànbāo) = Bánh mì.' },
      { type: 'meaning_to_char', question: 'Trứng gà', options: ['鸡蛋','鸭蛋','鹅蛋','鸟蛋'], correctIndex: 0, explanation: '鸡蛋 (jīdàn) = Trứng gà.' },
      { type: 'pinyin_to_char', question: 'chī', options: ['喝','吃','买','卖'], correctIndex: 1, explanation: '吃 (chī) = Ăn.' },
      { type: 'pinyin_to_char', question: 'hē', options: ['吃','喝','买','卖'], correctIndex: 1, explanation: '喝 (hē) = Uống.' },
      { type: 'fill_blank', question: '我想___茶。(Tôi muốn uống trà)', options: ['吃','喝','买','做'], correctIndex: 1, explanation: '喝茶 (hē chá) = uống trà.' },
      { type: 'fill_blank', question: '你___饭了吗？(Bạn ăn cơm chưa?)', options: ['吃','喝','买','做'], correctIndex: 0, explanation: '吃饭 = ăn cơm. Câu hỏi phổ biến.' },
      { type: 'fill_blank', question: '这个菜很好___。(Món này rất ngon)', options: ['吃','喝','买','看'], correctIndex: 0, explanation: '好吃 = ngon (ăn). 好喝 = ngon (uống).' },
      { type: 'fill_blank', question: '我要___咖啡。(Tôi muốn uống cà phê)', options: ['喝','吃','买','卖'], correctIndex: 0, explanation: '喝咖啡 (hē kāfēi) = uống cà phê.' },
      { type: 'char_to_meaning', question: '水果', options: ['Rau','Hoa quả','Thịt','Cá'], correctIndex: 1, explanation: '水果 (shuǐguǒ) = Hoa quả.' },
      { type: 'char_to_meaning', question: '好吃', options: ['Đẹp','Ngon','Dễ','Khó'], correctIndex: 1, explanation: '好吃 (hǎochī) = Ngon (ăn).' },
      { type: 'pinyin_to_char', question: 'píngguǒ', options: ['苹果','葡萄','香蕉','西瓜'], correctIndex: 0, explanation: '苹果 (píngguǒ) = Táo.' },
      { type: 'fill_blank', question: '请给我一___水。(Xin cho một cốc nước)', options: ['杯','碗','盘','瓶'], correctIndex: 0, explanation: '一杯水 (yī bēi shuǐ) = một cốc nước.' }
    ]
  },

  // ─── Set 4: Mua sắm & Số lượng ─────────────────────────
  {
    id: 'shopping', title: 'Mua sắm & Số lượng', icon: '🛍️', level: 2,
    desc: 'Từ vựng mua bán, giá cả, lượng từ',
    questions: [
      { type: 'char_to_meaning', question: '买', options: ['Mua','Bán','Tặng','Mượn'], correctIndex: 0, explanation: '买 (mǎi) = Mua.' },
      { type: 'char_to_meaning', question: '卖', options: ['Mua','Bán','Tặng','Mượn'], correctIndex: 1, explanation: '卖 (mài) = Bán.' },
      { type: 'char_to_meaning', question: '多少钱', options: ['Ở đâu','Bao nhiêu tiền','Cái gì','Khi nào'], correctIndex: 1, explanation: '多少钱 (duōshao qián) = Bao nhiêu tiền.' },
      { type: 'char_to_meaning', question: '贵', options: ['Rẻ','Đắt','Nhiều','Ít'], correctIndex: 1, explanation: '贵 (guì) = Đắt.' },
      { type: 'char_to_meaning', question: '便宜', options: ['Đắt','Rẻ','Nhanh','Chậm'], correctIndex: 1, explanation: '便宜 (piányi) = Rẻ.' },
      { type: 'char_to_meaning', question: '个', options: ['Cái(lượng từ)','Con','Tờ','Cốc'], correctIndex: 0, explanation: '个 (gè) = cái. Lượng từ phổ biến nhất.' },
      { type: 'meaning_to_char', question: 'Muốn', options: ['有','想','是','在'], correctIndex: 1, explanation: '想 (xiǎng) = Muốn, nhớ.' },
      { type: 'meaning_to_char', question: 'Cần', options: ['想','有','要','是'], correctIndex: 2, explanation: '要 (yào) = Muốn, cần.' },
      { type: 'meaning_to_char', question: 'Cho', options: ['买','卖','给','要'], correctIndex: 2, explanation: '给 (gěi) = Cho, đưa.' },
      { type: 'pinyin_to_char', question: 'mǎi', options: ['卖','买','实','头'], correctIndex: 1, explanation: '买 (mǎi) = Mua. Thanh điệu 3.' },
      { type: 'fill_blank', question: '这个___多少钱？(Cái này bao nhiêu tiền?)', options: ['苹果','衣服','东西','手机'], correctIndex: 0, explanation: '苹果 = táo. Hỏi giá bất kỳ đồ gì.' },
      { type: 'fill_blank', question: '太___了！(Đắt quá!)', options: ['便宜','贵','多','少'], correctIndex: 1, explanation: '太贵了 (tài guì le) = Đắt quá.' },
      { type: 'fill_blank', question: '我___买一本书。(Tôi muốn mua một quyển sách)', options: ['想','是','有','在'], correctIndex: 0, explanation: '想买 (xiǎng mǎi) = muốn mua.' },
      { type: 'fill_blank', question: '___我一杯水。(Cho tôi một cốc nước)', options: ['给','买','卖','想'], correctIndex: 0, explanation: '给我 (gěi wǒ) = cho tôi.' },
      { type: 'pinyin_to_char', question: 'yī gè', options: ['两个','三个','一个','四个'], correctIndex: 2, explanation: '一个 = một cái.' },
      { type: 'meaning_to_char', question: 'Tiền', options: ['钱','饭','水','茶'], correctIndex: 0, explanation: '钱 (qián) = Tiền.' },
      { type: 'char_to_meaning', question: '商店', options: ['Nhà','Trường','Cửa hàng','Bệnh viện'], correctIndex: 2, explanation: '商店 (shāngdiàn) = Cửa hàng.' },
      { type: 'char_to_meaning', question: '超市', options: ['Chợ','Siêu thị','Cửa hàng','Nhà'], correctIndex: 1, explanation: '超市 (chāoshì) = Siêu thị.' },
      { type: 'fill_blank', question: '能___一点吗？(Giảm chút được không?)', options: ['便宜','贵','多','少'], correctIndex: 0, explanation: '便宜一点 = rẻ hơn chút. Câu mặc cả.' },
      { type: 'pinyin_to_char', question: 'guì', options: ['便宜','贵','多','少'], correctIndex: 1, explanation: '贵 (guì) = Đắt. Thanh điệu 4.' }
    ]
  },

  // ─── Set 5: Thời gian & Ngày tháng ─────────────────────
  {
    id: 'time', title: 'Thời gian & Ngày tháng', icon: '⏰', level: 2,
    desc: 'Giờ giấc, thứ ngày, thời tiết',
    questions: [
      { type: 'char_to_meaning', question: '今天', options: ['Hôm qua','Hôm nay','Ngày mai','Bây giờ'], correctIndex: 1, explanation: '今天 (jīntiān) = Hôm nay.' },
      { type: 'char_to_meaning', question: '明天', options: ['Hôm qua','Hôm nay','Ngày mai','Bây giờ'], correctIndex: 2, explanation: '明天 (míngtiān) = Ngày mai.' },
      { type: 'char_to_meaning', question: '昨天', options: ['Hôm qua','Hôm nay','Ngày mai','Tuần sau'], correctIndex: 0, explanation: '昨天 (zuótiān) = Hôm qua.' },
      { type: 'char_to_meaning', question: '早上', options: ['Buổi tối','Buổi sáng','Buổi trưa','Đêm'], correctIndex: 1, explanation: '早上 (zǎoshang) = Buổi sáng.' },
      { type: 'char_to_meaning', question: '晚上', options: ['Buổi sáng','Buổi trưa','Buổi tối','Đêm khuya'], correctIndex: 2, explanation: '晚上 (wǎnshang) = Buổi tối.' },
      { type: 'char_to_meaning', question: '现在', options: ['Quá khứ','Tương lai','Bây giờ','Hôm qua'], correctIndex: 2, explanation: '现在 (xiànzài) = Bây giờ.' },
      { type: 'meaning_to_char', question: 'Giờ (điểm)', options: ['分','点','时','秒'], correctIndex: 1, explanation: '点 (diǎn) = giờ. 三点 = 3 giờ.' },
      { type: 'meaning_to_char', question: 'Tháng', options: ['年','月','日','星期'], correctIndex: 1, explanation: '月 (yuè) = Tháng.' },
      { type: 'meaning_to_char', question: 'Năm', options: ['月','日','年','星期'], correctIndex: 2, explanation: '年 (nián) = Năm.' },
      { type: 'meaning_to_char', question: 'Nóng', options: ['冷','热','凉','暖'], correctIndex: 1, explanation: '热 (rè) = Nóng.' },
      { type: 'pinyin_to_char', question: 'jīntiān', options: ['明天','昨天','今天','前天'], correctIndex: 2, explanation: '今天 (jīntiān) = Hôm nay.' },
      { type: 'fill_blank', question: '___几点了？(Bây giờ mấy giờ?)', options: ['今天','明天','现在','昨天'], correctIndex: 2, explanation: '现在几点了？= Bây giờ mấy giờ rồi?' },
      { type: 'fill_blank', question: '我___七点起床。(Tôi thức dậy lúc 7 giờ sáng)', options: ['晚上','下午','早上','中午'], correctIndex: 2, explanation: '早上七点 = 7 giờ sáng.' },
      { type: 'fill_blank', question: '今天很___。(Hôm nay rất lạnh)', options: ['热','冷','好','大'], correctIndex: 1, explanation: '冷 (lěng) = Lạnh.' },
      { type: 'pinyin_to_char', question: 'míngtiān', options: ['明天','今天','昨天','后天'], correctIndex: 0, explanation: '明天 (míngtiān) = Ngày mai.' },
      { type: 'char_to_meaning', question: '星期', options: ['Ngày','Tháng','Tuần','Năm'], correctIndex: 2, explanation: '星期 (xīngqī) = Tuần.' },
      { type: 'char_to_meaning', question: '下雨', options: ['Nắng','Mưa','Tuyết','Gió'], correctIndex: 1, explanation: '下雨 (xià yǔ) = Mưa.' },
      { type: 'meaning_to_char', question: 'Bận', options: ['好','忙','累','饿'], correctIndex: 1, explanation: '忙 (máng) = Bận.' },
      { type: 'fill_blank', question: '现在___点。(Bây giờ 8 giờ)', options: ['八','五','三','十'], correctIndex: 0, explanation: '八点 (bā diǎn) = 8 giờ.' },
      { type: 'pinyin_to_char', question: 'lěng', options: ['热','冷','凉','暖'], correctIndex: 1, explanation: '冷 (lěng) = Lạnh.' }
    ]
  },

  // ─── Set 6: Di chuyển & Địa điểm ──────────────────────
  {
    id: 'travel', title: 'Di chuyển & Địa điểm', icon: '🚇', level: 3,
    desc: 'Hỏi đường, phương tiện, địa điểm phổ biến',
    questions: [
      { type: 'char_to_meaning', question: '去', options: ['Đến','Đi','Về','Ở'], correctIndex: 1, explanation: '去 (qù) = Đi.' },
      { type: 'char_to_meaning', question: '来', options: ['Đi','Về','Đến','Ở'], correctIndex: 2, explanation: '来 (lái) = Đến.' },
      { type: 'char_to_meaning', question: '在', options: ['Đi','Đến','Ở','Về'], correctIndex: 2, explanation: '在 (zài) = Ở, tại.' },
      { type: 'char_to_meaning', question: '学校', options: ['Bệnh viện','Trường học','Cửa hàng','Nhà'], correctIndex: 1, explanation: '学校 (xuéxiào) = Trường học.' },
      { type: 'char_to_meaning', question: '医院', options: ['Trường học','Cửa hàng','Bệnh viện','Nhà hàng'], correctIndex: 2, explanation: '医院 (yīyuàn) = Bệnh viện.' },
      { type: 'meaning_to_char', question: 'Nhà', options: ['学校','医院','家','商店'], correctIndex: 2, explanation: '家 (jiā) = Nhà.' },
      { type: 'meaning_to_char', question: 'Trên', options: ['下','上','左','右'], correctIndex: 1, explanation: '上 (shàng) = Trên.' },
      { type: 'meaning_to_char', question: 'Dưới', options: ['上','下','里','外'], correctIndex: 1, explanation: '下 (xià) = Dưới.' },
      { type: 'meaning_to_char', question: 'Trong', options: ['上','下','里','外'], correctIndex: 2, explanation: '里 (lǐ) = Trong.' },
      { type: 'meaning_to_char', question: 'Đâu', options: ['哪儿','什么','谁','怎么'], correctIndex: 0, explanation: '哪儿 (nǎr) = đâu. Để hỏi vị trí.' },
      { type: 'pinyin_to_char', question: 'qù', options: ['来','去','在','回'], correctIndex: 1, explanation: '去 (qù) = Đi.' },
      { type: 'fill_blank', question: '你___哪儿？(Bạn đi đâu?)', options: ['去','来','在','回'], correctIndex: 0, explanation: '去哪儿？= Đi đâu?' },
      { type: 'fill_blank', question: '我___学校。(Tôi ở trường học)', options: ['去','来','在','回'], correctIndex: 2, explanation: '在学校 = ở trường.' },
      { type: 'fill_blank', question: '桌子___面有书。(Trên bàn có sách)', options: ['上','下','里','外'], correctIndex: 0, explanation: '上面 = phía trên.' },
      { type: 'pinyin_to_char', question: 'zài', options: ['去','来','在','回'], correctIndex: 2, explanation: '在 (zài) = Ở, tại.' },
      { type: 'char_to_meaning', question: '坐', options: ['Đứng','Ngồi','Nằm','Đi'], correctIndex: 1, explanation: '坐 (zuò) = Ngồi.' },
      { type: 'char_to_meaning', question: '走', options: ['Chạy','Đi bộ','Ngồi','Nằm'], correctIndex: 1, explanation: '走 (zǒu) = Đi bộ.' },
      { type: 'meaning_to_char', question: 'Mở', options: ['关','开','进','出'], correctIndex: 1, explanation: '开 (kāi) = Mở.' },
      { type: 'fill_blank', question: '请___门。(Xin mở cửa)', options: ['开','关','进','出'], correctIndex: 0, explanation: '开门 (kāi mén) = mở cửa.' },
      { type: 'pinyin_to_char', question: 'huí jiā', options: ['起床','回家','吃饭','睡觉'], correctIndex: 1, explanation: '回家 = về nhà.' }
    ]
  },

  // ─── Set 7: Động vật & Thiên nhiên ─────────────────────
  {
    id: 'nature', title: 'Động vật & Thiên nhiên', icon: '🐾', level: 2,
    desc: 'Động vật, cây cối, thiên nhiên',
    questions: [
      { type: 'char_to_meaning', question: '猫', options: ['Chó','Mèo','Chuột','Chim'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '狗', options: ['Mèo','Chuột','Chó','Cá'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '鱼', options: ['Gà','Vịt','Cá','Tôm'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '鸟', options: ['Cá','Mèo','Chó','Chim'], correctIndex: 3 },
      { type: 'char_to_meaning', question: '花', options: ['Cỏ','Lá','Hoa','Cây'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '树', options: ['Hoa','Cỏ','Lá','Cây'], correctIndex: 3 },
      { type: 'meaning_to_char', question: 'Ngựa', options: ['牛','马','羊','猪'], correctIndex: 1 },
      { type: 'meaning_to_char', question: 'Cừu', options: ['牛','马','羊','猪'], correctIndex: 2 },
      { type: 'meaning_to_char', question: 'Rắn', options: ['蛇','龙','虫','鱼'], correctIndex: 0 },
      { type: 'pinyin_to_char', question: 'huā', options: ['花','化','画','话'], correctIndex: 0 },
      { type: 'pinyin_to_char', question: 'māo', options: ['猫','狗','鸟','鱼'], correctIndex: 0 },
      { type: 'fill_blank', question: '她家有___只猫。(Nhà cô ấy có ba con mèo)', options: ['一','三','五','七'], correctIndex: 1 },
      { type: 'fill_blank', question: '今天的___很新鲜。(Cá hôm nay rất tươi)', options: ['鸡','鱼','肉','蛋'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '春天', options: ['Mùa xuân','Mùa hè','Mùa thu','Mùa đông'], correctIndex: 0 },
      { type: 'char_to_meaning', question: '太阳', options: ['Mặt trăng','Mặt trời','Ngôi sao','Mây'], correctIndex: 1 },
      { type: 'meaning_to_char', question: 'Gió', options: ['风','雨','雪','云'], correctIndex: 0 },
      { type: 'pinyin_to_char', question: 'shān', options: ['水','山','火','土'], correctIndex: 1 },
      { type: 'fill_blank', question: '公园里有很多___。(Trong công viên có nhiều cây)', options: ['人','车','树','水'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '蓝色', options: ['Đỏ','Xanh','Trắng','Đen'], correctIndex: 1 },
      { type: 'meaning_to_char', question: 'Đỏ', options: ['黄','蓝','红','绿'], correctIndex: 2 }
    ]
  },

  // ─── Set 8: Sức khỏe & Cảm xúc ─────────────────────────
  {
    id: 'emotions', title: 'Sức khỏe & Cảm xúc', icon: '❤️', level: 3,
    desc: 'Cảm xúc, sức khỏe, trạng thái cơ thể',
    questions: [
      { type: 'char_to_meaning', question: '高兴', options: ['Vui','Buồn','Giận','Sợ'], correctIndex: 0 },
      { type: 'char_to_meaning', question: '难过', options: ['Vui','Buồn','Giận','Sợ'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '疼', options: ['Ngứa','Đau','Nóng','Lạnh'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '累', options: ['Vui','Khỏe','Mệt','No'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '渴', options: ['Khát','Đói','No','Mệt'], correctIndex: 0 },
      { type: 'char_to_meaning', question: '饿', options: ['Khát','Đói','No','Mệt'], correctIndex: 1 },
      { type: 'meaning_to_char', question: 'Giận', options: ['高兴','难过','生气','害怕'], correctIndex: 2 },
      { type: 'meaning_to_char', question: 'Sợ', options: ['高兴','难过','生气','害怕'], correctIndex: 3 },
      { type: 'pinyin_to_char', question: 'lèi', options: ['累','雷','泪','类'], correctIndex: 0 },
      { type: 'pinyin_to_char', question: 'bìng', options: ['病','痛','药','床'], correctIndex: 0 },
      { type: 'fill_blank', question: '我___了。(Tôi mệt quá)', options: ['累死','饿死','渴死','气死'], correctIndex: 0 },
      { type: 'fill_blank', question: '他___生病了。(Anh ấy bị cảm rồi)', options: ['发烧','头疼','感冒','咳嗽'], correctIndex: 2 },
      { type: 'char_to_meaning', question: '医生', options: ['Giáo viên','Bác sĩ','Kỹ sư','Luật sư'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '医院', options: ['Trường học','Nhà hàng','Bệnh viện','Ngân hàng'], correctIndex: 2 },
      { type: 'meaning_to_char', question: 'Thuốc', options: ['药','医','病','痛'], correctIndex: 0 },
      { type: 'pinyin_to_char', question: 'shēntǐ', options: ['身体','生病','健康','医院'], correctIndex: 0 },
      { type: 'fill_blank', question: '多喝___水。(Uống nhiều nước ấm)', options: ['冷','热','冰','温'], correctIndex: 1 },
      { type: 'char_to_meaning', question: '快乐', options: ['Buồn','Hạnh phúc','Giận','Sợ'], correctIndex: 1 },
      { type: 'meaning_to_char', question: 'Khỏe', options: ['好','强','康','健'], correctIndex: 2 },
      { type: 'fill_blank', question: '祝你早日___。(Chúc bạn mau khỏe)', options: ['康复','健康','好','好起来'], correctIndex: 0 }
    ]
  }
];

// Legacy compatibility
export const quizQuestions = quizSets.flatMap(s =>
  s.questions.map(q => ({ ...q, hskLevel: s.level }))
);