import { inferBehaviorState } from './behavior-engine';
import { scopedKey } from './user-scope';

const QUIZ_TYPE_LABELS = {
  vocab: 'Từ vựng',
  listening: 'Nghe',
  dialogue: 'Hội thoại',
  reading: 'Đọc hiểu',
  translation: 'Dịch đoạn',
  cloze: 'Điền từ',
};

export const SESSION_MODES = [
  {
    id: 'micro',
    label: '5 phút',
    title: 'Ôn nhanh',
    pillTitle: 'Ôn nhanh',
    pillSub: '5 phút',
    limit: 5,
    newWords: 0,
    description: 'Giữ nhịp bằng từ cần ôn, không thêm tải mới.',
  },
  {
    id: 'standard',
    label: '20 phút',
    title: 'Học hôm nay',
    pillTitle: 'Vừa sức',
    pillSub: '20 phút',
    limit: 10,
    newWords: 6,
    description: 'Cân bằng ôn, sửa lỗi và vài từ mới vừa sức.',
  },
  {
    id: 'deep',
    label: '45 phút',
    title: 'Học sâu',
    pillTitle: 'Tập trung sâu',
    pillSub: '45 phút',
    limit: 16,
    newWords: 8,
    description: 'Thêm ngữ cảnh và nghe nhiều hơn khi nền ổn.',
  },
];

function modeById(modeId) {
  return SESSION_MODES.find(mode => mode.id === modeId) || SESSION_MODES[1];
}

function getWeakWords(analytics) {
  return Array.isArray(analytics?.weak_word_list) ? analytics.weak_word_list : [];
}

function getWeakestType(analytics) {
  // drag_drop chỉ render đúng trong Quiz, không phải trong LearningSession (lưới
  // trắc nghiệm). Loại nó khỏi targetSkill để phiên học không nhận dạng bài này.
  const practiced = (analytics?.type_breakdown || []).filter(item => item.answered > 0 && item.quiz_type !== 'drag_drop');
  if (!practiced.length) return analytics?.recommendation?.quiz_type || 'vocab';
  return [...practiced].sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)[0]?.quiz_type || 'vocab';
}

function buildMissions({ analytics, stats, mode, weakWords, dueCount, repairCount, newCount, behavior }) {
  const hasHistory = (analytics?.answered || stats?.answered || 0) > 0;
  const protectedCount = hasHistory ? dueCount : 0;

  return [
    {
      key: 'due',
      label: 'Cần ôn',
      value: protectedCount ? `${protectedCount} từ sắp quên` : 'Tạo nền',
      detail: protectedCount ? 'Xử lý nhanh nhóm này trước khi chúng "bay màu" khỏi não bộ.' : 'Bắt đầu bằng kiểm tra nhẹ để tạo dữ liệu.',
      tone: 'gold',
    },
    {
      key: 'repair',
      label: 'Sửa lỗi',
      value: repairCount ? `${repairCount} vết sẹo cần lành` : 'Chưa có',
      detail: repairCount ? `Tập trung khắc phục triệt để lỗi sai của: ${weakWords.slice(0, 3).map(item => item.hanzi).join(', ')}...` : 'Lỗi sai sẽ được gom tại đây sau mỗi phiên.',
      tone: repairCount ? 'cinnabar' : 'jade',
    },
    {
      key: 'new',
      label: 'Từ mới',
      value: newCount ? `${newCount} từ` : 'Đang đóng băng',
      detail: newCount ? mode.description : 'Dọn sạch từ cũ là hộp từ mới sẽ tự động mở ra ngay!',
      tone: newCount ? 'jade' : 'blue',
    },
    {
      key: 'stability',
      label: 'Trạng thái',
      value: `Nhịp độ: ${behavior.label}`,
      detail: behavior.nudge || (hasHistory ? 'Giữ nhịp học ổn định, không nhồi nhét quá tải.' : 'Hoàn thành một phiên để đo nhịp nhớ.'),
      tone: ['ready_deep', 'maintenance'].includes(behavior.state) ? 'jade' : ['fragile', 'overloaded'].includes(behavior.state) ? 'cinnabar' : 'gold',
    },
  ];
}

