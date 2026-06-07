// ============================================================
// SRS ENGINE — SM-2 Algorithm (SuperMemo 2)
// Tính toán lịch ôn tập thông minh dựa trên chất lượng nhớ
// ============================================================

const STORAGE_KEY = 'srsData';

function loadSRS() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function saveSRS(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Default SRS card state
function defaultState() {
  return {
    ease: 2.5,        // Ease Factor (>= 1.3)
    interval: 0,      // Days until next review
    rep: 0,           // Repetition count
    nextReview: 0,    // Timestamp (ms) of next review
    lapses: 0,        // How many times forgotten
    avgQuality: 0,    // Average quality (0-5)
    reviews: 0        // Total reviews done
  };
}

// SM-2 Algorithm
export function grade(cardId, quality) {
  const srs = loadSRS();
  const card = srs[cardId] || defaultState();
  
  // Quality: 0=complete blackout, 1=wrong/hard, 2=wrong/easy, 3=correct/hard, 4=correct/good, 5=perfect
  quality = Math.max(0, Math.min(5, Math.round(quality)));
  
  if (quality < 3) {
    // Wrong answer — reset
    card.rep = 0;
    card.interval = 1;
    card.lapses += 1;
  } else {
    // Correct answer
    if (card.rep === 0) {
      card.interval = 1;
    } else if (card.rep === 1) {
      card.interval = 6;
    } else {
      card.interval = Math.round(card.interval * card.ease);
    }
    card.rep += 1;
  }
  
  // Update ease factor (SM-2 formula)
  card.ease = card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (card.ease < 1.3) card.ease = 1.3;
  
  // Set next review date
  card.nextReview = Date.now() + card.interval * 86400000;
  
  // Update stats
  card.avgQuality = ((card.avgQuality * card.reviews) + quality) / (card.reviews + 1);
  card.reviews += 1;
  
  srs[cardId] = card;
  saveSRS(srs);
  
  return card;
}

// Get cards due for review
export function getDueCards(cardIds) {
  const srs = loadSRS();
  const now = Date.now();
  return cardIds.filter(id => {
    const card = srs[id];
    return !card || card.nextReview <= now;
  });
}

// Get stats
export function getSRSStats(cardIds) {
  const srs = loadSRS();
  const now = Date.now();
  let due = 0, learned = 0, newCards = 0, avgEase = 0, total = 0;
  
  cardIds.forEach(id => {
    const card = srs[id];
    if (!card || !card.reviews) { newCards++; return; }
    total++;
    avgEase += card.ease;
    if (card.nextReview <= now) due++;
    else learned++;
  });
  
  return {
    new: newCards,
    due,
    learning: learned,
    total: cardIds.length,
    avgEase: total ? (avgEase / total).toFixed(2) : 2.5,
    mastered: cardIds.filter(id => {
      const c = srs[id];
      return c && c.interval >= 21;
    }).length
  };
}

// Get cards scheduled for review sorted by urgency
export function getScheduledCards(cardIds, limit = 20) {
  const srs = loadSRS();
  const now = Date.now();
  
  const withMeta = cardIds.map(id => {
    const c = srs[id];
    return { id, nextReview: c?.nextReview || 0, interval: c?.interval || 0, ease: c?.ease || 2.5, rep: c?.rep || 0 };
  });
  
  // Sort: new cards first, then overdue cards, then soonest
  withMeta.sort((a, b) => {
    const aNew = !srs[a.id]?.reviews ? 1 : 0;
    const bNew = !srs[b.id]?.reviews ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aDue = a.nextReview <= now ? 1 : 0;
    const bDue = b.nextReview <= now ? 1 : 0;
    if (aDue !== bDue) return bDue - aDue;
    return a.nextReview - b.nextReview;
  });
  
  return withMeta.slice(0, limit).map(x => x.id);
}
