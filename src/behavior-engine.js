import { scopedKey } from './user-scope';

const STATE_COPY = {
  ready_deep: {
    label: 'Sẵn sàng học sâu',
    nudge: 'Nền đang ổn. Có thể thêm nghe/ngữ cảnh nếu còn thời gian.',
  },
  ready_short: {
    label: 'Phiên ngắn',
    nudge: 'Giữ lịch ôn bằng vài mục quan trọng, không cần thêm tải mới.',
  },
  fragile: {
    label: 'Cần củng cố nhẹ',
    nudge: 'Giảm nhịp một chút: gặp lại câu dễ hơn trước khi thêm từ mới.',
  },
  overloaded: {
    label: 'Giảm tải',
    nudge: 'Dừng thêm tải mới. Làm ít câu hơn để giữ độ chính xác.',
  },
  returning: {
    label: 'Khởi động lại',
    nudge: 'Mẹo hôm nay: Chỉ cần dành 5 phút để giữ mạch ghi nhớ, không áp lực từ mới!',
  },
  habit_building: {
    label: 'Xây thói quen',
    nudge: 'Hoàn thành một phiên nhỏ để hệ thống tạo lịch ôn đầu tiên.',
  },
  maintenance: {
    label: 'Duy trì',
    nudge: 'Học hôm nay theo nhịp vừa sức, có thể tắt nhắc nhở bất cứ lúc nào.',
  },
};

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readDate(key) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ewma(values, fallback = 0, alpha = 0.35) {
  if (!values.length) return Number(fallback) || 0;
  return values.reduce((current, value) => alpha * Number(value) + (1 - alpha) * current, Number(values[0]) || 0);
}

function recentAnswerEvents() {
  const history = readJson(scopedKey('coreHistory'), []);
  const sessionSummaries = readJson(scopedKey('learningSessionSummaries'), []);
  const quizEvents = history
    .flatMap(attempt => (attempt.answers || []).map(answer => ({ ...answer, created_at: attempt.created_at })))
  const sessionEvents = sessionSummaries
    .flatMap(session => (session.answers || []).map(answer => ({ ...answer, created_at: session.completed_at || session.started_at })));
  // Trộn HAI nguồn rồi sắp theo created_at TĂNG DẦN trước khi lấy 40 gần nhất.
  // Trước đây chỉ nối [...quiz, ...session] theo nguồn nên slice(-40) thiên lệch
  // về session events bất kể độ mới thật; wrongStreak/EWMA (đọc theo thứ tự thời
  // gian) vì thế tính trên dữ liệu sai thứ tự → phân loại fragile/overloaded lệch.
  const toTime = (e) => { const t = new Date(e.created_at).getTime(); return Number.isNaN(t) ? 0 : t; };
  return [...quizEvents, ...sessionEvents].sort((a, b) => toTime(a) - toTime(b)).slice(-40);
}

function recentCompletionRate() {
  const summaries = readJson(scopedKey('learningSessionSummaries'), []);
  if (!summaries.length) return 0;
  const recent = summaries.slice(-10);
  const completed = recent.filter(item => item.completed_at).length;
  return Math.round((completed / recent.length) * 100);
}

function wrongStreak(events) {
  let streak = 0;
  for (const event of [...events].reverse()) {
    if (event.correct) break;
    streak += 1;
  }
  return streak;
}

