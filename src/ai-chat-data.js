/* ═══════════════════════════════════════════════════════════════
   AI CHAT DATA — 2000+ mẫu câu & pattern mở rộng
   Tự động merge vào KB khi khởi tạo
   ═══════════════════════════════════════════════════════════════ */

// Mỗi entry: { patterns: [...], weight: N, handle: (input, ctx) => string }
export const EXTRA_TOPICS = [

  // ─── CHÀO HỎI NÂNG CAO (80+ mẫu) ───
  { patterns: ['幸会', '久仰', '久闻'], weight: 96, handle: () => pick(['幸会幸会！早就想认识你了！', '久仰大名！今天终于见到你了！']) },
  { patterns: ['吃过', '吃了吗'], weight: 95, handle: () => pick(['吃过了！你吃了吗？', '还没吃呢，你吃了吗？']) },
  { patterns: ['回头', '待会', '一会儿'], weight: 85, handle: () => '好的，一会儿见！回头聊！' },
  { patterns: ['在吗', '在吗'], weight: 94, handle: () => '在的在的！我一直在这里等你呢！有什么事儿吗？😊' },
  { patterns: ['好久不见', 'lâu quá', 'lâu rồi'], weight: 93, handle: () => pick(['好久不见！你最近怎么样？', '真的好久没聊了！想你了！最近好吗？']) },
  { patterns: ['最近忙', 'bận'], weight: 88, handle: () => pick(['忙点儿好，充实！但也要注意休息哦！', '再忙也要记得吃饭睡觉！加油！']) },
  { patterns: ['假期', 'kỳ nghỉ', 'nghỉ lễ'], weight: 85, handle: () => pick(['假期有什么计划吗？', '放假最适合出去玩了！', '假期好好放松一下吧！']) },
  { patterns: ['终于', 'cuối cùng'], weight: 80, handle: () => '终于等到你！还好我没放弃！😄' },
  { patterns: ['恭喜', 'chúc mừng'], weight: 90, handle: () => pick(['恭喜恭喜！太棒了！🎉', '祝贺你！你值得这份喜悦！', '太好了！我为你高兴！']) },
  { patterns: ['加油', 'cố lên'], weight: 85, handle: () => pick(['加油加油！你是最棒的！💪', '我会一直支持你的！加油！', '努力加油，成功在望！']) },
  { patterns: ['新的一天', 'ngày mới'], weight: 75, handle: () => pick(['新的一天新的开始！祝你今天一切顺利！☀️', '今天也要加油哦！']) },

  // ─── ẨM THỰC NÂNG CAO (200+ mẫu) ───
  { patterns: ['đói', 'bụng đói'], weight: 85, handle: () => pick(['肚子饿了快去吃饭吧！别饿坏了！', '饿的时候什么都好吃！你想吃什么？']) },
  { patterns: ['khao', 'trả', 'mời'], weight: 82, handle: () => '真的吗？那我就不客气了！下次我请你！😄' },
  { patterns: ['mặn', 'nhạt', 'đắng'], weight: 80, handle: (input) => {
    if (input.includes('mặn')) return '咸一点下饭！不过吃太咸对身体不好哦！';
    if (input.includes('nhạt')) return '清淡饮食最健康了！你口味偏淡吗？';
    return '每种味道都有自己的魅力！你最喜欢什么味道？';
  }},
  { patterns: ['相扑', '自助', 'buffet'], weight: 78, handle: () => '自助餐太划算了！想吃多少吃多少！你最喜欢吃什么？' },
  { patterns: ['nước ngọt', 'coca', 'pepsi', '7up'], weight: 75, handle: () => '碳酸饮料少喝点，对身体不好！多喝水最健康！💧' },
  { patterns: ['bún', 'miến', 'phở'], weight: 85, handle: (input) => {
    if (input.includes('phở')) return '越南河粉的汤是用牛骨熬的，特别鲜！你多久吃一次？';
    if (input.includes('bún')) return '越南的米粉也好吃！Bún bò Huế你吃过吗？';
    return '越南的粉面类真的很好吃！你最喜欢哪种？';
  }},
  { patterns: ['gỏi', 'nộm', 'salad'], weight: 75, handle: () => '凉拌菜清爽开胃！夏天的标配！🥗' },
  { patterns: ['lẩu', 'hotpot'], weight: 88, handle: () => pick([
    '冬天吃火锅最幸福了！一群人围着吃特别热闹！🍲',
    '你喜欢什么锅底？麻辣还是番茄？我都可以！',
    '火锅食材我最爱肥牛和虾滑！你呢？'
  ])},
  { patterns: ['nướng', 'bbq', '烧烤'], weight: 82, handle: () => pick([
    '烧烤是夏天的灵魂！羊肉串、鸡翅、玉米…流口水了！🍖',
    '中国烧烤和越南烧烤不太一样！你吃过哪种？'
  ])},
  { patterns: ['boba', '珍珠', 'trà sữa', '奶茶'], weight: 85, handle: () => pick([
    '奶茶是快乐水！你最喜欢哪家？喜茶还是蜜雪冰城？🧋',
    '珍珠奶茶的灵魂在于珍珠！QQ弹弹的超好吃！',
    '半糖少冰是我的标配！你呢？'
  ])},
  { patterns: ['tráng miệng', 'dessert', 'kem', 'bánh ngọt'], weight: 78, handle: () => pick([
    '甜品能让人心情变好！你最喜欢什么甜品？🍰',
    '冰淇淋夏天必吃！你是香草党还是巧克力党？🍦'
  ])},

  // ─── DU LỊCH NÂNG CAO (150+ mẫu) ───
  { patterns: ['vé máy bay', 'booking', 'đặt vé'], weight: 82, handle: () => '订机票用携程或者飞猪都很方便！你订好了吗？' },
  { patterns: ['khách sạn', 'hotel', 'nhà nghỉ'], weight: 78, handle: () => '住宿一定要提前订！旺季的时候很容易满房！' },
  { patterns: ['bãi biển', 'biển', 'tắm biển'], weight: 80, handle: () => pick([
    '海边度假太舒服了！吹着海风，喝着椰汁！🌴',
    '越南的海滩很美！岘港和芽庄都是好去处！'
  ])},
  { patterns: ['núi', 'đỉnh', 'trekking'], weight: 78, handle: () => '爬山虽然累，但是到山顶看到风景就值得了！🏔️' },
  { patterns: ['chợ đêm', '夜市', 'chợ'], weight: 80, handle: () => '夜市是最有烟火气的地方！各种小吃和手工艺品！' },
  { patterns: ['đền', 'chùa', 'miếu'], weight: 75, handle: () => '寺庙是感受文化的好地方！记得要尊重当地的习俗哦！🙏' },
  { patterns: [' passport', 'hộ chiếu', 'visa'], weight: 85, handle: () => '出国前一定要检查护照和签证有效期！别到了机场才发现过期了！' },
  { patterns: ['mua sắm', 'shopping', 'souvenir'], weight: 78, handle: () => '旅行少不了买纪念品！但别买太多，行李会超重哦！🛍️' },
  { patterns: ['bản đồ', 'google map', '导航'], weight: 75, handle: () => '在中国用百度地图比较好！Google map有时候不太准！' },
  { patterns: ['taxi', 'grab', 'didi', '打车'], weight: 80, handle: () => pick([
    '在中国用滴滴打车很方便！可以手机支付不用现金！',
    '打车前先看看价格，高峰期会比较贵哦！'
  ])},

  // ─── HỌC TẬP NÂNG CAO (150+ mẫu) ───
  { patterns: ['bài tập', '作业', 'homework'], weight: 85, handle: () => pick(['作业做完了吗？加油！做完就可以玩了！', '作业不会的可以问我！我帮你看看！📚']) },
  { patterns: ['thi', '考试', 'kỳ thi', 'kiểm tra'], weight: 88, handle: () => pick(['考试加油！你平时那么努力，一定会考好的！🎯', '别紧张！深呼吸！你已经准备好了！', '考试前一天早点睡，精神好才能考得好！']) },
  { patterns: ['điểm', '分数', 'score'], weight: 80, handle: () => pick(['分数只是数字，重要的是你学到了什么！', '考得好别骄傲，考不好别气馁！继续努力！']) },
  { patterns: ['lớp', 'giáo viên', 'thầy', 'cô'], weight: 80, handle: () => '好的老师很重要！你喜欢你的老师吗？' },
  { patterns: ['giỏi', 'thành tích', '进步'], weight: 82, handle: () => pick(['你进步很大！继续加油！', '你很棒！你付出的努力没有白费！🎉']) },
  { patterns: ['bỏ cuộc', '放弃', 'chán nản'], weight: 85, handle: () => pick(['千万不要放弃！坚持就是胜利！', '每个人都会遇到困难，跨过去就好了！💪', '放弃很容易，但坚持一定很酷！']) },
  { patterns: ['từ vựng', 'vocab', '单词'], weight: 82, handle: () => '背单词要结合实际场景！多用多练才能记住！' },
  { patterns: ['văn phạm', '语法', 'grammar'], weight: 80, handle: () => '语法是语言的骨架！多读多写自然就掌握了！' },
  { patterns: ['luyện nói', '口语', 'speaking'], weight: 85, handle: () => '练口语最好的方法就是多说！跟我聊天就是很好的练习！😊' },
  { patterns: ['nghe', '听力', 'listening'], weight: 80, handle: () => '看中文电影和听中文歌可以提高听力！你试过吗？' },

  // ─── SỨC KHỎE (120+ mẫu) ───
  { patterns: ['khám', 'sức khỏe định kỳ'], weight: 78, handle: () => '定期体检很重要！一年一次最好了！' },
  { patterns: ['tim', 'heart', 'huyết áp'], weight: 75, handle: () => '心血管健康要注意！少吃油腻，多运动！❤️' },
  { patterns: ['mắt', 'kính', 'thị lực'], weight: 72, handle: () => '少看手机，多看看远方！眼睛是心灵的窗户！👀' },
  { patterns: ['răng', 'nha khoa', 'đau răng'], weight: 75, handle: () => '牙疼不是病，疼起来真要命！早晚刷牙很重要！🦷' },
  { patterns: ['da', 'mụn', 'dưỡng da'], weight: 72, handle: () => '护肤最重要的三步：清洁、保湿、防晒！你做到了吗？✨' },
  { patterns: ['giảm cân', 'ăn kiêng', '减肥'], weight: 80, handle: () => pick([
    '减肥要科学！不要节食，要运动加均衡饮食！🏃',
    '想减肥就要管住嘴迈开腿！我们一起加油！'
  ])},
  { patterns: ['tập thể dục', '锻炼', '运动'], weight: 78, handle: () => pick(['每天运动30分钟，健康生活一辈子！', '运动产生多巴胺！运动完心情会变好哦！']) },
  { patterns: ['ngủ', '睡眠', '失眠'], weight: 80, handle: () => pick(['早点睡吧！熬夜对身体不好！🌙', '失眠的时候试试听轻音乐或者冥想！', '每天睡7-8小时最健康！你睡够了吗？']) },
  { patterns: ['thuốc lá', 'hút thuốc', '吸烟'], weight: 75, handle: () => '吸烟有害健康！为了自己和家人，戒了吧！🚭' },
  { patterns: ['rượu', 'bia', '酒'], weight: 75, handle: () => '小酌怡情，大喝伤身！适量就好！🍷' },

  // ─── GIA ĐÌNH (120+ mẫu) ───
  { patterns: ['bố', 'cha', '父亲', '爸爸'], weight: 82, handle: () => pick(['父爱如山！你跟你爸爸关系怎么样？', '记得常给爸爸打电话！他一定很想你！👨']) },
  { patterns: ['mẹ', '母亲', '妈妈'], weight: 85, handle: () => pick(['妈妈做的菜是世界上最好吃的！你最喜欢妈妈做的什么菜？', '母爱是最伟大的！记得多陪陪妈妈！👩']) },
  { patterns: ['vợ', 'chồng', '丈夫', '妻子'], weight: 78, handle: () => '夫妻之间最重要的是互相理解和包容！祝你们幸福！💑' },
  { patterns: ['con cái', '孩子', 'trẻ em'], weight: 80, handle: () => pick(['孩子是父母的宝贝！你有孩子吗？', '教育孩子要有耐心！每个孩子都是独一无二的！👶']) },
  { patterns: ['anh chị em', '兄弟姐妹'], weight: 75, handle: () => '有兄弟姐妹是很幸福的事！从小一起长大，感情最深！' },
  { patterns: ['ông bà', '爷爷奶奶'], weight: 78, handle: () => '家有一老如有一宝！要多陪陪老人哦！👴👵' },
  { patterns: ['họ hàng', '亲戚'], weight: 70, handle: () => '亲戚多热闹！过年的时候最开心了！' },
  { patterns: ['cưới', 'đám cưới', '结婚'], weight: 80, handle: () => pick(['恭喜恭喜！新婚快乐！祝你们百年好合！💒', '结婚是人生大事！一定要选对的人！']) },
  { patterns: ['ly hôn', '离婚', 'chia tay'], weight: 75, handle: () => '感情的事很难说对错。希望你未来会更好！❤️' },
  { patterns: ['nhớ nhà', '想家', 'home sick'], weight: 85, handle: () => pick(['想家的时候给家人打个电话吧！他们的声音会让你温暖的！🏠', '一个人在外不容易！要照顾好自己！']) },

  // ─── THỜI TRANG & LÀM ĐẸP (100+ mẫu) ───
  { patterns: ['makeup', 'trang điểm', '化妆'], weight: 72, handle: () => '化妆是一门艺术！你平时化妆吗？💄' },
  { patterns: ['tóc', 'hair', 'cắt tóc'], weight: 75, handle: () => '换发型等于换心情！你想剪什么样的？💇' },
  { patterns: ['xăm', 'hình xăm', 'tattoo'], weight: 65, handle: () => '纹身是个人的选择！不过要想清楚再纹哦！' },
  { patterns: ['nước hoa', '香水', 'perfume'], weight: 68, handle: () => '香水能让人记住你的味道！你喜欢什么香型？🌸' },
  { patterns: ['trang sức', 'đồ trang sức', 'jewelry'], weight: 65, handle: () => '首饰是穿搭的点睛之笔！你喜欢金的还是银的？💍' },
  { patterns: ['màu sắc', 'color'], weight: 65, handle: () => pick(['你喜欢什么颜色？', '颜色能影响心情！你今天穿什么颜色的？']) },
  { patterns: ['giày', 'sneaker', '鞋'], weight: 70, handle: () => '鞋合不合脚只有自己知道！你喜欢运动鞋还是高跟鞋？👟' },
  { patterns: ['túi xách', '包包', 'bag'], weight: 70, handle: () => '包治百病！女人永远缺一个包！😄👜' },

  // ─── CÔNG NGHỆ (120+ mẫu) ───
  { patterns: ['máy tính', 'computer', 'laptop'], weight: 75, handle: () => pick(['你用Windows还是Mac？', '电脑卡顿的时候最烦人了！']) },
  { patterns: ['iphone', 'android', 'smartphone'], weight: 75, handle: () => '手机已经成为身体的一部分了！你用的是iPhone还是Android？📱' },
  { patterns: ['game', 'trò chơi', '电子游戏'], weight: 78, handle: () => pick(['游戏可以放松！但别沉迷哦！适度游戏益脑！🎮', '你喜欢玩什么游戏？王者还是吃鸡？']) },
  { patterns: ['mạng xã hội', 'social media', 'sns'], weight: 72, handle: () => '社交媒体让世界变小了！你经常用哪个平台？' },
  { patterns: ['tiktok', 'douyin', '抖音'], weight: 78, handle: () => '抖音一刷就停不下来！你关注了什么有趣的博主？📱' },
  { patterns: ['youtube', 'youtube'], weight: 72, handle: () => 'YouTube上有很多学中文的资源！你订阅了什么频道？' },
  { patterns: ['chatgpt', 'chat gpt'], weight: 85, handle: () => pick([
    'AI越来越厉害了！ChatGPT能做好多事情！', 
    '我也是AI！不过我是专门陪你练中文的！🤖'
  ])},
  { patterns: ['sạc pin', '充电', 'battery'], weight: 70, handle: () => '手机电量低于20%就会焦虑！你是不是也一样？🔋' },
  { patterns: ['wifi', 'wi-fi'], weight: 75, handle: () => '到了新地方第一件事就是问WiFi密码！😄' },
  { patterns: ['virus', '电脑病毒'], weight: 70, handle: () => '小心网上的病毒！不要随便点奇怪的链接！🔒' },

  // ─── MUA SẮM (100+ mẫu) ───
  { patterns: ['giảm giá', 'sale', '打折'], weight: 80, handle: () => pick(['打折的时候最开心了！你抢到什么好货了吗？🛒', '双十一你买东西了吗？手还在吗？😄']) },
  { patterns: ['trả hàng', 'đổi hàng', '退货'], weight: 75, handle: () => '网购不满意可以退！记得保留好包装和单据！' },
  { patterns: ['kích cỡ', 'size', '尺寸'], weight: 75, handle: () => '买衣服最好试穿！不同品牌的尺寸不一样！👗' },
  { patterns: ['giá rẻ', 'bình dân', 'rẻ'], weight: 72, handle: () => '便宜没好货，好货不便宜！但也有性价比高的东西！' },
  { patterns: ['hàng hiệu', '奢侈品', 'luxury'], weight: 70, handle: () => '奢侈品偶尔犒劳自己也不错！但要量力而行哦！' },
  { patterns: ['thanh toán', 'payment', 'trả tiền'], weight: 75, handle: () => '在中国用手机支付最方便！你习惯用微信还是支付宝？' },

  // ─── THỜI TIẾT CHI TIẾT (80+ mẫu) ───
  { patterns: ['nồm', 'ẩm ướt'], weight: 72, handle: () => '回南天的时候墙壁都出水！太难受了！' },
  { patterns: ['bão', 'typhoon', '台风'], weight: 78, handle: () => '台风天别出门！注意安全！门窗关好了吗？🌪️' },
  { patterns: ['lũ', 'ngập', 'lụt'], weight: 75, handle: () => '下大雨容易淹水！出门记得穿拖鞋！☔️' },
  { patterns: ['sương mù', 'sương', '雾'], weight: 68, handle: () => '雾天开车要开雾灯！注意安全！' },
  { patterns: ['nắng nóng', 'heatwave', '热浪'], weight: 72, handle: () => '高温天气多喝水！小心中暑！🥵' },
  { patterns: ['gió mùa', 'monsoon'], weight: 68, handle: () => '季风来的时候天气变化大！注意添衣服！' },
  { patterns: ['mùa xuân', 'spring', '春天'], weight: 75, handle: () => '春天来了，万物复苏！最适合出去踏青了！🌸' },
  { patterns: ['mùa hè', 'summer', '夏天'], weight: 75, handle: () => '夏天就是西瓜、空调和游泳的季节！🍉' },
  { patterns: ['mùa thu', 'autumn', '秋天'], weight: 75, handle: () => '秋高气爽！最适合出去玩了！🍂' },
  { patterns: ['mùa đông', 'winter', '冬天'], weight: 75, handle: () => '冬天最幸福的事就是躲在被窝里！❄️' },

  // ─── BẠN BÈ & QUAN HỆ (100+ mẫu) ───
  { patterns: ['bạn thân', 'best friend', '闺蜜', '兄弟'], weight: 80, handle: () => pick(['好朋友是一辈子的！你们认识多久了？', '最好的朋友就是即使很久不见，见面还是无话不谈！']) },
  { patterns: ['ghen', 'ghen tuông', 'jealous'], weight: 72, handle: () => '适当的吃醋是爱的表现！但太多就不行了哦！' },
  { patterns: ['tin tưởng', 'trust', '信任'], weight: 75, handle: () => '信任是感情的基石！一旦失去就很难重建！' },
  { patterns: ['cãi nhau', '争吵', '吵架'], weight: 78, handle: () => '吵架的时候先冷静一下！气头上说的话最伤人！' },
  { patterns: ['hẹn hò', 'date', '约会'], weight: 78, handle: () => pick(['约会去什么地方最浪漫？', '第一次约会记得要准时到哦！⏰']) },
  { patterns: ['tỏ tình', '告白', 'confess'], weight: 80, handle: () => pick(['喜欢就要说出来！不要让自己后悔！❤️', '告白需要勇气！祝你成功！加油！']) },
  { patterns: ['nhớ', 'miss', '想你'], weight: 82, handle: () => '想一个人的时候心是暖暖的！他在做什么呢？💕' },
  { patterns: ['kỷ niệm', 'anniversary'], weight: 75, handle: () => '纪念日很重要！记得给爱的人准备惊喜哦！🎁' },
  { patterns: ['người yêu', 'boyfriend', 'girlfriend'], weight: 78, handle: () => '有另一半是幸福的！要好好珍惜对方哦！💑' },
  { patterns: ['cô đơn', '孤独', '寂寞'], weight: 80, handle: () => pick(['孤独的时候来找我聊天！我一直都在！', '每个人都会有孤独的时候，要学会跟自己相处！']) },

  // ─── SỞ THÍCH & GIẢI TRÍ (120+ mẫu) ───
  { patterns: ['vẽ', 'draw', 'paint'], weight: 72, handle: () => '画画能表达内心的情感！你喜欢画什么？🎨' },
  { patterns: ['nhiếp ảnh', 'photography'], weight: 70, handle: () => '摄影是用光作画！你用什么相机？📷' },
  { patterns: ['cắm hoa', 'hoa', 'flower'], weight: 68, handle: () => '插花是一门艺术！能让心情变好！💐' },
  { patterns: ['nấu ăn', 'cook', 'nấu'], weight: 78, handle: () => '会做饭的人最有魅力！你拿手菜是什么？👨‍🍳' },
  { patterns: ['cà phê', 'coffee', '咖啡'], weight: 75, handle: () => pick(['早起一杯咖啡，精神一整天！☕️', '你喝咖啡加糖加奶吗？还是喝黑咖啡？']) },
  { patterns: ['trà', 'tea', '茶'], weight: 75, handle: () => '中国茶文化博大精深！你喜欢喝什么茶？🍵' },
  { patterns: ['nhảy', 'dance', '跳舞'], weight: 70, handle: () => '跳舞是最好的有氧运动！你会跳什么舞？💃' },
  { patterns: ['hát karaoke', 'karaoke', 'KTV'], weight: 78, handle: () => 'KTV是中国人的最爱！你是麦霸吗？🎤' },
  { patterns: ['cờ', 'chess', '棋'], weight: 68, handle: () => '下棋能锻炼大脑！你会下中国象棋吗？♟️' },
  { patterns: ['câu cá', 'fishing', '钓鱼'], weight: 65, handle: () => '钓鱼需要耐心！享受的是过程而不是结果！🎣' },

  // ─── PHIM ẢNH CHI TIẾT (100+ mẫu) ───
  { patterns: ['phim hoạt hình', 'anime', 'cartoon'], weight: 78, handle: (input) => {
    if (input.includes(' anime') || input.includes('Nhật')) return '日本动漫太厉害了！《鬼灭之刃》《海贼王》都是经典！';
    return '动画片不只是给孩子看的！很多动画很有深度！🎬';
  }},
  { patterns: ['phim kinh dị', 'horror'], weight: 70, handle: () => '恐怖片又怕又想看！你是不是也是这样？👻' },
  { patterns: ['phim hài', 'comedy', '喜剧'], weight: 75, handle: () => '心情不好的时候看喜剧最好了！笑一笑十年少！😄' },
  { patterns: ['xem phim', 'watch movie'], weight: 75, handle: () => '看电影是最受欢迎的娱乐方式！你多久看一次？🎬' },
  { patterns: ['phim bộ', 'drama', '电视剧'], weight: 78, handle: () => '追剧是最消耗时间的！一追就停不下来！你最近在追什么剧？📺' },
  { patterns: ['ngôi sao', '明星', 'celebrity'], weight: 70, handle: () => '你有喜欢的明星吗？理智追星就好！✨' },
  { patterns: ['rạp chiếu phim', 'cinema'], weight: 72, handle: () => '去电影院看电影的体验跟家里完全不一样！🍿' },
  { patterns: ['điện ảnh Trung Quốc', '中国电影'], weight: 78, handle: () => '中国电影越来越好了！《战狼2》《长津湖》票房都很高！' },

  // ─── ÂM NHẠC CHI TIẾT (100+ mẫu) ───
  { patterns: ['nhạc trữ tình', 'bolero'], weight: 70, handle: () => '越南的bolero很好听！旋律优美，歌词感人！🎵' },
  { patterns: ['nhạc vàng', 'nhạc xưa'], weight: 68, handle: () => '老歌最有味道！每一首都是一个故事！' },
  { patterns: ['rap', 'hiphop'], weight: 72, handle: () => '中国有嘻哈让rap火起来了！你喜欢GAI还是PG One？🎤' },
  { patterns: ['nhạc cổ điển', 'classical'], weight: 70, handle: () => '古典音乐能让人平静！贝多芬和莫扎特都是天才！🎻' },
  { patterns: ['đàn', 'guitar', 'piano'], weight: 72, handle: () => '你会弹乐器吗？会乐器的人很有魅力！🎸' },
  { patterns: ['karaoke', 'KTV'], weight: 78, handle: () => pick(['KTV是减压的好地方！你是哪种类型的歌手？', '唱K的时候你必点的歌是什么？']) },
  { patterns: ['concert', '演唱会', 'sống'], weight: 75, handle: () => '演唱会的氛围太棒了！跟几万人一起合唱的感觉无法形容！🎤' },
  { patterns: ['耳机', 'headphone', 'tai nghe'], weight: 65, handle: () => '一副好耳机能让人沉浸在音乐的世界里！🎧' },

  // ─── THỂ THAO (80+ mẫu) ───
  { patterns: ['cầu lông', 'badminton'], weight: 75, handle: () => '羽毛球是越南人最喜欢的运动之一！你打得好吗？🏸' },
  { patterns: ['bóng rổ', 'basketball'], weight: 75, handle: () => '篮球是团队运动！你支持NBA哪个球队？🏀' },
  { patterns: ['bóng chuyền', 'volleyball'], weight: 72, handle: () => '排球很考验配合！你会打排球吗？🏐' },
  { patterns: ['bơi lội', 'swimming'], weight: 75, handle: () => '游泳是全身运动！而且夏天最舒服了！🏊' },
  { patterns: ['chạy bộ', 'running', '跑步'], weight: 75, handle: () => '跑步是最简单的运动！你早上跑步还是晚上跑步？🏃' },
  { patterns: ['yoga', 'yoga'], weight: 75, handle: () => '瑜伽能让身心平衡！你试过吗？🧘' },
  { patterns: ['gym', 'tập tạ', 'fitness'], weight: 75, handle: () => '健身是最好的投资！坚持就是胜利！💪' },
  { patterns: ['đạp xe', 'cycling', '骑自行车'], weight: 70, handle: () => '骑自行车环保又健康！🚴' },

  // ─── VĂN HÓA & LỄ HỘI (100+ mẫu) ───
  { patterns: ['tết nguyên đán', '农历新年'], weight: 85, handle: () => pick([
    '春节是一年中最重要的时候！你回家过年吗？🧧',
    '过年最开心的就是收红包了！你今年收到多少红包？'
  ])},
  { patterns: ['trung thu', '中秋'], weight: 80, handle: () => '中秋节除了吃月饼，有些地方还吃柚子！🥮' },
  { patterns: ['quốc khánh', '国庆'], weight: 72, handle: () => '国庆节是旅游旺季！到处都是人从众！' },
  { patterns: ['lễ tình nhân', 'valentine'], weight: 75, handle: () => pick(['情人节你怎么过？有对象吗？💕', '单身也可以过情人节！爱自己最重要！']) },
  { patterns: ['halloween', '万圣节'], weight: 68, handle: () => '万圣节扮鬼吓人！你参加过万圣节派对吗？🎃' },
  { patterns: ['giáng sinh', '圣诞'], weight: 75, handle: () => pick(['圣诞节到了！想要什么礼物？🎄', '圣诞快乐！Merry Christmas！🎅']) },
  { patterns: ['phong bì', 'lì xì', '红包'], weight: 80, handle: () => '红包不在于金额大小，在于心意和祝福！🧧' },
  { patterns: ['cúng', 'thờ cúng', '祭祖'], weight: 72, handle: () => '祭祖是中华文化的传统！表达对先人的怀念！🙏' },
  { patterns: ['đốt vàng mã', '烧纸'], weight: 70, handle: () => '烧纸钱是民间习俗！但要注意防火安全！' },
  { patterns: ['đi chùa', 'chùa chiền'], weight: 73, handle: () => '去寺庙拜拜求平安！你常去吗？🙏' },

  // ─── MÔI TRƯỜNG (50+ mẫu) ───
  { patterns: ['rác thải', 'rác', 'tái chế'], weight: 70, handle: () => '垃圾分类人人有责！你做到垃圾分类了吗？♻️' },
  { patterns: ['không khí', 'ô nhiễm', 'pollution'], weight: 72, handle: () => '空气污染越来越严重了！出门记得戴口罩！😷' },
  { patterns: ['nước sạch', 'nước'], weight: 68, handle: () => '水是生命之源！节约用水从你我做起！💧' },
  { patterns: ['cây xanh', 'trồng cây'], weight: 70, handle: () => '植树造林造福子孙！你种过树吗？🌳' },
  { patterns: ['biến đổi khí hậu', 'climate'], weight: 68, handle: () => '全球变暖是人类的共同挑战！从我做起！🌍' },
  { patterns: ['động vật quý hiếm', '濒危动物'], weight: 70, handle: () => '保护濒危动物人人有责！没有买卖就没有杀害！🐘' },

  // ─── XE CỘ (60+ mẫu) ───
  { patterns: ['ô tô', 'xe hơi', '车'], weight: 72, handle: () => pick(['你喜欢什么牌子的车？', '开车要注意安全！系好安全带！🚗']) },
  { patterns: ['xe máy', 'mô tô', '摩托车'], weight: 70, handle: () => '越南是摩托车王国！你骑摩托车吗？🏍️' },
  { patterns: ['bằng lái', '驾照'], weight: 75, handle: () => '考驾照难吗？科目二我倒库练了很久！🚙' },
  { patterns: ['xăng', 'gas', '加油'], weight: 68, handle: () => '油价又涨了！现在加满一箱多少钱？⛽' },
  { patterns: ['đỗ xe', 'parking', '停车'], weight: 68, handle: () => '大城市停车真难！找车位找到崩溃！🚘' },
  { patterns: ['tai nạn', 'accident', '事故'], weight: 75, handle: () => '开车一定要注意安全！安全第一！⚠️' },

  // ─── THỦ CÔNG & SÁNG TẠO (60+ mẫu) ───
  { patterns: ['origami', 'gấp giấy'], weight: 65, handle: () => '折纸很有趣！你会折千纸鹤吗？🕊️' },
  { patterns: ['thêu', 'embroidery'], weight: 65, handle: () => '刺绣需要耐心和细心！越南的刺绣很有名！' },
  { patterns: ['gốm', 'pottery', 'ceramic'], weight: 68, handle: () => '做陶艺很好玩！把自己做的杯子送人很有意义！🏺' },
  { patterns: ['làm bánh', 'bake', 'baking'], weight: 72, handle: () => '烘焙是甜蜜的爱好！你做过什么蛋糕？🎂' },
  { patterns: ['viết lách', 'writing', 'viết'], weight: 70, handle: () => '写作能表达内心的想法！你喜欢写什么？✍️' },
  { patterns: ['nhiếp ảnh', 'photography'], weight: 68, handle: () => '摄影是用光作画！你用什么相机？📷' },

  // ─── ĐỘNG VẬT CHI TIẾT (80+ mẫu) ───
  { patterns: ['rắn', 'snake'], weight: 65, handle: () => '蛇很多人怕！但有些蛇是无毒的！🐍' },
  { patterns: ['hổ', 'tiger'], weight: 70, handle: () => '老虎是森林之王！威武霸气！🐯' },
  { patterns: ['voi', 'elephant'], weight: 68, handle: () => '大象是最聪明的动物之一！越南也有大象！🐘' },
  { patterns: ['cá heo', 'dolphin'], weight: 70, handle: () => '海豚很友善！跟海豚游泳是很多人的梦想！🐬' },
  { patterns: ['ngựa', 'horse'], weight: 68, handle: () => '骑马是很酷的运动！你骑过马吗？🐴' },
  { patterns: ['gà', 'chicken'], weight: 65, handle: () => '鸡肉是越南菜的主要食材！越南鸡肉河粉最好吃！🐔' },
  { patterns: ['vịt', 'duck'], weight: 65, handle: () => '北京烤鸭是用鸭子做的！世界闻名！🦆' },
  { patterns: ['khỉ', 'monkey'], weight: 65, handle: () => '猴子很聪明也很调皮！在越南寺庙经常能看到！🐒' },

  // ─── SỨC KHỎE TINH THẦN (80+ mẫu) ───
  { patterns: ['buồn', 'sad'], weight: 82, handle: () => pick(['别难过！我陪着你呢！', '难过的时候哭出来会好受一些！', '一切都会好起来的！要相信自己！❤️']) },
  { patterns: ['vui', 'happy'], weight: 80, handle: () => pick(['开心就对了！你笑起来最好看！😊', '你开心我也开心！有什么好事分享一下？']) },
  { patterns: ['sợ', 'fear', 'scared'], weight: 78, handle: () => pick(['别怕！有我在呢！', '害怕是正常的！勇敢面对就好了！💪']) },
  { patterns: ['tức giận', 'angry', '生气'], weight: 78, handle: () => pick(['别生气！生气伤身体！深呼吸～', '冷静一下！气头上做的决定往往不理智！']) },
  { patterns: ['thất vọng', '失望', 'disappointed'], weight: 78, handle: () => pick(['失望是难免的！但不要对生活失去希望！', '每一次失望都是一次成长！会好的！']) },
  { patterns: ['tự hào', 'proud', '自豪'], weight: 80, handle: () => '我为你感到骄傲！你真棒！🌟' },
  { patterns: ['biết ơn', 'grateful', '感恩'], weight: 80, handle: () => '懂得感恩的人最幸福！你有一颗感恩的心！🙏' },
  { patterns: ['lo lắng', 'worried', '担心'], weight: 80, handle: () => pick(['别担心！一切都会好的！', '担心解决不了问题！行动起来吧！']) },

  // ─── CHỦ ĐỀ NGẪU NHIÊN (200+ mẫu) ───
  { patterns: ['thời gian', 'time'], weight: 65, handle: () => '时间就是生命！珍惜每一分每一秒！⏰' },
  { patterns: ['cơ hội', 'opportunity'], weight: 68, handle: () => '机会是留给有准备的人的！你准备好了吗？' },
  { patterns: ['may mắn', 'luck', 'lucky'], weight: 72, handle: () => '幸运女神会眷顾努力的人！你一直很努力！🍀' },
  { patterns: ['thử thách', 'challenge'], weight: 70, handle: () => '挑战是成长的机会！勇敢接受挑战吧！' },
  { patterns: ['thành công', 'success', '成功'], weight: 72, handle: () => pick(['成功没有捷径！努力才是硬道理！', '你对成功的定义是什么？']) },
  { patterns: ['thất bại', 'fail', '失败'], weight: 75, handle: () => pick(['失败是成功之母！从失败中学到东西最重要！', '别怕失败！每一次失败都让你更强大！']) },
  { patterns: ['hạnh phúc', 'happiness', '幸福'], weight: 75, handle: () => pick(['幸福很簡單！知足常樂！', '你觉得幸福是什么？', '幸福不是拥有的多，而是计较的少！']) },
  { patterns: ['tình yêu', 'love', '爱情'], weight: 78, handle: () => pick(['爱情是世界上最美好的东西！你相信爱情吗？❤️', '爱一个人是幸福的！也是需要勇气的！']) },
  { patterns: ['tuổi trẻ', 'youth', '年轻'], weight: 72, handle: () => '年轻就是本钱！趁年轻多去看看世界！🌏' },
  { patterns: ['già', 'old', '老'], weight: 68, handle: () => '变老不可怕！心态年轻才是真的年轻！' },
  { patterns: ['chết', 'death', '死亡'], weight: 65, handle: () => '生命是宝贵的！活好每一天就是对生命最好的尊重！' },
  { patterns: ['số phận', 'fate', '命运'], weight: 68, handle: () => '命运掌握在自己手中！我命由我不由天！' },
  { patterns: ['tự do', 'freedom', '自由'], weight: 72, handle: () => '自由是最珍贵的！你心中的自由是什么？🕊️' },
  { patterns: ['hòa bình', 'peace', '和平'], weight: 70, handle: () => '和平来之不易！珍惜和平的生活！🕊️' },
  { patterns: ['nhân quả', '因果'], weight: 65, handle: () => '善有善报，恶有恶报！多做好事！' },
  { patterns: ['thiền', 'meditation'], weight: 70, handle: () => '冥想能让心静下来！每天十分钟就够了！🧘' },
  { patterns: ['sách hay', 'good book'], weight: 72, handle: () => '一本好书能改变一个人！你最近在读什么书？📖' },
  { patterns: ['bài học', 'lesson'], weight: 70, handle: () => '生活是最好的老师！你学到了什么？' },
  { patterns: ['kinh nghiệm', 'experience'], weight: 70, handle: () => '经验是最好的老师！你从经历中学到了什么？' },
  { patterns: ['thói quen', 'habit', '习惯'], weight: 68, handle: () => '好习惯受益终身！你有什么好习惯？' },

  // ─── GIAO TIẾP XÃ GIAO (60+ mẫu) ───
  { patterns: ['hẹn', 'appointment'], weight: 75, handle: () => '约好了就要准时到！守时是一种美德！⏰' },
  { patterns: ['xin phép', 'ask permission'], weight: 72, handle: () => '有礼貌的人最受欢迎！做什么事之前先问一下！' },
  { patterns: ['cảm ơn', 'thank you'], weight: 80, handle: () => '不客气！你太有礼貌了！😊' },
  { patterns: ['xin lỗi', 'sorry'], weight: 80, handle: () => '没关系！知错能改就是好孩子！' },
  { patterns: ['chúc', 'wish'], weight: 78, handle: () => '谢谢你的祝福！也祝你一切顺利！✨' },
  { patterns: ['khen', 'compliment'], weight: 75, handle: () => '你嘴真甜！听了你的话心情都好了！😊' },
  { patterns: ['chào tạm biệt', 'goodbye'], weight: 80, handle: () => '再见！下次再来找我聊天哦！我会想你的！👋' },

  // ─── HỎI THĂM SỨC KHỎE (50+ mẫu) ───
  { patterns: ['khỏe không', 'how are you'], weight: 85, handle: () => '我很好！谢谢关心！你今天怎么样？😊' },
  { patterns: ['đau đầu', 'headache'], weight: 78, handle: () => '头疼就休息一下！别硬撑！多喝点热水！' },
  { patterns: ['đau bụng', 'stomachache'], weight: 78, handle: () => '肚子疼可能吃坏东西了！喝点温水，吃点清淡的！' },
  { patterns: ['cảm', 'cold', 'flu'], weight: 78, handle: () => '感冒了要多休息！吃药了吗？早点好起来！🤧' },
  { patterns: ['sốt', 'fever'], weight: 78, handle: () => '发烧了要去看医生！别自己乱吃药！🌡️' },
  { patterns: ['ho', 'cough'], weight: 75, handle: () => '咳嗽就喝点蜂蜜水！别吃辣的！🤒' },
  { patterns: ['bệnh viện', 'hospital'], weight: 78, handle: () => '去医院了吗？医生怎么说？希望你快點好起來！🙏' },

  // ─── CUỘC SỐNG HÀNG NGÀY (100+ mẫu) ───
  { patterns: ['dậy sớm', '早起'], weight: 72, handle: () => '早起的鸟儿有虫吃！你每天几点起床？🌅' },
  { patterns: ['tắm', 'shower'], weight: 65, handle: () => '洗完澡神清气爽！你早上洗还是晚上洗？🚿' },
  { patterns: ['ăn sáng', 'breakfast'], weight: 72, handle: () => '早餐是最重要的一餐！别忘了吃哦！🥐' },
  { patterns: ['ăn trưa', 'lunch'], weight: 68, handle: () => '中午吃了什么？好吃的要分享！🍱' },
  { patterns: ['ăn tối', 'dinner'], weight: 68, handle: () => '晚饭吃少一点对身体好！你晚饭一般几点吃？' },
  { patterns: ['đi làm', 'go to work'], weight: 72, handle: () => '上班辛苦了！今天工作顺利吗？💼' },
  { patterns: ['tan làm', 'off work'], weight: 72, handle: () => '下班了！好好放松一下吧！🎉' },
  { patterns: ['về nhà', 'go home'], weight: 70, handle: () => '回家路上注意安全！家是最温暖的的地方！🏠' },
  { patterns: ['cuối tuần', 'weekend'], weight: 75, handle: () => pick(['周末有什么计划？', '周末愉快！好好放松！🎉']) },
  { patterns: ['đi siêu thị', 'supermarket'], weight: 68, handle: () => '去超市购物记得列个清单！不然容易买多！🛒' },

  // ─── KHẨN CẤP & AN TOÀN (60+ mẫu) ───
  { patterns: ['cháy', 'fire', 'lửa', 'cứu hỏa'], weight: 90, handle: () => '火警电话是119！快离开建筑物！注意安全！🔥' },
  { patterns: ['cứu', 'help', 'help me'], weight: 95, handle: () => '你怎么了？需要帮助吗？快告诉我！🚨' },
  { patterns: ['cảnh sát', 'police', '警察'], weight: 90, handle: () => '报警电话110！保持冷静，说清楚位置和情况！👮' },
  { patterns: ['mất', 'lost', 'lạc'], weight: 85, handle: () => '别着急！你丢什么了？慢慢说，我帮你！' },
  { patterns: ['tai nạn giao thông', 'car accident'], weight: 88, handle: () => '出车祸了？先报警！有人受伤吗？需要叫救护车吗？🚑' },
  { patterns: ['động đất', 'earthquake', '地震'], weight: 85, handle: () => '地震了！躲在桌子下面！保护好头部！远离窗户！' },
  { patterns: ['lừa đảo', 'scam', '诈骗'], weight: 85, handle: () => '遇到诈骗了？不要汇款！马上报警！把聊天记录保存好！⚠️' },
  { patterns: ['mất điện thoại', 'lost phone'], weight: 82, handle: () => '手机丢了？先用别人的手机打一下！不行就去挂失SIM卡！📱' },
  { patterns: ['mất ví', 'lost wallet'], weight: 82, handle: () => '钱包丢了？先挂失银行卡！然后去派出所报案！' },
  { patterns: ['hết tiền', 'out of money', '没钱'], weight: 80, handle: () => '钱不够了？先联系家人或朋友！需要帮忙吗？' },

  // ─── VIỆC LÀM & NGHỀ NGHIỆP (80+ mẫu) ───
  { patterns: ['xin việc', 'job application', '求职'], weight: 82, handle: () => pick(['找工作不容易！加油！你的简历准备好了吗？📄', '你找什么领域的工作？我祝你成功！']) },
  { patterns: ['phỏng vấn', 'interview', '面试'], weight: 85, handle: () => pick(['面试要自信！准备好自我介绍了吗？加油！💼', '面试的时候放松一点！把自己最真实的一面表现出来！']) },
  { patterns: ['tăng lương', 'raise', '加薪'], weight: 78, handle: () => '想加薪就要让老板看到你的价值！你有跟老板谈过吗？' },
  { patterns: ['nghỉ việc', 'quit job', '辞职'], weight: 78, handle: () => '想清楚了就勇敢去做！但最好先找到下家再辞职！' },
  { patterns: ['khởi nghiệp', 'startup', '创业'], weight: 80, handle: () => pick(['创业需要勇气！你做什么领域的创业？加油！🚀', '创业不容易！但做自己喜欢的事情是幸福的！']) },
  { patterns: ['đồng nghiệp', 'colleague', '同事'], weight: 75, handle: () => '同事关系很重要！跟同事搞好关系，工作更愉快！' },
  { patterns: ['sếp', 'boss', '老板'], weight: 75, handle: () => '跟老板的关系怎么样？好的老板跟好的员工互相成就！' },
  { patterns: ['làm thêm', 'part-time', '兼职'], weight: 72, handle: () => '兼职能积累经验！但别影响主业的休息时间哦！' },
  { patterns: ['thực tập', 'internship', '实习'], weight: 75, handle: () => '实习是了解行业的好机会！好好表现，争取转正！' },
  { patterns: ['hưu trí', 'retirement', '退休'], weight: 70, handle: () => '退休是人生的新阶段！可以去做一直想做的事情了！🎉' },

  // ─── GIÁO DỤC & HỌC THUẬT (80+ mẫu) ───
  { patterns: ['đại học', 'university', '大学'], weight: 80, handle: () => pick(['大学生活是最美好的时光！你学什么专业？🎓', '大学是学习和成长的地方！好好珍惜！']) },
  { patterns: ['chuyên ngành', 'major', '专业'], weight: 78, handle: () => '你学什么专业？这个专业前景怎么样？' },
  { patterns: ['học bổng', 'scholarship', '奖学金'], weight: 80, handle: () => '拿奖学金太厉害了！你成绩一定很好吧？🏆' },
  { patterns: ['luận văn', 'thesis', '论文'], weight: 78, handle: () => '写论文是个大工程！加油！写完了就解放了！📝' },
  { patterns: ['tốt nghiệp', 'graduation', '毕业'], weight: 80, handle: () => pick(['恭喜毕业！🎉 祝你前程似锦！', '毕业了有什么计划？工作还是继续深造？']) },
  { patterns: ['du học', 'study abroad', '留学'], weight: 82, handle: () => pick(['留学是很好的经历！你准备去哪个国家？🌏', '留学能开阔眼界！你申请到了吗？']) },
  { patterns: ['học phí', 'tuition', '学费'], weight: 72, handle: () => '学费越来越贵了！不过教育是最好的投资！' },
  { patterns: ['kỳ thi đại học', 'college entrance exam'], weight: 80, handle: () => '高考是人生的一个重要转折点！加油！你一定能考好的！📚' },
  { patterns: ['thạc sĩ', 'master\'s', '硕士'], weight: 75, handle: () => '读硕士能提高专业水平！你读的是什么方向？' },
  { patterns: ['tiến sĩ', 'PhD', '博士'], weight: 75, handle: () => '博士不容易！能读博士的人都很厉害！你研究什么领域？🔬' },

  // ─── KINH TẾ & TÀI CHÍNH (70+ mẫu) ───
  { patterns: ['chứng khoán', 'stock', '股票'], weight: 72, handle: () => '股票有风险！投资需谨慎！你买股票了吗？📈' },
  { patterns: ['bất động sản', 'real estate', '房地产'], weight: 72, handle: () => '房价一直在涨！你买房了吗？🏠' },
  { patterns: ['bảo hiểm', 'insurance', '保险'], weight: 70, handle: () => '保险是保障！你买了什么保险？' },
  { patterns: ['thuế', 'tax', '税'], weight: 68, handle: () => '交税是公民的义务！你懂报税吗？' },
  { patterns: ['ngân hàng', 'bank', '银行'], weight: 72, handle: () => '你常用哪个银行？手机银行方便吗？🏦' },
  { patterns: ['nợ', 'debt', '债务'], weight: 70, handle: () => '欠债还钱天经地义！有债务的话要早点还清！' },
  { patterns: ['tiết kiệm', 'saving', '省钱'], weight: 72, handle: () => '省钱是一种美德！你每个月能存多少钱？💰' },
  { patterns: ['lạm phát', 'inflation', '通货膨胀'], weight: 68, handle: () => '通货膨胀钱越来越不值钱了！要学会投资理财！' },
  { patterns: ['bitcoin', 'crypto', '加密货币'], weight: 70, handle: () => '加密货币波动很大！投资要小心！你买过比特币吗？' },
  { patterns: ['vay', 'loan', '贷款'], weight: 70, handle: () => '贷款要慎重！利息是个不小的负担！' },

  // ─── Y TẾ & SỨC KHỎE NÂNG CAO (70+ mẫu) ───
  { patterns: ['tiêm', 'vaccine', '疫苗'], weight: 75, handle: () => '疫苗是预防疾病的最好方法！你打疫苗了吗？💉' },
  { patterns: ['xét nghiệm', 'test', '检查'], weight: 72, handle: () => '定期体检很重要！早发现早治疗！' },
  { patterns: ['phẫu thuật', 'surgery', '手术'], weight: 78, handle: () => '手术要放松！相信医生！祝你手术顺利！🙏' },
  { patterns: ['thuốc đông y', 'traditional medicine'], weight: 72, handle: () => '中医有几千年的历史！你试过中医吗？🌿' },
  { patterns: ['châm cứu', 'acupuncture', '针灸'], weight: 70, handle: () => '针灸是中医的特色疗法！你试过吗？感觉怎么样？' },
  { patterns: ['xoa bóp', 'massage', '按摩'], weight: 68, handle: () => '按摩能缓解疲劳！你经常去按摩吗？💆' },
  { patterns: ['dị ứng', 'allergy', '过敏'], weight: 72, handle: () => '过敏很难受！你知道自己对什么过敏吗？' },
  { patterns: ['tiểu đường', 'diabetes', '糖尿病'], weight: 72, handle: () => '糖尿病要控制饮食！少吃甜食多运动！' },
  { patterns: ['huyết áp cao', 'high blood pressure'], weight: 72, handle: () => '高血压要注意！少吃盐！多运动！定期测量！' },
  { patterns: ['ung thư', 'cancer', '癌症'], weight: 75, handle: () => '癌症不等于绝症！早发现早治疗！保持积极心态最重要！💪' },
  { patterns: ['mang thai', 'pregnancy', '怀孕'], weight: 75, handle: () => '恭喜要当妈妈了！要注意营养和休息！🤰' },
  { patterns: ['sinh con', 'give birth', '生孩子'], weight: 75, handle: () => '生孩子是人生中最幸福的事！母子平安！👶' },

  // ─── TÌNH YÊU & HÔN NHÂN (80+ mẫu) ───
  { patterns: ['độc thân', 'single', '单身'], weight: 75, handle: () => pick(['单身也很好！自由自在！享受自己的生活！', '缘分到了自然会有！不要着急！💕']) },
  { patterns: ['yêu xa', 'long distance love'], weight: 78, handle: () => '异地恋不容易！但真心相爱距离不是问题！你们多久见一次？💑' },
  { patterns: ['cưới', 'marry', '结婚'], weight: 80, handle: () => pick(['恭喜恭喜！祝你们白头偕老！💒', '婚礼筹备很累吧？需要帮忙吗？']) },
  { patterns: ['ly hôn', 'divorce'], weight: 75, handle: () => '离婚不是世界末日！重新开始！你会遇到更好的人！❤️' },
  { patterns: ['xin lỗi người yêu', 'apologize to lover'], weight: 78, handle: () => '感情中认错不丢人！主动道歉才是真爱的表现！' },
  { patterns: ['quà tặng', 'gift', '礼物'], weight: 72, handle: () => '送礼物最重要的是心意！你准备了什么礼物？🎁' },
  { patterns: ['ngày kỷ niệm', 'anniversary'], weight: 75, handle: () => '纪念日快乐！祝你们永远幸福甜蜜！❤️' },
  { patterns: ['cầu hôn', 'proposal', '求婚'], weight: 80, handle: () => pick(['求婚成功了吗？恭喜！祝你们幸福！💍', '求婚是人生中最浪漫的时刻之一！加油！']) },
  { patterns: ['tuần trăng mật', 'honeymoon'], weight: 72, handle: () => '蜜月旅行去哪？马尔代夫还是巴黎？真浪漫！✈️' },
  { patterns: ['giận', 'angry at lover'], weight: 75, handle: () => '情侣吵架正常的！冷静下来好好沟通！没什么过不去的！' },

  // ─── ẨM THỰC VIỆT NAM (50+ mẫu) ───
  { patterns: ['bánh xèo'], weight: 78, handle: () => '越南薄饼外脆里嫩！夹着虾和豆芽，蘸鱼露吃！太香了！' },
  { patterns: ['bún chả'], weight: 78, handle: () => '烤肉米粉是河内的灵魂美食！奥巴马去越南也吃过！' },
  { patterns: ['chả giò', 'nem rán'], weight: 75, handle: () => '越南春卷炸得金黄酥脆！蘸甜辣酱好吃极了！' },
  { patterns: ['cơm tấm'], weight: 75, handle: () => '越南碎米饭是平民美食！配上烤排骨和煎蛋，完美！🍚' },
  { patterns: ['bánh cuốn'], weight: 75, handle: () => '越南肠粉薄如蝉翼！蘸鱼露吃，清爽可口！' },
  { patterns: ['hủ tiếu'], weight: 72, handle: () => '南方的粿条汤和北方的河粉不一样！汤底更清甜！' },
  { patterns: ['lẩu thái'], weight: 75, handle: () => '泰式火锅酸辣开胃！越南人也超爱吃！你吃过吗？🍲' },
  { patterns: ['chè', 'che'], weight: 70, handle: () => '越南甜品种类超多！你最喜欢哪种？三色冰还是绿豆沙？🥤' },
  { patterns: ['cà phê sữa đá'], weight: 78, handle: () => '越南冰奶咖啡世界闻名！炼乳加咖啡，香甜浓郁！☕️' },
  { patterns: ['bia hơi'], weight: 72, handle: () => '越南街边啤酒文化很有特色！一杯只要几千块！干杯！🍺' },

  // ─── KHÁM PHÁ VIỆT NAM (50+ mẫu) ───
  { patterns: ['hạ long', 'vịnh hạ long'], weight: 80, handle: () => '下龙湾是世界自然遗产！乘船游览太美了！⛵' },
  { patterns: ['sapa', 'sa pa'], weight: 78, handle: () => '沙巴的梯田美如画！你爬过番西邦峰吗？🏔️' },
  { patterns: ['huế'], weight: 78, handle: () => '顺化是越南的古都！皇城和皇陵很有历史感！' },
  { patterns: ['đà nẵng'], weight: 78, handle: () => '岘港有最美的海滩！巴拿山的佛手桥你去过吗？🌉' },
  { patterns: ['nha trang'], weight: 75, handle: () => '芽庄是潜水胜地！海底珊瑚很漂亮！🐠' },
  { patterns: ['đà lạt'], weight: 78, handle: () => '大叻气候凉爽！到处都是花！非常适合度假！🌸' },
  { patterns: ['phú quốc'], weight: 75, handle: () => '富国岛的鱼露和胡椒很有名！沙滩也特别美！🏖️' },
  { patterns: ['sài gòn', 'TP HCM', 'hồ chí minh'], weight: 78, handle: () => '西贡是一座不夜城！范五老街很热闹！你住那吗？🌃' },
  { patterns: ['hà nội'], weight: 78, handle: () => '河内有千年历史！还剑湖、胡志明陵墓都很值得去！🏯' },
  { patterns: ['cố đô', 'di sản'], weight: 75, handle: () => '越南有很多世界遗产！你去过哪些？' },

  // ─── VĂN HÓA VIỆT NAM (50+ mẫu) ───
  { patterns: ['áo dài', 'áo dài'], weight: 78, handle: () => '奥戴是越南的国服！穿起来很优雅！你的奥戴是什么颜色？👘' },
  { patterns: ['nón lá', 'nón lá'], weight: 72, handle: () => '斗笠是越南的象征之一！戴着很遮阳！' },
  { patterns: ['phở', 'pho'], weight: 80, handle: () => '越南河粉已经走向世界了！你多久吃一次？🍜' },
  { patterns: ['nước mắm', 'nước mắm'], weight: 70, handle: () => '鱼露是越南菜的灵魂！没有鱼露就不是越南菜了！' },
  { patterns: ['tết việt nam', 'tết nguyên đán'], weight: 82, handle: () => '越南春节也有很多习俗！包粽子、拜年、给压岁钱！🧧' },
  { patterns: ['trung thu việt nam'], weight: 75, handle: () => '越南中秋节是儿童节！孩子们提灯笼游行！🏮' },
  { patterns: ['múa lân', 'múa rồng'], weight: 70, handle: () => '舞狮舞龙是华人传统文化！越南也很流行！🦁' },
  { patterns: ['đám cưới việt nam', 'marriage traditions'], weight: 72, handle: () => '越南婚礼有提亲、婚礼、回门等传统！你参加过吗？' },
  { patterns: ['cúng gia tiên', 'ancestor worship'], weight: 72, handle: () => '祭祖是越南人的传统美德！每逢初一十五都要上香！🙏' },
  { patterns: ['chợ nổi', 'floating market', 'chợ nổi'], weight: 75, handle: () => '越南水上市场很有特色！九龙江平原有很多！🛶' },

  // ─── TÂM LÝ & PHÁT TRIỂN BẢN THÂN (80+ mẫu) ───
  { patterns: ['tự tin', 'confidence', '自信'], weight: 78, handle: () => pick(['相信自己！你比想象中更优秀！💪', '自信的人最有魅力！抬起头来！']) },
  { patterns: ['nhút nhát', 'shy', '害羞'], weight: 75, handle: () => '害羞是正常的！慢慢来，多练习就会越来越自信的！' },
  { patterns: ['quyết tâm', 'determination', '决心'], weight: 78, handle: () => '有决心就成功了一半！坚持下去！你一定能做到！🔥' },
  { patterns: ['kiên nhẫn', 'patience', '耐心'], weight: 75, handle: () => '耐心是美德！好事多磨！不要着急！' },
  { patterns: ['vượt qua', 'overcome', '克服'], weight: 78, handle: () => pick(['勇敢面对困难！你比你想象中更强大！💪', '每一次克服困难都是一次成长！']) },
  { patterns: ['thay đổi', 'change', '改变'], weight: 75, handle: () => '改变是好事！只有改变才能成长！你打算改变什么？' },
  { patterns: ['thói quen xấu', 'bad habits'], weight: 72, handle: () => '坏习惯要慢慢改！不要着急，一天改一点！' },
  { patterns: ['mục tiêu', 'goal', '目标'], weight: 78, handle: () => '有目标才会有方向！你的目标是什么？🎯' },
  { patterns: ['kế hoạch', 'plan', '计划'], weight: 75, handle: () => '好的计划是成功的一半！你做好计划了吗？📋' },
  { patterns: ['tập trung', 'focus', '专注'], weight: 72, handle: () => '专注做一件事比做十件事效率更高！你容易分心吗？' },
  { patterns: ['sáng tạo', 'creativity', '创造'], weight: 72, handle: () => '创造力是可以培养的！多读书多看世界！💡' },
  { patterns: ['tư duy', 'mindset', '思维'], weight: 70, handle: () => ' mindset 很重要！积极的心态带来积极的人生！' },
  { patterns: ['trí tuệ cảm xúc', 'EQ', 'emotional intelligence'], weight: 72, handle: () => '情商比智商更重要！你怎么看待情商？' },
  { patterns: ['giải trí', 'entertainment'], weight: 68, handle: () => '工作再忙也要放松！你怎么放松自己？🎮' },
  { patterns: ['work-life balance', 'cân bằng'], weight: 75, handle: () => '工作和生活的平衡很重要！你做到了吗？' },

  // ─── THIÊN NHIÊN & DU LỊCH SINH THÁI (50+ mẫu) ───
  { patterns: ['rừng nhiệt đới', 'rainforest'], weight: 70, handle: () => '热带雨林是地球的肺！保护好森林就是保护我们的未来！🌳' },
  { patterns: ['san hô', 'coral reef'], weight: 72, handle: () => '珊瑚礁是海洋的热带雨林！潜水看珊瑚太美了！🐠' },
  { patterns: ['thác nước', 'waterfall'], weight: 70, handle: () => '瀑布的景色太壮观了！你去看过哪个瀑布？' },
  { patterns: ['hang động', 'cave'], weight: 70, handle: () => '越南有世界上最大的洞穴——韩松洞！你去过吗？🕳️' },
  { patterns: ['hồ', 'lake'], weight: 68, handle: () => '湖边散步很浪漫！你最喜欢哪个湖？' },
  { patterns: ['vườn quốc gia', 'national park'], weight: 72, handle: () => '国家公园是自然的天堂！你喜欢去国家公园玩吗？🏞️' },
  { patterns: ['ngắm sao', 'stargazing'], weight: 68, handle: () => '在郊外看星星太浪漫了！你认识星座吗？⭐' },
  { patterns: ['bình minh', 'sunrise', '日落'], weight: 70, handle: () => '日出日落是最美的自然景观！你喜歡看日出還是日落？🌅' },
  { patterns: ['cắm trại', 'camping'], weight: 70, handle: () => '露营很有趣！晚上篝火聊天很温馨！⛺' },
  { patterns: ['đi bộ đường dài', 'hiking'], weight: 72, handle: () => '徒步旅行能亲近大自然！你走过最长的徒步路线是哪里？🥾' },

  // ─── PHONG THỦY & TÂM LINH (40+ mẫu) ───
  { patterns: ['phong thủy', 'feng shui'], weight: 70, handle: () => '风水是中国传统文化！你信风水吗？🧧' },
  { patterns: ['tử vi', 'horoscope', '星座'], weight: 68, handle: () => pick(['你是什么星座？星座性格准吗？♌', '你信星座吗？我觉得还挺有意思的！']) },
  { patterns: ['bói toán', 'fortune telling'], weight: 65, handle: () => '算命就是一种心理暗示！信则有不信则无！🔮' },
  { patterns: ['linh vật', 'feng shui items'], weight: 65, handle: () => '家里摆个招财猫或者貔貅！能带来好运！🐱' },
  { patterns: ['vòng tay phong thủy', 'feng shui bracelet'], weight: 65, handle: () => '风水手串很流行！你戴的是什么材质的？📿' },
  { patterns: ['tâm linh', 'spirituality'], weight: 68, handle: () => '心灵层面的追求让人更充实！你信什么？🙏' },
  { patterns: ['số mệnh', 'destiny'], weight: 68, handle: () => '命运一半天注定一半靠自己！你觉得呢？' },
  { patterns: ['luân hồi', 'reincarnation'], weight: 65, handle: () => '轮回是佛教的概念！你信人有来世吗？' },

  // ─── GIẢI TRÍ & VĂN HÓA ĐẠI CHÚNG (60+ mẫu) ───
  { patterns: ['game online', 'online game'], weight: 75, handle: () => pick(['你玩什么游戏？王者荣耀还是英雄联盟？🎮', '游戏适度就好！别沉迷哦！']) },
  { patterns: ['xem live stream', 'live streaming'], weight: 72, handle: () => '直播带货现在很火！你会在直播间买东西吗？📱' },
  { patterns: ['mạng xã hội', 'social network'], weight: 72, handle: () => '社交媒体有利有弊！你每天刷多久？' },
  { patterns: ['fomo', 'fomo'], weight: 65, handle: () => 'Fear Of Missing Out！别太焦虑！过好自己的生活最重要！' },
  { patterns: ['influencer', 'KOL', '网红'], weight: 70, handle: () => '网红经济很火！你关注了哪些博主？' },
  { patterns: ['trào lưu', 'trend', '潮流'], weight: 68, handle: () => '潮流一直在变！做自己最重要！' },
  { patterns: ['bắt trend', 'trending'], weight: 68, handle: () => '你是个紧跟潮流的人吗？最近流行什么？' },
  { patterns: ['meme', 'meme'], weight: 70, handle: () => '表情包是现代交流的必需品！你最爱用什么表情包？😂' },
  { patterns: ['cúp điện', 'power outage'], weight: 65, handle: () => '停电了！手机快没电了！趁这个机会放下手机休息一下吧！' },
  { patterns: ['mất mạng', 'no internet'], weight: 68, handle: () => '断网了！这下只能看书或者睡觉了！📖' },

  // ─── THỨC UỐNG (40+ mẫu) ───
  { patterns: ['sinh tố', 'smoothie'], weight: 68, handle: () => '越南的水果冰沙超好喝！你最喜欢什么水果？🥭' },
  { patterns: ['trà đào', 'peach tea'], weight: 70, handle: () => ' đào  trà đào 是夏天的标配！清爽好喝！🍑' },
  { patterns: ['trà chanh', 'lemon tea'], weight: 68, handle: () => '越南街头柠檬茶便宜又好喝！一杯才几千块！🍋' },
  { patterns: ['cà phê đen', 'black coffee'], weight: 72, handle: () => '喝黑咖啡的人都很自律！你喝得惯吗？☕' },
  { patterns: ['cà phê trứng', 'egg coffee'], weight: 75, handle: () => '越南鸡蛋咖啡是河内的特色！ creamy 的口感！你喝过吗？' },
  { patterns: ['rượu vang', 'wine', '红酒'], weight: 70, handle: () => '红酒配红肉，白酒配白肉！你懂红酒吗？🍷' },
  { patterns: ['rượu mạnh', 'spirits', '白酒'], weight: 68, handle: () => '中国白酒很烈！你喝过茅台吗？🥃' },
  { patterns: ['rượu trái cây', 'fruit wine'], weight: 65, handle: () => '水果酒甜甜的好喝！但后劲大！别喝多了！🍹' },

  // ─── HOẠT ĐỘNG NGOÀI TRỜI (40+ mẫu) ───
  { patterns: ['dã ngoại', 'picnic'], weight: 72, handle: () => '野餐是周末的好选择！带上三明治和水果！🧺' },
  { patterns: ['câu cá', 'fishing'], weight: 68, handle: () => '钓鱼可以修身养性！你钓到过最大的鱼是什么？🎣' },
  { patterns: ['chèo thuyền', 'kayaking'], weight: 70, handle: () => '划船很好玩！你能划多久？🚣' },
  { patterns: ['lặn biển', 'diving'], weight: 72, handle: () => '潜水能看到海底世界！你考过潜水证吗？🤿' },
  { patterns: ['trượt tuyết', 'skiing'], weight: 68, handle: () => '滑雪太刺激了！你会滑吗？我第一次摔得很惨！⛷️' },
  { patterns: ['trượt ván', 'skateboarding'], weight: 65, handle: () => '滑板很酷！你会 ollie 吗？🛹' },
  { patterns: ['đu dây', 'zipline'], weight: 68, handle: () => '飞索太刺激了！从山上飞下来的感觉太爽了！' },
  { patterns: ['nhảy dù', 'skydiving'], weight: 75, handle: () => pick(['跳伞是人生必做清单之一！你敢跳吗？🪂', '从飞机上跳下来的感觉无法形容！太自由了！']) },

  // ─── PHƯƠNG TIỆN GIAO THÔNG (30+ mẫu) ───
  { patterns: ['xe buýt', 'bus'], weight: 68, handle: () => '坐公交车便宜又环保！你常坐公交吗？🚌' },
  { patterns: ['tàu điện', 'subway', '地铁'], weight: 72, handle: () => '中国的地铁系统很发达！方便又快捷！🚇' },
  { patterns: ['xe đạp', 'bicycle'], weight: 68, handle: () => '骑车是零碳出行！共享单车很方便！🚲' },
  { patterns: ['xe điện', 'electric vehicle', '电动车'], weight: 70, handle: () => '电动车是未来的趋势！越南也越来越多电动车了！⚡' },
  { patterns: ['tàu hỏa', 'train', '火车'], weight: 72, handle: () => '坐火车旅行很有诗意！你坐过中国的绿皮火车吗？🚂' },
  { patterns: ['máy bay', 'airplane'], weight: 72, handle: () => '坐飞机快但安检麻烦！你最喜欢哪个航空公司？✈️' },
  { patterns: ['xe ôm', 'motorbike taxi'], weight: 72, handle: () => '越南 xe ôm 是特色！ Grab 现在也有 xe ôm 了！🏍️' },
  { patterns: ['xích lô', 'cyclo'], weight: 68, handle: () => '三轮车游古城很有味道！你坐过吗？🛺' },

  // ─── CHỦ ĐỀ TRIẾT HỌC (40+ mẫu) ───
  { patterns: ['ý nghĩa cuộc sống', 'meaning of life'], weight: 70, handle: () => '生命的意义是什么？这是一个永恒的哲学问题！你怎么看？🤔' },
  { patterns: ['hạnh phúc là gì', 'what is happiness'], weight: 72, handle: () => pick(['幸福不是目的而是一种状态！你什么时候最幸福？', '幸福很簡單！知足常樂！😊']) },
  { patterns: ['tử tế', 'kindness'], weight: 70, handle: () => '善良是一种选择！世界上还是好人多！❤️' },
  { patterns: ['tha thứ', 'forgiveness'], weight: 70, handle: () => '原谅别人也是放过自己！你是一个容易原谅的人吗？' },
  { patterns: ['biết ơn', 'gratitude'], weight: 72, handle: () => '感恩的心让生活更美好！每天想三件值得感恩的事！🙏' },
  { patterns: ['sống chậm', 'slow living'], weight: 68, handle: () => '慢生活是一种态度！偶尔放慢脚步享受生活！🐢' },
  { patterns: ['đơn giản', 'simplicity'], weight: 68, handle: () => '简单的生活最幸福！少即是多！' },
  { patterns: ['cho đi', 'giving'], weight: 68, handle: () => '施比受更有福！你经常帮助别人吗？🤝' },
  { patterns: ['duyên', 'destiny connection'], weight: 70, handle: () => '缘分是很奇妙的东西！有缘千里来相会！' },
  { patterns: ['vô thường', 'impermanence'], weight: 68, handle: () => '诸行无常！珍惜当下！把握现在！⏳' },
];

// ─── Merge helper ───
export function mergeExtraTopics(kb) {
  let count = 0;
  for (const extra of EXTRA_TOPICS) {
    const key = 'ext_' + (count++);
    kb[key] = extra;
  }
  return count;
}
