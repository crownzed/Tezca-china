// ============================================================
// GRAMMAR LAB — Mục "Ngữ pháp" độc lập
// 4 view: overview (theo dõi tiến độ + điều hướng), theory (học lý
// thuyết), practice (luyện theo bài), review (ôn tập thông minh).
//
// Chạy hoàn toàn local: chấm điểm cục bộ theo correctIndex, lưu tiến
// độ qua grammar-progress (Leitner + mastery), KHÔNG đụng coreStats /
// analytics của từ vựng.
// ============================================================
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, Library, Play, RotateCcw, Search, Sparkles, XCircle } from 'lucide-react';
import { grammarLessons } from '../grammar-db.js';
import { sampleN } from '../grammar-engine.js';
import { getGrammarSummary, getLessonProgress, getDueLessons, recordGrammarResult } from '../grammar-progress.js';
import { ClickableChineseText, TonedPinyin } from './chinese-text.jsx';
import HskLevelPicker from './HskLevelPicker.jsx';
import { normalizeLevels, levelMatches } from '../hsk-levels.js';
import { getGrammarEntry, getGrammarReference } from '../api-core.js';

const GRAMMAR_LEVELS = [1, 2, 3, 4, 5, 6];
const TOTAL_LESSONS = grammarLessons.length;
const REFERENCE_PAGE_SIZE = 24;
// Gõ tìm kiếm bắn 1 request/ký tự nếu không chờ; 300ms là ngưỡng người dùng
// chưa cảm thấy trễ nhưng đủ gom một chuỗi ký tự thành một lần gọi.
const SEARCH_DEBOUNCE_MS = 300;

function filterReferencePool(pool, query) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return pool;
  return pool.filter(item => (
    `${item.title} ${item.meaning} ${item.usage} ${item.notes} ${item.examples}`
      .toLocaleLowerCase()
      .includes(normalized)
  ));
}

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
    <section className="qz core-card question-card learning-question-card">
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

function ReferenceView({ entry, onExit }) {
  const sections = [
    { key: 'meaning', label: 'Ý nghĩa', text: entry.meaning, className: 'grammar-reference-meaning' },
    { key: 'usage', label: 'Cách dùng', text: entry.usage, className: '' },
    { key: 'notes', label: 'Lưu ý', text: entry.notes, className: 'grammar-reference-note' },
    { key: 'examples', label: 'Ví dụ', text: entry.examples, className: 'grammar-reference-examples' },
  ].filter(section => section.text?.trim());

  return (
    <section className="core-card grammar-theory grammar-reference-detail">
      <div className="question-topline">
        <button type="button" className="grammar-back" onClick={onExit}>
          <ArrowLeft size={16} /> Thư viện ngữ pháp
        </button>
        <span className="grammar-level-badge">Mục {entry.number}</span>
      </div>
      <h1 className="grammar-theory-title"><ClickableChineseText text={entry.title} /></h1>
      <p className="grammar-theory-desc">Trang {entry.page_start}{entry.page_end !== entry.page_start ? `–${entry.page_end}` : ''} trong tài liệu nguồn</p>

      {sections.map(section => (
        <section className={`grammar-reference-section ${section.className}`} key={section.key}>
          <small>{section.label}</small>
          <p className="grammar-reference-text">
            <ClickableChineseText text={section.text} />
          </p>
        </section>
      ))}
    </section>
  );
}

