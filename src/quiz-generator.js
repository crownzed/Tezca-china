// ============================================================
// QUIZ-GENERATOR nâng cao — Tình huống thực tế HSK 1-3
// ============================================================

import { generateGrammarQuizQuestions, isGrammarQuizType } from './grammar-quiz.js';

export { isGrammarQuizType };

// ─── Tình huống thực tế HSK 1-3 ──────────────────────────
const SCENARIO_QUESTIONS = [
  // HSK 1 - Greetings & Introduction
  {type:'fill_blank',question:'Bạn gặp bạn mới, bạn nói: "你___！" (Chào bạn!)',options:['好','大','小','不'],correctIndex:0,hskLevel:1,explanation:'你好 (nǐ hǎo) = Xin chào. Câu chào cơ bản nhất.'},
  {type:'fill_blank',question:'Bạn muốn hỏi tên người đối diện: "你叫什么___？"',options:['名字','朋友','老师','学生'],correctIndex:0,hskLevel:1,explanation:'名字 (míngzì) = Tên. 你叫什么名字 = Bạn tên gì?'},
  {type:'fill_blank',question:'Trả lời "Cảm ơn", bạn nói: "不___。" (Không có gì)',options:['客气','谢谢','对不起','没关系'],correctIndex:0,hskLevel:1,explanation:'不客气 (bú kèqì) = Không có gì / Không khách sáo.'},
  {type:'fill_blank',question:'Buổi sáng gặp ai đó, bạn chào: "早上___。"',options:['好','再见','谢谢','晚安'],correctIndex:0,hskLevel:1,explanation:'早上好 (zǎoshang hǎo) = Chào buổi sáng.'},
  {type:'fill_blank',question:'Muốn nói "Tôi là người Việt Nam": "我___越南人。"',options:['是','不','有','在'],correctIndex:0,hskLevel:1,explanation:'是 (shì) = Là. 我是越南人 = Tôi là người Việt Nam.'},
  {type:'fill_blank',question:'Hỏi quốc tịch: "你___哪国人？"',options:['是','叫','有','在'],correctIndex:0,hskLevel:1,explanation:'你是哪国人？= Bạn là người nước nào?'},
  {type:'fill_blank',question:'Muốn nói "Tôi không phải học sinh": "我不___学生。"',options:['是','好','有','在'],correctIndex:0,hskLevel:1,explanation:'不是 = không phải. Dùng 不 để phủ định 是.'},
  {type:'fill_blank',question:'Hỏi thăm sức khỏe: "你___吗？"',options:['好','大','忙','累'],correctIndex:0,hskLevel:1,explanation:'你好吗？(Nǐ hǎo ma?) = Bạn khỏe không?'},
  {type:'fill_blank',question:'Giới thiệu bản thân: "我___小明。"',options:['叫','是','有','在'],correctIndex:0,hskLevel:1,explanation:'我叫 (wǒ jiào) = Tôi tên là. Dùng 叫 để nói tên.'},
  {type:'fill_blank',question:'Chia tay: "明天___！" (Hẹn mai gặp)',options:['见','再见','看','会'],correctIndex:0,hskLevel:1,explanation:'明天见 (míngtiān jiàn) = Hẹn mai gặp.'},

  // HSK 1 - Shopping & Numbers
  {type:'fill_blank',question:'Ở cửa hàng, hỏi giá: "这个多少___？"',options:['钱','贵','便宜','块'],correctIndex:0,hskLevel:1,explanation:'多少钱 = bao nhiêu tiền.'},
  {type:'fill_blank',question:'Nói giá: "___块钱。" (Mười tệ)',options:['十','一','五','三'],correctIndex:0,hskLevel:1,explanation:'十 (shí) = Mười. 十块钱 = 10 tệ.'},
  {type:'fill_blank',question:'Muốn mua táo: "我想买___。"',options:['苹果','香蕉','西瓜','葡萄'],correctIndex:0,hskLevel:1,explanation:'苹果 (píngguǒ) = Táo.'},
  {type:'fill_blank',question:'Khen đồ rẻ: "很___。"',options:['便宜','贵','好','多'],correctIndex:0,hskLevel:1,explanation:'便宜 (piányi) = Rẻ. 很便宜 = rất rẻ.'},
  {type:'fill_blank',question:'Chê đồ đắt: "太___了。"',options:['贵','便宜','大','小'],correctIndex:0,hskLevel:1,explanation:'太贵了 (tài guì le) = Đắt quá.'},
  {type:'char_to_meaning',question:'买',options:['Mua','Bán','Tặng','Mượn'],correctIndex:0,hskLevel:1,explanation:'买 (mǎi) = Mua. 卖 (mài) = Bán.'},
  {type:'char_to_meaning',question:'多',options:['Nhiều','Ít','Lớn','Nhỏ'],correctIndex:0,hskLevel:1,explanation:'多 (duō) = Nhiều. 很多 = rất nhiều.'},
  {type:'char_to_meaning',question:'少',options:['Nhiều','Ít','Lớn','Nhỏ'],correctIndex:0,hskLevel:1,explanation:'少 (shǎo) = Ít. 很少 = rất ít.'},

  // HSK 1 - Daily Life
  {type:'fill_blank',question:'Hỏi giờ: "现在___点？"',options:['几','多','什','怎'],correctIndex:0,hskLevel:1,explanation:'几 (jǐ) = Mấy. 现在几点了？= Bây giờ mấy giờ?'},
  {type:'fill_blank',question:'Nói giờ: "___点半。" (8 rưỡi)',options:['八','七','九','六'],correctIndex:0,hskLevel:1,explanation:'八点 (bā diǎn) = 8 giờ. '},
  {type:'fill_blank',question:'Hỏi tuổi: "你___岁？"',options:['几','多','很','太'],correctIndex:0,hskLevel:1,explanation:'几岁 = mấy tuổi. Hỏi tuổi trẻ em.'},
  {type:'fill_blank',question:'Hôm nay thứ mấy: "今天星期___？"',options:['几','一','天','号'],correctIndex:0,hskLevel:1,explanation:'星期几 = thứ mấy. 星期一 = thứ hai.'},
  {type:'fill_blank',question:'Hỏi thời tiết: "今天天气___？"',options:['怎么样','什么','几','谁'],correctIndex:0,hskLevel:1,explanation:'天气怎么样 = thời tiết thế nào.'},
  {type:'fill_blank',question:'Nói trời nóng: "今天很___。"',options:['热','冷','好','大'],correctIndex:0,hskLevel:1,explanation:'热 (rè) = Nóng. 冷 (lěng) = Lạnh.'},
  {type:'fill_blank',question:'Ở nhà hàng gọi món: "我要___咖啡。"',options:['喝','吃','买','看'],correctIndex:0,hskLevel:1,explanation:'喝咖啡 (hē kāfēi) = uống cà phê. 吃 = ăn.'},
  {type:'fill_blank',question:'Nói "Tôi thích mèo": "我喜欢___。"',options:['猫','狗','鱼','鸟'],correctIndex:0,hskLevel:1,explanation:'猫 (māo) = Mèo. 喜欢 = thích.'},

  // HSK 2 - Directions & Transport
  {type:'fill_blank',question:'Hỏi đường: "请问，___在哪儿？"',options:['火车站','学校','医院','商店'],correctIndex:0,hskLevel:2,explanation:'火车站 (huǒchēzhàn) = Ga tàu hỏa. Dùng 请问 để hỏi lịch sự.'},
  {type:'fill_blank',question:'Hỏi vị trí: "厕所在___？" (ở đâu)',options:['哪里','什么','谁','几'],correctIndex:0,hskLevel:2,explanation:'哪里 = ở đâu. 请问厕所在哪里 = Cho hỏi WC ở đâu.'},
  {type:'fill_blank',question:'Chỉ đường: "往前走，然后___左。"',options:['拐','转','走','去'],correctIndex:0,hskLevel:2,explanation:'拐 (guǎi) = Rẽ. 往左拐 = rẽ trái.'},
  {type:'fill_blank',question:'Đi xe buýt: "坐___路公交车。"',options:['几','多','什','哪'],correctIndex:0,hskLevel:2,explanation:'几路 = tuyến số mấy. 坐几路公交车 = đi xe bus tuyến nào.'},
  {type:'fill_blank',question:'Mua vé tàu: "我想___一张票。"',options:['买','卖','看','给'],correctIndex:0,hskLevel:2,explanation:'买票 = mua vé. 一张票 = một vé.'},
  {type:'fill_blank',question:'Hỏi giá vé: "多少钱一___？"',options:['张','个','只','条'],correctIndex:0,hskLevel:2,explanation:'一张 = một tờ (vé). 多少钱一张 = bao nhiêu một vé.'},
  {type:'fill_blank',question:'Bị lạc đường: "我___路了。"',options:['迷','走','找','看'],correctIndex:0,hskLevel:2,explanation:'迷路 (mílù) = Lạc đường.'},
  {type:'fill_blank',question:'Gọi taxi: "请___我到机场。"',options:['送','带','开','坐'],correctIndex:0,hskLevel:2,explanation:'送 (sòng) = Đưa/tiễn. 请送我 = làm ơn đưa tôi.'},

  // HSK 2 - Food & Restaurant
  {type:'fill_blank',question:'Vào quán ăn: "请问有___吗？" (chỗ trống)',options:['座位','位置','地方','房间'],correctIndex:0,hskLevel:2,explanation:'座位 (zuòwèi) = Chỗ ngồi.'},
  {type:'fill_blank',question:'Gọi món: "我___这个菜。"',options:['要','想','吃','买'],correctIndex:0,hskLevel:2,explanation:'我要这个 = tôi muốn món này.'},
  {type:'fill_blank',question:'Khen món ngon: "这个菜很好___。"',options:['吃','喝','看','听'],correctIndex:0,hskLevel:2,explanation:'好吃 (hǎochī) = Ngon (thức ăn).'},
  {type:'fill_blank',question:'Thanh toán: "请___钱。"',options:['付','给','拿','找'],correctIndex:0,hskLevel:2,explanation:'付钱 (fù qián) = Trả tiền. 买单 = tính tiền.'},
  {type:'fill_blank',question:'Nói "No rồi": "我吃___了。"',options:['饱','好','完','过'],correctIndex:0,hskLevel:2,explanation:'吃饱 (chī bǎo) = Ăn no.'},
  {type:'fill_blank',question:'Gọi thêm nước: "再来一___水。"',options:['杯','碗','瓶','盘'],correctIndex:0,hskLevel:2,explanation:'一杯水 = một cốc nước. 碗 = bát.'},

  // HSK 2 - Daily Activities
  {type:'fill_blank',question:'Hỏi ngày: "今天___月几号？"',options:['几','多','什','怎'],correctIndex:0,hskLevel:2,explanation:'几月几号 = tháng mấy ngày mấy.'},
  {type:'fill_blank',question:'Hẹn bạn: "我们___去看电影吧。"',options:['一起','一起','都','也'],correctIndex:0,hskLevel:2,explanation:'一起 (yīqǐ) = Cùng nhau.'},
  {type:'fill_blank',question:'Nói "Tôi bận": "我很___。"',options:['忙','累','快','慢'],correctIndex:0,hskLevel:2,explanation:'忙 (máng) = Bận. 我很忙 = Tôi rất bận.'},
  {type:'fill_blank',question:'Hỏi bạn có rảnh không: "你有___吗？"',options:['时间','时候','时间','地方'],correctIndex:0,hskLevel:2,explanation:'时间 (shíjiān) = Thời gian. 有时间吗 = có thời gian không.'},
  {type:'fill_blank',question:'Xin lỗi đến muộn: "___，我来晚了。"',options:['对不起','谢谢','没关系','你好'],correctIndex:0,hskLevel:2,explanation:'对不起 (duìbuqǐ) = Xin lỗi.'},

  // HSK 3 - Travel & Experiences
  {type:'fill_blank',question:'Hỏi kinh nghiệm: "你去过北京___？"',options:['吗','了','的','吧'],correctIndex:0,hskLevel:3,explanation:'去过 (qù guo) = đã từng đi. 吗 = câu hỏi.'},
  {type:'fill_blank',question:'Nói đã từng: "我___去过上海。"',options:['曾经','已经','以前','从来'],correctIndex:0,hskLevel:3,explanation:'曾经 (céngjīng) = Đã từng. Từ vựng HSK 3.'},
  {type:'fill_blank',question:'Đặt phòng: "我___一个房间。"',options:['订','定','打','买'],correctIndex:0,hskLevel:3,explanation:'订 (dìng) = Đặt. 订房间 = đặt phòng.'},
  {type:'fill_blank',question:'Hỏi có phòng trống không: "还有___吗？"',options:['空房','房间','房子','地方'],correctIndex:0,hskLevel:3,explanation:'空房 (kòngfáng) = Phòng trống.'},
  {type:'fill_blank',question:'Check-in: "请出示护___。"',options:['照','证','件','册'],correctIndex:0,hskLevel:3,explanation:'护照 (hùzhào) = Hộ chiếu.'},
  {type:'fill_blank',question:'Hỏi đường đến bảo tàng: "请问博物馆怎么___？"',options:['走','去','到','来'],correctIndex:0,hskLevel:3,explanation:'怎么走 = đi thế nào. Câu hỏi đường đi.'},
  {type:'fill_blank',question:'Mua quà lưu niệm: "我想买___礼物。"',options:['纪念品','东西','商品','特产'],correctIndex:0,hskLevel:3,explanation:'纪念品 (jìniànpǐn) = Quà lưu niệm.'},
  {type:'fill_blank',question:'Chụp ảnh: "可以帮我拍___吗？"',options:['照片','照相','相机','图片'],correctIndex:0,hskLevel:3,explanation:'照片 (zhàopiàn) = Ảnh. Helzo chụp ảnh.'},

  // HSK 3 - Feelings & Health
  {type:'fill_blank',question:'Đau đầu: "我头___。"',options:['疼','痛','病','药'],correctIndex:0,hskLevel:3,explanation:'头疼 (tóuténg) = Đau đầu.'},
  {type:'fill_blank',question:'Bị cảm: "我___了。"',options:['感冒','发烧','咳嗽','生病'],correctIndex:0,hskLevel:3,explanation:'感冒 (gǎnmào) = Bị cảm.'},
  {type:'fill_blank',question:'Lo lắng: "我很___。"',options:['担心','高兴','难过','生气'],correctIndex:0,hskLevel:3,explanation:'担心 (dānxīn) = Lo lắng.'},
  {type:'fill_blank',question:'Vui vẻ: "我今天很___。"',options:['开心','难过','生气','着急'],correctIndex:0,hskLevel:3,explanation:'开心 (kāixīn) = Vui vẻ.'},
  {type:'fill_blank',question:'Buồn: "听到这个消息，我很___。"',options:['难过','开心','高兴','满意'],correctIndex:0,hskLevel:3,explanation:'难过 (nánguò) = Buồn.'},
  {type:'fill_blank',question:'Khám bệnh: "医生，我___不舒服。"',options:['感觉','觉得','知道','认为'],correctIndex:0,hskLevel:3,explanation:'感觉 (gǎnjué) = Cảm thấy.'},
  {type:'fill_blank',question:'Uống thuốc: "请按时吃___。"',options:['药','饭','菜','水'],correctIndex:0,hskLevel:3,explanation:'吃药 (chī yào) = Uống thuốc.'},

  // HSK 3 - Work & Study
  {type:'fill_blank',question:'Hỏi nghề nghiệp: "你做什么___？"',options:['工作','事情','作业','工'],correctIndex:0,hskLevel:3,explanation:'工作 (gōngzuò) = Công việc.'},
  {type:'fill_blank',question:'Học tiếng Trung: "我在学___。"',options:['中文','英文','汉语','日文'],correctIndex:0,hskLevel:3,explanation:'中文 (Zhōngwén) = Tiếng Trung.'},
  {type:'fill_blank',question:'Thi: "明天有___。"',options:['考试','比赛','测试','验'],correctIndex:0,hskLevel:3,explanation:'考试 (kǎoshì) = Thi/Kỳ thi.'},
  {type:'fill_blank',question:'Cố gắng: "我会___学习的。"',options:['努力','认真','加油','用功'],correctIndex:0,hskLevel:3,explanation:'努力 (nǔlì) = Cố gắng.'},
  {type:'fill_blank',question:'Hoàn thành: "作业___了吗？"',options:['完成','做好','做','完'],correctIndex:0,hskLevel:3,explanation:'完成 (wánchéng) = Hoàn thành.'},
  {type:'fill_blank',question:'Xin nghỉ: "我想___一天假。"',options:['请','放','休','放'],correctIndex:0,hskLevel:3,explanation:'请假 (qǐngjià) = Xin nghỉ phép.'},
];

