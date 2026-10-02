// Keep behavior aligned with backend/app/services/ordering_contract.py.
// Both implementations run the same JSON fixtures; neither repairs stored items.
export const ORDERING_VERSION = 'ordering-v1';

export class OrderingError extends Error {}

function validateSegments(value) {
  if (!Array.isArray(value) || value.length < 2 || value.some(
    token => typeof token !== 'string' || !/[\p{L}\p{N}]/u.test(token)
  )) throw new OrderingError('ordering_segments');
  if (new Set(value).size < 2) throw new OrderingError('ordering_unscramblable');
  return [...value];
}

function permutation(value, size, code) {
  if (!Array.isArray(value) || value.length !== size || value.some(
    index => !Number.isInteger(index) || index < 0 || index >= size
  ) || new Set(value).size !== size) throw new OrderingError(code);
  return [...value];
}

function sentence(segments, order) {
  return order.map(index => segments[index]).join('');
}

export function normalizeOrdering(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new OrderingError('ordering_metadata');
  }
  const versioned = Object.hasOwn(metadata, 'ordering_version');
  if (versioned && metadata.ordering_version !== ORDERING_VERSION) {
    throw new OrderingError('ordering_version');
  }
  if (Object.hasOwn(metadata, 'accepted_orders') && (
    !Array.isArray(metadata.accepted_orders) || metadata.accepted_orders.length !== 0
  )) throw new OrderingError('ordering_alternates_unsupported');
  let segments = validateSegments(metadata.segments);
  const order = metadata.correct_order;
  if (!Array.isArray(order) || order.length !== segments.length) {
    throw new OrderingError('ordering_correct_order');
  }
  let correct;
  let scrambled;
  if (order.every(Number.isInteger)) {
    correct = permutation(order, segments.length, 'ordering_correct_order');
    scrambled = permutation(metadata.scrambled_indices, segments.length, 'ordering_scramble');
  } else if (order.every(token => typeof token === 'string')) {
    if (versioned) throw new OrderingError('ordering_correct_order');
    if (new Set(segments).size !== segments.length || new Set(order).size !== order.length) {
      throw new OrderingError('ordering_legacy_ambiguous');
    }
    if (!order.every(token => segments.includes(token))) throw new OrderingError('ordering_legacy_mismatch');
    if (Object.hasOwn(metadata, 'scrambled_indices')) throw new OrderingError('ordering_legacy_mixed');
    scrambled = segments.map(token => order.indexOf(token));
    segments = [...order];
    correct = segments.map((_, index) => index);
  } else {
    throw new OrderingError('ordering_correct_order');
  }
  if (versioned && sentence(segments, correct) === sentence(segments, scrambled)) {
    throw new OrderingError('ordering_visible_scramble');
  }
  return {
    ordering_version: ORDERING_VERSION,
    segments,
    correct_order: correct,
    scrambled_indices: scrambled,
  };
}

export function gradeOrdering(metadata, selectedOrder) {
  const ordering = normalizeOrdering(metadata);
  const selected = permutation(selectedOrder, ordering.segments.length, 'ordering_selected_order');
  return selected.every((index, position) => index === ordering.correct_order[position]);
}

export function scrambleOrder(segments, correctOrder, rng = Math.random) {
  const tokens = validateSegments(segments);
  const correct = permutation(correctOrder, tokens.length, 'ordering_correct_order');
  let scrambled = [...correct];
  for (let index = scrambled.length - 1; index > 0; index -= 1) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new OrderingError('ordering_rng');
    const swap = Math.floor(value * (index + 1));
    [scrambled[index], scrambled[swap]] = [scrambled[swap], scrambled[index]];
  }
  if (sentence(tokens, scrambled) !== sentence(tokens, correct)) return scrambled;
  for (let left = 0; left < tokens.length; left += 1) {
    for (let right = left + 1; right < tokens.length; right += 1) {
      scrambled = [...correct];
      [scrambled[left], scrambled[right]] = [scrambled[right], scrambled[left]];
      if (sentence(tokens, scrambled) !== sentence(tokens, correct)) return scrambled;
    }
  }
  throw new OrderingError('ordering_unscramblable');
}
