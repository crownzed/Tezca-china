// ============================================================
// GRAMMAR SPECS — HSK 1
// Mỗi cấu trúc là 1 spec: metadata cũ + slots + templates. Engine
// (grammar-engine.js) nở thành ~100 câu hỏi cụ thể. Xem grammar-engine.js
// để hiểu cú pháp slot ({NAME}, {NAME_vi}, '@category@') và 4 loại template.
// Nguyên tắc: filler curated theo ngữ cảnh để câu luôn hợp nghĩa + đúng cấp.
// ============================================================

export const hsk1 = [
  // ─── 1. Câu với 是 (là) ─────────────────────────────
  {
    id: 'shi-sentence', title: 'Câu với 是 (là)', level: 1,
    desc: 'Cấu trúc A 是 B để nói "A là B", cách phủ định với 不',
    category: 'sentence-pattern', partOfSpeech: 'Cấu trúc câu',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, câu với 是' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "to be" with "shi"' },
    ],
    point: {
      structure: 'Chủ ngữ + 是 + Danh từ',
      explain: '是 (shì) nối hai danh từ để khẳng định danh tính, nghề nghiệp, quốc tịch. Phủ định dùng 不是 (bú shì). 是 KHÔNG dùng trước tính từ (sai: 我是高).',
      examples: [
        { cn: '我是学生。', pinyin: 'Wǒ shì xuéshēng.', vi: 'Tôi là học sinh.' },
        { cn: '他是老师。', pinyin: 'Tā shì lǎoshī.', vi: 'Anh ấy là giáo viên.' },
        { cn: '我不是医生。', pinyin: 'Wǒ bú shì yīshēng.', vi: 'Tôi không phải bác sĩ.' },
      ],
      note: 'Với tính từ ("Tôi cao", "Tôi bận") dùng 很 chứ KHÔNG dùng 是: 我很高.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' },
      ],
      ROLE: [
        { cn: '学生', vi: 'học sinh' }, { cn: '老师', vi: 'giáo viên' }, { cn: '医生', vi: 'bác sĩ' },
        { cn: '学生', vi: 'học sinh' }, { cn: '中国人', vi: 'người Trung Quốc' }, { cn: '越南人', vi: 'người Việt Nam' },
      ],
      ADJ: [
        { cn: '高', vi: 'cao' }, { cn: '忙', vi: 'bận' }, { cn: '累', vi: 'mệt' }, { cn: '好', vi: 'tốt' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{ROLE}。({SUBJ_vi} là {ROLE_vi})', answer: '是', distractors: ['很', '有', '在'], explain: '是 (shì) nối chủ ngữ với danh từ chỉ danh tính/nghề nghiệp.' },
      { type: 'fill_blank', frame: '{SUBJ}不___{ROLE}。({SUBJ_vi} không phải {ROLE_vi})', answer: '是', distractors: ['很', '有', '在'], explain: 'Phủ định của 是 là 不是 (bú shì).' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nói "{SUBJ_vi} là {ROLE_vi}"', correct: '{SUBJ}是{ROLE}', distractors: ['{SUBJ}很{ROLE}', '{SUBJ}是不{ROLE}', '{ROLE}是{SUBJ}'], explain: 'Chủ ngữ + 是 + danh từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn cách nói "{SUBJ_vi} không phải {ROLE_vi}"', correct: '{SUBJ}不是{ROLE}', distractors: ['{SUBJ}没是{ROLE}', '{SUBJ}不{ROLE}', '{SUBJ}是不{ROLE}'], explain: 'Phủ định 是 → 不是, đặt trước 是.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ngữ pháp ("{SUBJ_vi} {ADJ_vi}")?', correct: '{SUBJ}很{ADJ}。', errors: ['{SUBJ}是{ADJ}。', '{SUBJ}是很{ADJ}。', '{SUBJ}{ADJ}是。'], explain: 'Trước tính từ dùng 很, KHÔNG dùng 是.' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '是', '{ROLE}'], explain: 'Trật tự: Chủ ngữ + 是 + Danh từ.' },
    ],
  },

  // ─── 2. Phủ định 不 và 没 ────────────────────────────
  {
    id: 'bu-mei', title: 'Phủ định: 不 và 没', level: 1,
    desc: 'Phân biệt 不 (không) và 没 (chưa/không có) khi phủ định',
    category: 'adverb', partOfSpeech: 'Phó từ phủ định',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, phủ định 不 và 没' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Comparing "bu" and "mei"' },
    ],
    point: {
      structure: '不 + động từ/tính từ (hiện tại, thói quen, tương lai)  ·  没(有) + động từ (quá khứ, "chưa xảy ra")',
      explain: '不 (bù) phủ định ý muốn, thói quen, trạng thái, việc tương lai. 没(有) (méi yǒu) phủ định hành động đã/đang xảy ra trong quá khứ và luôn dùng để phủ định 有.',
      examples: [
        { cn: '我不喝咖啡。', pinyin: 'Wǒ bù hē kāfēi.', vi: 'Tôi không uống cà phê (thói quen).' },
        { cn: '我没吃饭。', pinyin: 'Wǒ méi chī fàn.', vi: 'Tôi chưa ăn cơm.' },
        { cn: '我没有钱。', pinyin: 'Wǒ méiyǒu qián.', vi: 'Tôi không có tiền.' },
      ],
      note: 'Phủ định 有 luôn dùng 没有, KHÔNG BAO GIỜ dùng 不有.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你', vi: 'Bạn' }, { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' },
      ],
      HABIT: [
        { cn: '喜欢猫', vi: 'thích mèo' }, { cn: '喝咖啡', vi: 'uống cà phê' }, { cn: '去', vi: 'đi' },
        { cn: '吃肉', vi: 'ăn thịt' }, { cn: '看电视', vi: 'xem tivi' }, { cn: '喝酒', vi: 'uống rượu' },
        { cn: '抽烟', vi: 'hút thuốc' }, { cn: '想去', vi: 'muốn đi' },
      ],
      PAST: [
        { cn: '吃饭', vi: 'ăn cơm' }, { cn: '去学校', vi: 'đi học' }, { cn: '看书', vi: 'đọc sách' },
        { cn: '来', vi: 'đến' }, { cn: '睡觉', vi: 'ngủ' }, { cn: '回家', vi: 'về nhà' },
        { cn: '买东西', vi: 'mua đồ' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___有钱。({SUBJ_vi} không có tiền)', answer: '没', distractors: ['不', '别', '无'], explain: 'Phủ định 有 luôn dùng 没有, không dùng 不有.' },
      { type: 'fill_blank', frame: '{SUBJ}___{HABIT}。({SUBJ_vi} không {HABIT_vi} — thói quen/ý muốn)', answer: '不', distractors: ['没', '别', '无'], explain: 'Thói quen/ý muốn/trạng thái dùng 不.' },
      { type: 'fill_blank', frame: '昨天{SUBJ}___{PAST}。(Hôm qua {SUBJ_vi} chưa {PAST_vi})', answer: '没', distractors: ['不', '别', '很'], explain: 'Việc đã qua chưa xảy ra dùng 没.' },
      { type: 'meaning_to_char', prompt: 'Chọn "Hôm qua {SUBJ_vi} chưa {PAST_vi}"', correct: '昨天{SUBJ}没{PAST}', distractors: ['昨天{SUBJ}不{PAST}', '昨天{SUBJ}别{PAST}', '昨天{SUBJ}{PAST}没'], explain: 'Việc quá khứ chưa xảy ra dùng 没, đặt trước động từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào SAI ngữ pháp?', correct: '{SUBJ}不有钱。', errors: ['{SUBJ}没有钱。', '{SUBJ}不去。', '{SUBJ}没吃饭。'], explain: '不有 sai — phủ định 有 phải là 没有.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} không có tiền"', correct: '{SUBJ}没有钱', distractors: ['{SUBJ}不有钱', '{SUBJ}无钱有', '{SUBJ}钱没有'], explain: 'Phủ định 有 bằng 没有.' },
    ],
  },

  // ─── 3. Câu hỏi với 吗 / 呢 ──────────────────────────
  {
    id: 'ma-ne', title: 'Câu hỏi với 吗 / 呢', level: 1,
    desc: '吗 tạo câu hỏi Có/Không; 呢 hỏi lại "còn…thì sao?"',
    category: 'particle', partOfSpeech: 'Trợ từ nghi vấn',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, câu hỏi với 吗 / 呢' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Yes-no questions with "ma"' },
    ],
    point: {
      structure: 'Câu trần thuật + 吗？  ·   Danh từ/Đại từ + 呢？',
      explain: '吗 (ma) đặt cuối câu trần thuật tạo câu hỏi Có/Không. 呢 (ne) hỏi lại cùng chủ đề ("còn…thì sao?") hoặc hỏi vị trí ("…đâu?"). Câu đã có từ để hỏi (什么, 谁…) thì KHÔNG thêm 吗.',
      examples: [
        { cn: '你是中国人吗？', pinyin: 'Nǐ shì Zhōngguó rén ma?', vi: 'Bạn là người Trung Quốc à?' },
        { cn: '我很好，你呢？', pinyin: 'Wǒ hěn hǎo, nǐ ne?', vi: 'Tôi khỏe, còn bạn?' },
        { cn: '我的书呢？', pinyin: 'Wǒ de shū ne?', vi: 'Sách của tôi đâu?' },
      ],
      note: '吧 khác 吗: câu có 什么/谁/哪 thì không thêm 吗.',
    },
    slots: {
      SUBJ: [
        { cn: '你', vi: 'Bạn' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你们', vi: 'Các bạn' }, { cn: '他们', vi: 'Họ' },
      ],
      PRED: [
        { cn: '是中国人', vi: 'là người Trung Quốc' }, { cn: '是老师', vi: 'là giáo viên' },
        { cn: '是学生', vi: 'là học sinh' }, { cn: '很忙', vi: 'rất bận' },
        { cn: '很好', vi: 'khỏe' }, { cn: '去学校', vi: 'đi học' }, { cn: '喜欢中国菜', vi: 'thích món Trung Quốc' },
      ],
      THING: [
        { cn: '书', vi: 'sách' }, { cn: '手机', vi: 'điện thoại' }, { cn: '钥匙', vi: 'chìa khóa' },
        { cn: '词典', vi: 'từ điển' }, { cn: '钱', vi: 'tiền' },
      ],
      QW: [{ cn: '谁', vi: 'ai' }, { cn: '什么', vi: 'cái gì' }, { cn: '哪', vi: 'nào' }],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{PRED}___？(hỏi Có/Không)', answer: '吗', distractors: ['呢', '了', '的'], explain: '吗 tạo câu hỏi Có/Không ở cuối câu trần thuật.' },
      { type: 'fill_blank', frame: '我很好，{SUBJ}___？(còn {SUBJ_vi} thì sao?)', answer: '呢', distractors: ['吗', '了', '吧'], explain: '呢 hỏi lại cùng chủ đề: "còn…thì sao?".' },
      { type: 'fill_blank', frame: '我的{THING}___？({THING_vi} của tôi đâu?)', answer: '呢', distractors: ['吗', '了', '的'], explain: 'Danh từ + 呢 hỏi vị trí "ở đâu".' },
      { type: 'grammar_judge', prompt: 'Câu nào SAI (đã có {QW_vi} còn thêm 吗)?', correct: '{SUBJ}是{QW}？', errors: ['{SUBJ}是{QW}吗？', '{SUBJ}{QW}是吗？', '吗{SUBJ}是{QW}？'], explain: 'Đã có {QW} (từ để hỏi) thì không thêm 吗.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu hỏi "{THING_vi} của tôi đâu?"', correct: '我的{THING}呢？', distractors: ['我的{THING}吗？', '我的{THING}了？', '我的{THING}吧？'], explain: 'Danh từ + 呢 hỏi "ở đâu".' },
      { type: 'sentence_order', tokens: ['{SUBJ}', '{PRED}', '吗'], explain: 'Câu trần thuật + 吗.' },
    ],
  },

  // ─── 4. Sở hữu & định ngữ với 的 ─────────────────────
  {
    id: 'de-possessive', title: 'Sở hữu & định ngữ với 的', level: 1,
    desc: '的 nối người sở hữu/định ngữ với danh từ',
    category: 'particle', partOfSpeech: 'Trợ từ kết cấu',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, trợ từ 的' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Possession and modification with "de"' },
    ],
    point: {
      structure: 'Người sở hữu + 的 + vật   ·   Định ngữ + 的 + danh từ',
      explain: '的 (de) nối người sở hữu với vật (我的书 = sách của tôi) hoặc định ngữ với danh từ (漂亮的花 = bông hoa đẹp). Quan hệ thân thiết thường lược 的 (我妈妈).',
      examples: [
        { cn: '这是我的书。', pinyin: 'Zhè shì wǒ de shū.', vi: 'Đây là sách của tôi.' },
        { cn: '你的手机很好。', pinyin: 'Nǐ de shǒujī hěn hǎo.', vi: 'Điện thoại của bạn rất tốt.' },
        { cn: '这是一朵漂亮的花。', pinyin: 'Zhè shì yì duǒ piàoliang de huā.', vi: 'Đây là một bông hoa đẹp.' },
      ],
      note: 'Quan hệ thân thiết (妈妈, 朋友) thường lược 的: 我妈妈.',
    },
    slots: {
      OWNER: [{ cn: '我', vi: 'tôi' }, { cn: '你', vi: 'bạn' }, { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' }, { cn: '老师', vi: 'giáo viên' }],
      THING: [
        { cn: '书', vi: 'sách' }, { cn: '手机', vi: 'điện thoại' }, { cn: '车', vi: 'xe' },
        { cn: '朋友', vi: 'bạn' }, { cn: '衣服', vi: 'áo' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '这是{OWNER}___{THING}。({THING_vi} của {OWNER_vi})', answer: '的', distractors: ['是', '很', '了'], explain: '{OWNER}的{THING} = {THING_vi} của {OWNER_vi}. 的 chỉ sở hữu.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{THING_vi} của {OWNER_vi}"', correct: '{OWNER}的{THING}', distractors: ['{THING}{OWNER}的', '{OWNER}{THING}的', '的{OWNER}{THING}'], explain: 'Người sở hữu + 的 + vật.' },
      { type: 'grammar_judge', prompt: 'Cách nói "{THING_vi} của {OWNER_vi}" ĐÚNG nhất là?', correct: '{OWNER}的{THING}', errors: ['{OWNER}的的{THING}', '{THING}{OWNER}的', '的{OWNER}{THING}'], explain: 'Người sở hữu (定语) + 的 + vật.' },
      { type: 'sentence_order', tokens: ['这', '是', '{OWNER}', '的', '{THING}'], explain: '这 + 是 + {OWNER} + 的 + {THING}.' },
    ],
  },

  // ─── 5. Câu với 有 (có) ─────────────────────────────
  {
    id: 'you-have', title: 'Câu với 有 (có)', level: 1,
    desc: '有 chỉ sở hữu hoặc sự tồn tại; phủ định luôn dùng 没有',
    category: 'sentence-pattern', partOfSpeech: 'Động từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, câu với 有' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing existence with "you"' },
    ],
    point: {
      structure: 'Chủ ngữ + 有 + tân ngữ   ·   Nơi chốn + 有 + vật/người',
      explain: '有 (yǒu) chỉ sở hữu (我有一个妹妹) hoặc sự tồn tại (教室里有学生). Phủ định LUÔN dùng 没有, không bao giờ 不有.',
      examples: [
        { cn: '我有一个妹妹。', pinyin: 'Wǒ yǒu yí ge mèimei.', vi: 'Tôi có một em gái.' },
        { cn: '教室里有很多学生。', pinyin: 'Jiàoshì lǐ yǒu hěn duō xuéshēng.', vi: 'Trong lớp có nhiều học sinh.' },
        { cn: '我没有时间。', pinyin: 'Wǒ méiyǒu shíjiān.', vi: 'Tôi không có thời gian.' },
      ],
      note: 'Phủ định 有 là 没有. Đếm vật dùng 两 (两个), không dùng 二个.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '我们', vi: 'Chúng tôi' }, { cn: '老师', vi: 'Giáo viên' },
      ],
      THING: [
        { cn: '时间', vi: 'thời gian' }, { cn: '钱', vi: 'tiền' }, { cn: '一个妹妹', vi: 'một em gái' },
        { cn: '很多书', vi: 'nhiều sách' }, { cn: '一辆车', vi: 'một cái xe' },
        { cn: '一个问题', vi: 'một câu hỏi' }, { cn: '两个哥哥', vi: 'hai anh trai' },
        { cn: '一只猫', vi: 'một con mèo' },
      ],
      PLACE: [
        { cn: '教室里', vi: 'trong lớp' }, { cn: '桌子上', vi: 'trên bàn' },
        { cn: '家里', vi: 'trong nhà' }, { cn: '学校里', vi: 'trong trường' },
      ],
      EXIST: [
        { cn: '很多学生', vi: 'nhiều học sinh' }, { cn: '一本书', vi: 'một quyển sách' },
        { cn: '两个人', vi: 'hai người' }, { cn: '一台电脑', vi: 'một cái máy tính' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{THING}。({SUBJ_vi} có {THING_vi})', answer: '有', distractors: ['是', '在', '很'], explain: '有 chỉ sở hữu.' },
      { type: 'fill_blank', frame: '{SUBJ}___{THING}。({SUBJ_vi} không có {THING_vi})', answer: '没有', distractors: ['不有', '无有', '不是'], explain: 'Phủ định 有 là 没有.' },
      { type: 'fill_blank', frame: '{PLACE}___{EXIST}。({PLACE_vi} có {EXIST_vi})', answer: '有', distractors: ['是', '在', '的'], explain: 'Nơi chốn + 有 + vật/người: chỉ sự tồn tại.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} không có {THING_vi}"', correct: '{SUBJ}没有{THING}', distractors: ['{SUBJ}不有{THING}', '{SUBJ}{THING}没有', '{SUBJ}无{THING}有'], explain: 'Phủ định 有 bằng 没有.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{PLACE_vi} có {EXIST_vi}"', correct: '{PLACE}有{EXIST}', distractors: ['{PLACE}是{EXIST}', '{EXIST}有{PLACE}', '{PLACE}{EXIST}有'], explain: 'Nơi chốn + 有 + vật tồn tại.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG?', correct: '我有两个哥哥。', errors: ['我有二个哥哥。', '我是两个哥哥。', '我两个哥哥有。'], explain: 'Đếm vật dùng 两个, không dùng 二个.' },
      { type: 'sentence_order', tokens: ['桌子上', '有', '一本', '书'], explain: 'Nơi chốn + 有 + số lượng + vật.' },
    ],
  },

  // ─── Phó từ: 也 / 都 ─────────────────────────────────
  {
    id: 'adv-ye-dou', title: 'Phó từ 也 / 都 (cũng / đều)', level: 1,
    desc: 'Phó từ 也 (cũng) và 都 (đều) đứng trước động từ/tính từ',
    category: 'adverb', partOfSpeech: 'Phó từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, phó từ 也 và 都' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Expressing "also" with "ye"; using "dou" for "all"' },
    ],
    point: {
      structure: 'Chủ ngữ + 也/都 + động từ/tính từ',
      explain: '也 (yě) nghĩa "cũng", 都 (dōu) nghĩa "đều/tất cả". Cả hai là phó từ, đặt SAU chủ ngữ và TRƯỚC động từ/tính từ. 都 tổng kết cho phần đứng TRƯỚC nó (số nhiều).',
      examples: [
        { cn: '我也是学生。', pinyin: 'Wǒ yě shì xuéshēng.', vi: 'Tôi cũng là học sinh.' },
        { cn: '我们都是学生。', pinyin: 'Wǒmen dōu shì xuéshēng.', vi: 'Chúng tôi đều là học sinh.' },
        { cn: '他也喜欢中国菜。', pinyin: 'Tā yě xǐhuān Zhōngguó cài.', vi: 'Anh ấy cũng thích món Trung Quốc.' },
      ],
      note: '也/都 KHÔNG đặt cuối câu. 都 phải đứng sau đối tượng số nhiều mà nó tổng kết.',
    },
    slots: {
      SUBJ: [
        { cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' }, { cn: '你', vi: 'Bạn' },
      ],
      GROUP: [
        { cn: '我们', vi: 'Chúng tôi' }, { cn: '他们', vi: 'Họ' }, { cn: '学生们', vi: 'Các học sinh' },
        { cn: '老师们', vi: 'Các giáo viên' },
      ],
      VP: [
        { cn: '去', vi: 'đi' }, { cn: '来', vi: 'đến' }, { cn: '喜欢中国菜', vi: 'thích món Trung Quốc' },
        { cn: '很忙', vi: 'rất bận' }, { cn: '想去', vi: 'muốn đi' }, { cn: '会说汉语', vi: 'biết nói tiếng Hán' },
      ],
      NOUN: [
        { cn: '学生', vi: 'học sinh' }, { cn: '中国人', vi: 'người Trung Quốc' }, { cn: '老师', vi: 'giáo viên' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '你{VP}，{SUBJ}___{VP}。({SUBJ_vi} cũng vậy)', answer: '也', distractors: ['都', '很', '还'], explain: '也 = cũng, đặt trước động từ/tính từ.' },
      { type: 'fill_blank', frame: '{GROUP}___{VP}。({GROUP_vi} đều {VP_vi})', answer: '都', distractors: ['也', '很', '太'], explain: '都 = đều, tổng kết cho số nhiều.' },
      { type: 'fill_blank', frame: '{GROUP}___是{NOUN}。({GROUP_vi} đều là {NOUN_vi})', answer: '都', distractors: ['也', '很', '还'], explain: '都 tổng kết cho {GROUP_vi} (số nhiều).' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ngữ pháp?', correct: '{SUBJ}也{VP}。', errors: ['{SUBJ}{VP}也。', '也{SUBJ}{VP}。', '{SUBJ}{VP}也吗。'], explain: '也 đặt sau chủ ngữ, trước động từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{GROUP_vi} đều là {NOUN_vi}"', correct: '{GROUP}都是{NOUN}', distractors: ['{GROUP}是都{NOUN}', '都{GROUP}是{NOUN}', '{GROUP}{NOUN}都是'], explain: '都 đứng trước 是, sau chủ ngữ.' },
      { type: 'sentence_order', tokens: ['我', '也', '喜欢', '中国'], explain: '我 + 也 + 喜欢 + 中国.' },
    ],
  },

  // ─── Phó từ mức độ: 很 / 太…了 ──────────────────────
  {
    id: 'adv-hen-tai', title: 'Phó từ mức độ 很 / 太…了', level: 1,
    desc: 'Phó từ mức độ 很 (rất) và cấu trúc 太…了 (quá)',
    category: 'adverb', partOfSpeech: 'Phó từ mức độ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, phó từ mức độ 很 và 太…了' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Using "hen" with adjectives; expressing "too" with "tai le"' },
    ],
    point: {
      structure: 'Chủ ngữ + 很 + tính từ   ·   Chủ ngữ + 太 + tính từ + 了',
      explain: '很 (hěn) = "rất", đặt trước tính từ. Tính từ làm vị ngữ thường cần 很 đứng trước (我很高). 太…了 (tài…le) = "quá", 太 đi kèm 了 ở cuối.',
      examples: [
        { cn: '我很忙。', pinyin: 'Wǒ hěn máng.', vi: 'Tôi rất bận.' },
        { cn: '今天太热了。', pinyin: 'Jīntiān tài rè le.', vi: 'Hôm nay nóng quá.' },
        { cn: '这个菜很好吃。', pinyin: 'Zhège cài hěn hǎochī.', vi: 'Món này rất ngon.' },
      ],
      note: '太 hầu như luôn đi với 了: 太贵了 (đắt quá).',
    },
    slots: {
      SUBJ: [{ cn: '我', vi: 'Tôi' }, { cn: '他', vi: 'Anh ấy' }, { cn: '今天', vi: 'Hôm nay' }, { cn: '这个菜', vi: 'Món này' }],
      ADJ: [
        { cn: '忙', vi: 'bận' }, { cn: '热', vi: 'nóng' }, { cn: '好吃', vi: 'ngon' },
        { cn: '贵', vi: 'đắt' }, { cn: '累', vi: 'mệt' }, { cn: '高', vi: 'cao' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}___{ADJ}了。({SUBJ_vi} {ADJ_vi} quá)', answer: '太', distractors: ['很', '都', '也'], explain: '太…了 diễn tả mức độ "quá".' },
      { type: 'fill_blank', frame: '{SUBJ}___{ADJ}。({SUBJ_vi} rất {ADJ_vi})', answer: '很', distractors: ['太', '都', '也'], explain: '很 + tính từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG ngữ pháp?', correct: '{SUBJ}太{ADJ}了。', errors: ['{SUBJ}太{ADJ}。', '{SUBJ}了太{ADJ}。', '{SUBJ}{ADJ}太了。'], explain: '太 phải đi với 了.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} rất {ADJ_vi}"', correct: '{SUBJ}很{ADJ}', distractors: ['{SUBJ}太{ADJ}', '{SUBJ}{ADJ}很', '很{SUBJ}{ADJ}'], explain: '很 + tính từ, đặt trước tính từ.' },
      { type: 'sentence_order', tokens: ['我', '很', '累'], explain: '我 + 很 + 累.' },
    ],
  },

  // ─── Lượng từ ──────────────────────────────────────
  {
    id: 'measure-words', title: 'Lượng từ thường gặp', level: 1,
    desc: '个/本/张/只/件/杯/位/条 — chọn lượng từ đúng cho từng loại danh từ',
    category: 'measure-word', partOfSpeech: 'Lượng từ',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, lượng từ cơ bản' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Measure words for nouns' },
    ],
    point: {
      structure: 'Số từ + Lượng từ + Danh từ',
      explain: 'Giữa số từ và danh từ phải có lượng từ. 个 dùng chung; 本 cho sách; 张 cho vật phẳng; 只 cho động vật nhỏ; 件 cho áo/sự việc; 杯 cho cốc; 位 cho người (lịch sự); 条 cho vật dài.',
      examples: [
        { cn: '我有一本书。', pinyin: 'Wǒ yǒu yì běn shū.', vi: 'Tôi có một quyển sách.' },
        { cn: '桌子上有三张纸。', pinyin: 'Zhuōzi shàng yǒu sān zhāng zhǐ.', vi: 'Trên bàn có ba tờ giấy.' },
        { cn: '他买了一件衣服。', pinyin: 'Tā mǎi le yí jiàn yīfú.', vi: 'Anh ấy mua một cái áo.' },
      ],
      note: '个 vạn năng, nhưng nên dùng lượng từ chuyên biệt khi có.',
    },
    slots: {
      MW: [
        { cn: '本', vi: 'quyển', noun: '书', nounVi: 'sách', wrong: ['张', '个', '条'] },
        { cn: '本', vi: 'quyển', noun: '词典', nounVi: 'từ điển', wrong: ['张', '只', '杯'] },
        { cn: '张', vi: 'tờ', noun: '纸', nounVi: 'giấy', wrong: ['本', '只', '杯'] },
        { cn: '张', vi: 'tấm', noun: '照片', nounVi: 'bức ảnh', wrong: ['本', '条', '件'] },
        { cn: '张', vi: 'chiếc', noun: '桌子', nounVi: 'bàn', wrong: ['本', '只', '条'] },
        { cn: '只', vi: 'con', noun: '猫', nounVi: 'mèo', wrong: ['个', '本', '条'] },
        { cn: '只', vi: 'con', noun: '狗', nounVi: 'chó', wrong: ['个', '张', '件'] },
        { cn: '只', vi: 'con', noun: '鸟', nounVi: 'chim', wrong: ['本', '张', '杯'] },
        { cn: '杯', vi: 'cốc', noun: '茶', nounVi: 'trà', wrong: ['个', '张', '件'] },
        { cn: '杯', vi: 'cốc', noun: '咖啡', nounVi: 'cà phê', wrong: ['只', '本', '条'] },
        { cn: '杯', vi: 'cốc', noun: '水', nounVi: 'nước', wrong: ['张', '只', '件'] },
        { cn: '条', vi: 'con', noun: '鱼', nounVi: 'cá', wrong: ['只', '个', '张'] },
        { cn: '条', vi: 'chiếc', noun: '裤子', nounVi: 'quần', wrong: ['本', '只', '杯'] },
        { cn: '条', vi: 'con', noun: '路', nounVi: 'đường', wrong: ['个', '张', '件'] },
        { cn: '件', vi: 'cái', noun: '衣服', nounVi: 'áo', wrong: ['个', '条', '张'] },
        { cn: '件', vi: 'việc', noun: '事', nounVi: 'việc', wrong: ['只', '本', '杯'] },
        { cn: '位', vi: 'vị', noun: '老师', nounVi: 'giáo viên', wrong: ['只', '本', '条'] },
        { cn: '位', vi: 'vị', noun: '客人', nounVi: 'khách', wrong: ['张', '条', '杯'] },
        { cn: '把', vi: 'chiếc', noun: '椅子', nounVi: 'ghế', wrong: ['本', '只', '杯'] },
        { cn: '双', vi: 'đôi', noun: '鞋', nounVi: 'giày', wrong: ['个', '张', '本'] },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '一___{MW.noun} (một {MW_vi} {MW.nounVi})', answer: '{MW.cn}', distractors: ['{MW.wrong.0}', '{MW.wrong.1}', '{MW.wrong.2}'], explain: '{MW.cn} là lượng từ cho {MW.nounVi}.' },
      { type: 'fill_blank', frame: '我有两___{MW.noun}。(Tôi có hai {MW_vi} {MW.nounVi})', answer: '{MW.cn}', distractors: ['{MW.wrong.0}', '{MW.wrong.1}', '{MW.wrong.2}'], explain: 'Số từ 两 + {MW.cn} + {MW.noun}.' },
      { type: 'meaning_to_char', prompt: 'Chọn "một {MW_vi} {MW.nounVi}"', correct: '一{MW.cn}{MW.noun}', distractors: ['一{MW.wrong.0}{MW.noun}', '一{MW.wrong.1}{MW.noun}', '一{MW.wrong.2}{MW.noun}'], explain: 'Số từ + {MW.cn} + {MW.noun}.' },
      { type: 'grammar_judge', prompt: 'Lượng từ nào ĐÚNG cho {MW.nounVi}?', correct: '一{MW.cn}{MW.noun}', errors: ['一{MW.wrong.0}{MW.noun}', '一{MW.wrong.1}{MW.noun}', '一{MW.wrong.2}{MW.noun}'], explain: '{MW.nounVi} dùng lượng từ {MW.cn}.' },
      { type: 'sentence_order', tokens: ['我', '有', '一{MW.cn}', '{MW.noun}'], explain: 'Chủ ngữ + 有 + số lượng từ + danh từ.' },
    ],
  },

  // ─── Trợ từ 吧 ─────────────────────────────────────
  {
    id: 'particle-ba', title: 'Trợ từ 吧 (đề nghị / suy đoán)', level: 1,
    desc: '吧 làm nhẹ giọng: đề nghị, rủ rê, suy đoán',
    category: 'particle', partOfSpeech: 'Trợ từ ngữ khí',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1–2, trợ từ ngữ khí 吧' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Softening speech with "ba"' },
    ],
    point: {
      structure: 'Câu + 吧',
      explain: '吧 (ba) đặt cuối câu để đề nghị, rủ rê, hoặc suy đoán, làm giọng điệu nhẹ nhàng hơn.',
      examples: [
        { cn: '我们走吧。', pinyin: 'Wǒmen zǒu ba.', vi: 'Chúng ta đi thôi.' },
        { cn: '你是老师吧？', pinyin: 'Nǐ shì lǎoshī ba?', vi: 'Bạn là giáo viên nhỉ?' },
        { cn: '好吧。', pinyin: 'Hǎo ba.', vi: 'Được thôi.' },
      ],
      note: '吧 khác 吗: 吧 dùng đề nghị/suy đoán/đồng ý; 吗 hỏi thẳng Có/Không.',
    },
    slots: {
      // Đề nghị: WHO × ACT (nhân tổ hợp — câu rủ rê)
      WHO: [
        { cn: '我们', vi: 'chúng ta' }, { cn: '你', vi: 'bạn' },
        { cn: '咱们', vi: 'chúng mình' }, { cn: '大家', vi: 'mọi người' },
      ],
      ACT: [
        { cn: '走', vi: 'đi thôi' }, { cn: '吃饭', vi: 'ăn cơm thôi' }, { cn: '回家', vi: 'về nhà thôi' },
        { cn: '看电影', vi: 'xem phim thôi' }, { cn: '喝茶', vi: 'uống trà thôi' }, { cn: '休息', vi: 'nghỉ thôi' },
        { cn: '睡觉', vi: 'đi ngủ thôi' }, { cn: '出去', vi: 'ra ngoài thôi' }, { cn: '开始', vi: 'bắt đầu thôi' },
      ],
      // Suy đoán: SUBJ × PRED (nhân tổ hợp — câu phỏng đoán)
      GSUBJ: [{ cn: '你', vi: 'Bạn' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' }],
      GPRED: [
        { cn: '是老师', vi: 'là giáo viên' }, { cn: '是中国人', vi: 'là người Trung Quốc' },
        { cn: '很累', vi: 'mệt rồi' }, { cn: '是学生', vi: 'là học sinh' },
        { cn: '饿了', vi: 'đói rồi' }, { cn: '很忙', vi: 'bận rồi' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{WHO}{ACT}___。(đề nghị: {WHO_vi} {ACT_vi})', answer: '吧', distractors: ['吗', '呢', '了'], explain: '吧 đề nghị/rủ rê.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu đề nghị "{WHO_vi} {ACT_vi}"', correct: '{WHO}{ACT}吧', distractors: ['{WHO}{ACT}吗', '{WHO}{ACT}呢', '{WHO}{ACT}了'], explain: '…吧 diễn tả đề nghị.' },
      { type: 'fill_blank', frame: '{GSUBJ}{GPRED}___？(suy đoán: {GSUBJ_vi} {GPRED_vi} nhỉ?)', answer: '吧', distractors: ['吗', '呢', '的'], explain: '吧 diễn tả suy đoán.' },
      { type: 'meaning_to_char', prompt: 'Chọn câu suy đoán "{GSUBJ_vi} {GPRED_vi} nhỉ?"', correct: '{GSUBJ}{GPRED}吧？', distractors: ['{GSUBJ}{GPRED}吗？', '{GSUBJ}{GPRED}呢？', '{GSUBJ}{GPRED}的？'], explain: '…吧 diễn tả suy đoán.' },
      { type: 'grammar_judge', prompt: 'Khác biệt của 吧 so với 吗?', correct: '吧 dùng đề nghị/suy đoán, 吗 hỏi thẳng Có/Không', errors: ['吧 và 吗 giống hệt nhau', '吧 chỉ dùng cuối câu hỏi Có/Không', '吧 là trợ từ sở hữu'], explain: '吧 làm nhẹ giọng; 吗 hỏi trực tiếp.' },
    ],
  },

  // ─── Đại từ chỉ định: 这 / 那 ──────────────────────
  {
    id: 'pron-zhe-na', title: 'Đại từ chỉ định 这 / 那', level: 1,
    desc: '这 (này — gần) và 那 (kia — xa), cùng 这儿/那儿 chỉ nơi chốn',
    category: 'pronoun', partOfSpeech: 'Đại từ chỉ định',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, đại từ chỉ định 这 / 那' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Demonstrative pronouns "zhe" and "na"' },
    ],
    point: {
      structure: '这/那 (+ lượng từ) + danh từ   ·   这儿/那儿 (nơi chốn)',
      explain: '这 (zhè) = "này" chỉ vật ở gần; 那 (nà) = "kia" chỉ vật ở xa. Khi đi với danh từ đếm được, thêm lượng từ: 这个/那本. 这儿 = "ở đây", 那儿 = "ở kia".',
      examples: [
        { cn: '这是我的书。', pinyin: 'Zhè shì wǒ de shū.', vi: 'Đây là sách của tôi.' },
        { cn: '那是他的车。', pinyin: 'Nà shì tā de chē.', vi: 'Kia là xe của anh ấy.' },
        { cn: '这个人是老师。', pinyin: 'Zhège rén shì lǎoshī.', vi: 'Người này là giáo viên.' },
      ],
      note: '这/那 + lượng từ + danh từ. Nơi chốn dùng 这儿/那儿.',
    },
    slots: {
      NOUN: [
        { cn: '书', vi: 'sách' }, { cn: '车', vi: 'xe' }, { cn: '人', vi: 'người' },
        { cn: '手机', vi: 'điện thoại' }, { cn: '衣服', vi: 'áo' }, { cn: '包', vi: 'túi' },
        { cn: '杯子', vi: 'cái cốc' }, { cn: '桌子', vi: 'cái bàn' },
      ],
      // Người sở hữu (nhân với NOUN để tạo nhiều tổ hợp)
      OWNER: [{ cn: '我', vi: 'tôi' }, { cn: '他', vi: 'anh ấy' }, { cn: '她', vi: 'cô ấy' }, { cn: '你', vi: 'bạn' }],
      // Nơi chốn cho 这儿/那儿
      PLACE: [
        { cn: '住', vi: 'sống' }, { cn: '工作', vi: 'làm việc' }, { cn: '学习', vi: 'học' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '___是{OWNER}的{NOUN}。(gần: {NOUN_vi} của {OWNER_vi} — ở đây)', answer: '这', distractors: ['那', '谁', '什么'], explain: '这 chỉ vật ở gần: 这是….' },
      { type: 'fill_blank', frame: '___是{OWNER}的{NOUN}，在很远的地方。(xa: {NOUN_vi} của {OWNER_vi})', answer: '那', distractors: ['这', '哪', '谁'], explain: '那 chỉ vật ở xa.' },
      { type: 'meaning_to_char', prompt: 'Chọn "Cái {NOUN_vi} này là của {OWNER_vi}"', correct: '这个{NOUN}是{OWNER}的', distractors: ['那个{NOUN}是{OWNER}的', '哪个{NOUN}是{OWNER}的', '什么{NOUN}是{OWNER}的'], explain: '这个 chỉ vật ở gần.' },
      { type: 'meaning_to_char', prompt: 'Chọn "Cái {NOUN_vi} kia là của {OWNER_vi}"', correct: '那个{NOUN}是{OWNER}的', distractors: ['这个{NOUN}是{OWNER}的', '哪个{NOUN}是{OWNER}的', '什么{NOUN}是{OWNER}的'], explain: '那个 chỉ vật ở xa.' },
      { type: 'fill_blank', frame: '我在___儿{PLACE}。(Tôi {PLACE_vi} ở đây)', answer: '这', distractors: ['那', '哪', '什么'], explain: '这儿 = ở đây (nơi gần).' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (chỉ vật ở gần)?', correct: '这本{NOUN}很好。', errors: ['那本{NOUN}很好那。', '这那{NOUN}很好。', '{NOUN}这本很好。'], explain: '这 + 本 + danh từ.' },
    ],
  },

  // ─── Đại từ nghi vấn: 谁 / 什么 / 哪 ────────────────
  {
    id: 'pron-question', title: 'Đại từ nghi vấn 谁 / 什么 / 哪', level: 1,
    desc: '谁 (ai), 什么 (cái gì), 哪 (nào) — hỏi mà không dùng 吗',
    category: 'pronoun', partOfSpeech: 'Đại từ nghi vấn',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, đại từ nghi vấn 谁 / 什么 / 哪' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Question pronouns "shei", "shenme", "na"' },
    ],
    point: {
      structure: 'Dùng từ để hỏi thay vào vị trí thành phần cần hỏi (KHÔNG thêm 吗)',
      explain: '谁 (shéi) = "ai"; 什么 (shénme) = "cái gì/gì"; 哪 (nǎ) = "nào". Trật tự từ giữ nguyên như câu trần thuật; câu đã có từ để hỏi thì KHÔNG thêm 吗.',
      examples: [
        { cn: '他是谁？', pinyin: 'Tā shì shéi?', vi: 'Anh ấy là ai?' },
        { cn: '这是什么？', pinyin: 'Zhè shì shénme?', vi: 'Đây là cái gì?' },
        { cn: '你去哪儿？', pinyin: 'Nǐ qù nǎr?', vi: 'Bạn đi đâu?' },
      ],
      note: 'Câu có 谁/什么/哪 thì KHÔNG dùng 吗.',
    },
    slots: {
      SUBJ: [
        { cn: '你', vi: 'Bạn' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你们', vi: 'Các bạn' }, { cn: '老师', vi: 'Giáo viên' },
      ],
      // Động từ đi với "ai" (谁)
      WHOACT: [
        { cn: '是', vi: 'là' }, { cn: '找', vi: 'tìm' }, { cn: '认识', vi: 'quen' },
        { cn: '想见', vi: 'muốn gặp' }, { cn: '喜欢', vi: 'thích' }, { cn: '等', vi: 'đợi' },
      ],
      // Động từ đi với "cái gì" (什么)
      DOVERB: [
        { cn: '叫', vi: 'gọi là' }, { cn: '想吃', vi: 'muốn ăn' }, { cn: '要买', vi: 'muốn mua' },
        { cn: '喜欢', vi: 'thích' }, { cn: '看', vi: 'xem' }, { cn: '做', vi: 'làm' },
      ],
      // Động từ đi với "đâu" (哪儿)
      GOVERB: [
        { cn: '去', vi: 'đi' }, { cn: '在', vi: 'ở' }, { cn: '住', vi: 'sống' },
        { cn: '工作', vi: 'làm việc' }, { cn: '学习', vi: 'học' },
      ],
      // Danh từ cho "cái nào" (哪个)
      PICK: [
        { cn: '书', vi: 'sách' }, { cn: '手机', vi: 'điện thoại' }, { cn: '菜', vi: 'món ăn' },
        { cn: '衣服', vi: 'áo' }, { cn: '包', vi: 'túi' }, { cn: '杯子', vi: 'cái cốc' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}{WHOACT}___？({SUBJ_vi} {WHOACT_vi} ai?)', answer: '谁', distractors: ['什么', '哪', '吗'], explain: '谁 hỏi về người.' },
      { type: 'fill_blank', frame: '{SUBJ}{DOVERB}___？({SUBJ_vi} {DOVERB_vi} cái gì?)', answer: '什么', distractors: ['谁', '哪', '呢'], explain: '什么 hỏi về vật.' },
      { type: 'fill_blank', frame: '{SUBJ}{GOVERB}___儿？({SUBJ_vi} {GOVERB_vi} đâu?)', answer: '哪', distractors: ['那', '这', '什么'], explain: '哪儿 = ở đâu.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} thích cái {PICK_vi} nào?"', correct: '{SUBJ}喜欢哪个{PICK}？', distractors: ['{SUBJ}喜欢什么个{PICK}？', '{SUBJ}喜欢谁个{PICK}？', '{SUBJ}喜欢哪个{PICK}吗？'], explain: '哪个 = cái nào; không thêm 吗.' },
      { type: 'grammar_judge', prompt: 'Câu nào SAI ("{SUBJ_vi} {WHOACT_vi} ai")?', correct: '{SUBJ}{WHOACT}谁？', errors: ['{SUBJ}{WHOACT}谁吗？', '{SUBJ}{WHOACT}谁呢吗？', '{SUBJ}谁{WHOACT}吗？'], explain: 'Đã có 谁 thì không thêm 吗.' },
    ],
  },

  // ─── Đại từ nghi vấn số lượng: 几 / 多少 ────────────
  {
    id: 'pron-ji-duoshao', title: 'Đại từ nghi vấn 几 / 多少', level: 1,
    desc: '几 (mấy — số nhỏ, cần lượng từ) và 多少 (bao nhiêu — số bất kỳ)',
    category: 'pronoun', partOfSpeech: 'Đại từ nghi vấn',
    sources: [
      { label: 'HSK Standard Course', ref: 'Cấp 1, đại từ nghi vấn 几 / 多少' },
      { label: 'Chinese Grammar Wiki (AllSet Learning)', ref: 'Comparing "ji" and "duoshao"' },
    ],
    point: {
      structure: '几 + lượng từ + danh từ   ·   多少 (+ lượng từ) + danh từ',
      explain: '几 (jǐ) = "mấy", hỏi số nhỏ (thường dưới 10) và PHẢI có lượng từ theo sau. 多少 (duōshao) = "bao nhiêu", hỏi số lượng bất kỳ, có thể không cần lượng từ.',
      examples: [
        { cn: '你有几个孩子？', pinyin: 'Nǐ yǒu jǐ ge háizi?', vi: 'Bạn có mấy đứa con?' },
        { cn: '现在几点？', pinyin: 'Xiànzài jǐ diǎn?', vi: 'Bây giờ mấy giờ?' },
        { cn: '这个多少钱？', pinyin: 'Zhège duōshao qián?', vi: 'Cái này bao nhiêu tiền?' },
      ],
      note: '几 cho số nhỏ và cần lượng từ. 多少 cho số lớn/bất kỳ.',
    },
    slots: {
      // 几 + lượng từ + danh từ đếm được (số nhỏ)
      SMALL: [
        { cn: '个孩子', vi: 'đứa con', mw: '个' }, { cn: '本书', vi: 'quyển sách', mw: '本' },
        { cn: '个人', vi: 'người', mw: '个' }, { cn: '只猫', vi: 'con mèo', mw: '只' },
        { cn: '件衣服', vi: 'cái áo', mw: '件' }, { cn: '个哥哥', vi: 'anh trai', mw: '个' },
        { cn: '个妹妹', vi: 'em gái', mw: '个' }, { cn: '张纸', vi: 'tờ giấy', mw: '张' },
        { cn: '杯茶', vi: 'cốc trà', mw: '杯' }, { cn: '条鱼', vi: 'con cá', mw: '条' },
      ],
      // 多少 + danh từ (số lớn/bất kỳ, có thể lược lượng từ)
      BIG: [
        { cn: '钱', vi: 'tiền' }, { cn: '学生', vi: 'học sinh' }, { cn: '人', vi: 'người' },
        { cn: '书', vi: 'sách' }, { cn: '词', vi: 'từ vựng' }, { cn: '同学', vi: 'bạn học' },
      ],
      SUBJ: [
        { cn: '你', vi: 'Bạn' }, { cn: '他', vi: 'Anh ấy' }, { cn: '她', vi: 'Cô ấy' },
        { cn: '你们班', vi: 'Lớp bạn' }, { cn: '你家', vi: 'Nhà bạn' },
      ],
    },
    templates: [
      { type: 'fill_blank', frame: '{SUBJ}有___{SMALL}？(hỏi "mấy" — số nhỏ)', answer: '几', distractors: ['多少', '什么', '哪'], explain: '几 hỏi số nhỏ, đi kèm lượng từ ({SMALL.mw}).' },
      { type: 'fill_blank', frame: '{SUBJ}有___{BIG}？(hỏi "bao nhiêu" — số bất kỳ)', answer: '多少', distractors: ['几', '什么', '哪'], explain: '多少 hỏi số lượng bất kỳ, có thể lược lượng từ.' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} có mấy {SMALL_vi}?"', correct: '{SUBJ}有几{SMALL}？', distractors: ['{SUBJ}有多少{SMALL}？', '{SUBJ}有几个{SMALL}吗？', '{SUBJ}几有{SMALL}？'], explain: '几 + lượng từ + danh từ (số nhỏ).' },
      { type: 'meaning_to_char', prompt: 'Chọn "{SUBJ_vi} có bao nhiêu {BIG_vi}?"', correct: '{SUBJ}有多少{BIG}？', distractors: ['{SUBJ}有几{BIG}？', '{SUBJ}多少有{BIG}吗？', '{SUBJ}有什么{BIG}？'], explain: '多少 có thể không cần lượng từ.' },
      { type: 'grammar_judge', prompt: 'Câu nào ĐÚNG (几 + {SMALL_vi})?', correct: '你有几{SMALL}？', errors: ['你有几{BIG}吗？', '你多少有{SMALL}？', '你有哪{SMALL}？'], explain: '几 phải có lượng từ theo sau.' },
      { type: 'fill_blank', frame: '现在___点？(hỏi "mấy giờ")', answer: '几', distractors: ['多少', '什么', '哪'], explain: '几点 = mấy giờ (số nhỏ).' },
      { type: 'grammar_judge', prompt: 'Hỏi số lớn (dân số, giá tiền) thường dùng?', correct: '多少', errors: ['几', '哪', '谁'], explain: '多少 hỏi số lượng lớn/bất kỳ.' },
    ],
  },
];
