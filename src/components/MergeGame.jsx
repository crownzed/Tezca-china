// ============================================================
// MergeGame.jsx — Component chính minigame ghép chữ Hán
// Canvas bể cá + drag-drop + album collection + tutorial + feedback
// ============================================================

import { useRef, useEffect, useState, useCallback, lazy, Suspense, Component } from 'react';
import { createFishRenderer } from '../game/fish-renderer.js';
import { useGameState } from '../game/use-game-state.js';
import { speak } from '../speech.jsx';

// Lazy-load HanziWriter cho album
const HanziWriterAlbum = lazy(() => import('./HanziWriterAlbum.jsx'));

// ── Shared AudioContext singleton ──────────────────────────────
// Tránh tạo AudioContext mới mỗi lần phát âm thanh (gây leak memory + giới hạn browser)
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume nếu bị suspended (browser autoplay policy)
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

/** Âm thanh bọt nước khi chạm hoặc chọn cá */
function playBubbleSound(isSoundEnabled = true) {
  if (!isSoundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // Oscillator lỗi — không ảnh hưởng game
  }
}

/** Hợp âm ngũ cung thăng hoa theo chuỗi Combo khi merge */
function playMergeSound(success, isSoundEnabled = true, combo = 1) {
  if (!isSoundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (success) {
      // Chuỗi ngũ cung C5, D5, E5, G5, A5, C6
      const pentatonic = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      const baseIdx = Math.min(Math.max(0, combo - 1), 3);
      const notes = [pentatonic[baseIdx], pentatonic[baseIdx + 1], pentatonic[baseIdx + 2]];

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(ctx.destination);

        const startTime = ctx.currentTime + i * 0.08;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(130, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Oscillator lỗi — không ảnh hưởng game
  }
}

/** Lightweight error boundary cho album panel — giữ game sống nếu album crash */
class AlbumErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('[AlbumErrorBoundary]', err, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(10,22,40,0.95)',
          color: '#f87171', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 30, gap: 12,
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 14 }}>Album gặp lỗi hiển thị</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
            }}
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MergeGame() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const requestRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ active: false, fishId: null, startX: 0, startY: 0, targetId: null });

  const game = useGameState();
  const gameRef = useRef(game);
  const [mergeAnim, setMergeAnim] = useState(null);
  const [cinematicUnlock, setCinematicUnlock] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Tính toán các cặp có thể merge (memoized + throttled)
  // Chỉ tính lại khi số lượng cá hoặc unlockedChars thay đổi, KHÔNG phải mỗi frame
  const [cachedPairs, setCachedPairs] = useState([]);
  const pairsTimerRef = useRef(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    // Debounce: chỉ tính lại sau 300ms khi fish list ổn định
    if (pairsTimerRef.current) clearTimeout(pairsTimerRef.current);
    pairsTimerRef.current = setTimeout(() => {
      setCachedPairs(gameRef.current.getMergeablePairs());
    }, 300);
    return () => {
      if (pairsTimerRef.current) clearTimeout(pairsTimerRef.current);
    };
  }, [game.fish.length, game.unlockedChars, game.mergeCount]);

  const mergeablePairs = cachedPairs;

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('merge-sound-enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('merge-sound-enabled', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Onboarding Tutorial State
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return localStorage.getItem('merge-game-tutorial-done') !== 'true';
    } catch {
      return false;
    }
  });

  const closeTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem('merge-game-tutorial-done', 'true');
    } catch {
      // ignore
    }
  };

  // Hint system - hiển thị cặp có thể merge
  const toggleHint = useCallback(() => {
    setShowHint(prev => !prev);
  }, []);

  // Auto-hide hint sau 3 giây
  useEffect(() => {
    if (showHint) {
      const timer = setTimeout(() => setShowHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showHint]);

  // Khởi tạo renderer
  // Sync pause ref cho animation loop (tránh stale closure)
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createFishRenderer(canvas);
    rendererRef.current = renderer;
    renderer.resize();

    // ResizeObserver cho container
    const resizeObserver = new ResizeObserver(() => renderer.resize());
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Animation loop — physics chạy trực tiếp trên mutable fish objects,
    // KHÔNG trigger React setState mỗi frame để tránh lag
    const render = (time) => {
      if (document.hidden || isPausedRef.current) {
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      try {
        const currentGame = gameRef.current;
        renderer.updatePositions(currentGame.fish, delta);

        // Render scene
        renderer.render(currentGame.fish, currentGame.selectedIds, {
          targetId: dragRef.current.targetId,
        }, time);
      } catch (err) {
        console.error('[MergeGame] render error:', err);
        // Không crash rAF chain — skip frame và tiếp tục
      }

      requestRef.current = requestAnimationFrame(render);
    };

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(render);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      resizeObserver.disconnect();
      rendererRef.current = null;
    };
  }, []);

  // Phản hồi khi merge result thay đổi
  useEffect(() => {
    const result = game.lastMergeResult;
    if (!result) return undefined;

    if (result.success) {
      // Combo đã được tính trong useGameState.attemptMerge()
      const comboLevel = result.combo || 1;

      // Phát âm thanh hợp âm ngũ cung theo cấp combo
      playMergeSound(true, soundEnabled, comboLevel);

      // Kích hoạt flash & ripple trên canvas
      if (result.x !== undefined && result.y !== undefined) {
        rendererRef.current?.triggerMergeSuccess(result.x, result.y);
      }

      // Defer UI state installation so this effect does not synchronously
      // update React state during the commit phase.
      const animationInstallTimer = setTimeout(() => {
        setMergeAnim(result);
      }, 0);
      const animationClearTimer = setTimeout(() => {
        setMergeAnim(current => (
          current?.timestamp === result.timestamp ? null : current
        ));
      }, 2200);
      let cinematicInstallTimer = null;
      let pronunciationTimer = null;

      // Mở màn hình mừng chữ mới phong cách điện ảnh nếu là từ vựng mới
      if (result.isNew) {
        cinematicInstallTimer = setTimeout(() => {
          setCinematicUnlock(result);
        }, 0);
        // Tự động phát âm chữ mới mở khóa
        if (soundEnabled) {
          pronunciationTimer = setTimeout(() => speak(result.char), 400);
        }
      }

      return () => {
        clearTimeout(animationInstallTimer);
        clearTimeout(animationClearTimer);
        if (cinematicInstallTimer) clearTimeout(cinematicInstallTimer);
        if (pronunciationTimer) clearTimeout(pronunciationTimer);
      };
    }

    // Merge fail
    playMergeSound(false, soundEnabled);
    if (result.fishIds) {
      rendererRef.current?.triggerMergeFail(result.fishIds, gameRef.current.fish);
    }
    return undefined;
  }, [game.lastMergeResult, soundEnabled]);

  // Pointer event handlers cho drag-drop mượt mà trên mobile
  const handlePointerDown = useCallback((e) => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Tạo sóng nước tương tác khi chạm
    renderer.addWaterRipple(px, py);

    const hit = renderer.hitTest(gameRef.current.fish, px, py);
    if (!hit) {
      gameRef.current.clearSelection();
      return;
    }

    e.preventDefault();
    playBubbleSound(soundEnabled);

    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    dragRef.current = {
      active: true,
      fishId: hit.id,
      startX: px,
      startY: py,
      targetId: null,
    };

    // Mutate trực tiếp (không trigger React re-render)
    hit.isDragging = true;
    hit._dragStartTime = Date.now();
  }, [soundEnabled]);

  const handlePointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    e.preventDefault();
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const norm = renderer.toNormalized(px, py);

    // Mutate trực tiếp vị trí cá đang kéo (không trigger React re-render)
    // Renderer sẽ đọc vị trí mới ở frame tiếp theo
    const currentGame = gameRef.current;
    const fish = currentGame.fish.find(f => f.id === drag.fishId);
    if (fish) {
      fish.x = norm.x;
      fish.y = norm.y;
    }

    // Hit test tìm drop target (exclude cá đang kéo, không tạo mảng mới)
    const target = renderer.hitTest(currentGame.fish, px, py, drag.fishId);
    drag.targetId = target?.id || null;
  }, []);

  const handlePointerUp = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    e.preventDefault();
    try {
      e.target.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    drag.active = false;

    // Kiểm tra xem có phải là tap (click) hay drag
    const canvas = canvasRef.current;
    let isTap = false;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - drag.startX;
      const dy = py - drag.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      isTap = dist < 10; // Nếu di chuyển < 10px thì coi là tap
    }

    // Bỏ cờ isDragging (mutate trực tiếp)
    const currentGame = gameRef.current;
    const draggedFish = currentGame.fish.find(f => f.id === drag.fishId);
    if (draggedFish) {
      draggedFish.isDragging = false;
      draggedFish._dragStartTime = null;
    }

    // Nếu là tap (click), toggle select cá
    if (isTap && !drag.targetId) {
      currentGame.toggleSelect(drag.fishId);
      drag.targetId = null;
      return;
    }

    // Thả lên cá khác -> kích hoạt merge trực tiếp (không qua selectedIds)
    if (drag.targetId && drag.targetId !== drag.fishId) {
      currentGame.mergeTwoFish(drag.fishId, drag.targetId);
    }

    drag.targetId = null;
  }, []);

  // Pointer leave: hủy drag nếu con trỏ rời canvas (tránh stuck state)
  const handlePointerLeave = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const currentGame = gameRef.current;
    const fish = currentGame.fish.find(f => f.id === drag.fishId);
    if (fish) {
      fish.isDragging = false;
      fish._dragStartTime = null;
    }
    drag.active = false;
    drag.targetId = null;

    try {
      e.target.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="merge-game-container" style={{
      display: 'flex',
      flexDirection: 'column',
      // Tính height dựa trên viewport trừ đi topbar + padding shell
      // Topbar ~62px + padding-top 14px + margin-bottom 20px + header game ~50px + padding-bottom 36px
      height: 'calc(100dvh - 180px)',
      minHeight: '400px',
      position: 'relative',
      overflow: 'hidden',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Header bar compact & sleek */}
      <header className="merge-game-header">
        <div className="merge-header-left">
          <span className="merge-game-title">🐟 Ghép Chữ</span>
          <div className="merge-stats-row">
            <span className="merge-stat-item" title="Cấp độ">
              ⭐ Lv.{game.level}
            </span>
            <span className="merge-stat-item" title="Điểm số">
              💎 {game.score.toLocaleString()}
            </span>
            <span className="merge-stat-item" title="Tiến độ">
              📚 {game.progress}%
            </span>
          </div>
          {/* Combo Badge */}
          {game.combo > 1 && (
            <span className="merge-combo-badge" role="status">
              🔥 COMBO x{game.combo}!
            </span>
          )}
        </div>

        <div className="merge-header-actions">
          {/* Hint Button */}
          <button
            type="button"
            onClick={toggleHint}
            className={`merge-btn-icon ${showHint ? 'is-active' : ''}`}
            title="Gợi ý ghép chữ"
            aria-label="Gợi ý ghép chữ"
            disabled={mergeablePairs.length === 0}
          >
            💡
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className="merge-btn-icon"
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            aria-label={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>

          {/* Tutorial Replay Button */}
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="merge-btn-icon"
            title="Hướng dẫn chơi"
            aria-label="Hướng dẫn chơi"
          >
            ❓
          </button>

          {/* Album Button with Badge */}
          <button
            type="button"
            onClick={() => game.openAlbum(!game.showAlbum)}
            className={`merge-btn-album ${game.showAlbum ? 'is-active' : ''}`}
            aria-label="Mở sổ tay chữ Hán"
          >
            📖 Album
            {game.unviewedCount > 0 && (
              <span className="merge-badge-pill" aria-label={`${game.unviewedCount} chữ mới`}>
                {game.unviewedCount}
              </span>
            )}
          </button>

          {/* Pause Button */}
          <button
            type="button"
            onClick={() => setIsPaused(p => !p)}
            className={`merge-btn-icon ${isPaused ? 'is-active' : ''}`}
            title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            aria-label={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          >
            {isPaused ? '▶️' : '⏸️'}
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="merge-btn-icon"
            title="Chơi lại từ đầu"
            aria-label="Chơi lại từ đầu"
          >
            🔄
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Bể cá ghép chữ Hán. ${game.fish.length} con cá đang bơi. Cấp ${game.level}, ${game.unlockedChars.size} chữ đã mở khóa.`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />

        {/* Merge Success Animation Overlay */}
        {mergeAnim && mergeAnim.success && !cinematicUnlock && (
          <div className="merge-success-overlay">
            <div className="merge-success-char">
              {mergeAnim.char}
            </div>
            <div className="merge-success-info">
              <span className="merge-pinyin">{mergeAnim.recipe?.pinyin}</span>
              <span className="merge-meaning">{mergeAnim.recipe?.meaning_vi}</span>
            </div>
          </div>
        )}

        {/* Hint Overlay — highlight mergeable pairs */}
        {showHint && mergeablePairs.length > 0 && (
          <div className="merge-hint-overlay" aria-live="polite">
            <div className="merge-hint-toast">
              💡 Có <strong>{mergeablePairs.length}</strong> cặp có thể ghép!
            </div>
            {/* Render lines connecting mergeable fish pairs on top of canvas */}
            <svg className="merge-hint-lines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {mergeablePairs.slice(0, 5).map((pair, i) => {
                const x1 = pair.fish1.x * 100;
                const y1 = pair.fish1.y * 100;
                const x2 = pair.fish2.x * 100;
                const y2 = pair.fish2.y * 100;
                return (
                  <line
                    key={`hint-${i}`}
                    x1={`${x1}%`} y1={`${y1}%`}
                    x2={`${x2}%`} y2={`${y2}%`}
                    stroke="#FBBF24"
                    strokeWidth="3"
                    strokeDasharray="8 4"
                    opacity="0.8"
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Score Popup Animation */}
        {game.lastMergeResult?.success && (
          <div
            key={game.lastMergeResult.timestamp}
            className="merge-score-popup"
            style={{
              left: `${(game.lastMergeResult.x ?? 0.5) * 100}%`,
              top: `${(game.lastMergeResult.y ?? 0.5) * 100}%`,
            }}
          >
            +{game.lastMergeResult.score}
            {game.lastMergeResult.combo > 1 && ` ×${game.lastMergeResult.combo}`}
          </div>
        )}

        {/* Merge Fail Shake Indicator */}
        {game.lastMergeResult && !game.lastMergeResult.success && (
          <div className="merge-fail-indicator">
            ❌ Không ghép được — thử bộ thủ khác!
          </div>
        )}

        {/* Floating Action Controls khi có cá được chọn */}
        {game.selectedIds.size > 0 && (
          <div className="merge-selection-bar">
            <button
              type="button"
              onClick={game.attemptMerge}
              className="merge-btn-merge"
            >
              ✨ Ghép ({game.selectedIds.size})
            </button>
            <button
              type="button"
              onClick={game.clearSelection}
              className="merge-btn-clear"
              aria-label="Bỏ chọn"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Màn hình mừng mở khóa chữ mới phong cách điện ảnh (Cinematic Unlock Modal) */}
      {cinematicUnlock && (
        <div className="cinematic-unlock-backdrop" onClick={() => setCinematicUnlock(null)}>
          <div className="cinematic-unlock-card" onClick={e => e.stopPropagation()}>
            <div className="cinematic-glow-burst" />
            <div className="cinematic-header">
              <span className="cinematic-badge">✨ PHÁT HIỆN HÁN TỰ MỚI ✨</span>
              <h2 className="cinematic-title">Chúc mừng bạn đã mở khóa!</h2>
            </div>

            <div className="cinematic-char-stage">
              <span className="cinematic-char">{cinematicUnlock.char}</span>
            </div>

            <div className="cinematic-info-group">
              <div className="cinematic-pinyin-row">
                <span className="cinematic-pinyin">{cinematicUnlock.recipe?.pinyin}</span>
                <button
                  type="button"
                  onClick={() => speak(cinematicUnlock.char)}
                  className="cinematic-speak-btn"
                  title="Nghe phát âm chuẩn Bắc Kinh"
                >
                  🔊 Nghe
                </button>
              </div>
              <div className="cinematic-meaning">{cinematicUnlock.recipe?.meaning_vi}</div>
            </div>

            <div className="cinematic-actions">
              <button
                type="button"
                className="cinematic-practice-btn"
                onClick={() => {
                  game.openAlbum(true);
                  setCinematicUnlock(null);
                }}
              >
                ✍️ Tập viết trong Album
              </button>
              <button
                type="button"
                className="cinematic-close-btn"
                onClick={() => setCinematicUnlock(null)}
                autoFocus
              >
                Tiếp tục khám phá 🎮
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tutorial Overlay */}
      {showTutorial && (
        <div className="merge-tutorial-backdrop" onClick={closeTutorial}>
          <div className="merge-tutorial-card" onClick={e => e.stopPropagation()}>
            <div className="tutorial-header">
              <h3>🐟 Cách Chơi Ghép Chữ</h3>
              <p>Khám phá Hán tự bằng cách kết hợp các bộ thủ</p>
            </div>

            <div className="tutorial-steps">
              <div className="tutorial-step">
                <div className="step-icon">1️⃣</div>
                <div className="step-body">
                  <strong>Kéo cá vào nhau</strong>
                  <p>Chạm và kéo một chú cá bơi thả đè lên chú cá khác trong bể.</p>
                </div>
              </div>

              <div className="tutorial-step">
                <div className="step-icon">2️⃣</div>
                <div className="step-body">
                  <strong>Ghép đúng bộ thủ</strong>
                  <p>Kết hợp các bộ thủ để tạo ra chữ Hán hoàn chỉnh (vd: 女 + 子 = 好).</p>
                </div>
              </div>

              <div className="tutorial-step">
                <div className="step-icon">3️⃣</div>
                <div className="step-body">
                  <strong>Mở Album xem kết quả</strong>
                  <p>Xem thứ tự từng nét viết (stroke animation), bính âm và nghĩa từ vừa học.</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="tutorial-start-btn"
              onClick={closeTutorial}
              autoFocus
            >
              🚀 Bắt đầu chơi ngay
            </button>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="merge-reset-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="merge-reset-card" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="reset-title">
            <h3 id="reset-title">🔄 Chơi lại từ đầu?</h3>
            <p>Toàn bộ tiến trình, điểm số và bộ sưu tập sẽ bị xóa. Hành động này không thể hoàn tác.</p>
            <div className="merge-reset-actions">
              <button
                type="button"
                className="merge-reset-cancel"
                onClick={() => setShowResetConfirm(false)}
                autoFocus
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="merge-reset-confirm"
                onClick={() => {
                  game.resetGame();
                  setShowResetConfirm(false);
                  setCinematicUnlock(null);
                }}
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Album Panel */}
      {game.showAlbum && (
        <Suspense fallback={
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10,22,40,0.95)',
            color: '#aaa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}>
            Đang tải album chữ Hán...
          </div>
        }>
          <AlbumErrorBoundary>
            <HanziWriterAlbum
              unlockedChars={game.unlockedChars}
              onClose={() => game.openAlbum(false)}
            />
          </AlbumErrorBoundary>
        </Suspense>
      )}

      {/* Scoped CSS styling */}
      <style>{`
        .merge-game-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 18px;
          background: rgba(6, 16, 30, 0.96);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          color: #fff;
          font-size: 14px;
          z-index: 10;
        }

        .merge-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .merge-game-title {
          font-weight: 700;
          letter-spacing: -0.2px;
          white-space: nowrap;
          font-size: 15px;
        }

        .merge-game-progress {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          white-space: nowrap;
        }

        .merge-combo-badge {
          background: linear-gradient(135deg, #F59E0B, #EF4444);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 12px;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
          animation: badgePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .merge-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .merge-btn-icon {
          min-width: 44px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 17px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .merge-btn-icon:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .merge-btn-album {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          padding: 0 15px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
        }

        .merge-btn-album.is-active {
          background: #3A80D2;
          border-color: #6BA8ED;
        }

        .merge-badge-pill {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #EF4444;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 10px;
          border: 1.5px solid #06101e;
          animation: badgePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .merge-success-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          pointer-events: none;
          animation: mergePopIn 0.5s ease-out;
          z-index: 20;
        }

        .merge-success-char {
          font-size: 80px;
          font-weight: bold;
          color: #FFD700;
          text-shadow: 0 0 28px rgba(255, 215, 0, 0.8);
          font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
          line-height: 1;
        }

        .merge-success-info {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .merge-pinyin {
          font-size: 20px;
          color: #6BA8ED;
          font-weight: 700;
        }

        .merge-meaning {
          font-size: 16px;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        }

        .merge-fail-indicator {
          position: absolute;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(30, 10, 10, 0.88);
          border: 1px solid rgba(255, 80, 80, 0.5);
          border-radius: 20px;
          padding: 6px 18px;
          color: #FF8080;
          font-size: 13px;
          font-weight: 600;
          pointer-events: none;
          animation: fadeShake 0.8s ease-out forwards;
          white-space: nowrap;
          z-index: 15;
        }

        .merge-selection-bar {
          position: absolute;
          bottom: 20px;
          right: 20px;
          display: flex;
          gap: 8px;
          z-index: 15;
        }

        .merge-btn-merge {
          min-height: 44px;
          padding: 0 22px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #3A80D2, #2563EB);
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45);
          transition: transform 0.15s ease;
        }

        .merge-btn-merge:active {
          transform: scale(0.96);
        }

        .merge-btn-clear {
          min-height: 44px;
          min-width: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.5);
          color: #fff;
          font-size: 16px;
          cursor: pointer;
        }

        /* Stats Row in Header */
        .merge-stats-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
        }

        .merge-stat-item {
          color: rgba(255, 255, 255, 0.85);
          white-space: nowrap;
          font-weight: 600;
        }

        .merge-btn-icon.is-active {
          background: rgba(251, 191, 36, 0.25);
          border-color: #FBBF24;
          box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
        }

        .merge-btn-icon:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Reset Confirmation Dialog */
        .merge-reset-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          animation: mergeFadeIn 0.2s ease-out;
        }

        .merge-reset-card {
          background: linear-gradient(135deg, #1a2744 0%, #0f1b2d 100%);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 16px;
          padding: 28px 32px;
          max-width: 340px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(239, 68, 68, 0.15);
        }

        .merge-reset-card h3 {
          margin: 0 0 12px;
          font-size: 20px;
          color: #fff;
        }

        .merge-reset-card p {
          margin: 0 0 24px;
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.5;
        }

        .merge-reset-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .merge-reset-cancel {
          padding: 10px 24px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .merge-reset-cancel:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .merge-reset-confirm {
          padding: 10px 24px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .merge-reset-confirm:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
        }

        @keyframes mergeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Hint Overlay */
        .merge-hint-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 12;
        }

        .merge-hint-toast {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(251, 191, 36, 0.92);
          color: #1a1a1a;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
          animation: hintSlideIn 0.3s ease-out;
          white-space: nowrap;
        }

        .merge-hint-lines {
          width: 100%;
          height: 100%;
          overflow: visible;
          filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.6));
        }

        .merge-hint-lines line {
          animation: hintPulse 1.5s ease-in-out infinite;
        }

        @keyframes hintPulse {
          0%, 100% { opacity: 0.5; stroke-dashoffset: 0; }
          50% { opacity: 1; stroke-dashoffset: 12; }
        }

        /* Score Popup */
        .merge-score-popup {
          position: absolute;
          transform: translate(-50%, -50%);
          color: #FFD700;
          font-size: 22px;
          font-weight: 800;
          text-shadow: 0 0 12px rgba(255, 215, 0, 0.8), 0 2px 4px rgba(0,0,0,0.6);
          pointer-events: none;
          z-index: 18;
          animation: scoreFloatUp 1.2s ease-out forwards;
          white-space: nowrap;
        }

        @keyframes hintSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @keyframes scoreFloatUp {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          30%  { opacity: 1; transform: translate(-50%, -80%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -150%) scale(1); }
        }

        /* Cinematic Unlock Modal */
        .cinematic-unlock-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(4, 10, 22, 0.88);
          backdrop-filter: blur(12px);
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.3s ease-out;
        }

        .cinematic-unlock-card {
          position: relative;
          background: linear-gradient(180deg, #132742 0%, #0c1b30 100%);
          border: 1.5px solid rgba(255, 215, 0, 0.4);
          border-radius: 22px;
          max-width: 380px;
          width: 100%;
          padding: 28px 22px;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 215, 0, 0.2);
          animation: modalScaleUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }

        .cinematic-badge {
          font-size: 11px;
          font-weight: 800;
          color: #FFD700;
          letter-spacing: 1.5px;
          display: inline-block;
          margin-bottom: 6px;
        }

        .cinematic-title {
          margin: 0 0 16px;
          font-size: 18px;
          color: #FFFFFF;
          font-weight: 700;
        }

        .cinematic-char-stage {
          margin: 12px auto 16px;
          width: 110px;
          height: 110px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1.5px solid rgba(255, 215, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(255, 215, 0, 0.25);
        }

        .cinematic-char {
          font-size: 68px;
          font-weight: bold;
          color: #FFD700;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
          font-family: "Noto Sans SC", sans-serif;
          line-height: 1;
        }

        .cinematic-info-group {
          margin-bottom: 22px;
        }

        .cinematic-pinyin-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 6px;
        }

        .cinematic-pinyin {
          font-size: 20px;
          color: #6BA8ED;
          font-weight: 700;
        }

        .cinematic-speak-btn {
          padding: 4px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .cinematic-meaning {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.95);
          font-weight: 500;
        }

        .cinematic-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .cinematic-practice-btn {
          width: 100%;
          min-height: 46px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #3A80D2, #2563EB);
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
        }

        .cinematic-close-btn {
          width: 100%;
          min-height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: rgba(255, 255, 255, 0.75);
          font-size: 14px;
          cursor: pointer;
        }

        /* Tutorial Modal */
        .merge-tutorial-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(4, 10, 20, 0.85);
          backdrop-filter: blur(8px);
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.25s ease-out;
        }

        .merge-tutorial-card {
          background: linear-gradient(180deg, #10233b 0%, #0a1728 100%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 18px;
          max-width: 360px;
          width: 100%;
          padding: 24px 20px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
        }

        .tutorial-header h3 {
          margin: 0;
          font-size: 19px;
          color: #FFD700;
        }

        .tutorial-header p {
          margin: 6px 0 18px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }

        .tutorial-steps {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 22px;
        }

        .tutorial-step {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .step-icon {
          font-size: 20px;
          line-height: 1.2;
        }

        .step-body strong {
          display: block;
          font-size: 14px;
          color: #fff;
          margin-bottom: 2px;
        }

        .step-body p {
          margin: 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.4;
        }

        .tutorial-start-btn {
          width: 100%;
          min-height: 46px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #3A80D2, #2563EB);
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
        }

        /* Tablet adjustments */
        @media (min-width: 600px) {
          .merge-game-header {
            padding: 12px 20px;
          }
          .merge-game-title {
            font-size: 18px;
          }
          .merge-btn-album {
            padding: 0 18px;
            font-size: 14px;
          }
          .merge-btn-icon {
            min-width: 44px;
            min-height: 44px;
            font-size: 18px;
          }
          .merge-reset-card {
            max-width: 400px;
            padding: 32px 40px;
          }
        }

        /* Desktop adjustments */
        @media (min-width: 1024px) {
          .merge-game-header {
            padding: 14px 28px;
          }
          .merge-game-title {
            font-size: 20px;
          }
          .merge-btn-album {
            padding: 0 22px;
            font-size: 15px;
          }
          .merge-btn-icon {
            min-width: 48px;
            min-height: 48px;
            font-size: 20px;
          }
        }

        /* Mobile adjustments */
        @media (max-width: 400px) {
          .merge-game-header {
            padding: 6px 10px;
            font-size: 13px;
          }
          .merge-game-title {
            font-size: 13px;
          }
          .merge-game-progress {
            font-size: 11px;
          }
          .merge-btn-album {
            padding: 0 10px;
            font-size: 12px;
          }
          .merge-btn-icon {
            min-width: 38px;
            min-height: 38px;
            font-size: 15px;
          }
        }

        /* Keyframes */
        @keyframes badgePop {
          0% { transform: scale(0); }
          80% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes modalScaleUp {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes mergePopIn {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          40% { transform: translate(-50%, -50%) scale(1.18); opacity: 1; }
          60% { transform: translate(-50%, -50%) scale(0.95); }
          80% { transform: translate(-50%, -50%) scale(1.03); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes fadeShake {
          0% { opacity: 1; transform: translateX(-50%) translateX(-6px); }
          25% { transform: translateX(-50%) translateX(6px); }
          50% { transform: translateX(-50%) translateX(-4px); }
          75% { transform: translateX(-50%) translateX(4px); }
          100% { opacity: 0; transform: translateX(-50%) translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .cinematic-unlock-card, .merge-tutorial-card, .merge-combo-badge {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}