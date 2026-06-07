/* ═══════════════════════════════════════════════════════════════
   AI CHAT ENGINE — Xử lý hội thoại tiếng Trung
   55+ chủ đề | 3000+ mẫu câu trả lời | Context tracking | Emotion
   ═══════════════════════════════════════════════════════════════ */

import { mergeExtraTopics } from './ai-chat-data.js';

// ─── Utility ───
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasAny = (txt, words) => words.some(w => txt.includes(w));

// ─── Từ điển cảm xúc & thì ───
const TENSE = {
  past: ['了', '过', '以前', '昨天', '上周', '去年', '已经', '曾经'],
  future: ['会', '要', '打算', '准备', '将', '明天', '下周', '明年', '以后', '下次'],
  ongoing: ['在', '正在', '着', '现在', '目前']
};

// ─── Context Profile (mở rộng) ───
function createProfile() {
  return {
    name: null, country: null, studyYears: null, likes: [],
    lastTopic: null, lastTopicKey: null,
    topics: [],          // tất cả chủ đề đã nói
    lastTopics: [],      // chủ đề 5 lượt gần nhất
    lastResponses: [],   // 10 câu trả lời gần nhất (chống lặp)
    turnCount: 0,
    mood: 'neutral',
    userName: null,
    lastRaw: '',
    lang: 'mixed',
    score: 0
  };
}