function daysSince(date) {
  if (!date) return 0;
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

function reasonFor(state, metrics, weakCount, dueCount) {
  if (state === 'returning') return 'Đã vài ngày bạn chưa ôn tập, hãy "hâm nóng" lại bộ não với nhóm từ đến hạn nào.';
  if (state === 'fragile') return `Có ${weakCount} nhóm yếu hoặc ${metrics.wrongStreak} câu sai liên tiếp, nên giảm độ khó.`;
  if (state === 'overloaded') return `Tốc độ trả lời đang chậm (${Math.round(metrics.ewmaLatencyMs / 1000)}s) và độ chính xác chưa ổn.`;
  if (state === 'ready_short') return 'Bạn chọn phiên ngắn, hệ thống ưu tiên giữ lịch ôn.';
  if (state === 'ready_deep') return `EWMA chính xác ${metrics.ewmaAccuracy}%, confidence ${metrics.ewmaConfidence.toFixed(1)}, backlog thấp.`;
  if (state === 'habit_building') return 'Chưa có nhiều dữ liệu, nên bắt đầu bằng phiên nhỏ dễ hoàn thành.';
  if (dueCount) return `Có ${dueCount} mục đến hạn, nên bảo vệ trí nhớ trước.`;
  return 'Nhịp học ổn, tiếp tục phiên cân bằng.';
}

export function inferBehaviorState({ analytics, stats, selectedMode = 'standard', dueCount = 0, weakCount = 0 }) {
  const answered = analytics?.answered || stats?.answered || 0;
  const accuracy = analytics?.accuracy ?? stats?.accuracy ?? 0;
  const events = recentAnswerEvents();
  const accuracyValues = events.map(event => event.correct ? 100 : 0);
  const confidenceValues = events.map(event => event.confidence).filter(Boolean);
  const latencyValues = events.map(event => event.latency_ms).filter(value => value !== null && value !== undefined);
  const metrics = {
    ewmaAccuracy: Math.round(ewma(accuracyValues, accuracy)),
    ewmaConfidence: ewma(confidenceValues, 0),
    ewmaLatencyMs: Math.round(ewma(latencyValues, 0)),
    completionRate: recentCompletionRate(),
    wrongStreak: wrongStreak(events),
  };
  const lastActivity = readDate(scopedKey('lastLearningSessionCompletedAt')) || readDate(scopedKey('lastLearningSessionStartedAt'));
  const inferredWeakCount = weakCount || analytics?.weak_words || stats?.weak_words || 0;

  let state = 'maintenance';
  if (!answered && !events.length) {
    state = 'habit_building';
  } else if (daysSince(lastActivity) > 3) {
    state = 'returning';
  } else if (metrics.wrongStreak >= 3 || (metrics.ewmaConfidence > 0 && metrics.ewmaConfidence < 2.4) || inferredWeakCount >= 4 || metrics.ewmaAccuracy < 55) {
    state = 'fragile';
  } else if (metrics.ewmaLatencyMs >= 12000 && metrics.ewmaAccuracy < 72) {
    state = 'overloaded';
  } else if (selectedMode === 'micro') {
    state = 'ready_short';
  } else if (metrics.completionRate >= 75 && metrics.ewmaAccuracy >= 75 && dueCount <= 5 && inferredWeakCount <= 1) {
    state = 'ready_deep';
  }

  const copy = STATE_COPY[state] || STATE_COPY.maintenance;
  return {
    state,
    label: copy.label,
    nudge: copy.nudge,
    reason: reasonFor(state, metrics, inferredWeakCount, dueCount),
    forceMicro: state === 'returning' || state === 'overloaded',
    blockNewWords: state === 'returning' || state === 'overloaded' || state === 'fragile' || state === 'ready_short' || dueCount > 30,
    reduceDifficulty: state === 'fragile' || state === 'overloaded' || state === 'returning',
    allowStretch: state === 'ready_deep',
    metrics,
  };
}

export function markLearningSessionCompleted(summary = {}) {
  if (typeof window === 'undefined') return;
  try {
    const completedAt = new Date().toISOString();
    window.localStorage.setItem(scopedKey('lastLearningSessionCompletedAt'), completedAt);
    const summaries = readJson(scopedKey('learningSessionSummaries'), []);
    // Cập nhật record "phiên bắt đầu" (completed_at=null) gần nhất do
    // markLearningSessionStarted ghi, thay vì luôn thêm mới — nếu không, mỗi phiên
    // sẽ có 2 bản ghi (1 dở + 1 xong) và recentCompletionRate lệch. Không tìm thấy
    // record mở nào (vd phiên khởi tạo trước bản vá này) thì thêm mới như cũ.
    let patched = false;
    const next = [];
    for (let i = summaries.length - 1; i >= 0; i -= 1) {
      const item = summaries[i];
      if (!patched && item && !item.completed_at) {
        next.unshift({ ...item, ...summary, completed_at: completedAt });
        patched = true;
      } else {
        next.unshift(item);
      }
    }
    if (!patched) next.push({ ...summary, completed_at: completedAt });
    window.localStorage.setItem(scopedKey('learningSessionSummaries'), JSON.stringify(next.slice(-20)));
  } catch {
    /* ignore */
  }
}
