// ============================================================
// GRAMMAR LAB — Mục "Ngữ pháp" độc lập
// 4 view: overview (theo dõi tiến độ + điều hướng), theory (học lý
// thuyết), practice (luyện theo bài), review (ôn tập thông minh).
//
// Chạy hoàn toàn local: chấm điểm cục bộ theo correctIndex, lưu tiến
// độ qua grammar-progress (Leitner + mastery), KHÔNG đụng coreStats /
// analytics của từ vựng.
// ============================================================
import { Fragment, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CalendarClock, CheckCircle2, GraduationCap, Play, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import { grammarLessons, getGrammarLessonsByLevel } from '../grammar-db.js';
import { sampleN } from '../grammar-engine.js';
import { getGrammarSummary, getLessonProgress, getDueLessons, recordGrammarResult } from '../grammar-progress.js';
import { ClickableChineseText, TonedPinyin } from './chinese-text.jsx';

const GRAMMAR_LEVELS = [1, 2, 3, 4, 5, 6];
const TOTAL_LESSONS = grammarLessons.length;

function reviewDueText(nextReviewAt) {
  if (!nextReviewAt) return '';
  const diffMs = new Date(nextReviewAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Đến hạn ôn';
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return days <= 1 ? 'Ôn lại ngày mai' : `Ôn lại sau ${days} ngày`;
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Xáo trộn thứ tự đáp án của một câu để đáp án đúng không luôn ở vị trí A,
// đồng thời cập nhật lại correctIndex theo vị trí mới.
function shuffleOptions(q) {
  if (!Array.isArray(q.options) || q.options.length < 2) return q;
  const correctValue = q.options[q.correctIndex];
  const options = shuffle(q.options);
  return { ...q, options, correctIndex: options.indexOf(correctValue) };
}

// ── Luồng luyện (dùng chung cho practice + review) ──────────
// questions: [{ question, options, correctIndex, explanation, lessonId }]
// Chấm cục bộ; khi xong gọi onFinish(perLessonResults).
function PracticeRunner({ title, questions, onExit, onFinish }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [dragOrder, setDragOrder] = useState([]);

  const total = questions.length;
  const q = questions[index];
  const progress = total ? Math.round(((index + 1) / total) * 100) : 0;
  const isCorrect = selected === q?.correctIndex;

  const dragSegments = useMemo(() => {
    if (!q || q.type !== 'sentence_order') return [];
    const idx = q.question.indexOf(':');
    const content = idx !== -1 ? q.question.substring(idx + 1) : q.question;
    return content.split('/').map(s => s.trim()).filter(Boolean);
  }, [q]);

  const toggleDragToken = (tokenIndex) => {
    if (revealed) return;
    setDragOrder(prev => {
      if (prev.includes(tokenIndex)) {
        return prev.filter(i => i !== tokenIndex);
      }
      return [...prev, tokenIndex];
    });
  };

  const submitDragDrop = () => {
    if (revealed) return;
    const userSentence = dragOrder.map(i => dragSegments[i]).join('');
    const isCorrectAns = userSentence === q.options[q.correctIndex];
    setSelected(isCorrectAns ? q.correctIndex : -1);
    setRevealed(true);
    setAnswers(prev => [...prev, { lessonId: q.lessonId, correct: isCorrectAns }]);
  };

  const choose = (optionIndex) => {
    if (revealed) return;
    setSelected(optionIndex);
    setRevealed(true);
    setAnswers(prev => [...prev, { lessonId: q.lessonId, correct: optionIndex === q.correctIndex }]);
  };

  const next = () => {
    if (index + 1 >= total) {
      onFinish(answers);
      return;
    }
    setIndex(i => i + 1);
    setSelected(null);
    setRevealed(false);
    setDragOrder([]);
  };

  if (!q) return null;

  return (
    <section className="core-card question-card learning-question-card">
      <div className="question-topline">
        <button type="button" className="grammar-back" onClick={onExit}><ArrowLeft size={16} /> {title}</button>
        <strong>{index + 1}/{total}</strong>
      </div>
      <div className="quiz-progress"><span style={{ width: `${progress}%` }} /></div>

      {q.type === 'sentence_order' ? (
        <div className="drag-drop-area">
          <div className="drag-drop-prompt">
            <h2 className="drag-drop-label">Sắp xếp các từ thành câu đúng:</h2>
          </div>
          
          <div className="drag-answer-zone">
            {dragOrder.length === 0 ? (
              <span className="drag-hint">Bấm vào từ bên dưới để ghép câu…</span>
            ) : (
              dragOrder.map((tokenIndex, pos) => (
                <Fragment key={`ans-${pos}`}>
                  {pos > 0 && <span className="drag-slash">/</span>}
                  <button
                    type="button"
                    className="drag-chip drag-chip--selected"
                    onClick={() => toggleDragToken(tokenIndex)}
                    title="Bấm để bỏ ra"
                    disabled={revealed}
                  >
                    {dragSegments[tokenIndex]}
                  </button>
                </Fragment>
              ))
            )}
          </div>

          <div className="drag-source-zone">
            {dragSegments.map((token, i) => {
              const used = dragOrder.includes(i);
              return (
                <Fragment key={`src-${i}`}>
                  {i > 0 && <span className={`drag-slash ${used ? 'drag-slash--faded' : ''}`}>/</span>}
                  <button
                    type="button"
                    className={`drag-chip ${used ? 'drag-chip--used' : 'drag-chip--available'}`}
                    onClick={() => !used && toggleDragToken(i)}
                    disabled={used || revealed}
                    aria-label={used ? `${token} (đã chọn)` : `Chọn ${token}`}
                  >
                    {token}
                  </button>
                </Fragment>
              );
            })}
          </div>

          <div className="drag-action-row" style={{ display: 'flex', gap: '10px', marginTop: '12px', justifyContent: 'flex-end' }}>
            {dragOrder.length > 0 && !revealed && (
              <button
                type="button"
                className="btn-ghost drag-reset-btn"
                onClick={() => setDragOrder([])}
              >
                ↺ Đặt lại
              </button>
            )}
            {!revealed && (
              <button
                type="button"
                className="btn-primary"
                onClick={submitDragDrop}
                disabled={dragOrder.length !== dragSegments.length}
              >
                Kiểm tra
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2><ClickableChineseText text={q.question} /></h2>
          <div className="option-grid">
            {q.options.map((option, optionIndex) => {
              const revealCorrect = revealed && optionIndex === q.correctIndex;
              const revealWrong = revealed && optionIndex === selected && optionIndex !== q.correctIndex;
              const isMuted = revealed
                ? !revealCorrect && !revealWrong
                : selected !== null && selected !== optionIndex;
              const optionClass = [
                selected === optionIndex && !revealed ? 'selected' : '',
                revealCorrect ? 'option-correct' : '',
                revealWrong ? 'option-wrong' : '',
                isMuted ? 'muted-option' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={optionIndex}
                  className={optionClass}
                  onClick={() => choose(optionIndex)}
                  disabled={revealed}
                >
                  <span>{revealCorrect ? '✓' : revealWrong ? '✕' : String.fromCharCode(65 + optionIndex)}</span>
                  <ClickableChineseText text={option} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {revealed && (
        <div className={`feedback-panel ${isCorrect ? 'feedback-panel--correct' : 'feedback-panel--wrong'}`}>
          <div className="feedback-head">
            {isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            <strong>{isCorrect ? 'Đúng' : 'Cần sửa'}</strong>
          </div>
          <p>{q.explanation || 'Xem lại điểm ngữ pháp của bài.'}</p>
          {!isCorrect && <small>Đáp án: {q.options[q.correctIndex]}</small>}
          <button className="btn-primary" type="button" onClick={next}>{index + 1 >= total ? 'Xong' : 'Tiếp'}</button>
        </div>
      )}
    </section>
  );
}

// ── Màn lý thuyết ───────────────────────────────────────────
function TheoryView({ lesson, onExit, onPractice }) {
  const { point } = lesson;
  return (
    <section className="core-card grammar-theory">
      <div className="question-topline">
        <button type="button" className="grammar-back" onClick={onExit}><ArrowLeft size={16} /> Danh sách bài</button>
        <span className="grammar-level-badge">HSK {lesson.level}</span>
      </div>
      <h1 className="grammar-theory-title">{lesson.title}</h1>
      <p className="grammar-theory-desc">{lesson.desc}</p>

      <div className="grammar-structure">
        <small>Cấu trúc</small>
        <strong><ClickableChineseText text={point.structure} /></strong>
      </div>

      <p className="grammar-explain">{point.explain}</p>

      <div className="grammar-examples">
        <small>Ví dụ</small>
        {point.examples.map((ex, i) => (
          <div className="grammar-example" key={i}>
            <ClickableChineseText text={ex.cn} className="grammar-example-cn" />
            <TonedPinyin pinyin={ex.pinyin} className="grammar-example-pinyin" />
            <span className="grammar-example-vi">{ex.vi}</span>
          </div>
        ))}
      </div>

      {point.note && (
        <div className="grammar-note">
          <Sparkles size={16} />
          <span>{point.note}</span>
        </div>
      )}

      <button className="btn-primary grammar-theory-cta" type="button" onClick={onPractice}>
        <Play size={16} /> Luyện bài này
      </button>
    </section>
  );
}

// ── Màn kết quả sau khi luyện ───────────────────────────────
function ResultView({ correct, total, records, onAgain, onExit }) {
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return (
    <section className="core-card result-card">
      <span className="core-eyebrow">Kết quả luyện ngữ pháp</span>
      <h1>{accuracy >= 80 ? 'Nắm chắc rồi' : accuracy >= 70 ? 'Đã qua bài' : 'Cần ôn thêm'}</h1>
      <div className="result-summary">
        <strong>{accuracy}%</strong>
        <span>{correct}/{total} câu đúng</span>
      </div>
      {records.length > 0 && (
        <ul className="result-narrative">
          {records.map(rec => (
            <li key={rec.lessonId}>
              <GraduationCap size={16} /> <strong>{rec.title}</strong>: mastery {rec.mastery}% · {reviewDueText(rec.nextReviewAt)}
            </li>
          ))}
        </ul>
      )}
      <div className="result-actions">
        <button className="btn-primary" type="button" onClick={onAgain}><RotateCcw size={16} /> Luyện lại</button>
        <button className="btn-secondary" type="button" onClick={onExit}><BookOpen size={16} /> Về danh sách</button>
      </div>
    </section>
  );
}

export default function GrammarLab({ focusLevel = 1 }) {
  const [view, setView] = useState('overview');
  const [activeLevel, setActiveLevel] = useState(GRAMMAR_LEVELS.includes(Number(focusLevel)) ? Number(focusLevel) : 1);
  const [activeLesson, setActiveLesson] = useState(null);
  const [runnerQuestions, setRunnerQuestions] = useState([]);
  const [runnerTitle, setRunnerTitle] = useState('');
  const [result, setResult] = useState(null);
  // Bump để buộc đọc lại tiến độ từ localStorage sau khi ghi kết quả.
  const [progressTick, setProgressTick] = useState(0);

  // progressTick là dependency CỐ Ý: đọc lại localStorage sau mỗi lần ghi kết quả.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => getGrammarSummary(TOTAL_LESSONS), [progressTick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dueLessons = useMemo(() => new Set(getDueLessons()), [progressTick]);
  const lessons = useMemo(() => getGrammarLessonsByLevel(activeLevel), [activeLevel]);

  const startLessonPractice = (lesson) => {
    setActiveLesson(lesson);
    setRunnerTitle(lesson.title);
    // Kho câu ~100/bài — mỗi phiên rút ngẫu nhiên 14 câu để phiên vừa phải,
    // tránh học vẹt và tránh mastery bão hòa 100% chỉ sau 1 lượt.
    const picked = sampleN(lesson.questions, 14);
    setRunnerQuestions(picked.map(qq => shuffleOptions({ ...qq, lessonId: lesson.id })));
    setResult(null);
    setView('practice');
  };

  const startReview = () => {
    const dueIds = getDueLessons();
    if (!dueIds.length) return;
    // Rút ~4 câu/bài đến hạn để phiên ôn tập không quá dài.
    const pool = grammarLessons
      .filter(lesson => dueIds.includes(lesson.id))
      .flatMap(lesson => sampleN(lesson.questions, 4).map(qq => shuffleOptions({ ...qq, lessonId: lesson.id })));
    setActiveLesson(null);
    setRunnerTitle('Ôn tập thông minh');
    setRunnerQuestions(shuffle(pool));
    setResult(null);
    setView('review');
  };

  const openTheory = (lesson) => {
    setActiveLesson(lesson);
    setView('theory');
  };

  const finishRunner = (answers) => {
    const correct = answers.filter(a => a.correct).length;
    // Gom kết quả theo bài rồi ghi từng bài (mastery + Leitner box).
    const byLesson = new Map();
    answers.forEach(a => {
      const row = byLesson.get(a.lessonId) || { correct: 0, total: 0 };
      row.total += 1;
      if (a.correct) row.correct += 1;
      byLesson.set(a.lessonId, row);
    });
    const records = [];
    byLesson.forEach((row, lessonId) => {
      const rec = recordGrammarResult(lessonId, row);
      const lesson = grammarLessons.find(l => l.id === lessonId);
      records.push({ lessonId, title: lesson?.title || lessonId, mastery: rec.mastery, nextReviewAt: rec.nextReviewAt });
    });
    setResult({ correct, total: answers.length, records });
    setProgressTick(t => t + 1);
    setView('result');
  };

  const backToOverview = () => {
    setView('overview');
    setActiveLesson(null);
    setResult(null);
  };

  // ── Render theo view ──
  if (view === 'theory' && activeLesson) {
    return (
      <main className="core-page page-enter grammar-lab">
        <TheoryView lesson={activeLesson} onExit={backToOverview} onPractice={() => startLessonPractice(activeLesson)} />
      </main>
    );
  }

  if ((view === 'practice' || view === 'review') && runnerQuestions.length > 0) {
    return (
      <main className="core-page page-enter grammar-lab">
        <PracticeRunner
          title={runnerTitle}
          questions={runnerQuestions}
          onExit={backToOverview}
          onFinish={finishRunner}
        />
      </main>
    );
  }

  if (view === 'result' && result) {
    return (
      <main className="core-page page-enter grammar-lab">
        <ResultView
          correct={result.correct}
          total={result.total}
          records={result.records}
          onAgain={() => {
            if (activeLesson) startLessonPractice(activeLesson);
            else startReview();
          }}
          onExit={backToOverview}
        />
      </main>
    );
  }

  // overview
  return (
    <main className="core-page page-enter grammar-lab">
      <section className="core-card core-section-head">
        <h1><GraduationCap size={22} /> Ngữ pháp</h1>
        <p>Học lý thuyết, luyện theo bài và ôn tập thông minh — HSK 1 đến 3.</p>
      </section>

      <section className="core-card grammar-summary">
        <div className="grammar-summary-stat">
          <strong>{summary.studied}/{summary.total}</strong>
          <small>bài đã học</small>
        </div>
        <div className="grammar-summary-stat">
          <strong>{summary.avgMastery}%</strong>
          <small>mastery trung bình</small>
        </div>
        <div className="grammar-summary-stat">
          <strong>{summary.dueCount}</strong>
          <small>bài đến hạn ôn</small>
        </div>
        {summary.dueCount > 0 && (
          <button className="btn-primary grammar-review-cta" type="button" onClick={startReview}>
            <Brain size={16} /> Ôn tập thông minh
          </button>
        )}
      </section>

      <section className="level-grid" aria-label="Chọn cấp HSK">
        {GRAMMAR_LEVELS.map(lvl => (
          <button
            key={lvl}
            type="button"
            className={`level-card ${activeLevel === lvl ? 'active' : ''}`}
            onClick={() => setActiveLevel(lvl)}
          >
            <span>HSK</span>
            <strong>{lvl}</strong>
          </button>
        ))}
      </section>

      <section className="grammar-lesson-grid" aria-label="Danh sách bài ngữ pháp">
        {lessons.map(lesson => {
          const prog = getLessonProgress(lesson.id);
          const isDue = dueLessons.has(lesson.id);
          return (
            <article key={lesson.id} className="core-card grammar-lesson-card">
              <div className="grammar-lesson-head">
                <div>
                  <strong>{lesson.title}</strong>
                  <small>{lesson.desc}</small>
                </div>
                {isDue && <span className="grammar-due-badge"><CalendarClock size={13} /> Đến hạn</span>}
              </div>
              <div className="grammar-mastery-bar" title={`Mastery ${prog.mastery}%`}>
                <span style={{ width: `${prog.mastery}%` }} />
              </div>
              <div className="grammar-lesson-actions">
                <button type="button" className="btn-secondary" onClick={() => openTheory(lesson)}>
                  <BookOpen size={15} /> Lý thuyết
                </button>
                <button type="button" className="btn-primary" onClick={() => startLessonPractice(lesson)}>
                  <Play size={15} /> Luyện tập
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
