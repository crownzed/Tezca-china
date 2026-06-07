// ============================================================
// Câu hỏi ngữ pháp — sinh ngẫu nhiên theo chủ điểm
// ============================================================

/** @typedef {'grammar'|'sentence_order'|'pick_wrong'} GrammarQuizType */

export const GRAMMAR_QUIZ_TYPES = ['grammar', 'sentence_order', 'pick_wrong'];

const SUBJECTS = ['我', '你', '他', '她', '我们', '他们'];
const NOUNS = ['学生', '老师', '医生', '朋友', '同学'];
const VERBS = ['学中文', '吃饭', '看书', '喝茶', '写字'];
const PLACES = ['学校', '家', '商店', '图书馆', '公司'];
const ADJECTIVES = ['高', '快', '忙', '热', '冷'];
const OBJECTS = ['书', '咖啡', '水', '电影', '中文'];
const MEASURE_WORDS = [
  ['书', '本'],
  ['咖啡', '杯'],
  ['水', '杯'],
  ['电影票', '张'],
  ['猫', '只'],
];
const PRACTICAL_SCENARIOS = [
  { place: '公司', person: '同事', action: '开会', object: '会议', time: '今天下午' },
  { place: '饭店', person: '服务员', action: '买单', object: '菜单', time: '现在' },
  { place: '地铁站', person: '朋友', action: '等你', object: '地铁', time: '明天早上' },
  { place: '医院', person: '医生', action: '看病', object: '药', time: '今天' },
  { place: '超市', person: '老板', action: '买东西', object: '水果', time: '周末' },
  { place: '学校', person: '老师', action: '上课', object: '中文', time: '明天' },
  { place: '银行', person: '前台', action: '办手续', object: '地址', time: '下午' },
  { place: '公园', person: '邻居', action: '散步', object: '水', time: '晚上' },
  { place: '机场', person: '工作人员', action: '值机', object: '护照', time: '今天上午' },
  { place: '酒店', person: '前台', action: '入住', object: '房间', time: '今晚' },
  { place: '药店', person: '药师', action: '买药', object: '药', time: '现在' },
  { place: '快递点', person: '快递员', action: '取件', object: '包裹', time: '下午' },
  { place: '会议室', person: '经理', action: '汇报', object: '项目', time: '明早' },
  { place: '咖啡店', person: '店员', action: '点单', object: '咖啡', time: '中午' },
  { place: '图书馆', person: '管理员', action: '借书', object: '书', time: '周三' },
  { place: '公交站', person: '乘客', action: '等车', object: '公交车', time: '早上' },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dedupeByKey(items, getKey) {
  const seen = new Set();
  const out = [];
  items.forEach((item) => {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  });
  return out;
}

function buildGrammarMcq() {
  const qs = [];
  SUBJECTS.forEach((s) => {
    NOUNS.forEach((n) => {
      qs.push({
        type: 'grammar',
        grammarKey: 'shi_statement',
        question: `Điền từ đúng: ${s}___${n}。`,
        options: ['是', '在', '有', '会'],
        correctIndex: 0,
        hskLevel: 1,
        explanation: 'Câu định nghĩa dùng 是.',
      });
      qs.push({
        type: 'grammar',
        grammarKey: 'shi_negative',
        question: `Điền từ đúng: ${s}___是${n}。`,
        options: ['不', '没', '很', '都'],
        correctIndex: 0,
        hskLevel: 1,
        explanation: 'Phủ định 是 bằng 不 -> 不是.',
      });
      qs.push({
        type: 'grammar',
        grammarKey: 'ma_question',
        question: `Điền từ đúng: ${s}是${n}___？`,
        options: ['吗', '呢', '吧', '的'],
        correctIndex: 0,
        hskLevel: 1,
        explanation: 'Câu hỏi Yes/No thêm 吗 cuối câu.',
      });
    });
    VERBS.forEach((v) => {
      qs.push({
        type: 'grammar',
        grammarKey: 'zai_progressive',
        question: `Điền từ đúng: ${s}___${v}。`,
        options: ['在', '是', '有', '了'],
        correctIndex: 0,
        hskLevel: 3,
        explanation: '在 + động từ: đang làm gì.',
      });
      qs.push({
        type: 'grammar',
        grammarKey: 'hui_ability',
        question: `Điền từ đúng: ${s}___${v}。`,
        options: ['会', '是', '在', '有'],
        correctIndex: 0,
        hskLevel: 3,
        explanation: '会: biết, có kỹ năng.',
      });
    });
  });

  SUBJECTS.forEach((s) => {
    SUBJECTS.forEach((s2) => {
      ADJECTIVES.forEach((adj) => {
        if (s !== s2) {
          qs.push({
            type: 'grammar',
            grammarKey: 'bi_comparison',
            question: `Điền từ đúng: ${s}___${s2}${adj}。`,
            options: ['比', '最', '很', '更'],
            correctIndex: 0,
            hskLevel: 3,
            explanation: 'So sánh hơn: A 比 B + tính từ.',
          });
        }
      });
    });
  });

  PLACES.forEach((p) => {
    qs.push({
      type: 'grammar',
      grammarKey: 'keyi_permission',
      question: `Điền từ đúng: 我___进${p}吗？`,
      options: ['可以', '会', '在', '是'],
      correctIndex: 0,
      hskLevel: 3,
      explanation: '可以 dùng để xin phép.',
    });
  });

  // HSK2: 的, 呢, lượng từ, cấu trúc địa điểm
  SUBJECTS.forEach((s) => {
    OBJECTS.forEach((o) => {
      qs.push({
        type: 'grammar',
        grammarKey: 'de_possession',
        question: `Điền từ đúng: ${s}___${o}。`,
        options: ['的', '了', '吗', '在'],
        correctIndex: 0,
        hskLevel: 2,
        explanation: '的 nối sở hữu: 我的书, 你的咖啡...',
      });
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'ne_followup',
      question: `Điền từ đúng: 我很好，你___？`,
      options: ['呢', '吗', '吧', '的'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '呢 dùng để hỏi tiếp: còn bạn thì sao?',
    });
  });

  MEASURE_WORDS.forEach(([obj, mw]) => {
    qs.push({
      type: 'grammar',
      grammarKey: 'measure_word',
      question: `Điền lượng từ đúng: 一___${obj}`,
      options: [mw, '个', '条', '把'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: `Lượng từ đúng: ${mw}${obj}.`,
    });
  });

  SUBJECTS.forEach((s) => {
    PLACES.forEach((p) => {
      qs.push({
        type: 'grammar',
        grammarKey: 'zai_location',
        question: `Điền từ đúng: ${s}___${p}。`,
        options: ['在', '是', '有', '会'],
        correctIndex: 0,
        hskLevel: 2,
        explanation: '在 + địa điểm = ở tại.',
      });
    });
  });

  // HSK2-HSK3: trợ từ + phó từ
  SUBJECTS.forEach((s) => {
    qs.push({
      type: 'grammar',
      grammarKey: 'particle_ma_question',
      question: `Điền trợ từ đúng: ${s}是老师___？`,
      options: ['吗', '呢', '吧', '了'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '吗 dùng cho câu hỏi Yes/No và đứng cuối câu.',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'particle_ba_suggestion',
      question: `Điền trợ từ phù hợp: 我们一起去___`,
      options: ['吧', '吗', '呢', '的'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '吧 biểu thị đề nghị/rủ rê nhẹ.',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'particle_le_completed',
      question: `Điền trợ từ đúng: ${s}下班___。`,
      options: ['了', '吗', '吧', '的'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '了 biểu thị hoàn thành/thay đổi trạng thái.',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'adverb_hen_adj',
      question: `Điền phó từ phù hợp: ${s}___忙。`,
      options: ['很', '都', '也', '在'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: 'Phó từ 很 đứng trước tính từ.',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'adverb_ye_parallel',
      question: `Điền phó từ phù hợp: 我是学生，你___是学生。`,
      options: ['也', '都', '很', '再'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '也 = cũng (đồng tình huống giữa 2 chủ thể).',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'adverb_dou_plural',
      question: `Điền phó từ phù hợp: 我们___在公司。`,
      options: ['都', '也', '很', '正在'],
      correctIndex: 0,
      hskLevel: 2,
      explanation: '都 dùng cho nhiều chủ thể: chúng tôi đều...',
    });
    qs.push({
      type: 'grammar',
      grammarKey: 'adverb_zhengzai',
      question: `Điền phó từ phù hợp: ${s}___开会。`,
      options: ['正在', '都', '也', '很'],
      correctIndex: 0,
      hskLevel: 3,
      explanation: '正在 nhấn mạnh hành động đang diễn ra.',
    });
  });
  return qs;
}

function buildSentenceOrder() {
  const qs = [];
  SUBJECTS.forEach((s) => {
    NOUNS.forEach((n) => {
      const sentence = `${s}是${n}`;
      qs.push({
        type: 'sentence_order',
        grammarKey: 'order_shi_statement',
        question: `Sắp xếp câu đúng (${sentence})`,
        hint: `${s} là ${n}`,
        segments: [s, '是', n],
        correctSentence: sentence,
        hskLevel: 1,
        explanation: 'Thứ tự cơ bản: Chủ ngữ + 是 + Danh từ.',
      });
      qs.push({
        type: 'sentence_order',
        grammarKey: 'order_shi_negative',
        question: `Sắp xếp câu phủ định (${s} không phải ${n})`,
        hint: `${s} không phải ${n}`,
        segments: [s, '不是', n],
        correctSentence: `${s}不是${n}`,
        hskLevel: 1,
        explanation: 'Phủ định với 不是 đặt trước danh từ.',
      });
    });
    VERBS.forEach((v) => {
      qs.push({
        type: 'sentence_order',
        grammarKey: 'order_zai_progressive',
        question: `Sắp xếp câu đang diễn ra (${s} đang ${v})`,
        hint: `${s} đang ${v}`,
        segments: [s, '在', ...v.split('')],
        correctSentence: `${s}在${v}`,
        hskLevel: 3,
        explanation: 'Cấu trúc 在 + V.',
      });
    });
  });

  SUBJECTS.forEach((a) => {
    SUBJECTS.forEach((b) => {
      if (a !== b) {
        ADJECTIVES.forEach((adj) => {
          qs.push({
            type: 'sentence_order',
            grammarKey: 'order_bi_comparison',
            question: `Sắp xếp câu so sánh (${a} hơn ${b})`,
            hint: `${a} hơn ${b} (${adj})`,
            segments: [a, '比', b, adj],
            correctSentence: `${a}比${b}${adj}`,
            hskLevel: 3,
            explanation: 'So sánh hơn: A 比 B + tính từ.',
          });
        });
      }
    });
  });

  // HSK2 sentence ordering
  SUBJECTS.forEach((s) => {
    OBJECTS.forEach((o) => {
      qs.push({
        type: 'sentence_order',
        grammarKey: 'order_de_possession',
        question: `Sắp xếp câu sở hữu (${s} + 的 + ${o})`,
        hint: `${o} của ${s}`,
        segments: [s, '的', o],
        correctSentence: `${s}的${o}`,
        hskLevel: 2,
        explanation: 'Sở hữu: Chủ ngữ + 的 + danh từ.',
      });
    });
  });

  MEASURE_WORDS.forEach(([obj, mw]) => {
    qs.push({
      type: 'sentence_order',
      grammarKey: 'order_measure_word',
      question: `Sắp xếp câu lượng từ (một ${obj})`,
      hint: `một ${obj}`,
      segments: ['一', mw, obj],
      correctSentence: `一${mw}${obj}`,
      hskLevel: 2,
      explanation: 'Số + lượng từ + danh từ.',
    });
  });

  SUBJECTS.forEach((s) => {
    qs.push({
      type: 'sentence_order',
      grammarKey: 'order_ne_followup',
      question: 'Sắp xếp câu hỏi tiếp (còn bạn thì sao?)',
      hint: 'Tôi rất khỏe, còn bạn?',
      segments: ['我', '很', '好', '你', '呢'],
      correctSentence: '我很好你呢',
      hskLevel: 2,
      explanation: 'Mẫu câu: 我很好，你呢？',
    });
    PLACES.forEach((p) => {
      qs.push({
        type: 'sentence_order',
        grammarKey: 'order_zai_location',
        question: `Sắp xếp câu vị trí (${s} ở ${p})`,
        hint: `${s} ở ${p}`,
        segments: [s, '在', p],
        correctSentence: `${s}在${p}`,
        hskLevel: 2,
        explanation: '在 đặt trước địa điểm.',
      });
    });
  });

  qs.push({
    type: 'sentence_order',
    grammarKey: 'order_particle_ma',
    question: 'Sắp xếp câu hỏi với trợ từ 吗',
    hint: 'Bạn có ở công ty không?',
    segments: ['你', '在', '公司', '吗'],
    correctSentence: '你在公司吗',
    hskLevel: 2,
    explanation: '吗 đứng cuối câu hỏi.',
  });
  qs.push({
    type: 'sentence_order',
    grammarKey: 'order_particle_ba',
    question: 'Sắp xếp câu đề nghị với trợ từ 吧',
    hint: 'Chúng ta đi ăn nhé',
    segments: ['我们', '去', '吃饭', '吧'],
    correctSentence: '我们去吃饭吧',
    hskLevel: 2,
    explanation: '吧 ở cuối câu đề nghị.',
  });
  qs.push({
    type: 'sentence_order',
    grammarKey: 'order_adverb_dou',
    question: 'Sắp xếp câu với phó từ 都',
    hint: 'Chúng tôi đều là đồng nghiệp',
    segments: ['我们', '都', '是', '同事'],
    correctSentence: '我们都是同事',
    hskLevel: 2,
    explanation: '都 đứng trước vị ngữ.',
  });
  qs.push({
    type: 'sentence_order',
    grammarKey: 'order_adverb_zhengzai',
    question: 'Sắp xếp câu với phó từ 正在',
    hint: 'Anh ấy đang gọi điện',
    segments: ['他', '正在', '打电话'],
    correctSentence: '他正在打电话',
    hskLevel: 3,
    explanation: '正在 + động từ.',
  });

  return qs;
}

function buildPickWrong() {
  const qs = [];
  SUBJECTS.forEach((s) => {
    NOUNS.forEach((n) => {
      qs.push({
        type: 'pick_wrong',
        grammarKey: 'wrong_shi_de',
        question: `Chọn câu SAI (chủ điểm 是) — ${s}/${n}`,
        options: [`${s}是${n}。`, `${s}是的${n}。`, `${s}不是${n}。`, `${s}是${n}吗？`],
        correctIndex: 1,
        hskLevel: 1,
        explanation: 'Sau 是 không thêm 的.',
      });
      qs.push({
        type: 'pick_wrong',
        grammarKey: 'wrong_double_ma',
        question: `Chọn câu SAI (chủ điểm 吗) — ${s}/${n}`,
        options: [`${s}是${n}吗？`, `${s}不是${n}。`, `${s}是${n}。`, `${s}是${n}吗吗？`],
        correctIndex: 3,
        hskLevel: 1,
        explanation: 'Câu hỏi chỉ dùng 1 吗.',
      });
    });
    VERBS.forEach((v) => {
      qs.push({
        type: 'pick_wrong',
        grammarKey: 'wrong_shi_before_verb',
        question: `Chọn câu SAI (chủ điểm động từ) — ${s}/${v}`,
        options: [`${s}会${v}。`, `${s}在${v}。`, `${s}是${v}。`, `${s}可以${v}。`],
        correctIndex: 2,
        hskLevel: 3,
        explanation: 'Không dùng 是 trước động từ hành động.',
      });
    });
  });

  SUBJECTS.forEach((a) => {
    SUBJECTS.forEach((b) => {
      if (a !== b) {
        ADJECTIVES.forEach((adj) => {
          qs.push({
            type: 'pick_wrong',
            grammarKey: 'wrong_bi_order',
            question: `Chọn câu SAI (chủ điểm 比) — ${a}/${b}/${adj}`,
            options: [`${a}比${b}${adj}。`, `${b}比${a}${adj}。`, `${a}${adj}比${b}。`, `今天比昨天${adj}。`],
            correctIndex: 2,
            hskLevel: 3,
            explanation: 'Không đảo vị trí 比 trong câu so sánh.',
          });
        });
      }
    });
  });

  // HSK2 pick-wrong
  SUBJECTS.forEach((s) => {
    OBJECTS.forEach((o) => {
      qs.push({
        type: 'pick_wrong',
        grammarKey: 'wrong_de_missing',
        question: `Chọn câu SAI (chủ điểm 的) — ${s}/${o}`,
        options: [`${s}的${o}`, `${s}${o}`, `这是${s}的${o}。`, `${s}有${o}。`],
        correctIndex: 1,
        hskLevel: 2,
        explanation: 'Thiếu 的 trong cấu trúc sở hữu.',
      });
    });
  });

  MEASURE_WORDS.forEach(([obj, mw]) => {
    qs.push({
      type: 'pick_wrong',
      grammarKey: 'wrong_measure_word',
      question: `Chọn câu SAI (chủ điểm lượng từ) — ${obj}`,
      options: [`一${mw}${obj}`, `两个${obj}`, `一的${obj}`, `这个${obj}`],
      correctIndex: 2,
      hskLevel: 2,
      explanation: 'Không dùng 的 giữa số/lượng từ và danh từ.',
    });
  });

  PLACES.forEach((p) => {
    qs.push({
      type: 'pick_wrong',
      grammarKey: 'wrong_zai_order',
      question: `Chọn câu SAI (chủ điểm 在) — ${p}`,
      options: [`我在${p}。`, `你在${p}吗？`, `我${p}在。`, `${p}很大。`],
      correctIndex: 2,
      hskLevel: 2,
      explanation: '在 phải đứng trước địa điểm trong mẫu này.',
    });
  });

  qs.push({
    type: 'pick_wrong',
    grammarKey: 'wrong_particle_ma_position',
    question: 'Chọn câu SAI về trợ từ 吗',
    options: ['你在公司吗？', '你吗在公司？', '他是老师吗？', '我们是同学吗？'],
    correctIndex: 1,
    hskLevel: 2,
    explanation: '吗 phải đứng cuối câu.',
  });
  qs.push({
    type: 'pick_wrong',
    grammarKey: 'wrong_adverb_order',
    question: 'Chọn câu SAI về phó từ',
    options: ['我很忙。', '我们都到了。', '他也来了。', '我忙很。'],
    correctIndex: 3,
    hskLevel: 2,
    explanation: 'Phó từ đặt trước tính từ/động từ, không đặt sau.',
  });
  qs.push({
    type: 'pick_wrong',
    grammarKey: 'wrong_classifier_context',
    question: 'Chọn câu SAI về lượng từ theo ngữ cảnh',
    options: ['一杯咖啡', '一张电影票', '一本书', '一个咖啡'],
    correctIndex: 3,
    hskLevel: 2,
    explanation: 'Ngữ cảnh đồ uống dùng 杯: 一杯咖啡.',
  });
  qs.push({
    type: 'pick_wrong',
    grammarKey: 'wrong_particle_le_usage',
    question: 'Chọn câu SAI về trợ từ 了',
    options: ['我下班了。', '他到家了。', '我们了去公司。', '今天下雨了。'],
    correctIndex: 2,
    hskLevel: 2,
    explanation: '了 không đứng trước động từ chính như "我们了去".',
  });

  return qs;
}

function pickByType(pool, type, count) {
  return shuffle(pool.filter((q) => q.type === type)).slice(0, count);
}

function buildPracticalQuestions(perTypeTarget = 400) {
  const grammar = [];
  const sentenceOrder = [];
  const pickWrong = [];

  let idx = 0;
  while (grammar.length < perTypeTarget || sentenceOrder.length < perTypeTarget || pickWrong.length < perTypeTarget) {
    const sc = PRACTICAL_SCENARIOS[idx % PRACTICAL_SCENARIOS.length];
    const subject = SUBJECTS[idx % SUBJECTS.length];
    const noun = NOUNS[idx % NOUNS.length];
    const mw = MEASURE_WORDS[idx % MEASURE_WORDS.length];
    const adj = ADJECTIVES[idx % ADJECTIVES.length];

    if (grammar.length < perTypeTarget) {
      grammar.push({
        type: 'grammar',
        grammarKey: `practical_grammar_${idx}`,
        question: `[Thực tế: ${sc.place}] Điền từ đúng: ${subject}___${sc.place}。`,
        options: ['在', '是', '有', '会'],
        correctIndex: 0,
        hskLevel: 2,
        explanation: `Trong tình huống ở ${sc.place}, dùng 在 để diễn tả vị trí.`,
      });
      grammar.push({
        type: 'grammar',
        grammarKey: `practical_measure_${idx}`,
        question: `[Thực tế: ${sc.place}] Điền lượng từ đúng: 一___${mw[0]}`,
        options: [mw[1], '个', '条', '把'],
        correctIndex: 0,
        hskLevel: 2,
        explanation: `Lượng từ đúng cho ${mw[0]} là ${mw[1]}.`,
      });
    }

    if (sentenceOrder.length < perTypeTarget) {
      sentenceOrder.push({
        type: 'sentence_order',
        grammarKey: `practical_order_${idx}`,
        question: `[Thực tế: ${sc.person}/${sc.place}] Sắp xếp câu đúng`,
        hint: `${sc.time} ${subject} ở ${sc.place}`,
        segments: [sc.time, subject, '在', sc.place],
        correctSentence: `${sc.time}${subject}在${sc.place}`,
        hskLevel: 2,
        explanation: 'Thời gian thường đứng đầu câu, sau đó là chủ ngữ + 在 + địa điểm.',
      });
      sentenceOrder.push({
        type: 'sentence_order',
        grammarKey: `practical_order_bi_${idx}`,
        question: `[Thực tế: ${sc.place}] Sắp xếp câu so sánh`,
        hint: `${subject} hơn ${sc.person} (${adj})`,
        segments: [subject, '比', sc.person, adj],
        correctSentence: `${subject}比${sc.person}${adj}`,
        hskLevel: 3,
        explanation: 'So sánh trong giao tiếp: A 比 B + tính từ.',
      });
    }

    if (pickWrong.length < perTypeTarget) {
      pickWrong.push({
        type: 'pick_wrong',
        grammarKey: `practical_wrong_zai_${idx}`,
        question: `[Thực tế: ${sc.place}] Chọn câu SAI`,
        options: [
          `${subject}在${sc.place}。`,
          `${subject}${sc.place}在。`,
          `${subject}在${sc.place}${sc.action}。`,
          `${sc.person}在${sc.place}。`,
        ],
        correctIndex: 1,
        hskLevel: 2,
        explanation: 'Sai trật tự: 在 phải đứng trước địa điểm.',
      });
      pickWrong.push({
        type: 'pick_wrong',
        grammarKey: `practical_wrong_de_${idx}`,
        question: `[Thực tế: ${sc.place}] Chọn câu SAI về sở hữu`,
        options: [
          `${subject}的${noun}`,
          `${subject}${noun}`,
          `这是${subject}的${noun}。`,
          `${sc.person}有${noun}。`,
        ],
        correctIndex: 1,
        hskLevel: 2,
        explanation: 'Thiếu 的 trong cấu trúc sở hữu.',
      });
    }

    idx += 1;
  }

  return [...grammar.slice(0, perTypeTarget), ...sentenceOrder.slice(0, perTypeTarget), ...pickWrong.slice(0, perTypeTarget)];
}

function expandByContext(pool, type, targetPerType) {
  const base = shuffle(pool.filter((q) => q.type === type));
  if (base.length >= targetPerType) return base.slice(0, targetPerType);

  const contexts = [
    'ở công ty', 'ở trường', 'ở quán ăn', 'khi đi tàu điện', 'khi gọi điện',
    'khi đặt lịch hẹn', 'trong buổi họp', 'lúc đi mua sắm', 'khi du lịch',
    'trước giờ làm', 'sau giờ làm', 'khi gặp khách hàng', 'ở sân bay',
    'ở khách sạn', 'khi check-in', 'khi gọi món', 'khi thanh toán',
    'khi đi khám', 'khi nhận hàng', 'khi làm việc nhóm', 'khi xử lý khiếu nại',
    'khi xin nghỉ', 'khi đổi lịch', 'khi xác nhận thông tin', 'khi phỏng vấn',
    'khi họp online', 'khi trò chuyện với hàng xóm', 'khi hỏi lễ tân',
    'khi tìm đồ thất lạc', 'khi hỏi giá', 'khi thương lượng',
  ];

  const out = [...base];
  let i = 0;
  while (out.length < targetPerType) {
    const src = base[i % base.length];
    const ctx = contexts[i % contexts.length];
    out.push({
      ...src,
      grammarKey: `${src.grammarKey}_${i}`,
      question: `[${ctx}] ${src.question}`,
      explanation: `${src.explanation} (Bối cảnh: ${ctx})`,
    });
    i += 1;
  }
  return out.slice(0, targetPerType);
}

export function generateGrammarQuizQuestions(targetPerType = 1000) {
  const source = dedupeByKey(
    [...buildGrammarMcq(), ...buildSentenceOrder(), ...buildPickWrong(), ...buildPracticalQuestions(400)],
    (q) => `${q.type}|${q.grammarKey}|${q.question}`,
  );

  const grammar = expandByContext(source, 'grammar', targetPerType);
  const sentenceOrder = expandByContext(source, 'sentence_order', targetPerType);
  const pickWrong = expandByContext(source, 'pick_wrong', targetPerType);

  return [...grammar, ...sentenceOrder, ...pickWrong];
}

export const GRAMMAR_QUIZ_QUESTIONS = generateGrammarQuizQuestions(1000);

export function isGrammarQuizType(type) {
  return GRAMMAR_QUIZ_TYPES.includes(type);
}
