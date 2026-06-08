import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BarChart3, BellOff, BookOpen, CalendarCheck, CheckCircle2, Clock3, Eraser, GraduationCap, Headphones, Languages, LineChart, Loader2, MessagesSquare, Moon, PenTool, Play, RotateCcw, Search, Send, ScrollText, ShieldCheck, Sun, Trophy, Wrench, XCircle } from 'lucide-react';
import { completeLearningSession, getAnalytics, getStats, getTodaySession, recordLearningEvent, startLearningSession, startQuiz, submitOutputEvent, submitQuiz } from './api-core';
import { markLearningSessionCompleted } from './behavior-engine';
import { assessPinyinInput, buildChineseLearningItems } from './chinese-learning-items';
import { buildTodaySessionPlan, markLearningSessionStarted, SESSION_MODES } from './learning-session-planner';
import { strategyFlags } from './strategy-flags';

const USER_ID = 'local-user';
const THEME_PALETTE_VERSION = 'modern-zen-v1';
const LEVELS = [1, 2, 3, 4, 5, 6];
const QUIZ_TYPES = [
  { id: 'vocab', label: 'Từ vựng', icon: BookOpen },
  { id: 'listening', label: 'Nghe', icon: Headphones },
  { id: 'dialogue', label: 'Hội thoại', icon: MessagesSquare },
  { id: 'reading', label: 'Đọc hiểu', icon: ScrollText },
  { id: 'translation', label: 'Dịch đoạn', icon: Languages },
  { id: 'cloze', label: 'Điền từ', icon: ScrollText },
];
const FOCUS_LEVELS = [1, 2, 3, 4];
const GENERAL_CHECK_TYPES = QUIZ_TYPES.map(type => type.id);
const GENERAL_CHECK_LIMIT = 2;
const EMPTY_WORDS = [];

function quizTypeDescription(typeId) {
  if (typeId === 'vocab') return 'Nghĩa và chữ';
  if (typeId === 'listening') return 'Nghe câu chọn nghĩa';
  if (typeId === 'dialogue') return 'Nghe đoạn A/B';
  if (typeId === 'translation') return 'Dịch đoạn nói';
  if (typeId === 'cloze') return 'Chọn từ còn thiếu';
  return 'Câu và ngữ cảnh';
}

const NAV = [
  { id: 'dashboard', label: 'Trang chính', icon: BarChart3 },
  { id: 'lessons', label: 'Bài học', icon: GraduationCap },
  { id: 'quiz', label: 'Quiz', icon: Play },
  { id: 'vocab', label: 'Từ vựng', icon: Search },
  { id: 'apply', label: 'Luyện dùng', icon: Languages },
  { id: 'plan', label: 'Kế hoạch', icon: CalendarCheck },
  { id: 'progress', label: 'Tiến độ', icon: LineChart },
];

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  if (window.localStorage.getItem('themePaletteVersion') !== THEME_PALETTE_VERSION) return 'light';
  const savedTheme = window.localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return 'light';
}
function getInitialFocusLevel() {
  if (typeof window === 'undefined') return 1;
  const savedLevel = Number(window.localStorage.getItem('hskFocusLevel'));
  return FOCUS_LEVELS.includes(savedLevel) ? savedLevel : 1;
}

function getInitialGeneralCheckState() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('hskGeneralCheckState') || '';
}

let speechRunId = 0;
let speechVoicesReadyPromise = null;

function hasSpeechSupport() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function stopSpeech() {
  speechRunId += 1;
  if (hasSpeechSupport()) window.speechSynthesis.cancel();
}

function getSpeechVoices() {
  if (!hasSpeechSupport()) return [];
  return window.speechSynthesis.getVoices() || [];
}

function loadSpeechVoices(timeout = 900) {
  if (!hasSpeechSupport()) return Promise.resolve([]);
  const current = getSpeechVoices();
  if (current.length) return Promise.resolve(current);
  if (speechVoicesReadyPromise) return speechVoicesReadyPromise;
  speechVoicesReadyPromise = new Promise(resolve => {
    const synth = window.speechSynthesis;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(getSpeechVoices());
    };
    const timer = window.setTimeout(finish, timeout);
    const onVoices = () => {
      window.clearTimeout(timer);
      finish();
    };
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', onVoices, { once: true });
    } else {
      synth.onvoiceschanged = onVoices;
    }
  }).finally(() => {
    speechVoicesReadyPromise = null;
  });
  return speechVoicesReadyPromise;
}

function scoreMandarinVoice(voice) {
  const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
  let score = 0;
  if (/zh-cn|cmn-hans|zh_hans/i.test(voice.lang)) score += 8;
  else if (/^zh/i.test(voice.lang)) score += 5;
  if (/xiaoxiao|xiaoyi|huihui|yunxi|yunyang|tingting|meijia|google|microsoft|natural|premium|mandarin|普通话/i.test(name)) score += 5;
  if (voice.localService) score += 1;
  if (/compact|eloquence|novelty/i.test(name)) score -= 3;
  return score;
}

function pickMandarinVoice(voices = getSpeechVoices()) {
  return [...voices]
    .filter(voice => /^zh/i.test(voice.lang) || /mandarin|普通话|xiaoxiao|huihui|yunxi|google/i.test(`${voice.name} ${voice.voiceURI}`))
    .sort((a, b) => scoreMandarinVoice(b) - scoreMandarinVoice(a))[0] || null;
}

function getVoiceStatus() {
  if (!hasSpeechSupport()) return { supported: false, ready: false, label: 'Không hỗ trợ voice', quality: 'none' };
  const voices = getSpeechVoices();
  const voice = pickMandarinVoice(voices);
  if (!voices.length) return { supported: true, ready: false, label: 'Đang nạp voice', quality: 'loading' };
  if (!voice) return { supported: true, ready: true, label: 'Voice mặc định', quality: 'fallback' };
  const score = scoreMandarinVoice(voice);
  return {
    supported: true,
    ready: true,
    label: `${voice.name} · ${voice.lang}`,
    quality: score >= 10 ? 'natural' : 'standard',
  };
}

function useVoiceStatus() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!hasSpeechSupport()) return undefined;
    let alive = true;
    const refresh = () => {
      if (alive) setVersion(value => value + 1);
    };
    loadSpeechVoices().then(refresh);
    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
    return () => {
      alive = false;
      if (typeof synth.removeEventListener === 'function') synth.removeEventListener('voiceschanged', refresh);
    };
  }, []);
  return getVoiceStatus();
}

function VoiceMeta() {
  const status = useVoiceStatus();
  return <small className={`voice-meta voice-meta--${status.quality}`}>{status.label}</small>;
}

