import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, BarChart3, BellOff, Blocks, BookOpen, CheckCircle2, ChevronDown, Clock3, Ear, Fish, Flame, GitCompare, Headphones, Keyboard, Languages, Layers, LineChart, Loader2, MessageCircle, Mic, Moon, PenTool, Phone, Play, RotateCcw, Search, ScrollText, ShieldCheck, Sparkles, Sun, Trophy, TrendingUp, Wrench, X, XCircle } from 'lucide-react';
import { analyzeStudyData, completeLearningSession, getAnalytics, getStats, getTodaySession, localLearningSession, localQuiz, recordLearningEvent, submitOutputEvent, submitQuiz } from './api-core';
import { OrderingError, normalizeOrdering } from './ordering-contract.js';
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
const LiveCall = lazy(() => import('./components/LiveCall.jsx'));
const GrammarLab = lazy(() => import('./components/GrammarLab.jsx'));
const TranslationPractice = lazy(() => import('./components/TranslationPractice.jsx'));
const VocabTypingMode = lazy(() => import('./components/VocabTypingMode.jsx'));
const FlashcardMode = lazy(() => import('./components/FlashcardMode.jsx'));
const ConfusablePairs = lazy(() => import('./components/ConfusablePairs.jsx'));
const DictationMode = lazy(() => import('./components/DictationMode.jsx'));
// Game stays in the bundle but is intentionally unavailable while paused.
const GAME_ENABLED = false;
const MergeGame = GAME_ENABLED ? lazy(() => import('./components/MergeGame.jsx')) : null;
import { resolveDecompositions } from './radicals-db.js';
import { loadAllFlashcards } from './vocab-loader';
import { captureWordReview } from './srs-capture.js';
import { ClickableChineseText, TonedPinyin } from './components/chinese-text.jsx';
import HskLevelPicker from './components/HskLevelPicker.jsx';
import { primaryLevel, normalizeLevels, levelMatches, levelsLabel, readStoredLevels } from './hsk-levels.js';
import { StreakLeaderboard } from './components/StreakDisplay.jsx';
import { StreakHero } from './components/streak/StreakHero.jsx';
import { LeaderboardPodium } from './components/streak/LeaderboardPodium.jsx';
import { LeaderboardList } from './components/streak/LeaderboardList.jsx';
import { MyPositionBar } from './components/streak/MyPositionBar.jsx';
import { useStreakData } from './hooks/useStreakData.js';
import { useLeaderboard } from './hooks/useLeaderboard.js';

// Module-level clock helper. Kept out of component scope so React's purity
// lint doesn't flag the (intentional) impure read inside event handlers.
const now = () => performance.now();

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
  if (typeId === 'cloze') return 'Điền từ vào đoạn';
  if (typeId === 'drag_drop') return 'Sắp xếp từ thành câu';
  if (typeId === 'reading') return 'Đọc hiểu đoạn văn';
  return 'Câu và ngữ cảnh';
}

// reading/translation hiển thị prompt dạng đoạn dài (căn trái, scroll) thay vì
// chữ Hán khổng lồ căn giữa.
function isPassagePrompt(quizType) {
  return quizType === 'reading' || quizType === 'translation';
}

// ── Prompt dùng chung cho 3 màn trắc nghiệm (Quiz, LearningSession,
// GeneralCheck). Trước đây JSX được lặp 3 lần và phải sửa đồng bộ tay; gom
// vào 2 component để đổi một chỗ là cả 3 màn theo.

// 选词填空: đoạn văn có đúng MỘT `____` (chỗ đang hỏi), các chỗ còn lại đã được
// exam-items.js đổi thành （2）（3）… `filled` chỉ có ở màn cho xem đáp án đã chọn.
function ClozePrompt({ prompt, filledText = null, isPassage = false }) {
  return (
    <h2 className={`cloze-prompt${isPassage ? ' cloze-prompt--passage' : ''}`}>
      {String(prompt).split(/_{2,}/).map((part, i, arr) => (
        <Fragment key={i}>
          {part}
          {i < arr.length - 1 && (
            <span className={`cloze-blank ${filledText ? 'filled' : ''}`}>{filledText || ''}</span>
          )}
        </Fragment>
      ))}
    </h2>
  );
}

// 阅读理解: khi có metadata_json.stem thì tách đoạn văn (bấm được từng chữ) và
// câu hỏi tiếng Trung ra 2 khối. Không có stem → giữ hành vi cũ (prompt thuần).
function QuestionPrompt({ question, quizType, clickable = true }) {
  const type = quizType || question.quiz_type;
  const passage = question.metadata_json?.passage;
  const stem = question.metadata_json?.stem;
  if (type === 'reading' && passage && stem) {
    return (
      <>
        <h2 className="prompt--passage">
          {clickable ? <ClickableChineseText text={passage} /> : passage}
        </h2>
        <p className="reading-stem">{clickable ? <ClickableChineseText text={stem} /> : stem}</p>
      </>
    );
  }
  const asPassage = isPassagePrompt(type);
  return (
    <h2 className={asPassage ? 'prompt--passage' : ''}>
      {asPassage && clickable ? <ClickableChineseText text={question.prompt} /> : question.prompt}
    </h2>
  );
}

// Nav 2 cấp: mục standalone (không có `items`) + nhóm luồng giá trị (có `items`).
// `id` của từng view giữ nguyên như bản phẳng cũ vì setActiveTab dùng trực tiếp.
const NAV = [
  { id: 'dashboard', label: 'Trang chính', icon: BarChart3 },
  {
    id: 'group-hsk',
    label: 'Luyện thi HSK',
    icon: Play,
    items: [
      { id: 'quiz', label: 'Luyện tập', icon: Play },
      { id: 'grammar', label: 'Ngữ pháp', icon: Blocks },
      // id 'translate' chứ không 'translation': 'translation' đã là một QuizType
      // (dạng trắc nghiệm "Dịch đoạn" bên trong Quiz), trùng id sẽ gây nhầm khi
      // đọc code và khi ghi log theo tab.
      { id: 'translate', label: 'Dịch câu', icon: Languages },
      { id: 'dictation', label: 'Nghe viết', icon: Ear },
    ],
  },
  {
    id: 'group-speak',
    label: 'Phát âm AI',
    icon: Mic,
    items: [
      { id: 'speak', label: 'Phát âm', icon: Mic },
      { id: 'voicechat', label: 'Hội thoại', icon: MessageCircle },
      { id: 'livecall', label: 'Gọi điện', icon: Phone },
    ],
  },
  {
    id: 'group-vocab',
    label: 'Từ vựng',
    icon: Search,
    items: [
      { id: 'vocab', label: 'Từ vựng', icon: Search },
      { id: 'flashcard', label: 'Ôn thẻ', icon: Layers },
      { id: 'vocab-typing', label: 'Gõ từ vựng', icon: Keyboard },
      { id: 'confusable', label: 'Dễ nhầm', icon: GitCompare },
      { id: 'custom', label: 'Tự tạo', icon: PenTool },
    ],
  },
  { id: 'plan', label: 'Streak', icon: Flame },
  ...(GAME_ENABLED ? [{ id: 'merge-game', label: 'Ghép chữ', icon: Fish }] : []),
];

// Danh sách phẳng để tra cứu label theo view id (tiêu đề topbar).
const NAV_VIEWS = NAV.flatMap(entry => (entry.items ? entry.items : [entry]));

// view id -> label nhóm cha, dùng cho dòng eyebrow trên topbar (view lẻ thì null).
const NAV_PARENT_LABEL = NAV.reduce((acc, entry) => {
  if (entry.items) entry.items.forEach(item => { acc[item.id] = entry.label; });
  return acc;
}, {});

