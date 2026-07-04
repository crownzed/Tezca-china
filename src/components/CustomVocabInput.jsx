import { useState } from 'react';
import {
  draftQuizFromVocab,
  draftQuizFromPassage,
  draftQuizFromTopic,
} from '../api-core';
import { Loader2, Sparkles, CheckCircle2, ListChecks, FileText, Tags, Play } from 'lucide-react';

// Ba nguồn dữ liệu của hub tạo bài tập.
const SOURCES = [
  { id: 'vocab', label: 'Từ danh sách từ vựng', icon: ListChecks },
  { id: 'topic', label: 'Từ chủ đề', icon: Tags },
  { id: 'passage', label: 'Từ đoạn văn', icon: FileText },
];

// 5 dạng câu hỏi (khớp question_subtype backend). Chỉ áp dụng cho nguồn
// đoạn văn & chủ đề; nguồn từ vựng sinh bài tập theo từng từ.
const QUESTION_TYPES = [
  { id: 'cloze_translation', label: 'Điền từ theo bản dịch' },
  { id: 'error_id', label: 'Tìm lỗi dịch' },
  { id: 'sentence_scramble', label: 'Sắp xếp câu' },
  { id: 'info_extraction', label: 'Trích xuất thông tin' },
  { id: 'contextual_translation', label: 'Chọn bản dịch hợp ngữ cảnh' },
];

const HSK_LEVELS = [1, 2, 3, 4, 5, 6];
const COUNT_OPTIONS = [5, 10, 15];
const VOCAB_PLACEHOLDER = '苹果\n香蕉\n电脑';

const inputStyle = {
  width: '100%',
  minHeight: '180px',
  padding: '1rem',
  borderRadius: '8px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  resize: 'vertical',
};

// Dropdown dùng chung — biến theme thật (var cũ --border-color/--card-bg không
// tồn tại nên trên mobile select hiện trong suốt, không bấm được).
const selectStyle = {
  padding: '0.6rem 0.85rem',
  borderRadius: '8px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  color: 'var(--text)',
  fontWeight: 600,
  minHeight: '44px',
  minWidth: '140px',
};

