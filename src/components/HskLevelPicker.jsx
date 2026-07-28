import { ALL_LEVELS, normalizeLevels, toggleLevel } from '../hsk-levels.js';

// Bộ chọn HSK dùng chung cho MỌI màn. Multi-select: nhiều nút .active cùng lúc —
// tái dùng đúng class .active sẵn có nên giao diện không đổi, chỉ thêm khả năng
// chọn nhiều cấp. Mỗi màn truyền class riêng để giữ nguyên visual (level-grid,
// focus-level-grid, pron-levels...).
//
// - `value`: mảng số đã chọn (state của caller). Rỗng = "tất cả".
// - `onChange(nextLevels)`: nhận mảng đã chuẩn hoá.
// - `levels`: danh sách cấp render (mặc định 1..6; focus panel truyền [1,2,3,4]).
// - `variant`: 'card' (span HSK / strong số) hoặc 'chip' (text "HSK n" một dòng).
// - `showAll`: hiện nút "Tất cả" bật/tắt chọn toàn bộ.
// - `allowEmpty`: cho phép bỏ chọn hết (dùng khi rỗng = tất cả một cách chủ ý).
export default function HskLevelPicker({
  value,
  onChange,
  levels = ALL_LEVELS,
  variant = 'card',
  showAll = false,
  allowEmpty = false,
  disabled = false,
  className = 'level-grid',
  buttonClassName = 'level-card',
  ariaLabel = 'Chọn cấp HSK',
}) {
  const selected = normalizeLevels(value);
  const allSelected = selected.length === 0 || selected.length === levels.length;

  const handleToggle = (level) => {
    if (disabled) return;
    onChange(toggleLevel(selected, level, { allowEmpty }));
  };

  const handleAll = () => {
    if (disabled) return;
    // "Tất cả" => selection rỗng (caller hiểu là toàn bộ), tránh state cồng kềnh.
    onChange([]);
  };

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {showAll && (
        <button
          type="button"
          className={`${buttonClassName}${allSelected ? ' active' : ''}`}
          aria-pressed={allSelected}
          disabled={disabled}
          onClick={handleAll}
        >
          {variant === 'card' ? (<><span>HSK</span><strong>Tất cả</strong></>) : 'Tất cả'}
        </button>
      )}
      {levels.map(level => {
        const isActive = !allSelected && selected.includes(level);
        return (
          <button
            key={level}
            type="button"
            className={`${buttonClassName}${isActive ? ' active' : ''}`}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => handleToggle(level)}
          >
            {variant === 'card'
              ? (<><span>HSK</span><strong>{level}</strong></>)
              : `HSK ${level}`}
          </button>
        );
      })}
    </div>
  );
}
