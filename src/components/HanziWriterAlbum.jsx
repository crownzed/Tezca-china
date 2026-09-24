// ============================================================
// HanziWriterAlbum.jsx — Album/Sổ tay bộ sưu tập chữ Hán
// Hiển thị từ vựng đã merge được với stroke order animation,
// phân loại theo bộ thủ, sắp xếp linh hoạt, responsive 2 cột mobile
// ============================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { CHAR_COMPONENTS_DICT, RADICALS_DICT } from '../radicals-db.js';
import { BASE_RECIPES } from '../game/merge-data.js';
import { speak } from '../speech.jsx';

/** Load hanzi-writer data từ public/hanzi-data/ */
async function loadHanziData(char) {
  try {
    const resp = await fetch(`/hanzi-data/${char}.json`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Danh sách các bộ thủ thông dụng làm filter pills */
const POPULAR_RADICAL_PILLS = [
  { key: 'all', label: 'Tất cả' },
  { key: '亻', label: '亻 Nhân' },
  { key: '口', label: '口 Khẩu' },
  { key: '女', label: '女 Nữ' },
  { key: '木', label: '木 Mộc' },
  { key: '氵', label: '氵 Thủy' },
  { key: '日', label: '日 Nhật' },
  { key: '心', label: '心 Tâm' },
  { key: '艹', label: '艹 Thảo' },
  { key: '宀', label: '宀 Miên' },
  { key: '辶', label: '辶 Xước' },
];

/** Component hiển thị một chữ trong album */
function AlbumEntry({ char, recipe }) {
  const writerRef = useRef(null);
  const [writerInstance, setWriterInstance] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Khởi tạo HanziWriter khi mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const data = await loadHanziData(char);
      if (cancelled || !data || !writerRef.current) return;

      try {
        const HanziWriter = (await import('hanzi-writer')).default;

        const writer = HanziWriter.create(writerRef.current, char, {
          width: 80,
          height: 80,
          padding: 5,
          showOutline: true,
          strokeColor: '#333333',
          radicalColor: '#D94A4A',
          delayBetweenStrokes: 200,
          strokeAnimationSpeed: 1.1,
          charDataLoader: () => Promise.resolve(data),
        });

        if (!cancelled) setWriterInstance(writer);
      } catch {
        // HanziWriter không khả dụng — dùng fallback
      }
    }

    init();
    return () => { cancelled = true; };
  }, [char]);

  const handleAnimate = () => {
    if (!writerInstance || isAnimating) return;
    setIsAnimating(true);
    writerInstance.animateCharacter({
      onComplete: () => setIsAnimating(false),
    });
  };

  const handleSpeak = (e) => {
    e.stopPropagation();
    setIsPlayingAudio(true);
    speak(char, 0.8, () => setIsPlayingAudio(false));
  };

  // Components breakdown
  const components = recipe?.components || CHAR_COMPONENTS_DICT[char] || [];
  const componentLabels = components.map(c => {
    const name = RADICALS_DICT[c];
    if (!name) return c;
    const short = name.includes('(') ? name.match(/\(([^)]+)\)/)?.[1] || name : name;
    return `${c} ${short}`;
  });

  return (
    <div
      onClick={handleAnimate}
      className="album-entry-card"
      role="button"
      tabIndex={0}
      title="Nhấn để xem hoạt họa nét viết"
    >
      {/* HanziWriter canvas hoặc text fallback */}
      <div ref={writerRef} className="album-entry-canvas">
        {!writerInstance && (
          <div className="album-fallback-char">
            {char}
          </div>
        )}
      </div>

      {/* Pinyin + Âm thanh phát âm chuẩn */}
      <div className="album-entry-pinyin-row">
        <span className="album-entry-pinyin">{recipe?.pinyin || ''}</span>
        <button
          type="button"
          onClick={handleSpeak}
          className={`album-audio-btn ${isPlayingAudio ? 'is-playing' : ''}`}
          aria-label={`Phát âm chữ ${char}`}
          title="Nghe phát âm tiếng Trung chuẩn"
        >
          {isPlayingAudio ? '🔊' : '🔈'}
        </button>
      </div>

      <div className="album-entry-meaning">
        {recipe?.meaning_vi || ''}
      </div>

      {/* Components breakdown */}
      {componentLabels.length > 0 && (
        <div className="album-entry-components">
          {componentLabels.join(' + ')}
        </div>
      )}

      {/* Nút xem nét viết */}
      <div className="album-entry-actions">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAnimate();
          }}
          className={`album-action-pill ${isAnimating ? 'is-animating' : ''}`}
        >
          {isAnimating ? '✍️ Đang viết...' : '✍️ Xem nét'}
        </button>
      </div>
    </div>
  );
}