// ─── Knowledge Base: 30+ chủ đề ───
const KB = {
  // ═══ CHÀO HỎI ═══
  greeting: {
    patterns: ['你好', '您好', '嗨', 'hi', 'hello', 'chào', '早', '晚上好', '下午好', '嘿', 'hey'],
    weight: 95,
    handle: (input, ctx) => {
      if (ctx.turnCount === 0) {
        ctx.mood = 'happy';
        return pick([
          '你好！我是小AI，你的中文学习伙伴！你叫什么名字？😊',
          '你好你好！终于有人来找我聊天了！你叫什么？',
          '你好！很高兴见到你！我们可以用中文聊天，一起练习！'
        ]);
      }
      return pick([
        '你好！今天怎么样？想聊点什么呢？',
        '又见面了！今天心情好吗？',
      ]);
    }
  },

  // ═══ GIỚI THIỆU BẢN THÂN ═══
  self_intro: {
    patterns: ['我叫', '我是', '名字', '我的名字', '姓'],
    weight: 90,
    handle: (input, ctx) => {
      const extracted = extractName(input) || ctx.userName;
      if (extracted) ctx.userName = extracted;
      const n = ctx.userName || 'bạn';
      return pick([
        `${n}你好！这个名字真好听！你是哪国人？`,
        `${n}！很高兴认识你！你学习中文多久了？`,
        `${n}，很高兴认识你！你喜欢做什么？`
      ]);
    }
  },

  // ═══ QUỐC TỊCH ═══
  nationality: {
    patterns: ['越南', 'Việt Nam', '中国', '越南人', '中国人', '韩国', '日本', '美国', '英国', 'Pháp', 'Đức', '哪儿', '哪国人', '国家', '国'],
    weight: 85,
    handle: (input, ctx) => {
      if (input.includes('越南')) ctx.country = '越南';
      else if (input.includes('中国')) ctx.country = '中国';
      if (ctx.country === '越南') {
        return pick([
          '越南是个美丽的国家！河粉和春卷特别好吃！你去过中国吗？',
          '哇越南！我喜欢越南的咖啡和美食！你住在胡志明还是河内？',
          '越南离中国很近！你学中文一定很方便吧？'
        ]);
      }
      return pick([
        '哇！你从那么远的地方来学中文，太厉害了！',
        '你去过中国吗？中国有很多好玩的地方！'
      ]);
    }
  },

  // ═══ HỌC TẬP ═══
  study: {
    patterns: ['学', '学习', '中文', '汉语', '读书', '学生', '上课', '老师', '学校', '大学', '班', '课', '作业', '考试', 'học', 'trường', 'lớp'],
    weight: 90,
    handle: (input, ctx) => {
      ctx.topics.push('study');
      if (hasAny(input, ['难', '困难', '不容易', 'khó'])) {
        return pick([
          '中文确实有挑战性，特别是声调！但是你每天都练一点，一定能进步！加油！💪',
          '慢慢来，不着急。学习语言就像跑步，每天跑一点就到终点了！',
          '你觉得难的部分是什么？是发音、汉字还是语法？我可以帮你！'
        ]);
      }
      if (hasAny(input, ['喜欢', 'thích', 'hay', 'vui'])) {
        return pick([
          '太好了！兴趣是最好的老师！你喜欢中文的哪部分？',
          '喜欢就学得快！你平时怎么学中文的？'
        ]);
      }
      return pick([
        '学习中文是一段有趣的旅程！你每天学习多长时间？',
        '太棒了！你学多久了？觉得最难的是什么？',
        '你在哪里学中文？学校还是自学？'
      ]);
    }
  },

  // ═══ ẨM THỰC ═══
  food: {
    patterns: ['吃', '饭', '菜', '美食', '好吃', '餐厅', '做饭', '饿', '味道', '辣', '甜', '酸', '咸', '苦', '鲜', 'ăn', 'uống', 'món', 'ngon'],
    weight: 88,
    handle: (input, ctx) => {
      ctx.topics.push('food');
      if (hasAny(input, ['辣', 'chua', 'cay'])) {
        return pick([
          '你喜欢吃辣的？四川菜和湖南菜都很辣！你吃过火锅吗？🍲',
          '辣的最过瘾了！我推荐麻婆豆腐和水煮鱼！你吃过吗？',
          '四川的麻辣火锅世界闻名！还有夫妻肺片、宫保鸡丁！'
        ]);
      }
      if (hasAny(input, ['甜', 'ngọt'])) {
        return pick([
          '甜的！广式甜点和北京的糖葫芦都不错！你喜欢什么甜品？',
          '中国的甜品有很多种：月饼、汤圆、年糕、驴打滚…'
        ]);
      }
      if (hasAny(input, ['饺子', 'sủi cảo'])) {
        return '饺子是中国传统美食！过年的时候一家人一起包饺子，特别温馨！你喜欢什么馅的？';
      }
      if (hasAny(input, ['火锅', 'lẩu'])) {
        return '火锅是我的最爱！麻辣火锅、番茄火锅、菌菇火锅…你喜欢哪种锅底？';
      }
      return pick([
        '你最喜欢什么中国菜？我最喜欢饺子和烤鸭！🦆',
        '中国有八大菜系！川菜麻辣、粤菜清淡、鲁菜咸鲜…你喜欢哪种？',
        '你会做中国菜吗？宫保鸡丁其实不难做哦！'
      ]);
    }
  },

  // ═══ DU LỊCH ═══
  travel: {
    patterns: ['旅游', '旅行', '去', '玩', '地方', '风景', '酒店', '北京', '上海', '广州', '成都', '西安', '深圳', '杭州', '昆明', '张家界', '长城', '故宫', '黄河', '长江', 'du lịch', 'đi', 'thăm'],
    weight: 85,
    handle: (input, ctx) => {
      ctx.topics.push('travel');
      if (hasAny(input, ['北京', 'Bắc Kinh'])) {
        return '北京是中国的首都！故宫、长城、天坛都是必去的！你计划去北京玩吗？';
      }
      if (hasAny(input, ['上海', 'Thượng Hải'])) {
        return '上海是中国的经济中心！外滩的夜景特别美，南京路很热闹！你想去上海吗？';
      }
      if (hasAny(input, ['成都', 'Thành Đô'])) {
        return '成都的美食太多了！火锅、串串、兔头…还有可爱的大熊猫！你是去看熊猫的吗？🐼';
      }
      if (hasAny(input, ['西安', 'Tây An'])) {
        return '西安有兵马俑！世界第八大奇迹！还有回民街的小吃特别多！';
      }
      if (hasAny(input, ['长城', 'Vạn Lý Trường Thành'])) {
        return '不到长城非好汉！长城非常壮观，但是台阶很陡，穿舒服的鞋去哦！';
      }
      if (hasAny(input, ['熊猫', 'gấu trúc'])) {
        return '熊猫太可爱了！成都大熊猫基地是看熊猫最好的地方！你有去看过吗？';
      }
      return pick([
        '你想去中国的哪个城市？中国的每个城市都有自己的特色！',
        '中国很大，北方和南方的风景完全不一样！你喜欢看自然风景还是城市？',
        '旅游是很好的学习方式！边玩边学中文，效率特别高！'
      ]);
    }
  },

  // ═══ THỜI TIẾT ═══
  weather: {
    patterns: ['天气', '热', '冷', '下雨', '下雪', '太阳', '温度', '气候', '春天', '夏天', '秋天', '冬天', 'mưa', 'nắng', 'lạnh', 'nóng', 'thời tiết'],
    weight: 75,
    handle: (input, ctx) => {
      if (hasAny(input, ['热', 'nóng'])) {
        return pick([
          '今天很热吧？多喝水，小心中暑！你那里多少度？',
          '热天最适合吃西瓜和游泳了！你喜欢哪个消暑方式？',
          '夏天虽然热，但是可以吃冰淇淋和水果！'
        ]);
      }
      if (hasAny(input, ['冷', 'lạnh'])) {
        return pick([
          '天气冷了，多穿衣服！你那里有暖气吗？',
          '冷的时候最适合吃火锅了！热乎乎的，吃完就不冷了！'
        ]);
      }
      return pick([
        '你最喜欢哪个季节？我喜欢秋天，不冷不热，很舒服。',
        '天气好的时候出去走走心情也会变好！'
      ]);
    }
  },

  // ═══ SỞ THÍCH ═══
  hobby: {
    patterns: ['喜欢', '爱好', '兴趣', 'hobby', 'sở thích', '平时', '周末', '唱歌', '运动', '电影', '音乐', '看书', '玩游戏', '画画', '摄影', '健身', '跑步', '瑜伽', '跳舞'],
    weight: 85,
    handle: (input, ctx) => {
      if (hasAny(input, ['电影', 'phim'])) {
        return pick([
          '你喜欢看电影？我也喜欢！你看过中国电影吗？推荐《流浪地球》和《你好，李焕英》！',
          '中国的古装电影特别美！《卧虎藏龙》你看过吗？'
        ]);
      }
      if (hasAny(input, ['音乐', 'nhạc'])) {
        return pick([
          '音乐无国界！你喜欢中国歌手吗？周杰伦、邓紫棋、林俊杰都很棒！',
          '周杰伦的《青花瓷》特别有中国风！你听过吗？'
        ]);
      }
      if (hasAny(input, ['运动', 'thể thao'])) {
        return '运动好！你喜欢什么运动？中国人很喜欢打乒乓球和羽毛球！🏓';
      }
      if (hasAny(input, ['看书', 'sách', 'đọc'])) {
        return '看书是好习惯！你看过中国小说吗？推荐《活着》和《三体》！📚';
      }
      return pick([
        '你的爱好很有意思！我平时喜欢聊天和学新东西。',
        '周末你一般做什么？我喜欢跟朋友一起出去玩。'
      ]);
    }
  },

  // ═══ TUỔI TÁC ═══
  age: {
    patterns: ['岁', 'tuổi', '年龄', '多大', '几岁', '年轻', 'già', 'trẻ'],
    weight: 70,
    handle: (input, ctx) => {
      if (hasAny(input, ['年轻', 'trẻ'])) {
        return '年轻就是好啊！有无限的可能！你做什么工作？';
      }
      return pick([
        '年龄只是一个数字！重要的是心态年轻！😊',
        '不管几岁，学习新东西都是好事！你要活到老学到老哦！'
      ]);
    }
  },

  // ═══ CÔNG VIỆC ═══
  work: {
    patterns: ['工作', 'việc', 'làm', '职业', '公司', '上班', '同事', '老板', '工资', '辞职', '退休', 'nghề', 'nghiệp'],
    weight: 80,
    handle: (input, ctx) => {
      ctx.topics.push('work');
      return pick([
        '你做什么工作的？听起来很有意思！',
        '工作顺利吗？记住工作再忙也要注意休息哦！',
        '你喜欢你的工作吗？做自己喜欢的事情很重要！'
      ]);
    }
  },

  // ═══ CẢM XÚC ═══
  feeling: {
    patterns: ['心情', '感觉', '开心', '难过', '伤心', 'hạnh phúc', 'buồn', 'vui', '焦虑', '压力', '压', '累', 'mệt', '烦', 'chán', '无聊', '幸福', 'tự hào'],
    weight: 90,
    handle: (input, ctx) => {
      const positive = ['开心', '高兴', '快乐', '幸福', '棒', 'vui', 'hạnh phúc', 'tốt'];
      const negative = ['难过', '伤心', '累', '烦', '压力', '焦虑', 'buồn', 'mệt', 'chán'];
      if (hasAny(input, positive)) {
        ctx.mood = 'happy';
        return pick([
          '你开心我也开心！有什么好事发生了？跟我分享分享！🎉',
          '太棒了！开心的时候时间过得特别快！'
        ]);
      }
      if (hasAny(input, negative)) {
        ctx.mood = 'sad';
        return pick([
          '不要难过，一切都会好起来的！要不要听听音乐放松一下？🎵',
          '辛苦了！休息一下，喝杯茶，放松放松。',
          '每个人都会有压力，重要的是找到释放的方式。你平时怎么减压？'
        ]);
      }
      return pick([
        '今天怎么样？希望你过得开心！',
        '每一天都是新的开始！有什么计划吗？'
      ]);
    }
  },

  // ═══ KHEN NGỢI ═══
  compliment: {
    patterns: ['好', '厉害', '棒', '优秀', '聪明', '漂亮', '帅', '可爱', '了不起', 'giỏi', 'đẹp', 'tuyệt', 'xinh'],
    weight: 80,
    handle: (input, ctx) => {
      return pick([
        '你过奖了！其实是你很厉害，会说中文！',
        '谢谢你！你也很棒！我们一起努力吧！',
        '嘿嘿，被你夸得不好意思了。你中文也说得很好！',
        '谢谢你的鼓励！我会继续努力的！'
      ]);
    }
  },

  // ═══ CẢM ƠN ═══
  thanks: {
    patterns: ['谢谢', '感谢', '多谢', 'cảm ơn', 'thanks'],
    weight: 90,
    handle: () => pick([
      '不客气！很高兴能帮到你！还有什么想聊的吗？',
      '不用谢！跟你聊天我也很开心！',
      '别客气！有什么问题随时问我！'
    ])
  },

  // ═══ TẠM BIỆT ═══
  goodbye: {
    patterns: ['再见', '拜拜', 'bye', '晚安', '明天见', '回头见', '下次', 'tạm biệt', 'bye bye'],
    weight: 95,
    handle: (input, ctx) => {
      ctx.mood = 'neutral';
      if (hasAny(input, ['晚安', 'chúc ngủ ngon'])) {
        return pick([
          '晚安！做个好梦！明天继续聊！🌙',
          '早点休息吧！明天精神好！晚安！'
        ]);
      }
      return pick([
        '再见！今天跟你聊天很开心！下次再来找我玩！👋',
        '拜拜！祝你一切顺利！学习加油！',
        '好的，下次再聊！记得多练习中文哦！'
      ]);
    }
  },

  // ═══ ĐẶT CÂU HỎI VỀ AI ═══
  about_ai: {
    patterns: ['你叫什么', '你是谁', '你是什么', '你几岁', '你多大', '你是哪', '你会', '你做什么', '你住', '你的', 'bạn là', 'bạn tên'],
    weight: 90,
    handle: (input, ctx) => {
      if (hasAny(input, ['叫', 'tên', 'ai'])) {
        return '我叫小AI，是你的中文学习助手！你可以叫我小AI或者AI！很高兴认识你！';
      }
      if (hasAny(input, ['岁', 'tuổi', '多大'])) {
        return '我是AI，永远18岁！每天都在学新东西，永远不会老！😄';
      }
      if (hasAny(input, ['住', 'ở đâu'])) {
        return '我住在云端！哪儿都能去，哪儿都能聊天！';
      }
      if (hasAny(input, ['会', 'biết', 'làm'])) {
        return '我会说中文、越南语和英语！我可以陪你聊天、帮你练中文、回答你的问题！';
      }
      if (hasAny(input, ['男', 'nam', 'nữ', 'giới'])) {
        return '我是AI，没有性别！你可以把我想象成任何你喜欢的形象！';
      }
      return pick([
        '我是一个AI聊天机器人！专门帮你练中文的！',
        '我是小AI，你的中文朋友！有什么想聊的吗？'
      ]);
    }
  },

  // ═══ SỨC KHỎE ═══
  health: {
    patterns: ['病', 'ốm', 'bệnh', 'sức khỏe', 'khỏe', 'đau', 'thuốc', 'bác sĩ', 'bệnh viện', '医院', '药', '医生', '身体', '健康', '不舒服', '感冒', '发烧', '头疼'],
    weight: 75,
    handle: (input, ctx) => {
      if (hasAny(input, ['感冒', '发烧', 'ốm', 'bệnh'])) {
        return pick([
          '哎呀，生病了要好好休息！多喝水，按时吃药！早日康复！🙏',
          '身体是革命的本钱！多休息，别太累了。希望你快点好起来！'
        ]);
      }
      return pick([
        '健康最重要！平时要多运动，少吃垃圾食品哦！',
        '你平时运动吗？我建议每天散步半小时，对身体好！'
      ]);
    }
  },

  // ═══ GIA ĐÌNH ═══
  family: {
    patterns: ['家', 'gia đình', 'nhà', '父母', '爸', '妈', '哥', '姐', '弟', '妹', '孩子', '老公', '老婆', '家人', 'bố', 'mẹ', 'chị', 'anh', 'em'],
    weight: 80,
    handle: () => pick([
      '家是最温暖的地方！你家有几口人？',
      '家人永远是最支持我们的人！多陪陪家人哦！',
      '你跟你家人的关系怎么样？经常一起吃饭吗？'
    ])
  },

  // ═══ THỜI GIAN ═══
  time: {
    patterns: ['几点', '什么时候', '什么时候', '多久', '什么时候', 'giờ', 'khi', 'bao lâu', 'lúc', 'ngày', 'tuần', 'tháng', 'năm'],
    weight: 65,
    handle: () => pick([
      '时间过得真快！要珍惜每一分每一秒！',
      '你平时几点起床？我是AI，不用睡觉，哈哈！😄'
    ])
  },

  // ═══ NGÔN NGỮ ═══
  language: {
    patterns: ['语言', 'ngôn ngữ', 'tiếng', '英语', '英文', '越南语', '日语', '韩语', '法语', '德语', 'nói', 'speak', 'phát âm', 'từ vựng', 'ngữ pháp', '声调', '汉字', '拼音', 'dấu'],
    weight: 85,
    handle: (input, ctx) => {
      if (hasAny(input, ['声调', 'dấu', 'phát âm'])) {
        return '汉语的四个声调：一声平、二声扬、三声拐弯、四声降。多练习就会了！加油！';
      }
      if (hasAny(input, ['汉字', 'chữ'])) {
        return '汉字很有意思！很多字都是象形字，比如"山"就像一座山，"水"就像流水。你喜欢写汉字吗？';
      }
      return pick([
        '你会几种语言？会多种语言的人都很聪明！',
        '语言是沟通的桥梁！会说中文和越南语已经很厉害了！'
      ]);
    }
  },

  // ═══ ĐỘNG VẬT ═══
  animal: {
    patterns: ['动物', 'động vật', '狗', '猫', 'thú', 'chó', 'mèo', 'cá', 'chim', 'ngựa', 'gấu', 'hổ', 'rồng', '龙', '熊猫', '虎', '马', '鱼', '鸟'],
    weight: 70,
    handle: (input, ctx) => {
      if (hasAny(input, ['猫', 'mèo'])) {
        return '猫猫太可爱了！你喜欢猫吗？我听说黑猫在越南很受欢迎？🐱';
      }
      if (hasAny(input, ['狗', 'chó'])) {
        return '狗狗是人类最好的朋友！你养狗吗？🐶';
      }
      if (hasAny(input, ['熊猫', 'gấu trúc'])) {
        return '熊猫是中国的国宝！黑白相间，憨态可掬，太可爱了！🐼';
      }
      return pick([
        '你喜欢什么动物？我喜欢猫和狗！',
        '中国的国宝是大熊猫，越南有漂亮的鸟和鱼！'
      ]);
    }
  },

  // ═══ MUA SẮM ═══
  shopping: {
    patterns: ['买', 'mua', 'bán', '购物', '商店', '淘宝', '京东', '价格', '贵', '便宜', '打折', '优惠', '信用卡', '现金', 'tiền', 'giá'],
    weight: 70,
    handle: () => pick([
      '你喜欢网购吗？中国的淘宝和京东很好用！但是要注意别花太多钱哦！',
      '买东西前可以比价！看准了再买，省钱又放心！'
    ])
  },

  // ═══ BẠN BÈ ═══
  friend: {
    patterns: ['朋友', 'bạn', 'bạn bè', 'bạn thân', 'bạn học', 'đồng nghiệp', 'quen', 'gặp', 'hẹn'],
    weight: 75,
    handle: () => pick([
      '朋友是人生中最重要的财富！你有好朋友在身边吗？',
      '真正的朋友不管多远都会保持联系！你跟你的好朋友经常见面吗？',
      '朋友多了路好走！多交朋友，生活会更有趣！'
    ])
  },

  // ═══ THỂ THAO ═══
  sport: {
    patterns: ['运动', 'thể thao', 'bóng đá', 'bóng chuyền', 'cầu lông', 'bơi', 'chạy', 'yoga', 'gym', 'bóng rổ', 'tennis', 'bơi lội', 'đá bóng', 'đánh cầu', 'tập'],
    weight: 70,
    handle: (input) => {
      if (hasAny(input, ['bóng đá', 'đá bóng'])) {
        return '足球是世界第一运动！你喜欢看世界杯吗？中国队也要加油！⚽';
      }
      if (hasAny(input, ['bơi', 'bơi lội'])) {
        return '游泳是夏天最好的运动！而且对身材很好！🏊';
      }
      return pick([
        '运动有益健康！你最喜欢什么运动？',
        '生命在于运动！每天运动一小时，健康生活一辈子！'
      ]);
    }
  },

  // ═══ CÔNG NGHỆ ═══
  tech: {
    patterns: ['手机', '电脑', 'điện thoại', 'máy tính', 'internet', 'mạng', 'app', '微信', '支付宝', '抖音', 'Alipay', 'WeChat', 'TikTok', 'công nghệ', 'AI'],
    weight: 75,
    handle: (input) => {
      if (hasAny(input, ['AI', 'trí tuệ'])) {
        return '我就是AI！哈哈！AI越来越厉害了，但是我还是最喜欢跟真人聊天！';
      }
      if (hasAny(input, ['微信', 'WeChat'])) {
        return '微信是中国最流行的社交软件！可以聊天、支付、打车、点外卖…什么都能做！';
      }
      return pick([
        '中国的科技发展很快！手机支付、高铁、共享单车都很方便！',
        '你觉得中国的科技怎么样？是不是很方便？'
      ]);
    }
  },

  // ═══ VĂN HÓA ═══
  culture: {
    patterns: ['文化', 'văn hóa', 'phong tục', 'tết', 'lễ', '春节', '中秋', '端午', '元宵', 'truyền thống', '习俗', '过年', '红包', 'lì xì'],
    weight: 80,
    handle: (input) => {
      if (hasAny(input, ['春节', 'tết', '过年'])) {
        return '春节是中国最重要的节日！一家人团圆、吃年夜饭、发红包、看春晚！你们越南也过春节吗？🧧';
      }
      if (hasAny(input, ['中秋'])) {
        return '中秋节吃月饼、赏月！月饼有莲蓉、豆沙、五仁…你喜欢哪种？🥮';
      }
      if (hasAny(input, ['红包', 'lì xì'])) {
        return '红包是春节的传统！红色的信封代表好运和祝福！你收到过红包吗？🧧';
      }
      return pick([
        '中越文化有很多相似之处！比如春节、中秋节…你觉得还有什么相似的地方？',
        '文化是了解一个国家最好的窗口！你对中国的什么文化最感兴趣？'
      ]);
    }
  },

  // ═══ DỊCH THUẬT ═══
  translate: {
    patterns: ['什么意思', 'nghĩa là', 'dịch', 'translate', 'tiếng Trung', 'nói thế nào', '怎么说', '用中文'],
    weight: 95,
    handle: (input) => {
      // Extract the word they want translated
      const words = input.replace(/[""「」''『』]/g, '').trim();
      if (words.length < 10) {
        return '你问哪个词？写出来我帮你看！或者你可以用上面的"Tra từ"功能查词典！';
      }
      return '你可以试着自己查词典，也可以把你想问的词写出来，我帮你看看！';
    }
  },

  // ═══ HỎI NGƯỢC LẠI ═══
 反问: {
    patterns: ['你呢', 'còn bạn', 'thế bạn', 'bạn thì'],
    weight: 80,
    handle: (input, ctx) => {
      return pick([
        '我很好！谢谢关心！你今天过得开心吗？',
        '我每天都在这里等你聊天！今天有什么新鲜事吗？'
      ]);
    }
  },

  // ═══ ĐỒNG Ý / PHỦ ĐỊNH ═══
  agree: {
    patterns: ['对', '是的', 'đúng', 'phải', '是的', '没错', '当然', '好吧', '好的', '行', '可以', '嗯'],
    weight: 60,
    handle: () => pick([
      '好的！那我们继续聊！你还想说什么？',
      '嗯嗯，我明白了。继续说！'
    ])
  },

  // ═══ HỎI THĂM ═══
  how_are_you: {
    patterns: ['怎么样', 'thế nào', '最近', 'dạo', 'gần đây'],
    weight: 85,
    handle: () => pick([
      '最近不错！每天都在这里跟人聊天，很开心！你呢？',
      '挺好的！谢谢关心！你最近过得怎么样？'
    ])
  },

  // ═══ XIN LỖI ═══
  sorry: {
    patterns: ['对不起', 'xin lỗi', '不好意思', 'sorry'],
    weight: 90,
    handle: () => pick([
      '没关系！不用道歉！',
      '没事儿！大家都会有搞错的时候！'
    ])
  },

  // ═══ THỜI GIAN RẢNH ═══
  free_time: {
    patterns: ['rảnh', '空', '有空', '空闲', '有时间'],
    weight: 65,
    handle: () => pick([
      '我随时都有空！24小时在线！你想聊多久都行！',
      '我不用睡觉，所以什么时候都能陪你聊天！'
    ])
  },

  // ═══ HỎI ĐÁP ═══
  question: {
    patterns: ['?', '吗', 'ma', '什么', 'thế', 'nào', 'sao', 'đâu', 'gì', 'không'],
    weight: 50,
    handle: () => pick([
      '好问题！让我想想…你觉得呢？',
      '这个问题很有意思！你是怎么想的？',
      '嗯…让我回答你的问题！'
    ])
  },

  // ═══ PHỦ ĐỊNH ═══
  negative: {
    patterns: ['不', 'không', 'chẳng', 'đừng', '别', '没有', '没'],
    weight: 40,
    handle: () => pick([
      '哦，原来是这样。那你是怎么想的？',
      '没关系！每个人都有自己的想法！'
    ])
  },

  // ═══ NGÀY LỄ ═══
  festival: {
    patterns: ['节日', 'lễ', 'tết', '春节', '圣诞', '元旦', '中秋', '端午', '元宵', '国庆', 'lễ hội'],
    weight: 85,
    handle: (input) => {
      if (hasAny(input, ['春节', 'tết', '新年'])) {
        return pick([
          '春节是中国最重要的节日！一家人团圆吃年夜饭、看春晚、放鞭炮！你们家怎么过春节？🧧',
          '恭喜发财！春节快乐！今年是蛇年，祝你万事如意！'
        ]);
      }
      if (hasAny(input, ['中秋'])) {
        return '中秋节吃月饼赏月！你喜欢什么馅的月饼？莲蓉、豆沙还是五仁？🥮';
      }
      if (hasAny(input, ['圣诞'])) {
        return '圣诞节在中國也越来越流行了！虽然不算是传统节日，但很多人会互相送礼物！🎄';
      }
      return pick([
        '你最喜欢什么节日？节日的时候你最开心了！',
        '每个节日都有它的意义！你跟家人怎么庆祝节日？'
      ]);
    }
  },

  // ═══ ÂM NHẠC ═══
  music: {
    patterns: ['音乐', 'nhạc', '歌曲', '唱', '歌', '歌手', '听众', '流', '古典', '流行', '摇滚', 'hát', 'bài hát', 'ca sĩ'],
    weight: 85,
    handle: (input) => {
      if (hasAny(input, ['周杰伦', 'Châu Kiệt Luân'])) {
        return '周杰伦是华语乐坛的天王！他的《青花瓷》《稻香》《告白气球》都超好听！你最喜欢哪首？🎵';
      }
      if (hasAny(input, ['邓紫棋', 'Đặng Tử Kỳ'])) {
        return '邓紫棋的声音很有爆发力！《光年之外》和《泡沫》都是经典！你听过吗？';
      }
      if (hasAny(input, ['越南', 'nhạc Việt'])) {
        return '越南歌也很好听！我喜欢越南的流行音乐，旋律很美！你能推荐几首吗？';
      }
      return pick([
        '你喜欢什么类型的音乐？流行、古典还是摇滚？',
        '音乐是世界的语言！你心情好的时候喜欢听什么歌？',
        '你会唱中文歌吗？唱卡拉OK是中国人喜欢的娱乐活动！🎤'
      ]);
    }
  },

  // ═══ PHIM ẢNH ═══
  movie: {
    patterns: ['电影', 'phim', 'điện ảnh', '看', '影片', '导演', '演员', 'diễn viên', 'đạo diễn', 'rạp', 'chiếu'],
    weight: 82,
    handle: (input) => {
      if (hasAny(input, ['动画', 'hoạt hình'])) {
        return '中国动画越来越厉害了！《哪吒之魔童降世》票房超50亿！你看过吗？🎬';
      }
      if (hasAny(input, ['流浪地球', 'The Wandering Earth'])) {
        return '《流浪地球》是中国科幻电影的里程碑！视觉效果超级震撼！你期待第三部吗？';
      }
      return pick([
        '你喜欢看什么类型的电影？动作片、爱情片还是科幻片？',
        '中国电影近年来进步很大！推荐你看《你好，李焕英》和《唐人街探案》！',
        '你最近看了什么好电影？给我推荐一下吧！'
      ]);
    }
  },

  // ═══ SÁCH ═══
  book: {
    patterns: ['书', 'sách', 'đọc', '看书', '小说', 'tiểu thuyết', 'truyện', '文学', 'văn học', 'tác giả', 'nhà văn'],
    weight: 78,
    handle: (input) => {
      if (hasAny(input, ['三体', 'Tam Thể'])) {
        return '《三体》是中国科幻小说的巅峰之作！刘慈欣太厉害了！你看完三部曲了吗？📚';
      }
      return pick([
        '你喜欢看书吗？阅读能开阔眼界！你最喜欢哪本书？',
        '读书是一种享受！你有时间的话，推荐你看《活着》和《围城》！',
        '你平时看中文书还是越南文书？看中文书能提高阅读能力！'
      ]);
    }
  },

  // ═══ THỜI TRANG ═══
  fashion: {
    patterns: ['衣服', 'quần áo', 'thời trang', 'fashion', '穿', 'mặc', '风格', 'phong cách', '品牌', 'thương hiệu', '时尚', 'thiết kế'],
    weight: 70,
    handle: () => pick([
      '你今天的穿搭一定很好看！你喜欢什么风格的衣服？',
      '中国有很多时尚品牌，比如李宁、安踏！你喜欢运动风还是休闲风？',
      '人靠衣装！穿得好看心情也会变好！你最喜欢什么颜色？'
    ])
  },

  // ═══ NẤU ĂN ═══
  cooking: {
    patterns: ['做饭', 'nấu', 'nấu ăn', 'cook', 'nhà bếp', 'bếp', 'nồi', 'chảo', 'công thức', 'nêm', 'gia vị', 'món'],
    weight: 80,
    handle: (input) => {
      if (hasAny(input, ['phở', '河粉'])) {
        return '越南河粉世界闻名！用牛骨熬汤，配上鲜嫩的牛肉和香菜，太好吃了！你会做吗？🍜';
      }
      if (hasAny(input, ['bánh mì', '法棍'])) {
        return '越南法棍三明治是我的最爱！外酥里嫩，夹着烤肉和蔬菜，完美！';
      }
      return pick([
        '你会做饭吗？会做饭的人都很厉害！你拿手菜是什么？',
        '自己做饭既健康又省钱！你平时喜欢做什么菜？',
        '中国菜讲究色香味俱全！你想学做什么中国菜？我可以教你！'
      ]);
    }
  },

  // ═══ GIẤC MƠ ═══
  dream: {
    patterns: ['梦', 'mơ', 'ước', '梦想', 'ước mơ', '理想', 'hoài bão', 'mong ước', '目标', 'mục tiêu', 'tương lai', 'hy vọng'],
    weight: 82,
    handle: () => pick([
      '有梦想的人生才有意义！你的梦想是什么？',
      '不管梦想有多大，一步一步去实现！我相信你！💪',
      '梦想还是要有的，万一实现了呢？你最大的愿望是什么？'
    ])
  },

  // ═══ KỶ NIỆM ═══
  memory: {
    patterns: ['记得', 'nhớ', '回忆', '过去', '以前', '小时候', 'hồi ức', 'trước đây', 'ngày xưa', 'lúc nhỏ', 'quá khứ', 'kỷ niệm'],
    weight: 75,
    handle: () => pick([
      '回忆过去是美好的！你小时候最开心的事情是什么？',
      '时间过得真快！你有什么难忘的经历吗？',
      '小时候总是无忧无虑的！你最怀念童年的什么？'
    ])
  },

  // ═══ LỜI KHUYÊN ═══
  advice: {
    patterns: ['建议', 'khuyên', 'lời khuyên', 'nên', 'giải pháp', 'cách', 'làm sao', 'xử lý', 'giải quyết'],
    weight: 85,
    handle: (input) => {
      if (hasAny(input, ['buồn', 'chán', 'mệt'])) {
        return '心情不好的时候，听听音乐、出去走走、跟朋友聊聊天！不要一个人闷着哦！😊';
      }
      if (hasAny(input, ['học', '学'])) {
        return '学语言最重要的是坚持！每天学一点，不要贪多。多听多说多练！加油！📚';
      }
      return pick([
        '这个问题很好！我的建议是先冷静思考，然后一步一步解决。',
        '每个人都会遇到困难，重要的是心态！你觉得怎么样？'
      ]);
    }
  },

  // ═══ SO SÁNH VĂN HÓA ═══
  compare: {
    patterns: ['giống', 'khác', '相同', '不同', '对比', '相似', '差异', 'so sánh', 'chỗ giống', 'chỗ khác'],
    weight: 80,
    handle: () => pick([
      '中越文化有很多相似之处！比如都过春节、用筷子、重视家庭！你觉得还有什么？',
      '虽然中越文化相近，但也有不同！比如语言、饮食口味、生活习惯…',
      '文化交流让世界更美好！你对中国的什么文化最感兴趣？'
    ])
  },

  // ═══ THỦ CÔNG ═══
  handmade: {
    patterns: ['手工', 'thủ công', 'DIY', 'tự làm', 'vẽ', 'vẽ tranh', 'đan', 'may', 'thêu', 'gốm', 'hoa'],
    weight: 65,
    handle: () => pick([
      '手工活需要耐心！你喜欢做什么手工？',
      '自己做的东西最有心意了！你会做手工礼物送人吗？',
      '中国的剪纸很漂亮！你会剪窗花吗？'
    ])
  },

  // ═══ THIÊN NHIÊN ═══
  nature: {
    patterns: ['自然', 'thiên nhiên', '山川', 'sông', 'núi', 'biển', 'rừng', 'cây', 'hoa', 'động vật', 'chim', 'hổ', 'cá', 'bướm'],
    weight: 70,
    handle: () => pick([
      '大自然是最美的风景！你喜欢山还是海？',
      '周末去郊外走走，呼吸新鲜空气，心情会变好！',
      '保护环境人人有责！你平时有环保的习惯吗？🌍'
    ])
  },

  // ═══ THÚ CƯNG ═══
  pet: {
    patterns: ['宠物', 'thú cưng', 'nuôi', '狗', 'chó', '猫', 'mèo', 'cá', 'chim', 'hamster', 'rùa', 'thỏ'],
    weight: 75,
    handle: (input) => {
      if (hasAny(input, ['chó', '狗'])) {
        return '狗狗是人类最好的朋友！你养的是什么品种的狗？🐕';
      }
      if (hasAny(input, ['mèo', '猫'])) {
        return '猫猫太可爱了！高冷又粘人！你家的猫是什么颜色？🐱';
      }
      return pick([
        '养宠物是一件幸福的事！你喜欢什么宠物？',
        '宠物就像家人一样！你有养宠物吗？'
      ]);
    }
  },

  // ═══ SỨC KHỎE TINH THẦN ═══
  mental: {
    patterns: ['压力', '焦虑', 'stress', 'lo âu', 'căng thẳng', 'mệt mỏi', 'burnout', 'thiền', 'yoga', 'thư giãn', 'thả lỏng', 'nghỉ ngơi'],
    weight: 80,
    handle: () => pick([
      '生活有压力是正常的！记得给自己时间放松。深呼吸、听听音乐、散散步…🧘',
      '心理健康跟身体健康一样重要！你平时怎么减压？',
      '累了就休息一下！没有什么比健康更重要！'
    ])
  },

  // ═══ CHỤP ẢNH ═══
  photo: {
    patterns: ['照片', 'ảnh', 'chụp', '拍照', '摄影', 'nhiếp ảnh', 'selfie', 'camera', 'máy ảnh'],
    weight: 65,
    handle: () => pick([
      '拍照记录生活是个好习惯！你喜欢拍风景还是自拍？📸',
      '一张好照片能留住美好的瞬间！你拍照技术怎么样？'
    ])
  },

  // ═══ GIAO THÔNG ═══
  transport: {
    patterns: ['交通', 'giao thông', 'xe', 'xe buýt', 'xe máy', 'ô tô', 'tàu', 'máy bay', 'tắc đường', 'kẹt xe', 'ga', 'bến', 'vé', 'ticket'],
    weight: 70,
    handle: () => pick([
      '中国的交通很方便！高铁、地铁、公交都很发达！你坐过中国的高铁吗？🚄',
      '大城市上下班高峰期容易堵车！你平时怎么上班？'
    ])
  },

  // ═══ THỜI TIẾT CHI TIẾT ═══
  weather_detail: {
    patterns: ['mưa', 'nắng', 'gió', 'bão', 'mây', 'sương', 'ẩm', 'khô', 'se lạnh', 'nồm'],
    weight: 60,
    handle: (input) => {
      if (hasAny(input, ['mưa', '雨'])) {
        return '下雨天适合在家看电影或者睡觉！你喜不喜欢下雨？☔️';
      }
      if (hasAny(input, ['nắng', '晴'])) {
        return '天气好的时候心情也会好！出去走走吧！☀️';
      }
      return pick([
        '你那里天气怎么样？四季分明吗？',
        '越南北方和南方的天气不太一样！你在北方还是南方？'
      ]);
    }
  },

  // ═══ TRÒ CHUYỆN HÀNG NGÀY ═══
  daily: {
    patterns: ['日常', 'hàng ngày', 'thường ngày', 'sáng', 'tối', 'trưa', 'chiều', 'dậy', 'ngủ', 'ăn sáng', 'tắm', 'đi làm', 'đi học'],
    weight: 70,
    handle: () => pick([
      '你每天的生活是什么样的？早上几点起床？',
      '规律的生活对身体好！你每天睡几个小时？',
      '一日之计在于晨！你早上一般做什么？'
    ])
  },

  // ═══ CÂU ĐỐ ═══
  riddle: {
    patterns: ['đố', 'câu đố', 'đoán', 'guess', 'riddle', 'đáp án', 'trả lời'],
    weight: 75,
    handle: () => pick([
      '来猜个谜语吧：什么东西越洗越脏？（答案：水）😄',
      '我有一个谜语：有口不能说，有腿不会走。是什么？（答案：桌子）',
      '你出个谜语考考我吧！我喜欢猜谜语！'
    ])
  },

  // ═══ LỊCH SỬ ═══
  history: {
    patterns: ['历史', 'lịch sử', 'cổ đại', 'triều đại', 'vua', 'chiến tranh', 'phong kiến', 'khảo cổ'],
    weight: 70,
    handle: () => pick([
      '中国有5000年历史！从夏商周到元明清，每个朝代都有自己的故事！',
      '历史是一面镜子！你觉得学习历史有什么意义？',
      '越南和中国都有悠久的历史！你对哪个历史时期最感兴趣？'
    ])
  },

  // ═══ THIỀN ĐỊNH ═══
  meditation: {
    patterns: ['thiền', 'meditation', 'tĩnh tâm', 'ngồi thiền', 'chánh niệm', 'mindfulness'],
    weight: 60,
    handle: () => pick([
      '冥想对身心健康很好！每天花10分钟静坐，你会感觉不一样！🧘',
      '你试过冥想吗？刚开始可能不习惯，慢慢就会觉得平静！'
    ])
  },

  // ═══ BÓNG ĐÁ ═══
  soccer: {
    patterns: ['bóng đá', 'đá bóng', 'football', 'soccer', 'World Cup', 'Cúp', 'trận', 'cầu thủ', 'Messi', 'Ronaldo'],
    weight: 75,
    handle: () => pick([
      '足球是世界上最受欢迎的运动！你支持哪个球队？⚽',
      '中国足球正在发展！希望有一天能看到中国队进世界杯！',
      '你踢足球吗？还是喜欢看球赛？'
    ])
  },

  // ═══ TOÁN / KHOA HỌC ═══
  science: {
    patterns: ['khoa học', 'science', 'toán', 'vật lý', 'hóa', 'sinh', 'thiên văn', 'vũ trụ', 'ngôi sao'],
    weight: 60,
    handle: () => pick([
      '科学让世界进步！你对哪个领域最感兴趣？🔬',
      '宇宙很大，人类很渺小！你对天文感兴趣吗？',
      '科技改变生活！你觉得下一个改变世界的发明会是什么？'
    ])
  },

  // ═══ TIỀN ═══
  money: {
    patterns: ['tiền', 'money', 'giàu', 'nghèo', 'lương', 'thu nhập', 'tiết kiệm', 'đầu tư', 'tài chính'],
    weight: 60,
    handle: () => pick([
      '钱不是万能的，但没有钱是万万不能的！你怎么看待金钱？',
      '理财很重要！你有存钱的习惯吗？',
      '你觉得什么比钱更重要？我觉得是健康和快乐！'
    ])
  },

  // ═══ CHỦ ĐỀ TỰ DO ═══
  free_talk: {
    patterns: ['随便', 'tự nhiên', 'gì cũng', 'bất kỳ', 'tùy'],
    weight: 30,
    handle: () => pick([
      '那我们随便聊吧！你今天过得怎么样？',
      '好！你想聊什么都可以！你最近有开心的事吗？',
      '聊聊你吧！你有什么兴趣爱好？'
    ])
  }
};

