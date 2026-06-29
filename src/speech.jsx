
let speechRunId = 0;
let speechUnlocked = false;
let activeAudio = null;
let audioIndex = null;
let cachedVoices = null;

// Số/ký hiệu -> dạng đọc tiếng Trung, để engine không tự đoán. Corpus hiện
// thuần Trung nhưng custom-vocab có thể chèn số/ký hiệu. Port từ
// scripts/tts_qa.py:normalize_for_tts — giữ cùng quy tắc ở build & runtime.
const _CN_DIGITS = '零一二三四五六七八九';
const _CN_UNITS = ['', '十', '百', '千'];
const _CN_BIG = ['', '万', '亿'];
const _SYMBOLS = { '+': '加', '-': '减', '=': '等于', '&': '和', '@': '艾特', '$': '美元', '#': '井号' };

function _intToChinese(num) {
  if (num === 0) return '零';
  const neg = num < 0;
  num = Math.abs(num);
  const groups = [];
  while (num > 0) { groups.push(num % 10000); num = Math.floor(num / 10000); }

  const four = (n) => {
    let s = '';
    let zeroPending = false;
    let started = false;
    for (const unit of [3, 2, 1, 0]) {
      const d = Math.floor(n / 10 ** unit) % 10;
      if (d === 0) { if (started) zeroPending = true; continue; }
      if (zeroPending) { s += _CN_DIGITS[0]; zeroPending = false; }
      if (!(d === 1 && unit === 1 && !started)) s += _CN_DIGITS[d];
      s += _CN_UNITS[unit];
      started = true;
    }
    return s;
  };

  const parts = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i];
    if (g === 0) {
      if (parts.length && !parts[parts.length - 1].endsWith(_CN_DIGITS[0]) && i < groups.length - 1) {
        parts.push(_CN_DIGITS[0]);
      }
      continue;
    }
    let chunk = four(g);
    if (parts.length && g < 1000 && i < groups.length - 1) chunk = _CN_DIGITS[0] + chunk;
    parts.push(chunk + _CN_BIG[i]);
  }
  const result = parts.join('').replace(new RegExp(`${_CN_DIGITS[0]}+$`), '') || _CN_DIGITS[0];
  return neg ? `负${result}` : result;
}

function _numberToChinese(token) {
  if (token.includes('.')) {
    const [head, tail] = token.split('.');
    const headCn = head ? _intToChinese(parseInt(head, 10)) : '零';
    const tailCn = [...tail].map(d => _CN_DIGITS[parseInt(d, 10)]).join('');
    return `${headCn}点${tailCn}`;
  }
  return _intToChinese(parseInt(token, 10));
}

export function normalizeForTts(text) {
  let out = String(text || '');
  out = out.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n) => '百分之' + _numberToChinese(n));
  out = out.replace(/\d+(?:\.\d+)?/g, m => _numberToChinese(m));
  return [...out].map(ch => _SYMBOLS[ch] ?? ch).join('');
}

const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAGAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

export function hasSpeechSupport() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function isSpeechUnlocked() {
  return speechUnlocked;
}

export function unlockSpeech() {
  speechUnlocked = true;
  try {
    const silent = new Audio(SILENT_MP3);
    silent.volume = 0.01;
    silent.play().catch(() => {});
  } catch { /* ignore */ }
  if (!hasSpeechSupport()) return;
  const synth = window.speechSynthesis;
  synth.resume?.();
  const utter = new SpeechSynthesisUtterance('​');
  utter.volume = 0.01;
  utter.lang = 'zh-CN';
  synth.speak(utter);
}

export function bindSpeechUnlock() {
  if (typeof window === 'undefined') return undefined;
  const handler = () => {
    unlockSpeech();
    preloadAudioIndex();
  };
  window.addEventListener('pointerdown', handler, { once: true, passive: true });
  window.addEventListener('keydown', handler, { once: true });
  return () => {
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
  };
}

export async function preloadAudioIndex() {
  if (audioIndex) return audioIndex;
  try {
    const res = await fetch('/audio/index.json');
    if (res.ok) audioIndex = await res.json();
    else audioIndex = {};
  } catch {
    audioIndex = {};
  }
  return audioIndex;
}

export function resolveQuestionAudioText(question) {
  if (!question) return '';
  const direct = String(question.audio_text || '').trim();
  if (direct) return direct;
  const quizType = question.quiz_type || '';
  if (quizType === 'listening' || quizType === 'translation') {
    const explanation = String(question.explanation || '').trim();
    if (explanation) {
      const cn = explanation.split(' · ')[0]?.trim();
      if (cn) return cn;
    }
  }
  // vocab/cloze (và các dạng có từ mục tiêu) không lưu audio_text: đọc chữ Hán
  // của từ. Phủ luôn câu cũ trong DB lưu audio_text="" mà không cần migration.
  const hanzi = question.word?.hanzi || question.word?.character;
  if (hanzi) return String(hanzi);
  return '';
}

export function getLocalAudioSrc(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  // index.json là nguồn xác thực: chỉ trả file local khi text có trong index.
  // Không đoán audioPath() vì hash có thể trỏ tới clip rác (96ms) đã bị loại
  // khỏi index — đoán sẽ phát clip câm và chặn fallback online TTS.
  const indexed = audioIndex?.[clean];
  if (indexed) return `/audio/${indexed}.mp3`;
  return '';
}

function stopActiveAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

// Online TTS sources — natural Chinese voices
const TTS_API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');
function geminiTtsUrl(text) {
  return `${TTS_API_BASE}/tts?text=${encodeURIComponent(text)}`;
}
function youdaoTtsUrl(text) {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`;
}
function googleTtsUrl(text) {
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=${encodeURIComponent(text)}`;
}

function tryPlayUrl(url, rate, runId, onDone, fallback) {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.playbackRate = Math.max(0.6, Math.min(1.1, rate));
  activeAudio = audio;

  let resolved = false;
  audio.onended = () => {
    if (!resolved) { resolved = true; activeAudio = null; if (runId === speechRunId) onDone(true); }
  };
  audio.onerror = () => {
    if (!resolved) { resolved = true; activeAudio = null; if (runId === speechRunId) fallback(); }
  };
  audio.play().catch(() => {
    if (!resolved) { resolved = true; activeAudio = null; if (runId === speechRunId) fallback(); }
  });
}

function playOnlineTts(text, rate, runId, onDone) {
  const goBrowser = () => speakBrowser(text, rate, runId, onDone);
  const goGoogle = () => tryPlayUrl(googleTtsUrl(text), rate, runId, onDone, goBrowser);
  const goYoudao = () => tryPlayUrl(youdaoTtsUrl(text), rate, runId, onDone, goGoogle);
  // Gemini TTS (giọng tự nhiên nhất) -> Youdao -> Google -> browser
  tryPlayUrl(geminiTtsUrl(text), rate, runId, onDone, goYoudao);
}

// Browser TTS — last resort fallback
async function speakBrowser(text, rate, runId, onDone) {
  if (!hasSpeechSupport()) { onDone(false); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume?.();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = Math.max(0.55, Math.min(0.9, rate));
  utter.volume = 1;
  utter.pitch = 0.95;

  await ensureVoices();
  if (runId !== speechRunId) { onDone(false); return; }

  const bestVoice = resolveBestChineseVoice();
  if (bestVoice) utter.voice = bestVoice;

  utter.onend = () => { if (runId === speechRunId) onDone(true); };
  utter.onerror = () => { if (runId === speechRunId) onDone(false); };
  synth.speak(utter);
}

async function ensureVoices() {
  if (cachedVoices) return cachedVoices;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length > 0) { cachedVoices = voices; return voices; }
  return new Promise(resolve => {
    const handler = () => {
      synth.removeEventListener('voiceschanged', handler);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', handler);
    setTimeout(() => { synth.removeEventListener('voiceschanged', handler); cachedVoices = synth.getVoices(); resolve(cachedVoices); }, 2000);
  });
}

function resolveBestChineseVoice() {
  const voices = cachedVoices || window.speechSynthesis.getVoices();
  const zh = voices.filter(v => v.lang.startsWith('zh-'));
  if (!zh.length) return null;
  const prio = ['Xiaoxiao', 'Yunxi', 'Xiaoyi', 'Yunjian', 'Xiaobei', 'Tingting', 'Yaoyao', 'Yating', 'Google', 'Microsoft'];
  for (const p of prio) {
    const found = zh.find(v => v.name.includes(p));
    if (found) return found;
  }
  return zh.find(v => v.lang === 'zh-CN') || zh.find(v => v.lang === 'zh-TW') || zh[0];
}

export function stopSpeech() {
  speechRunId += 1;
  stopActiveAudio();
  if (hasSpeechSupport()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
}

export function speak(text, rate = 0.82, onDone) {
  const clean = normalizeForTts(String(text || '').trim());
  if (!clean) { onDone?.(false); return ''; }
  unlockSpeech();
  const runId = ++speechRunId;
  stopActiveAudio();
  if (hasSpeechSupport()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }

  const src = getLocalAudioSrc(clean);
  if (!src) {
    // Không có clip local đã xác thực → dùng online TTS ngay.
    playOnlineTts(clean, rate, runId, (success) => {
      if (runId !== speechRunId) return;
      onDone?.(success);
    });
    return '';
  }
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.playbackRate = Math.max(0.5, Math.min(1.15, rate));
  activeAudio = audio;

  let resolved = false;
  const finish = (success) => {
    if (runId !== speechRunId) return;
    if (activeAudio === audio) activeAudio = null;
    onDone?.(success);
  };

  audio.onended = () => { if (!resolved) { resolved = true; finish(true); } };
  audio.onerror = () => {
    if (!resolved) {
      resolved = true;
      if (runId !== speechRunId) return;
      // Local MP3 not found → try Youdao TTS online
      playOnlineTts(clean, rate, runId, finish);
    }
  };

  audio.play().catch(() => {
    if (!resolved) {
      resolved = true;
      if (runId !== speechRunId) return;
      playOnlineTts(clean, rate, runId, finish);
    }
  });

  return src;
}

export function getAudioHint(audioPlaying, audioPlayed, audioError) {
  if (audioError) return 'Khong phat duoc am thanh.';
  if (audioPlaying) return 'Dang phat...';
  if (audioPlayed) return 'Co the nghe lai.';
  return 'Bam Nghe de phat.';
}
