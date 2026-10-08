import { useState } from 'react';
import {
  draftQuizFromVocab,
  draftQuizFromPassage,
  draftQuizFromTopic,
} from '../api-core';
import { Loader2, Sparkles, CheckCircle2, ListChecks, FileText, Tags, Play } from 'lucide-react';
import HskLevelPicker from './HskLevelPicker.jsx';
import { primaryLevel } from '../hsk-levels.js';

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

export default function CustomVocabInput({ onSessionCreated }) {
  const [source, setSource] = useState('vocab');
  const [vocabText, setVocabText] = useState('');
  const [topic, setTopic] = useState('');
  const [passage, setPassage] = useState('');
  // hskLevels = MẢNG cấp đã chọn. Độ khó AI cần MỘT giá trị nên khi tạo bài lấy
  // cấp thấp nhất (primaryLevel). Mặc định [1].
  const [hskLevels, setHskLevels] = useState([1]);
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
        hsk_level: primaryLevel(hskLevels),
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
        hsk_level: primaryLevel(hskLevels),
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
    <main className="core-page page-enter study-page study-page--custom" aria-busy={loading}>
      <section className="core-card core-section-head custom-section-head">
        <span className="core-eyebrow">Tạo bài tập</span>
        <h1>Tự tạo quiz</h1>
        <p>Chọn nguồn, chỉnh mức phù hợp rồi xem trước bài trước khi bắt đầu.</p>
      </section>

      <div className="custom-builder">
        <section className="core-card custom-panel custom-panel--source" aria-labelledby="custom-source-title">
          <div className="custom-panel-heading">
            <strong id="custom-source-title">Nguồn nội dung</strong>
            <span>Chọn một</span>
          </div>
          <div className="custom-source-tabs" role="group" aria-label="Chọn nguồn tạo bài tập">
            {SOURCES.map(s => {
              const Icon = s.icon;
              const active = source === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setSource(s.id); setError(''); resetResult(); }}
                  className="custom-source-button"
                  disabled={loading}
                >
                  <Icon size={16} strokeWidth={1.6} aria-hidden="true" /> {s.label}
                </button>
              );
            })}
          </div>

          {source === 'vocab' && (
            <div className="custom-field">
              <label htmlFor="custom-vocab-list">Danh sách từ vựng</label>
              <textarea
                id="custom-vocab-list"
                className="custom-input"
                value={vocabText}
                onChange={(e) => setVocabText(e.target.value)}
                disabled={loading}
                placeholder={VOCAB_PLACEHOLDER}
              />
              <p className="custom-help">Mỗi từ một dòng hoặc ngăn cách bằng dấu phẩy. Tối đa 20 từ mỗi lần.</p>
            </div>
          )}

          {source === 'topic' && (
            <div className="custom-field">
              <label htmlFor="custom-topic">Chủ đề</label>
              <input
                id="custom-topic"
                className="custom-input custom-input--single"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
                placeholder="Ví dụ: thói quen hằng ngày, mua sắm, du lịch"
              />
              <p className="custom-help">AI sẽ viết đoạn tiếng Trung theo chủ đề và cấp HSK đã chọn, sau đó tạo câu hỏi từ đoạn đó.</p>
            </div>
          )}

          {source === 'passage' && (
            <div className="custom-field">
              <label htmlFor="custom-passage">Đoạn văn tiếng Trung</label>
              <textarea
                id="custom-passage"
                className="custom-input"
                value={passage}
                onChange={(e) => setPassage(e.target.value)}
                disabled={loading}
                placeholder="Dán đoạn văn tiếng Trung của bạn vào đây"
              />
              <p className="custom-help">Đoạn văn cần có ít nhất vài câu và không vượt quá 2.000 ký tự.</p>
            </div>
          )}
        </section>

        <section className="core-card custom-panel custom-panel--settings" aria-labelledby="custom-settings-title">
          <div className="custom-panel-heading">
            <strong id="custom-settings-title">Thiết lập</strong>
            <span>Điều chỉnh</span>
          </div>

          <div className="custom-settings">
            {usesQuestionTypes && (
              <div className="custom-field">
                <span className="custom-field-label">Dạng câu hỏi</span>
                <div className="custom-question-types">
                  {QUESTION_TYPES.map(t => (
                    <label key={t.id} className="custom-question-option">
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

            <div className="custom-settings-row">
              <div className="custom-field">
                <label htmlFor="custom-hsk-levels">Độ khó</label>
                <HskLevelPicker
                  value={hskLevels}
                  onChange={setHskLevels}
                  levels={HSK_LEVELS}
                  variant="chip"
                  disabled={loading || source === 'vocab'}
                  className="vocab-hsk-tabs custom-level-picker"
                  buttonClassName=""
                  ariaLabel="Chọn cấp HSK cho bài AI tạo"
                />
                <p id="custom-hsk-levels" className="custom-help">AI viết theo HSK {primaryLevel(hskLevels)}.</p>
              </div>
              <div className="custom-field">
                <label htmlFor="custom-question-count">Số câu</label>
                <select
                  id="custom-question-count"
                  className="custom-select"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={loading || source === 'vocab'}
                >
                  {COUNT_OPTIONS.map(c => <option key={c} value={c}>{c} câu</option>)}
                </select>
              </div>
            </div>

            {source === 'vocab' && (
              <p className="custom-help">Với danh sách từ, hệ thống tự suy độ khó và số câu từ nội dung bạn nhập.</p>
            )}
          </div>
        </section>

        <section className="core-card custom-action-panel" aria-live="polite">
          <span className="custom-help">Bản nháp sẽ xuất hiện bên dưới. Bạn có thể xem trước trước khi làm.</span>
          <button
            className="btn-primary custom-generate-button"
            type="button"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" aria-hidden="true" />
                Đang tạo quiz...
              </>
            ) : (
              <>
                <Sparkles size={18} strokeWidth={1.6} aria-hidden="true" /> Tạo quiz
              </>
            )}
          </button>
          {loading && <span className="custom-help" role="status">Quá trình này có thể mất 10-30 giây.</span>}
        </section>
      </div>

      {error && (
        <p className="custom-error" role="alert">{error}</p>
      )}

      {draft && <QuizPreview draft={draft} onStartLive={handleStartLive} />}
    </main>
  );
}

function QuizPreview({ draft, onStartLive }) {
  return (
    <section className="core-card custom-preview" aria-label="Xem trước bài quiz">
      <header className="custom-preview-head">
        <span className="core-eyebrow">Xem trước</span>
        <h2>{draft.quiz_title || 'Bài quiz mới'}</h2>
        <p>{draft.questions.length} câu hỏi. Kiểm tra nhanh trước khi bắt đầu.</p>
      </header>

      {draft.partial && (
        <p className="custom-preview-status" role="status">
          <strong>Đã tạo {draft.generated_count}/{draft.requested_count} câu hỏi hợp lệ.</strong>
          Bạn có thể bắt đầu ngay hoặc thay nội dung để tạo lại.
        </p>
      )}

      {draft.passage && (
        <p className="custom-preview-source">
          <strong>Đoạn văn nguồn</strong>
          {draft.passage}
        </p>
      )}

      <ol className="custom-question-list">
        {draft.questions.map((q, i) => (
          <li key={i} className="custom-question">
            <p className="custom-question-prompt">{q.prompt}</p>
            <div className="custom-options">
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correct_index;
                return (
                  <div key={oi} className={`custom-option${isCorrect ? ' is-correct' : ''}`}>
                    {String.fromCharCode(65 + oi)}. {opt}
                    {isCorrect && <CheckCircle2 size={14} strokeWidth={1.6} aria-label="Đáp án đúng" />}
                  </div>
                );
              })}
            </div>
            {q.explanation && <p className="custom-explanation">{q.explanation}</p>}
          </li>
        ))}
      </ol>

      <div className="custom-preview-actions">
        <button className="btn-primary" type="button" onClick={onStartLive}>
          <Play size={18} strokeWidth={1.6} aria-hidden="true" /> Bắt đầu làm bài
        </button>
      </div>
    </section>
  );
}
