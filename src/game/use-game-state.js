// ============================================================
// useGameState — Custom hook quản lý state game merge cá
// Persistence: localStorage, sync state giữa canvas và UI
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createFish, tryMerge, pickSpawnRadical, resetFishIdCounter, calcProgress, calcLevel, findMergeablePairs, findMergeTarget } from './merge-engine.js';
import { BASE_RECIPES } from './merge-data.js';
import { getFishSpecies } from './fish-renderer.js';

const STORAGE_KEY = 'merge-game-state';
const MAX_FISH = 30; // Tăng giới hạn để có nhiều cơ hội merge hơn
const SPAWN_INTERVAL_MS = 5000; // Cá mới mỗi 5 giây (nhanh hơn để giữ nhịp chơi)

/** Bộ thủ khởi tạo cho người chơi mới — chọn các bộ có thể ghép được ngay */
const STARTER_RADICALS = [
  // Cặp merge được ngay: 女+子→好, 日+月→明, 亻+尔→你, 木+目+心→想
  '女', '子', '日', '月', '亻', '尔', '木', '目', '心',
  // Các bộ phổ biến dễ kết hợp
  '口', '门', '土', '山', '水', '火', '人', '大', '小', '白',
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);

    // Kiểm tra nếu cá bị kẹt ở góc (vị trí cũ) - reset game
    if (saved.fish && saved.fish.length > 0) {
      const cornerFish = saved.fish.filter(f =>
        (f.x < 0.15 || f.x > 0.85) && (f.y < 0.15 || f.y > 0.85)
      );
      // Nếu hơn 50% cá ở góc, reset game
      if (cornerFish.length > saved.fish.length * 0.5) {
        console.log('Phát hiện cá kẹt ở góc, reset game...');
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }

    return saved;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full hoặc không khả dụng — bỏ qua im lặng
  }
}

