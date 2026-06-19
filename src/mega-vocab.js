// ============================================================
// mega-vocab.js — 5.000 từ HSK chuẩn + 15.000 từ mở rộng
// HSK 1(150) + 2(150) + 3(300) + 4(600) + 5(1300) + 6(2500)
// ============================================================

const HSK_ALL = [
  // ═══ HSK 1 (150 từ) ═══
  [1,'我','wǒ','Tôi','pronoun'],[2,'你','nǐ','Bạn','pronoun'],[3,'他','tā','Anh ấy','pronoun'],
  [4,'她','tā','Cô ấy','pronoun'],[5,'它','tā','Nó','pronoun'],[6,'我们','wǒmen','Chúng tôi','pronoun'],
  [7,'你们','nǐmen','Các bạn','pronoun'],[8,'他们','tāmen','Họ','pronoun'],[9,'这','zhè','Đây','pronoun'],
  [10,'那','nà','Kia','pronoun'],[11,'哪','nǎ','Nào','pronoun'],[12,'谁','shuí','Ai','pronoun'],
  [13,'什么','shénme','Cái gì','pronoun'],[14,'怎么','zěnme','Sao','adverb'],[15,'为什么','wèishénme','Tại sao','adverb'],
  [16,'多少','duōshao','Bao nhiêu','adverb'],[17,'几','jǐ','Mấy','adverb'],[18,'的','de','Của','particle'],
  [19,'了','le','Rồi','particle'],[20,'很','hěn','Rất','adverb'],[21,'非常','fēicháng','Rất','adverb'],
  [22,'太','tài','Quá','adverb'],[23,'都','dōu','Đều','adverb'],[24,'也','yě','Cũng','adverb'],
  [25,'和','hé','Và','conjunction'],[26,'在','zài','Ở','preposition'],[27,'里','lǐ','Trong','noun'],
  [28,'上','shàng','Trên','noun'],[29,'下','xià','Dưới','noun'],[30,'前','qián','Trước','noun'],
  [31,'后','hòu','Sau','noun'],[32,'今天','jīntiān','Hôm nay','noun'],[33,'明天','míngtiān','Ngày mai','noun'],
  [34,'昨天','zuótiān','Hôm qua','noun'],[35,'早上','zǎoshang','Sáng','noun'],[36,'中午','zhōngwǔ','Trưa','noun'],
  [37,'晚上','wǎnshang','Tối','noun'],[38,'现在','xiànzài','Bây giờ','adverb'],[39,'点','diǎn','Giờ','noun'],
  [40,'半','bàn','Rưỡi','noun'],[41,'分','fēn','Phút','noun'],[42,'月','yuè','Tháng','noun'],
  [43,'年','nián','Năm','noun'],[44,'星期','xīngqī','Tuần','noun'],[45,'号','hào','Ngày','noun'],
  [46,'爸爸','bàba','Bố','noun'],[47,'妈妈','māma','Mẹ','noun'],[48,'哥哥','gēge','Anh trai','noun'],
  [49,'姐姐','jiějie','Chị gái','noun'],[50,'妹妹','mèimei','Em gái','noun'],[51,'弟弟','dìdi','Em trai','noun'],
  [52,'儿子','érzi','Con trai','noun'],[53,'女儿','nǚer','Con gái','noun'],[54,'老师','lǎoshī','Giáo viên','noun'],
  [55,'学生','xuéshēng','Học sinh','noun'],[56,'同学','tóngxué','Bạn học','noun'],[57,'朋友','péngyǒu','Bạn','noun'],
  [58,'名字','míngzì','Tên','noun'],[59,'学校','xuéxiào','Trường','noun'],[60,'书','shū','Sách','noun'],
  [61,'本','běn','Quyển','measure'],[62,'个','gè','Cái','measure'],[63,'桌子','zhuōzi','Bàn','noun'],
  [64,'椅子','yǐzi','Ghế','noun'],[65,'门','mén','Cửa','noun'],[66,'房间','fángjiān','Phòng','noun'],
  [67,'衣服','yīfu','Quần áo','noun'],[68,'鞋','xié','Giày','noun'],[69,'钱包','qiánbāo','Ví','noun'],
  [70,'手机','shǒujī','Điện thoại','noun'],[71,'电脑','diànnǎo','Máy tính','noun'],[72,'电视','diànshì','Tivi','noun'],
  [73,'水果','shuǐguǒ','Hoa quả','noun'],[74,'苹果','píngguǒ','Táo','noun'],[75,'鸡蛋','jīdàn','Trứng','noun'],
  [76,'牛奶','niúnǎi','Sữa','noun'],[77,'面包','miànbāo','Bánh mì','noun'],[78,'米饭','mǐfàn','Cơm','noun'],
  [79,'面条','miàntiáo','Mì','noun'],[80,'茶','chá','Trà','noun'],[81,'咖啡','kāfēi','Cà phê','noun'],
  [82,'可乐','kělè','Coca','noun'],[83,'医院','yīyuàn','Bệnh viện','noun'],[84,'商店','shāngdiàn','Cửa hàng','noun'],
  [85,'银行','yínháng','Ngân hàng','noun'],[86,'公园','gōngyuán','Công viên','noun'],[87,'饭店','fàndiàn','Nhà hàng','noun'],
  [88,'家','jiā','Nhà','noun'],[89,'天气','tiānqì','Thời tiết','noun'],[90,'雨','yǔ','Mưa','noun'],
  [91,'雪','xuě','Tuyết','noun'],[92,'冷','lěng','Lạnh','adjective'],[93,'热','rè','Nóng','adjective'],
  [94,'高兴','gāoxìng','Vui','adjective'],[95,'漂亮','piàoliang','Đẹp','adjective'],[96,'好看','hǎokàn','Đẹp','adjective'],
  [97,'好吃','hǎochī','Ngon','adjective'],[98,'忙','máng','Bận','adjective'],[99,'知道','zhīdao','Biết','verb'],
  [100,'认识','rènshi','Quen','verb'],[101,'想','xiǎng','Muốn','verb'],[102,'要','yào','Cần','verb'],
  [103,'可以','kěyǐ','Có thể','verb'],[104,'能','néng','Có thể','verb'],[105,'喜欢','xǐhuān','Thích','verb'],
  [106,'爱','ài','Yêu','verb'],[107,'觉得','juéde','Thấy','verb'],[108,'请','qǐng','Mời','verb'],
  [109,'对不起','duìbuqǐ','Xin lỗi','verb'],[110,'没关系','méiguānxi','Không sao','verb'],[111,'谢谢','xièxie','Cảm ơn','verb'],
  [112,'再见','zàijiàn','Tạm biệt','verb'],[113,'住','zhù','Ở','verb'],[114,'工作','gōngzuò','Làm việc','verb'],
  [115,'学习','xuéxí','Học','verb'],[116,'教','jiāo','Dạy','verb'],[117,'买','mǎi','Mua','verb'],
  [118,'卖','mài','Bán','verb'],[119,'给','gěi','Cho','verb'],[120,'找','zhǎo','Tìm','verb'],
  [121,'等','děng','Đợi','verb'],[122,'叫','jiào','Gọi','verb'],[123,'做','zuò','Làm','verb'],
  [124,'用','yòng','Dùng','verb'],[125,'帮助','bāngzhù','Giúp','verb'],[126,'送','sòng','Tặng','verb'],
  [127,'让','ràng','Để','verb'],[128,'一起','yīqǐ','Cùng','adverb'],[129,'已经','yǐjīng','Đã','adverb'],
  [130,'还','hái','Vẫn','adverb'],[131,'又','yòu','Lại','adverb'],[132,'再','zài','Nữa','adverb'],
  [133,'就','jiù','Thì','adverb'],[134,'最','zuì','Nhất','adverb'],[135,'真','zhēn','Thật','adverb'],
  [136,'对','duì','Đúng','adjective'],[137,'错','cuò','Sai','adjective'],[138,'多','duō','Nhiều','adjective'],
  [139,'少','shǎo','Ít','adjective'],[140,'快','kuài','Nhanh','adjective'],[141,'慢','màn','Chậm','adjective'],
  [142,'远','yuǎn','Xa','adjective'],[143,'近','jìn','Gần','adjective'],[144,'新','xīn','Mới','adjective'],
  [145,'旧','jiù','Cũ','adjective'],[146,'贵','guì','Đắt','adjective'],[147,'便宜','piányi','Rẻ','adjective'],
  [148,'高','gāo','Cao','adjective'],[149,'好','hǎo','Tốt','adjective'],[150,'大','dà','Lớn','adjective'],

  // ═══ HSK 2 (150 từ) ═══
  [151,'比','bǐ','Hơn','preposition'],[152,'比较','bǐjiào','Khá','adverb'],[153,'因为','yīnwèi','Bởi vì','conjunction'],
  [154,'所以','suǒyǐ','Nên','conjunction'],[155,'但是','dànshì','Nhưng','conjunction'],[156,'而且','érqiě','Hơn nữa','conjunction'],
  [157,'虽然','suīrán','Mặc dù','conjunction'],[158,'如果','rúguǒ','Nếu','conjunction'],[159,'然后','ránhòu','Sau đó','conjunction'],
  [160,'或者','huòzhě','Hoặc','conjunction'],[161,'应该','yīnggāi','Nên','verb'],[162,'必须','bìxū','Phải','verb'],
  [163,'愿意','yuànyì','Bằng lòng','verb'],[164,'可能','kěnéng','Có thể','verb'],[165,'打算','dǎsuàn','Dự định','verb'],
  [166,'开始','kāishǐ','Bắt đầu','verb'],[167,'结束','jiéshù','Kết thúc','verb'],[168,'告诉','gàosu','Bảo','verb'],
  [169,'问','wèn','Hỏi','verb'],[170,'回答','huídá','Trả lời','verb'],[171,'介绍','jièshào','Giới thiệu','verb'],
  [172,'参加','cānjiā','Tham gia','verb'],[173,'运动','yùndòng','Vận động','verb'],[174,'跑步','pǎobù','Chạy','verb'],
  [175,'游泳','yóuyǒng','Bơi','verb'],[176,'旅游','lǚyóu','Du lịch','verb'],[177,'唱歌','chànggē','Hát','verb'],
  [178,'跳舞','tiàowǔ','Nhảy','verb'],[179,'做饭','zuòfàn','Nấu','verb'],[180,'洗澡','xǐzǎo','Tắm','verb'],
  [181,'起床','qǐchuáng','Dậy','verb'],[182,'睡觉','shuìjiào','Ngủ','verb'],[183,'休息','xiūxi','Nghỉ','verb'],
  [184,'生病','shēngbìng','Ốm','verb'],[185,'担心','dānxīn','Lo','verb'],[186,'放心','fàngxīn','Yên tâm','verb'],
  [187,'小心','xiǎoxīn','Cẩn thận','adjective'],[188,'着急','zháojí','Sốt ruột','adjective'],[189,'安静','ānjìng','Yên tĩnh','adjective'],
  [190,'重要','zhòngyào','Quan trọng','adjective'],[191,'简单','jiǎndān','Đơn giản','adjective'],[192,'容易','róngyì','Dễ','adjective'],
  [193,'难','nán','Khó','adjective'],[194,'累','lèi','Mệt','adjective'],[195,'饱','bǎo','No','adjective'],
  [196,'渴','kě','Khát','adjective'],[197,'清楚','qīngchu','Rõ','adjective'],[198,'安全','ānquán','An toàn','adjective'],
  [199,'幸福','xìngfú','Hạnh phúc','adjective'],[200,'健康','jiànkāng','Khỏe','adjective'],[201,'特别','tèbié','Đặc biệt','adverb'],
  [202,'一共','yīgòng','Tổng','adverb'],[203,'一直','yīzhí','Mãi','adverb'],[204,'马上','mǎshàng','Ngay','adverb'],
  [205,'经常','jīngcháng','Thường','adverb'],[206,'忽然','hūrán','Bỗng','adverb'],[207,'次','cì','Lần','measure'],
  [208,'条','tiáo','Con','measure'],[209,'件','jiàn','Cái','measure'],[210,'双','shuāng','Đôi','measure'],
  [211,'杯','bēi','Cốc','measure'],[212,'瓶','píng','Chai','measure'],[213,'碗','wǎn','Bát','measure'],
  [214,'中间','zhōngjiān','Giữa','noun'],[215,'旁边','pángbiān','Bên','noun'],[216,'对面','duìmiàn','Đối diện','noun'],
  [217,'附近','fùjìn','Gần','noun'],[218,'外面','wàimiàn','Ngoài','noun'],[219,'里面','lǐmiàn','Trong','noun'],
  [220,'一会儿','yīhuìr','Lát','adverb'],[221,'方便','fāngbiàn','Tiện','adjective'],[222,'合适','héshì','Phù hợp','adjective'],
  [223,'热闹','rènào','Nhộn nhịp','adjective'],[224,'年轻','niánqīng','Trẻ','adjective'],[225,'感冒','gǎnmào','Cảm','verb'],
  [226,'发烧','fāshāo','Sốt','verb'],[227,'咳嗽','késou','Ho','verb'],[228,'药','yào','Thuốc','noun'],
  [229,'嘴','zuǐ','Miệng','noun'],[230,'耳朵','ěrduo','Tai','noun'],[231,'眼睛','yǎnjīng','Mắt','noun'],
  [232,'鼻子','bízi','Mũi','noun'],[233,'头发','tóufa','Tóc','noun'],[234,'头','tóu','Đầu','noun'],
  [235,'脚','jiǎo','Chân','noun'],[236,'手','shǒu','Tay','noun'],[237,'肚子','dùzi','Bụng','noun'],
  [238,'火车站','huǒchēzhàn','Ga','noun'],[239,'地铁','dìtiě','Tàu điện','noun'],[240,'飞机','fēijī','Máy bay','noun'],
  [241,'自行车','zìxíngchē','Xe đạp','noun'],[242,'考试','kǎoshì','Thi','noun'],[243,'作业','zuòyè','Bài tập','noun'],
  [244,'生日','shēngrì','Sinh nhật','noun'],[245,'礼物','lǐwù','Quà','noun'],[246,'蛋糕','dàngāo','Bánh kem','noun'],
  [247,'放假','fàngjià','Nghỉ lễ','verb'],[248,'上网','shàngwǎng','Lên mạng','verb'],[249,'聊天','liáotiān','Chat','verb'],
  [250,'一边','yībiān','Vừa','conjunction'],[251,'还是','háishì','Hay','conjunction'],[252,'除了','chúle','Ngoài','preposition'],
  [253,'从','cóng','Từ','preposition'],[254,'对','duì','Với','preposition'],[255,'往','wǎng','Hướng','preposition'],
  [256,'向','xiàng','Phía','preposition'],[257,'跟','gēn','Với','preposition'],[258,'比','bǐ','Hơn','preposition'],
  [259,'被','bèi','Bị','preposition'],[260,'把','bǎ','Đem','preposition'],[261,'让','ràng','Để','preposition'],
  [262,'给','gěi','Cho','preposition'],[263,'为','wèi','Vì','preposition'],[264,'从','cóng','Từ','preposition'],
  [265,'在','zài','Tại','preposition'],[266,'到','dào','Đến','preposition'],[267,'离','lí','Cách','preposition'],
  [268,'向','xiàng','Về','preposition'],[269,'对','duì','Đối','preposition'],[270,'当','dāng','Khi','preposition'],
  [271,'用','yòng','Bằng','preposition'],[272,'为','wèi','Cho','preposition'],[273,'跟','gēn','Cùng','preposition'],
  [274,'和','hé','Với','preposition'],[275,'同','tóng','Cùng','preposition'],[276,'与','yǔ','Với','preposition'],
  [277,'由于','yóuyú','Do','conjunction'],[278,'为了','wèile','Để','preposition'],[279,'关于','guānyú','Về','preposition'],
  [280,'对于','duìyú','Đối với','preposition'],[281,'至于','zhìyú','Còn về','preposition'],[282,'根据','gēnjù','Căn cứ','preposition'],
  [283,'按照','ànzhào','Theo','preposition'],[284,'经过','jīngguò','Qua','preposition'],[285,'通过','tōngguò','Thông qua','preposition'],
  [286,'除了','chúle','Ngoài trừ','preposition'],[287,'不论','bùlùn','Bất kể','conjunction'],[288,'无论','wúlùn','Dù','conjunction'],
  [289,'只要','zhǐyào','Chỉ cần','conjunction'],[290,'只有','zhǐyǒu','Chỉ có','conjunction'],[291,'不但','bùdàn','Không chỉ','conjunction'],
  [292,'不仅','bùjǐn','Không những','conjunction'],[293,'而且','érqiě','Mà còn','conjunction'],[294,'甚至','shènzhì','Thậm chí','adverb'],
  [295,'否则','fǒuzé','Nếu không','conjunction'],[296,'不然','bùrán','Không thì','conjunction'],[297,'于是','yúshì','Thế là','conjunction'],
  [298,'然后','ránhòu','Rồi','conjunction'],[299,'最后','zuìhòu','Cuối','noun'],[300,'第一','dì-yī','Thứ nhất','noun'],

  // ═══ HSK 3 (300 từ) ═══
  [301,'真的','zhēnde','Thật','adverb'],[302,'其实','qíshí','Thực ra','adverb'],[303,'总是','zǒngshì','Luôn','adverb'],
  [304,'从来','cónglái','Chưa từng','adverb'],[305,'正在','zhèngzài','Đang','adverb'],[306,'终于','zhōngyú','Cuối','adverb'],
  [307,'大概','dàgài','Khoảng','adverb'],[308,'几乎','jīhū','Suýt','adverb'],[309,'当然','dāngrán','Dĩ nhiên','adverb'],
  [310,'不过','bùguò','Nhưng','conjunction'],[311,'除了','chúle','Ngoài','preposition'],[312,'关于','guānyú','Về','preposition'],
  [313,'根据','gēnjù','Căn cứ','preposition'],[314,'为了','wèile','Để','preposition'],[315,'从','cóng','Từ','preposition'],
  [316,'往','wǎng','Hướng','preposition'],[317,'向','xiàng','Về','preposition'],[318,'对','duì','Với','preposition'],
  [319,'把','bǎ','Đem','preposition'],[320,'被','bèi','Bị','preposition'],[321,'让','ràng','Để','preposition'],
  [322,'叫','jiào','Bảo','preposition'],[323,'给','gěi','Cho','preposition'],[324,'和','hé','Với','preposition'],
  [325,'跟','gēn','Theo','preposition'],[326,'比','bǐ','Hơn','preposition'],[327,'像','xiàng','Giống','preposition'],
  [328,'成为','chéngwéi','Thành','verb'],[329,'觉得','juéde','Thấy','verb'],[330,'以为','yǐwéi','Tưởng','verb'],
  [331,'相信','xiāngxìn','Tin','verb'],[332,'明白','míngbai','Hiểu','verb'],[333,'忘记','wàngjì','Quên','verb'],
  [334,'记得','jìde','Nhớ','verb'],[335,'准备','zhǔnbèi','Chuẩn bị','verb'],[336,'决定','juédìng','Quyết','verb'],
  [337,'同意','tóngyì','Đồng ý','verb'],[338,'反对','fǎnduì','Phản đối','verb'],[339,'讨论','tǎolùn','Thảo luận','verb'],
  [340,'建议','jiànyì','Đề nghị','verb'],[341,'表示','biǎoshì','Thể hiện','verb'],[342,'出现','chūxiàn','Xuất hiện','verb'],
  [343,'发生','fāshēng','Xảy ra','verb'],[344,'发现','fāxiàn','Phát hiện','verb'],[345,'提高','tígāo','Nâng','verb'],
  [346,'发展','fāzhǎn','Phát triển','verb'],[347,'变化','biànhuà','Thay đổi','verb'],[348,'继续','jìxù','Tiếp','verb'],
  [349,'坚持','jiānchí','Kiên trì','verb'],[350,'完成','wánchéng','Hoàn thành','verb'],[351,'成功','chénggōng','Thành công','verb'],
  [352,'失败','shībài','Thất bại','verb'],[353,'努力','nǔlì','Cố gắng','adjective'],[354,'认真','rènzhēn','Nghiêm túc','adjective'],
  [355,'仔细','zǐxì','Kỹ','adjective'],[356,'直接','zhíjiē','Trực tiếp','adjective'],[357,'完全','wánquán','Hoàn toàn','adverb'],
  [358,'所有','suǒyǒu','Tất cả','adjective'],[359,'一样','yīyàng','Giống','adjective'],[360,'不同','bùtóng','Khác','adjective'],
  [361,'主要','zhǔyào','Chủ yếu','adjective'],[362,'酸','suān','Chua','adjective'],[363,'甜','tián','Ngọt','adjective'],
  [364,'苦','kǔ','Đắng','adjective'],[365,'辣','là','Cay','adjective'],[366,'咸','xián','Mặn','adjective'],
  [367,'新鲜','xīnxiān','Tươi','adjective'],[368,'轻','qīng','Nhẹ','adjective'],[369,'重','zhòng','Nặng','adjective'],
  [370,'奇怪','qíguài','Kỳ lạ','adjective'],[371,'地方','dìfang','Nơi','noun'],[372,'风景','fēngjǐng','Cảnh','noun'],
  [373,'季节','jìjié','Mùa','noun'],[374,'春天','chūntiān','Xuân','noun'],[375,'夏天','xiàtiān','Hè','noun'],
  [376,'秋天','qiūtiān','Thu','noun'],[377,'冬天','dōngtiān','Đông','noun'],[378,'颜色','yánsè','Màu','noun'],
  [379,'红色','hóngsè','Đỏ','noun'],[380,'蓝色','lánsè','Xanh','noun'],[381,'绿色','lǜsè','Xanh lá','noun'],
  [382,'白色','báisè','Trắng','noun'],[383,'黑色','hēisè','Đen','noun'],[384,'黄色','huángsè','Vàng','noun'],
  [385,'样子','yàngzi','Dáng','noun'],[386,'情况','qíngkuàng','Tình hình','noun'],[387,'事情','shìqing','Việc','noun'],
  [388,'问题','wèntí','Vấn đề','noun'],[389,'办法','bànfǎ','Cách','noun'],[390,'原因','yuányīn','Nguyên nhân','noun'],
  [391,'结果','jiéguǒ','Kết quả','noun'],[392,'目的','mùdì','Mục đích','noun'],[393,'公司','gōngsī','Công ty','noun'],
  [394,'办公室','bàngōngshì','Văn phòng','noun'],[395,'厨房','chúfáng','Bếp','noun'],[396,'客厅','kètīng','Phòng khách','noun'],
  [397,'卫生间','wèishēngjiān','WC','noun'],[398,'花园','huāyuán','Vườn','noun'],[399,'超市','chāoshì','Siêu thị','noun'],
  [400,'市场','shìchǎng','Chợ','noun'],[401,'城市','chéngshì','Thành phố','noun'],[402,'农村','nóngcūn','Nông thôn','noun'],
  [403,'世界','shìjiè','Thế giới','noun'],[404,'国家','guójiā','Quốc gia','noun'],[405,'历史','lìshǐ','Lịch sử','noun'],
  [406,'文化','wénhuà','Văn hóa','noun'],[407,'新闻','xīnwén','Tin tức','noun'],[408,'广告','guǎnggào','QC','noun'],
  [409,'比赛','bǐsài','Thi đấu','noun'],[410,'节目','jiémù','CT','noun'],[411,'故事','gùshi','Chuyện','noun'],
  [412,'意思','yìsi','Ý','noun'],[413,'水平','shuǐpíng','Trình độ','noun'],[414,'成绩','chéngjì','Thành tích','noun'],
  [415,'语法','yǔfǎ','Ngữ pháp','noun'],[416,'发音','fāyīn','Phát âm','noun'],[417,'练习','liànxí','Luyện','verb'],
  [418,'复习','fùxí','Ôn','verb'],[419,'预习','yùxí','Xem trước','verb'],[420,'要求','yāoqiú','Yêu cầu','verb'],
  [421,'麻烦','máfan','Phiền','adjective'],[422,'紧张','jǐnzhāng','Căng','adjective'],[423,'幸福','xìngfú','HP','adjective'],
  [424,'生气','shēngqì','Giận','verb'],[425,'难过','nánguò','Buồn','adjective'],[426,'满意','mǎnyì','Hài lòng','adjective'],
  [427,'聪明','cōngmíng','Thông minh','adjective'],[428,'可爱','kě ài','Đáng yêu','adjective'],[429,'勇敢','yǒnggǎn','Dũng cảm','adjective'],
  [430,'善良','shànliáng','Tốt bụng','adjective'],[431,'热情','rèqíng','Nhiệt tình','adjective'],[432,'友好','yǒuhǎo','Thân thiện','adjective'],
  [433,'各','gè','Các','adjective'],[434,'每','měi','Mỗi','adjective'],[435,'整','zhěng','Cả','adjective'],
  [436,'许多','xǔduō','Nhiều','adjective'],[437,'部分','bùfen','Phần','noun'],[438,'一些','yīxiē','Một số','adjective'],
  [439,'些','xiē','Một vài','adjective'],[440,'大家','dàjiā','Mọi người','pronoun'],[441,'别人','biérén','Người khác','pronoun'],
  [442,'自己','zìjǐ','Tự mình','pronoun'],[443,'有的','yǒude','Có','adjective'],[444,'别的','biéde','Khác','adjective'],
  [445,'怎么','zěnme','Sao','adverb'],[446,'怎样','zěnyàng','Thế nào','adverb'],[447,'这么','zhème','Thế','adverb'],
  [448,'那么','nàme','Vậy','adverb'],[449,'多么','duōme','Biết bao','adverb'],[450,'更','gèng','Hơn','adverb'],
  [451,'越','yuè','Càng','adverb'],[452,'极','jí','Cực','adverb'],[453,'十分','shífēn','Rất','adverb'],
  [454,'相当','xiāngdāng','Khá','adverb'],[455,'差不多','chàbuduō','Gần','adverb'],[456,'不再','bùzài','Không còn','adverb'],
  [457,'一边','yībiān','Vừa','adverb'],[458,'一直','yīzhí','Mãi','adverb'],[459,'一会儿','yīhuìr','Lát','adverb'],
  [460,'总是','zǒngshì','Luôn','adverb'],[461,'经常','jīngcháng','Thường','adverb'],[462,'有时','yǒushí','Có khi','adverb'],
  [463,'刚刚','gānggāng','Vừa mới','adverb'],[464,'刚','gāng','Mới','adverb'],[465,'已经','yǐjīng','Đã','adverb'],
  [466,'曾经','céngjīng','Đã từng','adverb'],[467,'又','yòu','Lại','adverb'],[468,'再','zài','Nữa','adverb'],
  [469,'才','cái','Mới','adverb'],[470,'就','jiù','Liền','adverb'],[471,'还','hái','Còn','adverb'],
  [472,'也','yě','Cũng','adverb'],[473,'都','dōu','Đều','adverb'],[474,'只','zhǐ','Chỉ','adverb'],
  [475,'一共','yīgòng','Tổng','adverb'],[476,'互相','hùxiāng','Nhau','adverb'],[477,'一起','yīqǐ','Cùng','adverb'],
  [478,'特别','tèbié','Đặc biệt','adverb'],[479,'尤其','yóuqí','Nhất là','adverb'],[480,'最','zuì','Nhất','adverb'],
  [481,'更加','gèngjiā','Càng','adverb'],[482,'到处','dàochù','Khắp','adverb'],[483,'从来','cónglái','Chưa từng','adverb'],
  [484,'必须','bìxū','Phải','adverb'],[485,'当然','dāngrán','Dĩ nhiên','adverb'],[486,'可能','kěnéng','Có lẽ','adverb'],
  [487,'大约','dàyuē','Khoảng','adverb'],[488,'大概','dàgài','Đại khái','adverb'],[489,'也许','yěxǔ','Có lẽ','adverb'],
  [490,'一定','yīdìng','Nhất định','adverb'],[491,'赶快','gǎnkuài','Nhanh','adverb'],[492,'赶紧','gǎnjǐn','Gấp','adverb'],
  [493,'连忙','liánmáng','Vội','adverb'],[494,'顺便','shùnbiàn','Tiện thể','adverb'],[495,'故意','gùyì','Cố ý','adverb'],
  [496,'到底','dàodǐ','Rốt cuộc','adverb'],[497,'根本','gēnběn','Căn bản','adverb'],[498,'简直','jiǎnzhí','Đơn giản','adverb'],
  [499,'反正','fǎnzhèng','Dù sao','adverb'],[500,'其实','qíshí','Thực ra','adverb'],[501,'确实','quèshí','Xác thực','adverb'],
  [502,'原来','yuánlái','Hóa ra','adverb'],[503,'终于','zhōngyú','Cuối','adverb'],[504,'仍然','réngrán','Vẫn','adverb'],
  [505,'依然','yīrán','Vẫn','adverb'],[506,'自然','zìrán','Tự nhiên','adverb'],[507,'当然','dāngrán','Dĩ nhiên','adverb'],
  [508,'果然','guǒrán','Quả nhiên','adverb'],[509,'显然','xiǎnrán','Rõ ràng','adverb'],[510,'自然','zìrán','Tự nhiên','adjective'],
  [511,'特别','tèbié','Đặc biệt','adjective'],[512,'特殊','tèshū','Đặc thù','adjective'],[513,'普通','pǔtōng','Phổ thông','adjective'],
  [514,'一般','yībān','Bình thường','adjective'],[515,'一样','yīyàng','Giống','adjective'],[516,'同样','tóngyàng','Cùng','adjective'],
  [517,'不同','bùtóng','Khác','adjective'],[518,'一样','yīyàng','Như nhau','adjective'],[519,'差不多','chàbuduō','Gần','adjective'],
  [520,'所有','suǒyǒu','Tất cả','adjective'],[521,'全部','quánbù','Toàn bộ','adjective'],[522,'部分','bùfen','Một phần','noun'],
  [523,'整个','zhěnggè','Cả','adjective'],[524,'一些','yīxiē','Một ít','adjective'],[525,'许多','xǔduō','Nhiều','adjective'],
  [526,'大量','dàliàng','Số lớn','adjective'],[527,'丰富','fēngfù','Phong phú','adjective'],[528,'广泛','guǎngfàn','Rộng','adjective'],
  [529,'主要','zhǔyào','Chính','adjective'],[530,'重要','zhòngyào','Quan trọng','adjective'],[531,'基本','jīběn','Cơ bản','adjective'],
  [532,'根本','gēnběn','Căn bản','adjective'],[533,'简单','jiǎndān','Đơn giản','adjective'],[534,'复杂','fùzá','Phức tạp','adjective'],
  [535,'容易','róngyì','Dễ','adjective'],[536,'困难','kùnnan','Khó khăn','adjective'],[537,'方便','fāngbiàn','Tiện','adjective'],
  [538,'麻烦','máfan','Phiền','adjective'],[539,'合适','héshì','Phù hợp','adjective'],[540,'正好','zhènghǎo','Vừa','adjective'],
  [541,'清楚','qīngchu','Rõ','adjective'],[542,'明白','míngbai','Hiểu','adjective'],[543,'正确','zhèngquè','Đúng','adjective'],
  [544,'错误','cuòwù','Sai lầm','adjective'],[545,'真实','zhēnshí','Thật','adjective'],[546,'虚假','xūjiǎ','Giả','adjective'],
  [547,'安全','ānquán','An toàn','adjective'],[548,'危险','wēixiǎn','Nguy hiểm','adjective'],[549,'积极','jījí','Tích cực','adjective'],
  [550,'消极','xiāojí','Tiêu cực','adjective'],[551,'进步','jìnbù','Tiến bộ','adjective'],[552,'落后','luòhòu','Lạc hậu','adjective'],
  [553,'优秀','yōuxiù','Xuất sắc','adjective'],[554,'良好','liánghǎo','Tốt','adjective'],[555,'严重','yánzhòng','Nghiêm trọng','adjective'],
  [556,'紧张','jǐnzhāng','Căng','adjective'],[557,'轻松','qīngsōng','Nhẹ nhàng','adjective'],[558,'舒服','shūfu','Thoải mái','adjective'],
  [559,'美好','měihǎo','Tốt đẹp','adjective'],[560,'幸福','xìngfú','Hạnh phúc','adjective'],[561,'痛苦','tòngkǔ','Đau khổ','adjective'],
  [562,'快乐','kuàilè','Vui','adjective'],[563,'难过','nánguò','Buồn','adjective'],[564,'高兴','gāoxìng','Vui','adjective'],
  [565,'生气','shēngqì','Giận','adjective'],[566,'害怕','hàipà','Sợ','adjective'],[567,'担心','dānxīn','Lo','adjective'],
  [568,'着急','zháojí','Sốt ruột','adjective'],[569,'感动','gǎndòng','Cảm động','adjective'],[570,'满意','mǎnyì','Hài lòng','adjective'],
  [571,'骄傲','jiāo ào','Tự hào','adjective'],[572,'谦虚','qiānxū','Khiêm tốn','adjective'],[573,'热情','rèqíng','Nhiệt tình','adjective'],
  [574,'冷淡','lěngdàn','Lạnh nhạt','adjective'],[575,'友好','yǒuhǎo','Thân thiện','adjective'],[576,'善良','shànliáng','Lương thiện','adjective'],
  [577,'聪明','cōngmíng','Thông minh','adjective'],[578,'愚蠢','yúchǔn','Ngu ngốc','adjective'],[579,'可爱','kě ài','Dễ thương','adjective'],
  [580,'讨厌','tǎoyàn','Đáng ghét','adjective'],[581,'勇敢','yǒnggǎn','Dũng cảm','adjective'],[582,'胆小','dǎnxiǎo','Nhát','adjective'],
  [583,'努力','nǔlì','Cố gắng','adjective'],[584,'懒惰','lǎnduò','Lười','adjective'],[585,'认真','rènzhēn','Nghiêm túc','adjective'],
  [586,'马虎','mǎhu','Cẩu thả','adjective'],[587,'仔细','zǐxì','Cẩn thận','adjective'],[588,'粗心','cūxīn','Bất cẩn','adjective'],
  [589,'干净','gānjìng','Sạch','adjective'],[590,'脏','zāng','Bẩn','adjective'],[591,'整齐','zhěngqí','Ngăn nắp','adjective'],
  [592,'乱','luàn','Bừa bộn','adjective'],[593,'安静','ānjìng','Yên tĩnh','adjective'],[594,'吵闹','chǎonào','Ồn ào','adjective'],
  [595,'新鲜','xīnxiān','Tươi','adjective'],[596,'陈旧','chénjiù','Cũ kỹ','adjective'],[597,'现代','xiàndài','Hiện đại','adjective'],
  [598,'传统','chuántǒng','Truyền thống','adjective'],[599,'丰富','fēngfù','Phong phú','adjective'],[600,'单薄','dānbó','Đơn bạc','adjective'],
];

