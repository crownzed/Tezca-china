import { audioPath } from './audio-keys.js';

let speechRunId = 0;
let speechUnlocked = false;
let activeAudio = null;
let audioIndex = null;
let cachedVoices = null;

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
    const hanzi = question.word?.hanzi || question.word?.character;
    if (hanzi) return String(hanzi);
  }
  return '';
}

export function getLocalAudioSrc(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const indexed = audioIndex?.[clean];
  if (indexed) return `/audio/${indexed}.mp3`;
  return audioPath(clean);
}

function stopActiveAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

// Online TTS sources — natural Chinese voices
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
  tryPlayUrl(youdaoTtsUrl(text), rate, runId, onDone, goGoogle);
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
  const clean = String(text || '').trim();
  if (!clean) { onDone?.(false); return ''; }
  unlockSpeech();
  const runId = ++speechRunId;
  stopActiveAudio();
  if (hasSpeechSupport()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }

  const src = getLocalAudioSrc(clean);
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