function splitSpeechText(text, mode = 'sentence') {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/([。！？!?])/g, '$1|')
    .trim();
  if (!clean) return [];
  if (mode === 'dialogue' || /[AB]：/.test(clean)) {
    return clean
      .replace(/\|/g, '')
      .split(/(?=[AB]：)/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (mode === 'chunk') {
    return clean
      .replace(/[，,、；;：:]/g, '$&|')
      .split('|')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return clean.split('|').map(item => item.trim()).filter(Boolean);
}

function speak(text, rate = 0.82, onDone, mode = 'sentence') {
  if (!text || !hasSpeechSupport()) {
    onDone?.();
    return;
  }
  const runId = ++speechRunId;
  const startSpeech = (voices = []) => {
    if (runId !== speechRunId) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume?.();
    const voice = pickMandarinVoice(voices);
    const segments = splitSpeechText(text, mode);
    const pause = mode === 'dialogue' ? 460 : mode === 'chunk' ? 620 : 190;
    if (!segments.length) {
      onDone?.();
      return;
    }

    const speakNext = (segmentIndex = 0) => {
      if (runId !== speechRunId) return;
      const segment = segments[segmentIndex];
      if (!segment) {
        onDone?.();
        return;
      }
      const utter = new SpeechSynthesisUtterance(segment);
      utter.lang = voice?.lang || 'zh-CN';
      utter.voice = voice;
      utter.rate = Math.max(0.45, Math.min(1.05, rate));
      utter.pitch = 1.02;
      utter.volume = 1;
      utter.onend = () => window.setTimeout(() => speakNext(segmentIndex + 1), pause);
      utter.onerror = () => onDone?.();
      synth.speak(utter);
    };

    speakNext();
  };

  const voices = getSpeechVoices();
  if (voices.length) startSpeech(voices);
  else loadSpeechVoices().then(startSpeech);
}
function StatCard({ icon: Icon, label, value, tone = 'jade' }) {
  return (
    <article className={`core-card core-stat core-stat--${tone}`}>
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function planTitleForState(state, mode) {
  if (state === 'returning') return 'Khởi động lại';
  if (state === 'fragile') return 'Củng cố nhẹ';
  if (state === 'overloaded') return 'Giảm tải hôm nay';
  if (mode?.id === 'micro') return 'Giữ nhịp hôm nay';
  if (mode?.id === 'deep') return 'Phiên học sâu';
  return 'Học hôm nay';
}

function normalizeBackendTodayPlan(serverPlan, fallbackPlan) {
  if (!serverPlan) return fallbackPlan;
  const mode = SESSION_MODES.find(item => item.id === serverPlan.session_type) || fallbackPlan.mode;
  const quizType = serverPlan.quiz_type || fallbackPlan.quizType || 'vocab';
  const level = Number(serverPlan.level || fallbackPlan.level || 1);
  const behaviorMetrics = serverPlan.behavior_metrics ? {
    ewmaAccuracy: serverPlan.behavior_metrics.ewma_accuracy || 0,
    ewmaConfidence: serverPlan.behavior_metrics.ewma_confidence || 0,
    ewmaLatencyMs: serverPlan.behavior_metrics.ewma_latency_ms || 0,
    completionRate: serverPlan.behavior_metrics.completion_rate || 0,
    wrongStreak: serverPlan.behavior_metrics.wrong_streak || 0,
  } : fallbackPlan.behaviorMetrics;
  const focusWords = (serverPlan.focus_words || []).map(item => ({
    word_id: item.word_id,
    hanzi: item.hanzi,
    pinyin: item.pinyin || '',
    meaning_vi: item.meaning_vi || '',
    accuracy: item.accuracy || 0,
    level: item.level || level,
    next_review_at: item.next_review_at || null,
    tone_pattern: item.tone_pattern || '',
    character_family: item.character_family || '',
    component_hint: item.component_hint || '',
    collocations: item.collocations || [],
    confusable_words: item.confusable_words || [],
    topic: item.topic || 'core',
    frequency_band: item.frequency_band || 'core_hsk',
  }));

  return {
    ...fallbackPlan,
    mode,
    behaviorState: serverPlan.behavior_state || fallbackPlan.behaviorState,
    behaviorLabel: serverPlan.behavior_label || fallbackPlan.behaviorLabel,
    behaviorReason: serverPlan.behavior_reason || serverPlan.reason || fallbackPlan.behaviorReason,
    nudge: serverPlan.nudge || fallbackPlan.nudge,
    forceMicro: Boolean(serverPlan.force_micro),
    blockNewWords: Boolean(serverPlan.block_new_words),
    reduceDifficulty: Boolean(serverPlan.reduce_difficulty),
    allowStretch: Boolean(serverPlan.allow_stretch),
    behaviorMetrics,
    level,
    quizType,
    limit: serverPlan.limit || fallbackPlan.limit,
    dueCount: serverPlan.due_count ?? fallbackPlan.dueCount,
    repairCount: serverPlan.weak_count ?? fallbackPlan.repairCount,
    newCount: serverPlan.new_count ?? fallbackPlan.newCount,
    targetSkills: serverPlan.target_skills || fallbackPlan.targetSkills || [quizType],
    focusWords: focusWords.length ? focusWords : fallbackPlan.focusWords,
    missions: serverPlan.missions || fallbackPlan.missions,
    title: planTitleForState(serverPlan.behavior_state, mode),
    subtitle: `${serverPlan.behavior_label || fallbackPlan.behaviorLabel || 'Duy trì'}: ưu tiên ${quizTypeDescription(quizType)} HSK ${level}.`,
    reason: serverPlan.reason || fallbackPlan.reason,
    source: 'backend',
    action: {
      level,
      quizType,
      limit: serverPlan.limit || fallbackPlan.limit,
    },
  };
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function skillTone(value) {
  if (value >= 80) return 'strong';
  if (value >= 55) return 'steady';
  return 'weak';
}

function strategyLabel(strategy) {
  if (strategy === 'repair') return 'Sửa lỗi';
  if (strategy === 'interleaved') return 'Xoay kỹ năng';
  return 'Tập trung';
}

function AnalyticsPanel({ analytics, onStartRecommended }) {
  const recommendation = analytics?.recommendation || { level: 1, quiz_type: 'vocab', title: 'HSK 1 · Từ vựng', reason: 'Chưa đủ dữ liệu, nên bắt đầu bằng từ vựng HSK 1 để tạo đường chuẩn.', focus_words: [], recommended_strategy: 'targeted' };
  const recommendedStrategy = recommendation.recommended_strategy || 'targeted';
  const eventCount = analytics?.event_count || 0;
  const dueCount = analytics?.due_count || 0;
  const confidenceAvg = Number(analytics?.confidence_avg || 0);
  const latencyAvg = analytics?.latency_avg_ms || 0;
  const dataSourceLabel = analytics?.backend_empty ? 'Local history fallback' : eventCount ? 'LearningEvent + SRS' : analytics?.offline ? 'Local fallback' : 'QuizAttempt fallback';
  const latencyLabel = latencyAvg ? (latencyAvg < 1000 ? 'Dưới 1s phản hồi' : Math.round(latencyAvg / 1000) + 's phản hồi') : 'Chưa đo latency';
  const typeRows = analytics?.type_breakdown?.length
    ? analytics.type_breakdown
    : QUIZ_TYPES.map(type => ({ quiz_type: type.id, label: type.label, attempts: 0, answered: 0, correct: 0, accuracy: 0 }));
  const levelRows = analytics?.level_breakdown?.length
    ? analytics.level_breakdown
    : LEVELS.map(item => ({ level: item, attempts: 0, answered: 0, correct: 0, accuracy: 0 }));
  const trendRows = analytics?.recent_trend || [];
  const weakWords = analytics?.weak_word_list || [];
  const hasData = (analytics?.answered || 0) > 0;
  const chartRows = trendRows.length ? trendRows : [{ label: 'P1', accuracy: 0, score: 0, total: 0 }];
  const maxIndex = Math.max(1, chartRows.length - 1);
  const trendPoints = chartRows.map((item, index) => {
    const x = 8 + (index / maxIndex) * 184;
    const y = 92 - clampPercent(item.accuracy) * 0.78;
    return `${x},${y}`;
  }).join(' ');
  const bestType = typeRows.filter(item => item.answered > 0).sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakType = typeRows.filter(item => item.answered > 0).sort((a, b) => a.accuracy - b.accuracy)[0];

  return (
    <section className="analytics-panel page-enter" aria-label="Phân tích dữ liệu người học">
      <div className="analytics-head">
        <div>
          <span className="core-eyebrow">Learning Analytics</span>
          <h2>Trung tâm phân tích</h2>
          <p>{hasData ? `Nguồn: ${dataSourceLabel}. Skill map dùng event học thật, không chỉ điểm quiz cuối phiên.` : 'Chưa có lịch sử học, hệ thống đang dùng lộ trình khởi động.'}</p>
        </div>
        <div className="analytics-kpis">
          <span><strong>{analytics?.accuracy || 0}%</strong>Chính xác</span>
          <span><strong>{dueCount}</strong>Đến hạn</span>
          <span><strong>{confidenceAvg ? confidenceAvg.toFixed(1) : '-'}</strong>Confidence</span>
          <span><strong>{eventCount || analytics?.attempts || 0}</strong>Events</span>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-main-chart">
          <div className="chart-title-row">
            <div>
              <span className="core-eyebrow">Skill Map</span>
              <h3>Hiệu suất theo dạng bài</h3>
            </div>
            <span>{bestType ? `Mạnh: ${bestType.label}` : 'Đang đo'}</span>
          </div>
          <div className="skill-bars">
            {typeRows.map(item => {
              const value = clampPercent(item.accuracy);
              return (
                <div className="skill-row" key={item.quiz_type}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.answered ? `${item.answered} câu` : 'Chưa luyện'}</span>
                  </div>
                  <div className="skill-meter" data-tone={skillTone(value)}>
                    <span style={{ width: `${value}%` }} />
                  </div>
                  <b>{item.answered ? `${value}%` : '-'}</b>
                </div>
              );
            })}
          </div>
        </div>

        <div className="analytics-side-stack">
          <div className="trend-box">
            <div className="chart-title-row">
              <div>
                <span className="core-eyebrow">Trend</span>
                <h3>8 phiên gần nhất</h3>
              </div>
              <span>{weakType ? `Yếu: ${weakType.label}` : 'Chưa có'}</span>
            </div>
            <svg className="trend-chart" viewBox="0 0 200 100" role="img" aria-label="Xu hướng độ chính xác">
              <line x1="8" y1="92" x2="192" y2="92" />
              <line x1="8" y1="14" x2="8" y2="92" />
              <polyline points={trendPoints} />
              {chartRows.map((item, index) => {
                const x = 8 + (index / maxIndex) * 184;
                const y = 92 - clampPercent(item.accuracy) * 0.78;
                return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="3.8" />;
              })}
            </svg>
            <div className="trend-labels">
              {chartRows.slice(-4).map((item, index) => <span key={`${item.label}-${index}`}>{item.label}: {item.accuracy}%</span>)}
            </div>
          </div>

          <div className="level-box">
            <span className="core-eyebrow">HSK Focus</span>
            <div className="level-bars-mini">
              {levelRows.map(item => {
                const value = clampPercent(item.accuracy);
                return (
                  <div key={item.level}>
                    <span>HSK {item.level}</span>
                    <strong style={{ height: `${Math.max(8, value)}%` }} />
                    <em>{item.answered ? `${value}%` : '-'}</em>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-bottom">
        <div className="recommendation-box">
          <div>
            <span className="core-eyebrow">Đề bài phù hợp</span>
            <h3>{recommendation.title}</h3>
            <p>{recommendation.reason}</p>
            <div className="recommendation-metrics">
              <span>{strategyLabel(recommendedStrategy)}</span>
              <span>{latencyLabel}</span>
            </div>
          </div>
          <button className="btn-primary" onClick={() => onStartRecommended({ ...recommendation, recommended_strategy: recommendedStrategy })}><Play size={16} /> Luyện đề phù hợp</button>
        </div>
        <div className="weak-word-strip">
          {(weakWords.length ? weakWords : recommendation.focus_words?.map(word => ({ hanzi: word, pinyin: '', meaning_vi: '', accuracy: 0 })) || []).slice(0, 4).map(item => (
            <span key={`${item.hanzi}-${item.pinyin}`}>
              <strong>{item.hanzi}</strong>
              <small>{item.pinyin || item.meaning_vi || 'Cần ôn'}</small>
              <em>{item.accuracy ? `${item.accuracy}%` : 'Mới'}</em>
            </span>
          ))}
          {!weakWords.length && !recommendation.focus_words?.length && <span><strong>HSK 1</strong><small>Tạo dữ liệu đầu tiên</small><em>Mới</em></span>}
        </div>
      </div>
    </section>
  );
}
function HskFocusPanel({ focusLevel, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun }) {
  return (
    <section className={`core-card focus-panel ${showFirstRun ? 'focus-panel--first' : ''}`}>
      <div className="focus-copy">
        <span className="core-eyebrow">HSK Focus</span>
        <h1>{showFirstRun ? 'Chọn HSK để kiểm tra đầu vào' : `Đang tập trung HSK ${focusLevel}`}</h1>
        <p>{showFirstRun ? 'Bài kiểm tra tổng quát dùng từ và câu tự nhiên, gồm đủ các dạng quiz để hệ thống biết phần cần ôn.' : 'Chọn một cấp HSK làm trọng tâm. Hệ thống vẫn dùng ví dụ và câu hỏi tự nhiên, không tách rời khỏi ngữ cảnh thật.'}</p>
      </div>

      <div className="focus-controls">
        <div className="focus-level-grid" aria-label="Chọn cấp HSK trọng tâm">
          {FOCUS_LEVELS.map(item => (
            <button key={item} className={focusLevel === item ? 'active' : ''} onClick={() => onSelectLevel(item)}>
              <span>HSK</span>
              <strong>{item}</strong>
            </button>
          ))}
        </div>
        <div className="focus-actions">
          <button className="btn-primary" onClick={() => onStartGeneralCheck(focusLevel)}><Play size={16} /> Kiểm tra tổng quát</button>
          <button className="btn-secondary" onClick={onOpenLessons}><BookOpen size={16} /> Vào bài học HSK {focusLevel}</button>
          {showFirstRun && <button className="btn-secondary" onClick={onSkipFirstRun}>Bỏ qua</button>}
        </div>
      </div>
    </section>
  );
}

function TodayQueuePanel({ plan, selectedMode, onSelectMode, onStartToday, onOpenProgress }) {
  const [nudgeMuted, setNudgeMuted] = useState(() => window.localStorage.getItem('behaviorNudgeMuted') === '1');
  if (!plan) return null;
  const mode = plan.mode;
  const metrics = plan.behaviorMetrics || {};
  const missions = Array.isArray(plan.missions) ? plan.missions : [];
  const focusWords = Array.isArray(plan.focusWords) ? plan.focusWords : [];

  const startDueOnly = () => {
    const microMode = SESSION_MODES.find(item => item.id === 'micro') || mode;
    onStartToday({
      ...plan,
      mode: microMode,
      title: 'Ôn đến hạn',
      newCount: 0,
      action: { ...plan.action, limit: Math.max(3, Math.min(5, plan.dueCount || plan.limit || 5)) },
    });
  };

  const startRepairOnly = () => {
    onStartToday({
      ...plan,
      title: 'Sửa lỗi sai',
      newCount: 0,
      quizType: 'vocab',
      action: { ...plan.action, quizType: 'vocab', limit: Math.max(3, Math.min(6, plan.repairCount || plan.limit || 5)) },
    });
  };

  const muteNudge = () => {
    window.localStorage.setItem('behaviorNudgeMuted', '1');
    setNudgeMuted(true);
  };

  return (
    <section className="core-card today-queue-panel" aria-label="Kế hoạch học hôm nay">
      <div className="today-queue-head">
        <div>
          <span className="core-eyebrow">Today Queue</span>
          <h2>{plan.title}</h2>
          <p>{plan.subtitle}</p>
        </div>
        <div className="today-mode-stack" aria-label="Chọn thời lượng phiên học">
          {SESSION_MODES.map(item => (
            <button
              key={item.id}
              className={(selectedMode === item.id || (plan.forceMicro && mode.id === item.id)) ? 'active' : ''}
              type="button"
              onClick={() => onSelectMode(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </div>

      {!nudgeMuted && plan.nudge && (
        <div className={`behavior-nudge behavior-nudge--${plan.behaviorState || 'maintenance'}`}>
          <div>
            <span className="core-eyebrow">Behavior Engine</span>
            <h3>{plan.behaviorLabel || 'Duy trì'}</h3>
            <p>{plan.nudge}</p>
          </div>
          <div className="behavior-nudge-meta">
            <span>{plan.behaviorReason || plan.reason}</span>
            <small>EWMA {metrics.ewmaAccuracy || 0}% · Confidence {Number(metrics.ewmaConfidence || 0).toFixed(1)} · Streak sai {metrics.wrongStreak || 0}</small>
          </div>
          <button className="btn-secondary" type="button" onClick={muteNudge}><BellOff size={16} /> Tắt nhắc</button>
        </div>
      )}

      <div className="today-mission-grid">
        {missions.map(item => (
          <article key={item.key} className={`today-mission today-mission--${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="today-queue-bottom">
        <div className="today-focus-words" aria-label="Từ trọng tâm">
          {focusWords.length ? focusWords.map(item => (
            <span key={`${item.hanzi}-${item.pinyin || 'focus'}`}>
              <strong>{item.hanzi}</strong>
              <small>{item.pinyin || 'Cần gặp lại'}</small>
            </span>
          )) : (
            <span>
              <strong>HSK {plan.level}</strong>
              <small>Tạo dữ liệu đầu tiên</small>
            </span>
          )}
        </div>
        <div className="today-actions">
          <div>
            <span className="core-eyebrow">Session</span>
            <p>{mode.description}</p>
          </div>
          <div className="today-action-buttons">
            <button className="btn-secondary" type="button" onClick={startDueOnly}><ShieldCheck size={16} /> Ôn đến hạn</button>
            <button className="btn-secondary" type="button" onClick={startRepairOnly}><Wrench size={16} /> Sửa lỗi</button>
            <button className="btn-secondary" type="button" onClick={onOpenProgress}><LineChart size={16} /> Xem tiến độ</button>
            <button className="btn-primary" type="button" onClick={() => onStartToday(plan)}><Play size={16} /> Học hôm nay</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({ analytics, focusLevel, todayPlan, selectedSessionMode, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun, onStartRecommended, onSelectSessionMode, onStartToday, onOpenProgress }) {
  return (
    <main className="core-dashboard page-enter">
      <HskFocusPanel
        focusLevel={focusLevel}
        showFirstRun={showFirstRun}
        onSelectLevel={onSelectLevel}
        onOpenLessons={onOpenLessons}
        onStartGeneralCheck={onStartGeneralCheck}
        onSkipFirstRun={onSkipFirstRun}
      />
      {strategyFlags.enableTodayQueue && (
        <TodayQueuePanel
          plan={todayPlan}
          selectedMode={selectedSessionMode}
          onSelectMode={onSelectSessionMode}
          onStartToday={onStartToday}
          onOpenProgress={onOpenProgress}
        />
      )}
      <AnalyticsPanel analytics={analytics} onStartRecommended={onStartRecommended} />
    </main>
  );
}
function Lessons({ level, setLevel, quizType, setQuizType, onStartQuiz }) {
  const selectedType = QUIZ_TYPES.find(type => type.id === quizType);
  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Lessons</span>
        <h1>Bài học theo cấp độ</h1>
        <p>Chọn HSK và dạng luyện tập. Nội dung sẽ được sắp xếp theo cấp độ hiện tại.</p>
      </section>

      <section className="level-grid">
        {LEVELS.map(item => (
          <button key={item} className={`level-card ${level === item ? 'active' : ''}`} onClick={() => setLevel(item)}>
            <span>HSK</span>
            <strong>{item}</strong>
          </button>
        ))}
      </section>

      <section className="quiz-type-grid">
        {QUIZ_TYPES.map(type => {
          const Icon = type.icon;
          return (
            <button key={type.id} className={`quiz-type-card ${quizType === type.id ? 'active' : ''}`} onClick={() => setQuizType(type.id)}>
              <Icon size={22} />
              <strong>{type.label}</strong>
              <span>{quizTypeDescription(type.id)}</span>
            </button>
          );
        })}
      </section>

      <section className="core-card lesson-start-card">
        <div>
          <span className="core-eyebrow">Selected</span>
          <h2>HSK {level} · {selectedType?.label}</h2>
          <p>Phiên học tập trung vào nội dung cùng cấp độ, tránh lan man và giữ nhịp luyện ổn định.</p>
        </div>
        <button className="btn-primary" onClick={onStartQuiz}><Play size={16} /> Bắt đầu</button>
      </section>
    </main>
  );
}

const QUIZ_STRATEGY_MODES = [
  {
    id: 'targeted',
    label: 'Tập trung',
    title: 'Retrieval cùng kỹ năng',
    detail: 'Một dạng bài, feedback tức thì, confidence và lịch ôn từng câu.',
  },
  {
    id: 'interleaved',
    label: 'Xoay kỹ năng',
    title: 'Interleaving nhẹ',
    detail: 'Trộn kỹ năng liên quan để kiểm tra chuyển giao nghĩa, âm và ngữ cảnh.',
  },
  {
    id: 'repair',
    label: 'Sửa lỗi',
    title: 'Error-first',
    detail: 'Ưu tiên câu dễ kéo ra lỗi sai, sau đó chèn repair loop ngay trong phiên.',
  },
];

const REPAIR_SPACING = 3;

function buildStrategyQuizTypes(selectedQuizType, strategyMode) {
  if (strategyMode !== 'interleaved') return [selectedQuizType];
  const supportMap = {
    vocab: ['vocab', 'listening', 'cloze'],
    listening: ['listening', 'vocab', 'reading'],
    dialogue: ['dialogue', 'listening', 'vocab'],
    reading: ['reading', 'vocab', 'cloze'],
    translation: ['translation', 'reading', 'vocab'],
    cloze: ['cloze', 'vocab', 'listening'],
  };
  return [...new Set(supportMap[selectedQuizType] || [selectedQuizType, 'vocab', 'listening'])];
}

function interleaveQuestionBatches(batches, limit) {
  const rows = [];
  const maxLength = Math.max(...batches.map(batch => batch.questions.length), 0);
  for (let i = 0; i < maxLength; i += 1) {
    batches.forEach(batch => {
      const question = batch.questions[i];
      if (question && rows.length < limit) rows.push(question);
    });
  }
  return rows;
}

function buildQuizStrategySummary(answerRows) {
  const primary = answerRows.filter(item => !item.is_repair);
  const repairs = answerRows.filter(item => item.is_repair);
  const total = primary.length;
  const correct = primary.filter(item => item.correct).length;
  const lowConfidence = primary.filter(item => item.confidence <= 2).length;
  const repairSuccess = repairs.filter(item => item.correct).length;
  const confidenceTotal = primary.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0);
  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    lowConfidence,
    repairCount: repairs.length,
    repairSuccess,
    nextReviewCount: primary.filter(item => !item.correct || item.confidence <= 2).length,
    avgConfidence: total ? Number((confidenceTotal / total).toFixed(1)) : 0,
  };
}

function Quiz({ level, setLevel, quizType, setQuizType, refreshStats, autoStartKey, limit = 10, strategyHint = 'targeted' }) {
  const [session, setSession] = useState(null);
  const [quizItems, setQuizItems] = useState([]);
  const [primaryQuestions, setPrimaryQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [pendingLatency, setPendingLatency] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [completedQuestions, setCompletedQuestions] = useState([]);
  const [strategyMode, setStrategyMode] = useState(strategyHint || 'targeted');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const answersRef = useRef([]);
  const questionStartedAtRef = useRef(0);

  const item = quizItems[index];
  const question = item?.question;
  const activeQuizType = question?.quiz_type || quizType;
  const selectedType = QUIZ_TYPES.find(type => type.id === quizType);
  const questionType = QUIZ_TYPES.find(type => type.id === activeQuizType);
  const strategy = QUIZ_STRATEGY_MODES.find(row => row.id === strategyMode) || QUIZ_STRATEGY_MODES[0];
  const isRepair = item?.type === 'repair_card';
  const isListeningMode = activeQuizType === 'listening' || activeQuizType === 'dialogue';
  const progress = quizItems.length ? Math.round(((index + 1) / quizItems.length) * 100) : 0;

  const resetQuizState = () => {
    setSession(null);
    setQuizItems([]);
    setPrimaryQuestions([]);
    setIndex(0);
    setSelected(null);
    setPendingLatency(null);
    setFeedback(null);
    setAnswers([]);
    setResult(null);
    setCompletedQuestions([]);
    setAudioPlaying(false);
    setAudioPlayed(false);
    answersRef.current = [];
    stopSpeech();
  };

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    resetQuizState();
    try {
      const quizTypes = buildStrategyQuizTypes(quizType, strategyMode);
      const started = await startLearningSession({
        user_id: USER_ID,
        session_type: `quiz_${strategyMode}`,
        behavior_state: strategyMode === 'repair' ? 'fragile' : 'maintenance',
        estimated_minutes: strategyMode === 'interleaved' ? 20 : 10,
        target_words_json: [],
        target_skills_json: quizTypes,
        reason: strategy.detail,
      });
      const perTypeLimit = strategyMode === 'interleaved' ? Math.max(2, Math.ceil(limit / quizTypes.length)) : limit;
      const batches = await Promise.all(quizTypes.map(async type => {
        const data = await startQuiz({ user_id: USER_ID, level, quiz_type: type, limit: perTypeLimit });
        return {
          quizType: type,
          questions: (data.questions || []).map(row => ({ ...row, quiz_type: row.quiz_type || type })),
        };
      }));
      const selectedQuestions = strategyMode === 'interleaved'
        ? interleaveQuestionBatches(batches, limit)
        : (batches[0]?.questions || []).slice(0, limit);
      setSession(started);
      setPrimaryQuestions(selectedQuestions);
      setQuizItems(selectedQuestions.map((row, rowIndex) => ({
        id: `quiz-${row.id}-${rowIndex}`,
        type: 'quiz_item',
        question: row,
      })));
    } finally {
      setLoading(false);
    }
  }, [level, limit, quizType, strategy.detail, strategyMode]);

  useEffect(() => {
    if (autoStartKey <= 0) return undefined;
    const timer = window.setTimeout(() => loadQuiz(), 0);
    return () => window.clearTimeout(timer);
  }, [autoStartKey, loadQuiz]);

  const playAudio = useCallback((rate = 0.82, speechMode = null) => {
    if (!question?.audio_text) return;
    setAudioPlaying(true);
    setAudioPlayed(true);
    const mode = speechMode || (activeQuizType === 'dialogue' ? 'dialogue' : 'sentence');
    speak(question.audio_text, rate, () => setAudioPlaying(false), mode);
  }, [activeQuizType, question]);

  useEffect(() => {
    if (!question) return undefined;
    questionStartedAtRef.current = performance.now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
    }, 0);
    if (!question.audio_text || !isListeningMode) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(activeQuizType === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [activeQuizType, isListeningMode, playAudio, question]);

  const queueRepairItem = (review, selectedIndex, confidenceValue) => {
    if (!question || isRepair) return;
    setQuizItems(currentItems => {
      if (currentItems.some(row => row.type === 'repair_card' && row.source_question_id === question.id)) return currentItems;
      const nextItems = [...currentItems];
      const repairItem = {
        id: `repair-${question.id}-${Date.now()}`,
        type: 'repair_card',
        source_question_id: question.id,
        selected_index: selectedIndex,
        confidence: confidenceValue,
        review,
        question: {
          ...question,
          prompt: `Sửa lại: ${question.prompt}`,
        },
      };
      const insertAt = Math.min(index + REPAIR_SPACING, nextItems.length);
      nextItems.splice(insertAt, 0, repairItem);
      return nextItems;
    });
  };

  const finishQuiz = useCallback(async () => {
    const finalAnswers = answersRef.current;
    const primaryAnswers = finalAnswers.filter(row => !row.is_repair);
    const summary = buildQuizStrategySummary(finalAnswers);
    setLoading(true);
    stopSpeech();
    try {
      const questionsByType = new Map();
      primaryQuestions.forEach(row => {
        const rows = questionsByType.get(row.quiz_type) || [];
        rows.push(row);
        questionsByType.set(row.quiz_type, rows);
      });
      const answersByType = new Map();
      primaryAnswers.forEach(answer => {
        const rows = answersByType.get(answer.quiz_type) || [];
        rows.push({
          question_id: answer.question_id,
          selected_index: answer.selected_index,
          latency_ms: answer.latency_ms,
          confidence: answer.confidence,
          error_tag: answer.error_tag || null,
        });
        answersByType.set(answer.quiz_type, rows);
      });
      await Promise.all([...answersByType.entries()].map(([type, rows]) => (
        submitQuiz({
          user_id: USER_ID,
          level,
          quiz_type: type,
          session_id: session?.id,
          record_events: false,
          answers: rows,
        }, questionsByType.get(type) || [])
      )));
      if (session?.id) {
        await completeLearningSession({ user_id: USER_ID, session_id: session.id, summary });
      }
      await refreshStats?.();
      setCompletedQuestions(primaryQuestions);
      setResult({ ...summary, answers: primaryAnswers, repairs: finalAnswers.filter(row => row.is_repair) });
      setQuizItems([]);
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, [level, primaryQuestions, refreshStats, session]);

  const answerQuestion = (choiceIndex, eventTimeStamp) => {
    if (!question || selected !== null || submitting || feedback || loading) return;
    setSelected(choiceIndex);
    setPendingLatency(Math.max(0, eventTimeStamp - questionStartedAtRef.current));
  };

  const chooseConfidence = async (confidenceValue) => {
    if (!question || selected === null || submitting) return;
    setSubmitting(true);
    try {
      const itemType = isRepair ? 'repair_card' : sessionItemType(question, false);
      const review = await recordLearningEvent({
        user_id: USER_ID,
        session_id: session?.id,
        question_id: question.id,
        selected_index: selected,
        confidence: confidenceValue,
        latency_ms: pendingLatency,
        item_type: itemType,
      }, question);
      const answerRecord = {
        question_id: question.id,
        quiz_type: activeQuizType,
        item_type: itemType,
        selected_index: selected,
        confidence: confidenceValue,
        latency_ms: pendingLatency,
        correct: review.correct,
        correct_index: review.correct_index,
        explanation: review.explanation || question.explanation || '',
        next_review_at: review.next_review_at,
        error_tag: review.error_tag || null,
        prompt: question.prompt,
        word: question.word || null,
        is_repair: isRepair,
      };
      const nextAnswers = [...answersRef.current, answerRecord];
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
      if (!isRepair && (!review.correct || confidenceValue <= 2)) {
        queueRepairItem(review, selected, confidenceValue);
      }
      setFeedback({ review, confidence: confidenceValue, selectedIndex: selected });
    } finally {
      setSubmitting(false);
    }
  };

  const continueQuiz = () => {
    if (index + 1 >= quizItems.length) {
      finishQuiz();
      return;
    }
    setIndex(current => current + 1);
    setSelected(null);
    setPendingLatency(null);
    setFeedback(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
  };

  if (result) {
    const answerById = new Map(result.answers.map(row => [row.question_id, row]));
    return (
      <main className="core-page page-enter">
        <section className="core-card result-card session-result-card">
          <span className="core-eyebrow">Strategic Quiz Result</span>
          <h1>{result.accuracy >= 80 ? 'Nhớ chắc hơn' : result.accuracy >= 55 ? 'Đã sửa được nền' : 'Cần phiên phục hồi'}</h1>
          <p>Quiz đã cập nhật SRS từng câu, confidence, lỗi sai và repair loop.</p>
          <div className="session-result-grid">
            <span><ShieldCheck size={18} /><strong>{result.correct}/{result.total}</strong><small>retrieval đúng</small></span>
            <span><Wrench size={18} /><strong>{result.repairSuccess}/{result.repairCount}</strong><small>repair thành công</small></span>
            <span><Clock3 size={18} /><strong>{result.nextReviewCount}</strong><small>gặp lại sớm</small></span>
            <span><LineChart size={18} /><strong>{result.avgConfidence}</strong><small>độ chắc TB</small></span>
          </div>
          <div className="result-summary">
            <strong>{result.accuracy}%</strong>
            <span>độ chính xác chính</span>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={loadQuiz}><Play size={16} /> Làm phiên mới</button>
            <button className="btn-secondary" onClick={() => setResult(null)}><BookOpen size={16} /> Chọn lại</button>
          </div>
        </section>

        <section className="result-review">
          {completedQuestions.map((row, rowIndex) => {
            const review = answerById.get(row.id);
            return (
              <article key={row.id} className={`core-card review-item ${review?.correct ? 'correct' : 'wrong'}`}>
                <div className="review-state">
                  {review?.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  <span>{review?.correct ? 'Đúng' : 'Cần ôn'}</span>
                </div>
                <strong>{rowIndex + 1}. {row.prompt}</strong>
                <p>{review?.explanation || row.explanation || 'Câu này đã được đưa vào lịch ôn.'}</p>
                <small>Confidence {review?.confidence || 0}/4 · {nextReviewText(review?.next_review_at)}</small>
              </article>
            );
          })}
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head quiz-setup strategy-quiz-setup">
        <div>
          <span className="core-eyebrow">Strategic Quiz</span>
          <h1>HSK {level} · {selectedType?.label}</h1>
          <p>Retrieval từng câu, confidence, feedback tức thì, repair loop và SRS event. Không chờ đến cuối phiên mới biết sai.</p>
        </div>
        <div className="setup-controls">
          <select value={level} onChange={e => setLevel(Number(e.target.value))} disabled={Boolean(question) || loading}>
            {LEVELS.map(row => <option key={row} value={row}>HSK {row}</option>)}
          </select>
          <select value={quizType} onChange={e => setQuizType(e.target.value)} disabled={Boolean(question) || loading}>
            {QUIZ_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
          <button className="btn-primary" onClick={loadQuiz} disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />} Tạo quiz</button>
        </div>
      </section>

      <section className="quiz-strategy-grid" aria-label="Chọn chiến lược quiz">
        {QUIZ_STRATEGY_MODES.map(mode => (
          <button key={mode.id} type="button" className={`core-card quiz-strategy-card ${strategyMode === mode.id ? 'active' : ''}`} onClick={() => setStrategyMode(mode.id)} disabled={Boolean(question) || loading}>
            <span>{mode.label}</span>
            <strong>{mode.title}</strong>
            <small>{mode.detail}</small>
          </button>
        ))}
      </section>

      {!question && !loading && (
        <section className="core-card empty-state">
          <AlertCircle size={24} />
          <h2>Chưa có phiên quiz</h2>
          <p>Chọn cấp độ, dạng luyện tập và chiến lược rồi tạo quiz.</p>
          <button className="btn-primary" onClick={loadQuiz}><Play size={16} /> Tạo quiz chiến lược</button>
        </section>
      )}

      {loading && !question && (
        <section className="core-card empty-state">
          <Loader2 size={24} className="spin" />
          <h2>Đang dựng quiz</h2>
          <p>Hệ thống đang tạo session, chọn câu hỏi và chuẩn bị vòng repair.</p>
        </section>
      )}

      {question && (
        <section key={item.id} className={`core-card question-card learning-question-card ${isRepair ? 'learning-question-card--repair' : ''}`} aria-live="polite">
          <div className="question-topline">
            <span>{isRepair ? 'Repair loop' : questionType?.label || 'Đang luyện'}</span>
            <strong>{index + 1}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="quiz-strategy-strip">
            <span>{strategy.label}</span>
            <small>{answers.filter(row => !row.is_repair).length}/{primaryQuestions.length} câu chính · {answers.filter(row => row.is_repair).length} repair</small>
          </div>
          {isRepair && (
            <div className="repair-notice">
              <Wrench size={18} />
              <span>{item.confidence <= 2 ? 'Quay lại vì độ chắc thấp.' : 'Quay lại để sửa lỗi trước đó.'}</span>
            </div>
          )}
          <h2>{question.prompt}</h2>
          {question.audio_text && (
            <div className={`audio-panel ${isListeningMode ? 'audio-panel--focus' : ''}`}>
              <div>
                <span className="core-eyebrow">Audio</span>
                <p>{audioPlaying ? 'Đang phát âm thanh...' : audioPlayed ? 'Có thể nghe lại trước khi chọn đáp án.' : 'Bấm nghe để phát âm thanh.'}</p>
                <VoiceMeta />
              </div>
              <div className="audio-actions">
                <button className="btn-secondary" onClick={() => playAudio(0.82)} disabled={audioPlaying}><Headphones size={16} /> Nghe lại</button>
                <button className="btn-secondary" onClick={() => playAudio(0.66)} disabled={audioPlaying}><Headphones size={16} /> Nghe chậm</button>
                <button className="btn-secondary" onClick={() => playAudio(0.58, 'chunk')} disabled={audioPlaying}><Headphones size={16} /> Từng cụm</button>
              </div>
            </div>
          )}
          <div className="option-grid">
            {question.options.map((option, optionIndex) => (
              <button
                key={`${question.id}-${option}`}
                className={`${selected === optionIndex ? 'selected' : ''} ${selected !== null && selected !== optionIndex ? 'muted-option' : ''}`}
                onClick={(event) => answerQuestion(optionIndex, event.timeStamp)}
                disabled={selected !== null || submitting || Boolean(feedback) || loading}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                {option}
              </button>
            ))}
          </div>

          {selected !== null && !feedback && (
            <div className="confidence-panel">
              <div>
                <span className="core-eyebrow">Confidence</span>
                <p>Chọn độ chắc chắn. Sai hoặc confidence thấp sẽ tự chèn repair card sau vài câu.</p>
              </div>
              <div className="confidence-grid">
                {CONFIDENCE_LEVELS.map(row => (
                  <button key={row.value} type="button" onClick={() => chooseConfidence(row.value)} disabled={submitting}>
                    <strong>{row.value}</strong>
                    <span>{row.label}</span>
                    <small>{row.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {feedback && (
            <div className={`feedback-panel ${feedback.review.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
              <div className="feedback-head">
                {feedback.review.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                <strong>{feedback.review.correct ? 'Đúng' : 'Cần sửa'}</strong>
                <span>{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              <p>{feedback.review.explanation || question.explanation || 'Câu này đã được ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && <small>Đáp án đúng: {question.options[feedback.review.correct_index] || 'xem giải thích'}</small>}
              {feedback.review.correct && feedback.confidence <= 2 && <small>Đúng nhưng chưa chắc, hệ thống sẽ cho gặp lại để khóa trí nhớ.</small>}
              <button className="btn-primary" type="button" onClick={continueQuiz} disabled={loading}>{index + 1 >= quizItems.length ? 'Hoàn thành' : 'Tiếp tục'}</button>
            </div>
          )}

          {selected === null && !feedback && <p className="auto-next-hint">Chọn đáp án, sau đó chọn confidence để hệ thống hẹn lịch ôn.</p>}
        </section>
      )}
    </main>
  );
}
const CONFIDENCE_LEVELS = [
  { value: 1, label: 'Đoán', detail: 'Ôn lại sớm' },
  { value: 2, label: 'Chưa chắc', detail: 'Giữ nhịp nhẹ' },
  { value: 3, label: 'Khá chắc', detail: 'Lịch chuẩn' },
  { value: 4, label: 'Rất chắc', detail: 'Có thể giãn lịch' },
];

function sessionModeMinutes(mode) {
  if (mode?.id === 'micro') return 5;
  if (mode?.id === 'deep') return 45;
  return 20;
}

function sessionItemType(question, isRepair) {
  if (isRepair) return 'repair_card';
  if (question?.quiz_type === 'listening') return 'listening_quiz';
  if (question?.quiz_type === 'cloze') return 'cloze_quiz';
  if (question?.quiz_type === 'reading' || question?.quiz_type === 'translation' || question?.quiz_type === 'dialogue') return 'context_quiz';
  return 'recognition_quiz';
}

function nextReviewText(value) {
  if (!value) return 'Gặp lại trong lịch ôn kế tiếp.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Gặp lại trong lịch ôn kế tiếp.';
  return `Gặp lại ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}.`;
}

function buildSessionSummary(plan, answers) {
  const quizAnswers = answers.filter(item => String(item.item_type || '').endsWith('_quiz'));
  const repairAnswers = answers.filter(item => item.item_type === 'repair_card');
  const outputAnswers = answers.filter(item => item.item_type === 'guided_output');
  const correct = quizAnswers.filter(item => item.correct).length;
  const wrong = quizAnswers.length - correct;
  const repaired = repairAnswers.filter(item => item.correct).length;
  const lowConfidence = quizAnswers.filter(item => item.confidence <= 2).length;
  const total = quizAnswers.length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  return {
    total,
    correct,
    wrong,
    repaired,
    lowConfidence,
    accuracy,
    protectedDue: Math.min(plan?.dueCount || 0, correct + repaired),
    weakRepaired: repaired,
    newIntroduced: plan?.newCount || 0,
    nextReviewCount: wrong + lowConfidence,
    productionAttempts: outputAnswers.length,
    productionSuccess: outputAnswers.filter(item => item.correct).length,
  };
}

function toneOptions(pattern) {
  const base = ['1', '2', '3', '4', '1-4', '2-3', '3-4', 'neutral'];
  return [pattern, ...base.filter(item => item !== pattern)].slice(0, 4);
}

function isPracticeItem(item) {
  return ['character_card', 'tone_drill', 'confusion_card', 'pinyin_typing', 'micro_reading', 'guided_output'].includes(item?.type);
}

function LearningSession({ plan, fallbackLevel, onExit, onComplete }) {
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [pendingLatency, setPendingLatency] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const answersRef = useRef([]);
  const finishedRef = useRef(false);
  const questionStartedAtRef = useRef(0);

  const modeId = plan?.mode?.id || 'standard';
  const level = plan?.action?.level || plan?.level || fallbackLevel || 1;
  const quizType = plan?.action?.quizType || plan?.quizType || 'vocab';
  const limit = plan?.action?.limit || plan?.limit || 10;
  const item = items[index];
  const question = item?.question;
  const practiceWord = item?.word;
  const isRepair = item?.type === 'repair_card';
  const isIntro = item?.type === 'intro_card';
  const isPractice = isPracticeItem(item);
  const activeQuizType = question?.quiz_type || quizType;
  const questionType = QUIZ_TYPES.find(type => type.id === activeQuizType);
  const isListeningMode = activeQuizType === 'listening' || activeQuizType === 'dialogue';
  const questionItems = items.filter(row => row.type !== 'intro_card');
  const answeredItems = Math.max(0, index - 1);
  const progress = questionItems.length ? Math.round((Math.min(answeredItems + (isIntro ? 0 : 1), questionItems.length) / questionItems.length) * 100) : 0;

  const finishSession = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setLoading(true);
    stopSpeech();
    const summary = buildSessionSummary(plan, answersRef.current);
    try {
      if (session?.id) {
        await completeLearningSession({ user_id: USER_ID, session_id: session.id, summary });
      }
      markLearningSessionCompleted({ ...summary, answers: answersRef.current });
      await onComplete?.();
    } finally {
      setCompleted(summary);
      setLoading(false);
    }
  }, [onComplete, plan, session]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setSession(null);
    setItems([]);
    setIndex(0);
    setSelected(null);
    setPendingLatency(null);
    setFeedback(null);
    setTextAnswer('');
    setPracticeFeedback(null);
    setCompleted(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
    answersRef.current = [];
    finishedRef.current = false;
    stopSpeech();
    try {
      const started = await startLearningSession({
        user_id: USER_ID,
        session_type: modeId,
        behavior_state: plan?.behaviorState || 'maintenance',
        estimated_minutes: sessionModeMinutes(plan?.mode),
        target_words_json: plan?.focusWords || [],
        target_skills_json: [quizType],
        reason: plan?.reason || '',
      });
      const data = await startQuiz({ user_id: USER_ID, level, quiz_type: quizType, limit });
      const quizItems = (data.questions || []).map((row, rowIndex) => ({
        id: `quiz-${row.id}-${rowIndex}`,
        type: 'quiz_item',
        question: { ...row, quiz_type: row.quiz_type || quizType },
      }));
      const chineseItems = buildChineseLearningItems(plan);
      const introItems = chineseItems.slice(0, modeId === 'micro' ? 1 : 3);
      const applyItems = chineseItems.slice(introItems.length);
      setSession(started);
      setItems([{ id: 'intro', type: 'intro_card' }, ...introItems, ...quizItems, ...applyItems]);
    } finally {
      setLoading(false);
    }
  }, [level, limit, modeId, plan, quizType]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadSession(), 0);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [loadSession]);

  const playAudio = useCallback((rate = 0.82, speechMode = null) => {
    if (!question?.audio_text) return;
    setAudioPlaying(true);
    setAudioPlayed(true);
    const mode = speechMode || (activeQuizType === 'dialogue' ? 'dialogue' : 'sentence');
    speak(question.audio_text, rate, () => setAudioPlaying(false), mode);
  }, [activeQuizType, question]);

  useEffect(() => {
    if (!question) return undefined;
    questionStartedAtRef.current = performance.now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
    }, 0);
    if (!question.audio_text || !isListeningMode) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(activeQuizType === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [activeQuizType, isListeningMode, playAudio, question]);

  const startChallenge = () => {
    setIndex(1);
  };

  const answerQuestion = (choiceIndex, eventTimeStamp) => {
    if (!question || selected !== null || submitting || feedback) return;
    setSelected(choiceIndex);
    setPendingLatency(Math.max(0, eventTimeStamp - questionStartedAtRef.current));
  };

  const queueRepairItem = (review, selectedIndex) => {
    setItems(currentItems => {
      const nextItems = [...currentItems];
      const repairItem = {
        id: `repair-${question.id}-${Date.now()}`,
        type: 'repair_card',
        source_question_id: question.id,
        selected_index: selectedIndex,
        review,
        question: {
          ...question,
          prompt: `Gặp lại: ${question.prompt}`,
        },
      };
      const insertAt = Math.min(index + 4, nextItems.length);
      nextItems.splice(insertAt, 0, repairItem);
      return nextItems;
    });
  };

  const chooseConfidence = async (confidenceValue) => {
    if (!question || selected === null || submitting) return;
    setSubmitting(true);
    try {
      const review = await recordLearningEvent({
        user_id: USER_ID,
        session_id: session?.id,
        question_id: question.id,
        selected_index: selected,
        confidence: confidenceValue,
        latency_ms: pendingLatency,
        item_type: sessionItemType(question, isRepair),
      }, question);
      const answerRecord = {
        question_id: question.id,
        item_type: sessionItemType(question, isRepair),
        selected_index: selected,
        confidence: confidenceValue,
        latency_ms: pendingLatency,
        correct: review.correct,
        explanation: review.explanation,
        next_review_at: review.next_review_at,
        prompt: question.prompt,
      };
      answersRef.current = [...answersRef.current, answerRecord];
      if (!review.correct && !isRepair) {
        queueRepairItem(review, selected);
      }
      setFeedback({ review, confidence: confidenceValue, selectedIndex: selected });
    } finally {
      setSubmitting(false);
    }
  };

  const continueSession = () => {
    if (index + 1 >= items.length) {
      finishSession();
      return;
    }
    setIndex(current => current + 1);
    setSelected(null);
    setPendingLatency(null);
    setFeedback(null);
    setTextAnswer('');
    setPracticeFeedback(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
  };

  const completePracticeItem = async (payload = {}) => {
    if (!item || submitting) return;
    setSubmitting(true);
    try {
      let result = payload;
      if (item.type === 'guided_output') {
        const localResult = assessSentenceDraft(textAnswer, item.word, [item.word]);
        result = localResult.correct
          ? mergeProductionResult(await submitOutputEvent({
            user_id: USER_ID,
            session_id: session?.id,
            word_id: item.word?.word_id,
            target_word: item.word?.hanzi || '',
            prompt: item.prompt,
            response_text: textAnswer,
          }), localResult)
          : localResult;
      }
      const answerRecord = {
        question_id: null,
        item_type: item.type,
        selected_index: null,
        confidence: null,
        latency_ms: null,
        correct: Boolean(result.correct ?? true),
        explanation: result.feedback || result.message || '',
        prompt: item.prompt || item.sentence_cn || item.word?.hanzi || item.type,
        word: item.word || null,
      };
      answersRef.current = [...answersRef.current, answerRecord];
      if (result.errorTag === 'tone_error' && item.word) {
        setItems(currentItems => {
          const nextItems = [...currentItems];
          nextItems.splice(Math.min(index + 2, nextItems.length), 0, {
            id: `tone-repair-${item.word.hanzi}-${Date.now()}`,
            type: 'tone_drill',
            word: item.word,
          });
          return nextItems;
        });
      }
      setPracticeFeedback(result);
    } finally {
      setSubmitting(false);
    }
  };

  const submitPinyin = () => {
    const result = assessPinyinInput(textAnswer, item?.word?.pinyin);
    completePracticeItem({ ...result, feedback: result.message });
  };

  if (completed) {
    return (
      <main className="core-page page-enter">
        <section className="core-card result-card session-result-card">
          <span className="core-eyebrow">Session Result</span>
          <h1>{completed.accuracy >= 80 ? 'Bảo vệ tốt' : completed.accuracy >= 55 ? 'Đã giữ nhịp' : 'Cần phiên phục hồi'}</h1>
          <p>Phiên đã cập nhật lịch ôn, lỗi sai và độ chắc chắn.</p>
          <div className="session-result-grid">
            <span><ShieldCheck size={18} /><strong>{completed.protectedDue}</strong><small>từ đến hạn</small></span>
            <span><Wrench size={18} /><strong>{completed.weakRepaired}</strong><small>sửa trong phiên</small></span>
            <span><BookOpen size={18} /><strong>{completed.newIntroduced}</strong><small>từ mới</small></span>
            <span><Clock3 size={18} /><strong>{completed.nextReviewCount}</strong><small>gặp lại sớm</small></span>
            <span><Languages size={18} /><strong>{completed.productionSuccess}/{completed.productionAttempts}</strong><small>output</small></span>
          </div>
          <div className="result-summary">
            <strong>{completed.accuracy}%</strong>
            <span>{completed.correct}/{completed.total} câu chính đúng</span>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={loadSession}><RotateCcw size={16} /> Làm phiên mới</button>
            <button className="btn-secondary" onClick={onExit}><BarChart3 size={16} /> Về Today Queue</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head learning-session-head">
        <div>
          <span className="core-eyebrow">RECAP-SRS</span>
          <h1>{plan?.title || 'Học hôm nay'}</h1>
          <p>{plan?.reason || 'Phiên học ưu tiên ôn đúng hạn, sửa lỗi và ghi lịch gặp lại.'}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={onExit}>Thoát phiên</button>
      </section>

      {loading && !item && (
        <section className="core-card empty-state">
          <Loader2 size={24} className="spin" />
          <h2>Đang dựng phiên học</h2>
          <p>Hệ thống đang lấy câu hỏi và tạo session record.</p>
        </section>
      )}

      {!loading && !item && (
        <section className="core-card empty-state">
          <AlertCircle size={24} />
          <h2>Chưa có câu hỏi</h2>
          <p>Chọn lại HSK hoặc thử tạo phiên mới.</p>
          <div className="result-actions">
            <button className="btn-primary" onClick={loadSession}><Play size={16} /> Tạo lại</button>
            <button className="btn-secondary" onClick={onExit}>Quay lại</button>
          </div>
        </section>
      )}

      {isIntro && (
        <section className="core-card session-intro-card">
          <span className="core-eyebrow">Today Queue</span>
          <h2>{plan?.mode?.title || 'Học hôm nay'}</h2>
          <p>{plan?.mode?.description || plan?.subtitle || 'Bắt đầu bằng từ đến hạn, sau đó sửa lỗi và thêm mới nếu còn tải.'}</p>
          <div className="session-pill-grid">
            <span><ShieldCheck size={18} /><strong>{plan?.dueCount || 0}</strong><small>đến hạn</small></span>
            <span><Wrench size={18} /><strong>{plan?.repairCount || 0}</strong><small>cần sửa</small></span>
            <span><BookOpen size={18} /><strong>{plan?.newCount || 0}</strong><small>từ mới</small></span>
            <span><Clock3 size={18} /><strong>{sessionModeMinutes(plan?.mode)}</strong><small>phút</small></span>
          </div>
          <button className="btn-primary" type="button" onClick={startChallenge} disabled={questionItems.length === 0}><Play size={16} /> Bắt đầu</button>
        </section>
      )}

      {isPractice && (
        <section key={item.id} className={`core-card chinese-practice-card chinese-practice-card--${item.type}`} aria-live="polite">
          <div className="question-topline">
            <span>{item.type === 'guided_output' ? 'Apply' : item.type === 'pinyin_typing' ? 'Pinyin' : item.type === 'tone_drill' ? 'Tone drill' : item.type === 'micro_reading' ? 'Micro reading' : 'Chinese layer'}</span>
            <strong>{Math.min(index, questionItems.length)}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>

          {item.type === 'character_card' && (
            <div className="character-card-body">
              <div className="hanzi-hero">{practiceWord.hanzi}</div>
              <div>
                <span className="core-eyebrow">Character Family</span>
                <h2>{practiceWord.character_family || practiceWord.hanzi}</h2>
                <p>{practiceWord.component_hint}</p>
                <div className="metadata-strip">
                  <span><strong>{practiceWord.pinyin}</strong><small>Pinyin</small></span>
                  <span><strong>{practiceWord.tone_pattern}</strong><small>Tone</small></span>
                  <span><strong>{practiceWord.topic}</strong><small>Topic</small></span>
                </div>
              </div>
            </div>
          )}

          {item.type === 'tone_drill' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Tone Pattern</span>
              <h2>{practiceWord.hanzi}</h2>
              <p>Chọn tone pattern đúng cho pinyin: <strong>{practiceWord.pinyin}</strong></p>
              <div className="tone-option-grid">
                {toneOptions(practiceWord.tone_pattern).map(option => (
                  <button key={option} type="button" onClick={() => completePracticeItem({ correct: option === practiceWord.tone_pattern, errorTag: option === practiceWord.tone_pattern ? '' : 'tone_error', feedback: option === practiceWord.tone_pattern ? 'Tone đúng.' : `Tone đúng là ${practiceWord.tone_pattern}.` })} disabled={Boolean(practiceFeedback) || submitting}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.type === 'confusion_card' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Confusion Pair</span>
              <h2>{practiceWord.hanzi} <small>vs</small> {practiceWord.confusable_words.join(' / ')}</h2>
              <p>{practiceWord.component_hint}</p>
              <div className="metadata-strip">
                <span><strong>{practiceWord.hanzi}</strong><small>Từ mục tiêu</small></span>
                {practiceWord.confusable_words.map(word => <span key={word}><strong>{word}</strong><small>Dễ nhầm</small></span>)}
              </div>
              {!practiceFeedback && <button className="btn-primary" type="button" onClick={() => completePracticeItem({ correct: true, feedback: 'Đã xem cặp dễ nhầm.' })}>Đã rõ</button>}
            </div>
          )}

          {item.type === 'pinyin_typing' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Pinyin Typing</span>
              <h2>{practiceWord.hanzi}</h2>
              <p>Gõ pinyin có tone số, ví dụ `xue2 xi2`.</p>
              <input className="practice-input" value={textAnswer} onChange={event => setTextAnswer(event.target.value)} placeholder="Nhập pinyin" disabled={Boolean(practiceFeedback)} />
              {!practiceFeedback && <button className="btn-primary" type="button" onClick={submitPinyin} disabled={!textAnswer.trim() || submitting}>Kiểm tra</button>}
            </div>
          )}

          {item.type === 'micro_reading' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Micro Reading</span>
              <h2>{item.sentence_cn}</h2>
              <p>{item.sentence_vi}</p>
              <div className="metadata-strip">
                {item.words.map(word => <span key={word.hanzi}><strong>{word.hanzi}</strong><small>{word.pinyin}</small></span>)}
              </div>
              <div className="audio-actions">
                <button className="btn-secondary" type="button" onClick={() => speak(item.sentence_cn, 0.82)}><Headphones size={16} /> Nghe câu</button>
                {!practiceFeedback && <button className="btn-primary" type="button" onClick={() => completePracticeItem({ correct: true, feedback: 'Đã đọc/nghe ngữ cảnh ngắn.' })}>Tiếp tục</button>}
              </div>
            </div>
          )}

          {item.type === 'guided_output' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Guided Output</span>
              <h2>{item.prompt}</h2>
              <p>Dùng từ mục tiêu trong một câu ngắn. Production score tách riêng recognition SRS.</p>
              <textarea className="practice-textarea" value={textAnswer} onChange={event => setTextAnswer(event.target.value)} placeholder={getPracticeExample(practiceWord)?.cn || `Nhập một câu tiếng Trung có “${practiceWord.hanzi}”`} disabled={Boolean(practiceFeedback)} />
              {!practiceFeedback && <button className="btn-primary" type="button" onClick={() => completePracticeItem()} disabled={!textAnswer.trim() || submitting}>Gửi câu</button>}
            </div>
          )}

          {practiceFeedback && (
            <div className={`feedback-panel ${practiceFeedback.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
              <div className="feedback-head">
                {practiceFeedback.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                <strong>{practiceFeedback.correct ? 'Ổn' : 'Cần luyện lại'}</strong>
                {practiceFeedback.score !== undefined && <span>Production {practiceFeedback.score}%</span>}
              </div>
              <p>{practiceFeedback.feedback || practiceFeedback.message}</p>
              <button className="btn-primary" type="button" onClick={continueSession}>{index + 1 >= items.length ? 'Hoàn thành' : 'Tiếp tục'}</button>
            </div>
          )}

          {!practiceFeedback && item.type === 'character_card' && <button className="btn-primary" type="button" onClick={() => completePracticeItem({ correct: true, feedback: 'Đã xem character family và collocation.' })}>Tiếp tục</button>}
        </section>
      )}

      {question && (
        <section key={item.id} className={`core-card question-card learning-question-card ${isRepair ? 'learning-question-card--repair' : ''}`} aria-live="polite">
          <div className="question-topline">
            <span>{isRepair ? 'Repair loop' : questionType?.label || 'Challenge'}</span>
            <strong>{Math.min(index, questionItems.length)}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          {isRepair && (
            <div className="repair-notice">
              <Wrench size={18} />
              <span>Câu này quay lại để sửa lỗi trước đó.</span>
            </div>
          )}
          <h2>{question.prompt}</h2>
          {question.audio_text && (
            <div className={`audio-panel ${isListeningMode ? 'audio-panel--focus' : ''}`}>
              <div>
                <span className="core-eyebrow">Audio</span>
                <p>{audioPlaying ? 'Đang phát âm thanh...' : audioPlayed ? 'Có thể nghe lại trước khi chọn đáp án.' : 'Bấm nghe để phát âm thanh.'}</p>
                <VoiceMeta />
              </div>
              <div className="audio-actions">
                <button className="btn-secondary" onClick={() => playAudio(0.82)} disabled={audioPlaying}><Headphones size={16} /> Nghe lại</button>
                <button className="btn-secondary" onClick={() => playAudio(0.66)} disabled={audioPlaying}><Headphones size={16} /> Nghe chậm</button>
                <button className="btn-secondary" onClick={() => playAudio(0.58, 'chunk')} disabled={audioPlaying}><Headphones size={16} /> Từng cụm</button>
              </div>
            </div>
          )}
          <div className="option-grid">
            {question.options.map((option, optionIndex) => (
              <button
                key={`${question.id}-${option}`}
                className={`${selected === optionIndex ? 'selected' : ''} ${selected !== null && selected !== optionIndex ? 'muted-option' : ''}`}
                onClick={(event) => answerQuestion(optionIndex, event.timeStamp)}
                disabled={selected !== null || submitting || Boolean(feedback)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                {option}
              </button>
            ))}
          </div>

          {selected !== null && !feedback && (
            <div className="confidence-panel">
              <div>
                <span className="core-eyebrow">Confidence</span>
                <p>Chọn độ chắc chắn để hệ thống hẹn lịch ôn đúng hơn.</p>
              </div>
              <div className="confidence-grid">
                {CONFIDENCE_LEVELS.map(row => (
                  <button key={row.value} type="button" onClick={() => chooseConfidence(row.value)} disabled={submitting}>
                    <strong>{row.value}</strong>
                    <span>{row.label}</span>
                    <small>{row.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {feedback && (
            <div className={`feedback-panel ${feedback.review.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
              <div className="feedback-head">
                {feedback.review.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                <strong>{feedback.review.correct ? 'Đúng' : 'Cần sửa'}</strong>
                <span>{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              <p>{feedback.review.explanation || question.explanation || 'Câu này đã được ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && <small>Đáp án đúng: {question.options[feedback.review.correct_index] || 'xem giải thích'}</small>}
              <button className="btn-primary" type="button" onClick={continueSession} disabled={loading}>{index + 1 >= items.length ? 'Hoàn thành' : 'Tiếp tục'}</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function GeneralCheck({ level, onExit, onComplete }) {
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const questionStartedAtRef = useRef(0);

  const question = questions[index];
  const questionType = QUIZ_TYPES.find(type => type.id === question?.quiz_type);
  const isListeningMode = question?.quiz_type === 'listening' || question?.quiz_type === 'dialogue';
  const progress = questions.length ? Math.round(((index + 1) / questions.length) * 100) : 0;

  const loadGeneralCheck = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setSelected(null);
    setAnswers([]);
    setQuestions([]);
    setIndex(0);
    setAdvancing(false);
    setAudioPlayed(false);
    setAudioPlaying(false);
    stopSpeech();
    try {
      const batches = await Promise.all(GENERAL_CHECK_TYPES.map(async quizType => {
        const data = await startQuiz({ user_id: USER_ID, level, quiz_type: quizType, limit: GENERAL_CHECK_LIMIT });
        return (data.questions || []).map(item => ({ ...item, quiz_type: item.quiz_type || quizType }));
      }));
      const mixedQuestions = batches.flat().sort(() => Math.random() - 0.5);
      setQuestions(mixedQuestions);
    } finally {
      setLoading(false);
    }
  }, [level]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadGeneralCheck(), 0);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [loadGeneralCheck]);

  const playAudio = useCallback((rate = 0.82, speechMode = null) => {
    if (!question?.audio_text) return;
    setAudioPlaying(true);
    setAudioPlayed(true);
    const mode = speechMode || (question.quiz_type === 'dialogue' ? 'dialogue' : 'sentence');
    speak(question.audio_text, rate, () => setAudioPlaying(false), mode);
  }, [question]);

  useEffect(() => {
    questionStartedAtRef.current = performance.now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
    }, 0);
    if (!question?.audio_text || !isListeningMode) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(question.quiz_type === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [question?.id, question?.audio_text, question?.quiz_type, isListeningMode, playAudio]);

  const submitGeneralCheck = async (finalAnswers) => {
    setLoading(true);
    stopSpeech();
    try {
      const questionsByType = new Map();
      questions.forEach(item => {
        const rows = questionsByType.get(item.quiz_type) || [];
        rows.push(item);
        questionsByType.set(item.quiz_type, rows);
      });

      const answersByType = new Map();
      finalAnswers.forEach(answer => {
        const rows = answersByType.get(answer.quiz_type) || [];
        rows.push({ question_id: answer.question_id, selected_index: answer.selected_index, latency_ms: answer.latency_ms });
        answersByType.set(answer.quiz_type, rows);
      });

      const submissions = await Promise.all([...answersByType.entries()].map(([quizType, typeAnswers]) => (
        submitQuiz({ user_id: USER_ID, level, quiz_type: quizType, answers: typeAnswers }, questionsByType.get(quizType) || [])
      )));
      const results = submissions.flatMap(item => item.results || []);
      const score = submissions.reduce((sum, item) => sum + (item.score || 0), 0);
      const total = submissions.reduce((sum, item) => sum + (item.total || 0), 0);
      window.localStorage.setItem('hskGeneralCheckState', 'done');
      setResult({ score, total, results });
      await onComplete?.();
    } finally {
      setLoading(false);
      setAdvancing(false);
    }
  };

  const answerQuestion = (choiceIndex, eventTimeStamp) => {
    if (!question || advancing || loading) return;
    const latencyMs = Math.max(0, eventTimeStamp - questionStartedAtRef.current);
    const nextAnswers = [...answers, { question_id: question.id, quiz_type: question.quiz_type, selected_index: choiceIndex, latency_ms: latencyMs }];
    setSelected(choiceIndex);
    setAdvancing(true);
    window.setTimeout(() => {
      if (index + 1 >= questions.length) {
        setAnswers(nextAnswers);
        submitGeneralCheck(nextAnswers);
        return;
      }
      setAnswers(nextAnswers);
      setIndex(prev => prev + 1);
      setSelected(null);
      setAdvancing(false);
      setAudioPlaying(false);
      setAudioPlayed(false);
    }, 220);
  };

  if (result) {
    const accuracy = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <main className="core-page page-enter">
        <section className="core-card result-card general-result-card">
          <span className="core-eyebrow">General Check</span>
          <h1>{accuracy >= 80 ? 'Nền tảng tốt' : accuracy >= 55 ? 'Cần ôn có chọn lọc' : 'Cần củng cố lại'}</h1>
          <p>Kết quả đã được đưa vào dữ liệu học để hệ thống đề xuất phần cần ôn.</p>
          <div className="result-summary">
            <strong>{accuracy}%</strong>
            <span>{result.score}/{result.total} câu đúng</span>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={onExit}><BarChart3 size={16} /> Xem đề xuất</button>
            <button className="btn-secondary" onClick={loadGeneralCheck}><Play size={16} /> Làm lại</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head general-check-head">
        <div>
          <span className="core-eyebrow">General Check</span>
          <h1>Kiểm tra tổng quát HSK {level}</h1>
          <p>Đề gồm từ vựng, nghe, hội thoại, đọc hiểu, dịch đoạn và điền từ. Kết quả dùng để chọn phần cần ôn.</p>
        </div>
        <button className="btn-secondary" onClick={onExit}>Bỏ qua</button>
      </section>

      {loading && !question && (
        <section className="core-card empty-state">
          <Loader2 size={24} className="spin" />
          <h2>Đang tạo đề tổng quát</h2>
          <p>Hệ thống đang trộn các dạng quiz trong HSK {level}.</p>
        </section>
      )}

      {!loading && !question && (
        <section className="core-card empty-state">
          <AlertCircle size={24} />
          <h2>Chưa tạo được đề</h2>
          <p>Hãy thử lại hoặc chọn một HSK khác.</p>
          <div className="result-actions">
            <button className="btn-primary" onClick={loadGeneralCheck}><Play size={16} /> Tạo lại</button>
            <button className="btn-secondary" onClick={onExit}>Bỏ qua</button>
          </div>
        </section>
      )}

      {question && (
        <section key={question.id} className={`core-card question-card ${advancing ? 'is-advancing' : ''}`} aria-live="polite">
          <div className="question-topline">
            <span>{questionType?.label || 'Đang kiểm tra'}</span>
            <strong>{index + 1}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          <h2>{question.prompt}</h2>
          {question.audio_text && (
            <div className={`audio-panel ${isListeningMode ? 'audio-panel--focus' : ''}`}>
              <div>
                <span className="core-eyebrow">Audio</span>
                <p>{audioPlaying ? 'Đang phát âm thanh...' : audioPlayed ? 'Có thể nghe lại trước khi chọn đáp án.' : 'Bấm nghe để phát âm thanh.'}</p>
                <VoiceMeta />
              </div>
              <div className="audio-actions">
                <button className="btn-secondary" onClick={() => playAudio(0.82)} disabled={audioPlaying}><Headphones size={16} /> Nghe lại</button>
                <button className="btn-secondary" onClick={() => playAudio(0.66)} disabled={audioPlaying}><Headphones size={16} /> Nghe chậm</button>
                <button className="btn-secondary" onClick={() => playAudio(0.58, 'chunk')} disabled={audioPlaying}><Headphones size={16} /> Từng cụm</button>
              </div>
            </div>
          )}
          <div className="option-grid">
            {question.options.map((option, optionIndex) => (
              <button
                key={`${question.id}-${option}`}
                className={`${selected === optionIndex ? 'selected' : ''} ${selected !== null && selected !== optionIndex ? 'muted-option' : ''}`}
                onClick={(event) => answerQuestion(optionIndex, event.timeStamp)}
                disabled={advancing || loading}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                {option}
              </button>
            ))}
          </div>
          <p className="auto-next-hint">Chọn đáp án để chuyển sang câu tiếp theo.</p>
        </section>
      )}
    </main>
  );
}

const CHINESE_CHAR_PATTERN = /[\u3400-\u9fff]/g;
const SENTENCE_PUNCTUATION_PATTERN = /[。！？!?]/;

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeExamples(card) {
  const rows = [];
  if (Array.isArray(card.examples)) {
    card.examples.forEach(example => {
      rows.push({
        cn: cleanText(example.cn || example.sentence_cn),
        pinyin: cleanText(example.pinyin || example.py || example.examplePinyin),
        vi: cleanText(example.vi || example.meaning_vi || example.sentence_vi),
      });
    });
  }
  rows.push({
    cn: cleanText(card.exampleSentence || card.example_cn || card.sentence_cn),
    pinyin: cleanText(card.examplePinyin || card.example_pinyin),
    vi: cleanText(card.exampleVi || card.example_vi || card.sentence_vi),
  });
  const seen = new Set();
  return rows
    .filter(item => item.cn || item.vi)
    .filter(item => {
      const key = `${item.cn}|${item.vi}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeCard(card) {
  const rawLevel = Number(card.hskLevel ?? card.level);
  const level = LEVELS.includes(rawLevel) ? rawLevel : null;
  const hanzi = cleanText(card.character || card.hanzi);
  const pinyin = cleanText(card.pinyin);
  const meaningVi = cleanText(card.meaning_vi || card.meaning);
  const examples = normalizeExamples(card);
  const sourceQuality = (Array.isArray(card.examples) && card.examples.length ? 3 : 0) + (examples.length ? 2 : 0) + (card.mnemonic ? 1 : 0);
  return {
    key: `${level || 'x'}-${hanzi}-${pinyin || 'no-pinyin'}`,
    id: card.id || `${level || 'x'}-${hanzi}`,
    hanzi,
    pinyin,
    meaning_vi: meaningVi,
    level,
    category: cleanText(card.category) || 'core',
    stroke_count: Number(card.strokeCount || card.stroke_count || 0),
    examples,
    example_cn: examples[0]?.cn || '',
    example_pinyin: examples[0]?.pinyin || '',
    example_vi: examples[0]?.vi || '',
    source_quality: sourceQuality,
  };
}

function isReliableVocabCard(card) {
  return Boolean(
    card.level
    && card.hanzi
    && card.pinyin
    && card.pinyin !== '...'
    && card.meaning_vi
    && card.meaning_vi !== 'Từ ghép'
  );
}

function vocabCardScore(card) {
  return card.source_quality + (card.examples.length * 3) + (card.example_cn ? 2 : 0) + (card.stroke_count ? 1 : 0);
}

function dedupeVocabCards(cards) {
  const byKey = new Map();
  cards.forEach(card => {
    const key = `${card.level}-${card.hanzi}`;
    const current = byKey.get(key);
    if (!current || vocabCardScore(card) > vocabCardScore(current)) byKey.set(key, card);
  });
  return [...byKey.values()].sort((a, b) => a.level - b.level || a.hanzi.localeCompare(b.hanzi, 'zh-Hans-CN'));
}

function normalizeChineseText(value) {
  return cleanText(value).replace(/[\s“”"'，,。！？!?]/g, '');
}

function countChineseChars(value) {
  return cleanText(value).match(CHINESE_CHAR_PATTERN)?.length || 0;
}

function getPracticeExample(word) {
  if (!word) return null;
  if (Array.isArray(word.examples) && word.examples.length) return word.examples[0];
  if (word.example_cn || word.example_vi) return { cn: word.example_cn || '', pinyin: word.example_pinyin || '', vi: word.example_vi || '' };
  return null;
}

function assessSentenceDraft(text, targetWord, targetWords = []) {
  const responseText = cleanText(text);
  const target = cleanText(targetWord?.hanzi || targetWord);
  const chineseCount = countChineseChars(responseText);
  const usedTarget = Boolean(target && responseText.includes(target));
  const usedWords = targetWords.filter(word => word?.hanzi && responseText.includes(word.hanzi));
  const chineseOnly = normalizeChineseText(responseText);
  const onlyTarget = Boolean(target && chineseOnly === target);
  const enoughContext = chineseCount >= Math.max(4, target.length + 2);
  const sentenceShape = SENTENCE_PUNCTUATION_PATTERN.test(responseText) || chineseCount >= Math.max(6, target.length + 4);
  const example = getPracticeExample(targetWord);
  const copiedExample = Boolean(example?.cn && normalizeChineseText(example.cn) === chineseOnly);
  const score = Math.min(100,
    (usedTarget ? 45 : 0)
    + (chineseCount ? 15 : 0)
    + (enoughContext ? 22 : 0)
    + (sentenceShape ? 10 : 0)
    + (usedWords.length > 1 ? 5 : 0)
    + (!/[A-Za-zÀ-ỹ]/.test(responseText) || chineseCount >= 4 ? 3 : 0)
  );
  let feedback;
  let errorTag = '';
  if (!responseText) {
    feedback = 'Nhập một câu tiếng Trung có từ mục tiêu.';
    errorTag = 'empty_output';
  } else if (!chineseCount) {
    feedback = 'Câu cần viết bằng chữ Hán, không phải pinyin hoặc tiếng Việt.';
    errorTag = 'script_error';
  } else if (!usedTarget) {
    feedback = `Chưa dùng từ mục tiêu “${target}”. Hãy đặt câu có chính xác từ này.`;
    errorTag = 'missing_target';
  } else if (onlyTarget || !enoughContext) {
    feedback = `Mới có “${target}”, chưa thành câu. Thêm chủ ngữ, hành động hoặc tình huống.`;
    errorTag = 'context_too_short';
  } else if (!sentenceShape) {
    feedback = `Đã dùng “${target}”, nhưng câu còn cụt. Thêm kết thúc câu hoặc ngữ cảnh rõ hơn.`;
    errorTag = 'sentence_shape';
  } else if (copiedExample) {
    feedback = `Câu đúng theo mẫu. Lần sau thử đổi chủ ngữ, thời gian hoặc tân ngữ để tự sản xuất câu.`;
  } else {
    feedback = `Ổn: câu có dùng “${target}” trong ngữ cảnh tiếng Trung rõ ràng.`;
  }
  const correct = usedTarget && chineseCount > 0 && enoughContext && sentenceShape && !onlyTarget;
  return {
    event_id: null,
    correct,
    score,
    target_word: target,
    used_target: usedTarget,
    used_words: usedWords.map(word => word.hanzi),
    production_score: score,
    feedback,
    errorTag,
    offline: true,
  };
}

function mergeProductionResult(remoteResult, localResult) {
  if (!localResult.correct) return localResult;
  const remoteScore = Number(remoteResult?.score ?? remoteResult?.production_score ?? localResult.score);
  const score = Math.min(100, Math.max(localResult.score, remoteScore));
  return {
    ...localResult,
    ...remoteResult,
    correct: Boolean(remoteResult?.correct ?? true) && localResult.correct,
    score,
    production_score: Number(remoteResult?.production_score ?? score),
    used_target: localResult.used_target,
    used_words: localResult.used_words,
    feedback: remoteResult?.feedback ? `${localResult.feedback} ${remoteResult.feedback}` : localResult.feedback,
    offline: Boolean(remoteResult?.offline),
  };
}

function VocabLibrary({ focusLevel, onPracticeWord }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState(focusLevel);
  const [selectedWord, setSelectedWord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    import('./vocab-loader').then(async mod => {
      const loaded = dedupeVocabCards((await mod.loadAllFlashcards()).map(normalizeCard).filter(isReliableVocabCard));
      if (alive) {
        setCards(loaded);
        setSelectedWord(loaded.find(item => item.level === focusLevel) || loaded[0] || null);
        setLoading(false);
      }
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [focusLevel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter(item => levelFilter === 'all' || Number(item.level) === Number(levelFilter))
      .filter(item => !q || [item.hanzi, item.pinyin, item.meaning_vi, item.category, item.example_cn, item.example_vi].join(' ').toLowerCase().includes(q))
      .slice(0, 80);
  }, [cards, levelFilter, query]);

  const visibleSelectedWord = useMemo(() => {
    if (!filtered.length) return selectedWord;
    return filtered.find(item => item.key === selectedWord?.key) || filtered[0];
  }, [filtered, selectedWord]);

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head vocab-head">
        <div>
          <span className="core-eyebrow">Vocabulary</span>
          <h1>Kho từ vựng</h1>
          <p>Từ vựng đã lọc bỏ mục giả, ưu tiên bản có ví dụ thật và nghĩa tiếng Việt rõ.</p>
        </div>
        <div className="vocab-controls">
          <span className="vocab-count">{filtered.length}/{cards.length} từ</span>
          <div className="search-box"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chữ, pinyin, nghĩa" /></div>
          <select value={levelFilter} onChange={event => setLevelFilter(event.target.value)}>
            <option value="all">Tất cả HSK</option>
            {LEVELS.map(item => <option key={item} value={item}>HSK {item}</option>)}
          </select>
        </div>
      </section>

      <section className="vocab-workspace">
        <div className="core-card vocab-list-panel">
          {loading && <div className="empty-inline"><Loader2 size={18} className="spin" /> Đang tải từ vựng</div>}
          {!loading && filtered.map(item => (
            <button key={item.key} className={visibleSelectedWord?.key === item.key ? 'active' : ''} onClick={() => setSelectedWord(item)}>
              <strong>{item.hanzi}</strong>
              <span>{item.pinyin}</span>
              <small>{item.meaning_vi}</small>
            </button>
          ))}
          {!loading && !filtered.length && <div className="empty-inline">Không có kết quả phù hợp.</div>}
        </div>

        <div className="core-card vocab-detail-panel">
          {visibleSelectedWord ? (
            <>
              <div className="vocab-detail-main">
                <div className="hanzi-hero">{visibleSelectedWord.hanzi}</div>
                <div>
                  <span className="core-eyebrow">HSK {visibleSelectedWord.level}</span>
                  <h2>{visibleSelectedWord.pinyin}</h2>
                  <p>{visibleSelectedWord.meaning_vi}</p>
                  <div className="metadata-strip vocab-metadata-strip">
                    <span><strong>{visibleSelectedWord.category}</strong><small>Loại từ</small></span>
                    <span><strong>{visibleSelectedWord.stroke_count || '-'}</strong><small>Nét</small></span>
                    <span><strong>{visibleSelectedWord.examples.length}</strong><small>Ví dụ</small></span>
                  </div>
                  {visibleSelectedWord.examples.length ? (
                    <div className="vocab-example-list">
                      {visibleSelectedWord.examples.slice(0, 3).map((example, index) => (
                        <blockquote key={`${visibleSelectedWord.key}-${index}`}>{example.cn}<small>{example.pinyin}{example.pinyin && example.vi ? ' · ' : ''}{example.vi}</small></blockquote>
                      ))}
                    </div>
                  ) : <blockquote>Chưa có ví dụ chuẩn cho mục này.<small>Ưu tiên luyện bằng câu tự đặt có ngữ cảnh.</small></blockquote>}
                  <div className="result-actions">
                    <button className="btn-secondary" type="button" onClick={() => speak(visibleSelectedWord.example_cn || visibleSelectedWord.hanzi, 0.82)}><Headphones size={16} /> Nghe</button>
                    <button className="btn-primary" type="button" onClick={() => onPracticeWord(visibleSelectedWord)}><Languages size={16} /> Luyện dùng</button>
                  </div>
                </div>
              </div>
              <HandwritingPad targetWord={visibleSelectedWord} />
            </>
          ) : <div className="empty-inline">Chọn một từ để xem chi tiết.</div>}
        </div>
      </section>
    </main>
  );
}

function HandwritingPad({ targetWord }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const canvasPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDraw = (event) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const point = canvasPoint(event);
    drawingRef.current = true;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b84b';
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const point = canvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="handwriting-panel">
      <div>
        <span className="core-eyebrow">Handwriting</span>
        <h3><PenTool size={18} /> {targetWord.hanzi}</h3>
      </div>
      <canvas ref={canvasRef} width="420" height="220" onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw} />
      <button className="btn-secondary" type="button" onClick={clear}><Eraser size={16} /> Xóa</button>
    </div>
  );
}

function buildApplyIntro(words) {
  const primary = words[0];
  const example = getPracticeExample(primary);
  if (!primary) return 'Chọn một từ trong kho từ vựng để luyện đặt câu.';
  if (example?.cn) return `Từ chính: ${primary.hanzi} (${primary.pinyin || primary.meaning_vi}). Mẫu đúng: ${example.cn}`;
  return `Từ chính: ${primary.hanzi} (${primary.pinyin || primary.meaning_vi}). Viết câu chữ Hán có chủ ngữ và ngữ cảnh, không chỉ nhập riêng từ.`;
}

function ApplyPractice({ todayPlan, selectedWord, onStartToday }) {
  const focusWords = todayPlan?.focusWords || EMPTY_WORDS;
  const fallbackWord = useMemo(() => selectedWord || focusWords[0] || { hanzi: '学习', pinyin: 'xue2 xi2', meaning_vi: 'học tập' }, [selectedWord, focusWords]);
  const targetWords = useMemo(() => [fallbackWord, ...focusWords]
    .filter(item => item?.hanzi)
    .filter((item, index, rows) => rows.findIndex(row => row.hanzi === item.hanzi) === index)
    .slice(0, 3), [fallbackWord, focusWords]);
  const targetKey = targetWords.map(item => item.hanzi).join('|');
  const primaryTarget = targetWords[0];
  const primaryExample = getPracticeExample(primaryTarget);
  const practicePlaceholder = primaryExample?.cn || `Nhập một câu tiếng Trung có “${primaryTarget?.hanzi || ''}”`;
  const [sentence, setSentence] = useState('');
  const [outputResult, setOutputResult] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: buildApplyIntro(targetWords) },
  ]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSentence('');
      setOutputResult(null);
      setMessages([{ role: 'assistant', text: buildApplyIntro(targetWords) }]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [targetKey, targetWords]);

  const submitSentence = async () => {
    const target = primaryTarget;
    const localResult = assessSentenceDraft(sentence, target, targetWords);
    if (!localResult.correct) {
      setOutputResult(localResult);
      return;
    }
    const result = await submitOutputEvent({ user_id: USER_ID, target_word: target.hanzi, response_text: sentence, prompt: `Use ${target.hanzi}` });
    setOutputResult(mergeProductionResult(result, localResult));
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const used = targetWords.filter(item => text.includes(item.hanzi)).map(item => item.hanzi);
    const alreadyUsed = targetWords.filter(word => messages.some(message => message.role === 'user' && message.text.includes(word.hanzi))).map(word => word.hanzi);
    const target = targetWords.find(item => used.includes(item.hanzi)) || targetWords.find(item => !alreadyUsed.includes(item.hanzi)) || primaryTarget;
    const assessment = assessSentenceDraft(text, target, targetWords);
    const remaining = targetWords.filter(item => !new Set([...alreadyUsed, ...used]).has(item.hanzi)).map(item => item.hanzi);
    const assistant = assessment.correct
      ? `${assessment.feedback}${remaining.length ? ` Lượt sau thử thêm “${remaining[0]}”.` : ' Đã dùng đủ nhóm từ mục tiêu.'}`
      : assessment.feedback;
    setMessages(current => [...current, { role: 'user', text }, { role: 'assistant', text: assistant }].slice(-12));
    setDraft('');
  };

  const usedTotal = targetWords.filter(word => messages.some(message => message.role === 'user' && message.text.includes(word.hanzi))).length;

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Apply</span>
        <h1>Luyện dùng từ</h1>
        <p>Chuyển từ nhận biết sang đặt câu và hội thoại có target words.</p>
      </section>

      <section className="apply-grid">
        <div className="core-card apply-panel">
          <div className="target-word-row">
            {targetWords.map(word => <span key={word.hanzi}><strong>{word.hanzi}</strong><small>{word.pinyin || word.meaning_vi}</small></span>)}
          </div>
          <h2>Đặt câu với “{primaryTarget?.hanzi}”</h2>
          <p>{primaryTarget?.meaning_vi}</p>
          {primaryExample?.cn && <blockquote>{primaryExample.cn}<small>{primaryExample.pinyin}{primaryExample.pinyin && primaryExample.vi ? ' · ' : ''}{primaryExample.vi}</small></blockquote>}
          <textarea className="practice-textarea" value={sentence} onChange={event => setSentence(event.target.value)} placeholder={practicePlaceholder} />
          <div className="result-actions">
            <button className="btn-primary" type="button" onClick={submitSentence} disabled={!sentence.trim()}><Send size={16} /> Chấm câu</button>
            <button className="btn-secondary" type="button" onClick={() => onStartToday(todayPlan)}><Play size={16} /> Vào phiên đầy đủ</button>
          </div>
          {outputResult && <div className={`feedback-panel ${outputResult.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}><p>{outputResult.feedback}</p><strong>Production {outputResult.score}%</strong></div>}
        </div>

        <div className="core-card chat-panel">
          <div className="chat-head"><span className="core-eyebrow">Target Chat</span><strong>{usedTotal}/{targetWords.length} target</strong></div>
          <div className="chat-log">
            {messages.map((message, index) => <p key={`${message.role}-${index}`} className={`chat-bubble chat-bubble--${message.role}`}>{message.text}</p>)}
          </div>
          <div className="chat-input-row">
            <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendMessage(); }} placeholder="Nhập câu tiếng Trung" />
            <button className="btn-primary" type="button" onClick={sendMessage}><Send size={16} /></button>
          </div>
        </div>
      </section>
    </main>
  );
}

function getInitialPlan() {
  try {
    return JSON.parse(window.localStorage.getItem('ifThenPlan')) || { cue: 'Sau bữa tối', time: '20:00', minutes: 5, muted: false };
  } catch {
    return { cue: 'Sau bữa tối', time: '20:00', minutes: 5, muted: false };
  }
}

function StudyPlan({ todayPlan }) {
  const [plan, setPlan] = useState(getInitialPlan);
  const [saved, setSaved] = useState(false);
  const reminderText = `${plan.time}: ${todayPlan?.dueCount || 3} mục đến hạn. ${plan.minutes} phút là đủ để giữ lịch ôn.`;

  const updatePlan = (patch) => {
    setPlan(current => ({ ...current, ...patch }));
    setSaved(false);
  };

  const savePlan = () => {
    window.localStorage.setItem('ifThenPlan', JSON.stringify(plan));
    window.localStorage.setItem('behaviorNudgeMuted', plan.muted ? '1' : '0');
    setSaved(true);
  };

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Plan</span>
        <h1>Kế hoạch học</h1>
        <p>Thiết lập if-then plan và nhắc học có lý do, không streak phạt.</p>
      </section>

      <section className="plan-grid">
        <div className="core-card plan-form">
          <label><span>Nếu</span><input value={plan.cue} onChange={event => updatePlan({ cue: event.target.value })} /></label>
          <label><span>Thì học lúc</span><input type="time" value={plan.time} onChange={event => updatePlan({ time: event.target.value })} /></label>
          <label><span>Số phút</span><input type="number" min="3" max="45" value={plan.minutes} onChange={event => updatePlan({ minutes: Number(event.target.value) })} /></label>
          <label className="toggle-row"><input type="checkbox" checked={plan.muted} onChange={event => updatePlan({ muted: event.target.checked })} /><span>Tắt nudge trên Today Queue</span></label>
          <button className="btn-primary" type="button" onClick={savePlan}><CalendarCheck size={16} /> Lưu kế hoạch</button>
        </div>

        <div className="core-card plan-preview">
          <span className="core-eyebrow">If-Then</span>
          <h2>Nếu {plan.cue.toLowerCase()}, thì học {plan.minutes} phút.</h2>
          <p>{reminderText}</p>
          <div className="metadata-strip">
            <span><strong>{todayPlan?.behaviorLabel || 'Duy trì'}</strong><small>Trạng thái</small></span>
            <span><strong>{todayPlan?.dueCount || 0}</strong><small>Đến hạn</small></span>
            <span><strong>{todayPlan?.newCount || 0}</strong><small>Từ mới</small></span>
          </div>
          {saved && <div className="feedback-panel feedback-panel--correct"><p>Đã lưu kế hoạch local.</p></div>}
        </div>
      </section>
    </main>
  );
}
function Progress({ stats, analytics, onStartRecommended }) {
  const accuracyLabel = stats.answered ? `${stats.accuracy}%` : 'Chưa có dữ liệu';
  const accuracyValue = stats.answered ? stats.accuracy : 0;
  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Progress</span>
        <h1>Tiến độ người học</h1>
        <p>Tổng hợp hiệu suất học, độ chính xác và nhóm kiến thức cần luyện thêm.</p>
      </section>
      <section className="core-card progress-panel">
        <div className="progress-ring" style={{ '--score': `${accuracyValue}%` }}>
          <strong>{accuracyLabel}</strong>
          <span>độ chính xác</span>
        </div>
        <div className="progress-copy">
          <span className="core-eyebrow">Recommendation</span>
          <h2>{stats.answered ? 'Giữ nhịp luyện ngắn, đều' : 'Bắt đầu bằng HSK 1'}</h2>
          <p>{stats.weak_words ? 'Ưu tiên câu hỏi từ vựng và đọc hiểu để củng cố nhóm còn yếu.' : 'Hoàn thành một phiên quiz để hệ thống có dữ liệu đề xuất chính xác hơn.'}</p>
        </div>
      </section>
      <AnalyticsPanel analytics={analytics} onStartRecommended={onStartRecommended} />

      <section className="core-stats-grid">
        <StatCard icon={Trophy} label="Memory" value={`${analytics?.memory_stability || 0}%`} tone="gold" />
        <StatCard icon={Headphones} label="Listening" value={`${analytics?.listening_readiness || 0}%`} tone="jade" />
        <StatCard icon={ScrollText} label="Context" value={`${analytics?.context_transfer || 0}%`} tone="blue" />
        <StatCard icon={Languages} label="Production" value={`${analytics?.production_readiness || 0}%`} tone="cinnabar" />
      </section>
    </main>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [level, setLevel] = useState(getInitialFocusLevel);
  const [quizType, setQuizType] = useState('vocab');
  const [quizLimit, setQuizLimit] = useState(10);
  const [quizStrategyHint, setQuizStrategyHint] = useState('targeted');
  const [selectedSessionMode, setSelectedSessionMode] = useState('standard');
  const [activeSessionPlan, setActiveSessionPlan] = useState(null);
  const [selectedPracticeWord, setSelectedPracticeWord] = useState(null);
  const [backendTodayPlan, setBackendTodayPlan] = useState(null);
  const [autoStartKey, setAutoStartKey] = useState(0);
  const [theme, setTheme] = useState(getInitialTheme);
  const [analytics, setAnalytics] = useState(null);
  const [generalCheckState, setGeneralCheckState] = useState(getInitialGeneralCheckState);
  const [generalCheckLevel, setGeneralCheckLevel] = useState(null);
  const [stats, setStats] = useState({ attempts: 0, answered: 0, accuracy: 0, mastery_label: 'Khởi động', weak_words: 0 });

  const refreshStats = useCallback(async () => {
    const [nextStats, nextAnalytics] = await Promise.all([getStats(USER_ID), getAnalytics(USER_ID)]);
    setStats(nextStats);
    setAnalytics(nextAnalytics);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => refreshStats(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStats]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#FBF9F6' : '#0b1117');
    window.localStorage.setItem('theme', theme);
    window.localStorage.setItem('themePaletteVersion', THEME_PALETTE_VERSION);
  }, [theme]);

  const currentTitle = useMemo(() => {
    if (generalCheckLevel) return `Kiểm tra HSK ${generalCheckLevel}`;
    if (activeTab === 'session') return 'Học hôm nay';
    return NAV.find(item => item.id === activeTab)?.label || 'Trang chính';
  }, [activeTab, generalCheckLevel]);
  const statusLabel = stats.offline ? 'Chế độ local' : 'Đồng bộ';
  const isDark = theme === 'dark';
  const localTodayPlan = useMemo(() => buildTodaySessionPlan({ analytics, stats, focusLevel: level, modeId: selectedSessionMode }), [analytics, stats, level, selectedSessionMode]);
  const todayPlan = useMemo(() => normalizeBackendTodayPlan(backendTodayPlan, localTodayPlan), [backendTodayPlan, localTodayPlan]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const plan = await getTodaySession({ userId: USER_ID, focusLevel: level, mode: selectedSessionMode });
        if (alive) setBackendTodayPlan(plan);
      } catch {
        if (alive) setBackendTodayPlan(null);
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [level, selectedSessionMode, analytics?.answered, analytics?.attempts]);

  const selectFocusLevel = (nextLevel) => {
    const numericLevel = Number(nextLevel);
    setLevel(numericLevel);
    if (FOCUS_LEVELS.includes(numericLevel)) {
      window.localStorage.setItem('hskFocusLevel', String(numericLevel));
    }
  };

  const openFocusedLessons = () => {
    setActiveTab('lessons');
  };

  const startQuizFlow = (next = {}) => {
    if (next.level) selectFocusLevel(next.level);
    if (next.quizType) setQuizType(next.quizType);
    setQuizStrategyHint(next.strategyMode || next.recommended_strategy || 'targeted');
    setQuizLimit(next.limit || 10);
    setActiveSessionPlan(null);
    setGeneralCheckLevel(null);
    setActiveTab('quiz');
    setAutoStartKey(prev => prev + 1);
  };

  const startRecommendedQuiz = (recommendation = analytics?.recommendation) => {
    startQuizFlow({
      level: recommendation?.level || level,
      quizType: recommendation?.quiz_type || 'vocab',
      strategyMode: recommendation?.recommended_strategy || 'targeted',
    });
  };

  const startTodaySession = (plan = todayPlan) => {
    markLearningSessionStarted();
    setGeneralCheckLevel(null);
    setActiveSessionPlan(plan || todayPlan);
    setActiveTab('session');
  };

  const closeLearningSession = () => {
    setActiveSessionPlan(null);
    setActiveTab('dashboard');
  };

  const openProgress = () => {
    setGeneralCheckLevel(null);
    setActiveTab('progress');
  };

  const practiceWord = (word) => {
    setSelectedPracticeWord(word);
    setGeneralCheckLevel(null);
    setActiveTab('apply');
  };

  const startGeneralCheck = (nextLevel = level) => {
    selectFocusLevel(nextLevel);
    setGeneralCheckLevel(Number(nextLevel));
    setActiveTab('dashboard');
  };

  const skipGeneralCheck = () => {
    window.localStorage.setItem('hskGeneralCheckState', 'skipped');
    setGeneralCheckState('skipped');
  };

  const completeGeneralCheck = async () => {
    window.localStorage.setItem('hskGeneralCheckState', 'done');
    setGeneralCheckState('done');
    await refreshStats();
  };

  const closeGeneralCheck = () => {
    if (!generalCheckState) {
      window.localStorage.setItem('hskGeneralCheckState', 'skipped');
      setGeneralCheckState('skipped');
    }
    setGeneralCheckLevel(null);
    setActiveTab('dashboard');
  };

  return (
    <div className="core-app">
      <aside className="core-sidebar">
        <div className="core-logo">中</div>
        {NAV.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={activeTab === item.id ? 'active' : ''} onClick={() => setActiveTab(item.id)} title={item.label}>
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>

      <section className="core-shell">
        <header className="core-topbar">
          <div>
          <span className="core-eyebrow">Chinese Learning Platform</span>
          <h2>{currentTitle}</h2>
        </div>
          <div className="topbar-actions">
            <span className="core-status">{statusLabel}</span>
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
              aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
              title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {generalCheckLevel && <GeneralCheck level={generalCheckLevel} onExit={closeGeneralCheck} onComplete={completeGeneralCheck} />}
        {!generalCheckLevel && activeTab === 'dashboard' && <Dashboard analytics={analytics} focusLevel={level} todayPlan={todayPlan} selectedSessionMode={selectedSessionMode} showFirstRun={Boolean(analytics && !generalCheckState && !stats.answered)} onSelectLevel={selectFocusLevel} onOpenLessons={openFocusedLessons} onStartGeneralCheck={startGeneralCheck} onSkipFirstRun={skipGeneralCheck} onStartRecommended={startRecommendedQuiz} onSelectSessionMode={setSelectedSessionMode} onStartToday={startTodaySession} onOpenProgress={openProgress} />}
        {!generalCheckLevel && activeTab === 'lessons' && <Lessons level={level} setLevel={selectFocusLevel} quizType={quizType} setQuizType={setQuizType} onStartQuiz={startQuizFlow} />}
        {!generalCheckLevel && activeTab === 'quiz' && <Quiz key={`${quizStrategyHint}-${autoStartKey}`} level={level} setLevel={selectFocusLevel} quizType={quizType} setQuizType={setQuizType} refreshStats={refreshStats} autoStartKey={autoStartKey} limit={quizLimit} strategyHint={quizStrategyHint} />}
        {!generalCheckLevel && activeTab === 'vocab' && <VocabLibrary focusLevel={level} onPracticeWord={practiceWord} />}
        {!generalCheckLevel && activeTab === 'apply' && <ApplyPractice todayPlan={todayPlan} selectedWord={selectedPracticeWord} onStartToday={startTodaySession} />}
        {!generalCheckLevel && activeTab === 'plan' && <StudyPlan todayPlan={todayPlan} />}
        {!generalCheckLevel && activeTab === 'session' && <LearningSession plan={activeSessionPlan || todayPlan} fallbackLevel={level} onExit={closeLearningSession} onComplete={refreshStats} />}
        {!generalCheckLevel && activeTab === 'progress' && <Progress stats={stats} analytics={analytics} onStartRecommended={startRecommendedQuiz} />}
      </section>
    </div>
  );
}
