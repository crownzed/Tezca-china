import { useCallback, useRef, useState } from 'react';
import { useReducedMotion } from '../../hooks/useMotionPrefs';

// Bilingual day labels — default zh-CN for Chinese learners, fallback vi-VN
const DAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_LABELS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * WeekChain — 7-day visualization với connected nodes.
 * Hiển thị chuỗi ngày học liên tiếp dạng timeline ngang.
 *
 * M3: Urgency indicators trên today dot khi chưa học và trời tối dần.
 * M10: Long-press/hover preview tooltip trên mỗi dot.
 *
 * @param {{
 *   days: boolean[],
 *   loading?: boolean,
 *   locale?: 'zh-CN' | 'vi-VN',
 *   urgency?: 'none' | 'medium' | 'high' | 'critical',
 *   dayDetails?: Array<{date?: string, quizCount?: number, score?: number} | null>,
 * }} props
 */
export function WeekChain({ days, loading = false, locale = 'zh-CN', urgency = 'none', dayDetails }) {
  const reducedMotion = useReducedMotion();
  const DAY_LABELS = locale === 'vi-VN' ? DAY_LABELS_VI : DAY_LABELS_ZH;
  const [tooltipIdx, setTooltipIdx] = useState(null);
  const longPressTimerRef = useRef(null);

  // Ensure exactly 7 entries
  const safeDays = (() => {
    if (Array.isArray(days) && days.length === 7) return days;
    return Array(7).fill(false);
  })();

  // M10: Long-press handlers (mobile) + hover (desktop)
  const handlePointerDown = useCallback((idx) => {
    longPressTimerRef.current = setTimeout(() => {
      setTooltipIdx(idx);
    }, 400);
  }, []);

  const handlePointerUp = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    // Keep tooltip visible briefly after release for readability
    setTimeout(() => setTooltipIdx(null), 1500);
  }, []);

  const handlePointerLeave = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    setTooltipIdx(null);
  }, []);

  const handleMouseEnter = useCallback((idx) => {
    setTooltipIdx(idx);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltipIdx(null);
  }, []);

  // Build tooltip content
  const getTooltipContent = (idx) => {
    const active = safeDays[idx];
    const detail = dayDetails?.[idx];
    const label = DAY_LABELS[idx];

    if (detail?.date) {
      const lines = [`${label} ${detail.date}`];
      if (detail.quizCount != null) lines.push(`${detail.quizCount} bài`);
      if (detail.score != null) lines.push(`Điểm: ${detail.score}%`);
      return lines.join(' · ');
    }
    return `${label} · ${active ? '✓ Đã học' : 'Chưa học'}`;
  };

  if (loading) {
    return (
      <div className="week-chain week-chain--loading" role="status" aria-label="Đang tải chuỗi tuần">
        {Array(7).fill(null).map((_, i) => (
          <div key={i} className="week-chain-node week-chain-node--skeleton">
            <div className="week-chain-dot" />
            <span className="week-chain-label">{DAY_LABELS[i]}</span>
          </div>
        ))}
      </div>
    );
  }

  const activeCount = safeDays.filter(Boolean).length;

  return (
    <div
      className="week-chain"
      role="img"
      aria-label={`Chuỗi tuần: ${activeCount}/7 ngày đã học`}
    >
      {safeDays.map((active, i) => {
        const isToday = i === 6;
        // M3: Apply urgency class only to today's dot when not yet studied
        const todayUrgency = isToday && !active && urgency !== 'none' ? urgency : null;
        const showTooltip = tooltipIdx === i;
        return (
          <div
            key={i}
            className={[
              'week-chain-node-wrap',
            ].filter(Boolean).join(' ')}
            onPointerDown={() => handlePointerDown(i)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onMouseEnter={() => handleMouseEnter(i)}
            onMouseLeave={handleMouseLeave}
          >
            {/* M10: Tooltip */}
            <div
              className={`week-chain-tooltip ${showTooltip ? 'week-chain-tooltip--visible' : ''}`}
              aria-hidden={!showTooltip}
            >
              {getTooltipContent(i)}
            </div>

            <div
              className={[
                'week-chain-node',
                active ? 'week-chain-node--active' : '',
                isToday ? 'week-chain-node--today' : '',
                todayUrgency ? `week-chain-node--urgency-${todayUrgency}` : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Connector line to next node — Forged metallic link when consecutive days active */}
              {i < 6 && (
                <div
                  className={`week-chain-connector ${
                    active && safeDays[i + 1] ? 'week-chain-connector--lit week-chain-connector--forged' : ''
                  }`}
                  aria-hidden="true"
                >
                  {active && safeDays[i + 1] && <span className="week-chain-weld-spark" />}
                </div>
              )}

              {/* Dot / circle */}
              <div
                className="week-chain-dot"
                style={!reducedMotion && active ? { animationDelay: `${i * 80}ms` } : undefined}
              >
                {active && <span className="week-chain-check" aria-hidden="true">✓</span>}
              </div>

              {/* Day label */}
              <span className="week-chain-label">{DAY_LABELS[i]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
