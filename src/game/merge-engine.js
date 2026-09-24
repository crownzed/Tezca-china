// ============================================================
// MERGE ENGINE — Logic cốt lõi của game ghép chữ
// Quản lý: merge validation, spawning, game state machine
// ============================================================

import { findMatchingRecipe, RADICAL_FISH } from './merge-data.js';
import { getFishSpecies } from './fish-renderer.js';

/**
 * Tạo ID duy nhất cho mỗi cá trong bể.
 */
let _nextFishId = 1;
export function generateFishId() {
  return `fish_${_nextFishId++}`;
}

/**
 * Reset ID counter (dùng khi load game state từ localStorage).
 */
export function resetFishIdCounter(startFrom = 1) {
  _nextFishId = startFrom;
}

/**
 * Tạo một con cá mới mang bộ thủ chỉ định.
 * @param {string} radical - Bộ thủ trên cá
 * @param {object} opts - Tùy chọn vị trí, loại
 * @returns {object} Fish object
 */
export function createFish(radical, opts = {}) {
  const meta = RADICAL_FISH[radical] || { name_vi: radical, tier: 1 };
  const fish = {
    id: opts.id || generateFishId(),
    radical,
    name_vi: meta.name_vi,
    tier: meta.tier || 1,
    x: opts.x ?? Math.random() * 0.6 + 0.2,
    y: opts.y ?? Math.random() * 0.6 + 0.2,
    vx: opts.vx ?? (Math.random() - 0.5) * 0.004,
    vy: opts.vy ?? (Math.random() - 0.5) * 0.004,
    scale: 1,
    opacity: 1,
    isDragging: false,
    isMerging: false,
    isResult: opts.isResult || false,
    resultChar: opts.resultChar || null,
    // Chain merge: cá kết quả có thể dùng làm component cho chữ phức tạp hơn
    canMergeAgain: opts.canMergeAgain ?? opts.isResult ?? false,
    createdAt: Date.now(),
    species: null, // Cache loài cá — tính một lần khi tạo
  };
  // Pre-compute species để tránh gọi getFishSpecies() mỗi frame
  fish.species = getFishSpecies(fish);
  return fish;
}

/**
 * Kiểm tra merge giữa các cá được chọn.
 * Hỗ trợ chain merge: cá kết quả có thể dùng radical của nó để ghép tiếp.
 * @param {object[]} selectedFish - Mảng cá người chơi đã chọn/kéo vào nhau
 * @returns {{ success: boolean, result?: string, recipe?: object, consumedIds?: string[], score?: number }}
 */
export function tryMerge(selectedFish) {
  if (!selectedFish || selectedFish.length < 2) {
    return { success: false };
  }

  // Lấy components từ các cá (ưu tiên resultChar nếu là cá kết quả)
  const components = selectedFish.map(f => f.resultChar || f.radical);
  const match = findMatchingRecipe(components);

  if (match.success) {
    // Tính điểm dựa trên độ khó (số components) và tier
    const baseScore = 100;
    const componentBonus = components.length * 50;
    const tierBonus = selectedFish.reduce((sum, f) => sum + (f.tier || 1) * 25, 0);
    const score = baseScore + componentBonus + tierBonus;

    return {
      success: true,
      result: match.result,
      recipe: match.recipe,
      consumedIds: selectedFish.map(f => f.id),
      score,
    };
  }

  return { success: false };
}

/**
 * Tìm tất cả các cặp cá có thể merge với nhau trong bể.
 * Dùng cho hint system và highlight.
 * @param {object[]} fishList - Danh sách cá trong bể
 * @returns {Array<{fish1: object, fish2: object, result: string}>}
 */
export function findMergeablePairs(fishList) {
  const pairs = [];

  for (let i = 0; i < fishList.length; i++) {
    for (let j = i + 1; j < fishList.length; j++) {
      const f1 = fishList[i];
      const f2 = fishList[j];
      const components = [f1.resultChar || f1.radical, f2.resultChar || f2.radical];
      const match = findMatchingRecipe(components);

      if (match.success) {
        pairs.push({
          fish1: f1,
          fish2: f2,
          result: match.result,
          recipe: match.recipe,
        });
      }
    }
  }

  return pairs;
}

/**
 * Tìm cá có thể merge với cá đang được kéo.
 * @param {object} draggedFish - Cá đang được kéo
 * @param {object[]} fishList - Danh sách cá khác trong bể
 * @returns {object|null} Cá target có thể merge, hoặc null
 */