// Merge 2000+ mẫu câu mở rộng từ ai-chat-data.js
const EXTRA_COUNT = mergeExtraTopics(KB);
const TOTAL_TOPICS = Object.keys(KB).length;

// ═══════════════════════════════════════════════════════════════
// HÀM XỬ LÝ NGÔN NGỮ NÂNG CAO
// Normalize, phân tích cú pháp, cảm xúc, đa chủ đề
// ═══════════════════════════════════════════════════════════════

// ─── Chuẩn hoá input ───
function normalizeText(text) {
  let t = text.trim();
  // Chuẩn hoá Unicode: fullwidth → halfwidth
  t = t.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // Chuẩn hoá dấu câu - đơn giản hơn
  t = t.replace(/[，]/g, ',').replace(/[。]/g, '.').replace(/[！]/g, '!').replace(/[？]/g, '?');
  t = t.replace(/[；]/g, ';').replace(/[：]/g, ':');
  t = t.replace(/[（]/g, '(').replace(/[）]/g, ')');
  t = t.replace(/[【】]/g, '').replace(/[《》]/g, '');
  // Chuẩn hoá khoảng trắng
  t = t.replace(/\s+/g, ' ');
  // Xoá emoji để dễ match pattern
  t = t.replace(/\p{Emoji}/gu, '').trim();
  return t;
}