// ── Màn kết quả sau khi luyện ───────────────────────────────
function ResultView({ correct, total, records, onAgain, onExit }) {
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return (
    <section className="qz core-card result-card">
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

export default function GrammarLab({ focusLevels }) {
  const [view, setView] = useState('overview');
  const [catalogMode, setCatalogMode] = useState('practice');
  // activeLevels = MẢNG số đã chọn. Rỗng => tất cả cấp (levelMatches xử lý).
  const [activeLevels, setActiveLevels] = useState(() => normalizeLevels(focusLevels));
  const [activeLesson, setActiveLesson] = useState(null);
  const [activeReference, setActiveReference] = useState(null);
  // Một TRANG kết quả từ server, không phải cả kho. offlinePool chỉ được nạp khi
  // API thất bại (xem loadOfflinePool) để vẫn tra cứu được lúc mất mạng.
  const [referenceItems, setReferenceItems] = useState(null);
  const [referenceTotal, setReferenceTotal] = useState(0);
  const [referencePageCount, setReferencePageCount] = useState(1);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceLoadError, setReferenceLoadError] = useState('');
  const [referenceOffline, setReferenceOffline] = useState(false);
  const [offlinePool, setOfflinePool] = useState(null);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referencePage, setReferencePage] = useState(1);
  // Giá trị đã trễ 300ms so với ô input — dùng làm dependency fetch.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // Bump để buộc effect fetch chạy lại khi bấm "Thử kết nối lại" mà query/trang
  // không đổi (referenceOffline một mình không đủ làm dependency thay đổi).
  const [retryTick, setRetryTick] = useState(0);
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
  const lessons = useMemo(() => grammarLessons.filter(lesson => levelMatches(activeLevels, lesson.level)), [activeLevels]);
  // Khi chạy offline, cả việc lọc và cắt trang đều làm tại client trên bundle
  // local; khi có API thì server đã trả đúng một trang nên chỉ hiển thị lại.
  const offlineResults = useMemo(() => {
    if (!offlinePool) return [];
    return filterReferencePool(offlinePool, debouncedQuery);
  }, [offlinePool, debouncedQuery]);
  // Online: server đã tính sẵn total/page_count. Offline: phải tự tính trên số
  // mục khớp trong bundle local.
  const effectiveTotal = referenceOffline ? offlineResults.length : referenceTotal;
  const effectivePageCount = referenceOffline
    ? Math.max(1, Math.ceil(offlineResults.length / REFERENCE_PAGE_SIZE))
    : referencePageCount;
  const safeReferencePage = Math.min(referencePage, effectivePageCount);
  const visibleReferences = useMemo(() => {
    if (!referenceOffline) return referenceItems || [];
    const start = (safeReferencePage - 1) * REFERENCE_PAGE_SIZE;
    return offlineResults.slice(start, start + REFERENCE_PAGE_SIZE);
  }, [referenceOffline, referenceItems, offlineResults, safeReferencePage]);

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

  const openReference = (summary) => {
    // Danh sách chỉ trả summary (không có raw_text/notes/examples). Nạp nội dung
    // đầy đủ trước khi mở view chi tiết; giữ summary làm placeholder ngay lập tức.
    setActiveReference(summary);
    setView('reference');
    if (referenceOffline) return; // Offline: bundle local đã có đủ trường.
    getGrammarEntry(summary.number).then(full => {
      // Chỉ cập nhật nếu người dùng vẫn đang xem mục này.
      setActiveReference(prev => prev?.number === summary.number ? full : prev);
    }).catch(() => { /* giữ nguyên summary nếu API thất bại */ });
  };

  // Fallback: nếu API thất bại, nạp bundle local một lần rồi lọc/phân trang tại client.
  const loadOfflinePool = useCallback(async () => {
    // Đã nạp bundle từ lần rớt mạng trước: bật lại cờ offline chứ không return
    // trắng, nếu không retryOnline() vừa tắt cờ sẽ để màn hình rỗng.
    if (offlinePool) {
      setReferenceOffline(true);
      setReferenceLoadError('');
      return;
    }
    try {
      const module = await import('../data/grammar-pool.js');
      setOfflinePool(module.grammarReferencePool);
      setReferenceOffline(true);
      setReferenceLoadError('');
    } catch {
      setReferenceLoadError('Không thể tải thư viện ngữ pháp. Vui lòng thử lại.');
    }
  }, [offlinePool]);

  // Thoát chế độ offline và gọi lại API. Cần retryTick vì khi query/trang không
  // đổi, chỉ tắt referenceOffline không đủ để effect fetch chạy lại.
  const retryOnline = useCallback(() => {
    setReferenceLoadError('');
    setReferenceOffline(false);
    setRetryTick(tick => tick + 1);
  }, []);

  // Fetch một trang từ server mỗi khi query hoặc trang thay đổi.
  // Chỉ chạy khi tab thư viện đang mở (catalogMode === 'reference').
  useEffect(() => {
    if (catalogMode !== 'reference') return;
    // Đang offline thì không tự động gọi lại API — chỉ retryOnline() mới thoát,
    // tránh mỗi lần đổi trang lại chờ timeout của một backend đang chết.
    if (referenceOffline) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cờ loading phải bật ngay trước khi gọi API; đây là đồng bộ với hệ thống ngoài (fetch), không phải state dẫn xuất
    setReferenceLoading(true);
    setReferenceLoadError('');
    getGrammarReference({ query: debouncedQuery, page: referencePage, pageSize: REFERENCE_PAGE_SIZE })
      .then(data => {
        if (cancelled) return;
        setReferenceItems(data.items);
        setReferenceTotal(data.total);
        setReferencePageCount(Math.max(1, data.page_count));
      })
      .catch(() => {
        if (cancelled) return;
        // API không tới được → chuyển sang offline mode.
        loadOfflinePool();
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });
    return () => { cancelled = true; };
  }, [catalogMode, referenceOffline, debouncedQuery, referencePage, retryTick, loadOfflinePool]);

  // Debounce query input: cập nhật debouncedQuery sau 300ms im lặng.
  // Reset về trang 1 khi query thay đổi (server sẽ sắp xếp lại kết quả).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(referenceQuery);
      setReferencePage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [referenceQuery]);

  const openReferenceLibrary = () => {
    setCatalogMode('reference');
    setReferencePage(1);
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
    setActiveReference(null);
    setResult(null);
  };

  // ── Render theo view ──
  if (view === 'reference' && activeReference) {
    return (
      <main className="core-page page-enter grammar-lab">
        <ReferenceView entry={activeReference} onExit={backToOverview} />
      </main>
    );
  }

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
        <p>Học và luyện theo bài, hoặc tra cứu thư viện ngữ pháp HSK 1–6 từ tài liệu nguồn.</p>
      </section>

      <section className="core-card grammar-catalog-tabs" aria-label="Chọn kho ngữ pháp">
        <button
          type="button"
          className={catalogMode === 'practice' ? 'active' : ''}
          onClick={() => setCatalogMode('practice')}
        >
          <GraduationCap size={17} />
          <span>Bài học & luyện tập</span>
          <small>{TOTAL_LESSONS}</small>
        </button>
        <button
          type="button"
          className={catalogMode === 'reference' ? 'active' : ''}
          onClick={openReferenceLibrary}
        >
          <Library size={17} />
          <span>Tải thư viện</span>
        </button>
      </section>

      {catalogMode === 'reference' ? (
        referenceLoading && !referenceItems ? (
          <section className="core-card grammar-reference-empty">
            <Library size={26} />
            <strong>Đang tải thư viện…</strong>
          </section>
        ) : referenceLoadError && !visibleReferences.length ? (
          <section className="core-card grammar-reference-empty">
            <Library size={26} />
            <strong>{referenceLoadError}</strong>
            <button type="button" className="btn-secondary" onClick={retryOnline}>Thử lại</button>
          </section>
        ) : (
          <>
            <section className="core-card grammar-reference-toolbar">
              <label className="grammar-reference-search">
                <Search size={18} />
                <input
                  type="search"
                  value={referenceQuery}
                  onChange={(event) => setReferenceQuery(event.target.value)}
                  placeholder="Tìm theo cấu trúc, chữ Hán hoặc nội dung…"
                  aria-label="Tìm trong thư viện ngữ pháp"
                />
              </label>
              {referenceOffline && (
                // Badge phải kèm nút thoát: một lần API lỗi thoáng qua (backend
                // cold start) không được khóa cả phiên vào bản offline, vốn tìm
                // kiếm kém hơn server (không chuẩn hóa NFC, không xếp hạng).
                <span className="grammar-reference-offline-badge" title="Đang dùng bản offline, tìm kiếm kém chính xác hơn">
                  ⚠️ Offline
                  <button type="button" className="grammar-reference-retry" onClick={retryOnline}>
                    Thử kết nối lại
                  </button>
                </span>
              )}
            </section>

            {referenceLoading && (
              <div className="grammar-reference-loading" aria-live="polite">Đang tải…</div>
            )}

            {visibleReferences.length > 0 ? (
              <section className="grammar-lesson-grid grammar-reference-grid" aria-label="Thư viện ngữ pháp">
                {visibleReferences.map(entry => (
                  <article key={entry.id} className="core-card grammar-lesson-card grammar-reference-card">
                    <div className="grammar-reference-card-topline">
                      <span>Mục {String(entry.number).padStart(3, '0')}</span>
                      <small>Trang {entry.page_start}{entry.page_end !== entry.page_start ? `–${entry.page_end}` : ''}</small>
                    </div>
                    <h2><ClickableChineseText text={entry.title} /></h2>
                    <p>{entry.meaning || entry.usage}</p>
                    <button type="button" className="btn-secondary" onClick={() => openReference(entry)}>
                      <BookOpen size={15} /> Xem nội dung
                    </button>
                  </article>
                ))}
              </section>
            ) : !referenceLoading ? (
              <section className="core-card grammar-reference-empty">
                <Search size={24} />
                <strong>Không tìm thấy điểm ngữ pháp phù hợp</strong>
                <button type="button" className="btn-secondary" onClick={() => setReferenceQuery('')}>Xóa tìm kiếm</button>
              </section>
            ) : null}

            {effectiveTotal > REFERENCE_PAGE_SIZE && (
              <nav className="core-card grammar-reference-pagination" aria-label="Phân trang thư viện ngữ pháp">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReferencePage(page => Math.max(1, page - 1))}
                  disabled={safeReferencePage === 1}
                >
                  <ChevronLeft size={16} /> Trước
                </button>
                <span>Trang <strong>{safeReferencePage}</strong> / {effectivePageCount}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReferencePage(page => Math.min(effectivePageCount, page + 1))}
                  disabled={safeReferencePage === effectivePageCount}
                >
                  Sau <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </>
        )
      ) : (
        <>
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

          <HskLevelPicker
            value={activeLevels}
            onChange={setActiveLevels}
            levels={GRAMMAR_LEVELS}
            variant="card"
            showAll
            allowEmpty
            className="level-grid"
            buttonClassName="level-card"
            ariaLabel="Chọn cấp HSK"
          />

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
        </>
      )}
    </main>
  );
}
