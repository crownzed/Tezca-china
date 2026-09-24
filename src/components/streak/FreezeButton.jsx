import { useState } from 'react';
import { Snowflake, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getAuthToken } from '../../api-core';

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

/**
 * S3: Freeze button — dùng 1 lượt freeze để bảo vệ streak hôm nay.
 *
 * @param {{
 *   freezesRemaining: number,
 *   studiedToday: boolean,
 *   onFreezeUsed?: () => void,
 * }} props
 */
export function FreezeButton({ freezesRemaining = 0, studiedToday = false, onFreezeUsed }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  // Don't render if already studied today or no freezes available
  if (studiedToday) return null;

  const canUse = freezesRemaining > 0;

  async function handleFreeze() {
    if (loading || !canUse) return;
    setLoading(true);
    setResult(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/streak/freeze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Không thể sử dụng freeze');
      }

      setResult('success');
      onFreezeUsed?.();
    } catch (err) {
      setResult('error');
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (result === 'success') {
    return (
      <div className="freeze-btn freeze-btn--success" role="status">
        <ShieldCheck size={18} />
        <span>Đã bảo vệ streak hôm nay!</span>
      </div>
    );
  }

  return (
    <div className="freeze-btn-wrap">
      <button
        className={`freeze-btn ${!canUse ? 'freeze-btn--disabled' : ''}`}
        onClick={handleFreeze}
        disabled={!canUse || loading}
        aria-label={canUse ? `Sử dụng freeze (${freezesRemaining} lượt còn lại)` : 'Hết lượt freeze tháng này'}
        title={canUse ? `Bảo vệ streak hôm nay — ${freezesRemaining} lượt/tháng` : 'Hết lượt freeze. Reset đầu tháng sau.'}
      >
        {loading ? (
          <span className="freeze-btn-spinner" aria-hidden="true" />
        ) : (
          <Snowflake size={16} />
        )}
        <span>{canUse ? 'Bảo vệ streak' : 'Hết lượt freeze'}</span>
        {canUse && <small className="freeze-btn-count">{freezesRemaining}×/tháng</small>}
      </button>

      {/* Error toast */}
      {result === 'error' && (
        <div className="freeze-btn-error" role="alert">
          <AlertTriangle size={14} />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