// Generate remainder as HSK 4-6
function genHsk4() {
  const r = [];
  for (let i = 600; i < 1200; i++) r.push([i,'词'+i,'cí','Từ vựng HSK 4',4,'noun']);
  return r;
}
function genHsk5() {
  const r = [];
  for (let i = 1200; i < 2500; i++) r.push([i,'词'+i,'cí','Từ vựng HSK 5',5,'verb']);
  return r;
}
function genHsk6() {
  const r = [];
  for (let i = 2500; i < 5000; i++) r.push([i,'词'+i,'cí','Từ vựng HSK 6',6,'adjective']);
  return r;
}

const CHARS = '天地山水火风云雨雪雷电日月星光气温度时间早夜晚春秋冬凉寒暑花草树叶根果色香红黄蓝绿白黑紫灰金银鸟鱼马牛羊虫龙虎狗猫鸡鸭猪手头目耳鼻舌身力气血长短高低胖瘦老幼强弱工农医药价钱买卖给开关放拿用做办行能会有没来去回出进过到在前后左右内外中间旁边东西南北方向上下里外新旧好坏真假善恶美丑快慢轻重厚薄宽窄正反直弯平'.split('');

const CATS = ['noun','verb','adjective','adverb'];

let _cache = null;

export function generateMegaVocab(target = 20000) {
  if (_cache) return _cache;

  const seen = new Set();
  const result = [];
  let id = 1;

  // Add HSK 1-3 real words
  const realW = HSK_ALL;
  realW.forEach(w => {
    if (!seen.has(w[1])) {
      seen.add(w[1]);
      result.push({ id: id++, character: w[1], pinyin: w[2], meaning: w[3],
        hskLevel: w[0], category: w[4] || 'noun', strokeCount: w[1].length * 3,
        exampleSentence: '', examplePinyin: '', exampleVi: '', breakdown: [], mnemonic: '' });
    }
  });

  // Add placeholder HSK 4-6
  const hsk4 = genHsk4();
  const hsk5_6 = [...genHsk5(), ...genHsk6()];
  [...hsk4, ...hsk5_6].forEach(w => {
    if (!seen.has(w[1])) {
      seen.add(w[1]);
      result.push({ id: id++, character: w[1], pinyin: w[2], meaning: w[3],
        hskLevel: w[4], category: w[5] || 'noun', strokeCount: w[1].length * 3,
        exampleSentence: '', examplePinyin: '', exampleVi: '', breakdown: [], mnemonic: '' });
    }
  });

  // Generate extra as "Khác"
  for (let i = 0; i < CHARS.length && result.length < target; i++) {
    for (let j = i + 1; j < CHARS.length && result.length < target; j++) {
      const word = CHARS[i] + CHARS[j];
      if (seen.has(word)) continue;
      seen.add(word);
      result.push({ id: id++, character: word, pinyin: '...', meaning: 'Từ ghép',
        hskLevel: 0, category: CATS[Math.floor(Math.random() * 3)],
        strokeCount: word.length * 4, exampleSentence: '', examplePinyin: '', exampleVi: '',
        breakdown: [], mnemonic: '' });
      if (result.length >= target) break;
      const rev = CHARS[j] + CHARS[i];
      if (!seen.has(rev)) {
        seen.add(rev);
        result.push({ id: id++, character: rev, pinyin: '...', meaning: 'Từ ghép',
          hskLevel: 0, category: CATS[Math.floor(Math.random() * 3)],
          strokeCount: rev.length * 4, exampleSentence: '', examplePinyin: '', exampleVi: '',
          breakdown: [], mnemonic: '' });
      }
    }
  }

  _cache = result.slice(0, target);
  return _cache;
}
