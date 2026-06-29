import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'audio');

// Known-bad placeholder: Youdao/Google occasionally return a 1920-byte / 96ms
// error blip with HTTP 200. Before this guard it was saved under 333 different
// texts (see scripts/tts_qa.py). Reject it by exact md5, and floor the size
// well below the smallest real clip (5760B) but above the junk (1920B).
const BAD_AUDIO_MD5 = new Set([
  'c9a91d0b09b0e40eeffc4c02b6cb26af',
]);
const MIN_AUDIO_BYTES = 3000;

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

// Một file đã có trên đĩa vẫn có thể là clip rác (96ms / 1920B) từ lần tải
// trước khi có guard. Nhận diện để KHÔNG đưa vào index — text đó sẽ rơi xuống
// online TTS thay vì phát clip câm.
function isJunkAudio(buf) {
  return buf.length < MIN_AUDIO_BYTES || BAD_AUDIO_MD5.has(md5(buf));
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
  if (!clean || !/[\u4e00-\u9fff]/.test(clean)) return;
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

  addText(texts, '你好');
  addText(texts, '谢谢');
  addText(texts, '再见');
  return [...texts];
}

async function downloadMp3(text) {
  const encoded = encodeURIComponent(text);
  const sources = [
    `https://dict.youdao.com/dictvoice?audio=${encoded}&type=2`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&tl=zh-CN&q=${encoded}`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').toLowerCase();
      // Must be audio: reject JSON/HTML error pages served with HTTP 200.
      if (type.includes('json') || type.includes('html') || type.includes('text')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Reject the known error blip and anything below a real clip's size.
      if (isJunkAudio(buf)) continue;
      // Sanity: real MP3 starts with an ID3 tag or an MPEG frame sync (0xFFEx).
      const isMp3 = (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
        || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
      if (!isMp3) continue;
      return buf;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const texts = await collectTexts();
  const index = {};
  let created = 0;
  let skipped = 0;

  for (const text of texts) {
    const key = audioKey(text);
    const file = join(outDir, `${key}.mp3`);
    if (existsSync(file)) {
      // File đã có nhưng có thể là clip rác cũ → kiểm lại trước khi index.
      if (!isJunkAudio(readFileSync(file))) {
        index[text] = key;
        skipped += 1;
        continue;
      }
      // Là clip rác: thử tải lại bản tốt; nếu vẫn hỏng thì bỏ khỏi index.
      const fresh = await downloadMp3(text);
      if (fresh) {
        writeFileSync(file, fresh);
        index[text] = key;
        created += 1;
        await new Promise(resolve => setTimeout(resolve, 120));
      } else {
        console.warn(`junk (online TTS fallback): ${text}`);
      }
      continue;
    }
    const buf = await downloadMp3(text);
    if (!buf) {
      console.warn(`skip: ${text}`);
      continue;
    }
    writeFileSync(file, buf);
    index[text] = key;
    created += 1;
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  console.log(`audio ready: ${Object.keys(index).length} files (${created} new, ${skipped} cached)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