function dedupeQuestions(questions) {
  const seen = new Set();
  const out = [];
  questions.forEach((q) => {
    const key = `${q.type}|${q.hskLevel}|${q.question}|${q.options?.join('|') || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  });
  return out;
}

function buildFillBlank(question, correct, candidates, hskLevel, explanation) {
  const wrong = shuffle(candidates.filter(x => x !== correct)).slice(0, 3);
  if (wrong.length < 3) return null;
  const options = shuffle([correct, ...wrong]);
  return {
    type: 'fill_blank',
    question,
    options,
    correctIndex: options.indexOf(correct),
    hskLevel,
    explanation,
  };
}

function generateScenarioQuestions(target = 2000) {
  const generated = [];
  const names = ['小明', '小红', '李老师', '王先生', '陈同学', '前台', '服务员', '同事', '邻居', '司机', '店员', '快递员', '客户', '经理', '同学', '张医生', '刘阿姨', '赵叔叔'];
  const places = ['公司', '学校', '饭店', '地铁站', '医院', '超市', '银行', '公园', '机场', '酒店', '药店', '快递站', '会议室', '咖啡店', '图书馆', '公交站', '火车站', '商场', '电影院', '健身房', '邮局'];
  const foods = ['咖啡', '茶', '米饭', '面条', '饺子', '水果', '牛奶', '面包', '汤', '米线', '包子', '饼干', '鸡蛋', '蛋糕', '可乐'];
  const feelings = ['高兴', '担心', '难过', '着急', '开心', '紧张', '累', '忙', '满意', '生气', '害怕', '放心'];
  const services = ['预约', '退房', '付款', '改期', '确认', '回复', '取件', '登记', '买单', '问路'];
  const transport = ['地铁', '出租车', '公交车', '火车', '飞机', '共享单车'];
  const times = ['今天', '明天', '昨天', '下午', '晚上', '早上', '周末', '下个月'];
  const objects = ['手机', '钱包', '护照', '行李', '钥匙', '电脑', '书', '雨伞', '外套', '眼镜'];
  const activities = ['看书', '跑步', '游泳', '唱歌', '画画', '做饭', '看电影', '逛街', '打篮球', '弹钢琴'];
  const adjectives = ['好', '大', '小', '贵', '便宜', '远', '近', '快', '慢', '新', '旧', '干净', '漂亮', '方便'];
  const bodyParts = ['头', '肚子', '腿', '嗓子', '眼睛', '牙'];
  const weathers = ['热', '冷', '下雨', '下雪', '晴天', '刮风'];

  const contexts = [
    'ở quán ăn', 'ở công ty', 'ở trường', 'khi đi tàu điện', 'khi mua sắm',
    'khi gọi điện', 'khi gặp khách', 'khi du lịch', 'ở sân bay', 'ở khách sạn',
    'ở bệnh viện', 'ở ngân hàng', 'ở bưu điện', 'ở hiệu thuốc', 'ở siêu thị',
    'ở ga tàu', 'ở bến xe', 'ở văn phòng', 'trong lớp học', 'khi phỏng vấn',
    'khi họp nhóm', 'khi đặt lịch', 'khi giao hàng', 'khi khiếu nại dịch vụ',
    'khi chờ thanh toán', 'khi gọi món', 'khi hỏi đường', 'khi check-in',
    'khi xin nghỉ', 'khi xử lý hiểu lầm', 'khi làm việc với đồng nghiệp',
    'khi nhắn tin online', 'khi gọi video', 'khi đặt xe', 'khi chuyển khoản',
    'khi mượn đồ', 'khi trả đồ', 'khi hỏi giá', 'khi thương lượng',
    'khi bắt đầu ca làm', 'khi kết thúc ca làm', 'khi hẹn gặp bạn',
    'khi đi khám', 'khi mua vé', 'khi đổi lịch', 'khi xác nhận thông tin',
    'khi học nhóm', 'khi luyện nói', 'khi tham gia sự kiện', 'khi hỏi lễ tân',
    'khi nói chuyện với hàng xóm', 'khi chăm người bệnh', 'khi hỏi chuyến bay',
    'khi check lịch tàu', 'khi làm thủ tục trả phòng', 'khi nhận hàng online',
    'khi đổi trả sản phẩm', 'khi gọi tổng đài', 'khi hỗ trợ khách',
    'khi hỏi wifi', 'khi tìm đồ thất lạc', 'khi gửi bưu phẩm',
    'khi xin giảm giá', 'khi hỏi giờ mở cửa', 'khi phản ánh chất lượng',
  ];

  // ═══ HSK 1: Chào hỏi — nhiều vị trí ═══
  names.forEach((name) => {
    // Blank ở CUỐI
    generated.push(buildFillBlank(`${name} gặp bạn mới: "你___！"`, '好', ['好', '大', '小', '冷', '热'], 1, '你好 = Xin chào.'));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} tự giới thiệu: "___叫${name}。"`, '我', ['我', '你', '他', '她', '谁'], 1, '我叫... = Tôi tên là...'));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`${name} hỏi tên: "你___什么名字？"`, '叫', ['叫', '是', '有', '在', '看'], 1, '你叫什么名字？ = Bạn tên gì?'));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`${name} xin lỗi: "对不起，我来___了。"`, '晚', ['晚', '早', '好', '快'], 2, '来晚了 = đến muộn.'));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} đáp lại lời cảm ơn: "___客气。"`, '不', ['不', '很', '太', '都'], 1, '不客气 = Không có gì.'));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`${name} hỏi quốc tịch: "你是___国人？"`, '哪', ['哪', '什', '几', '这'], 1, '哪国人 = người nước nào.'));
  });

  // ═══ HSK 1-2: Mua sắm — nhiều cấu trúc ═══
  places.forEach((place) => {
    // Blank ở GIỮA (在 ở giữa)
    generated.push(buildFillBlank(`Nói vị trí: "我___${place}。"`, '在', ['在', '是', '有', '去', '来'], 1, '在 + địa điểm = ở tại.'));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Hỏi đường: "请问，${place}在___？"`, '哪儿', ['哪儿', '什么', '谁', '几', '怎么'], 2, '哪儿 = ở đâu.'));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Diễn đạt kế hoạch: "___我去${place}。"`, '明天', times, 2, '明天 = ngày mai. Thời gian đứng đầu câu.'));
    // Blank ở GIỮA (动词)
    generated.push(buildFillBlank(`Nói hành động: "我___${place}了。"`, '去', ['去', '吃', '是', '有', '在'], 2, '去 = đi. 我去了 = tôi đã đi.'));
    // Blank ở CUỐI (怎么走)
    generated.push(buildFillBlank(`Hỏi cách đi: "${place}怎么___？"`, '走', ['走', '去', '来', '到', '坐'], 2, '怎么走 = đi như thế nào.'));
    // Blank ở ĐẦU (从)
    generated.push(buildFillBlank(`Nói điểm xuất phát: "___${place}到机场要多久？"`, '从', ['从', '在', '去', '到', '往'], 3, '从...到... = từ...đến...'));
  });

  // ═══ HSK 1-2: Ăn uống — đa dạng vị trí ═══
  foods.forEach((food) => {
    const verb = ['咖啡', '茶', '牛奶', '可乐'].includes(food) ? '喝' : '吃';
    const otherVerb = verb === '喝' ? '吃' : '喝';
    // Blank ở GIỮA (động từ)
    generated.push(buildFillBlank(`Gọi món: "我想___${food}。"`, verb, ['吃', '喝', '买', '看', '学'], 1, `${verb === '喝' ? '喝 dùng cho đồ uống' : '吃 dùng cho đồ ăn'}.`));
    // Blank ở CUỐI (好吃/好喝)
    const taste = verb === '喝' ? '好喝' : '好吃';
    generated.push(buildFillBlank(`Khen ngon: "这个${food}很___。"`, taste, ['好吃', '好喝', '好看', '好玩', '好学'], 2, `${taste} = ngon.`));
    // Blank ở ĐẦU (再来)
    generated.push(buildFillBlank(`Gọi thêm: "___来一份${food}。"`, '再', ['再', '不', '没', '很', '太'], 2, '再来 = gọi thêm.'));
    // Blank ở CUỐI (多少钱)
    generated.push(buildFillBlank(`Hỏi giá ${food}: "这个${food}多少___？"`, '钱', ['钱', '块', '元', '瓶'], 1, '多少钱 = bao nhiêu tiền.'));
    // Blank ở GIỮA (要不要)
    generated.push(buildFillBlank(`Mời bạn: "你要不___${food}？"`, '要', ['要', '想', '会', '能', '可以'], 2, '要不要 = có muốn không.'));
    // Blank ở GIỮA (量词)
    const mw = ['咖啡', '茶', '牛奶', '可乐'].includes(food) ? '杯' : '碗';
    generated.push(buildFillBlank(`Đặt số lượng: "两___${food}。"`, mw, ['杯', '碗', '盘', '瓶', '个'], 2, `${mw} = lượng từ phù hợp cho ${food}.`));
  });

  // ═══ HSK 2: Giao thông — đa dạng ═══
  transport.forEach((item) => {
    // Blank ở GIỮA (坐___去)
    generated.push(buildFillBlank(`Đi lại: "我坐___去上班。"`, item, transport, 2, 'Phương tiện đi lại.'));
    // Blank ở CUỐI (方便吗)
    generated.push(buildFillBlank(`Hỏi phương tiện: "坐${item}___吗？"`, '方便', ['方便', '快', '远', '贵', '好'], 2, '方便 = tiện lợi.'));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Thời gian di chuyển: "___${item}要多长时间？"`, '坐', ['坐', '开', '骑', '走', '跑'], 2, '坐 = ngồi (đi phương tiện).'));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Hỏi tuyến: "这个${item}___哪里？"`, '到', ['到', '去', '在', '从', '往'], 2, '到 = đến.'));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`So sánh: "坐${item}比坐公交车___。"`, '快', ['快', '慢', '贵', '便宜', '远'], 3, 'A比B + tính từ = so sánh.'));
  });

  // ═══ HSK 2-3: Dịch vụ — nhiều cấu trúc ═══
  services.forEach((sv) => {
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Dịch vụ: "我想___一下。"`, sv, [...services, '学习', '休息'], 2, `${sv} = cụm giao tiếp thường dùng.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Yêu cầu: "请帮我___。"`, sv, [...services, '学习', '休息', '检查'], 2, `请帮我 + hành động = nhờ giúp.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Xác nhận: "___已经完成了。"`, sv, [...services, '准备', '安排'], 3, `${sv}已经完成了 = đã hoàn thành.`));
  });

  // ═══ HSK 2-3: Cảm xúc + Sức khỏe — đa dạng vị trí ═══
  names.forEach((name) => {
    // Cảm xúc — Blank ở CUỐI
    feelings.forEach((f) => {
      generated.push(buildFillBlank(`${name} nói cảm xúc: "我很___。"`, f, feelings, 3, 'Mẫu câu cảm xúc.'));
    });
    // Cảm xúc — Blank ở GIỮA
    generated.push(buildFillBlank(`${name} giải thích lý do: "因为下雨，所以我很___。"`, '担心', feelings, 3, '因为...所以... = vì...nên...'));
    // Cảm xúc — Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} hỏi bạn: "你___不高兴？"`, '为什么', ['为什么', '什么', '怎么', '哪里', '谁'], 3, '为什么 = tại sao.'));

    // Xin phép — Blank ở GIỮA
    generated.push(buildFillBlank(`${name} xin phép: "我___进来吗？"`, '可以', ['可以', '会', '是', '在', '有'], 3, '可以 = có thể (xin phép).'));
    // Đang làm — Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} đang bận: "___在工作，等一下。"`, '我', ['我', '你', '他', '她', '我们'], 3, '正在/在 + V = đang làm.'));
    // Nhờ giúp — Blank ở CUỐI
    generated.push(buildFillBlank(`${name} nhờ giúp: "请你帮助___。"`, '我', ['我', '你', '他', '她', '他们'], 2, '帮助我 = giúp tôi.'));
    // Liên lạc — Blank ở GIỮA
    generated.push(buildFillBlank(`${name} liên lạc: "请你___我。"`, '联系', ['联系', '帮助', '告诉', '提醒', '等待'], 3, '联系 = liên lạc.'));
    // Xác nhận — Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} xác nhận: "___确认一下地址。"`, '请', ['请', '我', '你', '他', '别'], 3, '请 = xin hãy (lịch sự).'));
  });

  // ═══ HSK 2-3: Sức khỏe — đau ốm ═══
  bodyParts.forEach((part) => {
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Nói đau: "我${part}___。"`, '疼', ['疼', '好', '大', '红', '热'], 3, `${part}疼 = đau ${part}.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Kể bệnh cho bác sĩ: "___${part}疼了两天了。"`, '我', ['我', '你', '他', '她', '我们'], 3, '我...疼了两天了 = tôi đau...hai ngày rồi.'));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Hỏi bệnh: "你___不舒服？"`, '哪里', ['哪里', '什么', '怎么', '为什么', '几'], 2, '哪里不舒服 = đau ở đâu.'));
  });

  // ═══ HSK 1-3: Thời tiết — đa dạng ═══
  weathers.forEach((w) => {
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Nói thời tiết: "今天很___。"`, w, weathers, 1, `${w} = thời tiết.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Dự báo: "___会下雨。"`, '明天', times, 2, '明天会下雨 = ngày mai sẽ mưa.'));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`So sánh: "今天比昨天___。"`, w, weathers, 3, '今天比昨天 + adj = hôm nay hơn hôm qua.'));
  });

  // ═══ HSK 1-2: Thời gian — vị trí đa dạng ═══
  times.forEach((t) => {
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Nói kế hoạch: "___我去超市。"`, t, times, 1, `${t} = thời gian.`));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Hỏi lịch: "你___有空吗？"`, t, times, 2, `你${t}有空吗 = bạn ${t} rảnh không.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Hẹn lịch: "我们${t}___吧。"`, '见面', ['见面', '吃饭', '上课', '开会', '休息'], 2, `见面 = gặp mặt.`));
  });

  // ═══ HSK 1-2: Đồ vật bị mất/tìm ═══
  objects.forEach((obj) => {
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Tìm đồ: "___的${obj}在哪儿？"`, '我', ['我', '你', '他', '她', '谁'], 1, `我的${obj} = ...của tôi.`));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Hỏi ai lấy: "谁___了我的${obj}？"`, '拿', ['拿', '看', '买', '用', '给'], 2, `拿 = lấy.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Tìm thấy: "我的${obj}在桌子___。"`, '上', ['上', '下', '里', '旁边', '前'], 1, `桌子上 = trên bàn.`));
    // Blank ở GIỮA (忘了带)
    generated.push(buildFillBlank(`Quên đồ: "我___带${obj}了。"`, '忘了', ['忘了', '想要', '可以', '已经', '刚才'], 3, `忘了带 = quên mang theo.`));
  });

  // ═══ HSK 2-3: Sở thích hoạt động ═══
  activities.forEach((act) => {
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Nói sở thích: "我喜欢___。"`, act, activities, 1, `喜欢 + V = thích làm gì.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Rủ bạn: "___一起去${act}吧！"`, '我们', ['我们', '你们', '他们', '大家', '咱们'], 2, `我们一起 = chúng ta cùng nhau.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Thói quen: "我每天都___。"`, act, activities, 2, `每天都 = mỗi ngày đều.`));
    // Blank ở GIỮA (频率)
    generated.push(buildFillBlank(`Tần suất: "我___${act}。"`, '经常', ['经常', '很少', '从来不', '有时候', '每天'], 2, `经常 = thường xuyên.`));
  });

  // ═══ HSK 2-3: Mua sắm online + cửa hàng ═══
  objects.forEach((obj) => {
    // Blank ở ĐẦU (想)
    generated.push(buildFillBlank(`Mua đồ: "我___买一个${obj}。"`, '想', ['想', '在', '会', '是', '有'], 1, `想买 = muốn mua.`));
    // Blank ở GIỮA (太...了)
    generated.push(buildFillBlank(`Chê đắt: "这个${obj}太___了。"`, '贵', adjectives, 1, `太...了 = quá...`));
    // Blank ở CUỐI (便宜一点)
    generated.push(buildFillBlank(`Trả giá: "可以___一点吗？"`, '便宜', ['便宜', '贵', '快', '慢', '多'], 2, `便宜一点 = rẻ hơn một chút.`));
    // Blank ở GIỮA (有没有)
    generated.push(buildFillBlank(`Hỏi hàng: "你们有没___${obj}？"`, '有', ['有', '是', '在', '买', '卖'], 2, `有没有 = có...không.`));
  });

  // ═══ HSK 2-3: Gọi điện thoại ═══
  names.forEach((name) => {
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Gọi điện: "___，请问${name}在吗？"`, '喂', ['喂', '你好', '请问', '对不起', '谢谢'], 2, `喂 = Alô (điện thoại).`));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Nhắn tin: "请你___${name}回电话。"`, '告诉', ['告诉', '帮助', '联系', '问', '看'], 3, `告诉 = nói cho.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Kết thúc: "好的，那我们电话里___。"`, '再见', ['再见', '你好', '谢谢', '对不起', '没关系'], 2, `电话里再见 = tạm biệt qua điện thoại.`));
  });

  // ═══ HSK 2-3: Hẹn lịch + Đặt phòng ═══
  places.forEach((place) => {
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Đặt chỗ: "我想___一个位子。"`, '预约', services, 2, `预约 = đặt trước.`));
    // Blank ở ĐẦU  
    generated.push(buildFillBlank(`Xác nhận: "___时候到${place}？"`, '什么', ['什么', '几', '哪', '多', '怎么'], 2, `什么时候 = khi nào.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Hủy lịch: "我想取消在${place}的___。"`, '预约', ['预约', '订单', '安排', '计划', '行程'], 3, `取消预约 = hủy đặt.`));
  });

  // ═══ HSK 1-3: Hỏi đường chi tiết ═══
  ['左', '右', '前'].forEach((dir) => {
    // Blank ở GIỮA
    generated.push(buildFillBlank(`Chỉ đường: "往___走。"`, dir, ['左', '右', '前', '后', '上'], 2, `往${dir}走 = đi về phía ${dir === '左' ? 'trái' : dir === '右' ? 'phải' : 'trước'}.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`Chỉ đường: "___走到红绿灯再往${dir}拐。"`, '一直', ['一直', '马上', '先', '然后', '已经'], 2, `一直走 = đi thẳng.`));
  });

  // ═══ HSK 2-3: So sánh ═══
  adjectives.forEach((adj) => {
    // Blank ở GIỮA (比)
    generated.push(buildFillBlank(`So sánh: "今天___昨天${adj}。"`, '比', ['比', '和', '跟', '像', '是'], 3, `A比B + adj = A hơn B.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`Hỏi so sánh: "你觉得哪个更___？"`, adj, adjectives, 2, `更 = hơn (nhấn mạnh).`));
    // Blank ở ĐẦU (最)
    generated.push(buildFillBlank(`Nhất: "___${adj}的是这个。"`, '最', ['最', '很', '太', '更', '比'], 2, `最 + adj = nhất.`));
  });

  // ═══ HSK 2-3: Công việc đa dạng ═══
  names.forEach((name) => {
    // Blank ở GIỮA
    generated.push(buildFillBlank(`${name} nói đang bận: "我现在___开会。"`, '在', ['在', '是', '有', '会', '了'], 3, `在 + V = đang làm.`));
    // Blank ở CUỐI
    generated.push(buildFillBlank(`${name} xin nghỉ: "我想请一天___。"`, '假', ['假', '班', '课', '会', '工'], 3, `请假 = xin nghỉ.`));
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} hẹn họp: "___下午两点开会。"`, '明天', times, 2, `明天下午 = chiều mai.`));
    // Blank ở GIỮA (已经...了)
    generated.push(buildFillBlank(`${name} báo cáo: "工作___完成了。"`, '已经', ['已经', '还没', '正在', '刚才', '马上'], 3, `已经...了 = đã...rồi.`));
    // Blank ở CUỐI (做完了)
    generated.push(buildFillBlank(`${name} xong việc: "今天的工作做___了。"`, '完', ['完', '好', '到', '过', '出'], 3, `做完 = làm xong.`));
  });

  // ═══ HSK 1-2: Nhà hàng đa dạng ═══
  foods.forEach((food) => {
    // Blank ở ĐẦU (请)
    generated.push(buildFillBlank(`Nhà hàng: "___给我一份${food}。"`, '请', ['请', '我', '你', '别', '不'], 2, `请给我 = xin cho tôi.`));
    // Blank ở GIỮA (还是)
    const otherFood = foods[(foods.indexOf(food) + 1) % foods.length];
    generated.push(buildFillBlank(`Hỏi chọn: "你要${food}___${otherFood}？"`, '还是', ['还是', '和', '或者', '但是', '因为'], 2, `还是 = hay là (chọn 1).`));
    // Blank ở CUỐI (够了)
    generated.push(buildFillBlank(`Đủ rồi: "${food}___了，谢谢。"`, '够', ['够', '好', '多', '少', '完'], 2, `够了 = đủ rồi.`));
  });

  // ═══ HSK 3: Kinh nghiệm (过) ═══
  activities.forEach((act) => {
    // Blank ở GIỮA (过)
    generated.push(buildFillBlank(`Kinh nghiệm: "你${act}___吗？"`, '过', ['过', '了', '吗', '呢', '吧'], 3, `V过 = đã từng V.`));
    // Blank ở ĐẦU (从来没)
    generated.push(buildFillBlank(`Chưa bao giờ: "我___没${act}过。"`, '从来', ['从来', '已经', '正在', '经常', '一直'], 3, `从来没...过 = chưa bao giờ.`));
  });

  // ═══ HSK 2-3: Lời khuyên + Đề nghị ═══
  names.forEach((name) => {
    // Blank ở ĐẦU
    generated.push(buildFillBlank(`${name} khuyên: "___应该多休息。"`, '你', ['你', '我', '他', '她', '我们'], 2, `应该 = nên.`));
    // Blank ở GIỮA
    generated.push(buildFillBlank(`${name} đề nghị: "我们___去吃饭吧。"`, '一起', ['一起', '已经', '正在', '马上', '一直'], 2, `一起 = cùng nhau.`));
    // Blank ở CUỐI (吧)
    generated.push(buildFillBlank(`${name} rủ: "我们走___。"`, '吧', ['吧', '吗', '呢', '了', '的'], 2, `吧 = nhé (đề nghị).`));
    // Blank ở GIỮA (别)
    generated.push(buildFillBlank(`${name} an ủi: "你___担心，会没事的。"`, '别', ['别', '不', '很', '太', '都'], 3, `别 = đừng.`));
  });

  const seeds = dedupeQuestions([...SCENARIO_QUESTIONS, ...generated].filter(Boolean));
  if (seeds.length >= target) return shuffle(seeds).slice(0, target);

  const expanded = [...seeds];
  let i = 0;
  while (expanded.length < target) {
    const base = seeds[i % seeds.length];
    const ctx = contexts[i % contexts.length];
    expanded.push({
      ...base,
      question: `[${ctx}] ${base.question}`,
      explanation: `${base.explanation} (Bối cảnh: ${ctx})`,
    });
    i += 1;
  }
  return dedupeQuestions(expanded).slice(0, target);
}