export function findMergeTarget(draggedFish, fishList) {
  const dragComponent = draggedFish.resultChar || draggedFish.radical;

  for (const fish of fishList) {
    if (fish.id === draggedFish.id) continue;
    const fishComponent = fish.resultChar || fish.radical;
    const components = [dragComponent, fishComponent];
    const match = findMatchingRecipe(components);

    if (match.success) {
      return { fish, result: match.result, recipe: match.recipe };
    }
  }

  return null;
}

/**
 * Chọn bộ thủ nào nên spawn tiếp theo dựa trên trạng thái game.
 * Ưu tiên: bộ thủ cần thiết để ghép chữ chưa học > bộ thủ ngẫu nhiên.
 *
 * @param {Set<string>} unlockedChars - Tập hợp chữ đã mở khóa
 * @param {string[]} availableRadicals - Danh sách bộ thủ đang có trong bể
 * @param {object} allRecipes - Tất cả recipes (từ merge-data)
 * @returns {string} Radical nên spawn
 */
export function pickSpawnRadical(unlockedChars, availableRadicals, allRecipes) {
  // Tìm các chữ chưa unlock mà có thể ghép được với bộ thủ hiện có + 1 bộ mới
  const candidates = [];

  for (const [char, recipe] of Object.entries(allRecipes)) {
    if (unlockedChars.has(char)) continue;
    // Xét tất cả recipes, không chỉ HSK1 — mở rộng pool để tránh starvation
    // (trước đây chỉ xét hsk===1 khiến nhiều công thức bị bỏ qua)

    const components = recipe.components;
    const inPool = components.filter(c => availableRadicals.includes(c));
    const missing = components.filter(c => !availableRadicals.includes(c));

    // Nếu chỉ thiếu 1 bộ thủ → spawn bộ đó (ưu tiên cao nhất)
    if (missing.length === 1 && inPool.length === components.length - 1) {
      candidates.push(missing[0]);
    }
  }

  if (candidates.length > 0) {
    // Chọn ngẫu nhiên từ candidates ưu tiên
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback thông minh hơn: chọn bộ thủ tier 1 mà CÓ THỂ tạo cặp merge
  // với ít nhất một bộ thủ đang có trong bể
  const tier1 = Object.entries(RADICAL_FISH)
    .filter(([, meta]) => meta.tier === 1)
    .map(([rad]) => rad);

  // Tìm bộ thủ tier 1 có thể kết hợp với cá hiện có
  const mergeableTier1 = tier1.filter(rad => {
    // Kiểm tra xem rad + bất kỳ cá nào trong bể có tạo thành recipe không
    for (const existingRad of availableRadicals) {
      const match = findMatchingRecipe([rad, existingRad]);
      if (match.success && !unlockedChars.has(match.result)) {
        return true;
      }
    }
    return false;
  });

  if (mergeableTier1.length > 0) {
    return mergeableTier1[Math.floor(Math.random() * mergeableTier1.length)];
  }

  // Ultimate fallback: random tier 1
  if (tier1.length === 0) return '人';
  return tier1[Math.floor(Math.random() * tier1.length)];
}

/**
 * Tính % hoàn thành bộ sưu tập.
 * @param {Set<string>} unlockedChars
 * @param {number} totalTarget - Tổng số chữ mục tiêu (vd: 162 cho HSK1 single-char)
 */
export function calcProgress(unlockedChars, totalTarget) {
  if (totalTarget <= 0) return 0;
  return Math.min(100, Math.round((unlockedChars.size / totalTarget) * 100));
}

/**
 * Tính level dựa trên số chữ đã mở khóa.
 * Mỗi 10 chữ = 1 level.
 */
export function calcLevel(unlockedChars) {
  return Math.floor(unlockedChars.size / 10) + 1;
}

/**
 * Tính XP cần cho level tiếp theo.
 */
export function xpForNextLevel(currentLevel) {
  return currentLevel * 500;
}

/**
 * Kiểm tra xem 2 cá có thể merge với nhau không.
 * @param {object} fish1
 * @param {object} fish2
 * @returns {boolean}
 */
export function canMerge(fish1, fish2) {
  const c1 = fish1.resultChar || fish1.radical;
  const c2 = fish2.resultChar || fish2.radical;
  const match = findMatchingRecipe([c1, c2]);
  return match.success;
}
