import { useEffect, useState } from 'react';
import { audioKey, audioPath } from './audio-keys.js';

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
  if (quizType === 'listening' || quizType === 'dialogue' || quizType === 'translation') {
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

export function getVoiceStatus() {
  const count = audioIndex ? Object.keys(audioIndex).length : 0;
  return {
    supported: true,
    ready: true,
    label: count ? `File am thanh · ${count} cau` : 'Dang tai file am thanh',
    quality: count ? 'natural' : 'loading',
    engine: 'local',
  };
}

export function useVoiceStatus() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    preloadAudioIndex().then(() => {
      if (alive) setVersion(value => value + 1);
    });
    return () => { alive = false; };
  }, []);
  return getVoiceStatus();
}

export function VoiceMeta() {
  const status = useVoiceStatus();
  return <small className={`voice-meta voice-meta--${status.quality}`}>{status.label}</small>;
}

function stopActiveAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

function resolveBestChineseVoice() {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;

  const zhVoices = voices.filter(v => v.lang.startsWith('zh-'));
  if (zhVoices.length === 0) return null;

  // Prioritize premium Chinese voices
  const priority = [
    'Xiaoxiao', 'Yunxi', 'Xiaoyi', 'Yunjian', 'Xiaobei', // Microsoft Azure
    'Tingting', 'Yaoyao', 'Yating',                         // older voices
    'Google', '普通话', '國語',                               // Google + generic
  ];
  for (const prefix of priority) {
    const found = zhVoices.find(v => v.name.includes(prefix));
    if (found) return found;
  }
  // Pick the first zh-CN or zh-TW voice
  const mandarin = zhVoices.find(v => v.lang === 'zh-CN') || zhVoices.find(v => v.lang === 'zh-TW');
  if (mandarin) return mandarin;

  return zhVoices[0];
}

// Ensure voices are loaded (Chrome loads them async)
async function ensureVoices() {
  if (cachedVoices) return cachedVoices;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length > 0) {
    cachedVoices = voices;
    return voices;
  }
  return new Promise(resolve => {
    const onVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    // Timeout fallback after 2s
    setTimeout(() => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    }, 2000);
  });
}

async function speakBrowser(text, rate, runId, onDone) {
  if (!hasSpeechSupport()) {
    onDone(false);
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.resume?.();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = Math.max(0.5, Math.min(1.0, rate));
  utter.volume = 1;
  utter.pitch = 1;

  await ensureVoices();
  if (runId !== speechRunId) { onDone(false); return; }

  const bestVoice = resolveBestChineseVoice();
  if (bestVoice) {
    utter.voice = bestVoice;
  }

  utter.onend = () => {
    if (runId === speechRunId) onDone(true);
  };
  utter.onerror = (e) => {
    if (runId === speechRunId) onDone(false);
  };

  synth.speak(utter);
}

export function stopSpeech() {
  speechRunId += 1;
  stopActiveAudio();
  if (hasSpeechSupport()) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

export function speak(text, rate = 0.82, onDone, mode = 'sentence') {
  const clean = String(text || '').trim();
  if (!clean) {
    onDone?.(false);
    return '';
  }
  unlockSpeech();
  const runId = ++speechRunId;
  stopActiveAudio();
  if (hasSpeechSupport()) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }

  const src = getLocalAudioSrc(clean);
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.playbackRate = Math.max(0.5, Math.min(1.15, rate));
  activeAudio = audio;

  const finish = (success) => {
    if (runId !== speechRunId) return;
    if (activeAudio === audio) activeAudio = null;
    onDone?.(success);
  };

  let resolved = false;
  audio.onended = () => { if (!resolved) { resolved = true; finish(true); } };
  audio.onerror = () => {
    if (!resolved) {
      resolved = true;
      if (runId !== speechRunId) return;
      speakBrowser(clean, rate, runId, finish);
    }
  };

  audio.play().catch(() => {
    if (!resolved) {
      resolved = true;
      if (runId !== speechRunId) return;
      speakBrowser(clean, rate, runId, finish);
    }
  });

  return src;
}

export function getAudioHint(audioPlaying, audioPlayed, audioError) {
  if (audioError) return 'Khong phat duoc am thanh. Thu dung nut Nghe ben duoi.';
  if (audioPlaying) return 'Dang phat...';
  if (audioPlayed) return 'Co the nghe lai.';
  return 'Bam Nghe de phat am thanh.';
}