// ─── Generator từ vocab-bank ───────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, n, exclude) {
  const pool = arr.filter(x => x !== exclude && String(x).length > 0);
  return shuffle(pool).slice(0, n);
}

function generateQuestionsForWord(word, wordPool) {
  const questions = [];
  const wrongMeanings = pickRandom(wordPool.map(w => w.meaning), 3, word.meaning);
  if (!word.character || wrongMeanings.length < 3) return questions;

  // ── 1. char_to_meaning (original) ──
  const opts1 = shuffle([word.meaning, ...wrongMeanings]);
  questions.push({ type: 'char_to_meaning', question: word.character, options: opts1,
    correctIndex: opts1.indexOf(word.meaning), hskLevel: word.hskLevel,
    explanation: `${word.character} (${word.pinyin}) = ${word.meaning}.` });

  // ── 2. meaning_to_char (original, short words only) ──
  if (word.character.length <= 3) {
    const wrongChars = pickRandom(wordPool.map(w => w.character), 3, word.character);
    if (wrongChars.length === 3) {
      const opts2 = shuffle([word.character, ...wrongChars]);
      questions.push({ type: 'meaning_to_char', question: word.meaning, options: opts2,
        correctIndex: opts2.indexOf(word.character), hskLevel: word.hskLevel,
        explanation: `${word.meaning} = ${word.character} (${word.pinyin}).` });
    }
  }

  // ── 3. context_fill — Điền từ vào câu ví dụ ──
  if (word.exampleSentence && word.exampleSentence.includes(word.character)) {
    const blanked = word.exampleSentence.replace(word.character, '___');
    if (blanked !== word.exampleSentence) {
      const wrongCharsCtx = pickRandom(
        wordPool.filter(w => w.character && w.character.length === word.character.length).map(w => w.character),
        3, word.character
      );
      if (wrongCharsCtx.length >= 3) {
        const opts3 = shuffle([word.character, ...wrongCharsCtx.slice(0, 3)]);
        questions.push({
          type: 'context_fill',
          question: blanked,
          options: opts3,
          correctIndex: opts3.indexOf(word.character),
          hskLevel: word.hskLevel,
          explanation: `${word.exampleSentence}\n${word.examplePinyin || ''}\n${word.exampleVi || ''}\n\n${word.character} (${word.pinyin}) = ${word.meaning}.`,
          hint: word.exampleVi || word.meaning,
        });
      }
    }
  }

  // ── 4. sentence_translate — Dịch câu ví dụ ──
  if (word.exampleSentence && word.exampleVi) {
    const wrongTranslations = pickRandom(
      wordPool.filter(w => w.exampleVi && w.exampleVi !== word.exampleVi).map(w => w.exampleVi),
      3, word.exampleVi
    );
    if (wrongTranslations.length >= 3) {
      const opts4 = shuffle([word.exampleVi, ...wrongTranslations.slice(0, 3)]);
      questions.push({
        type: 'sentence_translate',
        question: word.exampleSentence,
        options: opts4,
        correctIndex: opts4.indexOf(word.exampleVi),
        hskLevel: word.hskLevel,
        explanation: `${word.exampleSentence}\n${word.examplePinyin || ''}\n→ ${word.exampleVi}\n\nTừ chính: ${word.character} (${word.pinyin}) = ${word.meaning}.`,
        pinyin: word.examplePinyin || '',
      });
    }
  }

  // ── 5. pinyin_to_meaning — Từ pinyin chọn nghĩa ──
  if (word.pinyin) {
    const opts5 = shuffle([word.meaning, ...wrongMeanings.slice(0, 3)]);
    questions.push({
      type: 'pinyin_to_meaning',
      question: word.pinyin,
      options: opts5,
      correctIndex: opts5.indexOf(word.meaning),
      hskLevel: word.hskLevel,
      explanation: `${word.pinyin} = ${word.character} = ${word.meaning}.`,
    });
  }

  // ── 6. word_in_context — Tình huống ngữ cảnh ──
  if (word.exampleSentence && word.exampleVi && word.exampleSentence.includes(word.character)) {
    const blankedCtx = word.exampleSentence.replace(word.character, '___');
    if (blankedCtx !== word.exampleSentence) {
      const wrongCharsWic = pickRandom(
        wordPool.filter(w => w.character && w.category === word.category).map(w => w.character),
        3, word.character
      );
      // fallback to any words if same category has too few
      const fallback = wrongCharsWic.length >= 3 ? wrongCharsWic :
        pickRandom(wordPool.map(w => w.character), 3, word.character);
      if (fallback.length >= 3) {
        const opts6 = shuffle([word.character, ...fallback.slice(0, 3)]);
        questions.push({
          type: 'word_in_context',
          question: `${word.exampleVi}\n\n${blankedCtx}`,
          options: opts6,
          correctIndex: opts6.indexOf(word.character),
          hskLevel: word.hskLevel,
          explanation: `${word.exampleSentence}\n${word.examplePinyin || ''}\n→ ${word.exampleVi}\n\n${word.character} (${word.pinyin}) = ${word.meaning}.`,
        });
      }
    }
  }

  // ── 7. example_match — Tìm từ chính trong câu ──
  if (word.exampleSentence && word.character.length >= 2) {
    const wrongWordsMatch = pickRandom(
      wordPool.filter(w => w.character && w.character.length >= 2 && !word.exampleSentence.includes(w.character)).map(w => w.character),
      3, word.character
    );
    if (wrongWordsMatch.length >= 3) {
      const opts7 = shuffle([word.character, ...wrongWordsMatch.slice(0, 3)]);
      questions.push({
        type: 'example_match',
        question: word.exampleSentence,
        options: opts7,
        correctIndex: opts7.indexOf(word.character),
        hskLevel: word.hskLevel,
        explanation: `Câu: ${word.exampleSentence}\n${word.examplePinyin || ''}\n→ ${word.exampleVi || ''}\n\nTừ chính: ${word.character} (${word.pinyin}) = ${word.meaning}.`,
        hint: word.meaning,
      });
    }
  }

  return questions;
}