// ─── Phát hiện intent (cải thiện) ───
function detectIntent(text) {
  const t = text.trim().toLowerCase();
  // Câu hỏi
  if (/[？?]/.test(t)) return 'question';
  if (/(吗|ma|呢|什么|nào|sao|đâu|gì|không|thế nào|thế|khi nào|bao giờ|ai|tại sao|làm sao)$/.test(t)) return 'question';
  if (/^(có|đã|đang|sẽ|phải) /.test(t)) return 'question';
  
  // Khẳng định
  if (/^(vâng|ừ|ừm|ok|okay|được|好的|可以|没错|对|嗯|是啊|phải|ừa)/i.test(t)) return 'affirm';
  
  // Phủ định
  if (/^(không|đừng|chẳng|chưa|chả|có mà|没有|不|别)/i.test(t)) return 'negate';
  
  // Hỏi lại AI
  if (/^(bạn|anh|chị|còn|có|你觉得呢|你呢)/i.test(t)) return 'ask_back';
  
  // Từ đơn cảm thán
  if (t.length <= 3 && /^(好棒|太棒|wow|ôi|trời|chà|ôi trời|úi)$/i.test(t)) return 'exclaim';
  
  return 'statement';
}

// ─── Phát hiện cảm xúc ───
function analyzeSentiment(text) {
  const posWords = ['开心', '高兴', '快乐', '幸福', '棒', '好', '喜欢', '爱', 'vui', 'hạnh phúc', 'tuyệt', 'yêu'];
  const negWords = ['难过', '伤心', '累', '烦', '压力', '焦虑', 'buồn', 'mệt', 'chán', 'lo', 'sợ'];
  const pos = posWords.filter(w => text.includes(w)).length;
  const neg = negWords.filter(w => text.includes(w)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

// ─── Trích xuất tên ───
function extractName(text) {
  const patterns = ['我叫', '我是', '我的名字是', '名字是', '我叫', '我是'];
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx >= 0) {
      const after = text.substring(idx + p.length).trim();
      const clean = after.replace(/[，。！？\s,\.!\?了是叫也还很好]/g, '').substring(0, 8);
      if (clean && clean.length > 0 && !/[0-9]/.test(clean[0]) && !/[\u3040-\u309f]/.test(clean)) return clean;
    }
  }
  return null;
}

