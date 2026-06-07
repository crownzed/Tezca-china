import React, { useState, useEffect, useRef } from 'react';
import { Flame, Bookmark, CheckCircle2, Zap, CalendarDays, Brain, Target, AlertTriangle, BarChart3, Trophy, Sparkles } from 'lucide-react';

function getStreak() {
  try {
    const raw = localStorage.getItem('studyLog');
    if (!raw) return { streak: 0, dates: [], todayStudied: false };
    const dates = JSON.parse(raw);
    if (!Array.isArray(dates) || dates.length === 0) return { streak: 0, dates: [], todayStudied: false };
    const sorted = [...new Set(dates)].sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    let streak = 0;
    let cursor = new Date(today);
    const todayStudied = sorted[0] === today;
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      const expected = cursor.toISOString().split('T')[0];
      if (d === expected) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else if (i === 0 && d < expected) break;
      else break;
    }
    return { streak, dates: sorted, todayStudied };
  } catch { return { streak: 0, dates: [], todayStudied: false }; }
}

function getWeeklyActivity() {
  try {
    const raw = localStorage.getItem('studyLog');
    if (!raw) return [];
    const dates = JSON.parse(raw);
    if (!Array.isArray(dates)) return [];
    const today = new Date();
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const count = dates.filter(x => x === key).length;
      weekDays.push({ day: ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()], date: key, count, active: count > 0 });
    }
    return weekDays;
  } catch { return []; }
}

function get30DayHeatmap() {
  try {
    const raw = localStorage.getItem('studyLog');
    if (!raw) return [];
    const dates = JSON.parse(raw);
    if (!Array.isArray(dates)) return [];
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const count = dates.filter(x => x === key).length;
      const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
      days.push({ date: key, count, level, dayLabel: d.getDate() + '/' + (d.getMonth()+1) });
    }
    return days;
  } catch { return []; }
}

function recordVisit() {
  const today = new Date().toISOString().split('T')[0];
  try {
    const raw = localStorage.getItem('studyLog');
    const dates = raw ? JSON.parse(raw) : [];
    if (!dates.includes(today)) { dates.push(today); localStorage.setItem('studyLog', JSON.stringify(dates)); }
  } catch {}
}

function getStats() {
  const learned = (() => { try { return JSON.parse(localStorage.getItem('learnedIds'))?.length || 0; } catch { return 0; } })();
  const bookmarks = (() => { try { return JSON.parse(localStorage.getItem('bookmarkedIds'))?.length || 0; } catch { return 0; } })();
  const quizScore = (() => { try { return JSON.parse(localStorage.getItem('quizHighScore')) || 0; } catch { return 0; } })();
  return { learned, bookmarks, quizScore };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return { text: 'Chào buổi sáng!', emoji: '☀️', sub: 'Sẵn sàng học tiếng Trung nào!' };
  if (h >= 12 && h < 18) return { text: 'Buổi chiều năng suất!', emoji: '📚', sub: 'Tiếp tục phát huy nhé!' };
  if (h >= 18 && h < 22) return { text: 'Buổi tối thư giãn', emoji: '🌙', sub: 'Ôn bài trước khi nghỉ nhé!' };
  return { text: 'Khuya rồi', emoji: '🌟', sub: 'Nghỉ ngơi sớm nhé!' };
}

function getDailyGoals(srs, stats) {
  const today = new Date().toISOString().split('T')[0];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('dailyGoals')) || {}; } catch {}
  if (saved.date !== today) saved = { date: today, quizDone: false };

  const learnedToday = (() => {
    try {
      const log = JSON.parse(localStorage.getItem('dailyLearnCount')) || {};
      return log.date === today ? log.count : 0;
    } catch { return 0; }
  })();

  return [
    { label: 'Học 5 từ mới', done: learnedToday >= 5, progress: `${Math.min(learnedToday, 5)}/5` },
    { label: 'Ôn tập SRS', done: srs ? srs.due === 0 : false, progress: srs ? `${srs.due === 0 ? '✓' : srs.due + ' còn lại'}` : '...' },
    { label: 'Làm 1 quiz', done: saved.quizDone || false, progress: saved.quizDone ? '✓' : 'Chưa' },
  ];
}

