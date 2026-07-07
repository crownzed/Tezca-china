// ============================================================
// GRAMMAR SPECS — Gộp toàn bộ spec ngữ pháp theo cấp HSK.
// Engine (grammar-engine.js) nở mỗi spec thành ~100 câu hỏi.
// ============================================================
import { hsk1 } from './hsk1.js';
import { hsk2 } from './hsk2.js';
import { hsk3 } from './hsk3.js';
import { hsk4 } from './hsk4.js';
import { hsk5 } from './hsk5.js';
import { hsk6 } from './hsk6.js';

export const allGrammarSpecs = [
  ...hsk1,
  ...hsk2,
  ...hsk3,
  ...hsk4,
  ...hsk5,
  ...hsk6,
];
