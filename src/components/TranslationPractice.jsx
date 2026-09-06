// ============================================================
// TRANSLATION PRACTICE — Luyện dịch câu hai chiều (VI↔CN)
//
// Câu do AI sinh theo cấp HSK (backend cache lại vào pool nên chỉ phiên đầu phải
// chờ), chấm bằng SO KHỚP ĐÁP ÁN MẪU ở backend — không có lượt AI thứ hai để chấm.
// Chế độ "Trộn" bốc chiều ngẫu nhiên cho từng câu: một item mang cả hai phía nên
// việc trộn không tốn thêm lượt gọi nào.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Languages,
  Loader2,
  RotateCcw,
  Shuffle,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { fetchTranslationItems, gradeTranslation, translationPrompt, translationReferences } from '../api-core';
import { captureSentenceReview } from '../srs-capture.js';
import { ClickableChineseText, TonedPinyin } from './chinese-text.jsx';
import HskLevelPicker from './HskLevelPicker.jsx';
import { primaryLevel } from '../hsk-levels.js';
import { speak } from '../speech.jsx';

const COUNT_OPTIONS = [5, 10, 15];

// 'mix' KHÔNG phải một chiều gửi lên backend — nó chỉ là cách bốc chiều cho từng
// câu ở client. Payload chấm bài luôn mang 'vi2cn' hoặc 'cn2vi'.
const MODES = [
  { id: 'cn2vi', label: 'Trung → Việt', hint: 'Đọc câu tiếng Trung, viết nghĩa tiếng Việt' },
  { id: 'vi2cn', label: 'Việt → Trung', hint: 'Đọc câu tiếng Việt, viết lại bằng chữ Hán' },
  { id: 'mix', label: 'Trộn hai chiều', hint: 'Mỗi câu một chiều ngẫu nhiên' },
];

// Số câu vừa gặp gửi lên để backend không lặp lại. 40 là mức đủ để một buổi học
// không thấy câu cũ, mà payload vẫn nhỏ (schema chặn ở 60).
const RECENT_LIMIT = 40;
const RECENT_STORAGE_KEY = 'translationRecentSentences';

const readRecent = () => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY));
    return Array.isArray(raw) ? raw.filter(text => typeof text === 'string').slice(-RECENT_LIMIT) : [];
  } catch {
    return [];
  }
};

const textareaStyle = {
  width: '100%',
  minHeight: '96px',
  padding: '0.9rem 1rem',
  borderRadius: '10px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: '1.05rem',
  lineHeight: 1.6,
  resize: 'vertical',
};

const selectStyle = {
  padding: '0.6rem 0.85rem',
  borderRadius: '8px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--text)',
  fontWeight: 600,
  minHeight: '44px',
};

// Chữ chú thích mờ: dự án chưa có class dùng chung cho kiểu này (chỉ có
// .handwriting-hint-text bó hẹp cho ô viết tay), nên đặt inline theo biến màu.
const hintStyle = {
  color: 'var(--muted)',
  fontSize: '0.9rem',
};

