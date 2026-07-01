// Vòng tròn % tái dùng cho bảng kết quả phát âm.
// Dùng conic-gradient thuần (giống .progress-ring có sẵn) — không cần thư viện.
const TONE = {
  good: 'var(--jade)',
  ok: 'var(--gold)',
  low: 'var(--cinnabar)',
};

function toneFor(pct) {
  if (pct >= 85) return 'good';
  if (pct >= 60) return 'ok';
  return 'low';
}

export default function ScoreRing({ value, label, size = 92, suffix = '%' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const tone = toneFor(pct);
  const color = TONE[tone];
  return (
    <div className="score-ring" style={{ width: size }}>
      <div
        className="score-ring-dial"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${pct * 3.6}deg, var(--ring-track) 0)`,
        }}
        role="img"
        aria-label={`${label}: ${pct}${suffix}`}
      >
        <div className="score-ring-hole">
          <strong style={{ color }}>{pct}</strong>
          <small>{suffix}</small>
        </div>
      </div>
      <span className="score-ring-label">{label}</span>
    </div>
  );
}