// ─── Lấy giờ trong ngày ───
function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '你还没睡啊？';
  if (h < 12) return '早上好！';
  if (h < 14) return '中午好！';
  if (h < 18) return '下午好！';
  if (h < 22) return '晚上好！';
  return '这么晚了还没睡？';
}

// ─── Phân tích input nâng cao ───
function analyzeInput(text, ctx) {
  const normalized = normalizeText(text);
  return {
    raw: text,
    normalized,
    hasChinese: /[\u4e00-\u9fff]/.test(text),
    hasVietnamese: /[àáạãảâầấậẫẩăằắặẵẳèéẹẽẻêềếệễểìíịĩỉòóọõỏôồốộỗổơờớợỡởùúụũủưừứựữửỳýỵỹỷđ]/i.test(text),
    hasEmoji: /\p{Emoji}/u.test(text),
    length: text.length,
    wordCount: text.split(/\s+/).length,
    intent: detectIntent(normalized),
    sentiment: analyzeSentiment(text),
    isQuestion: /[？?]/.test(text) || /(吗|ma|什么|nào|sao|đâu|gì|không|thế nào|thế)$/.test(text),
    isShort: text.length < 6,
    topics: []
  };
}

// ─── Sinh câu đệm ngữ cảnh ───
const fillers = {
  affirm: ['好的，', '嗯，', '是的，', '对，', '没错，'],
  question: ['嗯，好问题！', '这样啊，', '哦？', '有意思！'],
  negate: ['哦，', '原来这样，', '这样啊，'],
  statement: ['嗯，', '好的，', '原来如此，', '这样啊，', '哦，']
};

