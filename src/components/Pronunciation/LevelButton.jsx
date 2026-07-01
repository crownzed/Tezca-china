// Nút chọn cấp HSK với trạng thái active rõ ràng (nền đậm, chữ trắng, đổ bóng).
export default function LevelButton({ level, active, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`level-button${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <span className="level-button-tag">HSK</span>
      <strong className="level-button-num">{level}</strong>
    </button>
  );
}
