import React, { useState } from 'react';

const grammarData = [
  {
    id: 1,
    title: 'Cấu trúc câu cơ bản: 是 (shì) = là',
    icon: '📖',
    level: 'HSK 1',
    sections: [
      {
        heading: 'Cách dùng 是',
        content: '是 (shì) = "là". Đây là động từ "to be" trong tiếng Trung. Không giống tiếng Anh, 是 không thay đổi theo chủ ngữ.',
        examples: [
          { cn: '我是学生。', pinyin: 'Wǒ shì xuéshēng.', vi: 'Tôi là học sinh.' },
          { cn: '她是老师。', pinyin: 'Tā shì lǎoshī.', vi: 'Cô ấy là giáo viên.' },
          { cn: '这是书。', pinyin: 'Zhè shì shū.', vi: 'Đây là sách.' }
        ]
      },
      {
        heading: 'Phủ định: 不是 (bù shì)',
        content: 'Thêm 不 (bù) trước 是 để tạo câu phủ định.',
        examples: [
          { cn: '我不是中国人。', pinyin: 'Wǒ bù shì Zhōngguó rén.', vi: 'Tôi không phải là người Trung Quốc.' },
          { cn: '那不是猫。', pinyin: 'Nà bù shì māo.', vi: 'Đó không phải mèo.' }
        ]
      },
      {
        heading: 'Câu hỏi với 吗 (ma)',
        content: 'Thêm 吗 vào cuối câu trần thuật để tạo câu hỏi Yes/No.',
        examples: [
          { cn: '你是越南人吗？', pinyin: 'Nǐ shì Yuènán rén ma?', vi: 'Bạn là người Việt Nam phải không?' },
          { cn: '这是你的书吗？', pinyin: 'Zhè shì nǐ de shū ma?', vi: 'Đây là sách của bạn phải không?' }
        ]
      }
    ]
  },
  {
    id: 2,
    title: 'Lượng từ (量词 liàngcí)',
    icon: '📏',
    level: 'HSK 1',
    sections: [
      {
        heading: 'Lượng từ là gì?',
        content: 'Tiếng Trung bắt buộc dùng lượng từ giữa số từ và danh từ. Giống "cái", "con", "chiếc" trong tiếng Việt nhưng nghiêm ngặt hơn nhiều.',
        examples: []
      },
      {
        heading: 'Các lượng từ thông dụng',
        content: '',
        examples: [
          { cn: '一个 (yī gè)', pinyin: '', vi: 'Dùng cho người, vật nói chung (phổ biến nhất)' },
          { cn: '一本 (yī běn)', pinyin: '', vi: 'Sách, vở (vật có gáy)' },
          { cn: '一张 (yī zhāng)', pinyin: '', vi: 'Giấy, vé, bàn, giường (vật phẳng)' },
          { cn: '一只 (yī zhī)', pinyin: '', vi: 'Động vật (chó, mèo, chim...)' },
          { cn: '一条 (yī tiáo)', pinyin: '', vi: 'Vật dài (cá, rắn, quần, đường...)' },
          { cn: '一杯 (yī bēi)', pinyin: '', vi: 'Đồ uống (cốc nước, trà, cà phê)' },
          { cn: '一碗 (yī wǎn)', pinyin: '', vi: 'Bát (cơm, mì, canh)' },
          { cn: '一把 (yī bǎ)', pinyin: '', vi: 'Vật có cán (ô, dao, ghế)' }
        ]
      },
      {
        heading: 'Ví dụ',
        content: '',
        examples: [
          { cn: '我要一杯咖啡。', pinyin: 'Wǒ yào yī bēi kāfēi.', vi: 'Tôi muốn một cốc cà phê.' },
          { cn: '他有一只猫。', pinyin: 'Tā yǒu yī zhī māo.', vi: 'Anh ấy có một con mèo.' },
          { cn: '请给我一张纸。', pinyin: 'Qǐng gěi wǒ yī zhāng zhǐ.', vi: 'Xin cho tôi một tờ giấy.' }
        ]
      }
    ]
  },
  {
    id: 3,
    title: 'Trợ từ 的 (de) = của / sở hữu',
    icon: '🔗',
    level: 'HSK 1',
    sections: [
      {
        heading: 'Cách dùng 的',
        content: '的 là trợ từ sở hữu phổ biến nhất. Đặt giữa người sở hữu và vật bị sở hữu.',
        examples: [
          { cn: '我的书', pinyin: 'Wǒ de shū', vi: 'Sách của tôi' },
          { cn: '你的手机', pinyin: 'Nǐ de shǒujī', vi: 'Điện thoại của bạn' },
          { cn: '老师的名字', pinyin: 'Lǎoshī de míngzì', vi: 'Tên của giáo viên' }
        ]
      },
      {
        heading: 'Khi nào KHÔNG cần 的',
        content: 'Không dùng 的 với: quan hệ thân thuộc gần (我妈妈 = mẹ tôi), tên công ty/trường học, tính từ ngắn + danh từ (好朋友 = bạn tốt).',
        examples: [
          { cn: '我妈妈（✅ 不用 的）', pinyin: 'Wǒ māma', vi: 'Mẹ tôi' },
          { cn: '好朋友（✅ 不用 的）', pinyin: 'Hǎo péngyǒu', vi: 'Bạn tốt' }
        ]
      }
    ]
  },
  {
    id: 4,
    title: 'Câu hỏi với 吗 / 呢 / 什么',
    icon: '❓',
    level: 'HSK 1',
    sections: [
      {
        heading: '吗 (ma) — Câu hỏi Yes/No',
        content: 'Thêm 吗 vào cuối câu trần thuật. Đây là cách hỏi đơn giản nhất.',
        examples: [
          { cn: '你会说中文吗？', pinyin: 'Nǐ huì shuō Zhōngwén ma?', vi: 'Bạn biết nói tiếng Trung không?' },
          { cn: '你吃饭了吗？', pinyin: 'Nǐ chīfàn le ma?', vi: 'Bạn ăn cơm chưa?' }
        ]
      },
      {
        heading: '呢 (ne) — "Còn...?"',
        content: '呢 dùng để hỏi "Còn... thì sao?" — thường dùng sau một câu trần thuật.',
        examples: [
          { cn: '我很好，你呢？', pinyin: 'Wǒ hěn hǎo, nǐ ne?', vi: 'Tôi rất khỏe, còn bạn?' },
          { cn: '我在学中文，你呢？', pinyin: 'Wǒ zài xué Zhōngwén, nǐ ne?', vi: 'Tôi đang học tiếng Trung, còn bạn?' }
        ]
      },
      {
        heading: '什么 (shénme) — "Cái gì?"',
        content: 'Đặt 什么 vào vị trí của vật/việc cần hỏi.',
        examples: [
          { cn: '你叫什么名字？', pinyin: 'Nǐ jiào shénme míngzì?', vi: 'Bạn tên gì?' },
          { cn: '你想吃什么？', pinyin: 'Nǐ xiǎng chī shénme?', vi: 'Bạn muốn ăn gì?' },
          { cn: '这是什么？', pinyin: 'Zhè shì shénme?', vi: 'Đây là cái gì?' }
        ]
      }
    ]
  },
  {
    id: 8,
    title: 'Từ vựng thời gian & Thứ tự',
    icon: '⏰',
    level: 'HSK 1',
    sections: [
      {
        heading: 'Thứ tự thời gian trong câu',
        content: 'Trong tiếng Trung, thời gian luôn đặt trước động từ và thường ở đầu câu. Thứ tự: Năm → Tháng → Ngày → Giờ.',
        examples: [
          { cn: '我每天早上八点上班。', pinyin: 'Wǒ měitiān zǎoshang bā diǎn shàngbān.', vi: 'Mỗi ngày tôi đi làm lúc 8 giờ sáng.' },
          { cn: '她二零二四年三月来越南。', pinyin: 'Tā èr líng èr sì nián sān yuè lái Yuènán.', vi: 'Cô ấy đến Việt Nam vào tháng 3 năm 2024.' }
        ]
      },
      {
        heading: 'Từ vựng thời gian cơ bản',
        content: '',
        examples: [
          { cn: '今天 (jīntiān) = hôm nay', pinyin: '', vi: '' },
          { cn: '明天 (míngtiān) = ngày mai', pinyin: '', vi: '' },
          { cn: '昨天 (zuótiān) = hôm qua', pinyin: '', vi: '' },
          { cn: '早上 (zǎoshang) = buổi sáng', pinyin: '', vi: '' },
          { cn: '下午 (xiàwǔ) = buổi chiều', pinyin: '', vi: '' },
          { cn: '晚上 (wǎnshang) = buổi tối', pinyin: '', vi: '' },
          { cn: '现在 (xiànzài) = bây giờ', pinyin: '', vi: '' },
          { cn: '年 (nián) = năm', pinyin: '', vi: '' },
          { cn: '月 (yuè) = tháng', pinyin: '', vi: '' },
          { cn: '号 (hào) / 日 (rì) = ngày', pinyin: '', vi: '' }
        ]
      }
    ]
  },

  // ═══ PHÓ TỪ — HSK 1 ═══
  {
    id: 9,
    title: '副词 Phó từ mức độ: 很 / 太 / 非常 / 真',
    icon: '📊',
    level: 'HSK 1',
    sections: [
      {
        heading: '很 (hěn) — Rất',
        content: '很 là phó từ mức độ cơ bản nhất. Trong câu "chủ ngữ + 很 + tính từ", 很 thường chỉ là cầu nối ngữ pháp, không nhấn mạnh "rất". Nếu bỏ 很, câu sẽ mang nghĩa so sánh.',
        examples: [
          { cn: '我很好。', pinyin: 'Wǒ hěn hǎo.', vi: 'Tôi khỏe.' },
          { cn: '今天很热。', pinyin: 'Jīntiān hěn rè.', vi: 'Hôm nay nóng.' },
          { cn: '她很漂亮。', pinyin: 'Tā hěn piàoliang.', vi: 'Cô ấy đẹp.' },
          { cn: '中文很难。', pinyin: 'Zhōngwén hěn nán.', vi: 'Tiếng Trung khó.' },
        ]
      },
      {
        heading: '太 (tài) — Quá',
        content: '太 nhấn mạnh mức độ cao, thường đi kèm 了 cuối câu. Có thể mang sắc thái khen hoặc chê.',
        examples: [
          { cn: '太好了！', pinyin: 'Tài hǎo le!', vi: 'Tuyệt quá!' },
          { cn: '太贵了。', pinyin: 'Tài guì le.', vi: 'Đắt quá.' },
          { cn: '太远了，不想去。', pinyin: 'Tài yuǎn le, bù xiǎng qù.', vi: 'Xa quá, không muốn đi.' },
          { cn: '你太客气了。', pinyin: 'Nǐ tài kèqi le.', vi: 'Bạn quá khách sáo.' },
        ]
      },
      {
        heading: '非常 (fēicháng) — Cực kỳ / Vô cùng',
        content: '非常 nhấn mạnh hơn 很. Dùng trong giao tiếp trang trọng hoặc khi muốn biểu đạt cảm xúc mạnh.',
        examples: [
          { cn: '非常感谢！', pinyin: 'Fēicháng gǎnxiè!', vi: 'Cảm ơn rất nhiều!' },
          { cn: '我非常高兴认识你。', pinyin: 'Wǒ fēicháng gāoxìng rènshi nǐ.', vi: 'Tôi rất vui được biết bạn.' },
          { cn: '这个菜非常好吃。', pinyin: 'Zhège cài fēicháng hǎochī.', vi: 'Món này cực kỳ ngon.' },
        ]
      },
      {
        heading: '真 (zhēn) — Thật / Thật sự',
        content: '真 biểu đạt sự ngạc nhiên hoặc xác nhận mức độ thực sự. Không đi với 了 cuối câu.',
        examples: [
          { cn: '真好看！', pinyin: 'Zhēn hǎokàn!', vi: 'Đẹp thật!' },
          { cn: '你真厉害！', pinyin: 'Nǐ zhēn lìhai!', vi: 'Bạn giỏi thật!' },
          { cn: '今天真冷。', pinyin: 'Jīntiān zhēn lěng.', vi: 'Hôm nay lạnh thật.' },
        ]
      },
      {
        heading: '⚠️ So sánh nhanh',
        content: '很 (rất — trung tính, thường bắt buộc) < 真 (thật — ngạc nhiên) < 非常 (cực kỳ — trang trọng) < 太 (quá — cảm thán, + 了)',
        examples: [
          { cn: '很好 → 真好 → 非常好 → 太好了', pinyin: '', vi: 'Tốt → Tốt thật → Cực kỳ tốt → Tốt quá!' },
        ]
      }
    ]
  },

  // ═══ PHÓ TỪ — HSK 2 ═══
  {
    id: 10,
    title: '副词 Phó từ phạm vi: 都 / 也 / 只 / 还',
    icon: '🎯',
    level: 'HSK 2',
    sections: [
      {
        heading: '都 (dōu) — Đều / Tất cả',
        content: '都 đặt trước động từ/tính từ, biểu thị "tất cả đều...". Chủ ngữ phải là số nhiều hoặc liệt kê.',
        examples: [
          { cn: '我们都是学生。', pinyin: 'Wǒmen dōu shì xuéshēng.', vi: 'Chúng tôi đều là học sinh.' },
          { cn: '他们都去了。', pinyin: 'Tāmen dōu qù le.', vi: 'Họ đều đi rồi.' },
          { cn: '咖啡和茶我都喜欢。', pinyin: 'Kāfēi hé chá wǒ dōu xǐhuān.', vi: 'Cà phê và trà tôi đều thích.' },
        ]
      },
      {
        heading: '也 (yě) — Cũng',
        content: '也 đặt trước động từ, biểu thị "cũng". Khi dùng cùng 都, thứ tự là 也都.',
        examples: [
          { cn: '我也是越南人。', pinyin: 'Wǒ yě shì Yuènán rén.', vi: 'Tôi cũng là người Việt Nam.' },
          { cn: '她也会说中文。', pinyin: 'Tā yě huì shuō Zhōngwén.', vi: 'Cô ấy cũng biết nói tiếng Trung.' },
          { cn: '我也想去。', pinyin: 'Wǒ yě xiǎng qù.', vi: 'Tôi cũng muốn đi.' },
          { cn: '他们也都来了。', pinyin: 'Tāmen yě dōu lái le.', vi: 'Họ cũng đều đến rồi.' },
        ]
      },
      {
        heading: '只 (zhǐ) — Chỉ',
        content: '只 đặt trước động từ, giới hạn phạm vi.',
        examples: [
          { cn: '我只会说一点中文。', pinyin: 'Wǒ zhǐ huì shuō yīdiǎn Zhōngwén.', vi: 'Tôi chỉ biết nói một chút tiếng Trung.' },
          { cn: '他只吃水果。', pinyin: 'Tā zhǐ chī shuǐguǒ.', vi: 'Anh ấy chỉ ăn hoa quả.' },
          { cn: '我只有十块钱。', pinyin: 'Wǒ zhǐ yǒu shí kuài qián.', vi: 'Tôi chỉ có 10 tệ.' },
        ]
      },
      {
        heading: '还 (hái) — Vẫn / Còn',
        content: '还 có 2 nghĩa chính: (1) vẫn còn (trạng thái tiếp tục), (2) ngoài ra.',
        examples: [
          { cn: '他还在睡觉。', pinyin: 'Tā hái zài shuìjiào.', vi: 'Anh ấy vẫn đang ngủ.' },
          { cn: '你还要别的吗？', pinyin: 'Nǐ hái yào bié de ma?', vi: 'Bạn còn muốn gì khác không?' },
          { cn: '我还没吃饭。', pinyin: 'Wǒ hái méi chīfàn.', vi: 'Tôi vẫn chưa ăn cơm.' },
          { cn: '除了中文，我还学英文。', pinyin: 'Chúle Zhōngwén, wǒ hái xué Yīngwén.', vi: 'Ngoài tiếng Trung, tôi còn học tiếng Anh.' },
        ]
      },
      {
        heading: '⚠️ Thứ tự khi dùng chung',
        content: 'Khi dùng nhiều phó từ cùng lúc, thứ tự là: 也 → 都 → 还 → 只. Ví dụ: 也都还... (cũng đều vẫn...)',
        examples: [
          { cn: '我们也都还没吃。', pinyin: 'Wǒmen yě dōu hái méi chī.', vi: 'Chúng tôi cũng đều vẫn chưa ăn.' },
        ]
      }
    ]
  },
  {
    id: 11,
    title: '副词 Phó từ thời gian: 已经 / 正在 / 马上 / 经常',
    icon: '⏳',
    level: 'HSK 2',
    sections: [
      {
        heading: '已经 (yǐjīng) — Đã...rồi',
        content: '已经 biểu thị hành động đã hoàn thành. Thường đi kèm 了 cuối câu.',
        examples: [
          { cn: '我已经吃了。', pinyin: 'Wǒ yǐjīng chī le.', vi: 'Tôi đã ăn rồi.' },
          { cn: '已经十二点了。', pinyin: 'Yǐjīng shí èr diǎn le.', vi: 'Đã 12 giờ rồi.' },
          { cn: '他已经到了。', pinyin: 'Tā yǐjīng dào le.', vi: 'Anh ấy đã đến rồi.' },
        ]
      },
      {
        heading: '正在 / 在 (zhèngzài / zài) — Đang',
        content: '正在 hoặc 在 đặt trước động từ = "đang làm gì". 正在 nhấn mạnh hơn 在.',
        examples: [
          { cn: '我正在学中文。', pinyin: 'Wǒ zhèngzài xué Zhōngwén.', vi: 'Tôi đang học tiếng Trung.' },
          { cn: '她在做饭。', pinyin: 'Tā zài zuòfàn.', vi: 'Cô ấy đang nấu cơm.' },
          { cn: '别吵，他在睡觉。', pinyin: 'Bié chǎo, tā zài shuìjiào.', vi: 'Đừng ồn, anh ấy đang ngủ.' },
        ]
      },
      {
        heading: '马上 (mǎshàng) — Ngay lập tức',
        content: '马上 biểu thị hành động sắp xảy ra rất gần.',
        examples: [
          { cn: '我马上来！', pinyin: 'Wǒ mǎshàng lái!', vi: 'Tôi đến ngay!' },
          { cn: '电影马上开始了。', pinyin: 'Diànyǐng mǎshàng kāishǐ le.', vi: 'Phim sắp bắt đầu rồi.' },
          { cn: '马上就到。', pinyin: 'Mǎshàng jiù dào.', vi: 'Sắp đến rồi.' },
        ]
      },
      {
        heading: '经常 (jīngcháng) — Thường xuyên',
        content: '经常 biểu thị tần suất cao. Đặt trước động từ.',
        examples: [
          { cn: '我经常去那个咖啡店。', pinyin: 'Wǒ jīngcháng qù nàge kāfēidiàn.', vi: 'Tôi hay đến quán cà phê đó.' },
          { cn: '他经常迟到。', pinyin: 'Tā jīngcháng chídào.', vi: 'Anh ấy thường xuyên đến muộn.' },
          { cn: '你经常做运动吗？', pinyin: 'Nǐ jīngcháng zuò yùndòng ma?', vi: 'Bạn có thường tập thể dục không?' },
        ]
      },
      {
        heading: 'Các phó từ tần suất khác',
        content: 'Sắp xếp từ cao → thấp: 总是 (luôn luôn) > 经常 (thường) > 有时候 (thỉnh thoảng) > 很少 (hiếm khi) > 从来不 (chưa bao giờ)',
        examples: [
          { cn: '他总是很忙。', pinyin: 'Tā zǒngshì hěn máng.', vi: 'Anh ấy luôn luôn bận.' },
          { cn: '我有时候看电影。', pinyin: 'Wǒ yǒu shíhou kàn diànyǐng.', vi: 'Tôi thỉnh thoảng xem phim.' },
          { cn: '她很少吃肉。', pinyin: 'Tā hěn shǎo chī ròu.', vi: 'Cô ấy hiếm khi ăn thịt.' },
          { cn: '我从来不喝酒。', pinyin: 'Wǒ cónglái bù hē jiǔ.', vi: 'Tôi chưa bao giờ uống rượu.' },
        ]
      }
    ]
  },
  {
    id: 12,
    title: '副词 Phó từ phủ định: 不 / 没 / 别',
    icon: '🚫',
    level: 'HSK 2',
    sections: [
      {
        heading: '不 (bù) — Không (thói quen / ý chí)',
        content: '不 dùng để phủ định: (1) thói quen, (2) ý muốn, (3) tính từ, (4) tương lai. KHÔNG dùng cho quá khứ đã xảy ra.',
        examples: [
          { cn: '我不喝酒。', pinyin: 'Wǒ bù hē jiǔ.', vi: 'Tôi không uống rượu. (thói quen)' },
          { cn: '我不想去。', pinyin: 'Wǒ bù xiǎng qù.', vi: 'Tôi không muốn đi. (ý chí)' },
          { cn: '今天不冷。', pinyin: 'Jīntiān bù lěng.', vi: 'Hôm nay không lạnh. (tính từ)' },
          { cn: '明天不上班。', pinyin: 'Míngtiān bù shàngbān.', vi: 'Ngày mai không đi làm. (tương lai)' },
        ]
      },
      {
        heading: '没 (méi) — Không / Chưa (đã xảy ra)',
        content: '没 dùng để phủ định: (1) quá khứ đã xảy ra (没 + V), (2) chưa (还没). Đặc biệt: 没有 = không có.',
        examples: [
          { cn: '我没去。', pinyin: 'Wǒ méi qù.', vi: 'Tôi không đi. (quá khứ)' },
          { cn: '他没来上班。', pinyin: 'Tā méi lái shàngbān.', vi: 'Anh ấy không đến đi làm. (quá khứ)' },
          { cn: '我还没吃饭。', pinyin: 'Wǒ hái méi chīfàn.', vi: 'Tôi vẫn chưa ăn cơm.' },
          { cn: '我没有钱。', pinyin: 'Wǒ méiyǒu qián.', vi: 'Tôi không có tiền.' },
        ]
      },
      {
        heading: '别 (bié) — Đừng',
        content: '别 dùng để khuyên/cấm ai đó đừng làm gì. Chỉ dùng trong mệnh lệnh.',
        examples: [
          { cn: '别走！', pinyin: 'Bié zǒu!', vi: 'Đừng đi!' },
          { cn: '别担心。', pinyin: 'Bié dānxīn.', vi: 'Đừng lo.' },
          { cn: '别吵！', pinyin: 'Bié chǎo!', vi: 'Đừng ồn!' },
          { cn: '上课别玩手机。', pinyin: 'Shàngkè bié wán shǒujī.', vi: 'Lên lớp đừng chơi điện thoại.' },
        ]
      },
      {
        heading: '⚠️ So sánh 不 vs 没',
        content: '不 = chủ quan (không muốn, thói quen, tương lai). 没 = khách quan (chưa xảy ra, quá khứ). Ví dụ: "不吃" = không ăn (thói quen/từ chối). "没吃" = chưa ăn (sự thật).',
        examples: [
          { cn: '我不吃辣的。', pinyin: 'Wǒ bù chī là de.', vi: 'Tôi không ăn cay. (thói quen)' },
          { cn: '我今天没吃早饭。', pinyin: 'Wǒ jīntiān méi chī zǎofàn.', vi: 'Hôm nay tôi chưa ăn sáng. (sự thật)' },
        ]
      }
    ]
  },

  // ═══ PHÓ TỪ — HSK 3 ═══
  {
    id: 13,
    title: '副词 Phó từ logic: 就 / 才 / 又 / 再',
    icon: '🔀',
    level: 'HSK 3',
    sections: [
      {
        heading: '就 (jiù) — Liền / Thì (nhanh, sớm)',
        content: '就 biểu thị hành động xảy ra sớm hơn dự kiến hoặc ngay sau điều kiện. Mang sắc thái "nhanh, dễ dàng".',
        examples: [
          { cn: '我八点就到了。', pinyin: 'Wǒ bā diǎn jiù dào le.', vi: 'Tôi 8 giờ đã đến rồi. (sớm)' },
          { cn: '吃了饭就走。', pinyin: 'Chī le fàn jiù zǒu.', vi: 'Ăn xong liền đi.' },
          { cn: '下课就回家。', pinyin: 'Xiàkè jiù huí jiā.', vi: 'Tan học thì về nhà ngay.' },
          { cn: '你一说我就明白了。', pinyin: 'Nǐ yī shuō wǒ jiù míngbai le.', vi: 'Bạn vừa nói tôi liền hiểu.' },
        ]
      },
      {
        heading: '才 (cái) — Mới (muộn, khó khăn)',
        content: '才 biểu thị hành động xảy ra muộn hơn dự kiến. Ngược với 就. Mang sắc thái "mãi mới, khó khăn". Không dùng 了 sau 才.',
        examples: [
          { cn: '他十点才到。', pinyin: 'Tā shí diǎn cái dào.', vi: 'Anh ấy 10 giờ mới đến. (muộn)' },
          { cn: '我学了三年才会说。', pinyin: 'Wǒ xué le sān nián cái huì shuō.', vi: 'Tôi học 3 năm mới biết nói.' },
          { cn: '想了半天才想起来。', pinyin: 'Xiǎng le bàntiān cái xiǎng qǐlái.', vi: 'Nghĩ nửa ngày mới nhớ ra.' },
        ]
      },
      {
        heading: '又 (yòu) — Lại (quá khứ, đã lặp lại)',
        content: '又 biểu thị hành động đã lặp lại (quá khứ). Mang sắc thái bất ngờ hoặc khó chịu.',
        examples: [
          { cn: '他又迟到了。', pinyin: 'Tā yòu chídào le.', vi: 'Anh ấy lại đến muộn rồi.' },
          { cn: '又下雨了。', pinyin: 'Yòu xià yǔ le.', vi: 'Lại mưa rồi.' },
          { cn: '我又忘了带钥匙。', pinyin: 'Wǒ yòu wàng le dài yàoshi.', vi: 'Tôi lại quên mang chìa khóa rồi.' },
        ]
      },
      {
        heading: '再 (zài) — Lại / Nữa (tương lai, sẽ lặp lại)',
        content: '再 biểu thị hành động sẽ lặp lại trong tương lai. Ngược với 又 (quá khứ).',
        examples: [
          { cn: '再见！', pinyin: 'Zàijiàn!', vi: 'Tạm biệt! (gặp lại)' },
          { cn: '请再说一遍。', pinyin: 'Qǐng zài shuō yī biàn.', vi: 'Xin nói lại một lần nữa.' },
          { cn: '我们明天再聊。', pinyin: 'Wǒmen míngtiān zài liáo.', vi: 'Ngày mai chúng ta nói chuyện tiếp.' },
          { cn: '以后再也不迟到了。', pinyin: 'Yǐhòu zài yě bù chídào le.', vi: 'Sau này không bao giờ đến muộn nữa.' },
        ]
      },
      {
        heading: '⚠️ So sánh 就 vs 才, 又 vs 再',
        content: '就 = nhanh/sớm ↔ 才 = muộn/khó. 又 = đã lặp lại (quá khứ) ↔ 再 = sẽ lặp lại (tương lai).',
        examples: [
          { cn: '八点就到了 vs 十点才到', pinyin: '', vi: '8h đã đến (sớm) vs 10h mới đến (muộn)' },
          { cn: '又下雨了 vs 明天再去', pinyin: '', vi: 'Lại mưa rồi (quá khứ) vs Mai đi tiếp (tương lai)' },
        ]
      }
    ]
  },
  {
    id: 14,
    title: '副词 Phó từ liên kết: 先...然后 / 一边...一边 / 一...就',
    icon: '🔗',
    level: 'HSK 3',
    sections: [
      {
        heading: '先...然后... — Trước...rồi sau đó...',
        content: '先 + V1，然后 + V2 = Làm V1 trước, rồi làm V2 sau.',
        examples: [
          { cn: '先吃饭，然后做作业。', pinyin: 'Xiān chīfàn, ránhòu zuò zuòyè.', vi: 'Ăn cơm trước, rồi làm bài tập.' },
          { cn: '先洗手，然后吃东西。', pinyin: 'Xiān xǐ shǒu, ránhòu chī dōngxi.', vi: 'Rửa tay trước, rồi ăn.' },
          { cn: '先听我说完，然后你再说。', pinyin: 'Xiān tīng wǒ shuō wán, ránhòu nǐ zài shuō.', vi: 'Nghe tôi nói xong trước, rồi bạn hãy nói.' },
        ]
      },
      {
        heading: '一边...一边... — Vừa...vừa...',
        content: '一边 + V1，一边 + V2 = Làm 2 việc cùng lúc.',
        examples: [
          { cn: '他一边吃饭，一边看电视。', pinyin: 'Tā yībiān chīfàn, yībiān kàn diànshì.', vi: 'Anh ấy vừa ăn vừa xem tivi.' },
          { cn: '我一边听音乐，一边学习。', pinyin: 'Wǒ yībiān tīng yīnyuè, yībiān xuéxí.', vi: 'Tôi vừa nghe nhạc vừa học.' },
          { cn: '她一边走路，一边打电话。', pinyin: 'Tā yībiān zǒulù, yībiān dǎ diànhuà.', vi: 'Cô ấy vừa đi bộ vừa gọi điện.' },
        ]
      },
      {
        heading: '一...就... — Vừa...liền...',
        content: '一 + V1 + 就 + V2 = Ngay khi V1 xong thì V2 ngay.',
        examples: [
          { cn: '我一到家就给你打电话。', pinyin: 'Wǒ yī dào jiā jiù gěi nǐ dǎ diànhuà.', vi: 'Tôi vừa về nhà liền gọi cho bạn.' },
          { cn: '他一看书就想睡觉。', pinyin: 'Tā yī kàn shū jiù xiǎng shuìjiào.', vi: 'Anh ấy vừa đọc sách liền muốn ngủ.' },
          { cn: '一下课就回家。', pinyin: 'Yī xiàkè jiù huí jiā.', vi: 'Vừa tan học liền về nhà.' },
        ]
      },
      {
        heading: '越来越 (yuèláiyuè) — Ngày càng',
        content: '越来越 + tính từ/động từ = mức độ tăng dần theo thời gian.',
        examples: [
          { cn: '天气越来越热了。', pinyin: 'Tiānqì yuèláiyuè rè le.', vi: 'Thời tiết ngày càng nóng.' },
          { cn: '我的中文越来越好。', pinyin: 'Wǒ de Zhōngwén yuèláiyuè hǎo.', vi: 'Tiếng Trung của tôi ngày càng tốt.' },
          { cn: '他越来越忙了。', pinyin: 'Tā yuèláiyuè máng le.', vi: 'Anh ấy ngày càng bận.' },
        ]
      }
    ]
  },

  // ═══ BÀI CŨ CẬP NHẬT LEVEL ═══
  {
    id: 5,
    title: 'Động từ năng nguyện: 会 / 能 / 可以',
    icon: '⚡',
    level: 'HSK 2',
    sections: [
      {
        heading: '会 (huì) — Biết (kỹ năng)',
        content: '会 chỉ khả năng làm gì đó nhờ đã học hoặc rèn luyện.',
        examples: [
          { cn: '我会说中文。', pinyin: 'Wǒ huì shuō Zhōngwén.', vi: 'Tôi biết nói tiếng Trung.' },
          { cn: '他不会游泳。', pinyin: 'Tā bù huì yóuyǒng.', vi: 'Anh ấy không biết bơi.' }
        ]
      },
      {
        heading: '能 (néng) — Có thể (khả năng / điều kiện)',
        content: '能 chỉ khả năng do điều kiện hoặc thể lực. Cũng dùng để xin phép.',
        examples: [
          { cn: '我今天能去。', pinyin: 'Wǒ jīntiān néng qù.', vi: 'Hôm nay tôi có thể đi.' },
          { cn: '这儿能停车吗？', pinyin: 'Zhèr néng tíngchē ma?', vi: 'Ở đây có thể đỗ xe không?' }
        ]
      },
      {
        heading: '可以 (kěyǐ) — Được phép / có thể',
        content: '可以 thường dùng để xin phép hoặc nói về điều gì được phép làm.',
        examples: [
          { cn: '我可以进来吗？', pinyin: 'Wǒ kěyǐ jìnlái ma?', vi: 'Tôi có thể vào được không?' },
          { cn: '这里可以吸烟吗？', pinyin: 'Zhèlǐ kěyǐ xīyān ma?', vi: 'Ở đây có thể hút thuốc không?' }
        ]
      }
    ]
  },
  {
    id: 6,
    title: 'Cấu trúc 正在 (zhèngzài) + Động từ',
    icon: '🔄',
    level: 'HSK 2',
    sections: [
      {
        heading: 'Diễn tả hành động đang xảy ra',
        content: '正在 + Động từ = "đang làm gì". Có thể dùng 正在 (zhèngzài) hoặc 在 (zài) đơn giản hơn.',
        examples: [
          { cn: '我正在学中文。', pinyin: 'Wǒ zhèngzài xué Zhōngwén.', vi: 'Tôi đang học tiếng Trung.' },
          { cn: '她在做饭。', pinyin: 'Tā zài zuòfàn.', vi: 'Cô ấy đang nấu cơm.' },
          { cn: '他们在唱歌。', pinyin: 'Tāmen zài chànggē.', vi: 'Họ đang hát.' }
        ]
      },
      {
        heading: 'Phủ định: 没在 (méi zài)',
        content: 'Dùng 没在 để nói "không đang làm gì".',
        examples: [
          { cn: '我没在学习。', pinyin: 'Wǒ méi zài xuéxí.', vi: 'Tôi không đang học.' }
        ]
      }
    ]
  },
  {
    id: 7,
    title: 'Câu so sánh: 比 (bǐ)',
    icon: '⚖️',
    level: 'HSK 3',
    sections: [
      {
        heading: 'So sánh hơn với 比',
        content: 'A + 比 + B + Tính từ = A hơn B.',
        examples: [
          { cn: '她比我高。', pinyin: 'Tā bǐ wǒ gāo.', vi: 'Cô ấy cao hơn tôi.' },
          { cn: '中文比英文难。', pinyin: 'Zhōngwén bǐ Yīngwén nán.', vi: 'Tiếng Trung khó hơn tiếng Anh.' },
          { cn: '今天比昨天热。', pinyin: 'Jīntiān bǐ zuótiān rè.', vi: 'Hôm nay nóng hơn hôm qua.' }
        ]
      },
      {
        heading: 'So sánh nhất: 最 (zuì)',
        content: 'Đặt 最 trước tính từ = "nhất".',
        examples: [
          { cn: '这是最好的。', pinyin: 'Zhè shì zuì hǎo de.', vi: 'Đây là cái tốt nhất.' },
          { cn: '我最喜欢猫。', pinyin: 'Wǒ zuì xǐhuān māo.', vi: 'Tôi thích mèo nhất.' }
        ]
      }
    ]
  },

  // ═══ TRỢ TỪ NGỮ KHÍ — HSK 1 ═══
  {
    id: 15,
    title: '语气助词 Trợ từ ngữ khí: 吧 / 呢 / 啊 / 嘛',
    icon: '💬',
    level: 'HSK 1',
    sections: [
      {
        heading: '吧 (ba) — Nhé / Đi / Thôi',
        content: '吧 đặt cuối câu, có 3 chức năng: (1) đề nghị/rủ rê, (2) đoán/suy đoán, (3) ra lệnh nhẹ.',
        examples: [
          { cn: '我们走吧。', pinyin: 'Wǒmen zǒu ba.', vi: 'Chúng ta đi thôi.' },
          { cn: '一起吃饭吧！', pinyin: 'Yīqǐ chīfàn ba!', vi: 'Cùng ăn cơm nhé!' },
          { cn: '你是中国人吧？', pinyin: 'Nǐ shì Zhōngguó rén ba?', vi: 'Bạn là người Trung Quốc chứ? (đoán)' },
          { cn: '算了吧。', pinyin: 'Suàn le ba.', vi: 'Thôi bỏ đi.' },
        ]
      },
      {
        heading: '呢 (ne) — Còn...? / Đang...',
        content: '呢 có 2 chức năng: (1) hỏi ngược "còn...thì sao?", (2) nhấn mạnh trạng thái đang diễn ra.',
        examples: [
          { cn: '我很好，你呢？', pinyin: 'Wǒ hěn hǎo, nǐ ne?', vi: 'Tôi khỏe, còn bạn?' },
          { cn: '他呢？', pinyin: 'Tā ne?', vi: 'Còn anh ấy?' },
          { cn: '我在学习呢。', pinyin: 'Wǒ zài xuéxí ne.', vi: 'Tôi đang học đây mà.' },
          { cn: '外面下雨呢。', pinyin: 'Wàimiàn xià yǔ ne.', vi: 'Ngoài đang mưa đấy.' },
        ]
      },
      {
        heading: '啊 (a) — À / Ôi / Nhỉ',
        content: '啊 thêm cảm xúc vào câu: ngạc nhiên, vui, nhấn mạnh. Làm câu mềm mại, thân thiện hơn.',
        examples: [
          { cn: '太好了啊！', pinyin: 'Tài hǎo le a!', vi: 'Tuyệt quá!' },
          { cn: '是啊！', pinyin: 'Shì a!', vi: 'Đúng vậy!' },
          { cn: '快来啊！', pinyin: 'Kuài lái a!', vi: 'Nhanh lại đây!' },
          { cn: '好漂亮啊！', pinyin: 'Hǎo piàoliang a!', vi: 'Đẹp quá!' },
        ]
      },
      {
        heading: '嘛 (ma) — Thì / Mà',
        content: '嘛 (khác với 吗) dùng khi giải thích điều hiển nhiên. Mang sắc thái "rõ ràng mà, đương nhiên thôi".',
        examples: [
          { cn: '小孩子嘛，不要生气。', pinyin: 'Xiǎo háizi ma, bùyào shēngqì.', vi: 'Trẻ con mà, đừng giận.' },
          { cn: '朋友嘛，应该互相帮助。', pinyin: 'Péngyǒu ma, yīnggāi hùxiāng bāngzhù.', vi: 'Bạn bè mà, nên giúp nhau.' },
          { cn: '学中文嘛，要多练习。', pinyin: 'Xué Zhōngwén ma, yào duō liànxí.', vi: 'Học tiếng Trung thì phải luyện nhiều chứ.' },
        ]
      },
      {
        heading: '⚠️ Phân biệt 吗 vs 嘛',
        content: '吗 (ma — thanh nhẹ) = câu hỏi Yes/No. 嘛 (ma — thanh 2) = giải thích hiển nhiên. Nghe khác nhau!',
        examples: [
          { cn: '你去吗？ vs 你去嘛！', pinyin: '', vi: 'Bạn đi không? (hỏi) vs Bạn đi đi mà! (thúc giục)' },
        ]
      }
    ]
  },

  // ═══ TRỢ TỪ ĐỘNG THÁI — HSK 2 ═══
  {
    id: 16,
    title: '动态助词 Trợ từ động thái: 了 / 过 / 着',
    icon: '⚙️',
    level: 'HSK 2',
    sections: [
      {
        heading: '了 (le) — Hoàn thành / Thay đổi',
        content: '了 là trợ từ phức tạp nhất. Có 2 vị trí: (1) Sau động từ = đã làm xong, (2) Cuối câu = trạng thái mới.',
        examples: [
          { cn: '我吃了饭。', pinyin: 'Wǒ chī le fàn.', vi: 'Tôi đã ăn cơm. (hoàn thành)' },
          { cn: '他走了。', pinyin: 'Tā zǒu le.', vi: 'Anh ấy đi rồi. (thay đổi)' },
          { cn: '下雨了。', pinyin: 'Xià yǔ le.', vi: 'Mưa rồi. (trạng thái mới)' },
          { cn: '我买了三本书。', pinyin: 'Wǒ mǎi le sān běn shū.', vi: 'Tôi đã mua 3 quyển sách.' },
        ]
      },
      {
        heading: '过 (guo) — Đã từng / Kinh nghiệm',
        content: '过 đặt sau động từ = "đã từng làm". Nhấn mạnh kinh nghiệm, không quan tâm thời điểm cụ thể.',
        examples: [
          { cn: '我去过中国。', pinyin: 'Wǒ qù guo Zhōngguó.', vi: 'Tôi đã từng đi Trung Quốc.' },
          { cn: '你吃过北京烤鸭吗？', pinyin: 'Nǐ chī guo Běijīng kǎoyā ma?', vi: 'Bạn đã từng ăn vịt quay Bắc Kinh chưa?' },
          { cn: '我没看过那个电影。', pinyin: 'Wǒ méi kàn guo nàge diànyǐng.', vi: 'Tôi chưa xem phim đó bao giờ.' },
        ]
      },
      {
        heading: '着 (zhe) — Đang (trạng thái kéo dài)',
        content: '着 đặt sau động từ = trạng thái đang tiếp diễn. Khác với 在 (hành động đang làm), 着 nhấn mạnh trạng thái.',
        examples: [
          { cn: '门开着。', pinyin: 'Mén kāi zhe.', vi: 'Cửa đang mở. (trạng thái)' },
          { cn: '他穿着红色的衣服。', pinyin: 'Tā chuān zhe hóngsè de yīfu.', vi: 'Anh ấy đang mặc đồ đỏ.' },
          { cn: '墙上挂着一幅画。', pinyin: 'Qiáng shàng guà zhe yī fú huà.', vi: 'Trên tường treo một bức tranh.' },
          { cn: '她笑着说。', pinyin: 'Tā xiào zhe shuō.', vi: 'Cô ấy vừa cười vừa nói.' },
        ]
      },
      {
        heading: '⚠️ So sánh 了 vs 过',
        content: '了 = đã làm (sự kiện cụ thể, quan tâm kết quả). 过 = đã từng (kinh nghiệm, không cần biết khi nào).',
        examples: [
          { cn: '我昨天去了北京。', pinyin: '', vi: 'Hôm qua tôi đã đi Bắc Kinh. (sự kiện cụ thể)' },
          { cn: '我去过北京。', pinyin: '', vi: 'Tôi đã từng đi BK. (kinh nghiệm, không biết khi nào)' },
        ]
      }
    ]
  },

  // ═══ TRỢ TỪ KẾT CẤU — HSK 3 ═══
  {
    id: 17,
    title: '结构助词 Trợ từ kết cấu: 的 / 地 / 得',
    icon: '🧱',
    level: 'HSK 3',
    sections: [
      {
        heading: '的 (de) — Bổ nghĩa cho DANH TỪ',
        content: '的 nối tính từ/cụm từ với danh từ phía sau. Giống "của" hoặc dùng để mô tả.',
        examples: [
          { cn: '我的书', pinyin: 'Wǒ de shū', vi: 'Sách của tôi (sở hữu)' },
          { cn: '漂亮的女孩', pinyin: 'Piàoliang de nǚhái', vi: 'Cô gái đẹp (tính từ + 的 + danh từ)' },
          { cn: '昨天买的东西', pinyin: 'Zuótiān mǎi de dōngxi', vi: 'Đồ mua hôm qua (cụm từ + 的 + danh từ)' },
        ]
      },
      {
        heading: '地 (de) — Bổ nghĩa cho ĐỘNG TỪ',
        content: '地 nối trạng từ/tính từ với động từ phía sau. Mô tả CÁCH THỨC hành động.',
        examples: [
          { cn: '认真地学习', pinyin: 'Rènzhēn de xuéxí', vi: 'Học tập nghiêm túc' },
          { cn: '慢慢地走', pinyin: 'Mànman de zǒu', vi: 'Đi chậm chậm' },
          { cn: '高兴地笑了', pinyin: 'Gāoxìng de xiào le', vi: 'Vui vẻ cười lên' },
          { cn: '大声地说', pinyin: 'Dàshēng de shuō', vi: 'Nói to' },
        ]
      },
      {
        heading: '得 (de) — Bổ ngữ KẾT QUẢ/MỨC ĐỘ',
        content: '得 đặt sau động từ/tính từ, diễn tả kết quả hoặc mức độ của hành động.',
        examples: [
          { cn: '他跑得很快。', pinyin: 'Tā pǎo de hěn kuài.', vi: 'Anh ấy chạy rất nhanh.' },
          { cn: '她说中文说得很好。', pinyin: 'Tā shuō Zhōngwén shuō de hěn hǎo.', vi: 'Cô ấy nói tiếng Trung rất tốt.' },
          { cn: '我累得不想动。', pinyin: 'Wǒ lèi de bù xiǎng dòng.', vi: 'Tôi mệt đến nỗi không muốn động.' },
          { cn: '他高兴得跳起来了。', pinyin: 'Tā gāoxìng de tiào qǐlái le.', vi: 'Anh ấy vui đến nhảy lên.' },
        ]
      },
      {
        heading: '⚠️ Công thức ghi nhớ: 的地得',
        content: '的 → trước DANH TỪ (đẹp 的 cô gái). 地 → trước ĐỘNG TỪ (chăm chỉ 地 học). 得 → sau ĐỘNG TỪ (chạy 得 nhanh). Cả 3 đều đọc là "de" nhưng viết khác nhau!',
        examples: [
          { cn: '美丽的花 / 安静地坐 / 写得好', pinyin: '', vi: 'Hoa đẹp / Ngồi yên lặng / Viết tốt' },
        ]
      }
    ]
  },

  // ═══ PHÓ TỪ THÁI ĐỘ — HSK 3 ═══
  {
    id: 18,
    title: '副词 Phó từ thái độ: 当然 / 其实 / 终于 / 大概 / 可能',
    icon: '🎭',
    level: 'HSK 3',
    sections: [
      {
        heading: '当然 (dāngrán) — Đương nhiên / Tất nhiên',
        content: '当然 biểu thị điều hiển nhiên, không cần bàn cãi.',
        examples: [
          { cn: '当然可以！', pinyin: 'Dāngrán kěyǐ!', vi: 'Tất nhiên được!' },
          { cn: '你会帮我吗？——当然！', pinyin: 'Nǐ huì bāng wǒ ma? —— Dāngrán!', vi: 'Bạn giúp tôi chứ? —— Tất nhiên!' },
          { cn: '学中文当然要多练习。', pinyin: 'Xué Zhōngwén dāngrán yào duō liànxí.', vi: 'Học tiếng Trung đương nhiên phải luyện nhiều.' },
        ]
      },
      {
        heading: '其实 (qíshí) — Thực ra / Thật ra',
        content: '其实 dùng khi muốn nói sự thật khác với vẻ ngoài hoặc suy nghĩ ban đầu.',
        examples: [
          { cn: '其实我不知道。', pinyin: 'Qíshí wǒ bù zhīdao.', vi: 'Thực ra tôi không biết.' },
          { cn: '他看起来很忙，其实很闲。', pinyin: 'Tā kàn qǐlái hěn máng, qíshí hěn xián.', vi: 'Anh ấy trông bận, thực ra rất rảnh.' },
          { cn: '其实中文不难。', pinyin: 'Qíshí Zhōngwén bù nán.', vi: 'Thật ra tiếng Trung không khó.' },
        ]
      },
      {
        heading: '终于 (zhōngyú) — Cuối cùng / Rốt cuộc',
        content: '终于 biểu thị kết quả sau một quá trình dài chờ đợi.',
        examples: [
          { cn: '终于到了！', pinyin: 'Zhōngyú dào le!', vi: 'Cuối cùng cũng đến!' },
          { cn: '我终于学会了。', pinyin: 'Wǒ zhōngyú xué huì le.', vi: 'Tôi cuối cùng cũng học được rồi.' },
          { cn: '雨终于停了。', pinyin: 'Yǔ zhōngyú tíng le.', vi: 'Mưa cuối cùng cũng tạnh.' },
        ]
      },
      {
        heading: '大概 (dàgài) — Đại khái / Khoảng',
        content: '大概 biểu thị ước lượng, không chắc chắn.',
        examples: [
          { cn: '大概十点到。', pinyin: 'Dàgài shí diǎn dào.', vi: 'Khoảng 10 giờ đến.' },
          { cn: '大概需要两个小时。', pinyin: 'Dàgài xūyào liǎng gè xiǎoshí.', vi: 'Đại khái cần 2 tiếng.' },
          { cn: '他大概不来了。', pinyin: 'Tā dàgài bù lái le.', vi: 'Anh ấy có lẽ không đến.' },
        ]
      },
      {
        heading: '可能 (kěnéng) — Có thể / Có lẽ',
        content: '可能 biểu thị khả năng xảy ra. Dùng như phó từ hoặc tính từ.',
        examples: [
          { cn: '明天可能下雨。', pinyin: 'Míngtiān kěnéng xià yǔ.', vi: 'Ngày mai có thể mưa.' },
          { cn: '他可能生病了。', pinyin: 'Tā kěnéng shēngbìng le.', vi: 'Anh ấy có lẽ bị ốm.' },
          { cn: '这个不太可能。', pinyin: 'Zhège bù tài kěnéng.', vi: 'Điều này không chắc lắm.' },
        ]
      }
    ]
  },

  // ═══ PHÓ TỪ MỨC ĐỘ NÂNG CAO — HSK 2-3 ═══
  {
    id: 19,
    title: '副词 Phó từ so sánh: 比较 / 特别 / 更 / 一定 / 几乎',
    icon: '📈',
    level: 'HSK 2',
    sections: [
      {
        heading: '比较 (bǐjiào) — Tương đối / Khá',
        content: '比较 biểu thị mức độ vừa phải, nhẹ hơn 很. Thường dùng khi so sánh ngầm.',
        examples: [
          { cn: '今天比较冷。', pinyin: 'Jīntiān bǐjiào lěng.', vi: 'Hôm nay khá lạnh.' },
          { cn: '这个比较便宜。', pinyin: 'Zhège bǐjiào piányi.', vi: 'Cái này tương đối rẻ.' },
          { cn: '我比较喜欢喝茶。', pinyin: 'Wǒ bǐjiào xǐhuān hē chá.', vi: 'Tôi khá thích uống trà.' },
        ]
      },
      {
        heading: '特别 (tèbié) — Đặc biệt / Rất',
        content: '特别 nhấn mạnh mức độ cao, mang sắc thái "đặc biệt, nổi bật".',
        examples: [
          { cn: '今天特别热。', pinyin: 'Jīntiān tèbié rè.', vi: 'Hôm nay nóng đặc biệt.' },
          { cn: '这个菜特别好吃。', pinyin: 'Zhège cài tèbié hǎochī.', vi: 'Món này đặc biệt ngon.' },
          { cn: '她特别喜欢猫。', pinyin: 'Tā tèbié xǐhuān māo.', vi: 'Cô ấy đặc biệt thích mèo.' },
        ]
      },
      {
        heading: '更 (gèng) — Hơn nữa / Càng',
        content: '更 dùng khi so sánh trực tiếp hoặc nhấn mạnh mức độ cao hơn nữa.',
        examples: [
          { cn: '这个更好。', pinyin: 'Zhège gèng hǎo.', vi: 'Cái này tốt hơn.' },
          { cn: '我要更努力学习。', pinyin: 'Wǒ yào gèng nǔlì xuéxí.', vi: 'Tôi phải học cố gắng hơn nữa.' },
          { cn: '明天会更冷。', pinyin: 'Míngtiān huì gèng lěng.', vi: 'Ngày mai sẽ còn lạnh hơn.' },
        ]
      },
      {
        heading: '一定 (yīdìng) — Nhất định / Chắc chắn',
        content: '一定 biểu thị sự quyết tâm hoặc khẳng định chắc chắn.',
        examples: [
          { cn: '我一定会来。', pinyin: 'Wǒ yīdìng huì lái.', vi: 'Tôi nhất định sẽ đến.' },
          { cn: '你一定要小心。', pinyin: 'Nǐ yīdìng yào xiǎoxīn.', vi: 'Bạn nhất định phải cẩn thận.' },
          { cn: '明天一定会下雨。', pinyin: 'Míngtiān yīdìng huì xià yǔ.', vi: 'Ngày mai chắc chắn sẽ mưa.' },
        ]
      },
      {
        heading: '几乎 (jīhū) — Hầu như / Gần như',
        content: '几乎 biểu thị mức gần đạt 100%, "suýt nữa thì...".',
        examples: [
          { cn: '我几乎每天都跑步。', pinyin: 'Wǒ jīhū měitiān dōu pǎobù.', vi: 'Tôi hầu như ngày nào cũng chạy bộ.' },
          { cn: '他几乎忘了。', pinyin: 'Tā jīhū wàng le.', vi: 'Anh ấy suýt quên.' },
          { cn: '几乎所有人都来了。', pinyin: 'Jīhū suǒyǒu rén dōu lái le.', vi: 'Hầu như tất cả mọi người đều đến.' },
        ]
      },
      {
        heading: '⚠️ Thang mức độ tổng hợp',
        content: '比较 (khá) < 很 (rất) < 特别 (đặc biệt) < 非常 (cực kỳ) < 太 (quá). Thêm: 更 = hơn nữa, 最 = nhất, 一定 = chắc chắn, 几乎 = hầu như.',
        examples: [
          { cn: '比较好 → 很好 → 特别好 → 非常好 → 太好了', pinyin: '', vi: 'Khá tốt → Rất tốt → Đặc biệt tốt → Cực tốt → Tốt quá!' },
        ]
      }
    ]
  }
];