const followups = [
  '你觉得呢？', '你是什么想法？', '你怎么看？', '是吗？', '真的吗？',
  '还有呢？', '然后呢？', '为什么呢？', '你同意吗？'
];

const contextFollowups = {
  study: ['你每天学多久？', '你觉得难吗？', '你最喜欢学什么？'],
  food: ['你吃过中国菜吗？', '你喜欢吃辣的吗？', '你会做中国菜吗？'],
  travel: ['你去过中国吗？', '你最想去哪儿？', '你什么时候去？'],
  music: ['你喜欢什么歌手？', '你会唱歌吗？'],
  movie: ['你最近看了什么电影？', '你喜欢什么类型？'],
  sport: ['你经常运动吗？', '你喜欢什么运动？'],
  book: ['你最近在读什么书？', '你喜欢什么类型的书？'],
  pet: ['你养过宠物吗？', '你喜欢猫还是狗？'],
  fashion: ['你喜欢什么风格的衣服？', '你平时怎么搭配？'],
  cooking: ['你会做饭吗？', '你拿手菜是什么？'],
  health: ['你平时注意健康吗？', '你多久体检一次？'],
  family: ['你家有几口人？', '你跟家人关系好吗？'],
  festival: ['你最喜欢什么节日？', '你怎么过节？'],
};

