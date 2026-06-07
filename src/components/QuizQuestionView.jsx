import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';

const TYPE_LABELS = {
  grammar: '📖 Ngữ pháp',
  sentence_order: '🔀 Sắp xếp câu',
  pick_wrong: '❌ Chọn câu sai',
  fill_blank: '✏️ Điền chỗ trống',
  char_to_meaning: '🔤 Hán → Nghĩa',
  meaning_to_char: '💬 Nghĩa → Hán',
  pinyin_to_char: '🎵 Phiên âm → Hán',
  context_fill: '📝 Điền từ trong câu',
  sentence_translate: '🎯 Dịch câu',
  pinyin_to_meaning: '🔊 Pinyin → Nghĩa',
  word_in_context: '🧩 Từ trong ngữ cảnh',
  example_match: '🔄 Tìm từ chính',
};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function SentenceOrderBlock({ q, answered, onSubmit, selectedIdx, timer }) {
  const [pool, setPool] = useState([]);
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    setPool(shuffleArray(q.segments.map((text, i) => ({ text, id: i }))));
    setPicked([]);
  }, [q]);

  const addSegment = (item) => {
    if (answered) return;
    setPicked(prev => [...prev, item]);
    setPool(prev => prev.filter(p => p.id !== item.id));
  };

  const removeAt = (index) => {
    if (answered) return;
    const item = picked[index];
    setPicked(prev => prev.filter((_, i) => i !== index));
    setPool(prev => [...prev, item]);
  };

  const built = picked.map(p => p.text).join('');
  const isCorrect = built === q.correctSentence;

  return (
    <>
      <div className="sentence-order-answer">
        {picked.length === 0 ? (
          <span className="sentence-order-placeholder">Chạm từ bên dưới để xếp câu…</span>
        ) : (
          picked.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              type="button"
              className="sentence-order-chip sentence-order-chip--picked"
              onClick={() => removeAt(i)}
              disabled={answered}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
      {q.hint && (
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Gợi ý: {q.hint}
        </p>
      )}
      <div className="sentence-order-pool">
        {pool.map(item => (
          <button
            key={item.id}
            type="button"
            className="sentence-order-chip"
            onClick={() => addSegment(item)}
            disabled={answered}
          >
            {item.text}
          </button>
        ))}
      </div>
      {!answered && picked.length === q.segments.length && (
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
          onClick={() => onSubmit(isCorrect ? 0 : -1)}
        >
          Kiểm tra câu trả lời
        </button>
      )}
      {answered && (
        <div className="glass-panel animate-slide-up" style={{ padding: 16, marginTop: 16 }}>
          <p style={{
            color: isCorrect ? '#22c55e' : '#ef4444',
            fontWeight: 600,
            marginBottom: 6,
          }}>
            {timer === 0 && selectedIdx === null
              ? '⏰ Hết giờ!'
              : isCorrect
                ? '✅ Chính xác!'
                : '❌ Sai rồi!'}
          </p>
          <p className="cn-text" style={{ fontSize: '1.1rem', color: 'var(--accent-2)', marginBottom: 6 }}>
            Đáp án: {q.correctSentence}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>{q.explanation}</p>
        </div>
      )}
    </>
  );
}

export default function QuizQuestionView({
  q,
  answered,
  selectedIdx,
  timer,
  onAnswer,
  onNext,
  currentQ,
  poolLength,
}) {
  const typeLabel = TYPE_LABELS[q.type] || 'Câu hỏi';
  const isCnOptions = q.type === 'meaning_to_char' || q.type === 'pinyin_to_char'
    || q.type === 'pick_wrong' || q.type === 'sentence_order'
    || q.type === 'context_fill' || q.type === 'word_in_context' || q.type === 'example_match';
  const isCnQuestion = q.type.includes('char') || q.type === 'fill_blank' || q.type === 'grammar'
    || q.type === 'context_fill' || q.type === 'sentence_translate'
    || q.type === 'word_in_context' || q.type === 'example_match';

  const handleMcAnswer = useCallback((idx) => {
    onAnswer(idx);
  }, [onAnswer]);

  const handleOrderSubmit = useCallback((idx) => {
    onAnswer(idx);
  }, [onAnswer]);

  const feedbackCorrect = useMemo(() => {
    if (q.type === 'sentence_order') return null;
    if (q.type === 'pick_wrong') return selectedIdx === q.correctIndex;
    return selectedIdx === q.correctIndex;
  }, [q, selectedIdx]);

  return (
    <div style={{ maxWidth: 550, margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="tag tag-info">{typeLabel}</span>
          <span className="tag tag-primary">HSK {q.hskLevel}</span>
        </div>
        {/* Question text */}
        {q.type === 'word_in_context' ? (
          <div style={{ marginTop: 8 }}>
            {q.question.split('\n\n').map((part, i) => (
              <div key={i} style={{
                fontSize: i === 0 ? '0.95rem' : '1.3rem',
                color: i === 0 ? 'var(--text-muted)' : 'var(--accent-2)',
                fontFamily: i === 0 ? 'Inter, sans-serif' : 'Noto Sans SC, sans-serif',
                fontStyle: i === 0 ? 'italic' : 'normal',
                marginBottom: i === 0 ? 12 : 0,
                lineHeight: 1.5,
              }}>
                {part}
              </div>
            ))}
          </div>
        ) : (
          <h3
            className={isCnQuestion ? 'cn-text' : ''}
            style={{
              fontSize: (q.type === 'char_to_meaning' || q.type === 'meaning_to_char') ? '2.5rem'
                : (q.type === 'pinyin_to_meaning') ? '1.6rem'
                : (q.type === 'sentence_translate' || q.type === 'example_match') ? '1.15rem'
                : (q.type === 'context_fill') ? '1.2rem'
                : isCnQuestion && !q.type.includes('fill') && q.type !== 'grammar' ? '2.5rem'
                : '1.2rem',
              marginTop: 8,
              lineHeight: 1.45,
              fontStyle: q.type === 'pinyin_to_meaning' ? 'italic' : 'normal',
            }}
          >
            {q.question}
          </h3>
        )}
        {/* Pinyin hint for sentence_translate */}
        {q.type === 'sentence_translate' && q.pinyin && (
          <p style={{ fontSize: '0.82rem', color: 'var(--accent-3)', marginTop: 6, fontStyle: 'italic' }}>
            {q.pinyin}
          </p>
        )}
        {/* Hint for context_fill and example_match */}
        {(q.type === 'context_fill' || q.type === 'example_match') && q.hint && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8 }}>
            💡 Gợi ý: {q.hint}
          </p>
        )}
        {/* Pick wrong instruction */}
        {q.type === 'pick_wrong' && (
          <p style={{ fontSize: '0.82rem', color: 'var(--accent-3)', marginTop: 10 }}>
            Tìm câu vi phạm ngữ pháp — không phải câu đúng nhất!
          </p>
        )}
        {/* Sentence translate instruction */}
        {q.type === 'sentence_translate' && (
          <p style={{ fontSize: '0.82rem', color: 'var(--accent-2)', marginTop: 8 }}>
            Chọn bản dịch đúng cho câu trên
          </p>
        )}
        {/* Example match instruction */}
        {q.type === 'example_match' && (
          <p style={{ fontSize: '0.82rem', color: 'var(--accent-2)', marginTop: 8 }}>
            Tìm từ chính xuất hiện trong câu
          </p>
        )}
      </div>

      {q.type === 'sentence_order' ? (
        <SentenceOrderBlock
          q={q}
          answered={answered}
          onSubmit={handleOrderSubmit}
          selectedIdx={selectedIdx}
          timer={timer}
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt, idx) => {
              let cls = 'quiz-option';
              if (answered) {
                if (idx === q.correctIndex) cls += ' correct';
                else if (idx === selectedIdx) cls += ' incorrect';
                else cls += ' disabled';
              }
              return (
                <button key={idx} type="button" className={cls} onClick={() => handleMcAnswer(idx)}>
                  <span style={{ marginRight: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span className={isCnOptions ? 'cn-text' : ''}>{opt}</span>
                </button>
              );
            })}
          </div>
          {answered && (
            <div className="glass-panel animate-slide-up" style={{ padding: 16, marginTop: 16 }}>
              <p style={{
                color: feedbackCorrect ? '#22c55e' : '#ef4444',
                fontWeight: 600,
                marginBottom: 6,
              }}>
                {feedbackCorrect
                  ? '✅ Chính xác!'
                  : timer === 0 && selectedIdx === null
                    ? '⏰ Hết giờ!'
                    : '❌ Sai rồi!'}
              </p>
              {q.type === 'pick_wrong' && selectedIdx !== q.correctIndex && (
                <p className="cn-text" style={{ fontSize: '0.95rem', color: 'var(--accent-2)', marginBottom: 6 }}>
                  Câu sai: {q.options[q.correctIndex]}
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>{q.explanation}</p>
            </div>
          )}
        </>
      )}

      {answered && q.type !== 'sentence_order' && (
        <button
          type="button"
          className="btn-primary"
          onClick={onNext}
          style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
        >
          {currentQ + 1 < poolLength ? 'Câu tiếp theo' : 'Xem kết quả'} <ArrowRight size={16} />
        </button>
      )}
      {answered && q.type === 'sentence_order' && (
        <button
          type="button"
          className="btn-primary"
          onClick={onNext}
          style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
        >
          {currentQ + 1 < poolLength ? 'Câu tiếp theo' : 'Xem kết quả'} <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
