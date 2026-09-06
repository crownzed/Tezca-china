// ============================================================
// SRS-CAPTURE — Một cửa duy nhất để MỌI hoạt động luyện tập ghi vào lịch ôn.
//
// Trước đây chỉ luồng quiz/phiên học (api-core.recordLearningEvent) và hai màn từ
// vựng nuôi kho SRS. Gõ lại từ, luyện dịch, luyện phát âm, tập viết đều tạo ra
// bằng chứng thật về trí nhớ rồi bỏ đi — người học cày cả buổi ở những màn đó mà
// "Học hôm nay" vẫn báo không có từ nào đến hạn.
//
// File này gom lại thành hai loại tín hiệu:
//   1. MỨC TỪ (captureWordReview) — biết chính xác từ nào đúng/sai. Cập nhật đầy
//      đủ cả hai hướng: đúng thì giãn lịch, sai thì kéo lịch về.
//   2. MỨC CÂU (captureSentenceReview) — chỉ biết cả câu đúng/sai. Cắt câu thành
//      các từ có trong kho rồi ghi CHỈ KHI CÂU ĐÚNG (xem lý do ở dưới).
//
// Không màn nào trong số này hiện lịch ôn hay hỏi người học tự đánh giá: mọi thứ
// suy từ đúng/sai + độ trễ + tiền sử của từ (auto-confidence.js). SRS chạy ngầm.
// ============================================================

import { confidenceFromScore, inferConfidence } from './auto-confidence.js';
import { recordWordReview } from './vocab-srs.js';

// Chuẩn hoá từ về shape recordWordReview đọc được. Các màn đặt tên trường khác
// nhau (character/hanzi, meaning/meaning_vi, hskLevel/level) nên gom về một chỗ
// thay vì mỗi caller tự map.
function toSrsWord(word) {
  if (!word) return null;
  const hanzi = String(word.hanzi || word.character || '').trim();
  if (!hanzi) return null;
  return {
    word_id: word.word_id ?? word.id ?? null,
    hanzi,
    pinyin: word.pinyin || '',
    meaning_vi: word.meaning_vi || word.meaning || '',
    level: Number(word.level ?? word.hskLevel ?? 0) || 0,
  };
}

// Ghi một lượt ôn mức từ. `activity` chỉ dùng để chọn ngân sách thời gian trong
// auto-confidence (mỗi dạng bài có nhịp riêng), không được lưu vào record.
// `confidence` để caller ép giá trị khi đã có thang điểm riêng (phát âm, tập
// viết); bỏ trống thì suy từ đúng/sai + độ trễ + tiền sử từ.
//
// Trả { record, confidence, correct } chứ không trả thẳng record: mức chắc là giá
// trị CỦA LƯỢT NÀY (đầu vào SM-2), không phải một cột trong record — màn nào muốn
// diễn giải "đúng nhanh / đúng chậm" thì đọc ở đây. null khi từ không hợp lệ.
export function captureWordReview({
  word,
  correct,
  latencyMs = null,
  activity = 'vocab',
  confidence = null,
}) {
  const srsWord = toSrsWord(word);
  if (!srsWord) return null;
  // Suy TRƯỚC khi ghi: inferConfidence đọc lapses/repetition hiện tại của từ, gọi
  // sau thì đã bị lượt này ghi đè.
  const value = confidence ?? inferConfidence({
    correct,
    latencyMs,
    quizType: activity,
    word: srsWord,
  });
  const record = recordWordReview(srsWord, { correct, confidence: value, latencyMs });
  return record ? { record, confidence: value, correct } : null;
}

// Ghi một lượt ôn mức từ khi tín hiệu là ĐIỂM 0..100 (phát âm). Ngưỡng nằm trong
// auto-confidence.confidenceFromScore để trùng mốc màu của ScoreRing.
export function captureScoredWord({ word, score, activity = 'voice' }) {
  const { correct, confidence } = confidenceFromScore(score);
  return captureWordReview({ word, correct, activity, confidence });
}

// Ghi lượt ôn cho các từ trong một CÂU. Chỉ ghi khi câu đúng, và cố tình không
// bao giờ trao mức cao nhất:
//
//   - Câu SAI thì không biết từ nào gây lỗi. Ghi sai cho cả câu sẽ reset lịch của
//     cả chục từ chỉ vì một hư từ dùng lệch — phá đúng cái kho này bảo vệ. Không
//     có dữ liệu thì không ghi gì, đó là phản ánh trung thực.
//   - Câu ĐÚNG là bằng chứng thật nhưng YẾU hơn kiểm tra trực tiếp: nhận ra 去
//     trong câu mình vừa dịch dễ hơn gọi 去 ra từ trí nhớ trắng. Nên chốt
//     confidence 3 (quality 4, giãn lịch mức chuẩn), không cho lên 4.
//
// async vì cần index từ vựng (nạp một lần rồi cache). Caller không cần await:
// ghi SRS là việc phụ, không được chặn UI trả kết quả. Import động để các màn
// KHÔNG chấm mức câu (thẻ, gõ từ, phát âm, tập viết) không phải kéo theo cả kho
// từ vựng chỉ vì dùng chung file này.
export async function captureSentenceReview({ text, correct, limit = 8 }) {
  if (!correct || !text) return [];
  const { ensureVocabIndex, matchWordsInText } = await import('./vocab-index.js');
  await ensureVocabIndex();
  const words = matchWordsInText(text, limit);
  return words
    .map(word => recordWordReview(word, { correct: true, confidence: 3 }))
    .filter(Boolean);
}
