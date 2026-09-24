// ============================================================
// MERGE GAME DATA — Công thức ghép chữ Hán từ bộ thủ
// Mỗi entry: key = chữ kết quả, value = { components, hsk, meaning_vi, pinyin }
// components là mảng KHÔNG THỨ TỰ các bộ thủ/thành phần cần để ghép.
// ============================================================

import { CHAR_COMPONENTS_DICT, RADICALS_DICT } from '../radicals-db.js';

/**
 * Metadata HSK1 cho các chữ có thể merge.
 * Bổ sung pinyin + nghĩa tiếng Việt mà CHAR_COMPONENTS_DICT không có.
 */
const HSK1_METADATA = {
  '好': { pinyin: 'hǎo', meaning_vi: 'tốt' },
  '明': { pinyin: 'míng', meaning_vi: 'sáng' },
  '你': { pinyin: 'nǐ', meaning_vi: 'bạn' },
  '他': { pinyin: 'tā', meaning_vi: 'anh ấy' },
  '她': { pinyin: 'tā', meaning_vi: 'cô ấy' },
  '它': { pinyin: 'tā', meaning_vi: 'nó' },
  '们': { pinyin: 'men', meaning_vi: 'các (hậu tố số nhiều)' },
  '这': { pinyin: 'zhè', meaning_vi: 'này' },
  '是': { pinyin: 'shì', meaning_vi: 'là' },
  '有': { pinyin: 'yǒu', meaning_vi: 'có' },
  '没': { pinyin: 'méi', meaning_vi: 'không (có)' },
  '多': { pinyin: 'duō', meaning_vi: 'nhiều' },
  '少': { pinyin: 'shǎo', meaning_vi: 'ít' },
  '猫': { pinyin: 'māo', meaning_vi: 'mèo' },
  '狗': { pinyin: 'gǒu', meaning_vi: 'chó' },
  '家': { pinyin: 'jiā', meaning_vi: 'nhà' },
  '国': { pinyin: 'guó', meaning_vi: 'quốc gia' },
  '中': { pinyin: 'zhōng', meaning_vi: 'giữa, Trung' },
  '书': { pinyin: 'shū', meaning_vi: 'sách' },
  '学': { pinyin: 'xué', meaning_vi: 'học' },
  '店': { pinyin: 'diàn', meaning_vi: 'cửa hàng' },
  '买': { pinyin: 'mǎi', meaning_vi: 'mua' },
  '卖': { pinyin: 'mài', meaning_vi: 'bán' },
  '电': { pinyin: 'diàn', meaning_vi: 'điện' },
  '话': { pinyin: 'huà', meaning_vi: 'lời nói' },
  '钱': { pinyin: 'qián', meaning_vi: 'tiền' },
  '茶': { pinyin: 'chá', meaning_vi: 'trà' },
  '饭': { pinyin: 'fàn', meaning_vi: 'cơm' },
  '菜': { pinyin: 'cài', meaning_vi: 'rau, món ăn' },
  '果': { pinyin: 'guǒ', meaning_vi: 'quả' },
  '谁': { pinyin: 'shuí', meaning_vi: 'ai' },
  '什': { pinyin: 'shén', meaning_vi: 'gì (trong 什么)' },
  '么': { pinyin: 'me', meaning_vi: 'gì (trong 什么)' },
  '怎': { pinyin: 'zěn', meaning_vi: 'sao (trong 怎么)' },
  '的': { pinyin: 'de', meaning_vi: 'của' },
  '了': { pinyin: 'le', meaning_vi: 'đã (trợ từ)' },
  '哪': { pinyin: 'nǎ', meaning_vi: 'nào' },
  '星': { pinyin: 'xīng', meaning_vi: 'sao' },
  '期': { pinyin: 'qī', meaning_vi: 'kỳ' },
  '亮': { pinyin: 'liàng', meaning_vi: 'sáng' },
  '喜': { pinyin: 'xǐ', meaning_vi: 'vui mừng' },
  '欢': { pinyin: 'huān', meaning_vi: 'vui vẻ' },
  '认': { pinyin: 'rèn', meaning_vi: 'nhận' },
  '识': { pinyin: 'shí', meaning_vi: 'biết' },
  '作': { pinyin: 'zuò', meaning_vi: 'làm' },
  '同': { pinyin: 'tóng', meaning_vi: 'cùng' },
  '朋': { pinyin: 'péng', meaning_vi: 'bạn (trong 朋友)' },
  '友': { pinyin: 'yǒu', meaning_vi: 'bạn hữu' },
  '再': { pinyin: 'zài', meaning_vi: 'lại' },
  '后': { pinyin: 'hòu', meaning_vi: 'sau' },
  '前': { pinyin: 'qián', meaning_vi: 'trước' },
  '早': { pinyin: 'zǎo', meaning_vi: 'sớm' },
  '岁': { pinyin: 'suì', meaning_vi: 'tuổi' },
  '点': { pinyin: 'diǎn', meaning_vi: 'điểm, giờ' },
  '本': { pinyin: 'běn', meaning_vi: 'gốc, quyển' },
  '笔': { pinyin: 'bǐ', meaning_vi: 'bút' },
  '字': { pinyin: 'zì', meaning_vi: 'chữ' },
  '天': { pinyin: 'tiān', meaning_vi: 'trời, ngày' },
  '地': { pinyin: 'dì', meaning_vi: 'đất' },
  '风': { pinyin: 'fēng', meaning_vi: 'gió' },
  '雨': { pinyin: 'yǔ', meaning_vi: 'mưa' },
  '云': { pinyin: 'yún', meaning_vi: 'mây' },
  '雪': { pinyin: 'xuě', meaning_vi: 'tuyết' },
  '花': { pinyin: 'huā', meaning_vi: 'hoa' },
  '草': { pinyin: 'cǎo', meaning_vi: 'cỏ' },
  '树': { pinyin: 'shù', meaning_vi: 'cây' },
  '河': { pinyin: 'hé', meaning_vi: 'sông' },
  '海': { pinyin: 'hǎi', meaning_vi: 'biển' },
  '红': { pinyin: 'hóng', meaning_vi: 'đỏ' },
  '绿': { pinyin: 'lǜ', meaning_vi: 'xanh lá' },
  '蓝': { pinyin: 'lán', meaning_vi: 'xanh lam' },
  '矮': { pinyin: 'ǎi', meaning_vi: 'thấp, lùn' },
  '胖': { pinyin: 'pàng', meaning_vi: 'béo' },
  '瘦': { pinyin: 'shòu', meaning_vi: 'gầy' },
  '短': { pinyin: 'duǎn', meaning_vi: 'ngắn' },
  '新': { pinyin: 'xīn', meaning_vi: 'mới' },
  '旧': { pinyin: 'jiù', meaning_vi: 'cũ' },
  '暗': { pinyin: 'àn', meaning_vi: 'tối' },
  '冷': { pinyin: 'lěng', meaning_vi: 'lạnh' },
  '净': { pinyin: 'jìng', meaning_vi: 'sạch' },
  '快': { pinyin: 'kuài', meaning_vi: 'nhanh' },
  '慢': { pinyin: 'màn', meaning_vi: 'chậm' },
  '难': { pinyin: 'nán', meaning_vi: 'khó' },
  '易': { pinyin: 'yì', meaning_vi: 'dễ' },
  '对': { pinyin: 'duì', meaning_vi: 'đúng' },
  '错': { pinyin: 'cuò', meaning_vi: 'sai' },
  '真': { pinyin: 'zhēn', meaning_vi: 'thật' },
  '爸': { pinyin: 'bà', meaning_vi: 'bố' },
  '妈': { pinyin: 'mā', meaning_vi: 'mẹ' },
  '汉': { pinyin: 'hàn', meaning_vi: 'Hán' },
  '语': { pinyin: 'yǔ', meaning_vi: 'ngôn ngữ' },
  '哥': { pinyin: 'gē', meaning_vi: 'anh trai' },
  '姐': { pinyin: 'jiě', meaning_vi: 'chị gái' },
  '妹': { pinyin: 'mèi', meaning_vi: 'em gái' },
  '弟': { pinyin: 'dì', meaning_vi: 'em trai' },
  '谢': { pinyin: 'xiè', meaning_vi: 'cảm ơn' },
  '客': { pinyin: 'kè', meaning_vi: 'khách' },
  '校': { pinyin: 'xiào', meaning_vi: 'trường' },
  '医': { pinyin: 'yī', meaning_vi: 'y học' },
  '院': { pinyin: 'yuàn', meaning_vi: 'viện' },
  '商': { pinyin: 'shāng', meaning_vi: 'thương' },
  '机': { pinyin: 'jī', meaning_vi: 'máy' },
  '路': { pinyin: 'lù', meaning_vi: 'đường' },
  '影': { pinyin: 'yǐng', meaning_vi: 'bóng, phim' },
  '视': { pinyin: 'shì', meaning_vi: 'nhìn, thị giác' },
  '脑': { pinyin: 'nǎo', meaning_vi: 'não' },
  '信': { pinyin: 'xìn', meaning_vi: 'thư, tin' },
  '杯': { pinyin: 'bēi', meaning_vi: 'cốc' },
  '条': { pinyin: 'tiáo', meaning_vi: 'dải, điều' },
  '漂': { pinyin: 'piào', meaning_vi: 'trôi, đẹp' },
  '服': { pinyin: 'fú', meaning_vi: 'quần áo, phục vụ' },
  '桌': { pinyin: 'zhuō', meaning_vi: 'bàn' },
  '椅': { pinyin: 'yǐ', meaning_vi: 'ghế' },
  '钟': { pinyin: 'zhōng', meaning_vi: 'đồng hồ' },
  '表': { pinyin: 'biǎo', meaning_vi: 'biểu, đồng hồ đeo tay' },
  '画': { pinyin: 'huà', meaning_vi: 'vẽ, bức tranh' },
  '报': { pinyin: 'bào', meaning_vi: 'báo' },
  '纸': { pinyin: 'zhǐ', meaning_vi: 'giấy' },
  '苹': { pinyin: 'píng', meaning_vi: 'táo (trong 苹果)' },
  '包': { pinyin: 'bāo', meaning_vi: 'bao, gói' },
  '奶': { pinyin: 'nǎi', meaning_vi: 'sữa, bà' },
  '华': { pinyin: 'huá', meaning_vi: 'Hoa' },
  // === Bổ sung từ expansion HSK1 ===
  '问': { pinyin: 'wèn', meaning_vi: 'hỏi' },
  '回': { pinyin: 'huí', meaning_vi: 'về, quay lại' },
  '四': { pinyin: 'sì', meaning_vi: 'bốn' },
  '看': { pinyin: 'kàn', meaning_vi: 'nhìn' },
  '男': { pinyin: 'nán', meaning_vi: 'nam' },
  '坐': { pinyin: 'zuò', meaning_vi: 'ngồi' },
  '想': { pinyin: 'xiǎng', meaning_vi: 'muốn, nhớ' },
  '爱': { pinyin: 'ài', meaning_vi: 'yêu' },
  '听': { pinyin: 'tīng', meaning_vi: 'nghe' },
  '唱': { pinyin: 'chàng', meaning_vi: 'hát' },
  '吃': { pinyin: 'chī', meaning_vi: 'ăn' },
  '喝': { pinyin: 'hē', meaning_vi: 'uống' },
  '说': { pinyin: 'shuō', meaning_vi: 'nói' },
  '读': { pinyin: 'dú', meaning_vi: 'đọc' },
  '请': { pinyin: 'qǐng', meaning_vi: 'mời, xin' },
  '课': { pinyin: 'kè', meaning_vi: 'bài học' },
  '找': { pinyin: 'zhǎo', meaning_vi: 'tìm' },
  '做': { pinyin: 'zuò', meaning_vi: 'làm' },
  '住': { pinyin: 'zhù', meaning_vi: 'ở' },
  '给': { pinyin: 'gěi', meaning_vi: 'cho' },
  '还': { pinyin: 'hái', meaning_vi: 'vẫn còn' },
  '边': { pinyin: 'biān', meaning_vi: 'bên, cạnh' },
  '都': { pinyin: 'dōu', meaning_vi: 'đều' },
  '和': { pinyin: 'hé', meaning_vi: 'và' },
  '很': { pinyin: 'hěn', meaning_vi: 'rất' },
  '忙': { pinyin: 'máng', meaning_vi: 'bận' },
  '块': { pinyin: 'kuài', meaning_vi: 'đồng (tiền)' },
  '件': { pinyin: 'jiàn', meaning_vi: 'cái (lượng từ)' },
  '贵': { pinyin: 'guì', meaning_vi: 'đắt' },
  '百': { pinyin: 'bǎi', meaning_vi: 'trăm' },
  '零': { pinyin: 'líng', meaning_vi: 'số không' },
  '病': { pinyin: 'bìng', meaning_vi: 'bệnh' },
  '穿': { pinyin: 'chuān', meaning_vi: 'mặc' },
  '到': { pinyin: 'dào', meaning_vi: 'đến' },
  '第': { pinyin: 'dì', meaning_vi: 'thứ (số thứ tự)' },
  '写': { pinyin: 'xiě', meaning_vi: 'viết' },
  '开': { pinyin: 'kāi', meaning_vi: 'mở' },
  '歌': { pinyin: 'gē', meaning_vi: 'bài hát' },
  '睡': { pinyin: 'shuì', meaning_vi: 'ngủ' },
  '晚': { pinyin: 'wǎn', meaning_vi: 'tối, muộn' },
  '外': { pinyin: 'wài', meaning_vi: 'ngoài' },
  '玩': { pinyin: 'wán', meaning_vi: 'chơi' },
  '您': { pinyin: 'nín', meaning_vi: 'ngài (kính trọng)' },
  '太': { pinyin: 'tài', meaning_vi: 'quá' },
  '分': { pinyin: 'fēn', meaning_vi: 'phút, chia' },
  '年': { pinyin: 'nián', meaning_vi: 'năm' },
  '号': { pinyin: 'hào', meaning_vi: 'số, ngày' },
  '能': { pinyin: 'néng', meaning_vi: 'có thể' },
  '要': { pinyin: 'yào', meaning_vi: 'muốn, cần' },
  '去': { pinyin: 'qù', meaning_vi: 'đi' },
  '会': { pinyin: 'huì', meaning_vi: 'biết, họp' },
  '来': { pinyin: 'lái', meaning_vi: 'đến' },
  '见': { pinyin: 'jiàn', meaning_vi: 'thấy, gặp' },
  '才': { pinyin: 'cái', meaning_vi: 'mới' },
  '叫': { pinyin: 'jiào', meaning_vi: 'gọi' },
  '吗': { pinyin: 'ma', meaning_vi: 'không? (trợ từ hỏi)' },
  '吧': { pinyin: 'ba', meaning_vi: 'nhé (trợ từ)' },
  '呢': { pinyin: 'ne', meaning_vi: 'nhỉ (trợ từ)' },
  '喂': { pinyin: 'wèi', meaning_vi: 'này, ơi' },
  '只': { pinyin: 'zhǐ', meaning_vi: 'chỉ' },
  '上': { pinyin: 'shàng', meaning_vi: 'trên' },
  '下': { pinyin: 'xià', meaning_vi: 'dưới' },
  '千': { pinyin: 'qiān', meaning_vi: 'nghìn' },
  '九': { pinyin: 'jiǔ', meaning_vi: 'chín' },
  '六': { pinyin: 'liù', meaning_vi: 'sáu' },
  '七': { pinyin: 'qī', meaning_vi: 'bảy' },
  '三': { pinyin: 'sān', meaning_vi: 'ba' },
  '五': { pinyin: 'wǔ', meaning_vi: 'năm' },
  '些': { pinyin: 'xiē', meaning_vi: 'một vài' },
  '两': { pinyin: 'liǎng', meaning_vi: 'hai, đôi' },
  '个': { pinyin: 'gè', meaning_vi: 'cái (lượng từ)' },
  '半': { pinyin: 'bàn', meaning_vi: 'rưỡi, nửa' },
  '元': { pinyin: 'yuán', meaning_vi: 'đồng (tiền)' },
  '事': { pinyin: 'shì', meaning_vi: 'việc' },
  '不': { pinyin: 'bù', meaning_vi: 'không' },
};

