import { gradeOrdering, normalizeOrdering, OrderingError } from './ordering-contract.js';

// Only explicit metadata can establish chip identity. The shared contract converts
// unambiguous legacy string orders; never infer identities from prompt text.
export function normalizeGrammarOrdering(question) {
  if (!question || question.type !== 'sentence_order') return null;
  try {
    const ordering = normalizeOrdering(question.metadata_json);
    const correct = ordering.correct_order.map(index => ordering.segments[index]).join('');
    if (!Number.isInteger(question.correctIndex)
      || !Array.isArray(question.options) || question.options.length < 2
      || question.options.some(option => typeof option !== 'string')
      || new Set(question.options).size !== question.options.length
      || question.options[question.correctIndex] !== correct
      || typeof question.question !== 'string' || !question.question.trim()) return null;
    return ordering;
  } catch (error) {
    if (error instanceof OrderingError) return null;
    throw error;
  }
}

export function gradeGrammarOrdering(question, selectedIndices) {
  const ordering = normalizeGrammarOrdering(question);
  if (!ordering) return false;
  try {
    return gradeOrdering(question.metadata_json, selectedIndices);
  } catch (error) {
    if (error instanceof OrderingError) return false;
    throw error;
  }
}
