import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BarChart3, Bell, BellOff, BookOpen, CalendarCheck, CheckCircle2, Clock3, Eraser, Headphones, Languages, LineChart, Loader2, MessageCircle, Mic, Moon, PenTool, Play, RotateCcw, Search, ScrollText, ShieldCheck, Sun, Wrench, XCircle } from 'lucide-react';
import { completeLearningSession, getAnalytics, getStats, getTodaySession, localLearningSession, localQuiz, recordLearningEvent, submitOutputEvent, submitQuiz } from './api-core';
import { markLearningSessionCompleted } from './behavior-engine';
import { assessPinyinInput, buildChineseLearningItems } from './chinese-learning-items';
import { buildTodaySessionPlan, markLearningSessionStarted, SESSION_MODES } from './learning-session-planner';
import { strategyFlags } from './strategy-flags';
import { bindSpeechUnlock, isSpeechUnlocked, preloadAudioIndex, resolveQuestionAudioText, speak, stopSpeech, unlockSpeech } from './speech.jsx';
import { AuthControls, AuthModalHost } from './auth-ui.jsx';
import { useAuth } from './auth-core';
import ErrorBoundary from './components/ErrorBoundary.jsx';
const CustomVocabInput = lazy(() => import('./components/CustomVocabInput.jsx'));
const PronunciationPractice = lazy(() => import('./components/PronunciationPractice.jsx'));
const VoiceChat = lazy(() => import('./components/VoiceChat.jsx'));
import { loadAllFlashcards } from './vocab-loader.js';
import { notificationPermission, requestNotificationPermission, scheduleDailyReminder, cancelReminder, showNotification } from './notifications.js';
import { resolveDecompositions } from './radicals-db.js';

// Module-level clock helper. Kept out of component scope so React's purity
// lint doesn't flag the (intentional) impure read inside event handlers.
const now = () => performance.now();

let globalDictionary = new Map();
loadAllFlashcards().then(cards => {
  cards.forEach(c => {
    if (c.character && !globalDictionary.has(c.character)) {
      globalDictionary.set(c.character, c);
    }
  });
});

