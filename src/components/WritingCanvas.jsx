import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, Eraser, Volume2, Sparkles, Eye, EyeOff, Undo2, Shuffle, PenLine } from 'lucide-react';

const GRID_COLOR = 'rgba(255,255,255,0.08)';
const GUIDE_COLOR = 'rgba(91,106,191,0.12)';
const STROKE_COLOR = '#5b6abf';
const HSK_LEVELS = [
  { level: 0, label: 'Tất cả' },
  { level: 1, label: 'HSK 1' },
  { level: 2, label: 'HSK 2' },
  { level: 3, label: 'HSK 3' },
];

function drawGrid(ctx, w, h) {
  // Main grid lines
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  const size = 30;
  for (let x = 0; x <= w; x += size) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += size) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Center cross guide (dashed)
  ctx.save();
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 6]);
  // Horizontal center
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  // Vertical center
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  // Diagonal X pattern
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.restore();
}

export default function WritingCanvas() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [allCharacters, setAllCharacters] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [currentCharIdx, setCurrentCharIdx] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [hskFilter, setHskFilter] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokeHistory, setStrokeHistory] = useState([]);
  const lastPos = useRef(null);
  const currentStroke = useRef([]);

  // Load all flashcards once
  useEffect(() => {
    import('../vocab-loader').then(mod =>
      mod.loadAllFlashcards().then(cards => {
        const chars = cards
          .filter(c => c.character && c.character.length <= 1)
          .map(c => ({
            character: c.character,
            pinyin: c.pinyin,
            meaning: c.meaning,
            hskLevel: c.hskLevel,
            strokeCount: c.strokeCount,
          }));
        setAllCharacters(chars);
      })
    );
  }, []);

  // Filter characters when HSK filter or allCharacters change
  useEffect(() => {
    if (allCharacters.length === 0) return;
    const filtered = hskFilter === 0
      ? allCharacters
      : allCharacters.filter(c => c.hskLevel === hskFilter);
    setCharacters(filtered);
    setCurrentCharIdx(0);
  }, [hskFilter, allCharacters]);

  // Draw reference character on canvas
  const drawReference = useCallback((ctx, canvas) => {
    if (characters[currentCharIdx]) {
      ctx.font = '140px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = showAnswer ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)';
      ctx.fillText(characters[currentCharIdx].character, canvas.width / 2, canvas.height / 2 + 10);
    }
  }, [characters, currentCharIdx, showAnswer]);

  // Redraw entire canvas (grid + reference + all history strokes)
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, canvas.width, canvas.height);
    drawReference(ctx, canvas);

    // Replay stroke history
    strokeHistory.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, [drawReference, strokeHistory]);

  // Redraw on char change, showAnswer toggle, or strokeHistory change
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Reset history when character changes
  useEffect(() => {
    setStrokeHistory([]);
    setHasDrawn(false);
  }, [currentCharIdx, characters]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const startDraw = (e) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const pos = getPos(e);
    lastPos.current = pos;
    currentStroke.current = [pos];
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    currentStroke.current.push(pos);
  };

  const stopDraw = () => {
    if (isDrawing && currentStroke.current.length > 0) {
      setStrokeHistory(prev => [...prev, { points: [...currentStroke.current], width: strokeWidth }]);
      currentStroke.current = [];
    }
    setIsDrawing(false);
  };

  const clear = () => {
    setStrokeHistory([]);
    setHasDrawn(false);
  };

  const undo = () => {
    if (strokeHistory.length === 0) return;
    setStrokeHistory(prev => prev.slice(0, -1));
    if (strokeHistory.length <= 1) setHasDrawn(false);
  };

  const nextChar = () => setCurrentCharIdx(prev => (prev + 1) % characters.length);
  const prevChar = () => setCurrentCharIdx(prev => (prev - 1 + characters.length) % characters.length);

  const randomChar = () => {
    if (characters.length <= 1) return;
    let idx;
    do { idx = Math.floor(Math.random() * characters.length); } while (idx === currentCharIdx);
    setCurrentCharIdx(idx);
  };

  const playAudio = () => {
    const c = characters[currentCharIdx];
    if (!c || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(c.character);
    u.lang = 'zh-CN';
    u.rate = 0.8;
    window.speechSynthesis.speak(u);
  };

  const currentChar = characters[currentCharIdx];

  if (allCharacters.length === 0) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Đang tải dữ liệu…</div>;
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>

      {/* HSK Filter Chips */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {HSK_LEVELS.map(h => (
          <button
            key={h.level}
            onClick={() => setHskFilter(h.level)}
            className={hskFilter === h.level ? 'btn-primary' : 'btn-secondary'}
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              transition: 'all 0.25s ease',
              transform: hskFilter === h.level ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Current character info */}
      <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="tag tag-primary">
            {currentCharIdx + 1} / {characters.length}
          </span>
          {currentChar?.hskLevel && (
            <span className="tag tag-secondary">HSK {currentChar.hskLevel}</span>
          )}
          {currentChar?.strokeCount && (
            <span className="tag tag-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <PenLine size={10} /> {currentChar.strokeCount} nét
            </span>
          )}
        </div>
        <h2 className="cn-text" style={{ fontSize: '3rem', color: 'var(--primary)', margin: '8px 0', transition: 'all 0.3s ease' }}>
          {currentChar?.character}
        </h2>
        <p style={{ fontSize: '1.1rem', color: 'var(--secondary)' }}>{currentChar?.pinyin}</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>{currentChar?.meaning}</p>
      </div>

      {/* Canvas toolbar: stroke width + show answer */}
      <div className="glass-panel" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', marginBottom: 8, gap: 12, flexWrap: 'wrap',
      }}>
        {/* Stroke width slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
          <PenLine size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="range"
            min={2}
            max={8}
            value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))}
            style={{
              flex: 1, height: 4, accentColor: 'var(--accent-1)',
              cursor: 'pointer', maxWidth: 120,
            }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 28, textAlign: 'center' }}>
            {strokeWidth}px
          </span>
        </div>

        {/* Show answer toggle */}
        <button
          onClick={() => setShowAnswer(prev => !prev)}
          className="btn-secondary"
          style={{
            padding: '5px 12px', fontSize: '0.78rem',
            background: showAnswer ? 'rgba(91,106,191,0.15)' : undefined,
            borderColor: showAnswer ? 'rgba(91,106,191,0.25)' : undefined,
          }}
        >
          {showAnswer ? <Eye size={14} /> : <EyeOff size={14} />}
          {showAnswer ? 'Ẩn mẫu' : 'Hiện mẫu'}
        </button>
      </div>

      {/* Canvas */}
      <div className="glass-panel" style={{ padding: 8, marginBottom: 20, touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          style={{
            width: '100%', height: 'auto', aspectRatio: '1/1',
            borderRadius: 'var(--radius-md)', cursor: 'crosshair',
            background: 'var(--surface)', display: 'block',
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={e => { e.preventDefault(); startDraw(e.touches[0]); }}
          onTouchMove={e => { e.preventDefault(); draw(e.touches[0]); }}
          onTouchEnd={stopDraw}
        />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn-secondary" onClick={prevChar}>
          ← Trước
        </button>
        <button
          className="btn-secondary"
          onClick={undo}
          disabled={strokeHistory.length === 0}
          style={{ opacity: strokeHistory.length === 0 ? 0.4 : 1 }}
          title="Hoàn tác nét cuối"
        >
          <Undo2 size={16} />
        </button>
        <button className="btn-primary" onClick={clear}>
          <Eraser size={16} /> Xoá
        </button>
        <button className="btn-primary" onClick={playAudio} style={{ background: 'var(--info)' }}>
          <Volume2 size={16} /> Đọc
        </button>
        <button
          className="btn-secondary"
          onClick={randomChar}
          title="Chữ ngẫu nhiên"
          style={{ fontSize: '1.1rem', padding: '8px 12px' }}
        >
          🎲
        </button>
        <button className="btn-secondary" onClick={nextChar}>
          Sau →
        </button>
      </div>

      {!hasDrawn && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Sparkles size={12} /> Vẽ chữ trên khung — tập viết đúng nét
        </p>
      )}
    </div>
  );
}
