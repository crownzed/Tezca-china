// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY.
// Nguồn: backend/app/data/exam_passages.json
// Sinh lại: node scripts/sync-exam-passages.mjs
export const examPassages = {
  "cloze": [
    {
      "id": "cloze-hsk1-family-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "我家有三口人。爸爸和妈妈都{{1}}老师。我是{{2}}。我们每天早上七{{3}}起床。",
      "word_bank": [
        {
          "hanzi": "是",
          "pinyin": "shì",
          "meaning_vi": "là"
        },
        {
          "hanzi": "学生",
          "pinyin": "xuésheng",
          "meaning_vi": "học sinh"
        },
        {
          "hanzi": "点",
          "pinyin": "diǎn",
          "meaning_vi": "giờ"
        },
        {
          "hanzi": "医生",
          "pinyin": "yīshēng",
          "meaning_vi": "bác sĩ"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "是",
          "skill": "pos",
          "explanation": "「爸爸和妈妈都___老师」cần một động từ nối chủ ngữ với danh từ chỉ nghề: 是 (là)."
        },
        {
          "index": 2,
          "answer": "学生",
          "skill": "logic",
          "explanation": "Bố mẹ là giáo viên, người kể còn đi học nên 我是学生 (tôi là học sinh)."
        },
        {
          "index": 3,
          "answer": "点",
          "skill": "collocation",
          "explanation": "Số + 点 là cách nói giờ: 七点 (bảy giờ)."
        }
      ]
    },
    {
      "id": "cloze-hsk1-lunch-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "中午我和同学在学校吃饭。我{{1}}米饭和菜，也{{2}}了一杯水。我们都{{3}}高兴。",
      "word_bank": [
        {
          "hanzi": "吃",
          "pinyin": "chī",
          "meaning_vi": "ăn"
        },
        {
          "hanzi": "喝",
          "pinyin": "hē",
          "meaning_vi": "uống"
        },
        {
          "hanzi": "很",
          "pinyin": "hěn",
          "meaning_vi": "rất"
        },
        {
          "hanzi": "买",
          "pinyin": "mǎi",
          "meaning_vi": "mua"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "吃",
          "skill": "collocation",
          "explanation": "米饭和菜 (cơm và thức ăn) đi với động từ 吃: 吃米饭。"
        },
        {
          "index": 2,
          "answer": "喝",
          "skill": "collocation",
          "explanation": "一杯水 (một cốc nước) đi với động từ 喝: 喝水。"
        },
        {
          "index": 3,
          "answer": "很",
          "skill": "pos",
          "explanation": "Trước tính từ 高兴 cần phó từ mức độ: 很高兴 (rất vui)."
        }
      ]
    },
    {
      "id": "cloze-hsk1-weekend-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "今天是星期六，天气很{{1}}。我{{2}}妈妈去商店买东西。{{3}}上我们回家吃饭。",
      "word_bank": [
        {
          "hanzi": "好",
          "pinyin": "hǎo",
          "meaning_vi": "tốt, đẹp"
        },
        {
          "hanzi": "和",
          "pinyin": "hé",
          "meaning_vi": "và, với"
        },
        {
          "hanzi": "晚",
          "pinyin": "wǎn",
          "meaning_vi": "muộn, tối"
        },
        {
          "hanzi": "大",
          "pinyin": "dà",
          "meaning_vi": "to, lớn"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "好",
          "skill": "collocation",
          "explanation": "天气很好 là cách nói cố định cho thời tiết đẹp."
        },
        {
          "index": 2,
          "answer": "和",
          "skill": "conjunction",
          "explanation": "我___妈妈去 cần từ nối hai người cùng làm: 我和妈妈 (tôi và mẹ)."
        },
        {
          "index": 3,
          "answer": "晚",
          "skill": "logic",
          "explanation": "Đi mua sắm rồi mới về nhà ăn cơm nên là 晚上 (buổi tối)."
        }
      ]
    },
    {
      "id": "cloze-hsk1-phone-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "昨天我给朋友{{1}}电话。他说{{2}}来我家看我。我很{{3}}。",
      "word_bank": [
        {
          "hanzi": "打",
          "pinyin": "dǎ",
          "meaning_vi": "gọi (điện thoại)"
        },
        {
          "hanzi": "明天",
          "pinyin": "míngtiān",
          "meaning_vi": "ngày mai"
        },
        {
          "hanzi": "高兴",
          "pinyin": "gāoxìng",
          "meaning_vi": "vui"
        },
        {
          "hanzi": "说",
          "pinyin": "shuō",
          "meaning_vi": "nói"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "打",
          "skill": "collocation",
          "explanation": "打电话 là cụm cố định nghĩa gọi điện thoại."
        },
        {
          "index": 2,
          "answer": "明天",
          "skill": "logic",
          "explanation": "Hôm qua gọi điện, bạn nói sẽ đến, nên thời gian phải ở tương lai: 明天 (ngày mai)."
        },
        {
          "index": 3,
          "answer": "高兴",
          "skill": "pos",
          "explanation": "Sau 很 cần tính từ chỉ cảm xúc: 很高兴 (rất vui)."
        }
      ]
    },
    {
      "id": "cloze-hsk2-exercise-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "我以前不喜欢运动，身体也不太好。今年我{{1}}每天早上跑步。{{2}}我觉得身体比以前好多了。运动的时候{{3}}要多喝水。",
      "word_bank": [
        {
          "hanzi": "开始",
          "pinyin": "kāishǐ",
          "meaning_vi": "bắt đầu"
        },
        {
          "hanzi": "现在",
          "pinyin": "xiànzài",
          "meaning_vi": "bây giờ"
        },
        {
          "hanzi": "还",
          "pinyin": "hái",
          "meaning_vi": "còn, thêm nữa"
        },
        {
          "hanzi": "已经",
          "pinyin": "yǐjīng",
          "meaning_vi": "đã"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "开始",
          "skill": "collocation",
          "explanation": "开始 + động từ: 开始每天早上跑步 (bắt đầu chạy bộ mỗi sáng)."
        },
        {
          "index": 2,
          "answer": "现在",
          "skill": "logic",
          "explanation": "Câu trước nói 以前 (trước đây), câu này đối lập về thời gian nên dùng 现在 (bây giờ)."
        },
        {
          "index": 3,
          "answer": "还",
          "skill": "pos",
          "explanation": "Phó từ 还 đứng trước 要 để bổ sung một việc nữa: 还要多喝水。"
        }
      ]
    },
    {
      "id": "cloze-hsk2-beijing-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "明天我要去北京。{{1}}那儿现在很冷，{{2}}我买了一件新衣服。妈妈还给我准备了很多吃的东西。",
      "word_bank": [
        {
          "hanzi": "因为",
          "pinyin": "yīnwèi",
          "meaning_vi": "bởi vì"
        },
        {
          "hanzi": "所以",
          "pinyin": "suǒyǐ",
          "meaning_vi": "cho nên"
        },
        {
          "hanzi": "但是",
          "pinyin": "dànshì",
          "meaning_vi": "nhưng"
        },
        {
          "hanzi": "可能",
          "pinyin": "kěnéng",
          "meaning_vi": "có thể"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "因为",
          "skill": "conjunction",
          "explanation": "Cặp liên từ nhân quả 因为……所以…… — vế đầu nêu nguyên nhân (trời lạnh)."
        },
        {
          "index": 2,
          "answer": "所以",
          "skill": "conjunction",
          "explanation": "Vế sau nêu kết quả (mua áo mới) nên dùng 所以, khớp với 因为 phía trước."
        }
      ]
    },
    {
      "id": "cloze-hsk2-class-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "上课的时候，我有很多{{1}}想问老师。老师非常{{2}}我，每次都认真地回答。{{3}}我觉得学习不太难了。",
      "word_bank": [
        {
          "hanzi": "问题",
          "pinyin": "wèntí",
          "meaning_vi": "vấn đề, câu hỏi"
        },
        {
          "hanzi": "帮助",
          "pinyin": "bāngzhù",
          "meaning_vi": "giúp đỡ"
        },
        {
          "hanzi": "现在",
          "pinyin": "xiànzài",
          "meaning_vi": "bây giờ"
        },
        {
          "hanzi": "时间",
          "pinyin": "shíjiān",
          "meaning_vi": "thời gian"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "问题",
          "skill": "pos",
          "explanation": "很多___想问老师 cần danh từ làm tân ngữ của 问: 很多问题 (nhiều câu hỏi)."
        },
        {
          "index": 2,
          "answer": "帮助",
          "skill": "collocation",
          "explanation": "非常___我 cần động từ đi với tân ngữ chỉ người: 帮助我 (giúp tôi)."
        },
        {
          "index": 3,
          "answer": "现在",
          "skill": "logic",
          "explanation": "Câu kết nói kết quả sau một quá trình nên mở đầu bằng 现在 (bây giờ)."
        }
      ]
    },
    {
      "id": "cloze-hsk2-shopping-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "这件衣服有点儿{{1}}，{{2}}颜色非常漂亮，所以我还是买了。姐姐说我穿白色最{{3}}。",
      "word_bank": [
        {
          "hanzi": "贵",
          "pinyin": "guì",
          "meaning_vi": "đắt"
        },
        {
          "hanzi": "但是",
          "pinyin": "dànshì",
          "meaning_vi": "nhưng"
        },
        {
          "hanzi": "好",
          "pinyin": "hǎo",
          "meaning_vi": "đẹp, hợp"
        },
        {
          "hanzi": "便宜",
          "pinyin": "piányi",
          "meaning_vi": "rẻ"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "贵",
          "skill": "logic",
          "explanation": "有点儿 dùng cho điều không mong muốn, và vế sau có 但是 nên đây là nhược điểm: 有点儿贵 (hơi đắt). Chọn 便宜 sẽ ngược logic."
        },
        {
          "index": 2,
          "answer": "但是",
          "skill": "conjunction",
          "explanation": "Hai vế trái ngược nhau (đắt / màu đẹp) nên dùng liên từ chuyển ý 但是."
        },
        {
          "index": 3,
          "answer": "好",
          "skill": "collocation",
          "explanation": "最___ cần tính từ sau phó từ so sánh nhất: 穿白色最好 (mặc màu trắng đẹp nhất)."
        }
      ]
    },
    {
      "id": "cloze-hsk3-health-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "健康的身体是每个人生活中最重要的一部分。要{{1}}自己的身体，我们每天{{2}}保持良好的生活{{3}}，比如少吃油炸食品、早睡早起。此外，{{4}}年龄的增长，适当的体育锻炼也显得越来越重要。",
      "word_bank": [
        {
          "hanzi": "习惯",
          "pinyin": "xíguàn",
          "meaning_vi": "thói quen"
        },
        {
          "hanzi": "必须",
          "pinyin": "bìxū",
          "meaning_vi": "bắt buộc phải"
        },
        {
          "hanzi": "保护",
          "pinyin": "bǎohù",
          "meaning_vi": "bảo vệ"
        },
        {
          "hanzi": "随着",
          "pinyin": "suízhe",
          "meaning_vi": "cùng với"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "保护",
          "skill": "collocation",
          "explanation": "Phía sau là tân ngữ 自己的身体, động từ phù hợp nhất là 保护 (bảo vệ cơ thể)."
        },
        {
          "index": 2,
          "answer": "必须",
          "skill": "pos",
          "explanation": "Cần phó từ năng nguyện đứng trước động từ 保持 để chỉ sự cần thiết: 必须保持 (bắt buộc phải duy trì)."
        },
        {
          "index": 3,
          "answer": "习惯",
          "skill": "collocation",
          "explanation": "Cụm cố định 生活习惯 (thói quen sinh hoạt)."
        },
        {
          "index": 4,
          "answer": "随着",
          "skill": "conjunction",
          "explanation": "Cấu trúc 随着……的增长 (cùng với sự tăng lên của...)."
        }
      ]
    },
    {
      "id": "cloze-hsk3-hiking-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "上个周末，我和同学一起去爬山。出发以前，我们{{1}}了很多东西，比如水、面包和地图。爬到山顶的时候，大家都很{{2}}，但是看到那么美的风景，心里非常{{3}}。回家以后我把照片发给了爸爸妈妈，他们说下次也想{{4}}我们一起去。",
      "word_bank": [
        {
          "hanzi": "准备",
          "pinyin": "zhǔnbèi",
          "meaning_vi": "chuẩn bị"
        },
        {
          "hanzi": "累",
          "pinyin": "lèi",
          "meaning_vi": "mệt"
        },
        {
          "hanzi": "高兴",
          "pinyin": "gāoxìng",
          "meaning_vi": "vui"
        },
        {
          "hanzi": "跟",
          "pinyin": "gēn",
          "meaning_vi": "cùng với"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "准备",
          "skill": "collocation",
          "explanation": "出发以前 + 很多东西 → 准备了很多东西 (chuẩn bị nhiều thứ)."
        },
        {
          "index": 2,
          "answer": "累",
          "skill": "logic",
          "explanation": "Leo tới đỉnh núi, vế sau có 但是 nên vế trước là cảm giác tiêu cực: 很累 (rất mệt)."
        },
        {
          "index": 3,
          "answer": "高兴",
          "skill": "logic",
          "explanation": "Sau 但是 và 看到那么美的风景 phải là cảm xúc tích cực: 心里非常高兴。"
        },
        {
          "index": 4,
          "answer": "跟",
          "skill": "pos",
          "explanation": "Cấu trúc giới từ 跟……一起 (cùng với ai làm gì): 跟我们一起去。"
        }
      ]
    },
    {
      "id": "cloze-hsk3-vocab-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "很多同学觉得记单词很难。其实，只要{{1}}正确的方法，记单词就会变得容易一些。比如，我们可以把新词放在句子里学习，这样不但能记住它的意思，{{2}}能知道它的用法。另外，复习也很{{3}}，因为人的记忆会慢慢变弱。{{4}}每天花十分钟复习，一个月以后你会发现自己进步了很多。",
      "word_bank": [
        {
          "hanzi": "找到",
          "pinyin": "zhǎodào",
          "meaning_vi": "tìm được"
        },
        {
          "hanzi": "而且",
          "pinyin": "érqiě",
          "meaning_vi": "hơn nữa"
        },
        {
          "hanzi": "重要",
          "pinyin": "zhòngyào",
          "meaning_vi": "quan trọng"
        },
        {
          "hanzi": "如果",
          "pinyin": "rúguǒ",
          "meaning_vi": "nếu"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "找到",
          "skill": "collocation",
          "explanation": "正确的方法 là tân ngữ, động từ phù hợp là 找到 (tìm được phương pháp đúng)."
        },
        {
          "index": 2,
          "answer": "而且",
          "skill": "conjunction",
          "explanation": "Cặp liên từ tăng tiến 不但……而且…… (không chỉ... mà còn...)."
        },
        {
          "index": 3,
          "answer": "重要",
          "skill": "pos",
          "explanation": "Sau 也很 cần tính từ: 复习也很重要 (ôn tập cũng rất quan trọng)."
        },
        {
          "index": 4,
          "answer": "如果",
          "skill": "conjunction",
          "explanation": "Vế điều kiện giả định dẫn tới kết quả ở câu sau nên mở đầu bằng 如果 (nếu)."
        }
      ]
    },
    {
      "id": "cloze-hsk3-bike-01",
      "hsk_level": 3,
      "topic": "science_env",
      "passage": "现在越来越多的人{{1}}骑自行车上班。一方面，骑车不会让空气变{{2}}；另一方面，它还可以锻炼身体。当然，骑车的时候一定要{{3}}安全，不要骑得太快。{{4}}路不太远，骑自行车其实比开车更方便。",
      "word_bank": [
        {
          "hanzi": "选择",
          "pinyin": "xuǎnzé",
          "meaning_vi": "lựa chọn"
        },
        {
          "hanzi": "脏",
          "pinyin": "zāng",
          "meaning_vi": "bẩn"
        },
        {
          "hanzi": "注意",
          "pinyin": "zhùyì",
          "meaning_vi": "chú ý"
        },
        {
          "hanzi": "如果",
          "pinyin": "rúguǒ",
          "meaning_vi": "nếu"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "选择",
          "skill": "collocation",
          "explanation": "选择 + động từ chỉ hành động được chọn: 选择骑自行车上班。"
        },
        {
          "index": 2,
          "answer": "脏",
          "skill": "logic",
          "explanation": "让空气变___ nêu ưu điểm của đi xe đạp, kèm 不会 nên chỗ trống là điều xấu: 不会让空气变脏。"
        },
        {
          "index": 3,
          "answer": "注意",
          "skill": "collocation",
          "explanation": "Cụm kết hợp cố định 注意安全 (chú ý an toàn)."
        },
        {
          "index": 4,
          "answer": "如果",
          "skill": "conjunction",
          "explanation": "Vế giả định về khoảng cách dẫn tới kết luận nên dùng 如果 (nếu)."
        }
      ]
    },
    {
      "id": "cloze-hsk4-plastic-01",
      "hsk_level": 4,
      "topic": "science_env",
      "passage": "塑料污染已经成为全球性的环境问题。在日常生活中，一次性塑料制品的使用极为{{1}}。为了{{2}}塑料垃圾对海洋生态的破坏，许多国家已经开始{{3}}严格的限制措施。专家建议，公众应积极减少使用塑料袋，以{{4}}废弃物对自然环境的负面影响。",
      "word_bank": [
        {
          "hanzi": "避免",
          "pinyin": "bìmiǎn",
          "meaning_vi": "tránh"
        },
        {
          "hanzi": "普遍",
          "pinyin": "pǔbiàn",
          "meaning_vi": "phổ biến"
        },
        {
          "hanzi": "降低",
          "pinyin": "jiàngdī",
          "meaning_vi": "hạ thấp, giảm"
        },
        {
          "hanzi": "采取",
          "pinyin": "cǎiqǔ",
          "meaning_vi": "áp dụng, thực hiện"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "普遍",
          "skill": "pos",
          "explanation": "Sau 极为 cần tính từ mô tả hiện tượng: 极为普遍 (cực kỳ phổ biến)."
        },
        {
          "index": 2,
          "answer": "避免",
          "skill": "collocation",
          "explanation": "为了___……的破坏 → 避免破坏 (tránh sự phá hoại)."
        },
        {
          "index": 3,
          "answer": "采取",
          "skill": "collocation",
          "explanation": "Cụm kết hợp cố định 采取措施 (áp dụng biện pháp)."
        },
        {
          "index": 4,
          "answer": "降低",
          "skill": "collocation",
          "explanation": "降低负面影响 (giảm ảnh hưởng tiêu cực)."
        }
      ]
    },
    {
      "id": "cloze-hsk4-time-01",
      "hsk_level": 4,
      "topic": "economy_self",
      "passage": "刚参加工作的人常常觉得时间不够用。其实问题往往不在于工作量，而在于缺少{{1}}。把每天要做的事情按重要程度排好顺序，先完成最关键的部分，效率自然会{{2}}。此外，学会拒绝那些并不重要的请求，也能让你{{3}}出更多时间。当然，休息同样重要，{{4}}长期加班，身体和情绪都会受到影响。",
      "word_bank": [
        {
          "hanzi": "计划",
          "pinyin": "jìhuà",
          "meaning_vi": "kế hoạch"
        },
        {
          "hanzi": "提高",
          "pinyin": "tígāo",
          "meaning_vi": "nâng cao"
        },
        {
          "hanzi": "留",
          "pinyin": "liú",
          "meaning_vi": "để lại, dành ra"
        },
        {
          "hanzi": "如果",
          "pinyin": "rúguǒ",
          "meaning_vi": "nếu"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "计划",
          "skill": "pos",
          "explanation": "缺少 + danh từ: 缺少计划 (thiếu kế hoạch)."
        },
        {
          "index": 2,
          "answer": "提高",
          "skill": "collocation",
          "explanation": "效率 đi với 提高: 效率自然会提高 (hiệu suất tự nhiên sẽ tăng)."
        },
        {
          "index": 3,
          "answer": "留",
          "skill": "collocation",
          "explanation": "___出更多时间 → 留出时间 (dành ra thời gian)."
        },
        {
          "index": 4,
          "answer": "如果",
          "skill": "conjunction",
          "explanation": "Vế giả định 长期加班 dẫn tới hậu quả nên mở đầu bằng 如果."
        }
      ]
    },
    {
      "id": "cloze-hsk4-phone-01",
      "hsk_level": 4,
      "topic": "science_env",
      "passage": "智能手机让我们的生活变得更加{{1}}，但也带来了一些新的烦恼。有的人一边吃饭一边看手机，几乎没有时间和家人{{2}}。还有的人睡觉前一直刷视频，第二天起床时特别{{3}}。因此，专家提醒大家：使用手机应该有个限度，{{4}}让工具变成负担。",
      "word_bank": [
        {
          "hanzi": "方便",
          "pinyin": "fāngbiàn",
          "meaning_vi": "tiện lợi"
        },
        {
          "hanzi": "交流",
          "pinyin": "jiāoliú",
          "meaning_vi": "giao lưu, trò chuyện"
        },
        {
          "hanzi": "困",
          "pinyin": "kùn",
          "meaning_vi": "buồn ngủ"
        },
        {
          "hanzi": "别",
          "pinyin": "bié",
          "meaning_vi": "đừng"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "方便",
          "skill": "pos",
          "explanation": "Sau 更加 cần tính từ: 更加方便 (càng tiện lợi hơn)."
        },
        {
          "index": 2,
          "answer": "交流",
          "skill": "collocation",
          "explanation": "和家人___ → 和家人交流 (trò chuyện với người thân)."
        },
        {
          "index": 3,
          "answer": "困",
          "skill": "logic",
          "explanation": "Xem video tới khuya thì sáng dậy 特别困 (buồn ngủ)."
        },
        {
          "index": 4,
          "answer": "别",
          "skill": "pos",
          "explanation": "Câu khuyên ngăn cần phó từ phủ định cầu khiến: 别让工具变成负担。"
        }
      ]
    },
    {
      "id": "cloze-hsk4-reading-01",
      "hsk_level": 4,
      "topic": "economy_self",
      "passage": "读书是一种非常好的习惯。它不仅能{{1}}我们的知识，还能让我们在安静中认识自己。可惜现在很多人把时间都花在了手机上，{{2}}读完一本书的人越来越少。其实读书并不需要很长的时间，{{3}}每天读二十分钟，一年也能读十几本。重要的是选择自己真正感兴趣的内容，这样才能一直{{4}}下去。",
      "word_bank": [
        {
          "hanzi": "丰富",
          "pinyin": "fēngfù",
          "meaning_vi": "làm phong phú"
        },
        {
          "hanzi": "能够",
          "pinyin": "nénggòu",
          "meaning_vi": "có thể"
        },
        {
          "hanzi": "只要",
          "pinyin": "zhǐyào",
          "meaning_vi": "chỉ cần"
        },
        {
          "hanzi": "坚持",
          "pinyin": "jiānchí",
          "meaning_vi": "kiên trì"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "丰富",
          "skill": "collocation",
          "explanation": "丰富知识 (làm phong phú kiến thức) là cụm kết hợp cố định."
        },
        {
          "index": 2,
          "answer": "能够",
          "skill": "pos",
          "explanation": "Cần động từ năng nguyện trước 读完: 能够读完一本书的人 (người có thể đọc hết một quyển sách)."
        },
        {
          "index": 3,
          "answer": "只要",
          "skill": "conjunction",
          "explanation": "Cặp liên từ điều kiện 只要……也/就…… (chỉ cần... là...)."
        },
        {
          "index": 4,
          "answer": "坚持",
          "skill": "collocation",
          "explanation": "一直___下去 → 坚持下去 (kiên trì tiếp tục)."
        }
      ]
    },
    {
      "id": "cloze-hsk5-manager-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "一个优秀的管理者不仅要有出色的专业能力，更要{{1}}良好的沟通技巧和团队协作精神。在{{2}}突发危机时，冷静的判断力是解决问题的{{3}}。如果团队{{4}}明确的目标和有效的执行力，再好的战略计划也难以实现。",
      "word_bank": [
        {
          "hanzi": "核心",
          "pinyin": "héxīn",
          "meaning_vi": "cốt lõi"
        },
        {
          "hanzi": "具备",
          "pinyin": "jùbèi",
          "meaning_vi": "có đủ, sở hữu"
        },
        {
          "hanzi": "面对",
          "pinyin": "miànduì",
          "meaning_vi": "đối mặt"
        },
        {
          "hanzi": "缺乏",
          "pinyin": "quēfá",
          "meaning_vi": "thiếu hụt"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "具备",
          "skill": "collocation",
          "explanation": "Đi kèm phẩm chất, kỹ năng: 具备沟通技巧 (có đủ kỹ năng giao tiếp)."
        },
        {
          "index": 2,
          "answer": "面对",
          "skill": "collocation",
          "explanation": "Đi kèm hoàn cảnh thử thách: 面对突发危机 (đối mặt khủng hoảng đột ngột)."
        },
        {
          "index": 3,
          "answer": "核心",
          "skill": "pos",
          "explanation": "Danh từ làm vị ngữ sau 是……的: 是解决问题的核心 (là cốt lõi để giải quyết vấn đề)."
        },
        {
          "index": 4,
          "answer": "缺乏",
          "skill": "logic",
          "explanation": "Vế sau nói kế hoạch khó thực hiện nên vế trước là sự thiếu hụt: 团队缺乏明确的目标。"
        }
      ]
    },
    {
      "id": "cloze-hsk5-ecommerce-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "近年来，网络购物的{{1}}以惊人的速度扩大。消费者只需动动手指，就能买到来自世界各地的商品。然而，这种便利也{{2}}了一些新的矛盾：商品与图片不符、退货流程复杂等问题时常出现。为了保护消费者权益，相关部门陆续{{3}}了一系列规定。业内人士认为，只有把服务质量放在首位，电商平台才能在激烈的竞争中{{4}}长期的信任。",
      "word_bank": [
        {
          "hanzi": "规模",
          "pinyin": "guīmó",
          "meaning_vi": "quy mô"
        },
        {
          "hanzi": "引发",
          "pinyin": "yǐnfā",
          "meaning_vi": "gây ra"
        },
        {
          "hanzi": "出台",
          "pinyin": "chūtái",
          "meaning_vi": "ban hành"
        },
        {
          "hanzi": "赢得",
          "pinyin": "yíngdé",
          "meaning_vi": "giành được"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "规模",
          "skill": "pos",
          "explanation": "Chủ ngữ của 扩大 phải là danh từ chỉ độ lớn: 规模扩大 (quy mô mở rộng)."
        },
        {
          "index": 2,
          "answer": "引发",
          "skill": "collocation",
          "explanation": "引发矛盾 (gây ra mâu thuẫn) là cụm kết hợp thường gặp."
        },
        {
          "index": 3,
          "answer": "出台",
          "skill": "collocation",
          "explanation": "相关部门 + 规定 → 出台规定 (cơ quan ban hành quy định)."
        },
        {
          "index": 4,
          "answer": "赢得",
          "skill": "collocation",
          "explanation": "赢得信任 (giành được sự tin tưởng)."
        }
      ]
    },
    {
      "id": "cloze-hsk5-discipline-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "很多人遇到失败时总是{{1}}运气不好，却很少反思自己的努力是否足够。事实上，任何领域的进步都离不开长期的积累。与其羡慕别人的成就，{{2}}从今天开始制定一个可以执行的计划。刚开始时目标不必太高，重要的是让自己{{3}}稳定的节奏。等到习惯形成之后，你会发现坚持不再是一件需要{{4}}大量意志力的事情。",
      "word_bank": [
        {
          "hanzi": "抱怨",
          "pinyin": "bàoyuàn",
          "meaning_vi": "oán trách, phàn nàn"
        },
        {
          "hanzi": "不如",
          "pinyin": "bùrú",
          "meaning_vi": "không bằng, thà rằng"
        },
        {
          "hanzi": "保持",
          "pinyin": "bǎochí",
          "meaning_vi": "duy trì"
        },
        {
          "hanzi": "消耗",
          "pinyin": "xiāohào",
          "meaning_vi": "tiêu hao"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "抱怨",
          "skill": "collocation",
          "explanation": "总是___运气不好 → 抱怨运气不好 (phàn nàn vận may không tốt)."
        },
        {
          "index": 2,
          "answer": "不如",
          "skill": "conjunction",
          "explanation": "Cặp liên từ lựa chọn 与其……不如…… (thà... còn hơn...)."
        },
        {
          "index": 3,
          "answer": "保持",
          "skill": "collocation",
          "explanation": "保持稳定的节奏 (duy trì nhịp độ ổn định)."
        },
        {
          "index": 4,
          "answer": "消耗",
          "skill": "collocation",
          "explanation": "消耗意志力 (tiêu hao ý chí)."
        }
      ]
    },
    {
      "id": "cloze-hsk5-traffic-01",
      "hsk_level": 5,
      "topic": "science_env",
      "passage": "随着城市人口不断增加，交通拥堵已经成为许多大城市{{1}}的难题。有关部门尝试过多种办法，例如限制车辆出行、提高停车费用等，效果却并不{{2}}。专家指出，真正的出路在于优先发展公共交通，使地铁和公交车成为市民出行的首选。{{3}}公共交通足够方便和准时，人们自然会减少开车的次数，城市的空气质量也会随之{{4}}。",
      "word_bank": [
        {
          "hanzi": "共同",
          "pinyin": "gòngtóng",
          "meaning_vi": "chung, cùng"
        },
        {
          "hanzi": "明显",
          "pinyin": "míngxiǎn",
          "meaning_vi": "rõ rệt"
        },
        {
          "hanzi": "只要",
          "pinyin": "zhǐyào",
          "meaning_vi": "chỉ cần"
        },
        {
          "hanzi": "改善",
          "pinyin": "gǎishàn",
          "meaning_vi": "cải thiện"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "共同",
          "skill": "pos",
          "explanation": "许多大城市___的难题 cần định ngữ chỉ tính chất chung: 共同的难题 (vấn đề chung)."
        },
        {
          "index": 2,
          "answer": "明显",
          "skill": "logic",
          "explanation": "效果却并不___ — 却 báo hiệu ý nghịch, nên hiệu quả không 明显 (rõ rệt)."
        },
        {
          "index": 3,
          "answer": "只要",
          "skill": "conjunction",
          "explanation": "Cặp điều kiện 只要……自然会…… (chỉ cần... thì tự nhiên sẽ...)."
        },
        {
          "index": 4,
          "answer": "改善",
          "skill": "collocation",
          "explanation": "空气质量随之改善 (chất lượng không khí được cải thiện theo)."
        }
      ]
    },
    {
      "id": "cloze-hsk6-crisis-01",
      "hsk_level": 6,
      "topic": "economy_self",
      "passage": "在商业世界里，失败往往比成功更能{{1}}一个团队的真实水平。顺境之中，制度的漏洞容易被高速增长所掩盖；一旦市场转冷，那些长期被{{2}}的问题便会集中暴露。因此，成熟的企业不会把危机简单地视为灾难，而是把它当作重新{{3}}自身战略的契机。正如一位企业家所说，能够从挫折中总结经验的组织，才具备真正的{{4}}能力。",
      "word_bank": [
        {
          "hanzi": "检验",
          "pinyin": "jiǎnyàn",
          "meaning_vi": "kiểm nghiệm"
        },
        {
          "hanzi": "忽视",
          "pinyin": "hūshì",
          "meaning_vi": "coi nhẹ, bỏ qua"
        },
        {
          "hanzi": "审视",
          "pinyin": "shěnshì",
          "meaning_vi": "xem xét lại"
        },
        {
          "hanzi": "生存",
          "pinyin": "shēngcún",
          "meaning_vi": "sinh tồn"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "检验",
          "skill": "collocation",
          "explanation": "更能___真实水平 → 检验水平 (kiểm nghiệm trình độ)."
        },
        {
          "index": 2,
          "answer": "忽视",
          "skill": "logic",
          "explanation": "长期被___的问题 sau đó mới 暴露 nên trước đó bị 忽视 (bị coi nhẹ)."
        },
        {
          "index": 3,
          "answer": "审视",
          "skill": "collocation",
          "explanation": "重新___自身战略 → 重新审视战略 (xem xét lại chiến lược)."
        },
        {
          "index": 4,
          "answer": "生存",
          "skill": "pos",
          "explanation": "___能力 cần danh từ làm định ngữ: 生存能力 (năng lực sinh tồn)."
        }
      ]
    },
    {
      "id": "cloze-hsk6-craft-01",
      "hsk_level": 6,
      "topic": "economy_self",
      "passage": "如何让传统技艺在现代社会中继续{{1}}，是许多手工艺人面临的现实问题。一方面，机器生产的效率远远超过手工，价格上的差距难以{{2}}；另一方面，愿意花数年时间学习一门老手艺的年轻人越来越少。近些年，一些匠人尝试借助短视频平台展示制作过程，意外地{{3}}了大量关注。这说明传统并非注定被淘汰，关键在于能否找到与当代生活{{4}}的方式。",
      "word_bank": [
        {
          "hanzi": "延续",
          "pinyin": "yánxù",
          "meaning_vi": "tiếp nối, duy trì"
        },
        {
          "hanzi": "弥补",
          "pinyin": "míbǔ",
          "meaning_vi": "bù đắp"
        },
        {
          "hanzi": "吸引",
          "pinyin": "xīyǐn",
          "meaning_vi": "thu hút"
        },
        {
          "hanzi": "衔接",
          "pinyin": "xiánjiē",
          "meaning_vi": "kết nối, tiếp nối"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "延续",
          "skill": "collocation",
          "explanation": "让传统技艺继续___ → 继续延续 (tiếp tục được duy trì)."
        },
        {
          "index": 2,
          "answer": "弥补",
          "skill": "collocation",
          "explanation": "差距难以___ → 弥补差距 (bù đắp khoảng cách)."
        },
        {
          "index": 3,
          "answer": "吸引",
          "skill": "collocation",
          "explanation": "吸引关注 (thu hút sự quan tâm)."
        },
        {
          "index": 4,
          "answer": "衔接",
          "skill": "logic",
          "explanation": "与当代生活___的方式 — cần từ chỉ sự kết nối giữa truyền thống và hiện đại: 衔接。"
        }
      ]
    },
    {
      "id": "cloze-hsk6-attention-01",
      "hsk_level": 6,
      "topic": "science_env",
      "passage": "信息过剩的时代，注意力反而成了最{{1}}的资源。各类平台通过精密的算法不断推送内容，人们在无意识中付出的时间远超预期。更值得警惕的是，算法倾向于强化用户原有的偏好，久而久之，视野可能变得越来越{{2}}。要摆脱这种困境，除了控制使用时长，还应有意识地{{3}}不同立场的信息，保持独立思考的能力。毕竟，判断力的{{4}}不是一天形成的，它需要长期的自我训练。",
      "word_bank": [
        {
          "hanzi": "稀缺",
          "pinyin": "xīquē",
          "meaning_vi": "khan hiếm"
        },
        {
          "hanzi": "狭窄",
          "pinyin": "xiázhǎi",
          "meaning_vi": "chật hẹp"
        },
        {
          "hanzi": "接触",
          "pinyin": "jiēchù",
          "meaning_vi": "tiếp xúc"
        },
        {
          "hanzi": "养成",
          "pinyin": "yǎngchéng",
          "meaning_vi": "sự hình thành, rèn nên"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "稀缺",
          "skill": "pos",
          "explanation": "最___的资源 cần tính từ mô tả nguồn lực: 最稀缺的资源 (tài nguyên khan hiếm nhất)."
        },
        {
          "index": 2,
          "answer": "狭窄",
          "skill": "logic",
          "explanation": "Thuật toán củng cố sở thích cũ nên 视野 (tầm nhìn) ngày càng 狭窄 (hẹp)."
        },
        {
          "index": 3,
          "answer": "接触",
          "skill": "collocation",
          "explanation": "接触不同立场的信息 (tiếp xúc thông tin từ nhiều lập trường)."
        },
        {
          "index": 4,
          "answer": "养成",
          "skill": "pos",
          "explanation": "判断力的___ cần danh từ hóa quá trình: 判断力的养成 (sự hình thành năng lực phán đoán)."
        }
      ]
    },
    {
      "id": "cloze-hsk6-aging-01",
      "hsk_level": 6,
      "topic": "economy_self",
      "passage": "人口老龄化正在{{1}}地改变社会结构。劳动力数量的下降会给经济增长带来压力，而养老与医疗支出的上升则{{2}}着公共财政的承受能力。面对这一趋势，单纯延迟退休并不足以从根本上解决问题，还需要通过技术进步来{{3}}劳动生产率。此外，如何让老年人在退出岗位后仍然保有社会参与感，同样是一个不容{{4}}的课题。",
      "word_bank": [
        {
          "hanzi": "深刻",
          "pinyin": "shēnkè",
          "meaning_vi": "sâu sắc"
        },
        {
          "hanzi": "考验",
          "pinyin": "kǎoyàn",
          "meaning_vi": "thử thách"
        },
        {
          "hanzi": "提升",
          "pinyin": "tíshēng",
          "meaning_vi": "nâng cao"
        },
        {
          "hanzi": "回避",
          "pinyin": "huíbì",
          "meaning_vi": "né tránh"
        }
      ],
      "blanks": [
        {
          "index": 1,
          "answer": "深刻",
          "skill": "pos",
          "explanation": "___地改变 cần tính từ làm trạng ngữ với 地: 深刻地改变 (thay đổi một cách sâu sắc)."
        },
        {
          "index": 2,
          "answer": "考验",
          "skill": "collocation",
          "explanation": "___着承受能力 → 考验承受能力 (thử thách khả năng chịu đựng)."
        },
        {
          "index": 3,
          "answer": "提升",
          "skill": "collocation",
          "explanation": "提升劳动生产率 (nâng cao năng suất lao động)."
        },
        {
          "index": 4,
          "answer": "回避",
          "skill": "collocation",
          "explanation": "不容___的课题 → 不容回避 (không thể né tránh)."
        }
      ]
    }
  ],
  "reading": [
    {
      "id": "reading-hsk1-family-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "我叫王小明，今年十岁。我家有四口人：爸爸、妈妈、姐姐和我。爸爸是老师，妈妈是医生。我很喜欢我的家。",
      "questions": [
        {
          "stem": "王小明的妈妈做什么工作？",
          "options": [
            "老师",
            "医生",
            "学生",
            "朋友"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "Câu 妈妈是医生 nói rõ mẹ là bác sĩ. 老师 là nghề của bố."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "王小明的学校",
            "王小明的家",
            "王小明的老师",
            "王小明的朋友"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Toàn đoạn giới thiệu các thành viên trong gia đình và kết bằng 我很喜欢我的家."
        }
      ]
    },
    {
      "id": "reading-hsk1-park-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "今天是星期天，天气很好。上午我和爸爸去公园。公园里有很多人，也有很多花。中午我们回家吃饭。",
      "questions": [
        {
          "stem": "他们上午去了哪儿？",
          "options": [
            "学校",
            "公园",
            "商店",
            "医院"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "上午我和爸爸去公园 — buổi sáng hai người đi công viên."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "他很喜欢学校",
            "星期天他和爸爸去公园",
            "他中午不想吃饭",
            "公园里没有人"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Cả đoạn kể một ngày chủ nhật đi công viên cùng bố."
        }
      ]
    },
    {
      "id": "reading-hsk1-fruit-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "我很喜欢吃水果。我每天都吃一个苹果。妈妈说，吃水果对身体很好。",
      "questions": [
        {
          "stem": "他每天吃什么？",
          "options": [
            "一个苹果",
            "两个苹果",
            "一杯水",
            "米饭"
          ],
          "correct_index": 0,
          "skill": "scanning",
          "explanation": "我每天都吃一个苹果 — mỗi ngày ăn một quả táo."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "他不喜欢苹果",
            "吃水果对身体好",
            "妈妈很忙",
            "他每天喝水"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Câu kết 吃水果对身体很好 là ý chính của đoạn."
        }
      ]
    },
    {
      "id": "reading-hsk1-teacher-01",
      "hsk_level": 1,
      "topic": "daily_life",
      "passage": "李老师是我的中文老师。她说汉语的时候很慢，我们都能听明白。同学们都很喜欢她。",
      "questions": [
        {
          "stem": "李老师教什么？",
          "options": [
            "中文",
            "英语",
            "音乐",
            "体育"
          ],
          "correct_index": 0,
          "skill": "scanning",
          "explanation": "李老师是我的中文老师 — cô Lý dạy tiếng Trung."
        },
        {
          "stem": "同学们对李老师怎么样？",
          "options": [
            "都很喜欢她",
            "不认识她",
            "不想上她的课",
            "觉得她说得太快"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Câu kết 同学们都很喜欢她; và cô nói chậm nên không phải 说得太快."
        }
      ]
    },
    {
      "id": "reading-hsk2-commute-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "我以前坐公交车上班，路上要一个小时。上个月我搬了新家，离公司很近，走路只要十五分钟。现在我每天可以多睡半个小时，真高兴。",
      "questions": [
        {
          "stem": "他现在怎么去公司？",
          "options": [
            "坐公交车",
            "走路",
            "骑自行车",
            "开车"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "走路只要十五分钟 — bây giờ đi bộ. 坐公交车 là cách đi trước đây."
        },
        {
          "stem": "搬家以后，他觉得怎么样？",
          "options": [
            "很累",
            "很高兴",
            "很忙",
            "不太好"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Câu kết 现在我每天可以多睡半个小时，真高兴."
        }
      ]
    },
    {
      "id": "reading-hsk2-gift-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "小王的生日是这个星期六。我们想给他一个生日礼物，但是不知道他喜欢什么。后来姐姐说，小王最近正在学做菜，我们可以送他一本做菜的书。",
      "questions": [
        {
          "stem": "小王最近在学什么？",
          "options": [
            "做菜",
            "开车",
            "画画",
            "游泳"
          ],
          "correct_index": 0,
          "skill": "scanning",
          "explanation": "小王最近正在学做菜 — dạo này Tiểu Vương đang học nấu ăn."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "他们在想送小王什么礼物",
            "小王星期六不在家",
            "姐姐很会做菜",
            "小王不喜欢看书"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Cả đoạn nói về việc chọn quà sinh nhật cho Tiểu Vương."
        }
      ]
    },
    {
      "id": "reading-hsk2-hospital-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "昨天我去医院看朋友。他生病已经三天了，医生说他要多休息，还要按时吃药。我给他买了一些水果，他很高兴。",
      "questions": [
        {
          "stem": "医生让朋友做什么？",
          "options": [
            "多运动",
            "多休息、按时吃药",
            "少喝水",
            "出去玩儿"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "医生说他要多休息，还要按时吃药."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "他去医院看生病的朋友",
            "他自己生病了",
            "医院里人很多",
            "他喜欢吃水果"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Người kể đi thăm bạn bị bệnh — đó là nội dung chính. Người bệnh là bạn, không phải người kể."
        }
      ]
    },
    {
      "id": "reading-hsk2-cat-01",
      "hsk_level": 2,
      "topic": "daily_life",
      "passage": "我家有一只小猫，它是白色的。它每天都在窗户旁边睡觉。有时候它也和我玩儿。我觉得它很可爱。",
      "questions": [
        {
          "stem": "小猫是什么颜色的？",
          "options": [
            "白色",
            "黑色",
            "红色",
            "黄色"
          ],
          "correct_index": 0,
          "skill": "scanning",
          "explanation": "它是白色的 — con mèo màu trắng."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "他的小猫",
            "他的房间",
            "他的朋友",
            "他的学校"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Toàn đoạn miêu tả con mèo nhỏ của gia đình."
        }
      ]
    },
    {
      "id": "reading-hsk3-smile-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "很多人认为，只有在心情好的时候才能露出笑容。其实，反过来也是一样的。当你感到压力大或者心情不好的时候，试着让自己笑一笑，你的大脑就会收到信号，心情也会慢慢好起来。所以，笑不仅是快乐的表现，也是让人快乐的方法。",
      "questions": [
        {
          "stem": "根据这段话，心情不好的时候应该怎么做？",
          "options": [
            "多睡觉",
            "试着笑一笑",
            "减少工作",
            "找朋友聊天"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "Căn cứ trực tiếp: 当你感到压力大或者心情不好的时候，试着让自己笑一笑."
        },
        {
          "stem": "这段话主要想告诉我们什么？",
          "options": [
            "快乐是很困难的",
            "大脑需要休息",
            "笑可以改变心情",
            "压力大对身体不好"
          ],
          "correct_index": 2,
          "skill": "skimming",
          "explanation": "Câu kết 笑不仅是快乐的表现，也是让人快乐的方法 — nụ cười có thể làm thay đổi tâm trạng."
        }
      ]
    },
    {
      "id": "reading-hsk3-music-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "很多人喜欢一边听音乐一边做作业，觉得这样不容易累。其实，如果音乐里有歌词，我们的注意力就会被分开，做题的速度反而会变慢。所以，需要认真思考的时候，最好选择安静的地方，或者听没有歌词的音乐。",
      "questions": [
        {
          "stem": "做作业的时候听什么样的音乐比较好？",
          "options": [
            "有歌词的",
            "没有歌词的",
            "声音很大的",
            "自己最喜欢的"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "Câu kết khuyên 听没有歌词的音乐; nhạc có lời làm phân tán chú ý."
        },
        {
          "stem": "这段话主要谈的是什么？",
          "options": [
            "怎么选择好听的音乐",
            "听音乐对做作业的影响",
            "音乐让人不容易累",
            "安静的地方很难找"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Cả đoạn phân tích ảnh hưởng của việc nghe nhạc lên việc làm bài."
        }
      ]
    },
    {
      "id": "reading-hsk3-speaking-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "小时候我最怕在很多人面前说话，一站起来就紧张得说不出话。老师建议我先在家里对着镜子练习，每天说三分钟。半年以后，我居然可以在班里介绍自己了。原来很多困难并没有想象中那么大，只是需要一点点开始。",
      "questions": [
        {
          "stem": "老师给作者的建议是什么？",
          "options": [
            "多参加比赛",
            "对着镜子每天练习",
            "先写下要说的话",
            "找同学一起说话"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "老师建议我先在家里对着镜子练习，每天说三分钟."
        },
        {
          "stem": "作者最后想告诉我们什么？",
          "options": [
            "困难可以慢慢练习克服",
            "说话是天生的能力",
            "老师的话不一定对",
            "紧张的时候最好别说话"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Câu kết 很多困难并没有想象中那么大，只是需要一点点开始."
        }
      ]
    },
    {
      "id": "reading-hsk3-phonerule-01",
      "hsk_level": 3,
      "topic": "daily_life",
      "passage": "我们家有一个规定：吃饭的时候不看手机。刚开始的时候，弟弟很不习惯，总是想去拿。但是过了一段时间，我们发现聊天的时间变多了，饭桌上也热闹了起来。现在连弟弟都说，这个规定其实很好。",
      "questions": [
        {
          "stem": "弟弟一开始对这个规定怎么样？",
          "options": [
            "很不习惯",
            "非常支持",
            "完全不知道",
            "觉得没有用"
          ],
          "correct_index": 0,
          "skill": "scanning",
          "explanation": "刚开始的时候，弟弟很不习惯，总是想去拿."
        },
        {
          "stem": "这段话主要说什么？",
          "options": [
            "一个家庭规定带来的变化",
            "弟弟很喜欢玩手机",
            "吃饭要吃得慢一些",
            "家里人都很忙"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Cả đoạn kể quy định không dùng điện thoại khi ăn và thay đổi nó mang lại."
        }
      ]
    },
    {
      "id": "reading-hsk4-organ-01",
      "hsk_level": 4,
      "topic": "science_env",
      "passage": "某种动物如果长期生活在黑暗的环境中，它的眼睛就会慢慢失去作用。相反，如果经常使用某个器官，这个器官就会越来越发达。这就是生物学上常说的“用进废退”。因此，在学习和工作中，我们也要注意多动脑筋，保持思维的活跃，防止大脑功能的退化。",
      "questions": [
        {
          "stem": "“用进废退”主要强调什么？",
          "options": [
            "黑暗环境对眼睛有害",
            "经常使用的器官会更发达",
            "动物不需要保护眼睛",
            "学习时不能太累"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Nguyên lý dựa trên câu 如果经常使用某个器官，这个器官就会越来越发达."
        },
        {
          "stem": "作者建议我们在学习中应该怎么做？",
          "options": [
            "多休息",
            "保护眼睛",
            "多动脑筋",
            "改变环境"
          ],
          "correct_index": 2,
          "skill": "scanning",
          "explanation": "Lời khuyên ở câu cuối: 我们也要注意多动脑筋."
        }
      ]
    },
    {
      "id": "reading-hsk4-effort-01",
      "hsk_level": 4,
      "topic": "economy_self",
      "passage": "有人认为，只要努力就一定能成功。这句话听起来很有道理，却容易让人忽略方向的重要性。如果一个人始终用错误的方法重复劳动，付出的时间越多，结果可能越让人失望。真正聪明的做法是：每隔一段时间停下来检查一下自己的方法，必要时及时调整。",
      "questions": [
        {
          "stem": "作者认为只强调努力可能带来什么问题？",
          "options": [
            "让人变得懒惰",
            "忽略方法和方向",
            "浪费别人的时间",
            "影响身体健康"
          ],
          "correct_index": 1,
          "skill": "inference",
          "explanation": "却容易让人忽略方向的重要性 và ví dụ về 错误的方法 cho thấy nguy cơ là bỏ qua phương pháp, phương hướng."
        },
        {
          "stem": "这段话主要想说明什么？",
          "options": [
            "努力之外还要选对方法",
            "成功需要运气",
            "不要相信别人的建议",
            "重复劳动没有意义"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Cả đoạn khuyên vừa nỗ lực vừa kiểm tra, điều chỉnh phương pháp."
        }
      ]
    },
    {
      "id": "reading-hsk4-balcony-01",
      "hsk_level": 4,
      "topic": "science_env",
      "passage": "近几年，越来越多的年轻人开始在阳台上种菜。他们并不是为了省钱——算上土、种子和时间，自己种的菜其实并不便宜。真正吸引他们的，是照顾植物的过程：每天浇一点水，看着叶子一天天变大，紧张的情绪好像也慢慢平静下来了。",
      "questions": [
        {
          "stem": "年轻人在阳台种菜的主要原因是什么？",
          "options": [
            "为了省钱",
            "因为菜更好吃",
            "喜欢照顾植物的过程",
            "为了送给朋友"
          ],
          "correct_index": 2,
          "skill": "skimming",
          "explanation": "真正吸引他们的，是照顾植物的过程; đoạn văn phủ định lý do tiết kiệm tiền."
        },
        {
          "stem": "关于自己种的菜，作者的看法是：",
          "options": [
            "比买的便宜",
            "其实并不便宜",
            "味道差一些",
            "长得特别快"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "算上土、种子和时间，自己种的菜其实并不便宜."
        }
      ]
    },
    {
      "id": "reading-hsk4-library-01",
      "hsk_level": 4,
      "topic": "science_env",
      "passage": "很多城市的图书馆延长了开放时间，晚上十点才关门。管理员发现，晚上来的读者中有不少是刚下班的年轻人。他们并不一定借书，有的只是想找一个安静又不用消费的地方待一会儿。对这些人来说，图书馆已经不只是读书的场所，更像是城市里的一个休息站。",
      "questions": [
        {
          "stem": "晚上来图书馆的年轻人有什么特点？",
          "options": [
            "都是学生",
            "大多来借书",
            "并不一定借书",
            "只在周末来"
          ],
          "correct_index": 2,
          "skill": "scanning",
          "explanation": "他们并不一定借书，有的只是想找一个安静又不用消费的地方."
        },
        {
          "stem": "作者认为图书馆现在的作用是什么？",
          "options": [
            "只是读书的地方",
            "也是城市里的休息空间",
            "代替了咖啡馆",
            "帮年轻人找工作"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "Câu kết: 图书馆已经不只是读书的场所，更像是城市里的一个休息站."
        }
      ]
    },
    {
      "id": "reading-hsk5-failure-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "失败并不可怕，可怕的是失去重新开始的勇气。在商业竞争中，许多成功的企业都曾经历过严重的财务危机或产品失败。然而，正是这些挫折促使他们重新审视市场需求，调整发展战略，最终实现了转型与突破。因此，将失败视为学习的机会，才是通往成功的重要途径。",
      "questions": [
        {
          "stem": "成功的企业是如何看待挫折的？",
          "options": [
            "尽量回避挫折",
            "把挫折当作学习的机会",
            "归咎于市场环境",
            "放弃原有的业务"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "Trực tiếp từ câu 将失败视为学习的机会."
        },
        {
          "stem": "这段话最想表达的观点是：",
          "options": [
            "商业竞争非常残酷",
            "财务危机无法避免",
            "勇于面对失败才能取得成功",
            "产品质量是企业生存的基础"
          ],
          "correct_index": 2,
          "skill": "skimming",
          "explanation": "Toàn đoạn nhấn mạnh 失败并不可怕，可怕的是失去重新开始的勇气."
        }
      ]
    },
    {
      "id": "reading-hsk5-hiring-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "在招聘中，不少企业开始降低对学历的要求，转而更加看重应聘者解决实际问题的能力。这一变化并不意味着教育不再重要，而是说明：文凭只能证明一个人过去接受过怎样的训练，却无法说明他在陌生情况下能做出什么反应。对求职者而言，这既是压力，也是机会——它让那些起点普通却持续学习的人有了更多可能。",
      "questions": [
        {
          "stem": "企业现在更看重应聘者的什么？",
          "options": [
            "学历的高低",
            "解决实际问题的能力",
            "工作年限",
            "毕业学校的名气"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "转而更加看重应聘者解决实际问题的能力."
        },
        {
          "stem": "作者对这一变化的态度是：",
          "options": [
            "认为教育已经不重要",
            "认为它给持续学习的人带来机会",
            "担心企业会招错人",
            "认为文凭仍是唯一标准"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "这既是压力，也是机会——它让那些起点普通却持续学习的人有了更多可能; đoạn văn cũng nói rõ 并不意味着教育不再重要."
        }
      ]
    },
    {
      "id": "reading-hsk5-busy-01",
      "hsk_level": 5,
      "topic": "economy_self",
      "passage": "很多人把“忙”当作努力的证明，日程表排得越满，越觉得自己有价值。然而，长期处于高速运转的状态，人往往只能处理眼前的事务，很难抽出精力思考什么才是真正重要的。适度的空闲并不是浪费，它给判断留出了余地。遗憾的是，在效率被反复强调的环境里，这种空闲常常需要刻意争取。",
      "questions": [
        {
          "stem": "作者认为长期忙碌会带来什么后果？",
          "options": [
            "身体容易生病",
            "很难思考真正重要的事",
            "工作质量一定下降",
            "同事关系变差"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "人往往只能处理眼前的事务，很难抽出精力思考什么才是真正重要的."
        },
        {
          "stem": "这段话主要想表达什么？",
          "options": [
            "效率越高越好",
            "适度的空闲对判断很有必要",
            "日程表应该排满",
            "忙碌是有价值的证明"
          ],
          "correct_index": 1,
          "skill": "skimming",
          "explanation": "适度的空闲并不是浪费，它给判断留出了余地 là luận điểm trung tâm."
        }
      ]
    },
    {
      "id": "reading-hsk5-bike-01",
      "hsk_level": 5,
      "topic": "science_env",
      "passage": "共享单车刚出现时，几乎所有人都认为它解决了“最后一公里”的难题。然而随着投放数量迅速增加，乱停乱放很快成了城市管理的新麻烦。经过几年调整，情况有了明显改善：企业按区域限制停车位置，城市则划出专门的停放区域。这个过程说明，一项新技术能否真正便利生活，往往取决于配套规则是否跟得上。",
      "questions": [
        {
          "stem": "共享单车数量迅速增加后出现了什么问题？",
          "options": [
            "车辆质量下降",
            "乱停乱放",
            "价格上涨",
            "无人使用"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "乱停乱放很快成了城市管理的新麻烦."
        },
        {
          "stem": "作者从共享单车的发展中得出什么结论？",
          "options": [
            "新技术需要配套规则才能真正便利生活",
            "共享单车最终会被淘汰",
            "城市管理不应干预新技术",
            "最后一公里问题无法解决"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Câu kết: 一项新技术能否真正便利生活，往往取决于配套规则是否跟得上."
        }
      ]
    },
    {
      "id": "reading-hsk6-ai-01",
      "hsk_level": 6,
      "topic": "science_env",
      "passage": "在关于人工智能的讨论中，“取代”往往是最容易引起关注的词。然而回顾技术史，机器对人类劳动的影响很少表现为整体性的替换，更多是对职业内部任务的重新分配：重复性环节被自动化吸收，而需要判断、协调与情感投入的部分反而变得更加突出。真正值得担忧的，并非岗位数量的减少，而是转型速度与劳动者学习速度之间的差距。若这一差距长期得不到弥合，社会将不得不承担相应的代价。",
      "questions": [
        {
          "stem": "根据这段话，机器对人类劳动的影响主要表现为什么？",
          "options": [
            "整体性地替换岗位",
            "职业内部任务的重新分配",
            "工资水平的下降",
            "工作时间的延长"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "更多是对职业内部任务的重新分配; đoạn văn phủ định 整体性的替换."
        },
        {
          "stem": "作者最担忧的是什么？",
          "options": [
            "岗位数量减少",
            "自动化技术发展太慢",
            "转型速度超过劳动者的学习速度",
            "人们过度关注“取代”一词"
          ],
          "correct_index": 2,
          "skill": "skimming",
          "explanation": "真正值得担忧的……是转型速度与劳动者学习速度之间的差距 — nghĩa là chuyển đổi nhanh hơn tốc độ học."
        }
      ]
    },
    {
      "id": "reading-hsk6-heritage-01",
      "hsk_level": 6,
      "topic": "science_env",
      "passage": "古建筑的修复始终面临一个难以两全的选择：是尽可能恢复它最初的模样，还是保留它在漫长岁月中留下的痕迹？前者追求完整，却可能抹去历史的层次；后者尊重时间，又容易被误解为疏于维护。近年来，“最小干预”逐渐成为业内共识——只在结构安全受到威胁时才动手，其余部分尽量维持原状。这一原则的背后，是对建筑作为历史见证者身份的承认。",
      "questions": [
        {
          "stem": "“最小干预”原则具体指什么？",
          "options": [
            "完全不做任何修复",
            "只在结构安全受威胁时才动手",
            "尽可能恢复最初的模样",
            "每隔几年全面翻修一次"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "只在结构安全受到威胁时才动手，其余部分尽量维持原状."
        },
        {
          "stem": "这段话主要讨论的是什么？",
          "options": [
            "古建筑修复中的原则选择",
            "古建筑的建造技术",
            "旅游业对古建筑的破坏",
            "历史研究的方法"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Cả đoạn xoay quanh lựa chọn nguyên tắc khi trùng tu kiến trúc cổ."
        }
      ]
    },
    {
      "id": "reading-hsk6-city-01",
      "hsk_level": 6,
      "topic": "economy_self",
      "passage": "一项针对城市居民的调查显示，人们对居住环境的满意度与房屋面积的关系，远不如与步行可达的公共设施的关系密切。换言之，楼下有便利店、公园和诊所的小户型住户，其幸福感往往高于位置偏远的大户型住户。这一结论对城市规划具有直接意义：单纯扩大住宅供给未必能提升生活质量，如何组织日常生活所需的服务网络，才是更关键的变量。",
      "questions": [
        {
          "stem": "调查发现什么与居民满意度关系更密切？",
          "options": [
            "房屋面积",
            "步行可达的公共设施",
            "房价高低",
            "小区的绿化率"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "满意度与房屋面积的关系，远不如与步行可达的公共设施的关系密切."
        },
        {
          "stem": "这一结论对城市规划的启示是什么？",
          "options": [
            "应重视服务网络而非单纯扩大住宅供给",
            "应优先建设大户型住宅",
            "应把居民迁往郊区",
            "应减少公共设施的投入"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "单纯扩大住宅供给未必能提升生活质量，如何组织……服务网络，才是更关键的变量."
        }
      ]
    },
    {
      "id": "reading-hsk6-language-01",
      "hsk_level": 6,
      "topic": "science_env",
      "passage": "语言的规范与变化之间存在着长期的张力。一方面，若缺乏相对稳定的标准，跨地域、跨代际的交流就会变得困难；另一方面，任何活着的语言都在不断吸收新的表达，试图完全冻结它的形态，注定难以成功。历史上被视为“错误”的用法，经过几代人的使用，往往悄然成为词典中的正式条目。因此，与其急于评判某种新说法是否合格，不如观察它能否在使用中长期存活。",
      "questions": [
        {
          "stem": "作者认为对新的语言表达应该采取什么态度？",
          "options": [
            "立刻判断是否合格",
            "观察它能否长期存活",
            "一律按词典标准否定",
            "完全不加以讨论"
          ],
          "correct_index": 1,
          "skill": "scanning",
          "explanation": "与其急于评判某种新说法是否合格，不如观察它能否在使用中长期存活."
        },
        {
          "stem": "这段话主要说明了什么？",
          "options": [
            "语言规范与变化之间的关系",
            "词典编写的具体流程",
            "方言正在迅速消失",
            "年轻人不重视语言规范"
          ],
          "correct_index": 0,
          "skill": "skimming",
          "explanation": "Câu mở đầu đã nêu chủ đề: 语言的规范与变化之间存在着长期的张力."
        }
      ]
    }
  ]
};

export default examPassages;
