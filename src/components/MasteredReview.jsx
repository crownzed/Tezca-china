import React, { useState, useEffect, useCallback } from 'react';
import FlashcardFlip from './FlashcardFlip';
import { ChevronLeft, ChevronRight, CheckCircle2, Bookmark, Volume2, ArrowRight } from 'lucide-react';

function getSRSMastered(cardIds) {
  try {
    const raw = localStorage.getItem('srsData');
    if (!raw) return [];
    const srs = JSON.parse(raw);
    return cardIds.filter(id => {
      const c = srs[id];
      return c && c.interval >= 21 && c.rep >= 3;
    });
  } catch { return []; }
}

function getLearnedIds() {
  try { return JSON.parse(localStorage.getItem('learnedIds')) || []; } catch { return []; }
}

function getSRSData(cardIds) {
  try {
    const raw = localStorage.getItem('srsData');
    if (!raw) return {};
    const srs = JSON.parse(raw);
    const result = {};
    cardIds.forEach(id => {
      if (srs[id]) result[id] = srs[id];
    });
    return result;
  } catch { return {}; }
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.round((now - d) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff < 7) return `${diff} ngày trước`;
  if (diff < 30) return `${Math.floor(diff / 7)} tuần trước`;
  return d.toLocaleDateString('vi-VN');
}

