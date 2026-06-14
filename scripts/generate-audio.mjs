import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'audio');

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
      const type = res.headers.get('content-type') || '';
      if (type.includes('json')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 80) continue;
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
      index[text] = key;
      skipped += 1;
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