// Animated counter hook
function useAnimatedCount(target, duration = 800) {
  const [count, setCount] = useState(0);
  const animRef = useRef(null);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setCount(Math.round(eased * target));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [target, duration]);
  return count;
}

export default function Dashboard() {
  const [streak, setStreak] = useState({ streak: 0, todayStudied: false });
  const [week, setWeek] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [stats, setStats] = useState({ learned: 0, bookmarks: 0, quizScore: 0 });
  const [totalCards, setTotalCards] = useState(1000);
  const [srs, setSrs] = useState(null);
  const [mistake, setMistake] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);

  useEffect(() => {
    recordVisit();
    setStreak(getStreak());
    setWeek(getWeeklyActivity());
    setHeatmap(get30DayHeatmap());
    setStats(getStats());
    Promise.all([
      import('../vocab-loader').then(m => m.loadAllFlashcards()).then(cards => {
        setTotalCards(cards.length);
        return cards;
      }),
      import('../srs-engine'),
      import('../mistake-tracker')
    ]).then(([cards, srsMod, mistakeMod]) => {
      setSrs(srsMod.getSRSStats(cards.map(c => c.id)));
      setMistake(mistakeMod.getMistakeStats());
    });
  }, []);

  const greeting = getGreeting();
  const goals = getDailyGoals(srs, stats);
  const maxCount = Math.max(...week.map(w => w.count), 1);

  // Animated values
  const animStreak = useAnimatedCount(streak.streak);
  const animMastered = useAnimatedCount(srs?.mastered || 0);
  const animDue = useAnimatedCount(srs?.due || 0);
  const animNew = useAnimatedCount(srs?.new || 0);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Greeting */}
      <div className="glass-panel" style={{ padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="greeting-text" style={{ fontSize: '2rem' }}>{greeting.emoji}</span>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>{greeting.text}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{greeting.sub}</div>
        </div>
      </div>

      {/* Top row: Streak + SRS overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
          <Flame size={22} style={{ color: '#f97316', marginBottom: 6 }} />
          <div className="stat-value animated-counter" style={{ color: '#f97316', fontSize: '1.8rem' }}>{animStreak}</div>
          <div className="stat-label">Ngày liên tiếp</div>
          {streak.todayStudied && <span className="tag tag-primary" style={{ marginTop: 4, fontSize: '0.65rem' }}>Hôm nay ✅</span>}
        </div>

        {srs && (
          <>
            <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
              <div className="stat-value animated-counter" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{animMastered}</div>
              <div className="stat-label">Đã thành thạo</div>
              <div className="progress-bar-container" style={{ marginTop: 6 }}>
                <div className="progress-bar-fill" style={{ width: `${(srs.mastered / totalCards) * 100}%` }} />
              </div>
            </div>
            <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
              <div className="stat-value animated-counter" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24' }}>{animDue}</div>
              <div className="stat-label">Cần ôn hôm nay</div>
            </div>
            <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
              <div className="stat-value animated-counter" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{animNew}</div>
              <div className="stat-label">Từ mới</div>
            </div>
          </>
        )}
      </div>

      {/* Daily Goals */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Trophy size={16} style={{ color: '#fbbf24' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Mục tiêu hôm nay</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {goals.filter(g => g.done).length}/{goals.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {goals.map((g, i) => (
            <div key={i} className={`goal-item ${g.done ? 'completed' : ''}`}>
              <div className="goal-check">
                {g.done && <CheckCircle2 size={14} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', color: g.done ? '#22c55e' : 'var(--text-secondary)', fontWeight: 500 }}>{g.label}</div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{g.progress}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--accent-2)', marginBottom: 6 }} />
          <div className="stat-value">{stats.learned}</div>
          <div className="stat-label">Đã thuộc (manual)</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <Bookmark size={20} style={{ color: 'gold', marginBottom: 6 }} />
          <div className="stat-value">{stats.bookmarks}</div>
          <div className="stat-label">Yêu thích</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'center' }}>
          <Zap size={20} style={{ color: '#a855f7', marginBottom: 6 }} />
          <div className="stat-value">{stats.quizScore}</div>
          <div className="stat-label">Quiz điểm cao</div>
        </div>
        {mistake && (
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <Target size={20} style={{ color: '#ef4444', marginBottom: 6 }} />
            <div className="stat-value">{mistake.weak}</div>
            <div className="stat-label">Từ yếu</div>
          </div>
        )}
      </div>

      {/* Overall progress bar */}
      {srs && (
        <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tổng tiến độ học tập</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{Math.round(srs.mastered / totalCards * 100)}%</span>
          </div>
          <div className="progress-bar-container" style={{ height: 8 }}>
            <div className="progress-bar-fill" style={{ width: `${(srs.mastered / totalCards) * 100}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span>🆕 Mới: {srs.new}</span>
            <span>📖 Ôn: {srs.due}</span>
            <span>📚 Đang học: {srs.learning}</span>
            <span>✅ Thành thạo: {srs.mastered}</span>
            <span>📊 Hệ số: {srs.avgEase}</span>
          </div>
        </div>
      )}

      {/* Weekly activity */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <CalendarDays size={16} style={{ color: 'var(--accent-2)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Hoạt động 7 ngày</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-end', height: 80 }}>
          {week.map((d, i) => (
            <div key={i} className="tooltip-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              onMouseEnter={() => setHoveredDay(i)} onMouseLeave={() => setHoveredDay(null)}>
              <span className="tooltip-text">{d.date}: {d.count} lần</span>
              <div style={{
                width: '100%', maxWidth: 30, borderRadius: '4px 4px 0 0',
                background: d.active ? 'var(--accent-1)' : 'rgba(91,106,191,0.08)',
                height: `${Math.max(6, (d.count / maxCount) * 60)}px`,
                transition: 'all 0.3s', minHeight: 6,
                opacity: hoveredDay === i ? 1 : 0.85,
                transform: hoveredDay === i ? 'scaleY(1.08)' : 'scaleY(1)',
                transformOrigin: 'bottom'
              }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 30-day heatmap */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Sparkles size={16} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>30 ngày gần đây</span>
        </div>
        <div className="heatmap-grid">
          {heatmap.map((d, i) => (
            <div key={i} className={`heatmap-cell tooltip-wrap level-${d.level}`}>
              <span className="tooltip-text">{d.dayLabel}: {d.count} lần</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Ít</span>
          {[0,1,2,3,4].map(l => (
            <div key={l} className={`heatmap-cell level-${l}`} style={{ width: 10, height: 10, aspectRatio: 'auto' }} />
          ))}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Nhiều</span>
        </div>
      </div>

      {/* Mistake + accuracy */}
      {mistake && (
        <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AlertTriangle size={16} style={{ color: '#f97316' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Thống kê sai sót</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#22c55e' }}>{mistake.accuracy}%</span><div className="stat-label">Chính xác</div></div>
            <div><span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ef4444' }}>{mistake.weak}</span><div className="stat-label">Từ yếu</div></div>
            <div><span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#3b82f6' }}>{mistake.total}</span><div className="stat-label">Đã theo dõi</div></div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="glass-panel" style={{ padding: 14 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          <BarChart3 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Gợi ý
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {srs?.due > 0 ? '📌 Bạn có ' + srs.due + ' từ cần ôn hôm nay. Vào Flashcards để ôn tập SRS.' : 
           srs?.new > 0 ? '🆕 Có ' + srs.new + ' từ mới sẵn sàng để học.' :
           '📝 Học 5-10 từ mới mỗi ngày để duy trì streak.'}
          {mistake?.weak > 0 && ` ⚠️ ${mistake.weak} từ yếu cần chú ý.`}
        </div>
      </div>
    </div>
  );
}