export default function MasteredReview() {
  const [allCards, setAllCards] = useState([]);
  const [learnedIds, setLearnedIds] = useState([]);
  const [masteredIds, setMasteredIds] = useState([]);
  const [srsData, setSrsData] = useState({});
  const [sortBy, setSortBy] = useState('hsk'); // 'hsk' | 'recent' | 'name'
  const [hskFilter, setHskFilter] = useState('all');
  const [reviewMode, setReviewMode] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slideDir, setSlideDir] = useState('right');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    import('../vocab-loader').then(m => m.loadAllFlashcards()).then(cards => {
      setAllCards(cards);
      const lids = getLearnedIds();
      setLearnedIds(lids);
      const mids = getSRSMastered(cards.map(c => c.id));
      setMasteredIds(mids);
      setSrsData(getSRSData(cards.map(c => c.id)));
    });
  }, []);

  // Cards that are learned (manual) OR mastered (SRS interval >= 21)
  const allKnownIds = [...new Set([...learnedIds, ...masteredIds])];

  const knownCards = allCards
    .filter(c => allKnownIds.includes(c.id))
    .filter(c => hskFilter === 'all' || c.hskLevel === parseInt(hskFilter));

  const sortedCards = [...knownCards].sort((a, b) => {
    if (sortBy === 'hsk') return (a.hskLevel || 99) - (b.hskLevel || 99);
    if (sortBy === 'name') return a.character.localeCompare(b.character, 'zh-CN');
    if (sortBy === 'recent') {
      const aTime = srsData[a.id]?.nextReview || 0;
      const bTime = srsData[b.id]?.nextReview || 0;
      return bTime - aTime;
    }
    return 0;
  });

  // Stats
  const hskBreakdown = {};
  knownCards.forEach(c => {
    const lvl = `HSK ${c.hskLevel}`;
    hskBreakdown[lvl] = (hskBreakdown[lvl] || 0) + 1;
  });

  const reviewCards = sortedCards;
  const currentCard = reviewCards[currentIdx];

  const startReview = () => {
    setCurrentIdx(0);
    setFlipped(false);
    setReviewMode(true);
  };

  const goTo = useCallback((dir) => {
    setSlideDir(dir);
    if (dir === 'right') {
      setCurrentIdx(prev => (prev + 1) % reviewCards.length);
    } else {
      setCurrentIdx(prev => (prev - 1 + reviewCards.length) % reviewCards.length);
    }
  }, [reviewCards.length]);

  useEffect(() => {
    setFlipped(false);
  }, [currentIdx]);

  const playAudio = useCallback((e) => {
    e?.stopPropagation();
    if (!currentCard) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(currentCard.character);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  }, [currentCard]);

  const toggleLearned = useCallback((e) => {
    e?.stopPropagation();
    if (!currentCard) return;
    const id = currentCard.id;
    setLearnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem('learnedIds', JSON.stringify(next));
      // If removed from learned, advance to next card
      if (!next.includes(id) && reviewCards.length > 1) {
        setCurrentIdx(prev => Math.min(prev, reviewCards.length - 2));
      }
      return next;
    });
    setToast({ msg: learnedIds.includes(currentCard.id) ? 'Đã bỏ đã thuộc' : '✅ Đã đánh dấu thuộc!', type: 'success' });
  }, [currentCard, reviewCards.length, learnedIds]);

  const goToUnlearned = (dir) => {
    if (reviewCards.length === 0) return;
    let idx = currentIdx;
    const step = dir === 'next' ? 1 : -1;
    for (let i = 0; i < reviewCards.length; i++) {
      idx = (idx + step + reviewCards.length) % reviewCards.length;
      if (!learnedIds.includes(reviewCards[idx].id) && masteredIds.includes(reviewCards[idx].id)) {
        setSlideDir(dir === 'next' ? 'right' : 'left');
        setCurrentIdx(idx);
        return;
      }
    }
    setToast({ msg: 'Tất cả đều trong danh sách đã thuộc', type: 'success' });
  };

  const toggleBookmark = useCallback((e) => {
    e?.stopPropagation();
    if (!currentCard) return;
    const id = currentCard.id;
    const stored = (() => { try { return JSON.parse(localStorage.getItem('bookmarkedIds')) || []; } catch { return []; } })();
    const next = stored.includes(id) ? stored.filter(i => i !== id) : [...stored, id];
    localStorage.setItem('bookmarkedIds', JSON.stringify(next));
    setToast({ msg: stored.includes(id) ? 'Đã bỏ đánh dấu' : '⭐ Đã lưu yêu thích', type: 'success' });
  }, [currentCard]);

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // --- Review Mode (giống flashcard) ---
  if (reviewMode) {
    if (reviewCards.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p>Chưa có từ nào đã thuộc để ôn.</p>
          <button className="btn-secondary" onClick={() => setReviewMode(false)} style={{ marginTop: 16 }}>
            Quay lại danh sách
          </button>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
          <div className="stat-card" style={{ textAlign: 'center', padding: '12px 20px' }}>
            <div className="stat-value" style={{ fontSize: '1.3rem', color: '#22c55e' }}>{reviewCards.length}</div>
            <div className="stat-label">Đã thuộc</div>
          </div>
          <div className="stat-card" style={{ textAlign: 'center', padding: '12px 20px' }}>
            <div className="stat-value" style={{ fontSize: '1.3rem' }}>{currentIdx + 1}</div>
            <div className="stat-label">Đang xem</div>
          </div>
          <button className="btn-secondary" onClick={() => setReviewMode(false)} style={{ padding: '12px 16px' }}>
            ✕ Thoát
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>{currentIdx + 1}/{reviewCards.length}</span>
            <span>{Math.round(((currentIdx + 1) / reviewCards.length) * 100)}%</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${((currentIdx + 1) / reviewCards.length) * 100}%` }} />
          </div>
        </div>

        <FlashcardFlip
          card={currentCard}
          flipped={flipped}
          onFlip={() => setFlipped(f => !f)}
          bookmarked={(currentCard ? (() => { try { return JSON.parse(localStorage.getItem('bookmarkedIds'))?.includes(currentCard.id); } catch { return false; } })() : false)}
          onToggleBookmark={toggleBookmark}
          onPlayAudio={playAudio}
          enterFrom={slideDir}
        />

        {/* Learned toggle */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button className={learnedIds.includes(currentCard.id) ? 'btn-primary' : 'btn-secondary'} onClick={toggleLearned} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            {learnedIds.includes(currentCard.id) ? '✅ Đã thuộc' : '◻ Chưa thuộc'}
          </button>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => goTo('left')} style={{ padding: '8px 10px' }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{currentIdx + 1} / {reviewCards.length}</span>
          <button className="btn-secondary" onClick={() => goTo('right')} style={{ padding: '8px 10px' }}>
            <ChevronRight size={18} />
          </button>
          <span style={{ width: 1, height: 24, background: 'var(--glass-border)', margin: '0 4px' }} />
          <button className="btn-secondary" onClick={() => goToUnlearned('prev')} title="Chưa thuộc trước" style={{ padding: '8px 10px', color: 'var(--accent-3)' }}>
            <ChevronLeft size={16} /> <span style={{ fontSize: '0.75rem' }}>Ch.thuộc</span>
          </button>
          <button className="btn-secondary" onClick={() => goToUnlearned('next')} title="Chưa thuộc tiếp" style={{ padding: '8px 10px', color: 'var(--accent-3)' }}>
            <span style={{ fontSize: '0.75rem' }}>Ch.thuộc</span> <ChevronRight size={16} />
          </button>
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)' }}>
            <CheckCircle2 size={16} />
            <span style={{ marginLeft: 8 }}>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  // --- List Mode ---
  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Stats header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
          <CheckCircle2 size={20} style={{ color: '#22c55e', marginBottom: 6 }} />
          <div className="stat-value" style={{ color: '#22c55e', fontSize: '1.8rem' }}>{knownCards.length}</div>
          <div className="stat-label">Tổng đã thuộc</div>
        </div>
        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
          <Bookmark size={20} style={{ color: 'gold', marginBottom: 6 }} />
          <div className="stat-value" style={{ fontSize: '1.8rem' }}>{knownCards.filter(c => { try { return JSON.parse(localStorage.getItem('bookmarkedIds'))?.includes(c.id); } catch { return false; } }).length}</div>
          <div className="stat-label">Yêu thích</div>
        </div>
        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
          <Volume2 size={20} style={{ color: 'var(--accent-2)', marginBottom: 6 }} />
          <div className="stat-value" style={{ fontSize: '1.8rem' }}>{masteredIds.length}</div>
          <div className="stat-label">SRS thành thạo</div>
        </div>
      </div>

      {/* HSK breakdown */}
      {Object.keys(hskBreakdown).length > 0 && (
        <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.8rem' }}>
            {Object.entries(hskBreakdown).sort(([a], [b]) => a.localeCompare(b)).map(([lvl, count]) => (
              <span key={lvl} className="tag tag-primary">{lvl}: {count} từ</span>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setHskFilter('all')} style={{
            background: hskFilter === 'all' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${hskFilter === 'all' ? 'var(--primary)' : 'var(--glass-border)'}`,
            color: hskFilter === 'all' ? '#fff' : 'var(--text-muted)',
            padding: '5px 12px', borderRadius: 'var(--radius-xl)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
          }}>
            Tất cả
          </button>
          {['1','2','3','4','5','6'].map(lvl => (
            <button key={lvl} onClick={() => setHskFilter(lvl)} style={{
              background: hskFilter === lvl ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${hskFilter === lvl ? 'var(--primary)' : 'var(--glass-border)'}`,
              color: hskFilter === lvl ? '#fff' : 'var(--text-muted)',
              padding: '5px 12px', borderRadius: 'var(--radius-xl)',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
            }}>
              HSK {lvl}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="review-sort-select">
            <option value="hsk">HSK</option>
            <option value="name">Chữ Hán</option>
            <option value="recent">Gần đây</option>
          </select>
          {knownCards.length > 0 && (
            <button className="btn-primary" onClick={startReview}>
              Ôn nhanh <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      {sortedCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p>Chưa có từ nào được đánh dấu là đã thuộc.</p>
          <p style={{ fontSize: '0.85rem', marginTop: 8 }}>
            Học từ vựng trong mục Lật thẻ và đánh dấu ✅ Đã thuộc để xem lại tại đây.
          </p>
        </div>
      ) : (
        <div className="mastered-grid">
          {sortedCards.map(card => {
            const srs = srsData[card.id];
            const bookmarked = (() => { try { return JSON.parse(localStorage.getItem('bookmarkedIds'))?.includes(card.id); } catch { return false; } })();
            return (
              <div key={card.id} className="mastered-card glass-panel" onClick={() => { setCurrentIdx(sortedCards.indexOf(card)); setReviewMode(true); }}>
                <div className="mastered-card-header">
                  <span className="tag tag-primary" style={{ fontSize: '0.6rem' }}>HSK {card.hskLevel}</span>
                  {bookmarked && <span style={{ fontSize: '0.7rem' }}>⭐</span>}
                </div>
                <div className="mastered-card-char">{card.character}</div>
                <div className="mastered-card-pinyin">{card.pinyin}</div>
                <div className="mastered-card-meaning">{card.meaning}</div>
                {srs && (
                  <div className="mastered-card-meta">
                    <span>✅ {srs.interval} ngày</span>
                    {srs.nextReview && <span>📅 {formatDate(srs.nextReview)}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)' }}>
          <CheckCircle2 size={16} />
          <span style={{ marginLeft: 8 }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
