import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Mic, Square, RotateCcw } from 'lucide-react';
import { getPracticeSentence, scorePronunciation } from '../api-core';
import { speak, stopSpeech } from '../speech.jsx';
import { isRecordingSupported, startRecording } from '../speech-ai.js';

const LEVELS = [1, 2, 3, 4, 5, 6];

// Feature 1 — Pronunciation practice (shadowing + scoring).
// Flow: AI plays a model reading via the existing speak() TTS, the user records
// a repeat, and Gemini transcribes it while pinyin_scorer scores deterministically.
export default function PronunciationPractice() {
  const [level, setLevel] = useState(1);
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const recorderRef = useRef(null);
  const supported = isRecordingSupported();

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError('');
      setResult(null);
      stopSpeech();
      try {
        const data = await getPracticeSentence(level);
        if (active) setTarget(data);
      } catch (e) {
        if (active) {
          setError(e.message || 'Không tải được câu luyện tập.');
          setTarget(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; stopSpeech(); };
  }, [level, reloadKey]);

  const playModel = useCallback(() => {
    if (!target?.hanzi) return;
    speak(target.hanzi, 0.8);
  }, [target]);

  const beginRecording = useCallback(async () => {
    setError('');
    setResult(null);
    stopSpeech();
    try {
      recorderRef.current = await startRecording();
      setRecording(true);
    } catch (e) {
      setError(e.message || 'Không truy cập được micro.');
    }
  }, []);

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setRecording(false);
    setScoring(true);
    setError('');
    try {
      const { base64, mimeType } = await recorder.stop();
      if (!base64) throw new Error('Không ghi được âm thanh.');
      const scored = await scorePronunciation({
        audio_base64: base64,
        mime_type: mimeType,
        target_hanzi: target.hanzi,
        target_pinyin: target.pinyin || '',
      });
      setResult(scored);
    } catch (e) {
      setError(e.message || 'Không chấm được phát âm.');
    } finally {
      setScoring(false);
    }
  }, [target]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const scoreClass = (score) => (score >= 85 ? 'pron-score--good' : score >= 60 ? 'pron-score--ok' : 'pron-score--low');

  return (
    <div className="pron-practice">
      <div className="pron-head">
        <h3>Luyện phát âm</h3>
        <p className="pron-sub">Nghe câu mẫu, lặp lại, AI chấm điểm âm và thanh điệu.</p>
        <div className="pron-levels">
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={lvl === level ? 'active' : ''}
              onClick={() => setLevel(lvl)}
              disabled={recording || scoring}
            >
              HSK {lvl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="pron-loading"><Loader2 className="spin" size={22} /> Đang tải...</div>
      ) : target ? (
        <div className="pron-card">
          <div className="pron-hanzi">{target.hanzi}</div>
          {target.pinyin && <div className="pron-pinyin">{target.pinyin}</div>}
          {target.meaning_vi && <div className="pron-meaning">{target.meaning_vi}</div>}

          <div className="pron-actions">
            <button type="button" className="btn-secondary" onClick={playModel} disabled={recording || scoring}>
              <Headphones size={18} /> Nghe mẫu
            </button>

            {!recording ? (
              <button type="button" className="btn-primary" onClick={beginRecording} disabled={!supported || scoring}>
                <Mic size={18} /> Ghi âm
              </button>
            ) : (
              <>
                <button type="button" className="btn-primary pron-recording" onClick={finishRecording}>
                  <Square size={18} /> Dừng & chấm
                </button>
                <button type="button" className="btn-secondary" onClick={cancelRecording}>Hủy</button>
              </>
            )}

            <button type="button" className="btn-secondary" onClick={reload} disabled={recording || scoring}>
              <RotateCcw size={18} /> Câu khác
            </button>
          </div>

          {!supported && <p className="pron-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</p>}
          {scoring && <div className="pron-loading"><Loader2 className="spin" size={20} /> AI đang nghe và chấm...</div>}
          {error && <p className="pron-error">{error}</p>}

          {result && (
            <div className="pron-result">
              <div className={`pron-score ${scoreClass(result.score)}`}>
                <strong>{result.score}</strong><span>/100</span>
              </div>
              <div className="pron-result-body">
                {result.tone_accuracy != null && (
                  <p className="pron-line"><b>Độ chuẩn thanh điệu:</b> {Math.round(result.tone_accuracy * 100)}%
                    <small className="pron-muted"> (phân tích cao độ F0)</small>
                  </p>
                )}
                <p className="pron-line"><b>Bạn đọc:</b> {result.actual_hanzi || '—'} <i>{result.actual_pinyin}</i></p>
                <p className="pron-line"><b>Mục tiêu:</b> {result.target_hanzi} <i>{result.target_pinyin}</i></p>
                {result.detailed_feedback && <p className="pron-tip pron-tip--dsp">{result.detailed_feedback}</p>}
                {result.tip && <p className="pron-tip">{result.tip}</p>}
                {result.tone_syllables?.length > 0 && (
                  <div className="pron-errs">
                    <b>Thanh điệu từng âm tiết:</b>
                    <ul>
                      {result.tone_syllables.map((ts, i) => (
                        <li key={`ts${i}`} className={ts.ok ? 'pron-syl--ok' : 'pron-syl--bad'}>
                          Âm tiết {ts.pos + 1} · thanh {ts.tone}: {ts.ok ? 'đạt' : 'cần sửa'}
                          {ts.feedback ? ` — ${ts.feedback}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.tone_errors?.length > 0 && (
                  <div className="pron-errs">
                    <b>Lỗi thanh điệu:</b>
                    <ul>
                      {result.tone_errors.map((te, i) => (
                        <li key={`t${i}`}>{te.syllable}: thanh {te.expected_tone} → đọc thành thanh {te.got_tone}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.syllable_errors?.length > 0 && (
                  <div className="pron-errs">
                    <b>Lỗi âm tiết:</b>
                    <ul>
                      {result.syllable_errors.map((se, i) => (
                        <li key={`s${i}`}>
                          {se.type === 'missing' ? `Thiếu: ${se.expected}` : se.type === 'extra' ? `Thừa: ${se.got}` : `Sai: ${se.got} (đúng: ${se.expected})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="pron-error">{error || 'Chưa có dữ liệu.'}</p>
      )}
    </div>
  );
}
