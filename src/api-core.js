import { scopedKey } from './user-scope';

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

// Đánh thức backend Render free-tier ngay khi mở app, để lần bấm AI đầu tiên
// không phải chờ cold start ~30s. Fire-and-forget: nuốt mọi lỗi vì đây chỉ là
// tối ưu, không được chặn hay làm hỏng luồng khởi động UI.
let warmUpPromise = null;
export function warmUpBackend() {
  if (warmUpPromise) return warmUpPromise;
  warmUpPromise = fetch(`${API_BASE}/health`, { method: 'GET' })
    .catch(() => { /* ignore: chỉ là ping đánh thức */ });
  return warmUpPromise;
}

// Lỗi mạng (fetch ném TypeError) hoặc backend free-tier đang "ngủ" (Render) →
// thông báo thân thiện thay vì "Failed to fetch" / "API 502/503" thô.
const COLD_START_MESSAGE = 'Máy chủ đang khởi động lại, vui lòng thử lại sau vài giây.';
const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Render free-tier "ngủ" sau ~15 phút; request đầu tiên phải chờ backend khởi
// động lại (~30s). Thử lại nhiều lần với backoff tăng dần để cầm cự qua cold
// start thay vì báo lỗi mạng ngay. Tổng thời gian chờ ~ 2+4+6+8 = 20s cộng
// thời gian chờ phản hồi mỗi lần, đủ để server dậy.
const RETRY_BACKOFFS_MS = [2000, 4000, 6000, 8000];

async function request(path, options = {}, retry = RETRY_BACKOFFS_MS.length) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const backoff = () => RETRY_BACKOFFS_MS[RETRY_BACKOFFS_MS.length - retry] ?? 8000;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, ...options });
  } catch {
    // fetch chỉ ném khi mất mạng / CORS / server không phản hồi.
    if (retry > 0) {
      await delay(backoff());
      return request(path, options, retry - 1);
    }
    throw new Error(NETWORK_MESSAGE);
  }
  if (!res.ok) {
    // 502/503/504: backend đang khởi động (cold start) → thử lại với backoff.
    if ((res.status === 502 || res.status === 503 || res.status === 504) && retry > 0) {
      await delay(backoff());
      return request(path, options, retry - 1);
    }
    let detail = res.status >= 502 ? COLD_START_MESSAGE : `API ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  // Bảo vệ: nếu VITE_API_BASE trỏ nhầm sang host phục vụ SPA (trả index.html),
  // fetch vẫn 200 nhưng body là HTML. res.json() khi đó ném SyntaxError khó đọc.
  // Chặn sớm bằng một lỗi rõ ràng để tầng gọi (getStats/getAnalytics...) bắt
  // được và degrade sạch về dữ liệu local thay vì làm hỏng UI.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${path} but got "${contentType || 'unknown'}" (API_BASE may be misconfigured)`);
  }
  return res.json();
}

// Danh sách từ vựng HSK từ DB backend (nguồn sự thật). Chỉ trả từ đã có
// meaning_vi. Ném lỗi khi backend không tới được để tầng gọi (vocab-loader)
// degrade sạch về file JS local.
export async function getWords(level) {
  const query = level ? `?level=${encodeURIComponent(level)}` : '';
  return request(`/api/words${query}`);
}

const QUIZ_TYPE_LABELS = {
  vocab: 'Từ vựng',
  listening: 'Nghe',
  dialogue: 'Hội thoại',
  reading: 'Đọc hiểu',
  translation: 'Dịch đoạn',
  cloze: 'Điền từ',
};

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

// LƯU Ý ĐỒNG BỘ: các hàm dựng câu/đoạn dưới đây (richParagraph, dialogueLine,
// listeningLine) là bản offline song song với backend question_generator.py.
// Khi đổi template ở một bên, cập nhật bên còn lại để tránh lệch nội dung.

