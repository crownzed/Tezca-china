// ============================================================
// ADAPTIVE QUIZ — Elo rating, difficulty scaling
// ============================================================

// Assign Elo rating to each question based on user performance
export function adjustQuestionRating(currentRating, isCorrect, difficulty = 0.5) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (1500 - currentRating) / 400));
  return Math.round(currentRating + K * (isCorrect ? 1 : 0 - expected));
}

// Select next question using Elo: prefer questions at user's level
export function selectNextQuestion(questions, userElo = 1500, lastWrong = []) {
  if (questions.length === 0) return null;

  // Score each question: closer to user's Elo = better
  const scored = questions.map((q, i) => {
    const qElo = q.elo || 1500;
    const diff = Math.abs(userElo - qElo);
    // Prefer questions near user level, but also mix in some easier/harder
    const penalty = lastWrong.includes(i) ? 200 : 0; // avoid repeat wrong
    return { idx: i, score: -diff - penalty + Math.random() * 50 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].idx;
}

// Generate adaptive quiz pool mixing easy/hard
export function buildAdaptivePool(allQuestions, userElo, weakWords, count = 20) {
  const weakSet = new Set(weakWords);
  
  // Separate: weak words first, then rest
  const weak = allQuestions.filter(q => weakSet.has(String(q.wordId || q.question)));
  const rest = allQuestions.filter(q => !weakSet.has(String(q.wordId || q.question)));
  
  // Mix: 40% weak words, 60% proportional to user level
  const weakCount = Math.min(Math.floor(count * 0.4), weak.length);
  const restCount = count - weakCount;
  
  const selected = [];
  
  // Pick weak words first
  const shuffledWeak = [...weak].sort(() => Math.random() - 0.5);
  selected.push(...shuffledWeak.slice(0, weakCount));
  
  // Pick rest based on Elo proximity
  const scored = rest.map(q => ({
    q, score: -Math.abs(userElo - (q.elo || 1500)) + Math.random() * 100
  }));
  scored.sort((a, b) => b.score - a.score);
  selected.push(...scored.slice(0, restCount).map(x => x.q));
  
  return selected.slice(0, count);
}