export function buildTodaySessionPlan({ analytics, stats, focusLevel = 1, modeId = 'standard' }) {
  const selectedMode = modeById(modeId);
  const weakWords = getWeakWords(analytics);
  const answered = analytics?.answered || stats?.answered || 0;
  const weakCount = analytics?.weak_words ?? stats?.weak_words ?? weakWords.length;
  const weakestType = getWeakestType(analytics);
  const recommendation = analytics?.recommendation || {};
  const targetLevel = Number(recommendation.level || weakWords[0]?.level || focusLevel || 1);
  const dueProxy = answered ? Math.max(weakWords.length, weakCount, Math.min(8, Math.ceil(answered * 0.08))) : 0;
  const behaviorProbe = inferBehaviorState({ analytics, stats, selectedMode: selectedMode.id, dueCount: dueProxy, weakCount });
  const mode = behaviorProbe.forceMicro ? modeById('micro') : selectedMode;
  const behavior = inferBehaviorState({ analytics, stats, selectedMode: mode.id, dueCount: dueProxy, weakCount });
  const dueCount = mode.id === 'micro' ? Math.min(5, Math.max(3, dueProxy || 3)) : Math.min(18, Math.max(0, dueProxy));
  const repairCount = Math.min(weakWords.length || weakCount || 0, mode.id === 'deep' ? 8 : 5);
  const shouldBlockNew = behavior.blockNewWords || mode.id === 'micro' || dueCount > 30;
  const newCount = shouldBlockNew ? 0 : mode.newWords;
  const targetSkill = behavior.reduceDifficulty ? 'vocab' : mode.id === 'deep' && weakestType === 'vocab' ? 'listening' : weakestType;
  const focusWords = weakWords.length
    ? weakWords.slice(0, 4).map(item => ({ hanzi: item.hanzi, pinyin: item.pinyin, accuracy: item.accuracy }))
    : (recommendation.focus_words || []).slice(0, 4).map(hanzi => ({ hanzi, pinyin: '', accuracy: 0 }));

  return {
    mode,
    selectedMode,
    behaviorState: behavior.state,
    behaviorLabel: behavior.label,
    behaviorReason: behavior.reason,
    nudge: behavior.nudge,
    forceMicro: behavior.forceMicro,
    blockNewWords: behavior.blockNewWords,
    reduceDifficulty: behavior.reduceDifficulty,
    allowStretch: behavior.allowStretch,
    behaviorMetrics: behavior.metrics,
    level: targetLevel,
    quizType: targetSkill,
    limit: mode.limit,
    dueCount,
    repairCount,
    newCount,
    focusWords,
    missions: buildMissions({ analytics, stats, mode, weakWords, dueCount, repairCount, newCount, behavior }),
    title: behavior.state === 'returning' ? 'Kích hoạt lại phản xạ' : behavior.state === 'fragile' ? 'Củng cố nhẹ' : behavior.state === 'overloaded' ? 'Giảm tải hôm nay' : mode.id === 'micro' ? 'Giữ nhịp hôm nay' : mode.id === 'deep' ? 'Phiên học sâu' : 'Học hôm nay',
    subtitle: behavior.state === 'returning'
      ? `Hệ thống đã gom sẵn các từ vựng HSK ${targetLevel} bạn dễ quên nhất để khởi động.`
      : answered
        ? `${behavior.label}: ưu tiên ${QUIZ_TYPE_LABELS[targetSkill] || 'Từ vựng'} HSK ${targetLevel}, dựa trên dữ liệu gần nhất.`
        : `Khởi động HSK ${targetLevel} bằng phiên nhẹ để tạo đường chuẩn.`,
    reason: behavior.reason || recommendation.reason || 'Chưa đủ dữ liệu, nên bắt đầu bằng từ vựng HSK 1 để tạo đường chuẩn.',
    action: {
      level: targetLevel,
      quizType: targetSkill,
      limit: mode.limit,
    },
  };
}

export function markLearningSessionStarted() {
  try {
    const startedAt = new Date().toISOString();
    window.localStorage.setItem(scopedKey('lastLearningSessionStartedAt'), startedAt);
    // Ghi một summary "phiên bắt đầu" với completed_at=null để recentCompletionRate
    // đếm được cả phiên BỎ DỞ. Trước đây chỉ phiên hoàn thành mới được lưu summary,
    // nên completed/tổng luôn = 1 (completionRate luôn 100%) → gate ready_deep hiển
    // nhiên đúng và tín hiệu "quá tải" chết. markLearningSessionCompleted sẽ cập nhật
    // record dở gần nhất thay vì thêm mới.
    const raw = window.localStorage.getItem(scopedKey('learningSessionSummaries'));
    const summaries = (() => { try { return JSON.parse(raw) || []; } catch { return []; } })();
    const next = [...summaries, { started_at: startedAt, completed_at: null }].slice(-20);
    window.localStorage.setItem(scopedKey('learningSessionSummaries'), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