function ClickableChineseText({ text, className = '' }) {
  const [activeIdx, setActiveIdx] = useState(null);

  if (!text) return null;

  return (
    <span className={`clickable-text ${className}`}>
      {text.split('').map((char, index) => {
        const card = globalDictionary.get(char);
        const hasDict = Boolean(card);
        return (
          <span
            key={index}
            className={`tap-char ${hasDict ? 'has-dict' : ''} ${activeIdx === index ? 'active' : ''}`}
            onClick={() => hasDict && setActiveIdx(prev => prev === index ? null : index)}
          >
            {char}
            {activeIdx === index && hasDict && (
              <span className="tap-tooltip" onClick={(e) => e.stopPropagation()}>
                <strong>{card.character}</strong>
                <em>{card.pinyin}</em>
                <small>{card.meaning}</small>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

const THEME_PALETTE_VERSION = 'modern-zen-v1';
const LEVELS = [1, 2, 3, 4, 5, 6];
const QUIZ_TYPES = [
  { id: 'vocab', label: 'Từ vựng', icon: BookOpen },
  { id: 'listening', label: 'Nghe', icon: Headphones },
  { id: 'reading', label: 'Đọc hiểu', icon: ScrollText },
  { id: 'translation', label: 'Dịch đoạn', icon: Languages },
  { id: 'cloze', label: 'Điền từ', icon: ScrollText },
  { id: 'drag_drop', label: 'Sắp xếp câu', icon: PenTool },
];
const FOCUS_LEVELS = [1, 2, 3, 4];
// drag_drop là bài sắp xếp token, chỉ render đúng trong Quiz. GeneralCheck là
// lưới trắc nghiệm thuần nên loại drag_drop ra (nếu không sẽ lộ đáp án ở
// option A + hiện chuỗi placeholder __drag_drop_dummy__).
const GENERAL_CHECK_TYPES = QUIZ_TYPES.map(type => type.id).filter(id => id !== 'drag_drop');
const GENERAL_CHECK_LIMIT = 2;

function quizTypeDescription(typeId) {
  if (typeId === 'vocab') return 'Nghĩa và chữ';
  if (typeId === 'listening') return 'Nghe câu chọn nghĩa';
  if (typeId === 'translation') return 'Dịch đoạn nói';
  if (typeId === 'cloze') return 'Chọn từ còn thiếu';
  if (typeId === 'drag_drop') return 'Sắp xếp từ thành câu';
  return 'Câu và ngữ cảnh';
}

// reading/translation hiển thị prompt dạng đoạn dài (căn trái, scroll) thay vì
// chữ Hán khổng lồ căn giữa.
function isPassagePrompt(quizType) {
  return quizType === 'reading' || quizType === 'translation';
}

const NAV = [
  { id: 'dashboard', label: 'Trang chính', icon: BarChart3 },
  { id: 'quiz', label: 'Luyện tập', icon: Play },
  { id: 'vocab', label: 'Từ vựng', icon: Search },
  { id: 'custom', label: 'Tự tạo', icon: PenTool },
  { id: 'speak', label: 'Phát âm', icon: Mic },
  // { id: 'voicechat', label: 'Hội thoại', icon: MessageCircle }, // tạm ẩn
  { id: 'plan', label: 'Kế hoạch', icon: CalendarCheck },
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

function QuizAudioPanel({ audioPlaying, audioPlayed, audioError, isListeningMode, playAudio }) {
  return (
    <div className={`audio-panel premium-audio-panel ${isListeningMode ? 'audio-panel--focus' : ''} ${audioError ? 'audio-panel--error' : ''}`}>
      <button className={`btn-primary audio-play-btn ${audioPlaying ? 'playing' : ''}`} type="button" onClick={() => playAudio(0.82)} disabled={audioPlaying}>
        <Headphones size={20} className={audioPlaying ? 'pulse-anim' : ''} />
        {audioPlaying ? 'Đang phát...' : audioPlayed ? 'Nghe lại' : 'Nghe'}
      </button>
      {audioError && <p className="audio-error-text">Không thể phát âm thanh. Hãy thử dùng tính năng Đọc AI.</p>}
    </div>
  );
}

function planTitleForState(state, mode) {
  if (state === 'returning') return 'Kích hoạt lại phản xạ';
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
    priority: item.priority ?? null,
    retrieval: item.retrieval || null,
    acquisition: item.acquisition || null,
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
    repairPlan: serverPlan.repair_plan || null,
    title: planTitleForState(serverPlan.behavior_state, mode),
    subtitle: serverPlan.behavior_state === 'returning'
      ? `Hệ thống đã gom sẵn các từ vựng HSK ${level} bạn dễ quên nhất để khởi động.`
      : `${serverPlan.behavior_label || fallbackPlan.behaviorLabel || 'Duy trì'}: ưu tiên ${quizTypeDescription(quizType)} HSK ${level}.`,
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

function shuffleItems(items) {
  const rows = [...items];
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [rows[index], rows[swapIndex]] = [rows[swapIndex], rows[index]];
  }
  return rows;
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
  
  // Tạo đường cong Bezier mượt mà cho biểu đồ xu hướng (Doc 7.2)
  let trendPath = '';
  let trendAreaPath = '';
  const trendPointsList = chartRows.map((item, index) => {
    const x = 12 + (index / maxIndex) * 176;
    const y = 90 - clampPercent(item.accuracy) * 0.72; // y chạy từ 18 (100%) đến 90 (0%)
    return { x, y, ...item };
  });

  if (trendPointsList.length > 0) {
    trendPath = `M ${trendPointsList[0].x} ${trendPointsList[0].y}`;
    for (let i = 0; i < trendPointsList.length - 1; i++) {
      const p0 = trendPointsList[i];
      const p1 = trendPointsList[i + 1];
      const cp1x = p0.x + 176 / (maxIndex * 3);
      const cp1y = p0.y;
      const cp2x = p1.x - 176 / (maxIndex * 3);
      const cp2y = p1.y;
      trendPath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    trendAreaPath = `${trendPath} L ${trendPointsList[trendPointsList.length - 1].x} 90 L ${trendPointsList[0].x} 90 Z`;
  }
  const bestType = typeRows.filter(item => item.answered > 0).sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakType = typeRows.filter(item => item.answered > 0).sort((a, b) => a.accuracy - b.accuracy)[0];
  // Readiness theo kỹ năng (doc 7.2): dashboard ưu tiên hiện độ sẵn sàng từng
  // năng lực thay vì chỉ accuracy tổng.
  const readinessRows = [
    { key: 'memory', label: 'Trí nhớ bền', value: clampPercent(analytics?.memory_stability) },
    { key: 'listening', label: 'Nghe', value: clampPercent(analytics?.listening_readiness) },
    { key: 'context', label: 'Ngữ cảnh', value: clampPercent(analytics?.context_transfer) },
    { key: 'production', label: 'Sản sinh', value: clampPercent(analytics?.production_readiness) },
  ];

  return (
    <section className="analytics-panel page-enter" aria-label="Phân tích dữ liệu người học">
      <div className="analytics-head">
        <div className="daily-progress-ring">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(var(--shadow-color), 0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--modern-zen-primary)" strokeWidth="6" strokeDasharray="175" strokeDashoffset={175 - (175 * Math.min(100, (eventCount / 50) * 100) / 100)} transform="rotate(-90 32 32)" strokeLinecap="round" />
            <text x="32" cy="36" textAnchor="middle" fill="var(--ink)" fontSize="14" fontWeight="800">{Math.round(Math.min(100, (eventCount / 50) * 100))}%</text>
          </svg>
        </div>
        <div>
          <h2>Nhìn lại phong độ của bạn</h2>
          <p className="hide-mobile">Hôm nay: Đã hoàn thành {eventCount}/50 thử thách.</p>
        </div>
        <div className="analytics-kpis">
          <span><strong>{analytics?.accuracy || 0}%</strong>Đúng</span>
          <span><strong>{dueCount}</strong>Ôn</span>
          <span className="hide-mobile"><strong>{confidenceAvg ? confidenceAvg.toFixed(1) : '-'}</strong>Tự tin</span>
          <span className="hide-mobile"><strong>{eventCount || analytics?.attempts || 0}</strong>Lượt</span>
        </div>
      </div>

      <div className="readiness-strip" aria-label="Độ sẵn sàng theo kỹ năng">
        {readinessRows.map(item => (
          <div key={item.key} className="readiness-cell" data-tone={skillTone(item.value)}>
            <span>{item.label}</span>
            <strong>{hasData ? `${item.value}%` : '-'}</strong>
            <div className="readiness-meter"><span style={{ width: `${item.value}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="analytics-main-chart">
          <div className="chart-title-row">
            <div>
              <span className="core-eyebrow">Skill Map</span>
              <h3>Hiệu suất theo dạng bài</h3>
            </div>
            <span className="metric-badge metric-badge--strong">{bestType ? `Điểm mạnh: Phản xạ ${bestType.label}` : 'Đang đo'}</span>
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
              <span className="metric-badge metric-badge--weak">{weakType ? `Cần chú ý: ${weakType.label} (chưa vững ngữ cảnh)` : 'Chưa có'}</span>
            </div>
            <svg className="trend-chart" viewBox="0 0 200 100" role="img" aria-label="Xu hướng độ chính xác">
              <defs>
                <linearGradient id="trendAreaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--jade)" stopOpacity="0" />
                </linearGradient>
                <filter id="glowFilter" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="var(--jade)" floodOpacity="0.4" />
                </filter>
              </defs>
              {/* Lưới tọa độ đẹp mắt dạng chấm mảnh */}
              <line x1="12" y1="18" x2="188" y2="18" stroke="rgba(var(--shadow-color, 0,0,0), 0.06)" strokeDasharray="3 3" />
              <line x1="12" y1="54" x2="188" y2="54" stroke="rgba(var(--shadow-color, 0,0,0), 0.06)" strokeDasharray="3 3" />
              <line x1="12" y1="90" x2="188" y2="90" stroke="rgba(var(--shadow-color, 0,0,0), 0.15)" strokeWidth="1.2" />
              
              {/* Vùng màu Gradient dưới đường cong */}
              {trendAreaPath && <path className="trend-area" d={trendAreaPath} />}
              
              {/* Đường cong xu hướng mượt mà có hiệu ứng phát sáng */}
              {trendPath && <path className="trend-line" d={trendPath} filter="url(#glowFilter)" fill="none" stroke="var(--jade)" strokeWidth="3.2" strokeLinecap="round" />}
              
              {/* Các điểm nút dữ liệu tương tác */}
              {trendPointsList.map((item, index) => (
                <g key={`${item.label}-${index}`} className="trend-dot-group">
                  <circle cx={item.x} cy={item.y} r="8" className="trend-dot-ring" />
                  <circle cx={item.x} cy={item.y} r="3.8" className="trend-dot" />
                </g>
              ))}
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
                    <strong data-empty={item.answered ? 'false' : 'true'} style={{ height: `${Math.max(8, value)}%` }} />
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
          <button className="btn-primary" onClick={() => onStartRecommended({ ...recommendation, recommended_strategy: recommendedStrategy })}><Play size={16} /> Thực chiến ngay</button>
        </div>
        <div className="recent-words-grid">
          <span className="core-eyebrow">Từ vựng vừa ôn</span>
          <div className="recent-chips">
            {(weakWords.length ? weakWords : recommendation.focus_words?.map(word => ({ hanzi: word, pinyin: '', meaning_vi: '', accuracy: 0 })) || []).slice(0, 6).map(item => (
              <div key={`${item.hanzi}-${item.pinyin}`} className="recent-word-chip">
                <strong>{item.hanzi}</strong>
                <TonedPinyin pinyin={item.pinyin} />
              </div>
            ))}
            {!weakWords.length && !recommendation.focus_words?.length && <span>Chưa có dữ liệu. Hãy học thêm.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
function LearningFocusPanel({ focusLevel, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun }) {
  return (
    <section className={`core-card focus-panel ${showFirstRun ? 'focus-panel--first' : ''}`}>
      <div className="focus-copy">
        <h1>{showFirstRun ? 'Chọn cấp HSK' : `Mục tiêu hiện tại: Chinh phục HSK ${focusLevel}`}</h1>
        <p className="hide-mobile">{showFirstRun ? 'Kiểm tra nhanh để xác định trình độ.' : 'Hệ thống đang tối ưu lộ trình dựa trên tiến độ thực tế của bạn.'}</p>
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
          <button className="btn-secondary" onClick={onOpenLessons}><Play size={16} /> {`Luyện tập HSK ${focusLevel}`}</button>
          {showFirstRun && <button className="btn-secondary" onClick={onSkipFirstRun}>Bỏ qua</button>}
        </div>
      </div>
    </section>
  );
}

function TodayQueuePanel({ plan, selectedMode, onSelectMode, onStartToday }) {
  const [nudgeMuted, setNudgeMuted] = useState(() => window.localStorage.getItem('behaviorNudgeMuted') === '1');
  if (!plan) return null;
  const mode = plan.mode;
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
          <h2>{plan.title}</h2>
          <p className="hide-mobile">{plan.subtitle}</p>
        </div>
        <div className="today-mode-stack" aria-label="Chọn thời lượng phiên học">
          {SESSION_MODES.map(item => (
            <button
              key={item.id}
              className={(selectedMode === item.id || (plan.forceMicro && mode.id === item.id)) ? 'active' : ''}
              type="button"
              onClick={() => onSelectMode(item.id)}
            >
              <strong>{item.pillTitle || item.label}</strong>
              <span>{item.pillSub || item.title}</span>
            </button>
          ))}
        </div>
      </div>

      {!nudgeMuted && plan.nudge && (
        <div className={`behavior-nudge behavior-nudge--${plan.behaviorState || 'maintenance'}`}>
          <div>
            <h3>{plan.behaviorLabel || 'Duy trì'}</h3>
            <p>{plan.nudge}</p>
          </div>
          <div className="behavior-nudge-meta hide-mobile">
            <span>{plan.behaviorReason || plan.reason}</span>
          </div>
          <button className="btn-secondary" type="button" onClick={muteNudge}><BellOff size={16} /> Tắt nhắc</button>
        </div>
      )}

      <div className="today-mission-grid">
        {missions.map(item => (
          <article key={item.key} className={`today-mission today-mission--${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p className="hide-mobile">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="today-queue-bottom">
        <div className="today-focus-words" aria-label="Từ trọng tâm">
          {focusWords.length ? focusWords.map(item => (
            <span key={`${item.hanzi}-${item.pinyin || 'focus'}`} title={item.retrieval ? `Bậc truy hồi L${item.retrieval.level}: ${item.retrieval.label}` : undefined}>
              <strong>{item.hanzi}</strong>
              <small>{item.pinyin || 'Cần gặp lại'}</small>
              {item.acquisition && (
                <em
                  className={`focus-word-stage focus-word-stage--${item.acquisition.stage.toLowerCase()}`}
                  title={`Mức thụ đắc: ${item.acquisition.label} (${item.acquisition.progress_to_next}% tới nấc kế)`}
                >
                  {item.acquisition.label}
                  <span className="focus-word-stage-bar" aria-hidden="true">
                    <span style={{ width: `${item.acquisition.progress_to_next}%` }} />
                  </span>
                </em>
              )}
              {item.retrieval && <em className="focus-word-rung">L{item.retrieval.level} · {item.retrieval.label}</em>}
            </span>
          )) : (
            <span>
              <strong>HSK {plan.level}</strong>
              <small>Tạo dữ liệu đầu tiên</small>
            </span>
          )}
        </div>
        <div className="today-actions">
          <div className="hide-mobile">
            <p>{mode.description}</p>
          </div>
          <div className="today-action-buttons">
            <button className="btn-secondary" type="button" onClick={startDueOnly}><ShieldCheck size={16} /> Xử lý từ đến hạn</button>
            <button className="btn-secondary" type="button" onClick={startRepairOnly}><Wrench size={16} /> Sửa lỗi ngay</button>
            <button className="btn-primary" type="button" onClick={() => onStartToday(plan)}><Play size={16} /> Bắt đầu phiên</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({ analytics, focusLevel, todayPlan, selectedSessionMode, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun, onStartRecommended, onSelectSessionMode, onStartToday }) {
  return (
    <main className="core-dashboard page-enter">
      <LearningFocusPanel
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
        />
      )}
      <AnalyticsPanel analytics={analytics} onStartRecommended={onStartRecommended} />
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
  const errorBreakdown = {};
  primary.filter(item => !item.correct && item.error_tag).forEach(item => {
    errorBreakdown[item.error_tag] = (errorBreakdown[item.error_tag] || 0) + 1;
  });
  const dominantError = Object.entries(errorBreakdown).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    lowConfidence,
    repairCount: repairs.length,
    repairSuccess,
    nextReviewCount: primary.filter(item => !item.correct || item.confidence <= 2).length,
    avgConfidence: total ? Number((confidenceTotal / total).toFixed(1)) : 0,
    dominantError: dominantError ? { tag: dominantError[0], count: dominantError[1] } : null,
  };
}

function Quiz({ level, setLevel, quizType, setQuizType, refreshStats, autoStartKey, limit = 10, strategyHint = 'targeted' }) {
  const { userId } = useAuth();
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
  const [audioError, setAudioError] = useState(false);
  const [dragOrder, setDragOrder] = useState([]);
  const [voiceDone, setVoiceDone] = useState(false);
  const answersRef = useRef([]);
  const questionStartedAtRef = useRef(0);
  const loadIdRef = useRef(0);

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
    setAudioError(false);
    setDragOrder([]);
    setVoiceDone(false);
    answersRef.current = [];
    stopSpeech();
  };

  const loadQuiz = useCallback(async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    setLoading(true);
    resetQuizState();
    try {
      const quizTypes = buildStrategyQuizTypes(quizType, strategyMode);
      const perTypeLimit = strategyMode === 'interleaved' ? Math.max(2, Math.ceil(limit / quizTypes.length)) : limit;
      // Dựng đề + session hoàn toàn ở local để khâu "chuẩn bị" tức thì, không phải
      // chờ backend cold-start (~20-30s) rồi mới rơi về local như trước.
      const started = localLearningSession({
        user_id: userId,
        session_type: `quiz_${strategyMode}`,
        behavior_state: strategyMode === 'repair' ? 'fragile' : 'maintenance',
        estimated_minutes: strategyMode === 'interleaved' ? 20 : 10,
        reason: strategy.detail,
      });
      const batches = await Promise.all(quizTypes.map(async type => {
        const data = await localQuiz({ user_id: userId, level, quiz_type: type, limit: perTypeLimit });
        return {
          quizType: type,
          questions: (data.questions || []).map(row => ({ ...row, quiz_type: row.quiz_type || type })),
        };
      }));
      // Người dùng đã bấm "Quay lại" trong lúc chờ — bỏ kết quả đến muộn.
      if (loadIdRef.current !== loadId) return;
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
      if (loadIdRef.current === loadId) setLoading(false);
    }
  }, [level, limit, quizType, strategy.detail, strategyMode]);

  // Hủy chờ tải (khi API treo): tăng loadId để bỏ response đến muộn, đưa người
  // dùng về màn chọn đề thay vì kẹt ở spinner.
  const cancelLoad = useCallback(() => {
    loadIdRef.current += 1;
    setLoading(false);
    resetQuizState();
  }, []);

  useEffect(() => {
    if (autoStartKey <= 0) return undefined;
    const timer = window.setTimeout(() => loadQuiz(), 0);
    return () => window.clearTimeout(timer);
  }, [autoStartKey, loadQuiz]);

  const questionAudioText = resolveQuestionAudioText(question);
  const showAudioPanel = Boolean(questionAudioText) || isListeningMode;

  const playAudio = useCallback((rate = 0.82, speechMode = null) => {
    const audioText = resolveQuestionAudioText(question);
    if (!audioText) {
      setAudioError(true);
      return;
    }
    unlockSpeech();
    setAudioPlaying(true);
    setAudioPlayed(true);
    setAudioError(false);
    const mode = speechMode || (activeQuizType === 'dialogue' ? 'dialogue' : 'sentence');
    speak(audioText, rate, (success) => {
      setAudioPlaying(false);
      setAudioError(!success);
    }, mode);
  }, [activeQuizType, question]);

  useEffect(() => {
    if (!question) return undefined;
    questionStartedAtRef.current = now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
      setAudioError(false);
    }, 0);
    if (!showAudioPanel || !isListeningMode || !isSpeechUnlocked()) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(activeQuizType === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [activeQuizType, isListeningMode, playAudio, question, showAudioPanel]);

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
      // Lưu tiến độ lên server. Kết quả đã tính xong từ dữ liệu local nên nếu
      // bước lưu thất bại (mất mạng / backend cold-start), vẫn phải hiện màn
      // kết quả — nếu không UI kẹt lại ở câu cuối, không thoát được.
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
            user_id: userId,
            level,
            quiz_type: type,
            session_id: session?.id,
            record_events: false,
            answers: rows,
          }, questionsByType.get(type) || [])
        )));
        if (session?.id && !session?.offline) {
          await completeLearningSession({ user_id: userId, session_id: session.id, summary });
        }
      } catch {
        /* lưu tiến độ thất bại — vẫn hiển thị kết quả local phía dưới */
      }
      // Không await: màn kết quả hiện ngay, số liệu cập nhật nền (refreshStats tự
      // bắt lỗi và degrade về local).
      refreshStats?.();
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
        user_id: userId,
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
    setDragOrder([]);
    setVoiceDone(false);
  };

  // ---- Drag-drop handlers ----
  const dragSegments = question?.metadata_json?.segments || [];
  const dragCorrectOrder = question?.metadata_json?.correct_order || [];

  const toggleDragToken = (tokenIndex) => {
    setDragOrder(prev => {
      if (prev.includes(tokenIndex)) {
        return prev.filter(i => i !== tokenIndex);
      }
      return [...prev, tokenIndex];
    });
  };

  const submitDragDrop = () => {
    if (dragOrder.length !== dragCorrectOrder.length) return;
    const userOrder = dragOrder.map(i => dragSegments[i]);
    const isCorrect = userOrder.every((token, i) => token === dragCorrectOrder[i]);
    setSelected(isCorrect ? 0 : 1);
    setPendingLatency(Math.max(0, now() - questionStartedAtRef.current));
    setTimeout(() => handleQuizAnswer(isCorrect), 300);
  };

  // Unified answer submission
  const handleQuizAnswer = async (directResult = null) => {
    if (!question || submitting) return;
    setSubmitting(true);
    try {
      const confidenceValue = directResult !== null ? (directResult ? 3 : 2) : null;
      const selectedIndex = directResult !== null ? (directResult ? 0 : 1) : selected;
      const review = await recordLearningEvent({
        user_id: userId,
        session_id: session?.id,
        question_id: question.id,
        selected_index: selectedIndex,
        confidence: confidenceValue,
        latency_ms: pendingLatency,
        item_type: sessionItemType(question, isRepair),
      }, question);
      const answerRecord = {
        question_id: question.id,
        quiz_type: activeQuizType,
        item_type: sessionItemType(question, isRepair),
        selected_index: selectedIndex,
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
      if (!isRepair && (!review.correct || (confidenceValue || 0) <= 2)) {
        queueRepairItem(review, selectedIndex, confidenceValue || 0);
      }
      setFeedback({ review, confidence: confidenceValue, selectedIndex });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const answerById = new Map(result.answers.map(row => [row.question_id, row]));
    return (
      <main className="core-page page-enter">
        <section className="core-card result-card session-result-card">
          <span className="core-eyebrow">Strategic Quiz Result</span>
          <h1>{result.accuracy >= 80 ? 'Nhớ chắc hơn' : result.accuracy >= 55 ? 'Đã sửa được nền' : 'Cần phiên phục hồi'}</h1>
          <ul className="result-narrative">
            <li><ShieldCheck size={16} /> Đã củng cố <strong>{result.correct}</strong> từ qua retrieval.</li>
            {result.repairCount > 0 && <li><Wrench size={16} /> Đã sửa <strong>{result.repairSuccess}/{result.repairCount}</strong> từ hay sai.</li>}
            {result.dominantError && <li><XCircle size={16} /> <strong>{result.dominantError.count}</strong> lỗi {errorTagLabel(result.dominantError.tag)} sẽ gặp lại sớm.</li>}
            {result.nextReviewCount > 0 ? <li><Clock3 size={16} /> <strong>{result.nextReviewCount}</strong> từ vào lịch ôn ngày mai.</li> : <li><Clock3 size={16} /> Không còn từ nào cần ôn gấp.</li>}
          </ul>
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
      {!question && !loading && (
        <>
          <section className="core-card core-section-head">
            <h1>Luyện tập</h1>
          </section>

          <section className="level-grid" aria-label="Chọn cấp HSK">
            {LEVELS.map(item => (
              <button key={item} type="button" className={`level-card ${level === item ? 'active' : ''}`} onClick={() => setLevel(item)}>
                <span>HSK</span>
                <strong>{item}</strong>
              </button>
            ))}
          </section>

          <section className="quiz-type-grid" aria-label="Chọn dạng bài">
            {QUIZ_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button key={type.id} type="button" className={`quiz-type-card ${quizType === type.id ? 'active' : ''}`} onClick={() => setQuizType(type.id)}>
                  <Icon size={22} />
                  <strong>{type.label}</strong>
                  <span className="hide-mobile">{quizTypeDescription(type.id)}</span>
                </button>
              );
            })}
          </section>

          <section className="quiz-strategy-grid" aria-label="Chọn chiến lược">
            {QUIZ_STRATEGY_MODES.map(mode => (
              <button key={mode.id} type="button" className={`core-card quiz-strategy-card ${strategyMode === mode.id ? 'active' : ''}`} onClick={() => setStrategyMode(mode.id)}>
                <span>{mode.label}</span>
                <strong className="hide-mobile">{mode.title}</strong>
                <small className="hide-mobile">{mode.detail}</small>
              </button>
            ))}
          </section>

          <section className="core-card lesson-start-card">
            <h2>HSK {level} · {selectedType?.label} · {strategy.label}</h2>
            <button className="btn-primary" type="button" onClick={loadQuiz}><Play size={16} /> Bắt đầu</button>
          </section>
        </>
      )}

      {loading && !question && (
        <section className="core-card empty-state">
          <Loader2 size={24} className="spin" />
          <h2>Đang tạo...</h2>
          <p>Nếu chờ quá lâu, máy chủ có thể đang khởi động lại.</p>
          <button className="btn-secondary" type="button" onClick={cancelLoad}>Quay lại</button>
        </section>
      )}

      {question && (
        <section key={item.id} className={`core-card question-card learning-question-card ${isRepair ? 'learning-question-card--repair' : ''}`} aria-live="polite">
          <div className="question-topline">
            <span>{isRepair ? 'Ôn lại' : questionType?.label || 'Câu hỏi'}</span>
            <strong>{index + 1}/{quizItems.length}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="quiz-strategy-strip hide-mobile">
            <span>{strategy.label}</span>
            <small>{answers.filter(row => !row.is_repair).length}/{primaryQuestions.length}</small>
          </div>
          {isRepair && (
            <div className="repair-notice">
              <Wrench size={18} />
              <span>Ôn lại câu này</span>
            </div>
          )}
          {activeQuizType === 'cloze' ? (
            <h2 className="cloze-prompt">
              {question.prompt.split(/_{2,}/).map((part, i, arr) => (
                <Fragment key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className={`cloze-blank ${selected !== null ? 'filled' : ''}`}>
                      {selected !== null ? question.options[selected] : ''}
                    </span>
                  )}
                </Fragment>
              ))}
            </h2>
          ) : activeQuizType === 'drag_drop' ? (
            <div className="drag-drop-prompt">
              <p className="drag-drop-label">Sắp xếp thành câu đúng</p>
              {question.metadata_json?.sentence_vi && (
                <p className="drag-drop-hint-vi">💬 {question.metadata_json.sentence_vi}</p>
              )}
            </div>
          ) : (
            <h2 className={isPassagePrompt(question.quiz_type) ? 'prompt--passage' : ''}>{isPassagePrompt(question.quiz_type) ? <ClickableChineseText text={question.prompt} /> : question.prompt}</h2>
          )}
          {showAudioPanel && (
            <QuizAudioPanel
              audioPlaying={audioPlaying}
              audioPlayed={audioPlayed}
              audioError={audioError}
              isListeningMode={isListeningMode}
              playAudio={playAudio}
            />
          )}
          {activeQuizType === 'drag_drop' && dragSegments.length > 0 ? (
            <div className="drag-drop-area">
              {/* Vùng câu trả lời — các chip đã chọn, phân cách bằng / */}
              <div className="drag-answer-zone">
                {dragOrder.length === 0 ? (
                  <span className="drag-hint">Bấm vào từ bên dưới để ghép câu…</span>
                ) : (
                  dragOrder.map((tokenIndex, pos) => (
                    <Fragment key={`ans-${pos}`}>
                      {pos > 0 && <span className="drag-slash">/</span>}
                      <button
                        className="drag-chip drag-chip--selected"
                        onClick={() => toggleDragToken(tokenIndex)}
                        title="Bấm để bỏ ra"
                      >
                        {dragSegments[tokenIndex]}
                      </button>
                    </Fragment>
                  ))
                )}
              </div>

              {/* Vùng nguồn — các chip chưa chọn, phân cách bằng / */}
              <div className="drag-source-zone">
                {dragSegments.map((token, i) => {
                  const used = dragOrder.includes(i);
                  return (
                    <Fragment key={`src-${i}`}>
                      {i > 0 && <span className={`drag-slash ${used ? 'drag-slash--faded' : ''}`}>/</span>}
                      <button
                        className={`drag-chip ${used ? 'drag-chip--used' : 'drag-chip--available'}`}
                        onClick={() => !used && toggleDragToken(i)}
                        disabled={used}
                        aria-label={used ? `${token} (đã chọn)` : `Chọn ${token}`}
                      >
                        {token}
                      </button>
                    </Fragment>
                  );
                })}
              </div>

              <div className="drag-drop-actions">
                {dragOrder.length > 0 && !feedback && (
                  <button
                    type="button"
                    className="btn-ghost drag-reset-btn"
                    onClick={() => setDragOrder([])}
                    disabled={submitting}
                  >
                    ↺ Đặt lại
                  </button>
                )}
                <button
                  className="btn-primary"
                  onClick={submitDragDrop}
                  disabled={dragOrder.length !== dragCorrectOrder.length || submitting || Boolean(feedback)}
                >
                  Kiểm tra
                </button>
              </div>
            </div>

          ) : activeQuizType === 'voice' ? (
            <div className="voice-area">
              <div className="voice-word-hero">{question.word?.hanzi || ''}</div>
              <TonedPinyin pinyin={question.word?.pinyin || ''} className="voice-pinyin" />
              {showAudioPanel && (
                <QuizAudioPanel
                  audioPlaying={audioPlaying}
                  audioPlayed={audioPlayed}
                  audioError={audioError}
                  isListeningMode={true}
                  playAudio={playAudio}
                />
              )}
              <p className="voice-meaning">{question.word?.meaning_vi || ''}</p>
              {!voiceDone && !feedback && (
                <div className="voice-rating-grid">
                  {question.options.map((option, optionIndex) => (
                    <button
                      key={option}
                      className={`voice-rating-btn ${optionIndex === 0 ? 'voice-rating-btn--done' : ''}`}
                      onClick={() => { setSelected(optionIndex); setTimeout(() => handleQuizAnswer(optionIndex === 0), 200); }}
                      disabled={submitting}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="option-grid">
              {question.options.map((option, optionIndex) => {
                const revealCorrect = feedback && optionIndex === feedback.review.correct_index;
                const revealWrong = feedback && !feedback.review.correct && optionIndex === selected && optionIndex !== feedback.review.correct_index;
                const isMuted = feedback
                  ? !revealCorrect && !revealWrong
                  : selected !== null && selected !== optionIndex;
                const optionClass = [
                  selected === optionIndex && !feedback ? 'selected' : '',
                  revealCorrect ? 'option-correct' : '',
                  revealWrong ? 'option-wrong' : '',
                  isMuted ? 'muted-option' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={`${question.id}-${optionIndex}`}
                    className={optionClass}
                    onClick={(event) => answerQuestion(optionIndex, event.timeStamp)}
                    disabled={selected !== null || submitting || Boolean(feedback) || loading}
                  >
                    <span>{revealCorrect ? '✓' : revealWrong ? '✕' : String.fromCharCode(65 + optionIndex)}</span>
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {selected !== null && !feedback && activeQuizType !== 'drag_drop' && activeQuizType !== 'voice' && (
            <div className="confidence-panel">
              <p className="confidence-label">Mức tự tin?</p>
              <div className="confidence-grid">
                {CONFIDENCE_LEVELS.map(row => (
                  <button key={row.value} type="button" onClick={() => chooseConfidence(row.value)} disabled={submitting} title={row.label}>
                    <strong>{row.value}</strong>
                    <span>{row.label}</span>
                    <small className="hide-mobile">{row.detail}</small>
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
                <span className="hide-mobile">{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              <p>{feedback.review.explanation || question.explanation || 'Đã ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && (
                <small>Đáp án: {
                  activeQuizType === 'drag_drop'
                    ? (question.metadata_json?.correct_order || []).join('')
                    : (question.options[feedback.review.correct_index] || '—')
                }</small>
              )}
              {!feedback.review.correct && errorTagLabel(feedback.review.error_tag) && (
                <div className="feedback-error-tag">
                  <em>{errorTagLabel(feedback.review.error_tag)}</em>
                  {errorTagHint(feedback.review.error_tag) && <small>{errorTagHint(feedback.review.error_tag)}</small>}
                </div>
              )}
              <WordEncodeCard word={question.word} />
              <button className="btn-primary" type="button" onClick={continueQuiz} disabled={loading}>{index + 1 >= quizItems.length ? 'Xong' : 'Tiếp'}</button>
            </div>
          )}
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

// Nhãn loại lỗi (doc 4.6/5.3): mỗi lỗi nói rõ "sai kiểu gì" + cách sửa ngắn.
const ERROR_TAG_INFO = {
  tone_error: { label: 'Lỗi thanh điệu', hint: 'Đúng âm nhưng sai thanh. Nghe lại cặp thanh tối thiểu.' },
  sound_error: { label: 'Lỗi phát âm', hint: 'Âm gần giống dễ lẫn. Nghe chậm và lặp lại.' },
  hanzi_error: { label: 'Lỗi mặt chữ', hint: 'Chữ trông giống nhau. So sánh bộ thủ để phân biệt.' },
  meaning_error: { label: 'Lỗi nghĩa', hint: 'Nhầm nghĩa. Xem lại ví dụ tương phản.' },
  context_error: { label: 'Lỗi ngữ cảnh', hint: 'Dùng sai tình huống. Luyện điền khuyết trong câu.' },
  production_error: { label: 'Lỗi sản sinh', hint: 'Đặt câu chưa đạt. Bám khung câu mẫu.' },
  speed_error: { label: 'Lỗi tốc độ', hint: 'Đúng nhưng chậm. Luyện vòng phản xạ nhanh.' },
  confidence_error: { label: 'Chưa chắc', hint: 'Đúng nhưng thiếu tự tin. Gặp lại sớm để củng cố.' },
};

function errorTagInfo(tag) {
  if (!tag) return null;
  if (ERROR_TAG_INFO[tag]) return ERROR_TAG_INFO[tag];
  // confusion_x_y từ sound taxonomy → gộp về lỗi phát âm.
  if (String(tag).startsWith('confusion_')) return ERROR_TAG_INFO.sound_error;
  return null;
}

function errorTagLabel(tag) {
  return errorTagInfo(tag)?.label || '';
}

function errorTagHint(tag) {
  return errorTagInfo(tag)?.hint || '';
}

// Tô màu thanh điệu theo dấu pinyin (doc 3.1: thanh điệu là khoá ghi nhớ).
// Phát hiện thanh qua dấu phụ trên nguyên âm, không cần số thanh.
const TONE_MARKS = {
  1: 'āēīōūǖĀĒĪŌŪǕ',
  2: 'áéíóúǘÁÉÍÓÚǗ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓǙ',
  4: 'àèìòùǜÀÈÌÒÙǛ',
};

function toneOfSyllable(syllable) {
  for (const ch of syllable) {
    for (const tone of [1, 2, 3, 4]) {
      if (TONE_MARKS[tone].includes(ch)) return tone;
    }
  }
  // Fallback: số thanh cuối âm tiết (vd "xue2") khi không có dấu phụ.
  const trailing = syllable.match(/[1-5](?!.*[1-5])/);
  if (trailing) return Number(trailing[0]);
  return 5; // không dấu → thanh nhẹ
}

// Nguyên âm có dấu thanh + nguyên âm trơn, dùng để dò ranh giới âm tiết.
const PINYIN_VOWELS = 'aeiouüvāēīōūǖáéíóúǘǎěǐǒǔǚàèìòùǜ';
const isPinyinVowel = (ch) => PINYIN_VOWELS.includes(ch.toLowerCase());

// Tách một token pinyin dính liền (vd "jīntiān") thành từng âm tiết.
// Âm tiết mới bắt đầu khi gặp phụ âm onset sau khi đã thấy nguyên âm,
// trừ các coda hợp lệ: n (khi không đứng trước nguyên âm), ng, r (erhua).
function splitPinyinToken(token) {
  const text = token.toLowerCase();
  const out = [];
  let cur = '';
  let sawVowel = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (isPinyinVowel(c)) {
      cur += c;
      sawVowel = true;
    } else if (!sawVowel) {
      cur += c; // phụ âm đầu (gồm cụm zh/ch/sh)
    } else if (c === 'n' && !(next && isPinyinVowel(next))) {
      cur += c; // n coda
    } else if (c === 'g' && cur.endsWith('n')) {
      cur += c; // ng coda
    } else if (c === 'r' && !(next && isPinyinVowel(next))) {
      cur += c; // r coda / erhua
    } else {
      if (cur) out.push(cur);
      cur = c;
      sawVowel = false;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function tonedPinyin(pinyin) {
  const text = cleanText(pinyin);
  if (!text) return [];
  // Tách theo khoảng trắng trước, rồi tách tiếp mỗi token dính liền.
  const syllables = text.split(/\s+/).flatMap(splitPinyinToken);
  return syllables.map((syllable, idx) => ({
    key: `${syllable}-${idx}`,
    text: syllable,
    tone: toneOfSyllable(syllable),
  }));
}

function TonedPinyin({ pinyin, className = '' }) {
  const syllables = tonedPinyin(pinyin);
  if (!syllables.length) return null;
  return (
    <span className={`toned-pinyin ${className}`} aria-label={pinyin}>
      {syllables.map(part => (
        <span key={part.key} className={`tone-${part.tone}`}>{part.text}</span>
      ))}
    </span>
  );
}

// Card ENCODE sau khi trả lời (doc 5.2 REVEAL→ENCODE): hiện hanzi lớn,
// pinyin tô màu thanh điệu, gợi ý bộ thủ và cặp dễ nhầm — biến khoảnh
// khắc phản hồi thành lúc ghi nhớ sâu, không chỉ báo đúng/sai.
function WordEncodeCard({ word }) {
  if (!word || !word.hanzi) return null;
  const confusables = Array.isArray(word.confusable_words) ? word.confusable_words.filter(Boolean) : [];
  return (
    <div className="word-encode-card">
      <div className="word-encode-hero">
        <span className="word-encode-hanzi">{word.hanzi}</span>
        <div className="word-encode-meta">
          <TonedPinyin pinyin={word.pinyin} className="word-encode-pinyin" />
          {word.meaning_vi && <span className="word-encode-meaning">{word.meaning_vi}</span>}
        </div>
      </div>
      {word.component_hint && (
        <p className="word-encode-hint">{word.character_family ? `${word.character_family} · ` : ''}{word.component_hint}</p>
      )}
      {confusables.length > 0 && (
        <div className="word-encode-confuse">
          <small>Dễ nhầm với</small>
          <span>{confusables.slice(0, 3).join(' / ')}</span>
        </div>
      )}
    </div>
  );
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
  const { userId } = useAuth();
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
  const [audioError, setAudioError] = useState(false);
  const answersRef = useRef([]);
  const finishedRef = useRef(false);
  const questionStartedAtRef = useRef(0);
  // Typing tracker: gom lỗi gõ thật (backspace/sửa/độ dài) để gửi usage signal.
  const typingRef = useRef({ keystrokes: 0, backspaces: 0, corrections: 0, prevLength: 0 });

  const resetTyping = useCallback(() => {
    typingRef.current = { keystrokes: 0, backspaces: 0, corrections: 0, prevLength: 0 };
  }, []);

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
      if (session?.id && !session?.offline) {
        await completeLearningSession({ user_id: userId, session_id: session.id, summary });
      }
      markLearningSessionCompleted({ ...summary, answers: answersRef.current });
      // Không await: refreshStats tự degrade về local, để màn hoàn thành hiện ngay
      // thay vì chờ backend cold-start.
      onComplete?.();
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
    resetTyping();
    setPracticeFeedback(null);
    setCompleted(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
    setAudioError(false);
    answersRef.current = [];
    finishedRef.current = false;
    stopSpeech();
    try {
      const started = plan?.source === 'custom' ? { id: plan.id, session_type: modeId, behavior_state: 'learning', estimated_minutes: 20 } : localLearningSession({
        user_id: userId,
        session_type: modeId,
        behavior_state: plan?.behaviorState || 'maintenance',
        estimated_minutes: sessionModeMinutes(plan?.mode),
        reason: plan?.reason || '',
      });
      const data = plan?.preloadedQuestions ? { questions: plan.preloadedQuestions } : await localQuiz({ user_id: userId, level, quiz_type: quizType, limit });
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
  }, [level, limit, modeId, plan, quizType, resetTyping]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadSession(), 0);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [loadSession]);

  const questionAudioText = resolveQuestionAudioText(question);
  const showAudioPanel = Boolean(questionAudioText) || isListeningMode;

  const playAudio = useCallback((rate = 0.82, speechMode = null) => {
    const audioText = resolveQuestionAudioText(question);
    if (!audioText) {
      setAudioError(true);
      return;
    }
    unlockSpeech();
    setAudioPlaying(true);
    setAudioPlayed(true);
    setAudioError(false);
    const mode = speechMode || (activeQuizType === 'dialogue' ? 'dialogue' : 'sentence');
    speak(audioText, rate, (success) => {
      setAudioPlaying(false);
      setAudioError(!success);
    }, mode);
  }, [activeQuizType, question]);

  useEffect(() => {
    if (!question) return undefined;
    questionStartedAtRef.current = now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
      setAudioError(false);
    }, 0);
    if (!showAudioPanel || !isListeningMode || !isSpeechUnlocked()) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(activeQuizType === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [activeQuizType, isListeningMode, playAudio, question, showAudioPanel]);

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
        user_id: userId,
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
    resetTyping();
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
            user_id: userId,
            session_id: session?.id,
            word_id: item.word?.word_id,
            target_word: item.word?.hanzi || '',
            prompt: item.prompt,
            response_text: textAnswer,
            typing_detail: { ...typingRef.current },
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

  // Theo dõi gõ: đếm phím + backspace + lần sửa (độ dài giảm) để đo usage signal.
  const trackTyping = event => {
    const next = event.target.value;
    const tracker = typingRef.current;
    const prevLength = tracker.prevLength || 0;
    tracker.keystrokes += 1;
    if (next.length < prevLength) {
      tracker.backspaces += 1;
      tracker.corrections += 1;
    }
    tracker.prevLength = next.length;
    setTextAnswer(next);
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
              <input className="practice-input" value={textAnswer} onChange={trackTyping} placeholder="Nhập pinyin" disabled={Boolean(practiceFeedback)} />
              {!practiceFeedback && <button className="btn-primary" type="button" onClick={submitPinyin} disabled={!textAnswer.trim() || submitting}>Kiểm tra</button>}
            </div>
          )}

          {item.type === 'micro_reading' && (
            <div className="practice-stack">
              <span className="core-eyebrow">Micro Reading</span>
              <h2><ClickableChineseText text={item.sentence_cn} /></h2>
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
              <textarea className="practice-textarea" value={textAnswer} onChange={trackTyping} placeholder={getPracticeExample(practiceWord)?.cn || `Nhập một câu tiếng Trung có “${practiceWord.hanzi}”`} disabled={Boolean(practiceFeedback)} />
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
            <span>{isRepair ? 'Ôn lại' : questionType?.label || 'Câu hỏi'}</span>
            <strong>{Math.min(index, questionItems.length)}/{questionItems.length}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          {isRepair && (
            <div className="repair-notice">
              <Wrench size={18} />
              <span>Ôn lại</span>
            </div>
          )}
          {activeQuizType === 'cloze' ? (
            <h2 className="cloze-prompt">
              {question.prompt.split(/_{2,}/).map((part, i, arr) => (
                <Fragment key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className={`cloze-blank ${selected !== null ? 'filled' : ''}`}>
                      {selected !== null ? question.options[selected] : ''}
                    </span>
                  )}
                </Fragment>
              ))}
            </h2>
          ) : (
            <h2 className={isPassagePrompt(activeQuizType) ? 'prompt--passage' : ''}>{isPassagePrompt(activeQuizType) ? <ClickableChineseText text={question.prompt} /> : question.prompt}</h2>
          )}
          {showAudioPanel && (
            <QuizAudioPanel
              audioPlaying={audioPlaying}
              audioPlayed={audioPlayed}
              audioError={audioError}
              isListeningMode={isListeningMode}
              playAudio={playAudio}
            />
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
              <p className="confidence-label">Mức tự tin?</p>
              <div className="confidence-grid">
                {CONFIDENCE_LEVELS.map(row => (
                  <button key={row.value} type="button" onClick={() => chooseConfidence(row.value)} disabled={submitting} title={row.label}>
                    <strong>{row.value}</strong>
                    <span>{row.label}</span>
                    <small className="hide-mobile">{row.detail}</small>
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
                <span className="hide-mobile">{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              <p>{feedback.review.explanation || question.explanation || 'Đã ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && <small>Đáp án: {question.options[feedback.review.correct_index] || '—'}</small>}
              {!feedback.review.correct && errorTagLabel(feedback.review.error_tag) && (
                <div className="feedback-error-tag">
                  <em>{errorTagLabel(feedback.review.error_tag)}</em>
                  {errorTagHint(feedback.review.error_tag) && <small>{errorTagHint(feedback.review.error_tag)}</small>}
                </div>
              )}
              <WordEncodeCard word={question.word} />
              <button className="btn-primary" type="button" onClick={continueSession} disabled={loading}>{index + 1 >= items.length ? 'Xong' : 'Tiếp'}</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function GeneralCheck({ level, onExit, onComplete }) {
  const { userId } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const questionStartedAtRef = useRef(0);

  const question = questions[index];
  const questionType = QUIZ_TYPES.find(type => type.id === question?.quiz_type);
  const isListeningMode = question?.quiz_type === 'listening' || question?.quiz_type === 'dialogue';
  const questionAudioText = resolveQuestionAudioText(question);
  const showAudioPanel = Boolean(questionAudioText) || isListeningMode;
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
    setAudioError(false);
    stopSpeech();
    try {
      const batches = await Promise.all(GENERAL_CHECK_TYPES.map(async quizType => {
        const data = await localQuiz({ user_id: userId, level, quiz_type: quizType, limit: GENERAL_CHECK_LIMIT });
        return (data.questions || []).map(item => ({ ...item, quiz_type: item.quiz_type || quizType }));
      }));
      const mixedQuestions = shuffleItems(batches.flat());
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
    const audioText = resolveQuestionAudioText(question);
    if (!audioText) {
      setAudioError(true);
      return;
    }
    unlockSpeech();
    setAudioPlaying(true);
    setAudioPlayed(true);
    setAudioError(false);
    const mode = speechMode || (question.quiz_type === 'dialogue' ? 'dialogue' : 'sentence');
    speak(audioText, rate, (success) => {
      setAudioPlaying(false);
      setAudioError(!success);
    }, mode);
  }, [question]);

  useEffect(() => {
    questionStartedAtRef.current = now();
    const resetTimer = window.setTimeout(() => {
      setAudioPlayed(false);
      setAudioPlaying(false);
      setAudioError(false);
    }, 0);
    if (!showAudioPanel || !isListeningMode || !isSpeechUnlocked()) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => playAudio(question.quiz_type === 'dialogue' ? 0.76 : 0.82), 280);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [question?.id, question?.quiz_type, isListeningMode, playAudio, showAudioPanel]);

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
        submitQuiz({ user_id: userId, level, quiz_type: quizType, answers: typeAnswers }, questionsByType.get(quizType) || [])
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
          {question.quiz_type === 'cloze' ? (
            <h2 className="cloze-prompt">
              {question.prompt.split(/_{2,}/).map((part, i, arr) => (
                <Fragment key={i}>
                  {part}
                  {i < arr.length - 1 && <span className="cloze-blank" />}
                </Fragment>
              ))}
            </h2>
          ) : (
            <h2 className={isPassagePrompt(question.quiz_type) ? 'prompt--passage' : ''}>{question.prompt}</h2>
          )}
          {showAudioPanel && (
            <QuizAudioPanel
              audioPlaying={audioPlaying}
              audioPlayed={audioPlayed}
              audioError={audioError}
              isListeningMode={isListeningMode}
              playAudio={playAudio}
            />
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

function normalizeRadicals(card) {
  const hanzi = cleanText(card.character || card.hanzi);
  const fallbackRadical = cleanText(card.radical || card.character_family);
  const resolved = resolveDecompositions(hanzi, fallbackRadical);
  
  const rows = Array.isArray(card.breakdown) ? card.breakdown : [];
  const mergedMap = new Map();
  
  resolved.forEach(item => {
    mergedMap.set(item.radical, item.meaning);
  });
  
  rows.forEach(item => {
    const rad = cleanText(item.radical || item.component || item.char);
    const mean = cleanText(item.meaning || item.hint || item.name);
    if (rad) {
      if (mean) {
        mergedMap.set(rad, mean);
      } else if (!mergedMap.has(rad)) {
        mergedMap.set(rad, '');
      }
    }
  });

  return Array.from(mergedMap.entries())
    .map(([radical, meaning]) => ({ radical, meaning }))
    .filter(item => item.radical || item.meaning);
}

function normalizeCard(card) {
  const rawLevel = Number(card.hskLevel ?? card.level);
  const level = LEVELS.includes(rawLevel) ? rawLevel : null;
  const hanzi = cleanText(card.character || card.hanzi);
  const pinyin = cleanText(card.pinyin);
  const meaningVi = cleanText(card.meaning_vi || card.meaning);
  const examples = normalizeExamples(card);
  const radicals = normalizeRadicals(card);
  const sourceQuality = (Array.isArray(card.examples) && card.examples.length ? 3 : 0) + (examples.length ? 2 : 0) + (radicals.length ? 2 : 0) + (card.mnemonic ? 1 : 0);
  return {
    key: `${level || 'x'}-${hanzi}-${pinyin || 'no-pinyin'}`,
    id: card.id || `${level || 'x'}-${hanzi}`,
    hanzi,
    pinyin,
    meaning_vi: meaningVi,
    level,
    category: cleanText(card.category) || 'core',
    stroke_count: Number(card.strokeCount || card.stroke_count || 0),
    radicals,
    mnemonic: cleanText(card.mnemonic),
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

function HanziWriterElement({ character, theme }) {
  const containerRef = useRef(null);
  const writerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !character) return;
    let cancelled = false;
    containerRef.current.innerHTML = '';

    // Zen theme colors matching current active theme (light or dark)
    const isDark = theme === 'dark';
    const strokeColor = isDark ? '#2DBA91' : '#127a5d'; // zen primary
    const radicalColor = isDark ? '#E8C17A' : '#d4a359'; // zen gold
    const outlineColor = isDark ? '#2E2B27' : '#EAE5DA'; // zen grid outline

    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled || !containerRef.current) return;
      const writer = HanziWriter.create(containerRef.current, character, {
        width: 120,
        height: 120,
        padding: 5,
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 220,
        strokeColor,
        radicalColor,
        outlineColor,
        showOutline: true
      });

      writer.animateCharacter();
      writerRef.current = writer;
    });

    return () => { cancelled = true; };
  }, [character, theme]);

  return (
    <div 
      ref={containerRef} 
      className="hanzi-writer-char" 
      onClick={() => writerRef.current?.animateCharacter()}
      title="Click để xem nét vẽ chuẩn"
    />
  );
}

function VocabLibrary({ focusLevel, theme }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState(focusLevel);
  const [selectedWord, setSelectedWord] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(false);
      import('./vocab-loader').then(async mod => {
        const loaded = dedupeVocabCards((await mod.loadAllFlashcards()).map(normalizeCard).filter(isReliableVocabCard));
        if (!alive) return;
        if (!loaded.length) throw new Error('empty');
        setCards(loaded);
        setLoading(false);
      }).catch(() => {
        if (alive) {
          setLoadError(true);
          setLoading(false);
        }
      });
    }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [focusLevel, reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter(item => levelFilter === 'all' || Number(item.level) === Number(levelFilter))
      .filter(item => !q || [item.hanzi, item.pinyin, item.meaning_vi, item.category, item.example_cn, item.example_vi, item.radicals.map(row => `${row.radical} ${row.meaning}`).join(' ')].join(' ').toLowerCase().includes(q))
      .slice(0, 80);
  }, [cards, levelFilter, query]);

  const selectWord = (word) => {
    setSelectedWord(word);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

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
          <div className="search-box">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chữ, pinyin, nghĩa..." />
          </div>
          <div className="vocab-hsk-tabs">
            <button type="button" className={levelFilter === 'all' ? 'active' : ''} onClick={() => setLevelFilter('all')}>Tất cả</button>
            {LEVELS.map(item => (
              <button key={item} type="button" className={Number(levelFilter) === item ? 'active' : ''} onClick={() => setLevelFilter(item)}>HSK {item}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="vocab-workspace">
        <div className="vocab-grid">
          {loading && <div className="empty-inline"><Loader2 size={18} className="spin" /> Đang tải từ vựng</div>}
          {!loading && loadError && (
            <div className="empty-inline vocab-load-error">
              <AlertCircle size={20} />
              <p>Không tải được kho từ vựng. Kiểm tra kết nối rồi thử lại.</p>
              <button type="button" className="btn-secondary" onClick={() => setReloadKey(k => k + 1)}>
                Thử lại
              </button>
            </div>
          )}
          {!loading && !loadError && filtered.map(item => (
            <button key={item.key} className={`vocab-card ${selectedWord?.key === item.key ? 'active' : ''}`} onClick={() => selectWord(item)}>
              <strong>{item.hanzi}</strong>
              <span>{item.pinyin}</span>
              <small>{item.meaning_vi}</small>
            </button>
          ))}
          {!loading && !loadError && !filtered.length && <div className="empty-inline">Không có kết quả phù hợp.</div>}
        </div>
      </section>

      {/* Slide-over Drawer & Backdrop */}
      {selectedWord && isDrawerOpen && (
        <>
          <div className="vocab-drawer-backdrop" onClick={closeDrawer} />
          <div className="vocab-drawer">
            <div className="vocab-drawer-header">
              <div>
                <span className="core-eyebrow">HSK {selectedWord.level}</span>
                <h2><TonedPinyin pinyin={selectedWord.pinyin} /></h2>
                <p>{selectedWord.meaning_vi}</p>
              </div>
              <button className="vocab-drawer-close" type="button" onClick={closeDrawer} aria-label="Đóng Drawer">
                &times;
              </button>
            </div>
            
            <div className="vocab-drawer-body">
              <div className="vocab-drawer-section">
                <div className="hanzi-hero">
                  {selectedWord.hanzi.split('').map((char, index) => (
                    <HanziWriterElement key={`${char}-${index}`} character={char} theme={theme} />
                  ))}
                </div>
              </div>

              <div className="vocab-drawer-section">
                <div className="metadata-strip vocab-metadata-strip">
                  <span><strong>{selectedWord.category}</strong><small>Loại từ</small></span>
                  <span><strong>{selectedWord.stroke_count || '-'}</strong><small>Nét</small></span>
                  <span><strong>{selectedWord.radicals.length || '-'}</strong><small>Bộ thủ</small></span>
                  <span><strong>{selectedWord.examples.length}</strong><small>Ví dụ</small></span>
                </div>
              </div>

              <div className="vocab-drawer-section">
                <span className="vocab-section-title">Bộ thủ & Thành phần</span>
                <div className="radical-strip" aria-label="Bộ thủ và thành phần chữ">
                  {selectedWord.radicals.length ? selectedWord.radicals.map((item, index) => (
                    <span key={`${selectedWord.key}-radical-${index}`}>
                      <strong>{item.radical}</strong>
                      <small>{item.meaning}</small>
                    </span>
                  )) : <span><strong>--</strong><small>Chưa có dữ liệu bộ thủ cho từ này.</small></span>}
                </div>
                {selectedWord.mnemonic && <p className="radical-note">{selectedWord.mnemonic}</p>}
              </div>

              <div className="vocab-drawer-section">
                <span className="vocab-section-title">Ví dụ mẫu</span>
                {selectedWord.examples.length ? (
                  <div className="vocab-example-list">
                    {selectedWord.examples.slice(0, 3).map((example, index) => (
                      <blockquote key={`${selectedWord.key}-${index}`}>
                        {example.cn}
                        <small>{example.pinyin}{example.pinyin && example.vi ? ' · ' : ''}{example.vi}</small>
                      </blockquote>
                    ))}
                  </div>
                ) : <blockquote>Chưa có ví dụ chuẩn cho mục này.<small>Ưu tiên luyện bằng câu tự đặt có ngữ cảnh.</small></blockquote>}
              </div>

              <div className="vocab-drawer-section">
                <div className="result-actions" style={{ marginTop: '14px', marginBottom: '24px' }}>
                  <button className="btn-secondary" type="button" onClick={() => speak(selectedWord.example_cn || selectedWord.hanzi, 0.82)}>Phát âm</button>
                </div>
              </div>

              <HandwritingPad targetWord={selectedWord} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function HandwritingPad({ targetWord }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(prepareCanvas, 0);
    window.addEventListener('resize', prepareCanvas);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', prepareCanvas);
    };
  }, [prepareCanvas]);

  const canvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDraw = (event) => {
    prepareCanvas();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const point = canvasPoint(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b84b';
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const point = canvasPoint(event);
    const last = lastPointRef.current || point;
    ctx.quadraticCurveTo(last.x, last.y, (last.x + point.x) / 2, (last.y + point.y) / 2);
    ctx.stroke();
    lastPointRef.current = point;
    event.preventDefault();
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.getContext('2d').clearRect(0, 0, rect.width, rect.height);
  };

  return (
    <div className="handwriting-panel">
      <div>
        <span className="core-eyebrow">Handwriting</span>
        <h3>Tập viết: {targetWord.hanzi}</h3>
      </div>
      <canvas ref={canvasRef} width="420" height="220" onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerLeave={endDraw} />
      <button className="btn-secondary" type="button" onClick={clear}>Xóa nét</button>
    </div>
  );
}

function getInitialPlan() {
  try {
    return JSON.parse(window.localStorage.getItem('ifThenPlan')) || { cue: 'Sau bữa tối', time: '20:00', minutes: 5, muted: false, notify: false };
  } catch {
    return { cue: 'Sau bữa tối', time: '20:00', minutes: 5, muted: false, notify: false };
  }
}

function StudyPlan({ todayPlan }) {
  const [plan, setPlan] = useState(getInitialPlan);
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState(() => notificationPermission());
  const reminderText = `${plan.time}: ${todayPlan?.dueCount || 3} mục đến hạn. ${plan.minutes} phút là đủ để giữ lịch ôn.`;
  const reminderBody = `Đến giờ học rồi. ${todayPlan?.dueCount || 3} mục đến hạn — ${plan.minutes} phút là đủ để giữ lịch ôn.`;

  const updatePlan = (patch) => {
    setPlan(current => ({ ...current, ...patch }));
    setSaved(false);
  };

  // Bật nhắc: xin quyền trước. Bị từ chối thì giữ tắt và để UI báo lại.
  const toggleNotify = async (next) => {
    if (!next) {
      updatePlan({ notify: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    updatePlan({ notify: result === 'granted' });
  };

  const savePlan = () => {
    window.localStorage.setItem('ifThenPlan', JSON.stringify(plan));
    window.localStorage.setItem('behaviorNudgeMuted', plan.muted ? '1' : '0');
    setSaved(true);
  };

  // Áp lịch nhắc mỗi khi plan đổi (chỉ khi đã bật & có quyền). Cleanup tự hủy
  // timer cũ để không bắn trùng.
  useEffect(() => {
    if (!plan.notify || permission !== 'granted') {
      cancelReminder();
      return undefined;
    }
    return scheduleDailyReminder({
      time: plan.time,
      title: 'Tezca · Nhắc học',
      body: reminderBody,
    });
  }, [plan.notify, plan.time, permission, reminderBody]);

  const denied = permission === 'denied';
  const unsupported = permission === 'unsupported';

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
          <label className="toggle-row">
            <input type="checkbox" checked={plan.notify} disabled={denied || unsupported} onChange={event => toggleNotify(event.target.checked)} />
            <span>Nhắc bằng thông báo trình duyệt lúc {plan.time}</span>
          </label>
          {denied && <p className="plan-notify-hint plan-notify-hint--warn">Trình duyệt đang chặn thông báo. Hãy bật lại quyền cho trang này trong cài đặt trình duyệt.</p>}
          {unsupported && <p className="plan-notify-hint plan-notify-hint--warn">Trình duyệt này không hỗ trợ thông báo.</p>}
          {plan.notify && !denied && <p className="plan-notify-hint">Thông báo chỉ hiện khi tab Tezca đang mở.</p>}
          <div className="plan-form-actions">
            <button className="btn-primary" type="button" onClick={savePlan}><CalendarCheck size={16} /> Lưu kế hoạch</button>
            <button className="btn-secondary" type="button" disabled={permission !== 'granted'} onClick={() => showNotification('Tezca · Thử thông báo', reminderBody)}><Bell size={16} /> Thử thông báo</button>
          </div>
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
          {saved && <div className="feedback-panel feedback-panel--correct"><p>Đã lưu kế hoạch local.{plan.notify ? ' Đã hẹn nhắc hằng ngày.' : ''}</p></div>}
        </div>
      </section>
    </main>
  );
}
export default function App() {
  const { userId } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [level, setLevel] = useState(getInitialFocusLevel);
  const [quizType, setQuizType] = useState('vocab');
  const [quizLimit, setQuizLimit] = useState(10);
  const [quizStrategyHint, setQuizStrategyHint] = useState('targeted');
  const [selectedSessionMode, setSelectedSessionMode] = useState('standard');
  const [activeSessionPlan, setActiveSessionPlan] = useState(null);
  const [backendTodayPlan, setBackendTodayPlan] = useState(null);
  const [autoStartKey, setAutoStartKey] = useState(0);
  const [theme, setTheme] = useState(getInitialTheme);
  const [analytics, setAnalytics] = useState(null);
  const [generalCheckState, setGeneralCheckState] = useState(getInitialGeneralCheckState);
  const [generalCheckLevel, setGeneralCheckLevel] = useState(null);
  const [stats, setStats] = useState({ attempts: 0, answered: 0, accuracy: 0, mastery_label: 'Khởi động', weak_words: 0 });

  useEffect(() => {
    const handleScroll = () => {
      document.documentElement.style.setProperty('--scroll-y', `${window.scrollY}px`);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const [nextStats, nextAnalytics] = await Promise.all([getStats(userId), getAnalytics(userId)]);
      setStats(nextStats);
      setAnalytics(nextAnalytics);
    } catch (err) {
      // getStats/getAnalytics đã tự degrade về local; nhánh này chỉ phòng reject
      // bất ngờ. Đặt analytics khác null để tab Tiến độ vẫn render (UI coi null là
      // "đang tải"), tránh kẹt ở trạng thái trống vô thời hạn.
      console.error('[refreshStats]', err);
      setAnalytics(current => current || { answered: 0, offline: true });
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => refreshStats(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStats]);

  useEffect(() => {
    const cleanup = bindSpeechUnlock();
    preloadAudioIndex();
    return cleanup;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#FBF9F6' : '#0a1626');
    window.localStorage.setItem('theme', theme);
    window.localStorage.setItem('themePaletteVersion', THEME_PALETTE_VERSION);
  }, [theme]);

  // Cursor-driven parallax: write small offsets to CSS vars (--px/--py) that
  // the immersive backdrop and cards read. Skipped when the user prefers
  // reduced motion or on coarse (touch) pointers.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const root = document.documentElement;
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarseMq = window.matchMedia('(pointer: coarse)');
    let frame = 0;
    let attached = false;
    const onMove = (event) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const dx = (event.clientX / window.innerWidth - 0.5) * 2;
        const dy = (event.clientY / window.innerHeight - 0.5) * 2;
        root.style.setProperty('--px', `${(dx * 14).toFixed(2)}px`);
        root.style.setProperty('--py', `${(dy * 14).toFixed(2)}px`);
      });
    };
    // Re-evaluate whenever the user toggles reduced-motion or swaps input type,
    // so parallax respects the live preference rather than only its value at mount.
    const sync = () => {
      const enable = !reduceMq.matches && !coarseMq.matches;
      if (enable && !attached) {
        window.addEventListener('pointermove', onMove, { passive: true });
        attached = true;
      } else if (!enable && attached) {
        window.removeEventListener('pointermove', onMove);
        attached = false;
        if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
        root.style.setProperty('--px', '0px');
        root.style.setProperty('--py', '0px');
      }
    };
    sync();
    reduceMq.addEventListener('change', sync);
    coarseMq.addEventListener('change', sync);
    return () => {
      reduceMq.removeEventListener('change', sync);
      coarseMq.removeEventListener('change', sync);
      if (attached) window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.setProperty('--px', '0px');
      root.style.setProperty('--py', '0px');
    };
  }, []);

  const currentTitle = useMemo(() => {
    if (generalCheckLevel) return `Kiểm tra HSK ${generalCheckLevel}`;
    if (activeTab === 'session') return 'Học hôm nay';
    return NAV.find(item => item.id === activeTab)?.label || 'Trang chính';
  }, [activeTab, generalCheckLevel]);
  const isDark = theme === 'dark';
  const localTodayPlan = useMemo(() => buildTodaySessionPlan({ analytics, stats, focusLevel: level, modeId: selectedSessionMode }), [analytics, stats, level, selectedSessionMode]);
  const todayPlan = useMemo(() => normalizeBackendTodayPlan(backendTodayPlan, localTodayPlan), [backendTodayPlan, localTodayPlan]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const plan = await getTodaySession({ userId, focusLevel: level, mode: selectedSessionMode, learningMode: 'hsk', topics: [] });
        if (alive) setBackendTodayPlan(plan);
      } catch {
        if (alive) setBackendTodayPlan(null);
      }
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [userId, level, selectedSessionMode, analytics?.answered, analytics?.attempts]);

  const selectFocusLevel = (nextLevel) => {
    const numericLevel = Number(nextLevel);
    setLevel(numericLevel);
    if (FOCUS_LEVELS.includes(numericLevel)) {
      window.localStorage.setItem('hskFocusLevel', String(numericLevel));
    }
  };

  const openFocusedLessons = () => {
    setActiveTab('quiz');
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

  const handleCustomSessionCreated = (questions, meta = {}) => {
    // Phiên "làm ngay" chạy trực tiếp từ bản nháp, không lưu DB. LearningSession
    // với source='custom' + id=null sẽ chấm điểm cục bộ (câu hỏi được đánh dấu
    // local) và bỏ qua bước complete phía server.
    markLearningSessionStarted();
    setActiveSessionPlan({
      id: null,
      source: 'custom',
      title: meta.title || 'Bài quiz tùy chỉnh',
      reason: 'Phiên tự tạo — chấm điểm ngay, không lưu.',
      mode: { id: 'standard' },
      action: { quizType: 'vocab' },
      preloadedQuestions: questions,
    });
    setActiveTab('session');
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
      <div className="immersive-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
        <span className="stream stream-1" />
        <span className="stream stream-2" />
        <span className="stream stream-3" />
        <span className="stream stream-4" />

        {/* Dragon & Phoenix Watermark Backdrop - Scroll Parallax */}
        <div className="mythical-art-bg" />
      </div>
      <aside className="core-sidebar">
        <div className="core-logo"><img src="/logo.jpg" alt="Logo" /></div>
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
            <h2>{currentTitle}</h2>
          </div>
          <div className="topbar-actions">
            <AuthControls />
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

        <ErrorBoundary key={generalCheckLevel ? 'general' : activeTab}>
          <Suspense fallback={<div className="tab-loading"><Loader2 className="spin" size={28} /></div>}>
          {generalCheckLevel && <GeneralCheck level={generalCheckLevel} onExit={closeGeneralCheck} onComplete={completeGeneralCheck} />}
          {!generalCheckLevel && activeTab === 'dashboard' && <Dashboard analytics={analytics} focusLevel={level} todayPlan={todayPlan} selectedSessionMode={selectedSessionMode} showFirstRun={Boolean(analytics && !generalCheckState && !stats.answered)} onSelectLevel={selectFocusLevel} onOpenLessons={openFocusedLessons} onStartGeneralCheck={startGeneralCheck} onSkipFirstRun={skipGeneralCheck} onStartRecommended={startRecommendedQuiz} onSelectSessionMode={setSelectedSessionMode} onStartToday={startTodaySession} />}
          {!generalCheckLevel && activeTab === 'quiz' && <Quiz key={`${quizStrategyHint}-${autoStartKey}`} level={level} setLevel={selectFocusLevel} quizType={quizType} setQuizType={setQuizType} refreshStats={refreshStats} autoStartKey={autoStartKey} limit={quizLimit} strategyHint={quizStrategyHint} />}
          {!generalCheckLevel && activeTab === 'vocab' && <VocabLibrary focusLevel={level} theme={theme} />}
          {!generalCheckLevel && activeTab === 'custom' && <CustomVocabInput onSessionCreated={handleCustomSessionCreated} />}
          {!generalCheckLevel && activeTab === 'speak' && <PronunciationPractice focusLevel={level} />}
          {/* {!generalCheckLevel && activeTab === 'voicechat' && <VoiceChat />} */}
          {!generalCheckLevel && activeTab === 'plan' && <StudyPlan todayPlan={todayPlan} />}
          {!generalCheckLevel && activeTab === 'session' && <LearningSession plan={activeSessionPlan || todayPlan} fallbackLevel={level} onExit={closeLearningSession} onComplete={refreshStats} />}
          </Suspense>
        </ErrorBoundary>
      </section>
      <AuthModalHost />
    </div>
  );
}
