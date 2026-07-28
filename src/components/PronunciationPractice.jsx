import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Mic, Square, RotateCcw, X, Volume2 } from 'lucide-react';
import { getPracticeSentence, scorePronunciation } from '../api-core';
import { speak, speakFeedback, stopSpeech } from '../speech.jsx';
import { isRecordingSupported, startRecording } from '../speech-ai.js';
import Waveform from './Pronunciation/Waveform.jsx';
import ScoreRing from './Pronunciation/ScoreRing.jsx';
import HskLevelPicker from './HskLevelPicker.jsx';
import { ALL_LEVELS, normalizeLevels, effectiveLevels } from '../hsk-levels.js';

// Mỗi câu luyện phát âm chỉ thuộc MỘT cấp (backend trả một câu/level). Khi người
// dùng chọn nhiều cấp, mỗi lần tải câu ta rút NGẪU NHIÊN một cấp trong tập đã chọn.
function pickLevel(levels) {
  const pool = effectiveLevels(levels);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Gộp phản hồi âm học (DSP) + gợi ý sửa lỗi thành một câu để đọc lên.
function feedbackSpeech(result) {
  return [result?.detailed_feedback, result?.tip].filter(Boolean).join('. ');
}

// Feature 1 — Pronunciation practice (shadowing + scoring).
// Flow: AI plays a model reading via the existing speak() TTS, the user records
// a repeat, and Gemini transcribes it while pinyin_scorer scores deterministically.
export default function PronunciationPractice({ focusLevels }) {
  // levels = MẢNG cấp đã chọn. Rỗng => tất cả (pickLevel xử lý).
  const [levels, setLevels] = useState(() => normalizeLevels(focusLevels));
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
        const data = await getPracticeSentence(pickLevel(levels));
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
  }, [levels, reloadKey]);

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
      // Tự động đọc phản hồi. Cú bấm "Dừng & chấm" là user gesture đã mở khóa
      // audio nên autoplay không bị trình duyệt chặn.
      const speech = feedbackSpeech(scored);
      if (speech) speakFeedback(speech);
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

  return (
    <div className="pron-practice">
      <div className="pron-head">
        <h3>Luyện phát âm</h3>
        <p className="pron-sub">Nghe câu mẫu, lặp lại, AI chấm điểm âm và thanh điệu.</p>
        <HskLevelPicker
          value={levels}
          onChange={setLevels}
          levels={ALL_LEVELS}
          variant="card"
          showAll
          allowEmpty
          disabled={recording || scoring}
          className="pron-levels"
          buttonClassName="level-button"
          ariaLabel="Chọn cấp HSK luyện phát âm"
        />
      </div>

      {loading ? (
        <div className="pron-card skeleton-card" aria-hidden="true">
          <div className="skeleton skeleton-line skeleton-line--lg" style={{ margin: '0 auto 16px', width: '40%' }} />
          <div className="skeleton skeleton-line skeleton-line--sm" style={{ margin: '0 auto 24px', width: '24%' }} />
          <div className="pron-actions">
            <div className="skeleton skeleton-line" style={{ width: 120, height: 42 }} />
            <div className="skeleton skeleton-line" style={{ width: 120, height: 42 }} />
            <div className="skeleton skeleton-line" style={{ width: 120, height: 42 }} />
          </div>
        </div>
      ) : target ? (
        <div className="pron-card">
          <div className="pron-hanzi">{target.hanzi}</div>
          {target.pinyin && <div className="pron-pinyin">{target.pinyin}</div>}
          {target.meaning_vi && <div className="pron-meaning">{target.meaning_vi}</div>}

          {recording ? (
            <Waveform active />
          ) : (
            !supported && <p className="pron-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</p>
          )}

          <div className="pron-actions">
            <button type="button" className="btn-secondary" onClick={playModel} disabled={recording || scoring}>
              <Headphones size={18} /> Nghe mẫu
            </button>

            {!recording ? (
              <button type="button" className="btn-primary" onClick={beginRecording} disabled={!supported || scoring}>
                <Mic size={18} /> {scoring ? 'Đang chấm...' : 'Ghi âm'}
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

          {scoring && (
            <div className="pron-scoring-skeleton" aria-label="Đang chấm điểm">
              <div className="pron-rings">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton" style={{ width: 92, height: 92, borderRadius: '50%' }} />
                ))}
              </div>
              <p className="pron-muted">AI đang nghe và chấm phát âm của bạn...</p>
            </div>
          )}

          {result && !scoring && (
            <div className="pron-result">
              <div className="pron-rings">
                <ScoreRing value={result.score} label="Tổng điểm" suffix="/100" />
                <ScoreRing value={result.identity_score} label="Độ chuẩn âm" />
                {result.tone_accuracy != null && (
                  <ScoreRing value={Math.round(result.tone_accuracy * 100)} label="Thanh điệu" />
                )}
              </div>

              <div className="pron-result-body">
                <p className="pron-line"><b>Bạn đọc:</b> {result.actual_hanzi || '-'} <i>{result.actual_pinyin}</i></p>
                <p className="pron-line"><b>Mục tiêu:</b> {result.target_hanzi} <i>{result.target_pinyin}</i></p>
                {(result.detailed_feedback || result.tip) && (
                  <div className="pron-tip-block">
                    {result.detailed_feedback && <p className="pron-tip pron-tip--dsp">{result.detailed_feedback}</p>}
                    {result.tip && <p className="pron-tip">{result.tip}</p>}
                    <button
                      type="button"
                      className="btn-secondary pron-tip-speak"
                      onClick={() => speakFeedback(feedbackSpeech(result))}
                    >
                      <Volume2 size={16} /> Nghe phản hồi
                    </button>
                  </div>
                )}
                {(result.fluency || result.prosody) && (
                  <div className="pron-macro">
                    {result.fluency && (
                      <span className="pron-macro-chip" title="Tốc độ nói và số lần ngắt nghỉ">
                        Lưu loát: {result.fluency.speech_rate} âm tiết/giây
                        {result.fluency.pause_count > 0 ? ` · ${result.fluency.pause_count} lần ngắt` : ' · liền mạch'}
                      </span>
                    )}
                    {result.prosody && (
                      <span className="pron-macro-chip" title="Độ rộng cao độ cả câu (semitone)">
                        Ngữ điệu: {result.prosody.pitch_range_semitones} st
                      </span>
                    )}
                  </div>
                )}
                {result.tone_syllables?.length > 0 && (
                  <div className="pron-errs">
                    <b>Thanh điệu từng âm tiết:</b>
                    <ul>
                      {result.tone_syllables.map((ts, i) => (
                        <li key={`ts${i}`} className={ts.ok ? 'pron-syl--ok' : 'pron-syl--bad'}>
                          Âm tiết {ts.pos + 1} · thanh {ts.tone}: {ts.ok ? 'đạt' : 'cần sửa'}
                          {ts.feedback ? `: ${ts.feedback}` : ''}
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
        <div className="pron-card pron-empty">
          <p className="pron-muted">{error ? 'Không tải được câu luyện tập.' : 'Chưa có dữ liệu.'}</p>
          <button type="button" className="btn-secondary" onClick={reload}>
            <RotateCcw size={18} /> Thử lại
          </button>
        </div>
      )}

      {error && (
        <div className="speech-toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Đóng"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