function richParagraph(card, index = 0) {
  const sentence = card.exampleSentence || `${card.character}。`;
  const vi = card.exampleVi || card.meaning;
  const meaning = card.meaning || 'nghĩa chính';
  const variants = [
    {
      cn: `今天上午，我在学校学习中文。老师先说：“${sentence}” 然后让我们解释“${card.character}”的意思。下课以后，我把这个词、拼音和例句写在本子上，晚上再复习一遍。`,
      vi: `Sáng nay, tôi học tiếng Trung ở trường. Giáo viên nói trước: “${vi}” Sau đó, giáo viên yêu cầu chúng tôi giải thích nghĩa của “${card.character}”. Sau giờ học, tôi ghi từ này, pinyin và câu ví dụ vào vở, buổi tối ôn lại một lần nữa.`,
    },
    {
      cn: `昨天晚上，我和朋友练习口语。我们用“${card.character}”造了一个句子：“${sentence}” 因为这个词和日常生活有关，所以我觉得它很容易记住，也很适合在聊天时使用。`,
      vi: `Tối hôm qua, tôi luyện nói với bạn. Chúng tôi dùng “${card.character}” để đặt một câu: “${vi}” Vì từ này liên quan đến đời sống hằng ngày, nên tôi thấy nó dễ nhớ và cũng phù hợp để dùng khi trò chuyện.`,
    },
    {
      cn: `这周我给自己定了一个小目标：每天记十个汉语词。今天的重点词是“${card.character}”。我先读例句“${sentence}”，再听发音，最后用自己的话说一遍。`,
      vi: `Tuần này tôi đặt cho mình một mục tiêu nhỏ: mỗi ngày ghi nhớ mười từ tiếng Trung. Từ trọng tâm hôm nay là “${card.character}”, nghĩa là “${meaning}”. Tôi đọc câu ví dụ “${vi}” trước, sau đó nghe phát âm, cuối cùng nói lại bằng lời của mình.`,
    },
  ];
  return variants[index % variants.length];
}

function listeningLine(card) {
  return {
    cn: card.exampleSentence || card.character,
    vi: card.exampleVi || card.meaning,
  };
}

function dialogueLine(card, index = 0) {
  const line = listeningLine(card);
  const meaning = card.meaning || 'nghĩa chính';
  const variants = [
    {
      cn: `A：你今天在学习什么？B：我在学习“${card.character}”。老师说：“${line.cn}” A：这个词是什么意思？B：它的意思是“${meaning}”，我晚上还会复习。`,
      vi: `A hỏi hôm nay học gì. B nói đang học “${card.character}”, nghe câu “${line.vi}”, giải thích nghĩa là “${meaning}” và tối sẽ ôn lại.`,
      optionVi: `B học “${card.character}” và sẽ ôn lại.`,
    },
    {
      cn: `A：刚才老师说了哪个句子？B：老师说：“${line.cn}” A：你听懂了吗？B：听懂了，重点词是“${card.character}”，意思是“${meaning}”。`,
      vi: `A hỏi giáo viên vừa nói câu nào. B nhắc lại “${line.vi}”, nói đã nghe hiểu, từ trọng tâm là “${card.character}”, nghĩa là “${meaning}”.`,
      optionVi: `B nghe hiểu câu về “${card.character}”.`,
    },
  ];
  return variants[index % variants.length];
}

// Bài sắp xếp câu (drag_drop) offline — bản song song với backend
// _drag_drop_for_word. Tách câu ví dụ NGẮN quanh từ mục tiêu thành các token
// THẬT (không cắt 2 ký tự tuỳ tiện), đảm bảo ≥2 token khác nhau và thứ tự xáo
// trộn khác thứ tự đúng. Trả null nếu câu không đủ điều kiện để bỏ qua từ đó.
function localDragDrop(card) {
  const sentence = cleanText(card.exampleSentence || card.example_cn);
  const target = cleanText(card.character);
  if (!sentence || !target || !sentence.includes(target)) return null;

  // Tách quanh từ mục tiêu, giữ chính từ mục tiêu làm một token.
  const parts = sentence.split(target);
  const segments = [];
  parts.forEach((part, i) => {
    if (i > 0) segments.push(target);
    part = part.trim();
    if (!part) return;
    // Tách tiếp theo dấu câu; phần còn lại dài thì chia khối ≤2 ký tự.
    part.split(/([，。！？、：])/).filter(Boolean).forEach(sub => {
      if (sub.length <= 2 || /[，。！？、：]/.test(sub)) {
        segments.push(sub);
      } else {
        for (let i = 0; i < sub.length; i += 2) segments.push(sub.slice(i, i + 2));
      }
    });
  });

  const correctOrder = segments.filter(Boolean);
  if (new Set(correctOrder).size < 2) return null;

  let scrambled = [...correctOrder];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    scrambled = shuffle(correctOrder);
    if (scrambled.join('') !== correctOrder.join('')) break;
  }

  return {
    sentence_cn: sentence,
    sentence_vi: cleanText(card.exampleVi || card.example_vi || card.meaning),
    segments: scrambled,
    correct_order: correctOrder,
  };
}