export default function HanziWriterAlbum({ unlockedChars, onClose }) {
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'pinyin' | 'components'
  const [selectedRadical, setSelectedRadical] = useState('all');

  // Build danh sách entries từ unlocked chars
  const entries = useMemo(() => {
    const list = [];
    for (const char of unlockedChars) {
      const recipe = BASE_RECIPES[char];
      list.push({ char, recipe });
    }

    // 1. Filter theo search text (chữ, pinyin, nghĩa)
    let filtered = list;
    if (filter.trim()) {
      const lower = filter.trim().toLowerCase();
      filtered = filtered.filter(e =>
        e.char.includes(lower) ||
        (e.recipe?.pinyin || '').toLowerCase().includes(lower) ||
        (e.recipe?.meaning_vi || '').toLowerCase().includes(lower)
      );
    }

    // 2. Filter theo radical pill
    if (selectedRadical !== 'all') {
      filtered = filtered.filter(e => {
        const comps = e.recipe?.components || CHAR_COMPONENTS_DICT[e.char] || [];
        return comps.includes(selectedRadical);
      });
    }

    // 3. Sorting
    const sorted = [...filtered];
    if (sortBy === 'recent') {
      sorted.reverse(); // Mới mở khóa lên trước
    } else if (sortBy === 'pinyin') {
      sorted.sort((a, b) => (a.recipe?.pinyin || '').localeCompare(b.recipe?.pinyin || ''));
    } else if (sortBy === 'components') {
      sorted.sort((a, b) => (a.recipe?.components?.length || 0) - (b.recipe?.components?.length || 0));
    }

    return sorted;
  }, [unlockedChars, filter, selectedRadical, sortBy]);

  const totalTarget = 162; // HSK1 single-char target
  const unlockedCount = unlockedChars.size;
  const progressPercent = Math.min(100, Math.round((unlockedCount / totalTarget) * 100));

  // Danh hiệu tiến độ
  let rankTitle = 'Tập sự';
  if (unlockedCount >= 120) rankTitle = 'Bậc thầy Hán tự 👑';
  else if (unlockedCount >= 60) rankTitle = 'Chuyên gia ghép cá 🌟';
  else if (unlockedCount >= 20) rankTitle = 'Ngư phủ chăm chỉ 🐟';

  return (
    <div className="album-container">
      {/* Header bar */}
      <div className="album-header">
        <div className="album-header-main">
          <div className="album-header-title-row">
            <h2 className="album-title">📖 Sổ Tay Chữ Hán</h2>
            <span className="album-rank-tag">{rankTitle}</span>
          </div>

          <div className="album-progress-wrap">
            <div className="album-progress-meta">
              <span>Tiến độ HSK1: <strong>{unlockedCount}/{totalTarget}</strong> chữ</span>
              <span className="album-progress-pct">{progressPercent}%</span>
            </div>
            <div className="album-progress-bar">
              <div
                className="album-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="album-close-btn"
          aria-label="Đóng sổ tay"
        >
          ✕ Đóng
        </button>
      </div>

      {/* Controls: Search + Sort Dropdown */}
      <div className="album-controls-bar">
        <div className="album-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Tìm chữ, pinyin, nghĩa..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="album-search-input"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="search-clear-btn"
            >
              ✕
            </button>
          )}
        </div>

        <div className="album-sort-wrap">
          <label htmlFor="album-sort-select" className="sort-label">Sắp xếp:</label>
          <select
            id="album-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="album-sort-select"
          >
            <option value="recent">Mới nhất</option>
            <option value="pinyin">Pinyin A-Z</option>
            <option value="components">Số bộ thủ</option>
          </select>
        </div>
      </div>

      {/* Radical Filter Pills */}
      <div className="album-pills-scroll">
        {POPULAR_RADICAL_PILLS.map(pill => (
          <button
            key={pill.key}
            type="button"
            onClick={() => setSelectedRadical(pill.key)}
            className={`album-pill ${selectedRadical === pill.key ? 'is-selected' : ''}`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Grid entries & Empty state */}
      <div className="album-content-scroll">
        {entries.length === 0 ? (
          <div className="album-empty-state">
            <div className="empty-icon-bubble">
              {unlockedCount === 0 ? '🐟' : '🔍'}
            </div>
            <h3>
              {unlockedCount === 0
                ? 'Sổ tay chưa có chữ nào'
                : 'Không tìm thấy kết quả phù hợp'}
            </h3>
            <p>
              {unlockedCount === 0
                ? 'Hãy quay lại bể cá và kéo các chú cá mang bộ thủ vào nhau để ghép thành chữ Hán đầu tiên của bạn!'
                : `Không có chữ nào khớp với bộ lọc "${filter || selectedRadical}". Hãy thử tìm kiếm từ khác.`}
            </p>
            {(filter || selectedRadical !== 'all') && (
              <button
                type="button"
                onClick={() => { setFilter(''); setSelectedRadical('all'); }}
                className="empty-reset-btn"
              >
                ✕ Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <div className="album-grid">
            {entries.map(e => (
              <AlbumEntry key={e.char} char={e.char} recipe={e.recipe} />
            ))}
          </div>
        )}
      </div>

      {/* Scoped CSS styling */}
      <style>{`
        .album-container {
          position: absolute;
          inset: 0;
          background: rgba(6, 16, 30, 0.98);
          backdrop-filter: blur(14px);
          z-index: 30;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #fff;
        }

        .album-header {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          background: rgba(10, 22, 40, 0.9);
        }

        .album-header-main {
          flex: 1;
        }

        .album-header-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .album-title {
          margin: 0;
          color: #FFD700;
          font-size: 18px;
          font-weight: 700;
        }

        .album-rank-tag {
          font-size: 11px;
          background: rgba(255, 215, 0, 0.15);
          color: #FFD700;
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 6px;
          padding: 2px 8px;
          font-weight: 600;
        }

        .album-progress-wrap {
          margin-top: 8px;
          max-width: 320px;
        }

        .album-progress-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 4px;
        }

        .album-progress-meta strong {
          color: #fff;
        }

        .album-progress-pct {
          color: #FFD700;
          font-weight: 700;
        }

        .album-progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 4px;
          overflow: hidden;
        }

        .album-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3A80D2 0%, #60A5FA 60%, #FFD700 100%);
          border-radius: 4px;
          transition: width 0.4s ease;
        }

        .album-close-btn {
          min-height: 44px;
          padding: 0 14px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          transition: all 0.2s ease;
        }

        .album-close-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .album-controls-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px 6px;
        }

        .album-search-wrap {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 10px;
          font-size: 13px;
          opacity: 0.6;
          pointer-events: none;
        }

        .album-search-input {
          width: 100%;
          min-height: 44px;
          padding: 0 32px 0 32px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s ease;
        }

        .album-search-input:focus {
          border-color: #3A80D2;
          background: rgba(255, 255, 255, 0.1);
        }

        .search-clear-btn {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }

        .album-sort-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .sort-label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
        }

        .album-sort-select {
          min-height: 44px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #0d1e34;
          color: #fff;
          font-size: 13px;
          outline: none;
          cursor: pointer;
        }

        .album-pills-scroll {
          display: flex;
          gap: 8px;
          padding: 4px 16px 10px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        .album-pills-scroll::-webkit-scrollbar {
          display: none;
        }

        .album-pill {
          min-height: 36px;
          padding: 0 12px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.85);
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .album-pill.is-selected {
          background: #3A80D2;
          border-color: #6BA8ED;
          color: #fff;
          font-weight: 700;
        }

        .album-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px 16px 24px;
          -webkit-overflow-scrolling: touch;
        }

        /* Responsive Grid: 2 cột trên mobile, auto-fill trên desktop */
        .album-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
        }

        @media (max-width: 480px) {
          .album-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
        }

        .album-entry-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 14px 10px 12px;
          border-radius: 16px;
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          cursor: pointer;
          transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.2s ease;
          user-select: none;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          position: relative;
        }

        .album-entry-card:hover {
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.05) 100%);
          transform: translateY(-4px) scale(1.02);
          border-color: rgba(96, 165, 250, 0.5);
          box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.5), 0 0 16px rgba(58, 128, 210, 0.3);
        }

        .album-entry-card:active {
          transform: scale(0.98);
        }

        .album-entry-canvas {
          width: 82px;
          height: 82px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.96);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }

        .album-fallback-char {
          font-size: 48px;
          font-weight: 700;
          color: #1a1a1a;
          font-family: "Noto Sans SC", sans-serif;
          line-height: 1;
        }

        .album-entry-pinyin-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 8px;
        }

        .album-entry-pinyin {
          font-size: 14px;
          font-weight: 700;
          color: #6BA8ED;
        }

        .album-audio-btn {
          width: 28px;
          height: 28px;
          min-width: 28px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(58, 128, 210, 0.25);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: all 0.2s ease;
        }

        .album-audio-btn:hover {
          background: rgba(58, 128, 210, 0.5);
          transform: scale(1.1);
          border-color: #60A5FA;
        }

        .album-audio-btn.is-playing {
          animation: pulseSound 0.8s infinite;
          background: rgba(255, 215, 0, 0.3);
          border-color: #FFD700;
        }

        @keyframes pulseSound {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); box-shadow: 0 0 10px rgba(255, 215, 0, 0.6); }
        }

        .album-entry-meaning {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.9);
          text-align: center;
          margin-top: 2px;
          line-height: 1.3;
        }

        .album-entry-components {
          font-size: 11px;
          color: #FFD700;
          margin-top: 6px;
          text-align: center;
          line-height: 1.3;
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.2);
          padding: 2px 8px;
          border-radius: 8px;
        }

        .album-entry-actions {
          margin-top: 8px;
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .album-action-pill {
          min-height: 28px;
          padding: 0 10px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .album-action-pill:hover {
          background: rgba(58, 128, 210, 0.3);
          border-color: rgba(96, 165, 250, 0.4);
          color: #fff;
        }

        .album-action-pill.is-animating {
          background: rgba(255, 215, 0, 0.2);
          border-color: rgba(255, 215, 0, 0.4);
          color: #FFD700;
        }

        /* Empty State */
        .album-empty-state {
          text-align: center;
          padding: 48px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          max-width: 380px;
          margin: 0 auto;
        }

        .empty-icon-bubble {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          margin-bottom: 16px;
        }

        .album-empty-state h3 {
          margin: 0 0 8px;
          font-size: 17px;
          color: #fff;
        }

        .album-empty-state p {
          margin: 0 0 20px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.5;
        }

        .empty-reset-btn {
          min-height: 44px;
          padding: 0 18px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        @media (prefers-reduced-motion: reduce) {
          .album-entry-card, .album-audio-btn, .album-action-pill, .album-progress-fill {
            transition: none !important;
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
