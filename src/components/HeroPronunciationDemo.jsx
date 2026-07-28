import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, UserPlus, RotateCcw, Volume2 } from 'lucide-react';
import { getDemoSentence, scoreDemoPronunciation } from '../api-core';
import { isRecordingSupported, startRecording } from '../speech-ai.js';
import { speak } from '../speech.jsx';
import { useAuth } from '../auth-core';
import ScoreRing from './Pronunciation/ScoreRing.jsx';

// Demo phát âm trên trang chủ cho người CHƯA đăng nhập. Cho thử đúng MỘT lần
// (guard UX qua localStorage; lớp bảo vệ thật là rate-limit theo IP ở backend),
// rồi khoá và mời tạo tài khoản. Tái dùng startRecording() (mã hoá WAV — cần cho
// đường F0) và ScoreRing như PronunciationPractice, KHÔNG copy toàn bộ view đó.

const DEMO_USED_KEY = 'tezca_hero_demo_used';

function readDemoUsed() {
  try {
    const raw = localStorage.getItem(DEMO_USED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cần đủ CẢ result và sentence: khối kết quả render lồng trong nhánh có
    // câu mẫu, thiếu sentence thì khoá xong chẳng hiện được gì. Thiếu → coi như
    // chưa dùng (mở lại lượt); rate-limit theo IP ở server vẫn là chốt thật.
    if (!parsed?.ts || !parsed?.result || !parsed?.sentence) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Pitch chart: vẽ đường F0 (Hz) thành polyline SVG. Khung 0 = khoảng lặng (unvoiced)
// nên cắt contour thành các đoạn voiced liên tiếp, mỗi đoạn một polyline riêng để
// không nối ngang qua chỗ ngắt. Chuẩn hoá cao độ theo min/max của phần có tiếng.
function PitchChart({ contour, ariaLabel }) {
  const W = 280;
  const H = 96;
  const voiced = (contour || []).filter((v) => v > 0);
  if (voiced.length < 2) {
    return (
      <div className="hero-demo-pitch hero-demo-pitch--empty" role="img" aria-label={ariaLabel}>
        <span>Chưa đủ dữ liệu cao độ để vẽ.</span>
      </div>
    );
  }
  const lo = Math.min(...voiced);
  const hi = Math.max(...voiced);
  const span = hi - lo || 1;
  const n = contour.length;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * (W - 8) + 4);
  const y = (v) => H - 8 - ((v - lo) / span) * (H - 16);

  const segments = [];
  let current = [];
  contour.forEach((v, i) => {
    if (v > 0) {
      current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  return (
    <svg
      className="hero-demo-pitch"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((pts, idx) => (
        <polyline
          key={idx}
          points={pts.join(' ')}
          fill="none"
          stroke="var(--landing-accent, var(--jade))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function contourSummary(result) {
  const score = result?.score ?? 0;
  const tone = result?.tone_accuracy != null ? ` Độ chuẩn thanh điệu ${Math.round(result.tone_accuracy * 100)}%.` : '';
  return `Biểu đồ cao độ giọng đọc của bạn. Điểm tổng ${score} trên 100.${tone}`;
}

// `onRegister`: trang landing (ngoài AuthGate) không có AuthModalHost nên tự
// truyền hàm chuyển sang màn đăng ký. Khi dùng trong App (đã đăng nhập) thì
// mặc định mở modal đăng ký của AuthProvider.
export default function HeroPronunciationDemo({ onRegister }) {
  const { openRegister } = useAuth();
  const goRegister = onRegister || openRegister;
  const supported = isRecordingSupported();

  // Đọc lượt đã dùng NGAY lúc khởi tạo state (đồng bộ, trước render đầu) thay vì
  // trong effect — vừa tránh nháy giao diện, vừa không setState trong effect.
  const [saved] = useState(readDemoUsed);

  const [sentence, setSentence] = useState(() => saved?.sentence || null);
  // 'idle' | 'recording' | 'scoring' | 'done'
  const [phase, setPhase] = useState(() => (saved ? 'done' : 'idle'));
  const [result, setResult] = useState(() => saved?.result || null);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(() => Boolean(saved));
  const [status, setStatus] = useState('');
  // Tăng để buộc tải lại câu mẫu khi bấm "Thử lại".
  const [reloadKey, setReloadKey] = useState(0);
  const recorderRef = useRef(null);

  // Suy ra từ dữ liệu thay vì giữ cờ loading riêng: chưa có câu, chưa lỗi và
  // chưa khoá thì đang chờ mạng.
  const loadingSentence = !locked && !sentence && !error;

  useEffect(() => {
    if (locked) return;
    let active = true;
    getDemoSentence()
      .then((data) => { if (active) setSentence(data); })
      .catch((e) => { if (active) setError(e.message || 'Không tải được câu mẫu.'); });
    return () => { active = false; };
  }, [locked, reloadKey]);

  // Đang ghi mà component bị bỏ (bấm Đăng ký → chuyển sang AuthGate) thì phải
  // nhả mic + AudioContext, không thì đèn mic còn sáng và stream treo.
  useEffect(() => () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
  }, []);

  const beginRecording = useCallback(async () => {
    setError('');
    setStatus('Đang ghi âm, hãy đọc to câu mẫu.');
    try {
      recorderRef.current = await startRecording();
      setPhase('recording');
    } catch (e) {
      // getUserMedia bị từ chối / không có mic → hướng dẫn, không crash.
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Bạn đã từ chối quyền micro. Hãy bật lại quyền micro trong trình duyệt rồi thử lại.');
      } else if (name === 'NotFoundError') {
        setError('Không tìm thấy micro. Hãy kiểm tra thiết bị thu âm rồi thử lại.');
      } else {
        setError(e?.message || 'Không truy cập được micro.');
      }
      setStatus('');
    }
  }, []);

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !sentence) return;
    recorderRef.current = null;
    setPhase('scoring');
    setStatus('AI đang nghe và chấm phát âm của bạn...');
    setError('');
    try {
      const { base64, mimeType } = await recorder.stop();
      if (!base64) throw new Error('Không ghi được âm thanh.');
      const scored = await scoreDemoPronunciation({
        sentence_id: sentence.id,
        audio_base64: base64,
        mime_type: mimeType,
      });
      setResult(scored);
      setPhase('done');
      setLocked(true);
      setStatus('Đã có kết quả phát âm của bạn.');
      try {
        localStorage.setItem(DEMO_USED_KEY, JSON.stringify({ ts: Date.now(), result: scored, sentence }));
      } catch { /* localStorage đầy/chặn — bỏ qua, đây chỉ là guard UX */ }
    } catch (e) {
      setPhase('idle');
      setStatus('');
      setError(e.message || 'Không chấm được phát âm. Thử lại sau.');
    }
  }, [sentence]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setPhase('idle');
    setStatus('');
  }, []);

  const playModel = useCallback(() => {
    if (sentence?.hanzi) speak(sentence.hanzi, 0.8);
  }, [sentence]);

  return (
    <div className="hero-demo">
      <div className="hero-demo-head">
        <h3>Đọc thử một câu, nghe AI chấm phát âm</h3>
        <p className="hero-demo-sub">Ghi âm một câu tiếng Trung, AI phân tích cao độ và thanh điệu tức thì.</p>
      </div>

      <div className="hero-demo-card">
        {loadingSentence ? (
          <div className="hero-demo-loading"><Loader2 size={24} className="spin" /></div>
        ) : sentence ? (
          <>
            <div className="hero-demo-sentence">
              <div className="hero-demo-hanzi">{sentence.hanzi}</div>
              {sentence.pinyin && <div className="hero-demo-pinyin">{sentence.pinyin}</div>}
              {sentence.meaning_vi && <div className="hero-demo-meaning">{sentence.meaning_vi}</div>}
            </div>

            {/* Thông báo trạng thái cho screen reader. */}
            <p className="sr-only" aria-live="polite">{status}</p>

            {!locked && (
              <div className="hero-demo-actions">
                <button type="button" className="btn-secondary" onClick={playModel} disabled={phase === 'recording' || phase === 'scoring'}>
                  <Volume2 size={18} /> Nghe mẫu
                </button>

                {phase === 'idle' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={beginRecording}
                    disabled={!supported}
                    aria-label="Bắt đầu ghi âm để thử phát âm"
                  >
                    <Mic size={18} /> Thử nói ngay
                  </button>
                )}

                {phase === 'recording' && (
                  <>
                    <button type="button" className="btn-primary hero-demo-rec" onClick={finishRecording} aria-label="Dừng ghi âm và chấm điểm">
                      <Square size={18} /> Dừng & chấm
                    </button>
                    <button type="button" className="btn-secondary" onClick={cancelRecording} aria-label="Huỷ ghi âm">Huỷ</button>
                  </>
                )}

                {phase === 'scoring' && (
                  <button type="button" className="btn-primary" disabled>
                    <Loader2 size={18} className="spin" /> Đang chấm...
                  </button>
                )}
              </div>
            )}

            {!supported && phase === 'idle' && !locked && (
              <p className="hero-demo-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge mới nhất.</p>
            )}

            {result && phase === 'done' && (
              <div className="hero-demo-result">
                <div className="hero-demo-rings">
                  <ScoreRing value={result.score} label="Tổng điểm" suffix="/100" />
                  {result.tone_accuracy != null && (
                    <ScoreRing value={Math.round(result.tone_accuracy * 100)} label="Thanh điệu" />
                  )}
                </div>

                <PitchChart contour={result.user_f0_contour} ariaLabel={contourSummary(result)} />

                {result.tip && <p className="hero-demo-tip">{result.tip}</p>}

                <div className="hero-demo-gate">
                  <p>Đây mới là một câu. Tạo tài khoản miễn phí để luyện cả lộ trình HSK và lưu tiến độ.</p>
                  <button type="button" className="btn-primary" onClick={goRegister}>
                    <UserPlus size={18} /> Tạo tài khoản miễn phí để học tiếp
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="hero-demo-empty">
            <p>{error || 'Chưa tải được câu mẫu.'}</p>
            {!locked && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setError(''); setReloadKey(k => k + 1); }}
              >
                <RotateCcw size={18} /> Thử lại
              </button>
            )}
          </div>
        )}

        {error && sentence && (
          <p className="hero-demo-error" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