export async function generateQuizPool(count = 2600) {
  const allQ = [];
  let id = 0;

  // 0. Ngữ pháp, sắp xếp câu, chọn câu sai
  generateGrammarQuizQuestions(1000).forEach(q => {
    allQ.push({ ...q, id: id++, category: 'grammar' });
  });

  // 1. Add scenario questions first (HSK 1-3 focused, 2000 cases)
  generateScenarioQuestions(2000).forEach(q => {
    allQ.push({ ...q, id: id++ });
  });

  // 2. Add themed quiz questions from data.js
  try {
    const data = await import('./data');
    const sets = data.quizSets || [];
    sets.forEach(set => {
      set.questions.forEach(q => {
        allQ.push({ ...q, hskLevel: set.level, id: id++ });
      });
    });
  } catch(e) {}

  // 3. Generate more from vocab-bank
  try {
    const bank = await import('./vocab-bank');
    const bankSets = [bank.hsk1, bank.hsk2, bank.hsk3];
    const words = bankSets.flat().filter(w => w.character && w.pinyin && w.meaning);
    const byLevel = {};
    words.forEach(w => { if (!byLevel[w.hskLevel]) byLevel[w.hskLevel] = []; byLevel[w.hskLevel].push(w); });
    
    const shuffled = shuffle(words);
    for (const word of shuffled) {
      if (allQ.length >= count) break;
      const pool = byLevel[word.hskLevel] || words;
      const qs = generateQuestionsForWord(word, pool);
      qs.forEach(q => { if (allQ.length < count) allQ.push({ ...q, id: id++ }); });
    }
  } catch(e) {}

  return allQ;
}

export function pickRandomQuestions(pool, n = 20) {
  return shuffle(pool).slice(0, Math.min(n, pool.length));
}