export default function GrammarLessons() {
  const [openId, setOpenId] = useState(null);
  const [levelFilter, setLevelFilter] = useState('all');

  const levels = ['all', 'HSK 1', 'HSK 2', 'HSK 3'];
  const filtered = grammarData.filter(g => levelFilter === 'all' || g.level === levelFilter);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Level filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {levels.map(level => (
          <button key={level} onClick={() => setLevelFilter(level)} style={{
            background: levelFilter === level ? 'var(--primary)' : 'var(--surface)',
            border: `1px solid ${levelFilter === level ? 'var(--primary)' : 'var(--glass-border)'}`,
            color: levelFilter === level ? '#fff' : 'var(--text-muted)',
            padding: '6px 14px', borderRadius: 'var(--radius-xl)',
            cursor: 'pointer', fontSize: '0.85rem', transition: 'var(--transition)', fontWeight: 500
          }}>
            {level === 'all' ? '📋 Tất cả' : level === 'HSK 1' ? '🌱 HSK 1' : level === 'HSK 2' ? '🔥 HSK 2' : '🚀 HSK 3'}
          </button>
        ))}
      </div>

      {filtered.map(lesson => (
        <div key={lesson.id} className="glass-panel" style={{ marginBottom: 16, overflow: 'hidden', transition: 'var(--transition)' }}>
          <div onClick={() => setOpenId(openId === lesson.id ? null : lesson.id)} style={{
            cursor: 'pointer', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.5rem' }}>{lesson.icon}</span>
              <div>
                <h3 style={{ color: 'var(--primary)', margin: 0, fontSize: '1.05rem' }}>{lesson.title}</h3>
                <span className="tag tag-info" style={{ marginTop: 4 }}>
                  {lesson.level === 'HSK 1' ? '🌱 HSK 1' : lesson.level === 'HSK 2' ? '🔥 HSK 2' : '🚀 HSK 3'}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', transition: 'var(--transition)', transform: openId === lesson.id ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
          </div>

          {openId === lesson.id && (
            <div className="animate-slide-up" style={{ padding: '0 20px 20px' }}>
              {lesson.sections.map((section, sIdx) => (
                <div key={sIdx} className="guide-section">
                  {section.heading && (
                    <h4 style={{ color: 'var(--secondary)', marginBottom: 8, fontSize: '1rem' }}>{section.heading}</h4>
                  )}
                  {section.content && (
                    <p style={{ lineHeight: 1.7, color: 'var(--text-main)', marginBottom: 12, fontSize: '0.95rem' }}>{section.content}</p>
                  )}
                  {section.examples.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {section.examples.map((ex, eIdx) => (
                        <div key={eIdx} style={{
                          background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)',
                          padding: '8px 12px', border: '1px solid var(--glass-border)'
                        }}>
                          {ex.cn && <div className="cn-text" style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>{ex.cn}</div>}
                          {ex.pinyin && <div style={{ fontSize: '0.8rem', color: 'var(--secondary)' }}>{ex.pinyin}</div>}
                          {ex.vi && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{ex.vi}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