export default function CustomVocabInput({ onSessionCreated }) {
  const [source, setSource] = useState('vocab');
  const [vocabText, setVocabText] = useState('');
  const [topic, setTopic] = useState('');
  const [passage, setPassage] = useState('');
  const [hskLevel, setHskLevel] = useState(1);
  const [count, setCount] = useState(5);
  const [selectedTypes, setSelectedTypes] = useState(QUESTION_TYPES.map(t => t.id));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { quiz_title, passage, source, questions[] }

  const usesQuestionTypes = source === 'passage' || source === 'topic';

  const toggleType = (id) => {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const resetResult = () => {
    setDraft(null);
  };

  // --- Bước 3: Tạo Quiz (gọi LLM, trả bản nháp để xem trước, chưa lưu) ---
  const handleGenerate = async () => {
    setError('');
    resetResult();

    if (usesQuestionTypes && selectedTypes.length === 0) {
      setError('Vui lòng chọn ít nhất một dạng câu hỏi.');
      return;
    }

    let action;
    if (source === 'vocab') {
      const words = [...new Set(
        vocabText.split(/[\n,，]+/).map(w => w.trim()).filter(Boolean)
      )];
      if (words.length === 0) {
        setError('Vui lòng nhập ít nhất một từ vựng.');
        return;
      }
      if (words.length > 20) {
        setError('Để đảm bảo tốc độ, vui lòng chỉ nhập tối đa 20 từ mỗi lần.');
        return;
      }
      action = () => draftQuizFromVocab({ words });
    } else if (source === 'topic') {
      const t = topic.trim();
      if (t.length < 1) {
        setError('Vui lòng nhập chủ đề (ví dụ: thói quen hằng ngày, du lịch...).');
        return;
      }
      action = () => draftQuizFromTopic({
        topic: t,
        hsk_level: hskLevel,
        count,
        question_types: selectedTypes,
      });
    } else {
      const text = passage.trim();
      if (text.length < 4) {
        setError('Vui lòng dán một đoạn văn tiếng Trung (ít nhất vài câu).');
        return;
      }
      if (text.length > 2000) {
        setError('Đoạn văn quá dài, vui lòng giới hạn dưới 2000 ký tự.');
        return;
      }
      action = () => draftQuizFromPassage({
        text,
        hsk_level: hskLevel,
        count,
        question_types: selectedTypes,
      });
    }

    setLoading(true);
    try {
      const result = await action();
      if (!result?.questions?.length) {
        setError('Không tạo được câu hỏi nào. Vui lòng thử lại hoặc đổi nội dung.');
        return;
      }
      setDraft(result);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Đã có lỗi xảy ra khi tạo quiz.');
    } finally {
      setLoading(false);
    }
  };

  // --- Làm ngay từ bản nháp, KHÔNG lưu DB ---
  // Câu hỏi nháp chưa có id trong DB nên được đánh dấu `local` để phiên học
  // chấm điểm phía client và bỏ qua các lệnh ghi lên server.
  const handleStartLive = () => {
    if (!draft?.questions?.length) return;
    const liveQuestions = draft.questions.map((q, i) => ({
      ...q,
      id: `draft-${i}`,
      local: true,
    }));
    onSessionCreated(liveQuestions, {
      title: draft.quiz_title || 'Bài quiz tùy chỉnh',
      passage: draft.passage,
    });
  };

  return (
    <main className="core-page page-enter">
      <section className="core-card core-section-head">
        <span className="core-eyebrow">Trung tâm tạo bài tập</span>
        <h1>Tự tạo Quiz</h1>
        <p>Chọn nguồn dữ liệu, tùy chỉnh tham số rồi để AI sinh bài trắc nghiệm. Xem trước rồi làm ngay — phiên chạy trực tiếp, không lưu.</p>
      </section>

      {/* Bước 1: Chọn nguồn dữ liệu */}
      <section className="core-card">
        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>1. Nguồn dữ liệu</label>
        <div className="segmented-control" role="tablist" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {SOURCES.map(s => {
            const Icon = s.icon;
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setSource(s.id); setError(''); resetResult(); }}
                className={active ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: '1 1 180px', justifyContent: 'center' }}
              >
                <Icon size={16} /> {s.label}
              </button>
            );
          })}
        </div>

        {source === 'vocab' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Danh sách từ vựng (mỗi từ một dòng, hoặc cách nhau bởi dấu phẩy):
            </label>
            <textarea
              value={vocabText}
              onChange={(e) => setVocabText(e.target.value)}
              disabled={loading}
              placeholder={VOCAB_PLACEHOLDER}
              style={inputStyle}
            />
          </div>
        )}

        {source === 'topic' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Chủ đề:
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              placeholder="Ví dụ: thói quen hằng ngày, mua sắm, du lịch..."
              style={{ ...inputStyle, minHeight: 'auto', padding: '0.85rem 1rem' }}
            />
            <p className="hide-mobile" style={{ marginTop: '0.5rem', opacity: 0.7, fontSize: '0.85rem' }}>
              AI sẽ tự viết một đoạn văn tiếng Trung theo chủ đề và cấp HSK đã chọn, rồi sinh câu hỏi từ đoạn văn đó.
            </p>
          </div>
        )}

        {source === 'passage' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Đoạn văn tiếng Trung:
            </label>
            <textarea
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              disabled={loading}
              placeholder="Dán đoạn văn tiếng Trung của bạn vào đây..."
              style={inputStyle}
            />
          </div>
        )}
      </section>

      {/* Bước 2: Tùy chỉnh tham số */}
      <section className="core-card">
        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>2. Tùy chỉnh</label>

        {usesQuestionTypes && (
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dạng câu hỏi:</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
              {QUESTION_TYPES.map(t => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(t.id)}
                    onChange={() => toggleType(t.id)}
                    disabled={loading}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Độ khó</label>
            <select
              value={hskLevel}
              onChange={(e) => setHskLevel(Number(e.target.value))}
              disabled={loading || source === 'vocab'}
              style={selectStyle}
            >
              {HSK_LEVELS.map(l => <option key={l} value={l}>HSK {l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Số lượng câu hỏi</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={loading || source === 'vocab'}
              style={selectStyle}
            >
              {COUNT_OPTIONS.map(c => <option key={c} value={c}>{c} câu</option>)}
            </select>
          </div>
        </div>
        {source === 'vocab' && (
          <p className="hide-mobile" style={{ marginTop: '0.75rem', opacity: 0.7, fontSize: '0.85rem' }}>
            Nguồn từ vựng sinh bài tập theo từng từ (cấp độ & số lượng tự suy ra từ danh sách).
          </p>
        )}
      </section>

      {error && (
        <div className="feedback-panel feedback-panel--error" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      {/* Bước 3: Nút tạo */}
      <section className="core-card">
        <button
          className="btn-primary"
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Đang tạo quiz (có thể mất 10-30 giây)...
            </>
          ) : (
            <>
              <Sparkles size={18} /> Tạo Quiz ngay
            </>
          )}
        </button>
      </section>

      {/* Xem trước + Làm ngay */}
      {draft && (
        <QuizPreview draft={draft} onStartLive={handleStartLive} />
      )}
    </main>
  );
}

function QuizPreview({ draft, onStartLive }) {
  return (
    <section className="core-card">
      <div className="core-section-head" style={{ marginBottom: '1rem' }}>
        <span className="core-eyebrow">Xem trước</span>
        <h2 style={{ margin: '0.25rem 0' }}>{draft.quiz_title || 'Bài quiz mới'}</h2>
        <p>{draft.questions.length} câu hỏi. Xem qua rồi bắt đầu làm ngay.</p>
      </div>

      {draft.passage && (
        <div className="feedback-panel" style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Đoạn văn nguồn:</strong>
          {draft.passage}
        </div>
      )}

      <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {draft.questions.map((q, i) => (
          <li key={i}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{q.prompt}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.4rem' }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index;
                return (
                  <div
                    key={oi}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: `1px solid ${isCorrect ? 'var(--modern-zen-primary, #2bb673)' : 'var(--line)'}`,
                      background: isCorrect ? 'rgba(43, 182, 115, 0.12)' : 'transparent',
                      fontWeight: isCorrect ? 700 : 400,
                    }}
                  >
                    {String.fromCharCode(65 + oi)}. {opt}
                    {isCorrect && <CheckCircle2 size={14} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />}
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <p style={{ marginTop: '0.4rem', opacity: 0.75, fontSize: '0.85rem' }}>💡 {q.explanation}</p>
            )}
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
        <button
          className="btn-primary"
          type="button"
          onClick={onStartLive}
          style={{ flex: '1 1 220px', justifyContent: 'center' }}
        >
          <Play size={18} /> Bắt đầu làm bài
        </button>
      </div>
    </section>
  );
}
