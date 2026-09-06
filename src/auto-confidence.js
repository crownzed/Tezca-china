// ============================================================
// AUTO-CONFIDENCE — Suy "mức tự tin" (1..4) từ tín hiệu khách quan.
//
// Trước đây sau mỗi câu người học phải tự bấm 1..4. Thang đó KHÔNG phải nhãn
// trang trí: nó là đầu vào của SM-2 (qualityFrom trong vocab-srs.js, _quality
// trong srs_service.py). Nên bỏ nút bấm không có nghĩa là bỏ tín hiệu — gửi cứng
// một con số thì mọi câu đúng đều nhận cùng quality và lịch ôn mất độ phân giải.
//
// Thay bằng suy luận từ ba nguồn app đã có sẵn:
//   1. Đúng/sai — trục chính.
//   2. Độ trễ trả lời so với NGÂN SÁCH THỜI GIAN của từng dạng bài. Đọc đoạn văn
//      chậm hơn chọn nghĩa từ đơn là bình thường, không phải "chưa chắc" — nên so
//      theo tỉ lệ với ngân sách riêng, không so bằng một mốc giây tuyệt đối.
//   3. Lịch sử SRS của chính từ đó (lapses/repetition) — từ hay quên thì một lần
//      đúng nhanh chưa đủ để giãn lịch mạnh.
//
// Giá trị trả về đi thẳng vào qualityFrom(correct, confidence, latency):
//   4 + đúng + nhanh  → quality 5 (nới interval mạnh)
//   3 + đúng          → quality 4 (nới interval chuẩn)
//   2 + đúng          → quality 3 (nới tối thiểu, xếp lại vào lượt sửa)
//   3 + sai (nhanh)   → quality 1 (nhớ lệch: reset, hạ ease mạnh)
//   2 + sai           → quality 2 (chưa nhớ ra: reset, hạ ease nhẹ hơn)
// ============================================================

import { getWordRecord } from './vocab-srs.js';

// Ngân sách thời gian mỗi dạng bài (ms): thời gian một người học vững cần để đọc
// đề, xử lý và chọn. Vượt ngân sách = còn phải suy nghĩ, chưa thành phản xạ.
//
// flashcard/typing là hoạt động GỢI LẠI CHỦ ĐỘNG, không phải nhận diện trong 4
// lựa chọn: thẻ lật đo thời gian từ lúc hiện mặt trước đến lúc lật (chỉ có trí
// nhớ, không phải đọc đề nên ngân sách ngắn hơn vocab), còn gõ lại từ phải cộng
// thêm chi phí gõ pinyin/chữ Hán nên rộng hơn.
//
// dictation rộng nhất trong nhóm mức-từ: người học phải NGHE hết clip trước khi
// bắt đầu gõ, rồi gõ chữ Hán qua IME (gõ pinyin → chọn chữ trong danh sách).
// Lấy ngân sách của typing thì thời gian nghe + chọn chữ bị tính thành "còn phải
// suy nghĩ", và mọi câu đúng đều bị hạ xuống mức 2.
const LATENCY_BUDGET_MS = {
  flashcard: 6000,
  vocab: 7000,
  cloze: 10000,
  typing: 12000,
  listening: 12000,
  dialogue: 14000,
  voice: 12000,
  dictation: 15000,
  drag_drop: 18000,
  translation: 18000,
  reading: 20000,
};
const DEFAULT_BUDGET_MS = 10000;

// Dưới mốc này gần như chắc chắn là bấm nhầm / bấm trước khi đọc, không phải
// phản xạ nhanh — bỏ tín hiệu độ trễ thay vì thưởng oan mức 4.
const MIN_RELIABLE_MS = 400;

// Nhanh = trong nửa ngân sách. Chậm = vượt ngân sách.
const FAST_RATIO = 0.5;
const SLOW_RATIO = 1;

export function latencyBudgetMs(quizType) {
  return LATENCY_BUDGET_MS[quizType] || DEFAULT_BUDGET_MS;
}

// Phân loại độ trễ: 'fast' | 'normal' | 'slow' | 'unknown'.
// 'unknown' khi không đo được (latency null) hoặc nhanh bất thường (bấm nhầm).
export function latencyBand(latencyMs, quizType) {
  const value = Number(latencyMs);
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  if (value < MIN_RELIABLE_MS) return 'unknown';
  const budget = latencyBudgetMs(quizType);
  if (value <= budget * FAST_RATIO) return 'fast';
  if (value > budget * SLOW_RATIO) return 'slow';
  return 'normal';
}

// Từ có tiền sử quên (lapses) hoặc mới vào lịch (repetition thấp) thì chưa được
// coi là "rất chắc" dù lần này đúng nhanh — chống giãn lịch quá sớm.
// question.word là optional ở backend (QuestionOut.word: … | None) nên phải chặn
// null trước khi tra kho SRS.
function isFragileWord(word) {
  if (!word) return false;
  const record = getWordRecord(word);
  if (!record) return false;
  if ((record.lapses || 0) >= 2) return true;
  return (record.repetition || 0) === 0 && (record.wrong || 0) > 0;
}

// Suy confidence 1..4 từ tín hiệu khách quan. `word` không bắt buộc — thiếu thì
// chỉ bỏ phần lịch sử SRS, hai tín hiệu còn lại vẫn dùng được.
export function inferConfidence({ correct, latencyMs = null, quizType = '', word = null } = {}) {
  const band = latencyBand(latencyMs, quizType);

  if (!correct) {
    // Sai NHANH = tưởng mình biết (quality 1: reset + hạ ease mạnh). Mức nặng này
    // đòi bằng chứng thật về tốc độ; không đo được thì dùng mức nhẹ hơn (quality
    // 2) — khớp mặc định của srs_service._quality khi confidence rỗng.
    return band === 'fast' ? 3 : 2;
  }

  if (band === 'slow') return 2;
  if (band === 'fast' && !isFragileWord(word)) return 4;
  return 3;
}

// Ngưỡng điểm phát âm → (correct, confidence). Lấy ĐÚNG hai mốc mà ScoreRing.jsx
// đang tô màu (85 = tốt, 60 = tạm) để con số trên màn hình và lịch ôn không nói
// hai chuyện khác nhau: vòng tròn xanh thì lịch cũng phải giãn ra.
//
// Dưới 40 điểm coi như "đọc lệch hẳn" — đó là bản phát âm của trường hợp sai
// nhanh (nói dứt khoát nhưng sai), nên nhận confidence 3 = quality 1: reset lịch
// và hạ ease mạnh. Khoảng 40–59 là đọc gần đúng nhưng chưa đạt, phạt nhẹ hơn.
export function confidenceFromScore(score) {
  const value = Number(score) || 0;
  if (value >= 85) return { correct: true, confidence: 4 };
  if (value >= 60) return { correct: true, confidence: 3 };
  if (value >= 40) return { correct: false, confidence: 2 };
  return { correct: false, confidence: 3 };
}
