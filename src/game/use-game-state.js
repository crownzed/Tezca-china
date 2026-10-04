// ============================================================
// useGameState — Custom hook quản lý state game merge cá
// Persistence: localStorage, sync state giữa canvas và UI
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createFish, tryMerge, pickSpawnRadical, resetFishIdCounter, calcProgress, calcLevel, findMergeablePairs, findMergeTarget } from './merge-engine.js';
import { BASE_RECIPES } from './merge-data.js';
import { getFishSpecies } from './fish-renderer.js';

const STORAGE_KEY = 'merge-game-state';
const MAX_FISH = 30;
const SPAWN_INTERVAL_MS = 5000;
const COMBO_WINDOW_MS = 7000;

/** Bộ thủ khởi tạo có cả công thức hai cá và ba cá: 木 + 目 + 心 → 想. */
const STARTER_RADICALS = [
  '女', '子', '日', '月', '亻', '尔', '木', '目', '心',
  '口', '门', '土', '山', '水', '火', '人', '大', '小', '白',
];

function starterPosition(index, count) {
  const columns = 5;
  const rows = Math.ceil(count / columns);
  return {
    x: 0.15 + (index % columns) * 0.175,
    y: 0.2 + (Math.floor(index / columns) / Math.max(1, rows - 1)) * 0.6,
  };
}

function newGameState() {
  resetFishIdCounter(1);
  return {
    fish: STARTER_RADICALS.map((radical, index) => createFish(radical, {
      ...starterPosition(index, STARTER_RADICALS.length),
      vx: (Math.random() - 0.5) * 0.005,
      vy: (Math.random() - 0.5) * 0.005,
    })),
    unlockedChars: new Set(),
    mergeCount: 0,
    score: 0,
    totalXp: 0,
  };
}

function initState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.fish)) {
      const maxId = saved.fish.reduce((max, fish) => {
        const num = Number(String(fish.id).replace('fish_', ''));
        return Number.isFinite(num) ? Math.max(max, num) : max;
      }, 0);
      resetFishIdCounter(maxId + 1);
      const isCorner = fish => (fish.x < 0.15 || fish.x > 0.85) && (fish.y < 0.15 || fish.y > 0.85);
      const repairCorners = saved.fish.filter(isCorner).length > saved.fish.length * 0.5;

      return {
        fish: saved.fish.map((fish, index) => {
          const restored = { ...fish, isDragging: false, isMerging: false, _dragStartTime: null };
          // Save cũ bị kẹt góc: chỉ sửa vị trí, không xóa điểm/XP/bộ sưu tập.
          if ((repairCorners && isCorner(fish)) || !Number.isFinite(fish.x) || !Number.isFinite(fish.y)) {
            Object.assign(restored, starterPosition(index, saved.fish.length));
          }
          restored.species = getFishSpecies(restored);
          return restored;
        }),
        unlockedChars: new Set(saved.unlockedChars),
        mergeCount: saved.mergeCount || 0,
        score: saved.score || 0,
        totalXp: saved.totalXp || 0,
      };
    }
  } catch {
    // localStorage không khả dụng hoặc save hỏng: vẫn chơi được trong phiên này.
  }
  return newGameState();
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fish: state.fish.map(fish => ({
        id: fish.id,
        radical: fish.radical,
        name_vi: fish.name_vi,
        tier: fish.tier,
        species: fish.species,
        x: fish.x,
        y: fish.y,
        vx: fish.vx,
        vy: fish.vy,
        isResult: fish.isResult,
        resultChar: fish.resultChar,
        canMergeAgain: fish.canMergeAgain,
        createdAt: fish.createdAt,
      })),
      unlockedChars: [...state.unlockedChars],
      mergeCount: state.mergeCount,
      score: state.score,
      totalXp: state.totalXp,
    }));
  } catch {
    // localStorage đầy/bị chặn không được làm gián đoạn gameplay.
  }
}

