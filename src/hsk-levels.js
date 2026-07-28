// ============================================================
// HSK-LEVELS — Nền tảng dùng chung cho việc chọn MỘT hoặc NHIỀU cấp HSK.
//
// Trước đây mỗi màn tự giữ một `level` scalar (số 1..6) + vài bộ chọn native
// <select> có sentinel 'all'. Khi cho phép chọn nhiều cấp, ta thống nhất về MỘT
// mô hình duy nhất: selection = MẢNG số đã sort tăng dần, không rỗng.
//
//   - Màn LỌC (Kho từ vựng, Gõ từ vựng, Grammar, Phát âm): dùng cả tập.
//   - Màn cần MỘT cấp (today-plan, độ khó đoạn văn AI, câu luyện phát âm mỗi
//     lượt): suy `primaryLevel` = cấp THẤP NHẤT trong tập (học từ dễ lên khó).
//
// Quy ước: mảng rỗng => coi như "tất cả" (ALL_LEVELS). Điều này thay cho
// sentinel 'all' cũ mà không cần một giá trị đặc biệt trong state.
// ============================================================

export const ALL_LEVELS = [1, 2, 3, 4, 5, 6];

// Chuẩn hoá input bất kỳ (số, chuỗi, mảng, Set, 'all', null) về mảng số hợp lệ
// đã sort + khử trùng. Rỗng/không hợp lệ => trả [] (caller hiểu là "tất cả").
export function normalizeLevels(input) {
  if (input === null || input === undefined || input === 'all') return [];
  const raw = Array.isArray(input) ? input : [input];
  const valid = raw
    .map(value => Number(value))
    .filter(value => ALL_LEVELS.includes(value));
  return [...new Set(valid)].sort((a, b) => a - b);
}

// Tập cấp "thực dụng" để lọc: nếu selection rỗng => toàn bộ ALL_LEVELS.
export function effectiveLevels(input) {
  const levels = normalizeLevels(input);
  return levels.length ? levels : ALL_LEVELS;
}

// Cấp chính (thấp nhất) cho các màn chỉ dùng được một cấp. Rỗng => fallback (mặc định 1).
export function primaryLevel(input, fallback = 1) {
  const levels = normalizeLevels(input);
  return levels.length ? levels[0] : fallback;
}

// Bật/tắt một cấp trong selection, luôn trả mảng đã chuẩn hoá. Không cho tập
// rỗng khi người dùng bỏ chọn cấp cuối — giữ lại chính cấp đó để luôn có dữ liệu.
export function toggleLevel(input, level, { allowEmpty = false } = {}) {
  const numeric = Number(level);
  if (!ALL_LEVELS.includes(numeric)) return normalizeLevels(input);
  const current = normalizeLevels(input);
  const next = current.includes(numeric)
    ? current.filter(value => value !== numeric)
    : [...current, numeric];
  if (!allowEmpty && next.length === 0) return [numeric];
  return normalizeLevels(next);
}

// Một card/từ có thuộc selection không. hskLevel là số trên card (vocab-loader).
export function levelMatches(input, hskLevel) {
  return effectiveLevels(input).includes(Number(hskLevel));
}

// Nhãn gọn cho selection: "HSK 1", "HSK 1·3", "Tất cả HSK".
export function levelsLabel(input) {
  const levels = normalizeLevels(input);
  if (!levels.length || levels.length === ALL_LEVELS.length) return 'Tất cả HSK';
  return `HSK ${levels.join('·')}`;
}

// Đọc selection đã lưu (localStorage) — chấp nhận cả định dạng cũ (số đơn) lẫn
// mảng JSON mới. Trả mảng đã chuẩn hoá.
export function readStoredLevels(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return [];
  try {
    const parsed = JSON.parse(rawValue);
    return normalizeLevels(parsed);
  } catch {
    return normalizeLevels(rawValue);
  }
}