/* ═══════════════════════════════════════════════════════════════
   RAG + HYBRID SEARCH + RERANKING PIPELINE
   ═══════════════════════════════════════════════════════════════ */

// ─── 1. BUILD SEARCH INDEX (chạy 1 lần khi load) ───
let searchIndex = null;
function buildSearchIndex() {
  if (searchIndex) return searchIndex;
  const index = [];
  for (const [key, topic] of Object.entries(KB)) {
    for (const pattern of topic.patterns) {
      // Phân tích pattern thành n-gram
      const grams = new Set();
      const chars = pattern.split('');
      for (let i = 0; i < chars.length; i++) {
        grams.add(chars[i]); // uni-gram
        if (i + 1 < chars.length) grams.add(chars[i] + chars[i + 1]); // bi-gram
        if (i + 2 < chars.length) grams.add(chars[i] + chars[i + 1] + chars[i + 2]); // tri-gram
      }
      index.push({
        key,
        pattern,
        topic,
        weight: topic.weight,
        patternLen: pattern.length,
        grams,  // n-gram set
        freq: {} // sẽ tính BM25
      });
    }
  }
  // Tính BM25: document frequency (DF) cho mỗi n-gram
  const df = {};
  for (const entry of index) {
    const seen = new Set();
    for (const g of entry.grams) {
      if (!seen.has(g)) {
        df[g] = (df[g] || 0) + 1;
        seen.add(g);
      }
    }
  }
  const N = index.length;
  const AVG_DL = index.reduce((s, e) => s + e.patternLen, 0) / N;
  const k1 = 1.5;
  const b = 0.75;
  for (const entry of index) {
    const dl = entry.patternLen;
    for (const g of entry.grams) {
      // TF trong pattern (tần suất xuất hiện)
      let tf = 0;
      let pos = -1;
      while ((pos = entry.pattern.indexOf(g, pos + 1)) !== -1) tf++;
      // BM25 score cho n-gram này
      const idf = Math.log((N - df[g] + 0.5) / (df[g] + 0.5) + 1);
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (dl / AVG_DL));
      entry.freq[g] = idf * numerator / denominator;
    }
  }
  searchIndex = { entries: index, df, N, AVG_DL };
  return searchIndex;
}

