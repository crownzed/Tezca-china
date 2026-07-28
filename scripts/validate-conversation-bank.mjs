// ============================================================
// VALIDATE-CONVERSATION-BANK — Cổng kiểm tra lúc build
//
// Kiểm tra ngân hàng kịch bản hội thoại tại
// backend/app/data/conversation_scenarios.json. Nội dung soạn tay nên
// lỗi ở đây không làm crash mà chỉ âm thầm làm hội thoại dở đi: lượt
// thoại dài quá cấp, thiếu nước đi cứu hội thoại, chủ đề khai báo mà
// không ai dùng, hai kịch bản cùng cấp trùng chủ đề. Lỗi → exit 1,
// chặn build.
//
// Cùng bộ luật với backend/tests/test_conversation_bank.py — sửa một
// bên thì sửa cả bên kia.
// ============================================================
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BANK_PATH = join(
  root, 'backend', 'app', 'data', 'conversation_scenarios.json',
);

const LEVELS = [1, 2, 3, 4, 5, 6];

// Nước đi cứu hội thoại tối thiểu. Thiếu "silent" thì người học bí là hội
// thoại đứng; thiếu "wrong_language" thì luật số 5 trong system prompt viện
// tới một nước đi không tồn tại.
const REQUIRED_REPAIRS = ['silent', 'wrong_language'];

// Số kịch bản tối thiểu mỗi cấp: 1 thì lần luyện thứ hai lặp y nguyên vai.
const MIN_PER_LEVEL = 4;

// Số giọng điệu tối thiểu mỗi cấp. Cấp chỉ có 'service' thì người học chỉ biết
// nói kiểu mua bán; chỉ có 'casual' thì gặp người lạ là dùng sai cách nói.
const MIN_REGISTERS_PER_LEVEL = 2;

const cjkCount = (s) => (String(s || '').match(/[㐀-鿿]/g) || []).length;

export function loadBank() {
  return JSON.parse(readFileSync(BANK_PATH, 'utf8'));
}

