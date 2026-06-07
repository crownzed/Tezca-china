import { useCallback } from 'react';

/**
 * Thẻ flashcard 3D — click vùng thẻ để lật; nút trên mặt sau không kích hoạt lật.
 */
export default function FlashcardFlip({
  card,
  flipped,
  onFlip,
  bookmarked,
  onToggleBookmark,
  onPlayAudio,
  enterFrom = 'right',
}) {
  const handleFlip = useCallback(() => {
    onFlip?.();
  }, [onFlip]);

  const stopFlip = useCallback((e) => {
    e.stopPropagation();
  }, []);

  if (!card) return null;

  const charSize = card.character.length > 1 ? '5rem' : '8rem';

  return (
    <div
      className={`flashcard-viewport flashcard-viewport--from-${enterFrom}`}
      key={card.id}
    >
      <button
        type="button"
        className={`flashcard ${flipped ? 'flashcard--flipped' : ''}`}
        onClick={handleFlip}
        aria-label={flipped ? 'Ẩn nghĩa, xem chữ Hán' : 'Lật thẻ, xem nghĩa'}
        aria-pressed={flipped}
      >
        <div className="flashcard__scene">
          {/* Mặt trước — chữ Hán */}
          <div className="flashcard__face flashcard__face--front">
            <div className="flashcard__tags">
              <span className="tag tag-primary" style={{ fontSize: '0.65rem' }}>
                HSK {card.hskLevel}
              </span>
              {card.category && (
                <span className="tag tag-secondary" style={{ fontSize: '0.65rem' }}>
                  {card.category}
                </span>
              )}
            </div>
            {card.strokeCount && (
              <span className="flashcard__meta">{card.strokeCount} nét</span>
            )}
            <div className="flashcard__character-wrap">
              <span
                className="cn-text flashcard__character"
                style={{ fontSize: charSize }}
              >
                {card.character}
              </span>
            </div>
            <span className="flashcard__hint">Chạm để lật</span>
          </div>

          {/* Mặt sau — nghĩa, ví dụ */}
          <div className="flashcard__face flashcard__face--back">
            <div className="flashcard__actions" onClick={stopFlip}>
              <button
                type="button"
                className="flashcard__icon-btn"
                onClick={onToggleBookmark}
                aria-label={bookmarked ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
              >
                {bookmarked ? '⭐' : '☆'}
              </button>
              <button
                type="button"
                className="flashcard__audio-btn"
                onClick={onPlayAudio}
              >
                🔊 Đọc
              </button>
            </div>

            <div className="flashcard__meaning">
              <div className="cn-text flashcard__meaning-char">{card.character}</div>
              <div className="flashcard__pinyin">{card.pinyin}</div>
              <div className="flashcard__definition">{card.meaning}</div>
            </div>

            {card.breakdown?.length > 0 && (
              <div className="flashcard__section">
                <div className="flashcard__radicals">
                  {card.breakdown.map((b, i) => (
                    <span key={i} className="flashcard__radical-chip">
                      <span className="cn-text">{b.radical}</span>
                      <span>{b.meaning}</span>
                    </span>
                  ))}
                </div>
                {card.mnemonic && (
                  <p className="flashcard__mnemonic">💡 {card.mnemonic}</p>
                )}
              </div>
            )}

            {/* Nhiều ví dụ (mới) hoặc một ví dụ (cũ) */}
            {card.examples?.length > 0 ? (
              <div className="flashcard__section flashcard__section--example">
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>📝 Ví dụ</div>
                {card.examples.map((ex, i) => (
                  <div key={i} style={{ marginBottom: i < card.examples.length - 1 ? 8 : 0, paddingBottom: i < card.examples.length - 1 ? 8 : 0, borderBottom: i < card.examples.length - 1 ? '1px solid rgba(91,106,191,0.06)' : 'none' }}>
                    <div className="cn-text flashcard__example-cn">{ex.cn}</div>
                    <div className="flashcard__example-py">{ex.pinyin}</div>
                    <div className="flashcard__example-vi">{ex.vi}</div>
                  </div>
                ))}
              </div>
            ) : card.exampleSentence && (
              <div className="flashcard__section flashcard__section--example">
                <div className="cn-text flashcard__example-cn">{card.exampleSentence}</div>
                <div className="flashcard__example-py">{card.examplePinyin}</div>
                <div className="flashcard__example-vi">{card.exampleVi}</div>
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