export function useGameState({ paused = false } = {}) {
  const [state, setState] = useState(initState);
  const stateRef = useRef(state);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastMergeResult, setLastMergeResult] = useState(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const lastMergeTimeRef = useRef(0);
  const comboRef = useRef(0);
  const [combo, setCombo] = useState(0);
  const [unviewedCount, setUnviewedCount] = useState(() => {
    try {
      return Math.max(0, parseInt(localStorage.getItem('merge-unviewed-count'), 10) || 0);
    } catch {
      return 0;
    }
  });

  // Event/timer là nơi duy nhất commit gameplay. Không đặt cấp ID, tính combo,
  // ghi storage hoặc setState khác trong updater mà StrictMode có thể chạy lại.
  const commitState = useCallback(next => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!combo) return;
    const timer = setTimeout(() => {
      setCombo(0);
      comboRef.current = 0;
    }, Math.max(0, COMBO_WINDOW_MS - (Date.now() - lastMergeTimeRef.current)));
    return () => clearTimeout(timer);
  }, [combo]);

  useEffect(() => {
    const timer = setTimeout(() => saveState(stateRef.current), 500);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const persist = () => saveState(stateRef.current);
    const interval = setInterval(persist, 10000);
    window.addEventListener('pagehide', persist);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('merge-unviewed-count', String(unviewedCount));
    } catch { /* storage có thể bị chặn */ }
  }, [unviewedCount]);

  useEffect(() => {
    if (paused) return;
    let active = true;
    const timer = setInterval(() => {
      if (!active) return;
      const current = stateRef.current;
      if (current.fish.length >= MAX_FISH) return;
      const radical = pickSpawnRadical(
        current.unlockedChars,
        current.fish.map(fish => fish.resultChar || fish.radical),
        BASE_RECIPES,
      );
      const fish = createFish(radical, {
        x: Math.random() * 0.6 + 0.2,
        y: 0.12,
        vx: (Math.random() - 0.5) * 0.003,
        vy: Math.random() * 0.002 + 0.001,
      });
      commitState({ ...current, fish: [...current.fish, fish] });
    }, SPAWN_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [paused, commitState]);

  const toggleSelect = useCallback(fishId => {
    if (paused || !stateRef.current.fish.some(fish => fish.id === fishId)) return;
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(fishId)) next.delete(fishId);
      else next.add(fishId);
      return next;
    });
  }, [paused]);

  const clearSelection = useCallback(() => {
    if (!paused) setSelectedIds(new Set());
  }, [paused]);

  const openAlbum = useCallback((open = true) => {
    setShowAlbum(open);
    if (open) setUnviewedCount(0);
  }, []);

  const mergeFish = useCallback(ids => {
    if (paused) return null;
    const current = stateRef.current;
    const uniqueIds = new Set(ids);
    const selected = current.fish.filter(fish => uniqueIds.has(fish.id));
    // Bỏ qua event cũ nếu cá đã được tiêu thụ, thay vì tạo thêm một kết quả.
    if (selected.length < 2 || selected.length !== uniqueIds.size) return null;
    const result = tryMerge(selected);
    const now = Date.now();
    setSelectedIds(new Set());

    if (!result.success) {
      const feedback = { success: false, fishIds: selected.map(fish => fish.id), timestamp: now };
      setLastMergeResult(feedback);
      return feedback;
    }

    const x = selected.reduce((sum, fish) => sum + fish.x, 0) / selected.length;
    const y = selected.reduce((sum, fish) => sum + fish.y, 0) / selected.length;
    const isNew = !current.unlockedChars.has(result.result);
    const resultFish = createFish(result.result, {
      x,
      y,
      isResult: true,
      resultChar: result.result,
      canMergeAgain: Object.values(BASE_RECIPES).some(recipe => recipe.components.includes(result.result)),
    });
    const nextCombo = now - lastMergeTimeRef.current < COMBO_WINDOW_MS ? comboRef.current + 1 : 1;
    comboRef.current = nextCombo;
    lastMergeTimeRef.current = now;
    setCombo(nextCombo);
    const multiplier = Math.min(nextCombo, 5);
    const score = (result.score || 100) * multiplier;
    const unlockedChars = new Set(current.unlockedChars);
    unlockedChars.add(result.result);
    const consumed = new Set(result.consumedIds);
    commitState({
      fish: [...current.fish.filter(fish => !consumed.has(fish.id)), resultFish],
      unlockedChars,
      mergeCount: current.mergeCount + 1,
      score: current.score + score,
      totalXp: current.totalXp + score,
    });
    if (isNew) setUnviewedCount(count => count + 1);
    const feedback = {
      success: true, char: result.result, recipe: result.recipe, isNew,
      x, y, score, combo: multiplier, timestamp: now, resultFishId: resultFish.id,
    };
    setLastMergeResult(feedback);
    return feedback;
  }, [paused, commitState]);

  const attemptMerge = useCallback(() => mergeFish(selectedIds), [mergeFish, selectedIds]);
  const mergeTwoFish = useCallback((firstId, secondId) => mergeFish([firstId, secondId]), [mergeFish]);
  const getMergeablePairs = useCallback(() => findMergeablePairs(state.fish), [state.fish]);
  const getMergeTarget = useCallback(fish => fish ? findMergeTarget(fish, state.fish) : null, [state.fish]);

  /** Chỉ gọi sau khi người chơi xác nhận trong hộp thoại reset. */
  const resetGame = useCallback(() => {
    const next = newGameState();
    commitState(next);
    saveState(next);
    setSelectedIds(new Set());
    setLastMergeResult(null);
    setUnviewedCount(0);
    setCombo(0);
    comboRef.current = 0;
    lastMergeTimeRef.current = 0;
  }, [commitState]);

  return {
    fish: state.fish,
    unlockedChars: state.unlockedChars,
    mergeCount: state.mergeCount,
    score: state.score,
    totalXp: state.totalXp,
    level: calcLevel(state.unlockedChars),
    combo,
    progress: calcProgress(state.unlockedChars, 162),
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