function SidebarNav({ activeTab, onSelect }) {
  // Chỉ lưu lựa chọn mở/đóng do người dùng bấm tay trên desktop.
  const [groupOverrides, setGroupOverrides] = useState({});
  const [mobileSheetGroup, setMobileSheetGroup] = useState(null);

  // Đóng sheet khi ấn Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileSheetGroup(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleGroup = (groupId, currentlyExpanded, groupEntry) => {
    // Trên điện thoại (<= 860px), nếu bấm vào nhóm:
    // - Chưa ở trong nhóm: chuyển thẳng vào mục đầu tiên của nhóm
    // - Đang ở trong nhóm: mở Bottom Sheet để chọn chế độ khác
    if (typeof window !== 'undefined' && window.innerWidth <= 860 && groupEntry?.items) {
      const hasActiveChild = groupEntry.items.some(item => item.id === activeTab);
      if (!hasActiveChild) {
        onSelect(groupEntry.items[0].id);
      } else {
        setMobileSheetGroup(prev => prev === groupId ? null : groupId);
      }
      return;
    }
    setGroupOverrides(prev => ({ ...prev, [groupId]: !currentlyExpanded }));
  };

  const activeGroup = mobileSheetGroup ? NAV.find(g => g.id === mobileSheetGroup) : null;

  return (
    <>
      <nav className="sh-nav" aria-label="Điều hướng chính">
        {NAV.map(entry => {
          const Icon = entry.icon;

          if (!entry.items) {
            return (
              <button
                key={entry.id}
                type="button"
                className={`sh-item${activeTab === entry.id ? ' is-active' : ''}`}
                onClick={() => {
                  setMobileSheetGroup(null);
                  onSelect(entry.id);
                }}
                title={entry.label}
              >
                <Icon size={18} strokeWidth={1.5} className="sh-item-icon" />
                <span className="sh-item-text">{entry.label}</span>
              </button>
            );
          }

          // Nhóm chỉ có 1 view => hành xử như mục thường, không có submenu.
          if (entry.items.length === 1) {
            const only = entry.items[0];
            return (
              <button
                key={entry.id}
                type="button"
                className={`sh-item${activeTab === only.id ? ' is-active' : ''}`}
                onClick={() => {
                  setMobileSheetGroup(null);
                  onSelect(only.id);
                }}
                title={entry.label}
              >
                <Icon size={18} strokeWidth={1.5} className="sh-item-icon" />
                <span className="sh-item-text">{entry.label}</span>
              </button>
            );
          }

          const hasActiveChild = entry.items.some(item => item.id === activeTab);
          const override = groupOverrides[entry.id];
          const expanded = override === undefined ? hasActiveChild : override;
          const submenuId = `nav-submenu-${entry.id}`;

          return (
            <div key={entry.id} className={`sh-group${hasActiveChild ? ' has-active' : ''}`}>
              <button
                type="button"
                className={`sh-item sh-group-toggle${hasActiveChild ? ' is-active' : ''}`}
                aria-expanded={expanded}
                aria-controls={submenuId}
                onClick={() => toggleGroup(entry.id, expanded, entry)}
                title={entry.label}
              >
                <Icon size={18} strokeWidth={1.5} className="sh-item-icon" />
                <span className="sh-item-text">{entry.label}</span>
                {/* Số mục con là dữ liệu thật, dùng mono để cột chữ số không nhảy. */}
                <span className="sh-count" aria-hidden="true">{String(entry.items.length).padStart(2, '0')}</span>
                <ChevronDown size={14} strokeWidth={1.5} className={`sh-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true" />
              </button>
              <div className="sh-sub" id={submenuId} role="group" aria-label={entry.label} hidden={!expanded}>
                {entry.items.map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sh-item sh-subitem${activeTab === item.id ? ' is-active' : ''}`}
                      onClick={() => onSelect(item.id)}
                      title={item.label}
                    >
                      <ItemIcon size={16} strokeWidth={1.5} className="sh-item-icon" />
                      <span className="sh-item-text">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Mobile Drawer / Bottom Sheet cho submenu */}
      {activeGroup && activeGroup.items && (
        <div className="sh-sheet-container">
          <div
            className="sh-sheet-backdrop"
            onClick={() => setMobileSheetGroup(null)}
            aria-hidden="true"
          />
          <div
            className="sh-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={activeGroup.label}
          >
            <div className="sh-sheet-handle" />
            <div className="sh-sheet-header">
              <div className="sh-sheet-title">
                <activeGroup.icon size={20} className="sh-sheet-icon" />
                <div>
                  <h3>{activeGroup.label}</h3>
                  <p>Chọn phân mục bạn muốn luyện tập</p>
                </div>
              </div>
              <button
                type="button"
                className="sh-sheet-close"
                onClick={() => setMobileSheetGroup(null)}
                aria-label="Đóng bảng điều hướng"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sh-sheet-list">
              {activeGroup.items.map(item => {
                const ItemIcon = item.icon;
                const isItemActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sh-sheet-item${isItemActive ? ' is-active' : ''}`}
                    onClick={() => {
                      onSelect(item.id);
                      setMobileSheetGroup(null);
                    }}
                  >
                    <div className="sh-sheet-item-icon">
                      <ItemIcon size={20} strokeWidth={1.75} />
                    </div>
                    <div className="sh-sheet-item-info">
                      <span className="sh-sheet-item-label">{item.label}</span>
                    </div>
                    {isItemActive && <span className="sh-sheet-item-badge">Đang mở</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  if (window.localStorage.getItem('themePaletteVersion') !== THEME_PALETTE_VERSION) return 'light';
  const savedTheme = window.localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return 'light';
}
// Selection HSK dùng chung toàn app = MẢNG số. Đọc localStorage chấp nhận cả
// định dạng cũ (số đơn "2") lẫn mảng JSON mới ([2,3]) qua readStoredLevels.
// Rỗng => fallback [1] để luôn có ít nhất một cấp.
function getInitialFocusLevels() {
  if (typeof window === 'undefined') return [1];
  const stored = readStoredLevels(window.localStorage.getItem('hskFocusLevel'));
  return stored.length ? stored : [1];
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
  if (value === null) return 'unavailable';
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
  const { userId } = useAuth();
  // AI chỉ dùng lịch sử từ máy chủ, không phân tích dữ liệu local chưa đồng bộ.
  const aiAvailable = Boolean(analytics) && !analytics.offline && !analytics.backend_empty;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState(null);
  const [focusedTrendIndex, setFocusedTrendIndex] = useState(null);

  const runAiAnalysis = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await analyzeStudyData(userId);
      setAiResult(result);
    } catch {
      setAiError('AI phân tích tạm thời không khả dụng, thử lại sau.');
    } finally {
      setAiLoading(false);
    }
  };

  const recommendation = analytics?.recommendation || { level: 1, quiz_type: 'vocab', title: 'HSK 1 · Từ vựng', reason: 'Chưa đủ dữ liệu, nên bắt đầu bằng từ vựng HSK 1 để tạo đường chuẩn.', focus_words: [], recommended_strategy: 'targeted' };
  const recommendedStrategy = recommendation.recommended_strategy || 'targeted';
  const hasData = (analytics?.answered || 0) > 0;
  const numericMetric = value => (
    value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
      ? null
      : Number(value)
  );
  const percentMetric = value => (
    hasData && numericMetric(value) !== null ? clampPercent(value) : null
  );
  const eventCount = numericMetric(analytics?.event_count);
  const dueCount = numericMetric(analytics?.due_count);
  const confidenceAvg = numericMetric(analytics?.confidence_avg);
  const latencyAvg = numericMetric(analytics?.latency_avg_ms);
  const accuracy = hasData ? numericMetric(analytics?.accuracy) : null;
  const attemptCount = hasData ? (eventCount ?? numericMetric(analytics?.attempts)) : null;
  const completionPercent = hasData && eventCount !== null
    ? Math.round(Math.min(100, (eventCount / 50) * 100))
    : null;
  const latencyLabel = latencyAvg !== null && latencyAvg > 0
    ? (latencyAvg < 1000 ? 'Dưới 1s phản hồi' : Math.round(latencyAvg / 1000) + 's phản hồi')
    : 'Chưa đo latency';
  const typeRows = analytics?.type_breakdown?.length
    ? analytics.type_breakdown
    : QUIZ_TYPES.map(type => ({ quiz_type: type.id, label: type.label, attempts: 0, answered: 0, correct: 0, accuracy: 0 }));
  const levelRows = analytics?.level_breakdown?.length
    ? analytics.level_breakdown
    : LEVELS.map(item => ({ level: item, attempts: 0, answered: 0, correct: 0, accuracy: 0 }));
  const trendRows = Array.isArray(analytics?.recent_trend) ? analytics.recent_trend : [];
  const weakWords = analytics?.weak_word_list || [];
  const analyticsState = !analytics
    ? { tone: 'loading', label: 'Đang tải dữ liệu học', detail: 'Đang đồng bộ tiến độ và kế hoạch của bạn.' }
    : analytics.backend_empty
      ? { tone: 'backend-empty', label: 'Dữ liệu cục bộ chưa đồng bộ', detail: 'Máy chủ chưa có bản ghi mới hơn, nên số liệu hiện tại có thể đến từ thiết bị này.' }
      : analytics.offline
        ? { tone: 'offline', label: 'Đang dùng dữ liệu trên thiết bị', detail: 'Tiến độ cục bộ vẫn hiển thị; AI tạm thời không khả dụng.' }
        : !hasData
          ? { tone: 'empty', label: 'Chưa có lịch sử học', detail: 'Hoàn thành một phiên để bắt đầu thấy các chỉ số thật.' }
          : null;
  const chartRows = trendRows.filter(item => item && typeof item === 'object' && numericMetric(item.accuracy) !== null);
  const maxIndex = Math.max(1, chartRows.length - 1);

  // Tạo đường cong Bezier mượt mà cho biểu đồ xu hướng (Doc 7.2)
  let trendPath = '';
  let trendAreaPath = '';
  const trendPointsList = chartRows.map((item, index) => {
    const x = 12 + (index / maxIndex) * 176;
    const accuracy = clampPercent(item.accuracy);
    const y = 90 - accuracy * 0.72; // y chạy từ 18 (100%) đến 90 (0%)
    return {
      x,
      y,
      label: item.label ?? `Phiên ${index + 1}`,
      accuracy,
      score: item.score ?? '-',
      total: item.total ?? '-',
    };
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
  const activeTrendIndex = hoveredTrendIndex ?? focusedTrendIndex;
  const activeTrendPoint = activeTrendIndex === null ? null : trendPointsList[activeTrendIndex] || null;
  const readoutTrendPoint = activeTrendPoint || trendPointsList.at(-1);
  const handleTrendPointerMove = event => {
    if (!trendPointsList.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = ((event.clientX - rect.left) / rect.width) * 200;
    const chartX = Math.max(12, Math.min(188, pointerX));
    let nearestIndex = 0;
    for (let index = 1; index < trendPointsList.length; index += 1) {
      if (Math.abs(trendPointsList[index].x - chartX) < Math.abs(trendPointsList[nearestIndex].x - chartX)) {
        nearestIndex = index;
      }
    }
    setHoveredTrendIndex(nearestIndex);
  };
  const handleTrendPointerLeave = () => setHoveredTrendIndex(null);
  const handleTrendFocus = index => {
    setHoveredTrendIndex(null);
    setFocusedTrendIndex(index);
  };
  const handleTrendBlur = () => setFocusedTrendIndex(null);
  const bestType = typeRows.filter(item => item.answered > 0 && numericMetric(item.accuracy) !== null).sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakType = typeRows.filter(item => item.answered > 0 && numericMetric(item.accuracy) !== null).sort((a, b) => a.accuracy - b.accuracy)[0];
  // Readiness theo kỹ năng (doc 7.2): dashboard ưu tiên hiện độ sẵn sàng từng
  // năng lực thay vì chỉ accuracy tổng.
  const readinessRows = [
    { key: 'memory', label: 'Trí nhớ bền', detail: 'Ghi nhớ từ đã học', value: percentMetric(analytics?.memory_stability) },
    { key: 'listening', label: 'Nghe', detail: 'Nhận diện qua âm thanh', value: percentMetric(analytics?.listening_readiness) },
    { key: 'context', label: 'Ngữ cảnh', detail: 'Hiểu từ trong câu', value: percentMetric(analytics?.context_transfer) },
    { key: 'production', label: 'Sản sinh', detail: 'Chủ động sử dụng', value: percentMetric(analytics?.production_readiness) },
  ];

  const reviewWords = (weakWords.length ? weakWords : recommendation.focus_words?.map(word => ({ hanzi: word, pinyin: '', meaning_vi: '' })) || []).slice(0, 6);

  return (
    <section
      className="dash-stats dash-insights"
      aria-label="Phân tích dữ liệu người học"
      aria-busy={analyticsState?.tone === 'loading'}
      data-analytics-state={analyticsState?.tone || 'live'}
    >
      {analyticsState && (
        <div className={`dash-analytics-status dash-analytics-status--${analyticsState.tone}`} role="status" aria-live={analyticsState.tone === 'loading' ? 'polite' : undefined}>
          <AlertCircle size={17} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <strong>{analyticsState.label}</strong>
            <span>{analyticsState.detail}</span>
          </div>
        </div>
      )}
      <header className="dash-stats-head">
        <div className="dash-stats-title">
          <span className="dash-eyebrow">Tiến độ học tập</span>
          <h2>Mỗi phiên học, hiểu mình hơn</h2>
          <p>{hasData ? 'Nhìn lại kết quả, nhận ra phần cần luyện và chọn bước tiếp theo.' : 'Hoàn thành một phiên để bắt đầu theo dõi tiến độ của bạn.'}</p>
        </div>
        <div className="dash-milestone">
          <div className="dash-ring" aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--dash-hair)" strokeWidth="5" />
              {completionPercent !== null && (
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--jade)" strokeWidth="5" strokeDasharray="175" strokeDashoffset={175 - (175 * completionPercent / 100)} transform="rotate(-90 32 32)" strokeLinecap="round" />
              )}
            </svg>
            <b>{completionPercent !== null ? <>{completionPercent}<i>%</i></> : '—'}</b>
          </div>
          <div>
            <strong>Mốc 50 câu</strong>
            <span>{hasData && eventCount !== null ? `${eventCount} câu đã ghi nhận` : 'Chưa có tổng số câu'}</span>
          </div>
        </div>
      </header>

      <dl className="dash-kpis" aria-label="Tổng quan kết quả học">
        <div>
          <dt><CheckCircle2 size={16} strokeWidth={1.6} aria-hidden="true" />Độ chính xác</dt>
          <dd className="dash-figure">{accuracy !== null ? <>{accuracy}<i>%</i></> : '—'}</dd>
          <dd className="dash-kpi-note">Trên các câu đã trả lời</dd>
        </div>
        <div>
          <dt><RotateCcw size={16} strokeWidth={1.6} aria-hidden="true" />Đến hạn ôn</dt>
          <dd className="dash-figure">{dueCount !== null ? dueCount : '—'}</dd>
          <dd className="dash-kpi-note">Từ cần được nhắc lại</dd>
        </div>
        <div>
          <dt><ShieldCheck size={16} strokeWidth={1.6} aria-hidden="true" />Độ vững</dt>
          <dd className="dash-figure">{confidenceAvg !== null ? confidenceAvg.toFixed(1) : '—'}</dd>
          <dd className="dash-kpi-note">Mức trung bình đã ghi nhận</dd>
        </div>
        <div>
          <dt><Layers size={16} strokeWidth={1.6} aria-hidden="true" />Lượt luyện tập</dt>
          <dd className="dash-figure">{attemptCount !== null ? attemptCount : '—'}</dd>
          <dd className="dash-kpi-note">Tích lũy trong lịch sử</dd>
        </div>
      </dl>

      <div className="dash-progress-grid">
        <article className="dash-trend" aria-label="Xu hướng học tập">
          <div className="dash-block-head">
            <div>
              <span className="dash-eyebrow">Qua từng phiên</span>
              <h3>Độ chính xác gần đây</h3>
            </div>
            <span className="dash-trend-count">{chartRows.length ? `${chartRows.length} phiên có dữ liệu` : 'Chờ phiên đầu tiên'}</span>
          </div>
          <div className="dash-trend-chart-wrap">
            {chartRows.length ? (
              <>
                <div className="dash-trend-plot">
                  <div className="dash-trend-scale" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
                  <svg
                    className="dash-trend-chart"
                    viewBox="0 0 200 100"
                    preserveAspectRatio="none"
                    role="group"
                    aria-label="Xu hướng độ chính xác"
                    onPointerMove={handleTrendPointerMove}
                    onPointerLeave={handleTrendPointerLeave}
                  >
                    <defs>
                      <linearGradient id="dashTrendArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="var(--jade)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line x1="12" y1="18" x2="188" y2="18" className="dash-trend-grid" strokeDasharray="2 4" />
                    <line x1="12" y1="54" x2="188" y2="54" className="dash-trend-grid" strokeDasharray="2 4" />
                    <line x1="12" y1="90" x2="188" y2="90" className="dash-trend-axis" />
                    {trendAreaPath && <path className="dash-trend-fill" d={trendAreaPath} />}
                    {trendPath && <path className="dash-trend-line" d={trendPath} />}
                    {activeTrendPoint && (
                      <line
                        className="dash-trend-crosshair"
                        x1={activeTrendPoint.x}
                        y1="18"
                        x2={activeTrendPoint.x}
                        y2="90"
                        aria-hidden="true"
                      />
                    )}
                    {trendPointsList.map((item, index) => (
                      <g
                        key={`${item.label}-${index}`}
                        className={`dash-trend-point${activeTrendIndex === index ? ' is-active' : ''}`}
                        onFocus={() => handleTrendFocus(index)}
                        onBlur={handleTrendBlur}
                      >
                        <circle cx={item.x} cy={item.y} r="11" className="dash-trend-hit" tabIndex={0} role="img" aria-label={`${item.label}: ${item.accuracy}% chính xác, ${item.score} trên ${item.total}`} />
                        <circle cx={item.x} cy={item.y} r="1.8" className="dash-trend-dot" aria-hidden="true" />
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="dash-trend-endpoints" aria-hidden="true">
                  <span>{trendPointsList[0].label}</span>
                  {trendPointsList.length > 1 && <span>{trendPointsList.at(-1).label}</span>}
                </div>
                <div className="dash-trend-readout" role="status" aria-live="polite">
                  <strong>{readoutTrendPoint.label}</strong>
                  <span><b>{readoutTrendPoint.accuracy}%</b> chính xác</span>
                  <span>Điểm {readoutTrendPoint.score} / {readoutTrendPoint.total}</span>
                </div>
                <details className="dash-trend-details">
                  <summary>Xem dữ liệu từng phiên <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" /></summary>
                  <div className="dash-trend-table-wrap" role="region" aria-label="Bảng kết quả từng phiên" tabIndex={0}>
                    <table className="dash-trend-table">
                      <caption>Chi tiết các phiên gần nhất</caption>
                      <thead>
                        <tr><th scope="col">Phiên</th><th scope="col">Độ chính xác</th><th scope="col">Điểm</th><th scope="col">Tổng</th></tr>
                      </thead>
                      <tbody>
                        {trendPointsList.map((item, index) => (
                          <tr key={`${item.label}-detail-${index}`}>
                            <th scope="row">{item.label}</th>
                            <td>{item.accuracy}%</td>
                            <td>{item.score}</td>
                            <td>{item.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <div className="dash-trend-empty" role="status">
                <TrendingUp size={28} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <strong>Chưa có xu hướng để hiển thị</strong>
                  <p>Hoàn thành một phiên học để bắt đầu theo dõi độ chính xác. Dữ liệu mới sẽ xuất hiện tại đây.</p>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="dash-readiness-panel" aria-label="Mức sẵn sàng">
          <div className="dash-readiness-intro">
            <span className="dash-eyebrow">Bản đồ năng lực</span>
            <h3>Sẵn sàng dùng tiếng Trung</h3>
            <p>Bốn góc nhìn về cách bạn ghi nhớ và vận dụng kiến thức đã học.</p>
          </div>
          <div className="dash-readiness" aria-label="Độ sẵn sàng theo kỹ năng">
            {readinessRows.map(item => (
              <div key={item.key} className="dash-readiness-cell" data-tone={skillTone(item.value)}>
                <div className="dash-readiness-topline">
                  <span>{item.label}</span>
                  <strong className="dash-figure">{item.value !== null ? `${item.value}%` : '—'}</strong>
                </div>
                <small>{item.detail}</small>
                <div className="dash-meter"><span style={{ width: `${item.value ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
          {!hasData && <p className="dash-section-note">Các chỉ số sẽ xuất hiện khi có dữ liệu luyện tập tương ứng.</p>}
        </article>
      </div>

      <section className="dash-breakdown" aria-label="Kết quả theo kỹ năng và cấp độ">
        <header className="dash-section-heading">
          <div><span className="dash-eyebrow">Hiểu kết quả</span><h3>Bạn đang vững ở đâu?</h3></div>
          <p>Đối chiếu độ chính xác với số câu đã luyện. Dấu — là phần chưa có đủ dữ liệu.</p>
        </header>
        <div className="dash-grid">
          <article className="dash-skills">
            <div className="dash-block-head"><h4>Theo dạng bài</h4><span>Độ chính xác</span></div>
            <div className="dash-skill-list">
              {typeRows.map(item => {
                const answered = numericMetric(item.answered) ?? 0;
                const value = answered > 0 && numericMetric(item.accuracy) !== null ? clampPercent(item.accuracy) : null;
                const SkillIcon = QUIZ_TYPES.find(type => type.id === item.quiz_type)?.icon || BookOpen;
                return (
                  <div className="dash-skill-row" key={item.quiz_type} data-tone={skillTone(value)}>
                    <span className="dash-skill-icon" aria-hidden="true"><SkillIcon size={19} strokeWidth={1.6} /></span>
                    <div className="dash-skill-name"><strong>{item.label}</strong><span>{answered > 0 ? `${answered} câu đã trả lời` : 'Chưa luyện'}</span></div>
                    <b className="dash-figure">{value !== null ? `${value}%` : '—'}</b>
                    <div className="dash-meter"><span style={{ width: `${value ?? 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
            {(bestType || weakType) && (
              <div className="dash-skill-summary">
                {bestType && <span><CheckCircle2 size={15} strokeWidth={1.6} aria-hidden="true" />Cao nhất: <strong>{bestType.label}</strong></span>}
                {weakType && weakType.quiz_type !== bestType?.quiz_type && <span><TrendingUp size={15} strokeWidth={1.6} aria-hidden="true" />Cần luyện thêm: <strong>{weakType.label}</strong></span>}
              </div>
            )}
          </article>
          <article className="dash-levels">
            <div className="dash-block-head"><h4>Theo cấp HSK</h4><span>Độ chính xác</span></div>
            <div className="dash-level-list">
              {levelRows.map(item => {
                const answered = numericMetric(item.answered) ?? 0;
                const value = answered > 0 && numericMetric(item.accuracy) !== null ? clampPercent(item.accuracy) : null;
                return (
                  <div className="dash-level-row" key={item.level} data-empty={value === null ? 'true' : 'false'}>
                    <strong className="dash-level-name">HSK {item.level}</strong>
                    <span className="dash-level-count">{answered > 0 ? `${answered} câu đã trả lời` : 'Chưa luyện'}</span>
                    <b className="dash-figure">{value !== null ? `${value}%` : '—'}</b>
                    <div className="dash-meter"><span style={{ width: `${value ?? 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="dash-section-note">Kết quả từ các bài đã làm, không phải chứng nhận trình độ HSK.</p>
          </article>
        </div>
      </section>

      <section className="dash-next" aria-label="Gợi ý luyện tập">
        <header className="dash-section-heading">
          <div><span className="dash-eyebrow">Bước tiếp theo</span><h3>Luyện đúng phần bạn cần</h3></div>
          <p>Một đề bài phù hợp và những từ nên dành thêm thời gian.</p>
        </header>
        <div className="dash-bottom">
          <article className="dash-reco">
            <div className="dash-reco-copy">
              <span className="dash-eyebrow"><BookOpen size={16} strokeWidth={1.6} aria-hidden="true" />Đề bài gợi ý</span>
              <h4>{recommendation.title}</h4>
              <p>{recommendation.reason}</p>
              <div className="dash-reco-meta"><span>{strategyLabel(recommendedStrategy)}</span><span>{latencyLabel}</span></div>
            </div>
            <button className="btn-primary" type="button" onClick={() => onStartRecommended({ ...recommendation, recommended_strategy: recommendedStrategy })}><Play size={16} strokeWidth={1.5} aria-hidden="true" /> Luyện đề này</button>
          </article>
          <article className="dash-recent">
            <div className="dash-block-head"><h4>{weakWords.length ? 'Từ cần củng cố' : 'Từ gợi ý'}</h4><span>{reviewWords.length ? `${reviewWords.length} từ` : 'Chưa có từ'}</span></div>
            {reviewWords.length ? (
              <ul className="dash-review-words">
                {reviewWords.map((item, index) => (
                  <li key={`${item.hanzi}-${item.pinyin}-${index}`}>
                    <strong lang="zh-CN">{item.hanzi}</strong>
                    {item.pinyin && <TonedPinyin pinyin={item.pinyin} />}
                    {item.meaning_vi && <span className="dash-review-meaning">{item.meaning_vi}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-recent-empty">Sau vài lượt luyện tập, những từ cần củng cố sẽ được tập hợp ở đây.</p>
            )}
          </article>
        </div>
      </section>

      {aiAvailable && (
        <section className="dash-ai" aria-label="Cố vấn AI">
          <div className="dash-block-head">
            <div className="dash-ai-heading">
              <span className="dash-ai-icon" aria-hidden="true"><Sparkles size={22} strokeWidth={1.5} /></span>
              <div><span className="dash-eyebrow">Cố vấn AI · khi bạn cần</span><h3>Thêm một góc nhìn cho lộ trình</h3><p>Phân tích điểm mạnh, phần cần cải thiện và gợi ý bước tiếp theo từ dữ liệu học.</p></div>
            </div>
            <button className="btn-secondary" type="button" onClick={runAiAnalysis} disabled={aiLoading || !hasData}>
              {aiLoading ? <><Loader2 className="spin" size={16} strokeWidth={1.5} aria-hidden="true" /> Đang phân tích</> : <><Sparkles size={16} strokeWidth={1.5} aria-hidden="true" /> Phân tích với AI</>}
            </button>
          </div>
          {!hasData && <p className="dash-ai-hint">Hãy học vài phiên để AI có dữ liệu phân tích.</p>}
          {aiError && (
            <p className="dash-ai-error" role="alert"><AlertTriangle size={15} strokeWidth={1.5} aria-hidden="true" /> {aiError}</p>
          )}
          {aiLoading && !aiResult && (
            <div className="dash-ai-skeleton" aria-hidden="true"><span className="dash-sk dash-sk--wide" /><span className="dash-sk dash-sk--wide" /><span className="dash-sk dash-sk--half" /></div>
          )}
          {aiResult && (
            <div className="dash-ai-result">
              {aiResult.summary && <p className="dash-ai-summary">{aiResult.summary}</p>}
              <div className="dash-ai-groups">
                {aiResult.strengths?.length > 0 && (
                  <div className="dash-ai-group dash-ai-group--strong"><span className="dash-eyebrow">Điểm mạnh</span><ul>{aiResult.strengths.map((item, i) => <li key={`s-${i}`}>{item}</li>)}</ul></div>
                )}
                {aiResult.weaknesses?.length > 0 && (
                  <div className="dash-ai-group dash-ai-group--weak"><span className="dash-eyebrow">Cần cải thiện</span><ul>{aiResult.weaknesses.map((item, i) => <li key={`w-${i}`}>{item}</li>)}</ul></div>
                )}
                {aiResult.roadmap?.length > 0 && (
                  <div className="dash-ai-group dash-ai-group--next"><span className="dash-eyebrow">Lộ trình tiếp theo</span><ol>{aiResult.roadmap.map((item, i) => <li key={`r-${i}`}>{item}</li>)}</ol></div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
function LearningFocusPanel({ focusLevel, focusLevels, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun }) {
  const selection = normalizeLevels(focusLevels ?? focusLevel);
  const label = levelsLabel(selection);
  // Kiểm tra tổng quát chấm theo MỘT cấp; lấy cấp thấp nhất đã chọn.
  const checkLevel = primaryLevel(selection, focusLevel || 1);
  return (
    // Dải mở đầu: không bọc thẻ, chỉ kẻ 1px dưới chân. Chữ neo trái, bộ chọn cấp
    // và nút hành động dồn sang phải để trục không đối xứng.
    <section className={`dash-focus ${showFirstRun ? 'dash-focus--first' : ''}`}>
      <div className="dash-focus-copy">
        <span className="dash-eyebrow">{showFirstRun ? 'Bước đầu' : 'Đang học'}</span>
        <h1>{showFirstRun ? 'Chọn cấp HSK' : `Mục tiêu hiện tại: ${label}`}</h1>
        <p className="hide-mobile">{showFirstRun ? 'Kiểm tra nhanh để xác định trình độ.' : 'Hệ thống đang tối ưu lộ trình dựa trên tiến độ thực tế của bạn.'}</p>
      </div>

      <div className="dash-focus-controls">
        <HskLevelPicker
          value={selection}
          onChange={onSelectLevel}
          levels={FOCUS_LEVELS}
          variant="card"
          className="dash-focus-levels"
          buttonClassName="dash-level"
          ariaLabel="Chọn cấp HSK trọng tâm"
        />

        <div className="dash-focus-actions">
          <button className="btn-primary" onClick={() => onStartGeneralCheck(checkLevel)}><Play size={16} strokeWidth={1.5} /> Kiểm tra tổng quát</button>
          <button className="btn-secondary" onClick={onOpenLessons}><Play size={16} strokeWidth={1.5} /> {`Luyện tập ${label}`}</button>
          {showFirstRun && <button className="btn-secondary" onClick={onSkipFirstRun}>Bỏ qua</button>}
        </div>
      </div>
    </section>
  );
}

function TodayQueuePanel({ plan, selectedMode, onSelectMode, onStartToday }) {
  const [nudgeMuted, setNudgeMuted] = useState(() => window.localStorage.getItem('behaviorNudgeMuted') === '1');
  if (!plan) {
    return (
      <section className="dash-today dash-today--pending" aria-label="Kế hoạch học hôm nay" aria-busy="true">
        <div className="dash-today-head">
          <div className="dash-today-title">
            <span className="dash-eyebrow">Hôm nay</span>
            <h2>Đang chuẩn bị phiên học</h2>
            <p>Đang đồng bộ kế hoạch và các từ đến hạn của bạn.</p>
          </div>
        </div>
        <div className="dash-today-pending" role="status" aria-live="polite">
          <span className="dash-today-pending-mark" aria-hidden="true" />
          <div>
            <strong>Chưa thể bắt đầu ngay</strong>
            <span>Kế hoạch sẽ xuất hiện khi dữ liệu học đã sẵn sàng.</span>
          </div>
        </div>
      </section>
    );
  }
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
    // Phiên hôm nay: khối chính duy nhất còn giữ nền giấy, vì đây là nơi người
    // dùng bắt đầu hành động — cần nổi hơn phần thống kê bên dưới.
    <section className="dash-today" aria-label="Kế hoạch học hôm nay">
      <div className="dash-today-head">
        <div className="dash-today-title">
          <span className="dash-eyebrow">Hôm nay</span>
          <h2>{plan.title}</h2>
          <p className="hide-mobile">{plan.subtitle}</p>
        </div>
        <div className="dash-mode-switch" role="group" aria-label="Chọn thời lượng phiên học">
          {SESSION_MODES.map(item => (
            <button
              key={item.id}
              className={(selectedMode === item.id || (plan.forceMicro && mode.id === item.id)) ? 'is-active' : ''}
              type="button"
              aria-pressed={selectedMode === item.id}
              onClick={() => onSelectMode(item.id)}
            >
              <strong>{item.pillTitle || item.label}</strong>
              <span>{item.pillSub || item.title}</span>
            </button>
          ))}
        </div>
      </div>

      {!nudgeMuted && plan.nudge && (
        <div className={`dash-nudge dash-nudge--${plan.behaviorState || 'maintenance'}`}>
          <span className="dash-nudge-mark" aria-hidden="true" />
          <div className="dash-nudge-body">
            <h3>{plan.behaviorLabel || 'Duy trì'}</h3>
            <p>{plan.nudge}</p>
            <span className="dash-nudge-reason hide-mobile">{plan.behaviorReason || plan.reason}</span>
          </div>
          <button className="dash-ghost-btn" type="button" onClick={muteNudge}>
            <BellOff size={15} strokeWidth={1.5} /> Tắt nhắc
          </button>
        </div>
      )}

      {/* Chỉ số nhiệm vụ: bỏ thẻ, chỉ kẻ 1px giữa các ô, số dùng mono tabular. */}
      <div className="dash-mission-row">
        {missions.map(item => (
          <article key={item.key} className={`dash-mission dash-mission--${item.tone}`}>
            <span className="dash-mission-label">{item.label}</span>
            <strong className="dash-figure">{item.value}</strong>
            <p className="hide-mobile">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="dash-today-foot">
        <div className="dash-focus-words" aria-label="Từ trọng tâm">
          {focusWords.length ? focusWords.map(item => (
            <span key={`${item.hanzi}-${item.pinyin || 'focus'}`} title={item.retrieval ? `Bậc truy hồi L${item.retrieval.level}: ${item.retrieval.label}` : undefined}>
              <strong>{item.hanzi}</strong>
              <small>{item.pinyin || 'Cần gặp lại'}</small>
              {item.acquisition && (
                <em
                  className={`dash-word-stage dash-word-stage--${item.acquisition.stage.toLowerCase()}`}
                  title={`Mức thụ đắc: ${item.acquisition.label} (${item.acquisition.progress_to_next}% tới nấc kế)`}
                >
                  {item.acquisition.label}
                  <span className="dash-word-stage-bar" aria-hidden="true">
                    <span style={{ width: `${item.acquisition.progress_to_next}%` }} />
                  </span>
                </em>
              )}
              {item.retrieval && <em className="dash-word-rung">L{item.retrieval.level} · {item.retrieval.label}</em>}
            </span>
          )) : (
            <span>
              <strong>HSK {plan.level}</strong>
              <small>Tạo dữ liệu đầu tiên</small>
            </span>
          )}
        </div>
        <div className="dash-today-actions">
          <p className="hide-mobile">{mode.description}</p>
          <div className="dash-action-buttons">
            <button className="btn-secondary" type="button" onClick={startDueOnly}><ShieldCheck size={16} strokeWidth={1.5} /> Xử lý từ đến hạn</button>
            <button className="btn-secondary" type="button" onClick={startRepairOnly}><Wrench size={16} strokeWidth={1.5} /> Sửa lỗi ngay</button>
            <button className="btn-primary" type="button" onClick={() => onStartToday(plan)}><Play size={16} strokeWidth={1.5} /> Bắt đầu phiên</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({ analytics, focusLevel, focusLevels, todayPlan, selectedSessionMode, showFirstRun, onSelectLevel, onOpenLessons, onStartGeneralCheck, onSkipFirstRun, onStartRecommended, onSelectSessionMode, onStartToday }) {
  return (
    <main className="dash-page">
      <LearningFocusPanel
        focusLevel={focusLevel}
        focusLevels={focusLevels}
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
    detail: 'Một dạng bài, feedback tức thì, hệ thống tự đo độ chắc và xếp lịch ôn từng câu.',
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
  // confidence giờ do thuật toán suy (auto-confidence.js), không phải người học
  // khai. <=2 = đúng nhưng chậm / sai chậm → cần gặp lại sớm. 4 = đúng ở nhịp
  // nhanh → đã thành phản xạ, dùng làm chỉ số thay cho "độ chắc TB" tự khai cũ.
  const lowConfidence = primary.filter(item => item.confidence <= 2).length;
  const fastCorrect = primary.filter(item => item.correct && item.confidence >= 4).length;
  const repairSuccess = repairs.filter(item => item.correct).length;
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
    fastCorrect,
    repairCount: repairs.length,
    repairSuccess,
    nextReviewCount: primary.filter(item => !item.correct || item.confidence <= 2).length,
    dominantError: dominantError ? { tag: dominantError[0], count: dominantError[1] } : null,
  };
}

function Quiz({ levels, setLevels, quizType, setQuizType, refreshStats, autoStartKey, limit = 10, strategyHint = 'targeted' }) {
  const { userId } = useAuth();
  // Đề quiz kéo từ TẤT CẢ cấp đã chọn (localQuestions nhận mảng). `level` scalar =
  // cấp thấp nhất, chỉ dùng làm nhãn khi lưu lịch sử/analytics (buildLevelBreakdown
  // index theo một số) để không phá thống kê cũ.
  const level = primaryLevel(levels);
  const [session, setSession] = useState(null);
  const [quizItems, setQuizItems] = useState([]);
  const [primaryQuestions, setPrimaryQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answerError, setAnswerError] = useState('');
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
  const submittingRef = useRef(false);

  const item = quizItems[index];
  const question = item?.question;
  const activeQuizType = question?.quiz_type || quizType;
  const selectedType = QUIZ_TYPES.find(type => type.id === quizType);
  const questionType = QUIZ_TYPES.find(type => type.id === activeQuizType);
  const strategy = QUIZ_STRATEGY_MODES.find(row => row.id === strategyMode) || QUIZ_STRATEGY_MODES[0];
  const isRepair = item?.type === 'repair_card';
  const isListeningMode = activeQuizType === 'listening' || activeQuizType === 'dialogue';
  const progress = quizItems.length ? Math.round(((index + 1) / quizItems.length) * 100) : 0;
  const ordering = useMemo(() => {
    if (activeQuizType !== 'drag_drop') return null;
    try {
      return normalizeOrdering(question?.metadata_json);
    } catch (error) {
      if (error instanceof OrderingError) return null;
      throw error;
    }
  }, [activeQuizType, question?.metadata_json]);
  const dragSegments = ordering?.segments || [];
  const dragCorrectOrder = ordering?.correct_order || [];
  const dragScrambledIndices = ordering?.scrambled_indices || [];

  const resetQuizState = useCallback(() => {
    setSession(null);
    setQuizItems([]);
    setPrimaryQuestions([]);
    setIndex(0);
    setSelected(null);
    setAnswerError('');
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
    submittingRef.current = false;
    setSubmitting(false);
    stopSpeech();
  }, []);

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
        const data = await localQuiz({ user_id: userId, levels, level, quiz_type: type, limit: perTypeLimit });
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
  }, [level, levels, limit, quizType, resetQuizState, strategy.detail, strategyMode, userId]);

  // Hủy chờ tải (khi API treo): tăng loadId để bỏ response đến muộn, đưa người
  // dùng về màn chọn đề thay vì kẹt ở spinner.
  const cancelLoad = useCallback(() => {
    loadIdRef.current += 1;
    setLoading(false);
    resetQuizState();
  }, [resetQuizState]);

  useEffect(() => {
    if (autoStartKey <= 0) return undefined;
    const timer = window.setTimeout(() => loadQuiz(), 0);
    return () => window.clearTimeout(timer);
  }, [autoStartKey, loadQuiz]);

  // Chỉ Nghe/Hội thoại mới cần audio; các task khác (vocab/cloze/reading...) ẩn nút Nghe.
  const showAudioPanel = isListeningMode;

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

  const queueRepairItem = useCallback((review, selectedIndex, confidenceValue) => {
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
  }, [index, isRepair, question]);

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
            ...(answer.selected_order ? {
              selected_order: [...answer.selected_order],
              ordering_version: answer.ordering_version,
            } : {}),
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
  }, [level, primaryQuestions, refreshStats, session, userId]);

  const answerQuestion = useCallback(async (choiceIndex, eventTimeStamp, selectedOrder = null) => {
    if (!question || selected !== null || submittingRef.current || submitting || feedback || loading) return;
    const loadId = loadIdRef.current;
    const latency = Math.max(0, eventTimeStamp - questionStartedAtRef.current);
    const orderingFields = activeQuizType === 'drag_drop' ? {
      selected_order: selectedOrder ? [...selectedOrder] : null,
      ordering_version: ordering?.ordering_version,
    } : {};
    submittingRef.current = true;
    setSelected(choiceIndex);
    setAnswerError('');
    setSubmitting(true);
    try {
      const itemType = sessionItemType(question, isRepair);
      // confidence KHÔNG còn do người học bấm: recordLearningEvent tự suy từ
      // đúng/sai + độ trễ so với ngân sách dạng bài + tiền sử SRS của từ, rồi trả
      // về trong review để lịch ôn và tổng kết dùng chung một con số.
      const review = await recordLearningEvent({
        user_id: userId,
        session_id: session?.id,
        question_id: question.id,
        selected_index: choiceIndex,
        ...orderingFields,
        latency_ms: latency,
        item_type: itemType,
      }, question);
      if (loadIdRef.current !== loadId) return;
      const confidenceValue = review.confidence ?? (review.correct ? 3 : 2);
      const answerRecord = {
        question_id: question.id,
        quiz_type: activeQuizType,
        item_type: itemType,
        selected_index: choiceIndex,
        ...orderingFields,
        confidence: confidenceValue,
        latency_ms: latency,
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
        queueRepairItem(review, choiceIndex, confidenceValue);
      }
      setFeedback({ review, confidence: confidenceValue, selectedIndex: choiceIndex });
    } catch {
      if (loadIdRef.current !== loadId) return;
      setSelected(null);
      setAnswerError('Không thể ghi nhận câu trả lời. Vui lòng thử lại.');
    } finally {
      if (loadIdRef.current === loadId) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }, [activeQuizType, feedback, isRepair, loading, ordering, question, queueRepairItem, selected, session, submitting, userId]);

  const continueQuiz = useCallback(() => {
    if (index + 1 >= quizItems.length) {
      finishQuiz();
      return;
    }
    setIndex(current => current + 1);
    setSelected(null);
    setAnswerError('');
    setFeedback(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
    setDragOrder([]);
    setVoiceDone(false);
  }, [finishQuiz, index, quizItems.length]);

  // Phím tắt bàn phím: Enter / Space để qua câu tiếp theo khi có feedback (hoặc chọn 1..4 / A..D)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
        return;
      }
      if (e.nativeEvent?.isComposing || e.isComposing) return;

      if ((e.key === 'Enter' || e.code === 'Space' || e.key === ' ') && !submitting && !loading) {
        if (feedback) {
          e.preventDefault();
          continueQuiz();
          return;
        }
      }

      if (!feedback && selected === null && !submitting && !loading && activeQuizType !== 'drag_drop' && activeQuizType !== 'voice') {
        const key = e.key.toUpperCase();
        let optIndex = -1;
        if (key === 'A' || key === '1') optIndex = 0;
        else if (key === 'B' || key === '2') optIndex = 1;
        else if (key === 'C' || key === '3') optIndex = 2;
        else if (key === 'D' || key === '4') optIndex = 3;
        if (optIndex >= 0 && question?.options && optIndex < question.options.length) {
          e.preventDefault();
          answerQuestion(optIndex, performance.now());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [feedback, submitting, loading, continueQuiz, selected, activeQuizType, question, answerQuestion]);

  // ---- Drag-drop handlers ----
  const dragOrderSet = useMemo(() => new Set(dragOrder), [dragOrder]);
  const duplicateDragOrdinal = (tokenIndex) => {
    const token = dragSegments[tokenIndex];
    if (dragSegments.indexOf(token) === dragSegments.lastIndexOf(token)) return null;
    return dragSegments.slice(0, tokenIndex + 1).filter(segment => segment === token).length;
  };

  const toggleDragToken = (tokenIndex) => {
    if (!ordering || submittingRef.current || submitting || feedback || loading) return;
    setDragOrder(prev => {
      if (prev.includes(tokenIndex)) {
        return prev.filter(i => i !== tokenIndex);
      }
      return [...prev, tokenIndex];
    });
  };

  const submitDragDrop = () => {
    if (!ordering || dragOrder.length !== dragCorrectOrder.length) return;
    // selected_index chỉ là placeholder; review chấm theo identity trong selected_order.
    answerQuestion(0, now(), [...dragOrder]);
  };

  if (result) {
    const answerById = new Map(result.answers.map(row => [row.question_id, row]));
    return (
      <main className="core-page page-enter">
        <section className="qz core-card result-card session-result-card">
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
            <span><LineChart size={18} /><strong>{result.fastCorrect}/{result.correct}</strong><small>đúng ở nhịp nhanh</small></span>
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
                <small>{assessmentText(review?.correct, review?.confidence)} · {nextReviewText(review?.next_review_at)}</small>
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

          <HskLevelPicker
            value={levels}
            onChange={setLevels}
            className="level-grid"
            buttonClassName="level-card"
            ariaLabel="Chọn một hoặc nhiều cấp HSK"
          />

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
        <section key={item.id} className={`qz core-card question-card learning-question-card ${isRepair ? 'learning-question-card--repair' : ''}`} aria-live="polite">
          <div className="question-topline">
            <button type="button" className="quiz-back" onClick={cancelLoad}><ArrowLeft size={16} /> Thoát</button>
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
            <ClozePrompt
              prompt={question.prompt}
              filledText={selected !== null ? question.options[selected] : null}
              isPassage={question.metadata_json?.question_subtype === 'guided_cloze'}
            />
          ) : activeQuizType === 'drag_drop' ? (
            <div className="drag-drop-prompt">
              <p className="drag-drop-label">Sắp xếp thành câu đúng</p>
            </div>
          ) : (
            <QuestionPrompt question={question} quizType={question.quiz_type} />
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
                    <Fragment key={`ans-${tokenIndex}`}>
                      {pos > 0 && <span className="drag-slash">/</span>}
                      <button
                        className="drag-chip drag-chip--selected"
                        onClick={() => toggleDragToken(tokenIndex)}
                        disabled={submitting || Boolean(feedback) || loading}
                        aria-label={`Bỏ ${dragSegments[tokenIndex]}${duplicateDragOrdinal(tokenIndex) ? ` (${duplicateDragOrdinal(tokenIndex)})` : ''}`}
                        title="Bấm để bỏ ra"
                      >
                        {dragSegments[tokenIndex]}
                        {duplicateDragOrdinal(tokenIndex) && <small> {duplicateDragOrdinal(tokenIndex)}</small>}
                      </button>
                    </Fragment>
                  ))
                )}
              </div>

              {/* Vùng nguồn — các chip chưa chọn, hiển thị theo thứ tự xáo trộn */}
              <div className="drag-source-zone">
                {dragScrambledIndices.map((origIndex, pos) => {
                  const used = dragOrderSet.has(origIndex);
                  return (
                    <Fragment key={`src-${origIndex}`}>
                      {pos > 0 && <span className={`drag-slash ${used ? 'drag-slash--faded' : ''}`}>/</span>}
                      <button
                        className={`drag-chip ${used ? 'drag-chip--used' : 'drag-chip--available'}`}
                        onClick={() => !used && toggleDragToken(origIndex)}
                        disabled={used || submitting || Boolean(feedback) || loading}
                        aria-label={used ? `${dragSegments[origIndex]} (đã chọn)` : `Chọn ${dragSegments[origIndex]}${duplicateDragOrdinal(origIndex) ? ` (${duplicateDragOrdinal(origIndex)})` : ''}`}
                      >
                        {dragSegments[origIndex]}
                        {duplicateDragOrdinal(origIndex) && <small> {duplicateDragOrdinal(origIndex)}</small>}
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

          ) : activeQuizType === 'drag_drop' ? (
            // Câu drag_drop thiếu segments hợp lệ (thường là câu cũ tái dùng từ
            // DB, sinh trước khi có guard). Không rơi xuống lưới trắc nghiệm —
            // options chỉ là placeholder dummy — mà cho bỏ qua sạch.
            <div className="drag-drop-area drag-drop-unavailable">
              <p className="drag-hint">Câu này không khả dụng để sắp xếp.</p>
              <div className="drag-drop-actions">
                <button className="btn-primary" onClick={continueQuiz} disabled={submitting}>
                  Bỏ qua
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
                      onClick={(event) => answerQuestion(optionIndex, event.timeStamp)}
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


          {answerError && <p role="alert" className="feedback-error-tag">{answerError}</p>}
          {feedback && (
            <div className={`feedback-panel ${feedback.review.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
              <div className="feedback-head">
                {feedback.review.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                <strong>{feedback.review.correct ? 'Đúng' : 'Cần sửa'}</strong>
                <span className="hide-mobile">{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              {/* Thay panel "Mức tự tin?" cũ: thuật toán tự đánh giá từ đúng/sai +
                  tốc độ trả lời rồi nói ra kết luận, người học không phải khai báo. */}
              <p className="feedback-assess">{assessmentText(feedback.review.correct, feedback.confidence)}</p>
              <p>{feedback.review.explanation || question.explanation || 'Đã ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && (
                <small>Đáp án: {
                  activeQuizType === 'drag_drop'
                    ? dragCorrectOrder.map(tokenIndex => dragSegments[tokenIndex]).join('')
                    : (question.options[feedback.review.correct_index] || '-')
                }</small>
              )}
              {!feedback.review.correct && errorTagLabel(feedback.review.error_tag) && (
                <div className="feedback-error-tag">
                  <em>{errorTagLabel(feedback.review.error_tag)}</em>
                  {errorTagHint(feedback.review.error_tag) && <small>{errorTagHint(feedback.review.error_tag)}</small>}
                </div>
              )}
              <WordEncodeCard word={question.word} />
              <button className="btn-primary" type="button" onClick={continueQuiz} disabled={loading}>{index + 1 >= quizItems.length ? 'Xong (Enter)' : 'Tiếp (Enter)'}</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}


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

// Diễn giải mức tự chắc mà THUẬT TOÁN suy ra (auto-confidence.js), thay cho nhãn
// người học tự bấm trước đây. Hiện chữ thay vì "3/4" vì con số chỉ có nghĩa với
// người biết thang SM-2; người học cần biết vì sao câu này bị xếp ôn sớm hay giãn.
function assessmentText(correct, confidence) {
  const value = Number(confidence) || 0;
  if (correct) {
    if (value >= 4) return 'Trả lời nhanh, đã thành phản xạ';
    if (value <= 2) return 'Đúng nhưng còn chậm, chưa vững';
    return 'Đúng ở nhịp bình thường';
  }
  // Sai nhanh (confidence 3) khác sai chậm (2): một cái là nhớ lệch, một cái là
  // chưa nhớ ra — hai đường phục hồi khác nhau nên nói rõ.
  return value >= 3 ? 'Sai dứt khoát, đang nhớ lệch' : 'Chưa nhớ ra kịp';
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
  confidence_error: { label: 'Chưa vững', hint: 'Đúng nhưng còn chậm. Gặp lại sớm để thành phản xạ.' },
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

// Các mục luyện tập CÓ CHẤM ĐIỂM thật trên một từ cụ thể → được ghi vào lịch ôn.
// Ba mục còn lại (character_card, confusion_card, micro_reading) chỉ có nút "Đã
// rõ / Tiếp tục" và luôn trả correct=true: đó là hành vi bấm qua, không phải bằng
// chứng về trí nhớ. Ghi chúng vào SRS sẽ giãn lịch của từ chỉ vì người học đã
// cuộn qua thẻ giới thiệu.
const GRADED_PRACTICE_TYPES = new Set(['tone_drill', 'pinyin_typing', 'guided_output']);

// Ngân sách thời gian cho từng mục luyện: gõ pinyin có tone số tốn thời gian như
// gõ từ, chọn tone pattern nhanh như một câu vocab, còn đặt cả một câu thì đo theo
// nhịp dịch câu.
const PRACTICE_ACTIVITY = {
  tone_drill: 'vocab',
  pinyin_typing: 'typing',
  guided_output: 'translation',
};

function LearningSession({ plan, fallbackLevel, onExit, onComplete }) {
  const { userId } = useAuth();
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
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
  // Mốc riêng cho các mục luyện tập (tone_drill / pinyin_typing / guided_output).
  // Không dùng chung questionStartedAtRef: ref đó chỉ được đặt lại trong effect
  // của `question`, mà các mục này KHÔNG có question nên mốc sẽ đứng ở câu trắc
  // nghiệm trước đó và độ trễ đo ra là tổng của cả hai mục.
  const practiceStartedAtRef = useRef(0);
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
  }, [onComplete, plan, session, userId]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setSession(null);
    setItems([]);
    setIndex(0);
    setSelected(null);
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
  }, [level, limit, modeId, plan, quizType, resetTyping, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadSession(), 0);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [loadSession]);

  // Chỉ Nghe/Hội thoại mới cần audio; các task khác (vocab/cloze/reading...) ẩn nút Nghe.
  const showAudioPanel = isListeningMode;

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

  // Đặt mốc thời gian cho mục luyện tập đang hiện. Theo item.id (không theo index)
  // để mục sửa lỗi chèn giữa phiên cũng được tính lại từ đầu.
  useEffect(() => {
    if (!isPractice) return;
    practiceStartedAtRef.current = now();
  }, [isPractice, item?.id]);

  const startChallenge = () => {
    setIndex(1);
  };

  const queueRepairItem = useCallback((review, selectedIndex) => {
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
  }, [index, question]);

  const answerQuestion = useCallback(async (choiceIndex, eventTimeStamp) => {
    if (!question || selected !== null || submitting || feedback) return;
    setSelected(choiceIndex);
    const latency = Math.max(0, eventTimeStamp - questionStartedAtRef.current);
    setSubmitting(true);
    try {
      // Không hỏi mức tự tin: recordLearningEvent tự suy và trả về trong review.
      const review = await recordLearningEvent({
        user_id: userId,
        session_id: session?.id,
        question_id: question.id,
        selected_index: choiceIndex,
        latency_ms: latency,
        item_type: sessionItemType(question, isRepair),
      }, question);
      const confidenceValue = review.confidence ?? (review.correct ? 3 : 2);
      const answerRecord = {
        question_id: question.id,
        item_type: sessionItemType(question, isRepair),
        selected_index: choiceIndex,
        confidence: confidenceValue,
        latency_ms: latency,
        correct: review.correct,
        explanation: review.explanation,
        next_review_at: review.next_review_at,
        prompt: question.prompt,
      };
      answersRef.current = [...answersRef.current, answerRecord];
      if (!review.correct && !isRepair) {
        queueRepairItem(review, choiceIndex);
      }
      setFeedback({ review, confidence: confidenceValue, selectedIndex: choiceIndex });
    } finally {
      setSubmitting(false);
    }
  }, [feedback, isRepair, question, queueRepairItem, selected, session?.id, submitting, userId]);

  const continueSession = useCallback(() => {
    if (index + 1 >= items.length) {
      finishSession();
      return;
    }
    setIndex(current => current + 1);
    setSelected(null);
    setFeedback(null);
    setTextAnswer('');
    resetTyping();
    setPracticeFeedback(null);
    setAudioPlaying(false);
    setAudioPlayed(false);
  }, [finishSession, index, items.length, resetTyping]);

  const completePracticeItem = useCallback(async (payload = {}) => {
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
      // Ghi lịch ôn cho các mục CÓ chấm điểm. Trước đây cả lớp "chinese layer" của
      // phiên học không nuôi SRS: gõ sai pinyin hay chọn sai tone của một từ vẫn
      // không kéo từ đó về hạn ôn sớm, dù đó chính là bằng chứng rõ nhất rằng từ
      // chưa vững. Mục guided_output chấm ở mức CÂU (dùng đúng từ mục tiêu trong
      // câu tự đặt) nên ghi cho chính từ mục tiêu, không cắt cả câu.
      if (GRADED_PRACTICE_TYPES.has(item.type) && item.word) {
        captureWordReview({
          word: item.word,
          correct: Boolean(result.correct ?? true),
          latencyMs: practiceStartedAtRef.current ? now() - practiceStartedAtRef.current : null,
          activity: PRACTICE_ACTIVITY[item.type] || 'vocab',
        });
      }
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
  }, [index, item, session?.id, submitting, textAnswer, userId]);

  const submitPinyin = () => {
    const result = assessPinyinInput(textAnswer, item?.word?.pinyin);
    completePracticeItem({ ...result, feedback: result.message });
  };

  // Phím tắt bàn phím: Enter / Space để qua câu tiếp theo khi có feedback (hoặc chọn 1..4 / A..D)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
        return;
      }
      if (e.nativeEvent?.isComposing || e.isComposing) return;

      if ((e.key === 'Enter' || e.code === 'Space' || e.key === ' ') && !submitting && !loading) {
        if (feedback || practiceFeedback) {
          e.preventDefault();
          continueSession();
          return;
        }
        if (item?.type === 'character_card' && !practiceFeedback) {
          e.preventDefault();
          completePracticeItem({ correct: true, feedback: 'Đã xem character family và collocation.' });
          return;
        }
      }

      if (!feedback && selected === null && !submitting && !loading && question?.options) {
        const key = e.key.toUpperCase();
        let optIndex = -1;
        if (key === 'A' || key === '1') optIndex = 0;
        else if (key === 'B' || key === '2') optIndex = 1;
        else if (key === 'C' || key === '3') optIndex = 2;
        else if (key === 'D' || key === '4') optIndex = 3;
        if (optIndex >= 0 && optIndex < question.options.length) {
          e.preventDefault();
          answerQuestion(optIndex, performance.now());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [feedback, practiceFeedback, submitting, loading, item, question, selected, continueSession, completePracticeItem, answerQuestion]);

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
        <section className="qz core-card result-card session-result-card">
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
        <section key={item.id} className={`qz core-card chinese-practice-card chinese-practice-card--${item.type}`} aria-live="polite">
          <div className="question-topline">
            <button type="button" className="quiz-back" onClick={onExit}><ArrowLeft size={16} /> Thoát</button>
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
              <button className="btn-primary" type="button" onClick={continueSession}>{index + 1 >= items.length ? 'Hoàn thành (Enter)' : 'Tiếp tục (Enter)'}</button>
            </div>
          )}

          {!practiceFeedback && item.type === 'character_card' && <button className="btn-primary" type="button" onClick={() => completePracticeItem({ correct: true, feedback: 'Đã xem character family và collocation.' })}>Tiếp tục (Enter)</button>}
        </section>
      )}

      {question && (
        <section key={item.id} className={`qz core-card question-card learning-question-card ${isRepair ? 'learning-question-card--repair' : ''}`} aria-live="polite">
          <div className="question-topline">
            <button type="button" className="quiz-back" onClick={onExit}><ArrowLeft size={16} /> Thoát</button>
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
            <ClozePrompt
              prompt={question.prompt}
              filledText={selected !== null ? question.options[selected] : null}
              isPassage={question.metadata_json?.question_subtype === 'guided_cloze'}
            />
          ) : (
            <QuestionPrompt question={question} quizType={activeQuizType} />
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


          {feedback && (
            <div className={`feedback-panel ${feedback.review.correct ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
              <div className="feedback-head">
                {feedback.review.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                <strong>{feedback.review.correct ? 'Đúng' : 'Cần sửa'}</strong>
                <span className="hide-mobile">{nextReviewText(feedback.review.next_review_at)}</span>
              </div>
              <p className="feedback-assess">{assessmentText(feedback.review.correct, feedback.confidence)}</p>
              <p>{feedback.review.explanation || question.explanation || 'Đã ghi vào lịch ôn.'}</p>
              {!feedback.review.correct && <small>Đáp án: {question.options[feedback.review.correct_index] || '-'}</small>}
              {!feedback.review.correct && errorTagLabel(feedback.review.error_tag) && (
                <div className="feedback-error-tag">
                  <em>{errorTagLabel(feedback.review.error_tag)}</em>
                  {errorTagHint(feedback.review.error_tag) && <small>{errorTagHint(feedback.review.error_tag)}</small>}
                </div>
              )}
              <WordEncodeCard word={question.word} />
              <button className="btn-primary" type="button" onClick={continueSession} disabled={loading}>{index + 1 >= items.length ? 'Xong (Enter)' : 'Tiếp (Enter)'}</button>
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
  // Chỉ Nghe/Hội thoại mới cần audio; các task khác (vocab/cloze/reading...) ẩn nút Nghe.
  const showAudioPanel = isListeningMode;
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
  }, [level, userId]);

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
    // Kiểm tra tổng quát đi qua submitQuiz (chấm cả loạt ở cuối), KHÔNG qua
    // recordLearningEvent, nên trước đây toàn bộ bài kiểm tra đầu vào không tạo
    // một lịch ôn nào: người học làm xong 30 câu mà "Học hôm nay" vẫn báo chưa có
    // từ đến hạn. Ghi ngay tại lượt trả lời — đây chính là đường chuẩn mà SRS cần.
    if (question.word?.hanzi) {
      captureWordReview({
        word: question.word,
        correct: choiceIndex === question.correct_index,
        latencyMs,
        activity: question.quiz_type,
      });
    }
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
        <section className="qz core-card result-card general-result-card">
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
        <section key={question.id} className={`qz core-card question-card ${advancing ? 'is-advancing' : ''}`} aria-live="polite">
          <div className="question-topline">
            <button type="button" className="quiz-back" onClick={onExit}><ArrowLeft size={16} /> Thoát</button>
            <span>{questionType?.label || 'Đang kiểm tra'}</span>
            <strong>{index + 1}</strong>
          </div>
          <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>
          {question.quiz_type === 'cloze' ? (
            <ClozePrompt
              prompt={question.prompt}
              filledText={null}
              isPassage={question.metadata_json?.question_subtype === 'guided_cloze'}
            />
          ) : (
            <QuestionPrompt question={question} quizType={question.quiz_type} clickable={false} />
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

// Zen theme colors matching current active theme (light or dark)
function zenWriterColors(theme) {
  const isDark = theme === 'dark';
  return {
    strokeColor: isDark ? '#2DBA91' : '#127a5d', // zen primary
    radicalColor: isDark ? '#E8C17A' : '#d4a359', // zen gold
    outlineColor: isDark ? '#2E2B27' : '#EAE5DA', // zen grid outline
  };
}

// Nạp dữ liệu nét chữ từ file tự host trên chính origin của app (public/hanzi-data,
// do scripts/generate-hanzi-data.mjs copy sẵn) thay vì CDN jsdelivr mặc định —
// jsdelivr hay bị chặn ở TQ và không chạy offline. Khớp hướng local-first.
const hanziDataCache = new Map();
function loadHanziCharData(char, onLoad, onError) {
  if (hanziDataCache.has(char)) {
    onLoad(hanziDataCache.get(char));
    return;
  }
  fetch(`/hanzi-data/${encodeURIComponent(char)}.json`)
    .then(res => {
      if (!res.ok) throw new Error(`hanzi-data ${char}: ${res.status}`);
      return res.json();
    })
    .then(data => {
      hanziDataCache.set(char, data);
      onLoad(data);
    })
    .catch(err => onError(err));
}

function HanziWriterElement({ character, theme }) {
  const containerRef = useRef(null);
  const writerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !character) return;
    let cancelled = false;
    containerRef.current.innerHTML = '';

    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled || !containerRef.current) return;
      const writer = HanziWriter.create(containerRef.current, character, {
        width: 120,
        height: 120,
        padding: 5,
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 220,
        charDataLoader: loadHanziCharData,
        ...zenWriterColors(theme),
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

function VocabLibrary({ focusLevels, theme }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  // levelFilter = MẢNG số đã chọn. Rỗng => hiện tất cả (levelMatches xử lý).
  const [levelFilter, setLevelFilter] = useState(() => normalizeLevels(focusLevels));
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
      loadAllFlashcards().then(cards => {
        const loaded = dedupeVocabCards(cards.map(normalizeCard).filter(isReliableVocabCard));
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
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter(item => levelMatches(levelFilter, item.level))
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
          <HskLevelPicker
            value={levelFilter}
            onChange={setLevelFilter}
            variant="chip"
            showAll
            allowEmpty
            className="vocab-hsk-tabs"
            buttonClassName=""
            ariaLabel="Lọc theo cấp HSK"
          />
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

              {/* Ngữ nghĩa chi tiết — do Giáo sư Ngữ nghĩa sinh */}
              {selectedWord.semanticNotes && (
                <div className="vocab-drawer-section">
                  <span className="vocab-section-title">📖 Ngữ nghĩa</span>
                  <p className="vocab-note-text">{selectedWord.semanticNotes}</p>
                </div>
              )}

              {/* Cách sử dụng & Mẫu câu — merge từ cả 2 giáo sư */}
              {selectedWord.usagePatterns?.length > 0 && (
                <div className="vocab-drawer-section">
                  <span className="vocab-section-title">✏️ Cách sử dụng</span>
                  <div className="usage-pattern-list">
                    {selectedWord.usagePatterns.map((p, i) => (
                      <div key={i} className="usage-pattern-item">
                        <strong>{p.pattern}</strong>
                        {p.example_cn && (
                          <blockquote>
                            {p.example_cn}
                            <small>{p.example_vi}</small>
                          </blockquote>
                        )}
                        {p.note && <small className="pattern-note">{p.note}</small>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lưu ý & Cảnh báo — do Giáo sư Ứng dụng sinh */}
              {selectedWord.usageNotes && (
                <div className="vocab-drawer-section">
                  <span className="vocab-section-title">⚠️ Lưu ý</span>
                  <p className="vocab-note-text vocab-warning">{selectedWord.usageNotes}</p>
                </div>
              )}

              {/* Phân tích chữ Hán — do Giáo sư Ngữ nghĩa sinh */}
              {selectedWord.characterAnalysis && (
                <div className="vocab-drawer-section">
                  <span className="vocab-section-title">🔍 Phân tích chữ Hán</span>
                  <p className="vocab-note-text">{selectedWord.characterAnalysis}</p>
                </div>
              )}

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

              <HandwritingPad key={selectedWord.key} targetWord={selectedWord} theme={theme} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

// Viết đúng một chữ từ trí nhớ (hanzi-writer chấm từng nét) là bằng chứng mạnh
// nhất trong app về việc nhớ MẶT CHỮ — mạnh hơn nhận ra chữ trong 4 lựa chọn. Nên
// nó cũng phải nuôi lịch ôn, nhưng chấm theo SỐ LẦN SAI NÉT chứ không theo thời
// gian: viết chậm mà đúng nét là viết cẩn thận, không phải quên.
//
//   0 lần sai          → đúng, mức chắc 4 (giãn lịch mạnh)
//   1-2 lần sai        → đúng, mức chắc 3 (giãn lịch chuẩn)
//   3-5 lần sai        → sai, mức chắc 2 (nhớ lờ mờ, reset nhẹ)
//   > 5 lần sai        → sai, mức chắc 3 (gần như dò từng nét, reset mạnh)
//
// Từ nhiều chữ: chỉ ghi khi viết XONG chữ CUỐI, và cộng tổng số lần sai của cả từ.
// Ghi từng chữ một sẽ khiến một từ 3 chữ nhận 3 lượt ôn cho cùng một lịch.
function handwritingGrade(mistakes) {
  const misses = Number(mistakes) || 0;
  if (misses === 0) return { correct: true, confidence: 4 };
  if (misses <= 2) return { correct: true, confidence: 3 };
  if (misses <= 5) return { correct: false, confidence: 2 };
  return { correct: false, confidence: 3 };
}

function HandwritingPad({ targetWord, theme }) {
  const containerRef = useRef(null);
  const writerRef = useRef(null);
  const themeRef = useRef(theme);
  const chars = useMemo(
    () => (targetWord.hanzi || '').split('').filter(ch => /[一-鿿]/.test(ch)),
    [targetWord.hanzi]
  );
  const [charIndex, setCharIndex] = useState(0);
  const [strokeProgress, setStrokeProgress] = useState({ done: 0, total: 0 });
  const [mistakes, setMistakes] = useState(0);
  const [completed, setCompleted] = useState(false);
  // Số lần sai nét của từng chữ đã viết XONG, khoá theo vị trí chữ trong từ. Dùng
  // Map thay vì một biến dồn vì người học chọn tab chữ theo thứ tự bất kỳ và có thể
  // viết lại một chữ — lần viết xong sau ghi đè lần trước, không cộng chồng lên.
  // Không cần reset khi đổi từ: chỗ gọi đặt key={selectedWord.key} nên component
  // remount, ref sinh lại từ đầu.
  const charMistakesRef = useRef(new Map());
  // Đã ghi SRS cho từ này chưa. Viết lại (restart) không mở lại: lượt đầu tiên là
  // lượt duy nhất phản ánh trí nhớ, các lượt sau đã thấy đáp án.
  const capturedRef = useRef(false);

  const activeChar = chars[charIndex];

  const resetStats = useCallback(() => {
    setStrokeProgress({ done: 0, total: 0 });
    setMistakes(0);
    setCompleted(false);
  }, []);

  const runQuiz = useCallback((writer) => {
    writer.quiz({
      onCorrectStroke(data) {
        setStrokeProgress({ done: data.strokeNum + 1, total: data.strokeNum + 1 + data.strokesRemaining });
      },
      onMistake(data) {
        setMistakes(data.totalMistakes);
      },
      onComplete(data) {
        setCompleted(true);
        charMistakesRef.current.set(charIndex, Number(data?.totalMistakes) || 0);
        // Chỉ ghi khi đã viết xong MỌI chữ của từ: ghi từng chữ một sẽ khiến một từ
        // 3 chữ nhận 3 lượt ôn cho cùng một lịch.
        if (capturedRef.current || charMistakesRef.current.size < chars.length) return;
        capturedRef.current = true;
        const total = [...charMistakesRef.current.values()].reduce((sum, value) => sum + value, 0);
        const { correct, confidence } = handwritingGrade(total);
        captureWordReview({ word: targetWord, correct, activity: 'typing', confidence });
      },
    });
  }, [charIndex, chars.length, targetWord]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    containerRef.current.innerHTML = '';
    writerRef.current = null;
    resetStats();
    if (!activeChar) return undefined;
    let cancelled = false;

    const drawingColor = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b84b';

    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled || !containerRef.current) return;
      const writer = HanziWriter.create(containerRef.current, activeChar, {
        width: 220,
        height: 220,
        padding: 8,
        showCharacter: false,
        showOutline: true,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        charDataLoader: loadHanziCharData,
        ...zenWriterColors(themeRef.current),
        drawingColor,
        drawingWidth: 24,
      });
      writerRef.current = writer;
      runQuiz(writer);
    });

    return () => {
      cancelled = true;
      writerRef.current?.cancelQuiz();
      writerRef.current = null;
    };
  }, [activeChar, resetStats, runQuiz]);

  // Đổi theme thì chỉ nhuộm lại màu, không dựng lại quiz -> giữ nguyên tiến độ nét đang viết.
  useEffect(() => {
    themeRef.current = theme;
    const writer = writerRef.current;
    if (!writer) return;
    const colors = zenWriterColors(theme);
    writer.updateColor('strokeColor', colors.strokeColor);
    writer.updateColor('radicalColor', colors.radicalColor);
    writer.updateColor('outlineColor', colors.outlineColor);
  }, [theme]);

  const restart = () => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.cancelQuiz();
    resetStats();
    runQuiz(writer);
  };

  const showHint = () => writerRef.current?.animateCharacter();

  return (
    <div className="handwriting-panel">
      <div className="handwriting-head">
        <div>
          <span className="core-eyebrow">Handwriting</span>
          <h3>Tập viết: {targetWord.hanzi}</h3>
          <p className="handwriting-hint-text">Viết gần đúng nét, hệ thống sẽ tự hoàn chỉnh thành nét chuẩn.</p>
        </div>
        {chars.length > 1 && (
          <div className="handwriting-char-tabs">
            {chars.map((ch, i) => (
              <button
                key={`${ch}-${i}`}
                type="button"
                className={i === charIndex ? 'active' : ''}
                onClick={() => setCharIndex(i)}
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="handwriting-quiz-wrap">
        <div ref={containerRef} className="handwriting-quiz-grid" />
        <div className="handwriting-stats">
          <span>
            Nét <strong>{strokeProgress.done}/{strokeProgress.total || '?'}</strong>
          </span>
          {mistakes > 0 && <span className="handwriting-miss">Sai: {mistakes}</span>}
          {completed && <span className="handwriting-done">Hoàn thành ✓</span>}
        </div>
      </div>

      <div className="handwriting-actions">
        <button className="btn-secondary" type="button" onClick={restart}>Viết lại</button>
        <button className="btn-secondary" type="button" onClick={showHint}>Xem nét chuẩn</button>
      </div>
    </div>
  );
}

/**
 * StreakPage — Trang chuỗi học tập liên tiếp.
 * Thay thế StudyPlan. Hiển thị hero flame, milestone badges, stats và leaderboard.
 */

function StreakPage({ onNavigateToQuiz }) {
  const {
    currentStreak,
    longestStreak,
    studiedToday,
    broken,
    freezesRemaining,
    loading,
    last7Days,
    refresh,
  } = useStreakData();
  const { entries, me, loading: lbLoading, userId, isAuthenticated } = useLeaderboard({ limit: 20 });
  const [lbTab, setLbTab] = useState('all');

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Streak</span>
        <h1>Chuỗi học tập</h1>
        <p>Duy trì thói quen mỗi ngày để xây dựng chuỗi liên tiếp.</p>
      </section>

      {!isAuthenticated && (
        <section className="core-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Flame size={48} style={{ color: '#f97316', marginBottom: '1rem', opacity: 0.6 }} />
          <h2 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Đăng nhập để theo dõi streak</h2>
          <p style={{ color: 'var(--text-muted, #888)', margin: 0 }}>Chuỗi học tập được lưu theo tài khoản của bạn.</p>
        </section>
      )}

      {isAuthenticated && (
        <StreakHero
          currentStreak={currentStreak}
          longestStreak={longestStreak}
          studiedToday={studiedToday}
          broken={broken}
          freezesRemaining={freezesRemaining}
          last7Days={last7Days}
          loading={loading}
          onStudyComplete={onNavigateToQuiz}
          onFreezeUsed={refresh}
        />
      )}

      {/* New Leaderboard System */}
      {isAuthenticated && (
        <section className="streak-leaderboard-v2 streak-page-leaderboard">
          <div className="streak-lb-header">
            <Trophy size={20} />
            <h3>Bảng xếp hạng streak</h3>
          </div>

          {/* Tab bar */}
          <div className="streak-lb-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={lbTab === 'all'}
              className={`streak-lb-tab ${lbTab === 'all' ? 'is-active' : ''}`}
              onClick={() => setLbTab('all')}
            >
              Toàn bộ
            </button>
            <button
              role="tab"
              aria-selected={lbTab === 'friends'}
              className={`streak-lb-tab ${lbTab === 'friends' ? 'is-active' : ''}`}
              onClick={() => setLbTab('friends')}
            >
              Bạn bè
            </button>
          </div>

          {lbLoading ? (
            <div className="streak-lb-loading">Đang tải bảng xếp hạng...</div>
          ) : entries.length === 0 ? (
            <div className="streak-lb-empty">
              <TrendingUp size={32} />
              <p>Chưa có ai trong bảng xếp hạng.</p>
              <small>Hãy học mỗi ngày để xuất hiện ở đây!</small>
            </div>
          ) : (
            <>
              <LeaderboardPodium entries={entries.slice(0, 3).map((e, i) => ({ ...e, rank: i + 1 }))} />
              <LeaderboardList entries={entries} currentUserId={userId} />
              <MyPositionBar me={me} isAuthenticated={isAuthenticated} />
            </>
          )}
        </section>
      )}

      {/* Fallback old leaderboard for unauthenticated */}
      {!isAuthenticated && (
        <StreakLeaderboard limit={20} className="streak-page-leaderboard" />
      )}
    </main>
  );
}
export default function App() {
  const { userId } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  // Selection HSK dùng chung = MẢNG số (chọn nhiều cấp). `level` scalar suy ra =
  // cấp thấp nhất, phục vụ các consumer chỉ dùng một cấp (today-plan, tiêu đề,
  // getTodaySession backend, LearningSession fallback).
  const [levels, setLevels] = useState(getInitialFocusLevels);
  const level = primaryLevel(levels);
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
    window.scrollTo({ top: 0, behavior: 'auto' });
    const activeNavBtn = document.querySelector('.sh-sidebar .sh-item.is-active');
    if (activeNavBtn && activeNavBtn.scrollIntoView) {
      activeNavBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    const t1 = setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 50);
    const t2 = setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
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
    return NAV_VIEWS.find(item => item.id === activeTab)?.label || 'Trang chính';
  }, [activeTab, generalCheckLevel]);
  const isDark = theme === 'dark';
  const localTodayPlan = useMemo(() => buildTodaySessionPlan({ analytics, stats, focusLevels: levels, modeId: selectedSessionMode }), [analytics, stats, levels, selectedSessionMode]);
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

  // Nhận cả mảng (multi-select mới) lẫn số đơn (call cũ: startQuizFlow/recommended/
  // generalCheck truyền recommendation.level). Chuẩn hoá về mảng, lưu JSON để
  // getInitialFocusLevels đọc lại đúng. Rỗng => giữ [1] để luôn có một cấp.
  const selectFocusLevel = (next) => {
    const nextLevels = normalizeLevels(next);
    const applied = nextLevels.length ? nextLevels : [1];
    setLevels(applied);
    window.localStorage.setItem('hskFocusLevel', JSON.stringify(applied));
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
      reason: 'Phiên tự tạo: chấm điểm ngay, không lưu.',
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
    <div className="sh-app">
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
      <aside className="sh-sidebar">
        {/* Thương hiệu: ảnh nhỏ + chữ, không dùng khối gradient to để bớt ồn. */}
        <div className="sh-brand">
          <span className="sh-brand-mark"><img src="/logo.jpg" alt="Tezca" /></span>
          <span className="sh-brand-text">
            <b>Tezca</b>
            <i>Luyện thi HSK</i>
          </span>
        </div>
        <SidebarNav activeTab={activeTab} onSelect={setActiveTab} />
      </aside>

      <section className="sh-shell">
        <header className="sh-topbar">
          <div className="sh-topbar-title">
            {/* Eyebrow = tên nhóm cha, giúp biết đang ở nhánh nào của nav 2 cấp. */}
            {NAV_PARENT_LABEL[activeTab] && <span className="sh-eyebrow">{NAV_PARENT_LABEL[activeTab]}</span>}
            <h2>{currentTitle}</h2>
          </div>
          <div className="sh-topbar-actions">
            <AuthControls />
            <button
              className="sh-theme-toggle"
              type="button"
              onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
              aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
              title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
            >
              {isDark ? <Sun size={17} strokeWidth={1.5} /> : <Moon size={17} strokeWidth={1.5} />}
            </button>
          </div>
        </header>

        <ErrorBoundary key={generalCheckLevel ? 'general' : activeTab}>
          {/* Fallback dựng đúng khung nội dung (không phải spinner) để tránh giật layout. */}
          <Suspense fallback={(
            <div className="sh-tab-loading" role="status" aria-label="Đang tải nội dung">
              <span className="sh-sk sh-sk-line" style={{ width: '32%' }} />
              <span className="sh-sk sh-sk-block" />
              <div className="sh-sk-row">
                <span className="sh-sk sh-sk-tile" />
                <span className="sh-sk sh-sk-tile" />
              </div>
            </div>
          )}>
          {generalCheckLevel && <GeneralCheck level={generalCheckLevel} onExit={closeGeneralCheck} onComplete={completeGeneralCheck} />}
          {!generalCheckLevel && activeTab === 'dashboard' && <Dashboard analytics={analytics} focusLevel={level} focusLevels={levels} todayPlan={todayPlan} selectedSessionMode={selectedSessionMode} showFirstRun={Boolean(analytics && !generalCheckState && !stats.answered)} onSelectLevel={selectFocusLevel} onOpenLessons={openFocusedLessons} onStartGeneralCheck={startGeneralCheck} onSkipFirstRun={skipGeneralCheck} onStartRecommended={startRecommendedQuiz} onSelectSessionMode={setSelectedSessionMode} onStartToday={startTodaySession} />}
          {!generalCheckLevel && activeTab === 'quiz' && <Quiz key={`${quizStrategyHint}-${autoStartKey}`} levels={levels} setLevels={selectFocusLevel} quizType={quizType} setQuizType={setQuizType} refreshStats={refreshStats} autoStartKey={autoStartKey} limit={quizLimit} strategyHint={quizStrategyHint} />}
          {!generalCheckLevel && activeTab === 'grammar' && <GrammarLab focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'translate' && <TranslationPractice focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'dictation' && <DictationMode focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'vocab' && <VocabLibrary focusLevels={levels} theme={theme} />}
          {!generalCheckLevel && activeTab === 'vocab-typing' && <VocabTypingMode focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'flashcard' && <FlashcardMode focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'confusable' && <ConfusablePairs focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'custom' && <CustomVocabInput onSessionCreated={handleCustomSessionCreated} />}
          {!generalCheckLevel && activeTab === 'speak' && <PronunciationPractice focusLevels={levels} />}
          {!generalCheckLevel && activeTab === 'voicechat' && <VoiceChat />}
          {!generalCheckLevel && activeTab === 'livecall' && <LiveCall onExit={() => setActiveTab('voicechat')} />}
          {!generalCheckLevel && activeTab === 'plan' && <StreakPage onNavigateToQuiz={() => setActiveTab('quiz')} />}
          {!generalCheckLevel && GAME_ENABLED && activeTab === 'merge-game' && MergeGame && <MergeGame />}
          {!generalCheckLevel && activeTab === 'session' && <LearningSession plan={activeSessionPlan || todayPlan} fallbackLevel={level} onExit={closeLearningSession} onComplete={refreshStats} />}
          </Suspense>
        </ErrorBoundary>
      </section>
      <AuthModalHost />
    </div>
  );
}