function initState() {
  const saved = loadState();
  if (saved && saved.fish && saved.unlockedChars) {
    // Restore từ localStorage
    const maxId = saved.fish.reduce((max, f) => {
      const num = parseInt(f.id.replace('fish_', ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    resetFishIdCounter(maxId + 1);

    return {
      fish: saved.fish.map(f => {
        const restored = { ...f, isDragging: false, isMerging: false };
        // Backfill species cache cho save cũ
        if (!restored.species) {
          restored.species = getFishSpecies(restored);
        }
        return restored;
      }),
      unlockedChars: new Set(saved.unlockedChars || []),
      mergeCount: saved.mergeCount || 0,
      score: saved.score || 0,
      totalXp: saved.totalXp || 0,
    };
  }

  // Game mới: tạo cá starter phân bố đều trong bể
  resetFishIdCounter(1);
  const fish = STARTER_RADICALS.map((rad, i) => {
    // Phân bố cá theo grid 5x4 ở giữa bể, tránh 4 góc
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 0.15 + col * 0.175;  // 0.15, 0.325, 0.5, 0.675, 0.85
    const y = 0.2 + row * 0.2;    // 0.2, 0.4, 0.6, 0.8
    return createFish(rad, {
      x,
      y,
      vx: (Math.random() - 0.5) * 0.005,  // Vận tốc chậm hơn
      vy: (Math.random() - 0.5) * 0.005,
    });
  });

  return {
    fish,
    unlockedChars: new Set(),
    mergeCount: 0,
    score: 0,
    totalXp: 0,
  };
}

export function useGameState() {
  const [state, setState] = useState(initState);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastMergeResult, setLastMergeResult] = useState(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const spawnTimerRef = useRef(null);
  const lastMergeTimeRef = useRef(0);
  const comboRef = useRef(0);

  // Combo state (sync với MergeGame)
  const [combo, setCombo] = useState(0);

  // Reset combo sau 7 giây
  useEffect(() => {
    if (combo > 0) {
      const timer = setTimeout(() => {
        setCombo(0);
        comboRef.current = 0;
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [combo]);

  // Persist state mỗi khi thay đổi quan trọng (merge, spawn, unlock)
  // Position được sync riêng định kỳ để tránh trigger React mỗi frame
  useEffect(() => {
    const timer = setTimeout(() => {
      saveState({
        fish: state.fish.map(f => ({
          id: f.id,
          radical: f.radical,
          name_vi: f.name_vi,
          tier: f.tier,
          x: f.x,
          y: f.y,
          vx: f.vx,
          vy: f.vy,
          isResult: f.isResult,
          resultChar: f.resultChar,
          canMergeAgain: f.canMergeAgain,
          createdAt: f.createdAt,
        })),
        unlockedChars: [...state.unlockedChars],
        mergeCount: state.mergeCount,
        score: state.score,
        totalXp: state.totalXp,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [state.fish, state.unlockedChars, state.mergeCount, state.score, state.totalXp]);

  // Sync position định kỳ (mỗi 10s) để localStorage không quá cũ
  // Dùng ref để đọc fish objects mutable mà không trigger re-render
  const fishRef = useRef(state.fish);

  useEffect(() => {
    fishRef.current = state.fish;
  }, [state.fish]);

  useEffect(() => {
    const syncInterval = setInterval(() => {
      try {
        const currentFish = fishRef.current;
        if (!currentFish || currentFish.length === 0) return;
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (saved.fish && saved.fish.length === currentFish.length) {
          // Chỉ update position, giữ nguyên các field khác. Match by ID để tránh
          // sai lệch khi thứ tự cá thay đổi (spawn/merge giữa 2 lần sync).
          const savedById = Object.fromEntries(saved.fish.map(sf => [sf.id, sf]));
          currentFish.forEach(cf => {
            const sf = savedById[cf.id];
            if (sf) {
              sf.x = cf.x;
              sf.y = cf.y;
              sf.vx = cf.vx;
              sf.vy = cf.vy;
            }
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        }
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(syncInterval);
  }, []);

  // Auto-spawn cá mới định kỳ
  useEffect(() => {
    spawnTimerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.fish.length >= MAX_FISH) return prev;

        const availableRadicals = prev.fish.map(f => f.radical);
        const radical = pickSpawnRadical(
          prev.unlockedChars,
          availableRadicals,
          BASE_RECIPES
        );

        const newFish = createFish(radical, {
          x: Math.random() * 0.6 + 0.2,  // Spawn ở giữa (0.2-0.8)
          y: -0.05, // Spawn từ trên
          vx: (Math.random() - 0.5) * 0.003,  // Vận tốc chậm
          vy: Math.random() * 0.002 + 0.001,  // Rơi xuống nhẹ nhàng
        });

        return { ...prev, fish: [...prev.fish, newFish] };
      });
    }, SPAWN_INTERVAL_MS);

    return () => clearInterval(spawnTimerRef.current);
  }, []);

  /** Toggle chọn cá */
  const toggleSelect = useCallback((fishId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(fishId)) {
        next.delete(fishId);
      } else {
        next.add(fishId);
      }
      return next;
    });
  }, []);

  const [unviewedCount, setUnviewedCount] = useState(() => {
    try {
      const saved = localStorage.getItem('merge-unviewed-count');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  /** Mở/đóng album và xóa badge chữ mới chưa xem */
  const openAlbum = useCallback((open = true) => {
    setShowAlbum(open);
    if (open) {
      setUnviewedCount(0);
      try {
        localStorage.setItem('merge-unviewed-count', '0');
      } catch {
        // ignore
      }
    }
  }, []);

  /** Clear selection */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Shared merge reducer logic (pure function, không phụ thuộc closure) ──
  function applyMergeResult(prev, fishToMerge) {
    const result = tryMerge(fishToMerge);

    if (!result.success) {
      setLastMergeResult({
        success: false,
        fishIds: fishToMerge.map(f => f.id),
        timestamp: Date.now(),
      });
      return prev;
    }

    const consumedSet = new Set(result.consumedIds);
    const remainingFish = prev.fish.filter(f => !consumedSet.has(f.id));

    const avgX = fishToMerge.reduce((s, f) => s + f.x, 0) / fishToMerge.length;
    const avgY = fishToMerge.reduce((s, f) => s + f.y, 0) / fishToMerge.length;

    const isNew = !prev.unlockedChars.has(result.result);

    const canMergeAgain = Object.values(BASE_RECIPES).some(recipe =>
      recipe.components.includes(result.result)
    );

    const resultFish = createFish(result.result, {
      x: avgX,
      y: avgY,
      isResult: true,
      resultChar: result.result,
      canMergeAgain,
    });

    const newUnlocked = new Set(prev.unlockedChars);
    newUnlocked.add(result.result);

    const now = Date.now();
    const timeSinceLastMerge = now - lastMergeTimeRef.current;
    const newCombo = timeSinceLastMerge < 7000 ? comboRef.current + 1 : 1;
    comboRef.current = newCombo;
    lastMergeTimeRef.current = now;
    setCombo(newCombo);

    const comboMultiplier = Math.min(newCombo, 5);
    const finalScore = (result.score || 100) * comboMultiplier;

    if (isNew) {
      setUnviewedCount(c => {
        const next = c + 1;
        try { localStorage.setItem('merge-unviewed-count', String(next)); } catch { /* ignore */ }
        return next;
      });
    }

    setLastMergeResult({
      success: true,
      char: result.result,
      recipe: result.recipe,
      isNew,
      x: avgX,
      y: avgY,
      score: finalScore,
      combo: comboMultiplier,
      timestamp: Date.now(),
    });

    return {
      fish: [...remainingFish, resultFish],
      unlockedChars: newUnlocked,
      mergeCount: prev.mergeCount + 1,
      score: prev.score + finalScore,
      totalXp: prev.totalXp + finalScore,
    };
  }

  /** Thử merge các cá đang được chọn */
  const attemptMerge = useCallback(() => {
    setState(prev => {
      const selected = prev.fish.filter(f => selectedIds.has(f.id));
      return applyMergeResult(prev, selected);
    });
    setSelectedIds(new Set());
  }, [selectedIds]);

  /** Merge trực tiếp 2 cá theo ID (dùng cho drag-drop, tránh race condition với selectedIds) */
  const mergeTwoFish = useCallback((fishId1, fishId2) => {
    setState(prev => {
      const f1 = prev.fish.find(f => f.id === fishId1);
      const f2 = prev.fish.find(f => f.id === fishId2);
      if (!f1 || !f2) return prev;
      return applyMergeResult(prev, [f1, f2]);
    });
    setSelectedIds(new Set());
  }, []);

  /** Lấy danh sách cặp cá có thể merge (hint system) */
  const getMergeablePairs = useCallback(() => {
    return findMergeablePairs(state.fish);
  }, [state.fish]);

  /** Tìm cá có thể merge với cá đang kéo */
  const getMergeTarget = useCallback((draggedFish) => {
    if (!draggedFish) return null;
    return findMergeTarget(draggedFish, state.fish);
  }, [state.fish]);

  /** Reset toàn bộ game */
  const resetGame = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    resetFishIdCounter(1);
    setState(initState());
    setSelectedIds(new Set());
    setLastMergeResult(null);
    setCombo(0);
    comboRef.current = 0;
    lastMergeTimeRef.current = 0;
  }, []);

  const progress = calcProgress(state.unlockedChars, 162); // 162 single-char HSK1 target
  const level = calcLevel(state.unlockedChars);

  return {
    fish: state.fish,
    unlockedChars: state.unlockedChars,
    mergeCount: state.mergeCount,
    score: state.score,
    totalXp: state.totalXp,
    level,
    combo,
    progress,
    selectedIds,
    lastMergeResult,
    showAlbum,
    setShowAlbum,
    openAlbum,
    unviewedCount,
    toggleSelect,
    clearSelection,
    attemptMerge,
    mergeTwoFish,
    resetGame,
    getMergeablePairs,
    getMergeTarget,
  };
}
