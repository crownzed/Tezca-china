import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, Volume2, Trash2 } from 'lucide-react';
import { voiceChat } from '../api-core';
import { speak, stopSpeech } from '../speech.jsx';
import { isRecordingSupported, startRecording } from '../speech-ai.js';

// Feature 2 — turn-based voice chat.
// Flow: user records an utterance -> Gemini hears it, understands, and replies
// in Chinese (one call) -> the reply is spoken via the existing speak() TTS.
// The API key never reaches the client; the browser only talks to our backend.
export default function VoiceChat() {
  const [turns, setTurns] = useState([]); // { role: 'user'|'model', cn, vi }
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const scrollRef = useRef(null);
  const supported = isRecordingSupported();

  useEffect(() => () => stopSpeech(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  const beginRecording = useCallback(async () => {
    setError('');
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
    setThinking(true);
    setError('');
    try {
      const { base64, mimeType } = await recorder.stop();
      if (!base64) throw new Error('Không ghi được âm thanh.');
      // Send a bounded text history so the model keeps context across turns.
      const history = turns.map((t) => ({ role: t.role, text: t.cn }));
      const reply = await voiceChat({ audio_base64: base64, mime_type: mimeType, history });
      setTurns((prev) => [
        ...prev,
        { role: 'user', cn: reply.user_text || '…', vi: '' },
        { role: 'model', cn: reply.reply_cn || '', vi: reply.reply_vi || '' },
      ]);
      if (reply.reply_cn) speak(reply.reply_cn, 0.82);
    } catch (e) {
      setError(e.message || 'Không nhận được phản hồi.');
    } finally {
      setThinking(false);
    }
  }, [turns]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const clearChat = useCallback(() => {
    stopSpeech();
    setTurns([]);
    setError('');
  }, []);

  return (
    <div className="vchat">
      <div className="vchat-head">
        <h3>Trò chuyện bằng giọng nói</h3>
        <p className="vchat-sub">Nói một câu tiếng Trung, AI nghe và trả lời. Bấm loa để nghe lại.</p>
      </div>

      <div className="vchat-log" ref={scrollRef}>
        {turns.length === 0 && !thinking && (
          <p className="vchat-empty">Bấm "Ghi âm" rồi nói một câu tiếng Trung để bắt đầu.</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`vchat-turn vchat-turn--${t.role}`}>
            <div className="vchat-bubble">
              <span className="vchat-cn">{t.cn}</span>
              {t.vi && <span className="vchat-vi">{t.vi}</span>}
            </div>
            {t.role === 'model' && t.cn && (
              <button type="button" className="vchat-replay" onClick={() => { stopSpeech(); speak(t.cn, 0.82); }} title="Nghe lại">
                <Volume2 size={16} />
              </button>
            )}
          </div>
        ))}
        {thinking && <div className="vchat-turn vchat-turn--model"><div className="vchat-bubble"><Loader2 className="spin" size={18} /> AI đang nghe...</div></div>}
      </div>

      {!supported && <p className="vchat-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</p>}
      {error && <p className="vchat-error">{error}</p>}

      <div className="vchat-actions">
        {!recording ? (
          <button type="button" className="btn-primary" onClick={beginRecording} disabled={!supported || thinking}>
            <Mic size={18} /> Ghi âm
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary vchat-recording" onClick={finishRecording}>
              <Square size={18} /> Dừng & gửi
            </button>
            <button type="button" className="btn-secondary" onClick={cancelRecording}>Hủy</button>
          </>
        )}
        {turns.length > 0 && (
          <button type="button" className="btn-secondary" onClick={clearChat} disabled={recording || thinking}>
            <Trash2 size={18} /> Xóa hội thoại
          </button>
        )}
      </div>
    </div>
  );
}