async function localQuestions({ level, quiz_type, limit }) {
  const { loadAllFlashcards } = await import('./vocab-loader');
  const allCards = await loadAllFlashcards();
  const cards = allCards.filter(card => card.hskLevel === Number(level));
  const pool = cards.length >= 4 ? cards : allCards.slice(0, 80);
  const typeSeed = [...String(quiz_type)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100;
  return shuffle(pool).slice(0, limit).map((card, index) => {
    const distractors = shuffle(pool.filter(item => item.id !== card.id)).slice(0, 3);
    const paragraph = richParagraph(card, index);
    const dragData = quiz_type === 'drag_drop' ? localDragDrop(card) : null;
    const byType = quiz_type === 'vocab'
      ? [card.meaning, ...distractors.map(item => item.meaning)]
      : quiz_type === 'listening'
        ? [listeningLine(card).vi, ...distractors.map(item => listeningLine(item).vi)]
        : quiz_type === 'dialogue'
          ? [dialogueLine(card, index).optionVi, ...distractors.map((item, itemIndex) => dialogueLine(item, itemIndex).optionVi)]
        : quiz_type === 'translation'
          ? [paragraph.vi, ...distractors.map((item, itemIndex) => richParagraph(item, itemIndex).vi)]
          : quiz_type === 'cloze'
            ? [card.character, ...distractors.map(item => item.character)]
          : quiz_type === 'drag_drop'
            ? [card.character, ...distractors.map(item => item.character)]
          : [card.character, ...distractors.map(item => item.character)];
    const correctValue = byType[0];
    const options = shuffle([...new Set(byType)]).slice(0, 4);
    return {
      id: Number(`${level}${typeSeed}${index + 1}${Date.now().toString().slice(-4)}`),
      level: Number(level),
      local: true,
      offline: true,
      quiz_type,
      prompt: quiz_type === 'vocab'
        ? `Chọn nghĩa đúng của: ${card.character}`
        : quiz_type === 'listening'
          ? 'Nghe câu và chọn nghĩa tiếng Việt đúng'
          : quiz_type === 'dialogue'
            ? 'Nghe đoạn hội thoại và chọn ý đúng'
          : quiz_type === 'translation'
            ? `Dịch đoạn nói sau sang tiếng Việt: ${paragraph.cn}`
            : quiz_type === 'cloze'
              ? `Chọn từ còn thiếu để hoàn chỉnh câu: ${paragraph.cn.replace(card.character, '____')}`
            : quiz_type === 'drag_drop'
              ? 'Sắp xếp các từ sau thành câu đúng'
            : `Đọc nghĩa và chọn từ phù hợp: ${card.meaning}`,
      options,
      audio_text: quiz_type === 'listening' || quiz_type === 'dialogue'
        ? listeningLine(card).cn
        : quiz_type === 'translation'
            ? paragraph.cn
            : '',
      explanation: quiz_type === 'translation'
        ? `${paragraph.cn} · ${paragraph.vi}`
        : quiz_type === 'dialogue'
          ? `${dialogueLine(card, index).cn} · ${dialogueLine(card, index).vi}`
          : quiz_type === 'listening'
            ? `${listeningLine(card).cn} · ${listeningLine(card).vi}`
            : `${card.character} · ${card.pinyin} · ${card.meaning}`,
      correct_index: Math.max(0, options.indexOf(correctValue)),
      word: {
        word_id: card.id,
        hanzi: card.character,
        pinyin: card.pinyin,
        meaning_vi: card.meaning,
        component_hint: card.mnemonic || '',
        confusable_words: [],
      },
      metadata_json: dragData ? {
        segments: dragData.segments,
        correct_order: dragData.correct_order,
        sentence_vi: dragData.sentence_vi,
      } : {},
    };
  }).filter(q => q.quiz_type === 'drag_drop' ? Boolean(q.metadata_json?.correct_order?.length) : q.options.length === 4);
}

export async function startQuiz(payload) {
  try {
    const data = await request('/api/quiz', { method: 'POST', body: JSON.stringify(payload) });
    if (Array.isArray(data.questions) && data.questions.length) return data;
    const questions = await localQuestions(payload);
    return { questions, offline: true, empty_remote: true };
  } catch {
    const questions = await localQuestions(payload);
    return { questions, offline: true };
  }
}

// Dựng đề quiz thuần local (không gọi mạng). Dùng cho luồng quiz để khâu "chuẩn
// bị" tức thì, không phải chờ backend cold-start rồi mới rơi về local.
export async function localQuiz(payload) {
  const questions = await localQuestions(payload);
  return { questions, offline: true };
}

export async function getTodaySession({ userId = 'local-user', focusLevel = 1, mode = 'standard', learningMode = 'hsk', topics = [] } = {}) {
  const params = new URLSearchParams({
    user_id: userId,
    focus_level: String(focusLevel),
    mode,
    learning_mode: learningMode,
  });
  (Array.isArray(topics) ? topics : []).forEach(topic => { if (topic) params.append('topics', topic); });
  return request(`/api/session/today?${params.toString()}`);
}

export function localLearningSession(payload = {}) {
  return {
    id: Number(`9${Date.now().toString().slice(-8)}`),
    user_id: payload.user_id || 'local-user',
    session_type: payload.session_type || 'standard',
    behavior_state: payload.behavior_state || 'maintenance',
    estimated_minutes: payload.estimated_minutes || 20,
    reason: payload.reason || '',
    offline: true,
  };
}

export async function startLearningSession(payload) {
  try {
    return await request('/api/session/start', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    return localLearningSession(payload);
  }
}

function localLearningEvent(payload, question = null) {
  const correctIndex = question?.correct_index ?? 0;
  const correct = payload.selected_index === correctIndex;
  return {
    event_id: null,
    question_id: payload.question_id,
    correct,
    correct_index: correctIndex,
    explanation: question?.explanation || '',
    error_tag: correct ? '' : payload.error_tag || (question?.quiz_type === 'listening' || question?.quiz_type === 'dialogue' ? 'sound_error' : 'meaning_error'),
    next_review_at: new Date(Date.now() + (correct ? 24 : 1) * 60 * 60 * 1000).toISOString(),
    offline: true,
  };
}

export async function recordLearningEvent(payload, question = null) {
  if (question?.local || question?.offline) return localLearningEvent(payload, question);
  try {
    return await request('/api/session/event', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    return localLearningEvent(payload, question);
  }
}

export async function completeLearningSession(payload) {
  try {
    return await request('/api/session/complete', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    return {
      id: payload.session_id,
      completed_at: new Date().toISOString(),
      offline: true,
    };
  }
}

const CHINESE_CHAR_PATTERN = /[\u3400-\u9fff]/g;
const SENTENCE_PUNCTUATION_PATTERN = /[。！？!?]/;

function localOutputAssessment(responseText, targetWord) {
  const text = String(responseText || '').replace(/\s+/g, ' ').trim();
  const target = String(targetWord || '').trim();
  const chineseCount = text.match(CHINESE_CHAR_PATTERN)?.length || 0;
  const usedTarget = Boolean(target && text.includes(target));
  const chineseOnly = text.replace(/[\s“”"'，,。！？!?]/g, '');
  const onlyTarget = Boolean(target && chineseOnly === target);
  const enoughContext = chineseCount >= Math.max(4, target.length + 2);
  const sentenceShape = SENTENCE_PUNCTUATION_PATTERN.test(text) || chineseCount >= Math.max(6, target.length + 4);
  const score = Math.min(100,
    (usedTarget ? 45 : 0)
    + (chineseCount ? 15 : 0)
    + (enoughContext ? 22 : 0)
    + (sentenceShape ? 10 : 0)
    + (!/[A-Za-zÀ-ỹ]/.test(text) || chineseCount >= 4 ? 8 : 0)
  );
  let feedback;
  if (!text) feedback = 'Nhập một câu tiếng Trung có từ mục tiêu.';
  else if (!chineseCount) feedback = 'Câu cần viết bằng chữ Hán, không phải pinyin hoặc tiếng Việt.';
  else if (!usedTarget) feedback = `Câu chưa dùng từ mục tiêu ${target}.`;
  else if (onlyTarget || !enoughContext) feedback = `Mới có ${target}, chưa thành câu có ngữ cảnh.`;
  else if (!sentenceShape) feedback = 'Câu còn cụt, hãy thêm kết thúc câu hoặc ngữ cảnh rõ hơn.';
  else feedback = `Đã dùng ${target} trong câu tiếng Trung có ngữ cảnh.`;
  return {
    correct: usedTarget && chineseCount > 0 && enoughContext && sentenceShape && !onlyTarget,
    score,
    usedTarget,
    feedback,
  };
}

export async function submitOutputEvent(payload) {
  try {
    return await request('/api/session/output', { method: 'POST', body: JSON.stringify(payload) });
  } catch {
    const target = payload.target_word || '';
    const assessment = localOutputAssessment(payload.response_text, target);
    return {
      event_id: null,
      correct: assessment.correct,
      score: assessment.score,
      target_word: target,
      used_target: assessment.usedTarget,
      production_score: assessment.score,
      feedback: assessment.feedback,
      next_practice_at: assessment.correct ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      offline: true,
    };
  }
}

export async function submitQuiz(payload, questions = []) {
  const hasLocalQuestions = questions.some(question => question?.local || question?.offline);
  try {
    if (hasLocalQuestions) throw new Error('Local quiz questions');
    const submitted = await request('/api/quiz/submit', { method: 'POST', body: JSON.stringify(payload) });
    if (!questions.length || (submitted.total || 0) >= payload.answers.length) return submitted;
    throw new Error('Remote submit missed local questions');
  } catch {
    const byId = new Map(questions.map(q => [q.id, q]));
    const results = payload.answers.map(answer => {
      const q = byId.get(answer.question_id);
      const correct = q ? answer.selected_index === q.correct_index : false;
      return {
        question_id: answer.question_id,
        correct,
        correct_index: q?.correct_index ?? 0,
        explanation: q?.explanation || '',
      };
    });
    const score = results.filter(r => r.correct).length;
    const stats = readLocalStats();
    const next = {
      attempts: stats.attempts + 1,
      answered: stats.answered + results.length,
      correct: stats.correct + score,
    };
    const answerDetails = payload.answers.map(answer => {
      const q = byId.get(answer.question_id);
      return {
        question_id: answer.question_id,
        selected_index: answer.selected_index,
        latency_ms: answer.latency_ms ?? null,
        confidence: answer.confidence ?? null,
        error_tag: answer.error_tag ?? null,
        correct: q ? answer.selected_index === q.correct_index : false,
        prompt: q?.prompt || '',
        word: q?.word || null,
      };
    });
    localStorage.setItem(scopedKey('coreStats'), JSON.stringify(next));
    writeLocalHistory({
      id: Date.now(),
      created_at: new Date().toISOString(),
      level: payload.level,
      quiz_type: payload.quiz_type,
      score,
      total: results.length,
      answers: answerDetails,
    });
    return { score, total: results.length, results, offline: true };
  }
}

function readLocalStats() {
  try { return JSON.parse(localStorage.getItem(scopedKey('coreStats'))) || { attempts: 0, answered: 0, correct: 0 }; }
  catch { return { attempts: 0, answered: 0, correct: 0 }; }
}

function readLocalHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(scopedKey('coreHistory')));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(attempt) {
  const history = readLocalHistory();
  const next = [...history, attempt].slice(-80);
  localStorage.setItem(scopedKey('coreHistory'), JSON.stringify(next));
}

function pct(correct, total) {
  return total ? Math.round((correct / total) * 100) : 0;
}

function buildTypeBreakdown(history) {
  const rows = Object.entries(QUIZ_TYPE_LABELS).map(([quizType, label]) => ({
    quiz_type: quizType,
    label,
    attempts: 0,
    answered: 0,
    correct: 0,
    accuracy: 0,
  }));
  const byType = new Map(rows.map(row => [row.quiz_type, row]));
  history.forEach(attempt => {
    const row = byType.get(attempt.quiz_type);
    if (!row) return;
    row.attempts += 1;
    row.answered += attempt.total || 0;
    row.correct += attempt.score || 0;
  });
  rows.forEach(row => { row.accuracy = pct(row.correct, row.answered); });
  return rows;
}

function buildLevelBreakdown(history) {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    level: index + 1,
    attempts: 0,
    answered: 0,
    correct: 0,
    accuracy: 0,
  }));
  history.forEach(attempt => {
    const row = rows[Number(attempt.level) - 1];
    if (!row) return;
    row.attempts += 1;
    row.answered += attempt.total || 0;
    row.correct += attempt.score || 0;
  });
  rows.forEach(row => { row.accuracy = pct(row.correct, row.answered); });
  return rows;
}

function buildWeakWords(history) {
  const words = new Map();
  history.flatMap(attempt => attempt.answers || []).forEach(answer => {
    if (!answer.word?.hanzi) return;
    const key = `${answer.word.level || 1}-${answer.word.hanzi}`;
    const row = words.get(key) || {
      level: answer.word.level || 1,
      hanzi: answer.word.hanzi,
      pinyin: answer.word.pinyin || '',
      meaning_vi: answer.word.meaning_vi || '',
      seen: 0,
      wrong: 0,
      correct: 0,
      accuracy: 0,
      mastery: 0,
    };
    row.seen += 1;
    row.correct += answer.correct ? 1 : 0;
    row.wrong += answer.correct ? 0 : 1;
    words.set(key, row);
  });
  return [...words.values()]
    .map(row => ({ ...row, accuracy: pct(row.correct, row.seen), mastery: Math.max(0, Math.min(100, row.correct * 14 - row.wrong * 18)) }))
    .sort((a, b) => a.accuracy - b.accuracy || a.mastery - b.mastery || b.wrong - a.wrong || b.seen - a.seen)
    .slice(0, 6);
}

function buildLocalAnalytics() {
  const stats = readLocalStats();
  const history = readLocalHistory();
  const typeBreakdown = buildTypeBreakdown(history);
  const levelBreakdown = buildLevelBreakdown(history);
  const weakWordList = buildWeakWords(history);
  const answered = stats.answered || history.reduce((sum, attempt) => sum + (attempt.total || 0), 0);
  const correct = stats.correct || history.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const accuracy = pct(correct, answered);
  const practicedTypes = typeBreakdown.filter(item => item.answered > 0);
  const practicedLevels = levelBreakdown.filter(item => item.answered > 0);
  const weakestType = practicedTypes.sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)[0];
  const weakestLevel = practicedLevels.sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)[0];
  const recommendedLevel = weakWordList[0]?.level || weakestLevel?.level || 1;
  const recommendedType = weakestType?.accuracy < 72 ? weakestType.quiz_type : 'vocab';
  const weakCount = weakWordList.filter(item => item.accuracy < 60).length;
  const recommendedStrategy = weakCount ? 'repair' : practicedTypes.length >= 2 && accuracy >= 70 ? 'interleaved' : 'targeted';
  const eventCount = history.reduce((sum, attempt) => sum + (attempt.total || 0), 0);
  const confidenceValues = history.flatMap(attempt => attempt.answers || []).map(answer => answer.confidence).filter(Boolean);
  const latencyValues = history.flatMap(attempt => attempt.answers || []).map(answer => answer.latency_ms).filter(value => value !== null && value !== undefined);
  const confidenceAvg = confidenceValues.length ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2)) : 0;
  const latencyAvgMs = latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : 0;
  const focusWords = weakWordList.slice(0, 4).map(item => item.hanzi);
  const reason = focusWords.length
    ? `Gợi ý: Bạn đang gặp rắc rối với bộ tứ (${focusWords.join(', ')}). Làm một bài quiz ngắn để dứt điểm nhé!`
    : weakestType
      ? `Dạng ${weakestType.label} đang thấp hơn các phần còn lại.`
      : 'Chưa đủ dữ liệu, nên bắt đầu bằng từ vựng HSK 1 để tạo đường chuẩn.';

  return {
    attempts: stats.attempts || history.length,
    answered,
    accuracy,
    mastery_label: accuracy >= 80 ? 'Bền vững' : accuracy >= 55 ? 'Ổn định' : answered ? 'Đang xây' : 'Khởi động',
    weak_words: weakCount,
    memory_stability: accuracy,
    listening_readiness: typeBreakdown.find(item => item.quiz_type === 'listening')?.accuracy || 0,
    context_transfer: Math.round(((typeBreakdown.find(item => item.quiz_type === 'reading')?.accuracy || 0) + (typeBreakdown.find(item => item.quiz_type === 'cloze')?.accuracy || 0) + (typeBreakdown.find(item => item.quiz_type === 'translation')?.accuracy || 0)) / 3),
    production_readiness: readLocalProductionReadiness(),
    event_count: eventCount,
    due_count: weakCount,
    confidence_avg: confidenceAvg,
    latency_avg_ms: latencyAvgMs,
    type_breakdown: typeBreakdown,
    level_breakdown: levelBreakdown,
    recent_trend: history.slice(-8).map((attempt, index, rows) => ({
      label: `P${history.length - rows.length + index + 1}`,
      level: attempt.level,
      quiz_type: attempt.quiz_type,
      score: attempt.score,
      total: attempt.total,
      accuracy: pct(attempt.score, attempt.total),
    })),
    weak_word_list: weakWordList,
    recommendation: {
      level: recommendedLevel,
      quiz_type: recommendedType,
      title: `HSK ${recommendedLevel} · ${QUIZ_TYPE_LABELS[recommendedType] || 'Từ vựng'}`,
      reason,
      target_accuracy: 80,
      focus_words: focusWords,
      recommended_strategy: recommendedStrategy,
    },
    offline: true,
  };
}

