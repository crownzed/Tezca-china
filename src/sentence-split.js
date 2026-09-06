// ============================================================
// SENTENCE-SPLIT — Cắt văn bản tiếng Trung thành đơn vị luyện nghe viết.
//
//   splitSentences      — một đoạn → từng câu.
//   parseDialogueLines  — đoạn hội thoại dán từ ngoài → từng lượt nói.
//
// splitSentences MIRROR _split_complete_sentences
// (backend/app/services/speech_ai_service.py) để chỗ ngắt câu ở màn nghe viết
// trùng đúng chỗ ngắt mà TTS server dùng khi đọc từng câu — lệch nhau thì người
// học nghe một nhịp nhưng thấy một nhịp khác.
// ============================================================

// CJK Unified Ideographs (basic + ext A) — cùng dải mà speech.jsx dùng.
const HAN_RE = /[一-鿿㐀-䶿]/;

export function hasHan(text) {
  return HAN_RE.test(String(text || ''));
}

// Dấu kết câu. Có cả '\n' vì bản backend dùng nó để chốt câu cuối khi model
// xuống dòng; giữ nguyên để hai bên cắt ra cùng một danh sách.
const SENTENCE_ENDINGS = '。！？!?…\n';

// Dấu đóng đi SAU dấu kết vẫn thuộc câu đó (他说：“你好。”), nên gộp vào câu trước
// thay vì để nó mở một câu mới chỉ có một ký tự.
const SENTENCE_TRAILERS = '”』」）)》…';

// Trả về mảng câu, giữ nguyên dấu câu, bỏ chuỗi rỗng.
export function splitSentences(text) {
  const raw = String(text || '');
  const out = [];
  let start = 0;
  let i = 0;
  while (i < raw.length) {
    if (SENTENCE_ENDINGS.includes(raw[i])) {
      let end = i + 1;
      while (end < raw.length && SENTENCE_TRAILERS.includes(raw[end])) end += 1;
      const piece = raw.slice(start, end).trim();
      if (piece) out.push(piece);
      start = end;
      i = end;
      continue;
    }
    i += 1;
  }
  // Bản backend CỐ TÌNH bỏ phần đuôi chưa gặp dấu kết vì nó đọc stream và còn
  // chờ chunk sau. Ở đây văn bản đã trọn vẹn, nên phải giữ đuôi lại — bỏ đi là
  // mất hẳn câu cuối của những đoạn không đóng bằng dấu câu.
  const tail = raw.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

// --- Hội thoại dán từ ngoài -------------------------------------------------
//
// Người học copy hội thoại từ sách/app/web, mỗi nguồn đánh dấu người nói một
// kiểu. Nhận tất cả các kiểu dưới đây thay vì bắt họ sửa tay:
//
//   A: 你好         A：你好        (nửa/toàn phần, cả hai đều gặp)
//   小王: 你好      服务员：你好   (tên người, không chỉ một chữ)
//   - 你好          — 你好         (gạch đầu dòng, không có tên)
//   1. 你好         (1) 你好       (số thứ tự)
//
// Vì sao cắt theo DÒNG chứ không theo câu: một lượt nói có thể gồm nhiều câu
// ("你好。我叫小王。"), và người học phải viết trọn lượt đó — cắt theo câu sẽ
// phá cấu trúc hội thoại. Lượt nào dài quá thì DictationMode tự cắt tiếp.
//
// Tên người nói được TÁCH RA chứ không xoá: nó hiện trên UI để biết ai đang nói,
// nhưng KHÔNG đi vào TTS và không đi vào phần chấm — bắt gõ cả "A:" là bắt gõ
// thứ không nghe được.
const SPEAKER_RE = /^\s*(?:([^\s:：]{1,8})\s*[:：]|[-—–]\s*|\(?\d{1,2}[).．.]\s*)\s*/;

// Nhãn tiếng Việt hay đi kèm khi copy từ sách song ngữ. Dòng bắt đầu bằng các
// nhãn này là chú thích, không phải lượt nói.
const NOTE_PREFIX_RE = /^\s*(?:dịch|nghĩa|bản dịch|pinyin|phiên âm|từ mới|ghi chú|chú ý|lưu ý|translation|note)\s*[:：]/i;

export function parseDialogueLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !NOTE_PREFIX_RE.test(line))
    .map(line => {
      const match = line.match(SPEAKER_RE);
      const speaker = match?.[1] ? match[1].trim() : '';
      const body = (match ? line.slice(match[0].length) : line).trim();
      return { speaker, text: body };
    })
    // Dòng không có chữ Hán bị bỏ: đó là bản dịch, pinyin, tiêu đề, số trang —
    // thứ không đọc được bằng giọng Trung và không viết được bằng chữ Hán.
    .filter(row => hasHan(row.text));
}

