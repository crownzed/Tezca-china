import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'audio');

// Backend Gemini TTS proxy (backend/app/routers/tts.py) — WAV 24kHz mono, giọng
// Kore. Cần chạy backend + có GEMINI_NATIVE_API_KEYS trước khi chạy script này.
const API_BASE = process.env.VITE_API_BASE ?? process.env.TTS_API_BASE ?? 'http://127.0.0.1:8000';

// Gemini WAV 24kHz mono 16-bit = 48000 byte/giây + 44B header. Một âm tiết đơn
// (~0.3s) đã ~14KB, nên clip thật luôn > vài KB. Chặn clip rỗng/hỏng dưới ngưỡng.
const MIN_WAV_BYTES = 4000;
// MP3 nén ~10x nên clip thật vẫn > ~500B; dưới ngưỡng này là encode hỏng.
const MIN_MP3_BYTES = 500;

// File .wav hợp lệ bắt đầu bằng "RIFF"...."WAVE" (magic ở byte 0-3 và 8-11).
function isWav(buf) {
  return buf.length >= 12
    && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 // RIFF
    && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45; // WAVE
}

// MP3 hợp lệ bắt đầu bằng ID3 tag ("ID3") hoặc MPEG frame sync (0xFFEx).
function isMp3(buf) {
  return buf.length >= MIN_MP3_BYTES
    && ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
      || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

function audioKey(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `z${(hash >>> 0).toString(36)}`;
}

function addText(set, value) {
  const clean = String(value || '').trim();
  if (!clean || !/[一-鿿]/.test(clean)) return;
  set.add(clean);
}

async function collectTexts() {
  const texts = new Set();
  const { flashcardsData } = await import(pathToFileURL(join(root, 'src', 'data.js')).href);
  const bank = await import(pathToFileURL(join(root, 'src', 'vocab-bank.js')).href);

  for (const card of flashcardsData || []) {
    addText(texts, card.character);
    addText(texts, card.exampleSentence);
    for (const row of card.examples || []) addText(texts, row.cn);
  }

  for (const list of [bank.hsk1, bank.hsk2, bank.hsk3, bank.hsk4, bank.hsk5]) {
    for (const card of list || []) {
      addText(texts, card.character);
      addText(texts, card.exampleSentence);
    }
  }

  // Quét cả từ vựng và câu ví dụ từ words_export.json (chỉ lọc HSK 1-4 để chạy nhanh)
  try {
    const exportPath = join(root, 'backend', 'app', 'data', 'words_export.json');
    if (existsSync(exportPath)) {
      const payload = JSON.parse(readFileSync(exportPath, 'utf8'));
      const words = payload.words || [];
      for (const w of words) {
        if (Number(w.hsk_level) <= 4) {
          addText(texts, w.hanzi);
          for (const ex of w.examples || []) {
            addText(texts, ex.cn);
          }
        }
      }
    }
  } catch (err) {
    console.error('Không thể đọc words_export.json để tạo audio:', err);
  }

  addText(texts, '你好');
  addText(texts, '谢谢');
  addText(texts, '再见');
  return [...texts];
}

// Trả { wav } (Gemini) hoặc { mp3 } (ElevenLabs fallback) khi thành công,
// { quota, retryAfter } khi mọi nguồn cạn quota (backend 429 kèm Retry-After
// giây), hoặc { fail: true } cho lỗi tạm khác. Backend có thể trả WAV hoặc MP3
// tùy nguồn — phân biệt bằng magic bytes.
async function downloadAudio(text, keyIndex) {
  // no_gemini=1: Gemini đã cạn quota cả ngày; bỏ qua để đi thẳng ElevenLabs,
  // tránh thử 5 key Gemini (đều 429) vô ích trước mỗi clip — nhanh hơn nhiều.
  // key_index: ghim đúng 1 key ElevenLabs cho worker này → 3 worker/3 key chạy
  // song song, rate-limit độc lập theo từng tài khoản.
  const url = `${API_BASE}/tts?text=${encodeURIComponent(text)}&no_gemini=1&key_index=${keyIndex}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After'));
      return { quota: true, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 60 };
    }
    if (!res.ok) return { fail: true };
    const buf = Buffer.from(await res.arrayBuffer());
    if (isMp3(buf)) return { mp3: buf };  // ElevenLabs: đã là MP3, lưu thẳng
    if (buf.length >= MIN_WAV_BYTES && isWav(buf)) return { wav: buf };
    return { fail: true };
  } catch {
    return { fail: true };
  }
}

// Encode WAV (Gemini 24kHz mono) → MP3 chất lượng cao qua ffmpeg-static.
// -q:a 2 = VBR ~190kbps: giữ trọn dải tần giọng nói, dung lượng ~1/10 WAV.
// Ghi WAV ra tmp rồi encode để tránh phụ thuộc hành vi pipe stdin của ffmpeg.
async function encodeMp3(wavBuf, key) {
  const tmpWav = join(tmpdir(), `tezca-${key}.wav`);
  writeFileSync(tmpWav, wavBuf);
  try {
    const { stdout } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmpWav, '-q:a', '2', '-f', 'mp3', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
    );
    return isMp3(stdout) ? stdout : null;
  } catch {
    return null;
  }
}

// Kho cũ (3586 clip) tải từ Youdao/Google — cũng là .mp3 nên isMp3() pass và sẽ
// bị skip nhầm, giữ nguyên audio kém. Xóa MỘT LẦN để buộc tạo lại bằng Gemini.
// Marker .source đánh dấu kho đã chuyển sang Gemini: lần chạy sau (resume khi hết
// quota) đọc marker → KHÔNG xóa lại clip Gemini đã tạo.
function purgeLegacyAudioOnce() {
  const marker = join(outDir, '.source');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === 'gemini') return;
  let removed = 0;
  for (const name of readdirSync(outDir)) {
    if (name.endsWith('.mp3') || name.endsWith('.wav')) {
      rmSync(join(outDir, name));
      removed += 1;
    }
  }
  writeFileSync(marker, 'gemini');
  console.log(`Đã xóa ${removed} clip cũ (Youdao/Google). Bắt đầu tạo lại bằng Gemini.`);
}

// Số worker song song = số key ElevenLabs ghim đầu danh sách (index 0..N-1).
// Mỗi key là 1 tài khoản có quota + rate-limit riêng nên chạy song song an toàn,
// cày nhanh ~Nx. Chỉnh qua env AUDIO_WORKERS; mặc định 3.
const NUM_WORKERS = Math.max(1, Number(process.env.AUDIO_WORKERS) || 3);

async function main() {
  if (!ffmpegPath) {
    console.error('ffmpeg-static không khả dụng. Chạy: npm install');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  purgeLegacyAudioOnce();
  const texts = await collectTexts();
  const index = {};
  let created = 0;
  let skipped = 0;

  // Lưu index tăng dần để lần chạy sau resume được (script skip file mp3 hợp lệ).
  const flushIndex = () => writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Con trỏ chung: mỗi worker rút text kế tiếp. JS đơn luồng nên tăng cursor đồng
  // bộ, không cần khoá. Worker chỉ dừng khi CHÍNH key của nó cạn theo ngày (chờ
  // nhiều lần vẫn 429); các worker khác vẫn chạy tới khi hết hàng đợi.
  const MAX_WAIT_STREAK = 6;
  let cursor = 0;
  let deadWorkers = 0;

  async function worker(keyIndex) {
    let waitStreak = 0;
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= texts.length) return;
      const text = texts[i];
      const key = audioKey(text);
      const file = join(outDir, `${key}.mp3`);
      // File MP3 đã có và hợp lệ → giữ, không gọi lại (tiết kiệm quota).
      if (existsSync(file) && isMp3(readFileSync(file))) {
        index[text] = key;
        skipped += 1;
        continue;
      }

      let res = await downloadAudio(text, keyIndex);
      // Chờ-và-thử-lại khi key này cạn quota phút này.
      let dead = false;
      while (res.quota) {
        waitStreak += 1;
        if (waitStreak > MAX_WAIT_STREAK) { dead = true; break; }
        const waitSec = Math.min(Math.ceil(res.retryAfter) + 2, 75);
        flushIndex();
        console.log(`[key#${keyIndex}] hết quota phút này, chờ ${waitSec}s rồi thử lại (đã có ${Object.keys(index).length}/${texts.length})`);
        await sleep(waitSec * 1000);
        res = await downloadAudio(text, keyIndex);
      }
      if (dead) {
        // Key này coi như cạn theo ngày. Trả text về hàng đợi cho worker khác:
        // lùi cursor về đúng chỉ số này nếu chưa ai vượt qua (an toàn vì đơn luồng).
        deadWorkers += 1;
        console.log(`[key#${keyIndex}] chờ nhiều lần vẫn hết quota — dừng worker này (${deadWorkers}/${NUM_WORKERS}).`);
        if (i < cursor) cursor = i;  // để worker còn sống nhặt lại text này
        return;
      }
      waitStreak = 0;

      if (res.fail) {
        console.warn(`skip (TTS fail): ${text}`);
        continue;
      }
      // ElevenLabs trả MP3 sẵn → lưu thẳng; Gemini trả WAV → encode sang MP3.
      let mp3 = res.mp3;
      if (!mp3) {
        mp3 = await encodeMp3(res.wav, key);
        if (!mp3) {
          console.warn(`skip (mp3 encode fail): ${text}`);
          continue;
        }
      }
      writeFileSync(file, mp3);
      index[text] = key;
      created += 1;
      if (created % 25 === 0) { flushIndex(); console.log(`... ${created} clip mới, đang chạy (${NUM_WORKERS} key song song)`); }
      await sleep(120);
    }
  }

  console.log(`Bắt đầu ${NUM_WORKERS} worker song song (key#0..#${NUM_WORKERS - 1}).`);
  await Promise.all(Array.from({ length: NUM_WORKERS }, (_, k) => worker(k)));
  const aborted = deadWorkers >= NUM_WORKERS;

  // Nhặt mọi clip đã có trên đĩa vào index (kể cả khi aborted giữa chừng) — nếu
  // không, clip đã tạo nằm sau điểm dừng sẽ rớt khỏi index dù file vẫn còn.
  for (const text of texts) {
    if (index[text]) continue;
    const key = audioKey(text);
    if (existsSync(join(outDir, `${key}.mp3`))) index[text] = key;
  }

  flushIndex();
  const remaining = texts.length - Object.keys(index).length;
  if (aborted) {
    console.log(`DỪNG: mọi key đều hết quota (có thể cạn theo NGÀY). Đã có ${Object.keys(index).length}/${texts.length} clip (${created} mới, ${skipped} cache). Còn ~${remaining} — chạy lại "npm run audio" sau khi quota reset.`);
  } else {
    console.log(`audio ready: ${Object.keys(index).length} files (${created} new, ${skipped} cached)`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