function readLocalProductionReadiness() {
  try {
    const summaries = JSON.parse(localStorage.getItem(scopedKey('learningSessionSummaries'))) || [];
    const outputs = summaries.flatMap(session => session.answers || []).filter(answer => answer.item_type === 'guided_output');
    if (!outputs.length) return 0;
    return Math.round((outputs.filter(answer => answer.correct).length / outputs.length) * 100);
  } catch {
    return 0;
  }
}

function localStatsOut(extra = {}) {
  const stats = readLocalStats();
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  return {
    attempts: stats.attempts,
    answered: stats.answered,
    accuracy,
    mastery_label: accuracy >= 80 ? 'Bền vững' : accuracy >= 55 ? 'Ổn định' : stats.answered ? 'Đang xây' : 'Khởi động',
    weak_words: accuracy && accuracy < 60 ? 1 : 0,
    offline: true,
    ...extra,
  };
}

export async function getStats(userId = 'local-user') {
  try {
    const remote = await request(`/api/stats?user_id=${encodeURIComponent(userId)}`);
    const local = localStatsOut({ backend_empty: true });
    if ((!remote.answered || remote.answered < local.answered) && local.answered) return local;
    return remote;
  } catch {
    return localStatsOut();
  }
}

export async function getAnalytics(userId = 'local-user') {
  const local = buildLocalAnalytics();
  try {
    const remote = await request(`/api/analytics?user_id=${encodeURIComponent(userId)}`);
    if ((!remote.answered || remote.answered < local.answered) && local.answered) {
      return { ...local, backend_empty: true };
    }
    return remote;
  } catch {
    return local;
  }
}

