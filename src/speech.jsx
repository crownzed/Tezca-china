
let speechRunId = 0;
let speechUnlocked = false;
let activeAudio = null;
let audioIndex = null;
let cachedVoices = null;
let speechPaused = false;

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

// CJK Unified Ideographs (basic + ext A + compatibility) — đồng bộ với
// _CJK_RE ở backend/app/services/llm_generator_service.py.
const HAS_CJK_RE = /[一-鿿㐀-䶿豈-﫿]/;

export function resolveQuestionAudioText(question) {
  if (!question) return '';
  const direct = String(question.audio_text || '').trim();
  if (direct) return direct;
  const quizType = question.quiz_type || '';
  if (quizType === 'listening' || quizType === 'translation') {
    const explanation = String(question.explanation || '').trim();
    if (explanation) {
      const cn = explanation.split(' · ')[0]?.trim();
      // Chỉ nhận khi tiền tố THẬT là tiếng Trung. Câu template lưu explanation
      // dạng "câu CN · nghĩa VI" nên tiền tố là hanzi; câu AI (source
      // ai_practice_llm / ai_bank_upgrade_llm) lưu giải thích thuần tiếng Việt
      // và audio_text rỗng — không lọc thì TTS đọc tiếng Việt bằng giọng Trung.
      if (cn && HAS_CJK_RE.test(cn)) return cn;
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
  speechPaused = false;
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

// Kéo tốc độ ở BROWSER, dùng khi nguồn audio không nhận tham số tốc độ (clip
// local đã ghi sẵn, native speech TTS, fallback TTS).
//
// Sàn 0.85 là có lý do: dưới mức đó browser resample một luồng ĐÃ NÉN và nghe
// nhòe. Nhưng nó cũng là cái bẫy — SPEECH_RATES của hội thoại có 0.72 và 0.82,
// cả hai đều bị kẹp lên 0.85, nên hai lựa chọn đó từng cho ra audio Y HỆT NHAU.
// Đường primary TTS không còn đi qua đây nữa (tốc độ vào query ``speed``), nên sàn
// này chỉ còn áp cho các nguồn thật sự không điều được tốc độ.
function clampPlaybackRate(rate, min = 0.85, max = 1.1) {
  return Math.max(min, Math.min(max, rate));
}

function tryPlayUrl(url, rate, runId, onDone, fallback) {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = 1;
  audio.playbackRate = clampPlaybackRate(rate);
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

// Phát audio đã được tổng hợp SẴN ở đúng tốc độ (primary TTS nhận ``speed``), nên
// playbackRate phải là 1.0 — kéo thêm ở browser là chậm/nhanh hai lần và mất công
// resample vô ích. Đây là điểm khác duy nhất so với tryPlayUrl.
function playAtNativeRate(url, runId, onDone, fallback) {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = 1;
  audio.playbackRate = 1;
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
  // Native speech TTS (WAV 24kHz, same-origin, âm chuẩn) -> browser TTS.
  // Youdao/Google đã bỏ: mono bitrate thấp, hay cắt cụt chữ, và cross-origin
  // nên không normalize được — chính là nguồn "bóp chữ" người dùng phản ánh.
  tryPlayUrl(geminiTtsUrl(text), rate, runId, onDone, goBrowser);
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

// --- Tạm dừng / tiếp tục (dùng cho nghe viết theo câu) ----------------------
//
// stopSpeech() tăng speechRunId + đưa currentTime về 0, tức nó HUỶ chứ không
// dừng: bấm phát lại là đọc từ đầu. Chính tả cần dừng giữa câu rồi tiếp đúng
// chỗ, nên phải giữ nguyên activeAudio và runId — không được stopActiveAudio().
//
// Vì activeAudio là biến private của module, component KHÔNG thể tự làm việc
// này bằng một `new Audio()` riêng: audio đó nằm ngoài hàng đợi nên stopSpeech()
// sẽ không dọn được, và nó sẽ phát chồng lên câu do speak() phát.
export function pauseSpeech() {
  if (activeAudio && !activeAudio.paused) {
    activeAudio.pause();
    speechPaused = true;
    return true;
  }
  // Nhánh browser TTS (không có activeAudio): SpeechSynthesis pause/resume
  // được ở phần lớn engine. Không đo được vị trí nhưng vẫn dừng đúng chỗ.
  if (hasSpeechSupport() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    try {
      window.speechSynthesis.pause();
      speechPaused = true;
      return true;
    } catch { /* engine không hỗ trợ → coi như không dừng được */ }
  }
  return false;
}

export function resumeSpeech() {
  if (activeAudio && activeAudio.paused) {
    speechPaused = false;
    activeAudio.play().catch(() => { /* mất quyền phát → caller phát lại từ đầu */ });
    return true;
  }
  if (hasSpeechSupport() && window.speechSynthesis.paused) {
    try {
      window.speechSynthesis.resume();
      speechPaused = false;
      return true;
    } catch { /* ignore */ }
  }
  speechPaused = false;
  return false;
}

export function isSpeechPaused() {
  return speechPaused;
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
  audio.volume = 1;
  // Clip local đã ghi sẵn: kéo dưới 0.85 làm nhòe/méo chữ. Giữ floor cao hơn
  // browser TTS (vốn xử lý kéo chậm tốt hơn file nén).
  audio.playbackRate = Math.max(0.85, Math.min(1.15, rate));
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

// Đọc câu tiếng Trung qua /tts?no_gemini=1. Tên hàm là di sản: nhánh
// ``no_gemini`` từng đi thẳng fallback TTS, nhưng tts.py kiểm primary TRƯỚC nhánh
// đó, nên khi có primary keys thì giọng thật là primary TTS.
// Fallback TTS chỉ vào khi primary không khả dụng. Lỗi cả hai → playOnlineTts
// (native speech TTS → browser TTS) để câu trả lời luôn được phát.
export function speakEleven(text, rate = 0.9, onDone) {
  const clean = normalizeForTts(String(text || '').trim());
  if (!clean) { onDone?.(false); return; }
  unlockSpeech();
  const runId = ++speechRunId;
  stopActiveAudio();
  if (hasSpeechSupport()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  playEleven(clean, rate, runId, onDone);
}

// Phần phát thật, tách khỏi speakEleven để hàng đợi dùng lại được mà KHÔNG tăng
// speechRunId — tăng runId giữa hàng đợi sẽ tự hủy chính câu vừa xếp trước đó.
//
// ``streaming`` chọn /tts/stream (MP3 theo khối, byte đầu ~2.1s) thay cho /tts
// (trọn file, ~3.0s). Chỉ chế độ gọi bật nó: ở đó thời gian tới TIẾNG ĐẦU TIÊN là
// thứ người học cảm nhận. Với flashcard/quiz thì tổng thời gian mới quan trọng và
// kho MP3 tĩnh phục vụ phần lớn, nên giữ /tts.
//
// Tốc độ đi vào QUERY ``speed``, không qua playbackRate: primary TTS tổng hợp lại từ
// đầu ở nhịp đó, còn browser thì resample luồng đã nén. Đo trên key thật:
// speed=0.72 -> 340ms/chữ, 0.82 -> 293, 0.95 -> 202 (đơn điệu, ASR khớp 3/3,
// bitrate vẫn 128kbps). Trước đây 0.72 và 0.82 đều bị sàn playbackRate kẹp lên
// 0.85 nên cho ra audio y hệt nhau — bộ chọn tốc độ coi như vô tác dụng.
function playEleven(clean, rate, runId, onDone, { streaming = false } = {}) {
  const speedParam = `&speed=${encodeURIComponent(rate)}`;
  const url = streaming
    ? `${TTS_API_BASE}/tts/stream?text=${encodeURIComponent(clean)}${speedParam}`
    : `${TTS_API_BASE}/tts?text=${encodeURIComponent(clean)}&no_gemini=1${speedParam}`;
  playAtNativeRate(url, runId, (success) => {
    if (runId !== speechRunId) return;
    onDone?.(success);
  }, () => {
    if (runId !== speechRunId) return;
    // Fallback (native speech TTS / browser TTS) KHÔNG nhận tham số tốc độ, nên ở đó phải
    // quay lại kéo playbackRate — kèm cả sàn 0.85 của nó.
    playOnlineTts(clean, rate, runId, (success) => {
      if (runId !== speechRunId) return;
      onDone?.(success);
    });
  });
}

// --- Hàng đợi phát nối tiếp (dùng cho SSE hội thoại theo câu) ---------------
//
// Vì sao cần: /chat/stream phát từng CÂU ngay khi model chốt, nên câu 2 thường
// tới khi câu 1 còn đang phát. Gọi speakEleven thẳng thì mỗi lần gọi sẽ tăng
// speechRunId và stopActiveAudio() — tức câu mới CẮT NGANG câu đang đọc, và
// người học chỉ nghe được câu cuối. Hàng đợi giữ đúng thứ tự và chỉ phát tiếp
// khi câu trước kết thúc.
//
// Chia sẻ speechRunId với phần còn lại của module: stopSpeech() tăng runId nên
// mọi câu còn trong hàng đợi tự bị loại ở nhánh kiểm runId dưới đây.
let queueRunId = 0;
let queueItems = [];
let queuePlaying = false;
// Chặn cứng: khi người học CẮT LỜI, mọi câu tới sau phải bị bỏ.
//
// Vì sao cần cờ riêng mà không chỉ stopSpeech(): stopSpeech() tăng speechRunId,
// và nhánh "lượt phát MỚI" dưới đây thấy queueRunId !== speechRunId nên nó XOÁ
// hàng đợi rồi MỞ một lượt mới — tức câu kế tiếp của stream SSE còn đang mở lại
// được phát, AI nói tiếp lên đầu người học. Chỉ beginSpeechQueue() (một lượt trả
// lời mới thật sự) mới hạ được cờ này.
let queueSuspended = false;

// --- Prefetch TTS cho câu kế tiếp -------------------------------------------
//
// Khi câu N bắt đầu phát, fetch NGAY audio cho câu N+1 (nếu có trong hàng đợi).
// Server cache-hit → trả instant (~0ms); cache-miss → audio sẵn sàng khi câu N
// phát xong, loại bỏ khoảng lặng giữa hai câu.
//
// Chỉ bật khi queueStreaming=true (hội thoại): flashcard/quiz dùng /tts (trọn file)
// nên prefetch không giúp gì — tổng thời gian như nhau, chỉ khác lúc nào fetch.
//
// Lưu blob URL thay vì ArrayBuffer: Audio() nhận blob URL trực tiếp, không cần
// decode lại. Revoke sau khi phát xong để giải phóng RAM.
const _prefetchCache = new Map(); // key -> { blobUrl, controller }
let _prefetchController = null;   // AbortController chung cho prefetch đang bay

function _prefetchKey(text, rate) {
  return `${text}\x1f${rate}`;
}

function _startPrefetch(text, rate) {
  if (!queueStreaming) return;
  const key = _prefetchKey(text, rate);
  if (_prefetchCache.has(key)) return; // đã prefetch hoặc đang prefetch

  const controller = new AbortController();
  _prefetchController = controller;

  const speedParam = `&speed=${encodeURIComponent(rate)}`;
  const url = `${TTS_API_BASE}/tts/stream?text=${encodeURIComponent(text)}${speedParam}`;

  fetch(url, { signal: controller.signal })
    .then((resp) => {
      if (!resp.ok || controller.signal.aborted) return;
      return resp.blob();
    })
    .then((blob) => {
      if (!blob || controller.signal.aborted) return;
      const blobUrl = URL.createObjectURL(blob);
      _prefetchCache.set(key, { blobUrl, controller: null });
    })
    .catch(() => { /* abort hoặc lỗi mạng — im lặng, drainSpeechQueue sẽ fetch lại */ });
}

function _consumePrefetch(text, rate) {
  const key = _prefetchKey(text, rate);
  const entry = _prefetchCache.get(key);
  if (!entry) return null;
  _prefetchCache.delete(key);
  return entry.blobUrl;
}

function _clearPrefetch() {
  // Abort prefetch đang bay
  _prefetchController?.abort();
  _prefetchController = null;
  // Revoke blob URL đã cached
  for (const [, entry] of _prefetchCache) {
    URL.revokeObjectURL(entry.blobUrl);
  }
  _prefetchCache.clear();
}

// Phát audio từ blob URL (đã prefetch), playbackRate=1.0 như playAtNativeRate.
function playBlobUrl(blobUrl, runId, onDone, fallback) {
  const audio = new Audio(blobUrl);
  audio.preload = 'auto';
  audio.volume = 1;
  audio.playbackRate = 1;
  activeAudio = audio;

  let resolved = false;
  const cleanup = () => { URL.revokeObjectURL(blobUrl); };
  audio.onended = () => {
    if (!resolved) { resolved = true; activeAudio = null; cleanup(); if (runId === speechRunId) onDone(true); }
  };
  audio.onerror = () => {
    if (!resolved) { resolved = true; activeAudio = null; cleanup(); if (runId === speechRunId) fallback(); }
  };
  audio.play().catch(() => {
    if (!resolved) { resolved = true; activeAudio = null; cleanup(); if (runId === speechRunId) fallback(); }
  });
}

export function speakQueued(text, rate = 0.9) {
  const clean = normalizeForTts(String(text || '').trim());
  if (!clean) return;
  if (queueSuspended) return;
  unlockSpeech();
  // Lượt phát MỚI: runId của module đã đổi kể từ lần xếp hàng trước (do
  // stopSpeech hoặc một speak() khác) → hàng đợi cũ thuộc lượt đã chết, bỏ đi.
  if (queueRunId !== speechRunId) {
    queueItems = [];
    queuePlaying = false;
    queueRunId = ++speechRunId;
  }
  queueItems.push({ text: clean, rate });
  if (!queuePlaying) drainSpeechQueue();
}

function drainSpeechQueue() {
  const item = queueItems.shift();
  if (!item) { queuePlaying = false; notifyQueueIdle(); return; }
  queuePlaying = true;
  const runId = queueRunId;

  // Prefetch câu KẾ TIẾP trong lúc câu này đang phát. Server cache-hit → trả
  // instant; cache-miss → audio sẵn sàng khi câu này xong, không còn khoảng lặng.
  if (queueItems.length > 0 && queueStreaming) {
    _startPrefetch(queueItems[0].text, queueItems[0].rate);
  }

  // Kiểm tra prefetch cho câu HIỆN TẠI — nếu có blob URL thì phát ngay, bỏ qua
  // network round-trip. Fallback về playEleven nếu blob lỗi (hết hạn, revoke).
  const prefetched = _consumePrefetch(item.text, item.rate);
  if (prefetched) {
    playBlobUrl(prefetched, runId, () => {
      if (runId !== speechRunId) { queueItems = []; queuePlaying = false; return; }
      if (queueSuspended) { queueItems = []; queuePlaying = false; return; }
      drainSpeechQueue();
    }, () => {
      // Blob lỗi → fallback về fetch bình thường
      if (runId !== speechRunId) return;
      playEleven(item.text, item.rate, runId, () => {
        if (runId !== speechRunId) { queueItems = []; queuePlaying = false; return; }
        if (queueSuspended) { queueItems = []; queuePlaying = false; return; }
        drainSpeechQueue();
      }, { streaming: queueStreaming });
    });
    return;
  }

  playEleven(item.text, item.rate, runId, () => {
    // stopSpeech() hoặc một lượt phát khác đã xen vào giữa: dừng, đừng đọc nốt.
    if (runId !== speechRunId) { queueItems = []; queuePlaying = false; return; }
    // Cắt lời giữa lúc câu này đang phát: cờ được bật trong khi ta chờ callback,
    // nên phải kiểm lại ở đây chứ không chỉ ở speakQueued.
    if (queueSuspended) { queueItems = []; queuePlaying = false; return; }
    drainSpeechQueue();
  }, { streaming: queueStreaming });
}

// Thông báo "hàng đợi vừa cạn" cho chế độ gọi, để nó quay lại nghe.
//
// CẢNH BÁO cho caller: hàng đợi cạn KHÔNG có nghĩa lượt trả lời đã xong. Câu 1
// hay phát hết trước khi câu 2 kịp tới từ stream, nên sự kiện này có thể nổ giữa
// lượt. Caller PHẢI tự kiểm rằng stream đã ``done`` trước khi chuyển trạng thái.
let queueIdleCallback = null;

export function onSpeechQueueIdle(fn) {
  queueIdleCallback = typeof fn === 'function' ? fn : null;
}

function notifyQueueIdle() {
  queueIdleCallback?.();
}

export function isSpeechQueueBusy() {
  return queuePlaying || queueItems.length > 0;
}

// Bắt đầu một lượt phát theo hàng đợi: dừng âm đang phát và cấp runId mới.
// Gọi TRƯỚC câu đầu tiên của một lượt trả lời để lượt trước không lẫn vào.
export function beginSpeechQueue() {
  queueItems = [];
  queuePlaying = false;
  queueSuspended = false;  // lượt trả lời mới -> hạ chặn của lần cắt lời trước
  _clearPrefetch();        // bỏ audio đã prefetch của lượt trước
  stopSpeech();            // tăng speechRunId + dừng audio đang phát
  queueRunId = speechRunId;
}

// Cắt lời: dừng ngay và CHẶN mọi câu tới sau của cùng lượt trả lời.
//
// Khác stopSpeech(): stopSpeech chỉ dừng thứ đang phát, còn câu kế tiếp mà stream
// SSE sắp đẩy tới vẫn được speakQueued nhận và phát. Trong chế độ gọi, đó đúng là
// hành vi sai — người học vừa cắt lời thì AI phải im tới hết lượt.
export function interruptSpeech() {
  queueItems = [];
  queuePlaying = false;
  queueSuspended = true;
  _clearPrefetch();  // bỏ audio đã prefetch — người học cắt lời thì không cần nữa
  stopSpeech();
}

export function isSpeechQueueSuspended() {
  return queueSuspended;
}

// Chế độ gọi phát qua /tts/stream (MP3 theo khối) thay vì /tts (trọn file). Đo
// thật: byte đầu về sau ~2.1s so với ~3.0s, tức nhanh hơn ~0.9s mỗi câu. Chỉ đổi
// URL, phần phát vẫn là tryPlayUrl như mọi đường khác.
let queueStreaming = false;

export function setSpeechQueueStreaming(value) {
  queueStreaming = Boolean(value);
}

// Đọc phản hồi tiếng Việt qua fallback TTS (/tts/feedback). Tách khỏi speak():
// speak() đi qua normalizeForTts + native speech zh-CN, không hợp cho câu tiếng Việt.
export function speakFeedback(text, onDone) {
  const clean = String(text || '').trim();
  if (!clean) { onDone?.(false); return; }
  unlockSpeech();
  const runId = ++speechRunId;
  stopActiveAudio();
  if (hasSpeechSupport()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }

  const url = `${TTS_API_BASE}/tts/feedback?text=${encodeURIComponent(clean)}`;
  tryPlayUrl(url, 1, runId, (success) => {
    if (runId !== speechRunId) return;
    onDone?.(success);
  }, () => {
    if (runId !== speechRunId) return;
    onDone?.(false);
  });
}

export function getAudioHint(audioPlaying, audioPlayed, audioError) {
  if (audioError) return 'Khong phat duoc am thanh.';
  if (audioPlaying) return 'Dang phat...';
  if (audioPlayed) return 'Co the nghe lai.';
  return 'Bam Nghe de phat.';
}