// ─── 2. HYBRID SEARCH: BM25 + n-gram + specificity + position ───
function hybridSearch(query, index, topK = 12) {
  const qChars = query.split('');
  const qGrams = new Set();
  for (let i = 0; i < qChars.length; i++) {
    qGrams.add(qChars[i]);
    if (i + 1 < qChars.length) qGrams.add(qChars[i] + qChars[i + 1]);
    if (i + 2 < qChars.length) qGrams.add(qChars[i] + qChars[i + 1] + qChars[i + 2]);
  }

  // Pre-count: pattern uniqueness (mỗi pattern xuất hiện trong bao nhiêu topic)
  const patternCount = {};
  for (const entry of index.entries) {
    patternCount[entry.pattern] = (patternCount[entry.pattern] || 0) + 1;
  }

  const results = [];
  for (const entry of index.entries) {
    // BM25 score
    let bm25Score = 0;
    for (const g of qGrams) {
      if (entry.freq[g]) bm25Score += entry.freq[g];
    }

    // n-gram overlap (Jaccard-like)
    const intersection = new Set([...qGrams].filter(g => entry.grams.has(g)));
    const union = new Set([...qGrams, ...entry.grams]);
    const jaccard = intersection.size / (union.size || 1);

    // Exact match bonus (dài = cụ thể = bonus lớn hơn)
    let exactBonus = 0;
    if (query.includes(entry.pattern)) {
      exactBonus = entry.pattern.length * entry.pattern.length * 0.5; // quadratic for longer = more specific
    }

    // █ POSITION BIAS: pattern xuất hiện càng sớm càng tốt
    let posBonus = 0;
    const pos = query.indexOf(entry.pattern);
    if (pos >= 0) {
      posBonus = Math.max(0, 15 - pos * 0.8);
    }

    // █ SPECIFICITY BONUS: pattern dài và hiếm = đặc thù hơn
    const patternLen = entry.pattern.length;
    const specificity = patternLen > 3 ? Math.min(patternLen * 0.5, 8) : 0;
    
    // █ UNIQUENESS BONUS: pattern chỉ xuất hiện trong 1 topic
    const uniqueness = patternCount[entry.pattern] === 1 ? 3 : 0;

    // █ WEIGHT từ topic
    const weightBonus = entry.weight / 8;

    // █ HYBRID SCORE: tối ưu cho accuracy
    const score = 
      bm25Score * 0.25 +        // BM25: 25%
      jaccard * 100 * 0.20 +    // n-gram overlap: 20%
      exactBonus * 0.25 +       // Exact match: 25% (tăng để ưu tiên match chính xác)
      posBonus * 0.08 +         // Position: 8%
      specificity * 0.10 +      // Specificity: 10%
      uniqueness * 0.07 +       // Uniqueness: 7%
      weightBonus * 0.05;       // Topic weight: 5%

    if (score > 0.3) {
      results.push({ key: entry.key, topic: entry.topic, score, pattern: entry.pattern });
    }
  }

  // Sort by score desc
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ─── 3. RERANKING: context-aware + diversity + pattern fit ───
function rerankResults(results, ctx) {
  if (results.length === 0) return [];

  // Tính mean score để chuẩn hoá
  const scores = results.map(r => r.score);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxScore = Math.max(...scores);

  const scored = results.map(r => {
    let rerankScore = r.score;

    // █ CONTRAST RATIO: so với điểm cao nhất
    const ratio = r.score / (maxScore || 1);
    if (ratio < 0.3) {
      // Quá thấp so với top → giảm mạnh
      rerankScore *= 0.5;
    }

    // █ CONTEXT COHERENCE: chủ đề khớp với lịch sử
    if (ctx.lastTopics && ctx.lastTopics.includes(r.key)) {
      // Tăng dần theo số lần xuất hiện trong context
      const freq = ctx.lastTopics.filter(k => k === r.key).length;
      rerankScore *= (1 + freq * 0.3); // +30% mỗi lần trong context
    }

    // █ PATTERN FIT: pattern dài = match chính xác hơn
    const matchLen = r.pattern ? r.pattern.length : 0;
    if (matchLen > 5) {
      rerankScore *= 1.15; // pattern dài (5+ ký tự) đáng tin hơn
    }

    // █ DIVERSITY: chủ đề mới (not seen) boost nhẹ
    if (ctx.lastTopics && !ctx.lastTopics.includes(r.key) && ctx.turnCount > 3) {
      rerankScore *= 1.05;
    }

    // █ ANTI-REPEAT: giảm nếu đã dùng gần đây
    if (ctx.lastTopicKey === r.key && ctx.turnCount > 5) {
      rerankScore *= 0.85;
    }

    return { ...r, rerankScore };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored;
}

// ─── 4. DEDUPLICATE by topic key ───
function dedupByKey(results) {
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    if (!seen.has(r.key)) {
      seen.add(r.key);
      deduped.push(r);
    }
  }
  return deduped;
}

// ─── 5. RAG pipeline hoàn chỉnh ───
function ragSearch(text, ctx) {
  const index = buildSearchIndex();
  const rawResults = hybridSearch(text, index);
  const reranked = rerankResults(rawResults, ctx);
  const deduped = dedupByKey(reranked);
  return deduped.map(r => ({ key: r.key, topic: r.topic, weight: r.rerankScore }));
}

// ─── Chống lặp: kiểm tra reply đã dùng gần đây ───
function isRepeat(reply, ctx) {
  if (!reply || ctx.lastResponses.length < 3) return false;
  // So sánh 40 ký tự đầu
  const prefix = reply.substring(0, 40);
  return ctx.lastResponses.some(r => r.substring(0, 40) === prefix);
}

// ─── Lấy chủ đề gần nhất để duy trì bám ───
function getContextHint(ctx) {
  if (!ctx.lastTopics || ctx.lastTopics.length === 0) return null;
  const recent = ctx.lastTopics.filter(k => k !== ctx.lastTopicKey);
  if (recent.length > 0) return recent[0];
  return ctx.lastTopics[0] || null;
}

// ─── API chính: xử lý input → trả về câu trả lời ───
export async function processMessage(input, ctx) {
  if (!input || !input.trim()) return '你说什么？我没听清楚！😅';
  
  const text = input.trim();
  ctx.turnCount++;
  
  // Phân tích nâng cao
  const analysis = analyzeInput(text, ctx);
  const normalized = normalizeText(text);
  
  // Trích xuất tên nếu có
  const name = extractName(text);
  if (name) ctx.userName = name;

  // Lưu input gần nhất
  ctx.lastRaw = text;

  // RAG: Hybrid Search + Reranking
  const topics = ragSearch(normalized || text, ctx);
  
  // Cập nhật context topics (giữ tối đa 5)
  ctx.lastTopics = [...new Set([...(topics.map(t => t.key)), ...(ctx.lastTopics || [])])].slice(0, 5);

  // █ CONFIDENCE THRESHOLD ADAPTIVE:
  //   - Nếu top 1 cách top 2 >= 3 điểm → dùng top 1
  //   - Nếu top 1 cách top 2 < 3 điểm → có thể dùng top 2 nếu bám ngữ cảnh tốt hơn
  //   - Luôn yêu cầu weight > 5.0 mới dùng
  let highConfTopics = topics.filter(t => t.weight > 5.0);
  if (highConfTopics.length >= 2) {
    const gap = highConfTopics[0].weight - highConfTopics[1].weight;
    if (gap < 3) {
      // Ambiguous: ưu tiên topic bám với context
      const ctxKey = ctx.lastTopicKey;
      const ctxMatch = highConfTopics.find(t => t.key === ctxKey);
      if (ctxMatch) {
        // Đẩy context-match lên đầu
        highConfTopics = [ctxMatch, ...highConfTopics.filter(t => t.key !== ctxKey)];
      }
    }
  }

  if (highConfTopics.length > 0) {
    const best = highConfTopics[0];
    ctx.lastTopicKey = best.key;
    
    // Ghi nhớ chủ đề đã nói
    if (!ctx.topics.includes(best.key)) ctx.topics.push(best.key);

    let reply = await best.topic.handle(text, ctx);

    // █ ANTI-REPETITION: nếu reply bị lặp, chọn topic khác
    if (isRepeat(reply, ctx) && highConfTopics.length > 1) {
      for (const alt of highConfTopics.slice(1)) {
        const altReply = await alt.topic.handle(text, ctx);
        if (!isRepeat(altReply, ctx)) {
          reply = altReply;
          ctx.lastTopicKey = alt.key;
          break;
        }
      }
    }

    // █ FOLLOW-UP THÔNG MINH: 40% có follow-up, ưu tiên follow-up theo ngữ cảnh
    if (ctx.turnCount >= 2 && !reply.includes('?') && !reply.includes('？') && !isRepeat(reply, ctx)) {
      const cf = contextFollowups[best.key];
      if (cf && Math.random() < 0.40) {
        reply += ' ' + pick(cf);
      } else if (Math.random() < 0.30) {
        reply += ' ' + pick(followups);
      }
    }

    // Lưu reply để chống lặp
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), reply];

    return reply;
  }

  // ===== FALLBACK THÔNG MINH NÂNG CAO =====

  // Cảm thán (wow, ôi trời, etc)
  if (analysis.intent === 'exclaim') {
    const r = pick(['哇！我也觉得！😄', '太棒了！', '真的吗？太厉害了！', '没错！就是这么回事！🎉']);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }
  
  // █ CONTEXT HINT: nếu không match cao, thử bám vào chủ đề cũ
  const contextHint = getContextHint(ctx);
  if (contextHint && ctx.turnCount >= 3 && ctx.turnCount <= 8) {
    const hintReply = pick([
      `我们刚才在聊${contextHint}的话题，你还想继续吗？`,
      `你对${contextHint}还感兴趣吗？我们可以继续聊！`,
      `说到这个，让我想起刚才聊的${contextHint}，你觉得呢？`
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), hintReply];
    return hintReply;
  }

  // Câu ngắn kiểu cảm thán
  if (analysis.isShort) {
    if (analysis.sentiment === 'positive') {
      const r = pick(['太好了！😊', '真棒！', '开心就好！', '我也很开心！🎉']);
      ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
      return r;
    }
    if (analysis.sentiment === 'negative') {
      const r = pick(['不要难过！一切都会好的！💪', '抱抱你！', '加油！', '我会陪着你的！❤️']);
      ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
      return r;
    }
  }
  
  // Đặt câu hỏi
  if (analysis.intent === 'question') {
    if (ctx.turnCount <= 2) {
      const r = pick(['好问题！我叫小AI，你叫什么名字呀？😊', '好问题！你先告诉我你的名字吧！']);
      ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
      return r;
    }
    const r = pick([
      '好问题！你觉得呢？我很好奇你的想法！',
      '这个问题很有意思！你是怎么想的？',
      '让我想想…你先说说你的看法吧！'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }

  // Đồng ý / xác nhận
  if (analysis.intent === 'affirm') {
    const r = pick([
      '好的！那我们继续聊！',
      '嗯嗯，我明白了。然后呢？',
      '了解！还有什么想说的吗？'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }

  // Phủ định
  if (analysis.intent === 'negate') {
    const r = pick([
      '哦，原来是这样。那你怎么想的？',
      '没关系，每个人都有自己的看法！',
      '我明白了。你能多说一点吗？'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }

  // Hỏi ngược lại
  if (analysis.intent === 'ask_back') {
    const r = pick([
      '我很好！谢谢关心！今天你想聊什么？',
      '我一直在这里！有什么新鲜事吗？'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }

  // Fallback theo số lượt
  if (ctx.turnCount <= 2) {
    const r = pick([
      '你好！' + getTimeGreeting() + ' 我叫小AI，你叫什么名字呀？😊',
      '终于有人跟我聊天了！你叫什么名字？我可以叫你朋友吗？'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }
  if (!ctx.userName && ctx.turnCount <= 5) {
    const r = pick([
      '我还不知道你的名字呢！可以告诉我吗？',
      '你不想说名字也没关系！那我们聊别的吧！你想聊什么？'
    ]);
    ctx.lastResponses = [...ctx.lastResponses.slice(-9), r];
    return r;
  }

  // █ FALLBACK ĐA DẠNG: chống lặp
  const fallbacks = [
    '原来如此！可以多说一点吗？我想多了解你！',
    '嗯，很有意思！继续说说你的想法。',
    '你这样觉得吗？我觉得挺有道理的！',
    '好的，我明白了。那你还有什么想聊的？',
    '真的吗？太有趣了！还有呢？',
    '哦？然后呢？发生了什么？',
    '我很好奇，能再多说一点吗？',
    '原来是这样！那你最近怎么样？',
    '嗯！我明白你的意思了。继续吧！',
    '有意思！我从来没这么想过！你是怎么想的？'
  ];
  
  // Chọn fallback chưa dùng gần đây
  let chosen = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = pick(fallbacks);
    if (!isRepeat(candidate, ctx)) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) chosen = pick(fallbacks);
  
  ctx.lastResponses = [...ctx.lastResponses.slice(-9), chosen];
  return chosen;
}

// ─── Khởi tạo ───
export function createContext() {
  return createProfile();
}

export const KB_COUNT = TOTAL_TOPICS;