export async function registerUser(payload) {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function loginUser(payload) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getMe() {
  return request('/api/auth/me');
}

export async function updateProfile(payload) {
  return request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function getLeaderboard(period = 'all_time') {
  return request(`/api/leaderboard?period=${encodeURIComponent(period)}&limit=50`);
}

function toLocalDate(iso) {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function computeLocalStreaks(dateKeys) {
  const activeDates = new Set(dateKeys.filter(Boolean));
  const studyDays = activeDates.size;
  if (!studyDays) {
    return { study_days: 0, current_streak: 0, longest_streak: 0, studied_today: false };
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const studiedToday = activeDates.has(today);

  let current = 0;
  const anchor = studiedToday ? today : (activeDates.has(yesterday) ? yesterday : null);
  if (anchor) {
    let cursor = new Date(`${anchor}T00:00:00Z`);
    while (activeDates.has(cursor.toISOString().slice(0, 10))) {
      current += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    }
  }

  const sorted = [...activeDates].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = new Date(`${sorted[index - 1]}T00:00:00Z`);
    const currentDate = new Date(`${sorted[index]}T00:00:00Z`);
    if ((currentDate.getTime() - prev.getTime()) / 86400000 === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  return {
    study_days: studyDays,
    current_streak: current,
    longest_streak: longest,
    studied_today: studiedToday,
  };
}

function buildLocalTitles(metrics) {
  const checks = {
    first_quiz: metrics.quiz_count >= 1,
    quiz_10: metrics.quiz_count >= 10,
    streak_3: metrics.longest_streak >= 3,
    streak_7: metrics.longest_streak >= 7,
    streak_30: metrics.longest_streak >= 30,
    days_7: metrics.study_days >= 7,
    days_30: metrics.study_days >= 30,
    mastery_10: metrics.mastery_count >= 10,
    mastery_50: metrics.mastery_count >= 50,
    session_5: metrics.session_count >= 5,
    points_500: metrics.points >= 500,
    points_2000: metrics.points >= 2000,
  };
  const defs = [
    { id: 'first_quiz', label: 'Bước đầu', description: 'Hoàn thành 1 bài luyện' },
    { id: 'quiz_10', label: 'Cần cù', description: 'Hoàn thành 10 bài luyện' },
    { id: 'streak_3', label: 'Ba ngày liên tiếp', description: 'Học liên tục 3 ngày' },
    { id: 'streak_7', label: 'Tuần vàng', description: 'Học liên tục 7 ngày' },
    { id: 'streak_30', label: 'Tháng sắt', description: 'Học liên tục 30 ngày' },
    { id: 'days_7', label: 'Khám phá', description: 'Học trong 7 ngày khác nhau' },
    { id: 'days_30', label: 'Người ham học', description: 'Học trong 30 ngày khác nhau' },
    { id: 'mastery_10', label: 'Từ vựng tinh', description: 'Thuộc 10 từ (mastery ≥ 80)' },
    { id: 'mastery_50', label: 'Từ điển sống', description: 'Thuộc 50 từ (mastery ≥ 80)' },
    { id: 'session_5', label: 'Phiên học đều', description: 'Hoàn thành 5 phiên học' },
    { id: 'points_500', label: '500 điểm', description: 'Đạt 500 điểm xếp hạng' },
    { id: 'points_2000', label: 'Cao thủ', description: 'Đạt 2000 điểm xếp hạng' },
  ];
  return defs.map(item => ({ ...item, earned: Boolean(checks[item.id]) }));
}

function buildLocalProfileStats() {
  const history = readLocalHistory();
  const stats = readLocalStats();
  const dateKeys = history.map(item => toLocalDate(item.created_at)).filter(Boolean);
  try {
    const summaries = JSON.parse(localStorage.getItem(scopedKey('learningSessionSummaries'))) || [];
    summaries.forEach(item => {
      const key = toLocalDate(item.completed_at || item.started_at);
      if (key) dateKeys.push(key);
    });
  } catch { /* ignore */ }

  const streaks = computeLocalStreaks(dateKeys);
  const answered = stats.answered || history.reduce((sum, item) => sum + (item.total || 0), 0);
  const correct = stats.correct || history.reduce((sum, item) => sum + (item.score || 0), 0);
  const metrics = {
    ...streaks,
    quiz_count: stats.attempts || history.length,
    session_count: 0,
    mastery_count: 0,
    points: (stats.correct || 0) * 10,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
  };
  try {
    const summaries = JSON.parse(localStorage.getItem(scopedKey('learningSessionSummaries'))) || [];
    metrics.session_count = summaries.filter(item => item.completed_at).length;
  } catch { /* ignore */ }
  const titles = buildLocalTitles(metrics);
  return {
    ...metrics,
    earned_titles: titles.filter(item => item.earned).length,
    titles,
    offline: true,
  };
}

export async function getUserProfile() {
  try {
    return await request('/api/auth/profile');
  } catch {
    return {
      user: null,
      stats: buildLocalProfileStats(),
      offline: true,
    };
  }
}

// --- Speech features: pronunciation scoring (Feature 1) ---

// Lấy một từ ngắn để luyện phát âm, kèm pinyin chuẩn từ DB.
export async function getPracticeSentence(level = 1) {
  return request(`/api/speech/practice-sentence?level=${encodeURIComponent(level)}`);
}

// Chấm điểm phát âm: gửi audio (base64) + câu mục tiêu, nhận điểm + lỗi + tip.
export async function scorePronunciation(payload) {
  return request('/api/speech/pronunciation', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Speech features: turn-based voice chat (Feature 2) ---

// Gửi audio (base64) + lịch sử hội thoại, nhận lời người dùng + câu trả lời CN/VI.
export async function voiceChat(payload) {
  return request('/api/speech/chat', { method: 'POST', body: JSON.stringify(payload) });
}

export async function generateCustomVocabExercises(payload) {
  return request('/api/custom-vocab/generate', { method: 'POST', body: JSON.stringify(payload) });
}

export async function generateQuestionsFromText(payload) {
  return request('/api/custom-vocab/generate-from-text', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Hub đa nguồn: Tạo bản nháp (preview, chưa lưu) -> Lưu vào thư viện ---

// Sinh bài tập từ danh sách từ vựng để xem trước. payload: { words: string[] }
export async function draftQuizFromVocab(payload) {
  return request('/api/custom-vocab/draft/vocab', { method: 'POST', body: JSON.stringify(payload) });
}

// Sinh câu hỏi từ đoạn văn để xem trước.
// payload: { text, hsk_level, count, question_types }
export async function draftQuizFromPassage(payload) {
  return request('/api/custom-vocab/draft/passage', { method: 'POST', body: JSON.stringify(payload) });
}

// Sinh câu hỏi từ chủ đề (AI tự sinh đoạn văn theo chủ đề rồi ra câu hỏi).
// payload: { topic, hsk_level, count, question_types }
export async function draftQuizFromTopic(payload) {
  return request('/api/custom-vocab/draft/topic', { method: 'POST', body: JSON.stringify(payload) });
}

// Lưu bộ câu hỏi đã xem trước vào thư viện (DB) + tạo session để học lại.
// payload: { quiz_title, source, session_type, questions }
export async function saveQuizToLibrary(payload) {
  return request('/api/custom-vocab/save', { method: 'POST', body: JSON.stringify(payload) });
}