/**
 * Build MERGE_RECIPES tự động từ CHAR_COMPONENTS_DICT.
 * Chỉ giữ các chữ có ≥2 thành phần (bỏ identity mapping như 大→['大']).
 * Enrich với metadata HSK1 khi có.
 */
function buildRecipes() {
  const recipes = {};

  for (const [char, components] of Object.entries(CHAR_COMPONENTS_DICT)) {
    // Bỏ identity mapping (chữ chỉ map vào chính nó)
    if (components.length === 1 && components[0] === char) continue;
    // Bỏ entries quá ngắn hoặc không hợp lệ
    if (components.length < 2) continue;

    const meta = HSK1_METADATA[char] || {};
    recipes[char] = {
      components: [...components],
      hsk: meta.pinyin ? 1 : 0,
      meaning_vi: meta.meaning_vi || '',
      pinyin: meta.pinyin || '',
    };
  }

  return recipes;
}

export const BASE_RECIPES = buildRecipes();

/**
 * Metadata cho mỗi bộ thủ hiển thị trên cá.
 * tier: 1 = cơ bản (spawn đầu game), 2 = trung cấp, 3 = hiếm.
 */
export const RADICAL_FISH = {};

// Tự động tạo metadata từ RADICALS_DICT
for (const [radical, nameVi] of Object.entries(RADICALS_DICT)) {
  let tier = 1;
  // Các bộ thủ phức tạp hơn hoặc ít phổ biến → tier cao hơn
  const complexRadicals = new Set([
    '鬼', '龙', '龟', '骨', '齿', '黑', '麦', '黄', '革', '韦',
    '音', '页', '风', '飞', '香', '马', '鸟', '鱼', '高', '鬲',
  ]);
  if (complexRadicals.has(radical)) tier = 3;

  RADICAL_FISH[radical] = {
    name_vi: nameVi,
    tier,
  };
}

/**
 * Kiểm tra xem tập hợp components đã cho có khớp với recipe nào không.
 * @param {string[]} selectedComponents - Mảng bộ thủ người chơi chọn
 * @returns {{ success: boolean, result?: string, recipe?: object }}
 */
export function findMatchingRecipe(selectedComponents) {
  if (!selectedComponents || selectedComponents.length < 2) {
    return { success: false };
  }

  // Sort để so sánh không phụ thuộc thứ tự
  const sorted = [...selectedComponents].sort();

  for (const [char, recipe] of Object.entries(BASE_RECIPES)) {
    const recipeSorted = [...recipe.components].sort();
    if (sorted.length !== recipeSorted.length) continue;

    let match = true;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== recipeSorted[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      return { success: true, result: char, recipe };
    }
  }

  return { success: false };
}