/** Trả về { errors, stats } — không throw, để caller quyết định. */
export function validateBank(bank) {
  const errors = [];
  const scenarios = bank.scenarios || [];
  const stats = { total: scenarios.length, byLevel: {}, byRegister: {}, topics: 0 };

  const registers = new Set(
    Object.keys(bank._registers || {}).filter((k) => !k.startsWith('_')),
  );
  const topics = new Set(bank._topics || []);
  const triggers = new Set(
    Object.keys(bank._repair_triggers || {}).filter((k) => !k.startsWith('_')),
  );
  const caps = {};
  for (const [k, v] of Object.entries(bank._turn_cjk_cap || {})) {
    if (!k.startsWith('_')) caps[Number(k)] = Number(v);
  }

  const ids = new Set();
  const topicPerLevel = new Map();
  const openingPerLevel = new Map();
  const usedTopics = new Set();
  const registerPerLevel = new Map();

  for (const s of scenarios) {
    const tag = `[${s.id}]`;
    if (ids.has(s.id)) errors.push(`${tag} id trùng`);
    ids.add(s.id);

    const level = s.hsk_level;
    const cap = caps[level];
    if (!cap) errors.push(`${tag} hsk_level không hợp lệ: ${level}`);
    stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
    stats.byRegister[s.register] = (stats.byRegister[s.register] || 0) + 1;

    if (!topics.has(s.topic)) errors.push(`${tag} topic lạ: ${s.topic}`);
    if (!registers.has(s.register)) errors.push(`${tag} register lạ: ${s.register}`);
    usedTopics.add(s.topic);

    if (!registerPerLevel.has(level)) registerPerLevel.set(level, new Set());
    registerPerLevel.get(level).add(s.register);

    // Trùng (cấp, chủ đề) => cấp đó thực chất chỉ có một tình huống để luyện.
    const topicKey = `${level}/${s.topic}`;
    if (topicPerLevel.has(topicKey)) {
      errors.push(`${tag} trùng chủ đề '${s.topic}' ở HSK${level} với ${topicPerLevel.get(topicKey)}`);
    }
    topicPerLevel.set(topicKey, s.id);

    // Vai + tình huống là thứ phân biệt bank với prompt chung.
    for (const field of ['setting', 'user_role', 'goal']) {
      if (!String(s[field] || '').trim()) errors.push(`${tag} thiếu ${field}`);
    }
    for (const field of ['name', 'persona']) {
      if (!String((s.ai_role || {})[field] || '').trim()) {
        errors.push(`${tag} ai_role thiếu ${field}`);
      }
    }

    // AI phải mở lời: hội thoại thật luôn có người bắt đầu.
    if (cjkCount(s.opening_cn) === 0) errors.push(`${tag} opening_cn phải bằng tiếng Trung`);
    if (!String(s.opening_vi || '').trim()) errors.push(`${tag} thiếu opening_vi`);

    const openings = openingPerLevel.get(level) || new Map();
    if (openings.has(s.opening_cn)) {
      errors.push(`${tag} dùng chung opening_cn với ${openings.get(s.opening_cn)} ở HSK${level}`);
    }
    openings.set(s.opening_cn, s.id);
    openingPerLevel.set(level, openings);

    // Mọi câu AI sẽ nói/bắt chước phải trong trần của cấp. Few-shot dài hơn
    // trần thì model theo ví dụ chứ không theo luật.
    const exemplars = s.turn_exemplars || [];
    const repairs = s.repair_moves || [];
    if (cap) {
      const lines = [
        ['opening_cn', s.opening_cn],
        ['wrap_up_cn', s.wrap_up_cn],
        ...exemplars.map((e, i) => [`exemplar[${i}].reply_cn`, e.reply_cn]),
        ...repairs.map((m) => [`repair[${m.trigger}]`, m.cn]),
      ];
      for (const [label, text] of lines) {
        const n = cjkCount(text);
        if (n > cap) {
          errors.push(`${tag} ${label}: ${n} chữ Hán > trần ${cap} của HSK${level}`);
        }
      }
    }

    if (exemplars.length < 2) {
      errors.push(`${tag} cần >= 2 mẫu lượt thoại để dạy được nhịp đối đáp, đang ${exemplars.length}`);
    }
    exemplars.forEach((e, i) => {
      if (cjkCount(e.user_cn) === 0) errors.push(`${tag} mẫu ${i}: user_cn phải bằng tiếng Trung`);
      if (cjkCount(e.reply_cn) === 0) errors.push(`${tag} mẫu ${i}: reply_cn phải bằng tiếng Trung`);
      if (!String(e.reply_vi || '').trim()) errors.push(`${tag} mẫu ${i}: thiếu reply_vi`);
    });
    const replies = exemplars.map((e) => e.reply_cn);
    if (new Set(replies).size !== replies.length) {
      errors.push(`${tag} turn_exemplars có reply_cn trùng nhau`);
    }

    const seenTriggers = new Set(repairs.map((m) => m.trigger));
    for (const need of REQUIRED_REPAIRS) {
      if (!seenTriggers.has(need)) errors.push(`${tag} thiếu nước đi '${need}'`);
    }
    for (const m of repairs) {
      if (!triggers.has(m.trigger)) errors.push(`${tag} trigger lạ: ${m.trigger}`);
      if (cjkCount(m.cn) === 0) errors.push(`${tag} nước đi ${m.trigger}: cn phải bằng tiếng Trung`);
      // Nước đi cứu hội thoại mà nằm trong câu mở đầu thì AI chỉ lặp lại y
      // nguyên câu người học vừa không hiểu — hội thoại đứng nguyên tại chỗ.
      const opening = String(s.opening_cn || '');
      if (m.cn && opening.includes(m.cn)) {
        errors.push(`${tag} nước đi ${m.trigger} lặp lại câu mở đầu: ${m.cn}`);
      }
    }

    const vocab = s.key_vocab || [];
    if (vocab.length < 3) errors.push(`${tag} key_vocab nên có >= 3 từ, đang ${vocab.length}`);
    const hanzi = vocab.map((v) => v.hanzi);
    if (new Set(hanzi).size !== hanzi.length) errors.push(`${tag} key_vocab có từ trùng`);
    for (const v of vocab) {
      for (const field of ['hanzi', 'pinyin', 'meaning_vi']) {
        if (!String(v[field] || '').trim()) {
          errors.push(`${tag} key_vocab thiếu ${field}: ${JSON.stringify(v)}`);
        }
      }
    }

    // Từ khóa phải thật sự xuất hiện trong hội thoại, không chỉ là danh sách rời.
    const corpus = [
      s.opening_cn, s.wrap_up_cn,
      ...exemplars.map((e) => e.user_cn),
      ...exemplars.map((e) => e.reply_cn),
      ...repairs.map((m) => m.cn),
    ].join(' ');
    const used = hanzi.filter((h) => h && corpus.includes(h));
    if (used.length < 2) {
      errors.push(`${tag} chỉ ${used.length} từ khóa xuất hiện trong các câu mẫu`);
    }
  }

  // Đủ độ phủ theo cấp.
  for (const level of LEVELS) {
    const n = stats.byLevel[level] || 0;
    if (n < MIN_PER_LEVEL) {
      errors.push(`[coverage] HSK${level} chỉ có ${n} kịch bản, cần >= ${MIN_PER_LEVEL}`);
    }

    // Cấp chỉ có 'service' thì người học chỉ biết nói kiểu mua bán; chỉ có
    // 'casual' thì gặp người lạ là dùng sai cách nói. Lỗi âm thầm: dữ liệu vẫn
    // hợp lệ, hội thoại vẫn chạy, chỉ là học lệch.
    const regsAtLevel = registerPerLevel.get(level) || new Set();
    if (regsAtLevel.size < MIN_REGISTERS_PER_LEVEL) {
      errors.push(
        `[coverage] HSK${level} chỉ có giọng điệu ${[...regsAtLevel].sort().join(', ') || '(không có)'}`
        + `, cần >= ${MIN_REGISTERS_PER_LEVEL} loại`,
      );
    }
  }

  // Chủ đề khai báo mà không kịch bản nào dùng là danh mục chết: client lọc
  // theo nó sẽ ra danh sách rỗng.
  const unused = [...topics].filter((t) => !usedTopics.has(t)).sort();
  if (unused.length) {
    errors.push(`[coverage] _topics khai báo nhưng chưa có kịch bản: ${unused.join(', ')}`);
  }
  stats.topics = usedTopics.size;

  return { errors, stats };
}

function main() {
  const bank = loadBank();
  const { errors, stats } = validateBank(bank);

  console.log('── Conversation bank ──');
  console.log(`  ${stats.total} kịch bản · ${stats.topics} chủ đề được dùng`);
  console.log(`  Theo cấp: ${LEVELS.map((l) => `HSK${l}=${stats.byLevel[l] || 0}`).join(' ')}`);
  const regs = Object.keys(stats.byRegister).sort();
  console.log(`  Theo giọng điệu: ${regs.map((r) => `${r}=${stats.byRegister[r]}`).join(' ')}`);

  if (errors.length) {
    console.error(`\n❌ ${errors.length} lỗi:`);
    for (const e of errors.slice(0, 50)) console.error('  ' + e);
    if (errors.length > 50) console.error(`  … và ${errors.length - 50} lỗi nữa`);
    process.exit(1);
  }
  console.log('✓ Conversation bank validator pass');
}

// Chỉ chạy khi được gọi trực tiếp, để file khác import validateBank được.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