export default function TranslationPractice({ focusLevels }) {
  const [level, setLevel] = useState(() => primaryLevel(focusLevels));
  const [mode, setMode] = useState('cn2vi');
  const [count, setCount] = useState(5);

  const [items, setItems] = useState([]);
  const [directions, setDirections] = useState([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [scored, setScored] = useState([]);

  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const item = items[index];
  const direction = directions[index] || 'cn2vi';
  const finished = items.length > 0 && index >= items.length;

  // Chiều được chốt MỘT LẦN cho cả phiên, không tính lại mỗi render: 'mix' dùng
  // Math.random() nên tính trong render sẽ đổi chiều giữa lúc người học đang gõ.
  const startSession = useCallback(async (nextLevel = level, nextMode = mode, nextCount = count) => {
    setLoading(true);
    setError('');
    setResult(null);
    setAnswer('');
    setScored([]);
    setIndex(0);
    try {
      const data = await fetchTranslationItems({
        hsk_level: nextLevel,
        count: nextCount,
        exclude: readRecent(),
      });
      const fresh = data?.items || [];
      if (!fresh.length) throw new Error('Chưa có câu nào để luyện dịch.');
      setItems(fresh);
      setDirections(fresh.map(() => (
        nextMode === 'mix' ? (Math.random() < 0.5 ? 'cn2vi' : 'vi2cn') : nextMode
      )));
      const seen = [...readRecent(), ...fresh.map(entry => entry.sentence_cn)].slice(-RECENT_LIMIT);
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(seen));
    } catch (err) {
      setItems([]);
      setDirections([]);
      setError(err?.message || 'Không tạo được câu để dịch.');
    } finally {
      setLoading(false);
    }
  }, [level, mode, count]);

  useEffect(() => {
    if (!loading && !result && inputRef.current) inputRef.current.focus();
  }, [index, loading, result]);

  const submit = async () => {
    if (!item || result || grading || !answer.trim()) return;
    setGrading(true);
    try {
      const graded = await gradeTranslation({ item, user_answer: answer, direction });
      setResult(graded);
      setScored(prev => [...prev, graded.correct]);
      // Dịch đúng cả câu là bằng chứng thật về các từ TRONG câu — cộng vào lịch ôn
      // của từng từ đó. captureSentenceReview cắt câu theo kho từ vựng và chỉ ghi
      // khi câu đúng (câu sai không cho biết từ nào gây lỗi). Không await: ghi SRS
      // là việc phụ, không được làm chậm lúc hiện kết quả.
      captureSentenceReview({ text: item.sentence_cn, correct: graded.correct });
    } catch (err) {
      setError(err?.message || 'Không chấm được câu này.');
    } finally {
      setGrading(false);
    }
  };

  const next = () => {
    setResult(null);
    setAnswer('');
    setIndex(prev => prev + 1);
  };

  const accuracy = useMemo(() => (
    scored.length ? Math.round((scored.filter(Boolean).length / scored.length) * 100) : 0
  ), [scored]);

  const setup = (
    <section className="core-card core-section-head vocab-head glass-panel">
      <div>
        <span className="core-eyebrow">Luyện dịch câu</span>
        <h1>Dịch câu hai chiều</h1>
        <p>AI sinh câu theo cấp HSK. Bài dịch được so khớp với đáp án mẫu nên có kết quả ngay.</p>
      </div>
      <div className="vocab-controls">
        <div className="control-row">
          <div className="select-label typing-level-label">
            <span>Cấp độ: <em className="typing-level-current">HSK {level}</em></span>
            <HskLevelPicker
              value={[level]}
              onChange={next => setLevel(primaryLevel(next, level))}
              variant="chip"
              className="vocab-hsk-tabs"
              buttonClassName=""
              ariaLabel="Chọn cấp HSK để luyện dịch"
            />
          </div>
          <label className="select-label">
            <span>Chiều dịch:</span>
            <select style={selectStyle} value={mode} onChange={e => setMode(e.target.value)}>
              {MODES.map(entry => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label className="select-label">
            <span>Số câu:</span>
            <select style={selectStyle} value={count} onChange={e => setCount(Number(e.target.value))}>
              {COUNT_OPTIONS.map(value => (
                <option key={value} value={value}>{value} câu</option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={() => startSession()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Đang tạo câu (có thể mất 10-30 giây)...
              </>
            ) : (
              <>
                <Sparkles size={16} /> {items.length ? 'Phiên mới' : 'Bắt đầu'}
              </>
            )}
          </button>
        </div>
        <p style={hintStyle}>{MODES.find(entry => entry.id === mode)?.hint}</p>
      </div>
    </section>
  );

  if (finished) {
    return (
      <main className="core-page page-enter">
        {setup}
        <section className="qz core-card result-card general-result-card glass-panel">
          <span className="core-eyebrow">Kết quả luyện dịch</span>
          <h1>{accuracy >= 80 ? 'Xuất sắc!' : accuracy >= 50 ? 'Khá tốt!' : 'Cần cố gắng thêm'}</h1>
          <p>Bạn đã dịch xong {scored.length} câu ở HSK {level}.</p>
          <div className="result-summary">
            <strong className="accuracy-percentage">{accuracy}%</strong>
            <span>Đúng {scored.filter(Boolean).length} / {scored.length} câu</span>
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={() => startSession()}>
              <RotateCcw size={16} /> Luyện phiên mới
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="core-page page-enter">
      {setup}

      {error && (
        <div className="feedback-panel feedback-panel--error" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      {item ? (
        <section className="typing-workspace">
          <div className="qz core-card typing-card glass-panel">
            <div className="question-topline">
              <span className="hsk-badge">HSK {item.hsk_level || level}</span>
              <span className="card-progress">{index + 1} / {items.length}</span>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
            </div>

            <div className="prompt-container">
              <span className="eyebrow-label">
                {direction === 'vi2cn' ? 'Dịch sang tiếng Trung' : 'Dịch sang tiếng Việt'}
              </span>
              {direction === 'vi2cn' ? (
                <h2 className="meaning-prompt">{translationPrompt(item, direction)}</h2>
              ) : (
                <>
                  <h2 className="meaning-prompt">
                    <ClickableChineseText text={item.sentence_cn} />
                  </h2>
                  <button
                    className="btn-secondary action-btn"
                    onClick={() => speak(item.sentence_cn, 0.85)}
                    title="Nghe câu"
                  >
                    <Languages size={16} /> Nghe câu
                  </button>
                </>
              )}
            </div>

            <div className="input-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
              <textarea
                ref={inputRef}
                style={textareaStyle}
                className={result ? (result.correct ? 'input-correct' : 'input-incorrect') : ''}
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => {
                  // Enter nộp bài, Shift+Enter xuống dòng: câu dịch dài vẫn cần
                  // ngắt dòng được, nhưng nộp nhanh mới là hành vi chính.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (result) next(); else submit();
                  }
                }}
                placeholder={direction === 'vi2cn'
                  ? 'Gõ câu tiếng Trung bằng chữ Hán...'
                  : 'Gõ bản dịch tiếng Việt...'}
                readOnly={Boolean(result)}
                autoComplete="off"
                spellCheck="false"
              />
              <div className="typing-card-actions">
                {result ? (
                  <button className="btn-primary action-btn next-btn" onClick={next}>
                    {index + 1 >= items.length ? 'Xem kết quả' : 'Câu tiếp theo'} <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    className="btn-primary btn-submit-ans"
                    onClick={submit}
                    disabled={!answer.trim() || grading}
                  >
                    {grading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    {grading ? ' Đang chấm...' : 'Kiểm tra'}
                  </button>
                )}
              </div>
            </div>

            {result && (
              <div className="detailed-answer-panel slide-up">
                <div className="accuracy-stamp">
                  {result.correct ? (
                    <span className="stamp-correct"><CheckCircle2 size={18} /> Đúng · {result.score} điểm</span>
                  ) : (
                    <span className="stamp-incorrect"><XCircle size={18} /> Chưa đúng · {result.score} điểm</span>
                  )}
                </div>
                <p>{result.feedback}</p>

                <div className="feedback-panel" style={{ marginTop: '0.75rem' }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Đáp án mẫu</strong>
                  {direction === 'vi2cn' ? (
                    <>
                      <ClickableChineseText text={result.matched_reference || item.sentence_cn} />
                      {item.pinyin && <div><TonedPinyin pinyin={item.pinyin} /></div>}
                    </>
                  ) : (
                    <span>{result.matched_reference || item.sentence_vi}</span>
                  )}
                </div>

                {/* Câu ở ngôn ngữ ĐỀ BÀI cũng hiện lại để đối chiếu hai bên cạnh nhau. */}
                <div className="feedback-panel" style={{ marginTop: '0.5rem' }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Câu gốc</strong>
                  {direction === 'vi2cn'
                    ? <span>{item.sentence_vi}</span>
                    : <ClickableChineseText text={item.sentence_cn} />}
                </div>

                {translationReferences(item, direction).length > 1 && (
                  <p style={{ ...hintStyle, marginTop: '0.5rem' }}>
                    Cách nói khác cũng được tính đúng: {translationReferences(item, direction).slice(1).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        !loading && !error && (
          <section className="core-card glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
            <Shuffle size={28} />
            <p style={{ marginTop: '0.75rem' }}>Chọn cấp độ và chiều dịch, rồi bấm Bắt đầu.</p>
          </section>
        )
      )}
    </main>
  );
}

