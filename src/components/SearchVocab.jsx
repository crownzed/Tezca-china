import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Volume2, Star, X, Clock, Filter, Bookmark } from 'lucide-react';

const MAX_RECENT = 8;

export default function SearchVocab() {
  const [allCards, setAllCards] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [hskFilter, setHskFilter] = useState(0); // 0=all, 1,2,3
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentSearches')) || []; } catch { return []; }
  });
  const [bookmarkedIds, setBookmarkedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bookmarkedIds')) || []; } catch { return []; }
  });
  const debounceRef = useRef(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    import('../vocab-loader').then(mod => mod.loadAllFlashcards().then(setAllCards));
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Save recent search
  const saveRecent = useCallback((q) => {
    if (!q.trim()) return;
    setRecentSearches(prev => {
      const next = [q.trim(), ...prev.filter(s => s !== q.trim())].slice(0, MAX_RECENT);
      localStorage.setItem('recentSearches', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  }, []);

  const normalizePinyin = (p) => p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // HSK counts
  const hskCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    allCards.forEach(c => { if (c.hskLevel && counts[c.hskLevel] !== undefined) counts[c.hskLevel]++; });
    return counts;
  }, [allCards]);

  const filtered = useMemo(() => {
    let pool = allCards;
    if (hskFilter > 0) pool = pool.filter(c => c.hskLevel === hskFilter);
    if (showBookmarksOnly) pool = pool.filter(c => bookmarkedIds.includes(c.id));

    if (!debouncedQuery.trim()) {
      if (showBookmarksOnly || hskFilter > 0) return pool.slice(0, 60);
      return [];
    }
    const q = debouncedQuery.trim().toLowerCase();
    const qNorm = normalizePinyin(q);
    return pool.filter(c => {
      if (c.character.includes(q)) return true;
      if (c.meaning.toLowerCase().includes(q)) return true;
      if (c.pinyin.toLowerCase().includes(q)) return true;
      if (normalizePinyin(c.pinyin).includes(qNorm)) return true;
      return false;
    }).slice(0, 60);
  }, [debouncedQuery, allCards, hskFilter, showBookmarksOnly, bookmarkedIds]);

  const playAudio = (char) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(char);
    u.lang = 'zh-CN'; u.rate = 0.8;
    window.speechSynthesis.speak(u);
  };

  const toggleBookmark = (e, id) => {
    e.stopPropagation();
    setBookmarkedIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem('bookmarkedIds', JSON.stringify(next));
      return next;
    });
  };

  const handleSearch = (q) => {
    setQuery(q);
    setSelectedCard(null);
    saveRecent(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) saveRecent(query);
  };

  return (
    <div style={{ maxWidth: 650, margin: '0 auto' }}>
      {/* HSK Filter Chips */}
      <div className="filter-chips">
        {[0, 1, 2, 3].map(level => (
          <button key={level} className={`filter-chip ${hskFilter === level ? 'active' : ''}`}
            onClick={() => { setHskFilter(level); setSelectedCard(null); }}>
            {level === 0 ? '📋 Tất cả' : `HSK ${level}`}
            {level > 0 && <span className="chip-count">({hskCounts[level] || 0})</span>}
          </button>
        ))}
        <button className={`filter-chip ${showBookmarksOnly ? 'active' : ''}`}
          onClick={() => { setShowBookmarksOnly(p => !p); setSelectedCard(null); }}
          style={showBookmarksOnly ? { background: '#fbbf24', borderColor: '#fbbf24', color: '#1a1f36' } : {}}>
          <Bookmark size={13} /> Yêu thích
        </button>
      </div>

      {/* Search bar */}
      <div className="glass-panel" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input autoFocus value={query}
          onChange={e => { setQuery(e.target.value); setSelectedCard(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Tìm theo chữ Hán, pinyin (không dấu), nghĩa..."
          style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none', fontFamily: 'var(--font-cn)' }} />
        {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>}
      </div>

      {/* Recent searches */}
      {!query && !showBookmarksOnly && hskFilter === 0 && recentSearches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} /> Tìm kiếm gần đây
            </span>
            <button onClick={clearRecent} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}>Xoá</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recentSearches.map((s, i) => (
              <button key={i} className="recent-tag" onClick={() => handleSearch(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result count */}
      {(debouncedQuery || showBookmarksOnly || hskFilter > 0) && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          {filtered.length === 0 ? 'Không tìm thấy kết quả' : `Tìm thấy ${filtered.length} kết quả`}
        </p>
      )}

      {/* Results list */}
      {filtered.length > 0 && !selectedCard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(card => (
            <div key={card.id} className="glass-panel" onClick={() => setSelectedCard(card)}
              style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'var(--transition)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                  <span className="cn-text" style={{ fontSize: '1.3rem', color: 'var(--accent-2)' }}>{card.character}</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--accent-3)' }}>{card.pinyin}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{card.meaning}</div>
              </div>
              <span className="tag tag-primary" style={{ fontSize: '0.6rem', flexShrink: 0 }}>HSK {card.hskLevel || '?'}</span>
              {card.category && <span className="tag tag-info" style={{ fontSize: '0.6rem', flexShrink: 0 }}>{card.category}</span>}
              <button onClick={e => { e.stopPropagation(); playAudio(card.character); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <Volume2 size={16} />
              </button>
              <button onClick={e => toggleBookmark(e, card.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, color: bookmarkedIds.includes(card.id) ? 'gold' : 'var(--text-muted)' }}>
                <Star size={16} fill={bookmarkedIds.includes(card.id) ? 'gold' : 'none'} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail view */}
      {selectedCard && (
        <div className="glass-panel animate-slide-up" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <button onClick={() => setSelectedCard(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
              ← Quay lại
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="tag tag-primary">HSK {selectedCard.hskLevel || '?'}</span>
              {selectedCard.strokeCount && <span className="tag tag-secondary">{selectedCard.strokeCount} nét</span>}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className="cn-text" style={{ fontSize: '4rem', color: 'var(--accent-2)', lineHeight: 1.2, marginBottom: 4, textShadow: '0 0 40px var(--cyan-glow)' }}>
              {selectedCard.character}
            </div>
            <div style={{ fontSize: '1.2rem', color: 'var(--accent-3)', marginBottom: 4 }}>{selectedCard.pinyin}</div>
            <div style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 600 }}>{selectedCard.meaning}</div>
            {selectedCard.category && <span className="tag tag-info" style={{ marginTop: 8 }}>{selectedCard.category}</span>}
          </div>

          {selectedCard.breakdown?.length > 0 && (
            <div style={{ background: 'rgba(91,106,191,0.06)', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid rgba(91,106,191,0.06)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Bộ thủ</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedCard.breakdown.map((b, i) => (
                  <span key={i} style={{ background: 'rgba(91,106,191,0.08)', borderRadius: 4, padding: '3px 8px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-cn)', fontSize: '1rem' }}>{b.radical}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{b.meaning}</span>
                  </span>
                ))}
              </div>
              {selectedCard.mnemonic && <div style={{ color: 'var(--accent-3)', fontStyle: 'italic', fontSize: '0.82rem', marginTop: 6 }}>💡 {selectedCard.mnemonic}</div>}
            </div>
          )}

          {/* Examples — support both new array format and old single format */}
          {selectedCard.examples?.length > 0 ? (
            <div style={{ background: 'rgba(79,195,247,0.04)', padding: 12, borderRadius: 8, border: '1px solid rgba(79,195,247,0.06)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>📝 Ví dụ</div>
              {selectedCard.examples.map((ex, i) => (
                <div key={i} style={{ marginBottom: i < selectedCard.examples.length - 1 ? 10 : 0, paddingBottom: i < selectedCard.examples.length - 1 ? 10 : 0, borderBottom: i < selectedCard.examples.length - 1 ? '1px solid rgba(79,195,247,0.08)' : 'none' }}>
                  <div className="cn-text" style={{ fontSize: '1rem', color: 'var(--accent-2)' }}>{ex.cn}</div>
                  {ex.pinyin && <div style={{ fontSize: '0.78rem', color: 'var(--accent-3)' }}>{ex.pinyin}</div>}
                  {ex.vi && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{ex.vi}</div>}
                </div>
              ))}
            </div>
          ) : selectedCard.exampleSentence && (
            <div style={{ background: 'rgba(79,195,247,0.04)', padding: 12, borderRadius: 8, border: '1px solid rgba(79,195,247,0.06)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>📝 Ví dụ</div>
              <div className="cn-text" style={{ fontSize: '1rem', color: 'var(--accent-2)' }}>{selectedCard.exampleSentence}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--accent-3)' }}>{selectedCard.examplePinyin}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{selectedCard.exampleVi}</div>
            </div>
          )}

          <button className="btn-primary" onClick={() => playAudio(selectedCard.character)} style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
            <Volume2 size={16} /> Nghe phát âm
          </button>
        </div>
      )}
    </div>
  );
}
