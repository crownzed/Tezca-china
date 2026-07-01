// Sóng âm chạy liên tục khi đang ghi âm — tạo cảm giác hệ thống đang lắng nghe.
// Thuần CSS keyframes (xem .pron-wave-bar trong index.css); số thanh cố định.
const BARS = 28;

export default function Waveform({ active }) {
  return (
    <div className={`pron-wave${active ? ' is-active' : ''}`} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="pron-wave-bar" style={{ '--bar-index': i }} />
      ))}
    </div>
  );
}
