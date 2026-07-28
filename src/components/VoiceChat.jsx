import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, X, RotateCcw, Volume2 } from 'lucide-react';
import { voiceChat, getConversationScenarios } from '../api-core';
import { speakEleven, stopSpeech } from '../speech.jsx';
import { isRecordingSupported, startRecording } from '../speech-ai.js';
import ChatBubble from './Conversation/ChatBubble.jsx';
import TypingIndicator from './Conversation/TypingIndicator.jsx';
import { ensureHanziIndex } from './Conversation/hanzi-lookup.js';
import HskLevelPicker from './HskLevelPicker.jsx';
import { ALL_LEVELS, normalizeLevels, levelMatches } from '../hsk-levels.js';

// Feature 2 — turn-based voice chat.
// Flow: người học chọn một KỊCH BẢN (conversation bank ở backend) -> ghi âm một
// lượt -> Gemini nghe, hiểu và đáp lại đúng vai trong một call -> câu trả lời
// được đọc bằng speakEleven. API key không bao giờ ra tới client.
//
// Vì sao phải chọn kịch bản: prompt chung làm model nói như sách giáo khoa (mỗi
// lượt một câu hỏi mới, không vai, không tình huống). Kịch bản cấp cho model vai
// diễn, hoàn cảnh, nhịp thoại mẫu và nước đi cứu hội thoại — nên ta gửi kèm
// scenario_id ở MỌI lượt để model không tuột vai giữa cuộc.
const REGISTER_LABEL = {
  casual: 'Thân mật',
  service: 'Mua bán / dịch vụ',
  formal: 'Lịch sự',
};

export default function VoiceChat({ focusLevels }) {
  // levels = MẢNG cấp đã chọn, rỗng = tất cả. Bank chỉ có ~6 kịch bản nên ta tải
  // một lần rồi lọc tại client: đổi cấp không cần gọi lại API.
  const [levels, setLevels] = useState(() => normalizeLevels(focusLevels));
  const [scenarios, setScenarios] = useState([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [active, setActive] = useState(null); // kịch bản đang diễn
  const [turns, setTurns] = useState([]); // { role: 'user'|'model', cn, vi }
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [indexReady, setIndexReady] = useState(false);
  const recorderRef = useRef(null);
  const scrollRef = useRef(null);
  const supported = isRecordingSupported();

  useEffect(() => () => stopSpeech(), []);

  // Dựng chỉ mục tra cứu pinyin/nghĩa theo từng chữ Hán cho tooltip (1 lần).
  useEffect(() => {
    let active2 = true;
    ensureHanziIndex().then(() => { if (active2) setIndexReady(true); });
    return () => { active2 = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    getConversationScenarios()
      .then((list) => { if (alive) setScenarios(Array.isArray(list) ? list : []); })
      .catch((e) => { if (alive) setError(e.message || 'Không tải được danh sách tình huống.'); })
      .finally(() => { if (alive) setLoadingScenarios(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  // Mở màn bằng chính câu opening của kịch bản: người học có cái để đáp lại ngay
  // thay vì phải tự bắt đầu, và lượt này cũng vào history nên model biết mình
  // vừa nói gì.
  const startScenario = useCallback((scenario) => {
    stopSpeech();
    setError('');
    setActive(scenario);
    const cn = scenario?.opening?.cn || '';
    const vi = scenario?.opening?.vi || '';
    setTurns(cn ? [{ role: 'model', cn, vi }] : []);
    if (cn) speakEleven(cn, 0.82);
  }, []);

  const exitScenario = useCallback(() => {
    stopSpeech();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setActive(null);
    setTurns([]);
    setError('');
  }, []);

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
      const reply = await voiceChat({
        audio_base64: base64,
        mime_type: mimeType,
        history,
        // Gửi lại scenario_id mỗi lượt: service là stateless, không có
        // scenario_id thì nó rơi về prompt chung và AI tuột vai giữa cuộc.
        scenario_id: active?.scenario_id || '',
        hsk_level: active?.hsk_level || 0,
      });
      setTurns((prev) => [
        ...prev,
        { role: 'user', cn: reply.user_text || '…', vi: '' },
        { role: 'model', cn: reply.reply_cn || '', vi: reply.reply_vi || '' },
      ]);
      if (reply.reply_cn) speakEleven(reply.reply_cn, 0.82);
    } catch (e) {
      setError(e.message || 'Không nhận được phản hồi.');
    } finally {
      setThinking(false);
    }
  }, [turns, active]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const restartScenario = useCallback(() => {
    if (active) startScenario(active);
  }, [active, startScenario]);

  // Lọc theo cấp đã chọn (rỗng = tất cả). levelMatches xử lý luôn trường hợp
  // rỗng nên không cần nhánh riêng.
  const visible = scenarios.filter((s) => levelMatches(levels, s.hsk_level));

  const errorToast = error ? (
    <div className="speech-toast" role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="Đóng"><X size={15} /></button>
    </div>
  ) : null;

  // --- Màn chọn tình huống ---------------------------------------------------
  if (!active) {
    return (
      <div className="vchat">
        <div className="vchat-head">
          <h3>Trò chuyện bằng giọng nói</h3>
          <p className="vchat-sub">Chọn một tình huống. AI sẽ nhập vai và nói tiếng Trung tự nhiên như người thật, không giảng bài.</p>
          <HskLevelPicker
            value={levels}
            onChange={setLevels}
            levels={ALL_LEVELS}
            variant="card"
            showAll
            allowEmpty
            className="pron-levels"
            buttonClassName="level-button"
            ariaLabel="Chọn cấp HSK cho tình huống hội thoại"
          />
        </div>

        {loadingScenarios ? (
          <div className="vchat-scenarios" aria-hidden="true">
            <span className="skeleton vchat-scenario-sk" />
            <span className="skeleton vchat-scenario-sk" />
            <span className="skeleton vchat-scenario-sk" />
          </div>
        ) : visible.length === 0 ? (
          <p className="vchat-empty">
            {scenarios.length === 0
              ? 'Chưa có tình huống nào. Hãy thử tải lại trang.'
              : 'Không có tình huống ở cấp đã chọn. Chọn cấp khác hoặc bấm "Tất cả".'}
          </p>
        ) : (
          <div className="vchat-scenarios" role="list">
            {visible.map((s) => (
              <button
                key={s.scenario_id}
                type="button"
                role="listitem"
                className="vchat-scenario"
                onClick={() => startScenario(s)}
              >
                <span className="vchat-scenario-top">
                  <span className="vchat-badge">HSK {s.hsk_level}</span>
                  <span className="vchat-register">{REGISTER_LABEL[s.register] || s.register}</span>
                </span>
                <strong className="vchat-scenario-role">Bạn nói với: {s.ai_name}</strong>
                <span className="vchat-scenario-setting">{s.setting}</span>
                <span className="vchat-scenario-goal">Mục tiêu: {s.goal}</span>
              </button>
            ))}
          </div>
        )}

        {!supported && <p className="vchat-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</p>}
        {errorToast}
      </div>
    );
  }

  // --- Màn hội thoại --------------------------------------------------------
  return (
    <div className="vchat">
      <div className="vchat-head">
        <h3>Trò chuyện bằng giọng nói</h3>
        <p className="vchat-sub">Nói một câu tiếng Trung, AI đáp lại đúng vai. Bấm loa để nghe lại, chạm vào chữ Hán để xem pinyin.</p>
      </div>

      <div className="vchat-brief">
        <div className="vchat-brief-top">
          <span className="vchat-badge">HSK {active.hsk_level}</span>
          <span className="vchat-register">{REGISTER_LABEL[active.register] || active.register}</span>
          <button type="button" className="btn-secondary vchat-brief-exit" onClick={exitScenario}>
            Đổi tình huống
          </button>
        </div>
        <p className="vchat-brief-setting">{active.setting}</p>
        <p className="vchat-brief-line"><strong>Bạn là:</strong> {active.user_role}</p>
        <p className="vchat-brief-line"><strong>Mục tiêu:</strong> {active.goal}</p>
        {active.key_vocab?.length > 0 && (
          <ul className="vchat-vocab">
            {active.key_vocab.map((w) => (
              <li key={w.hanzi} className="vchat-vocab-item">
                <button
                  type="button"
                  className="vchat-vocab-say"
                  onClick={() => { stopSpeech(); speakEleven(w.hanzi, 0.82); }}
                  aria-label={`Nghe ${w.hanzi}`}
                >
                  <Volume2 size={13} />
                </button>
                <span className="vchat-vocab-hanzi">{w.hanzi}</span>
                <span className="vchat-vocab-pinyin">{w.pinyin}</span>
                <span className="vchat-vocab-vi">{w.meaning_vi}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="vchat-log" ref={scrollRef}>
        {turns.length === 0 && !thinking && (
          <p className="vchat-empty">Bấm "Ghi âm" rồi nói một câu tiếng Trung để bắt đầu.</p>
        )}
        {turns.map((t, i) => (
          <ChatBubble
            key={i}
            role={t.role}
            cn={t.cn}
            vi={t.vi}
            enableTooltip={indexReady}
            onReplay={t.role === 'model' && t.cn ? () => { stopSpeech(); speakEleven(t.cn, 0.82); } : undefined}
          />
        ))}
        {thinking && (
          <div className="chat-row chat-row--ai">
            <div className="chat-bubble2 chat-bubble2--ai">
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>

      <div className="vchat-actions">
        {!recording ? (
          <button type="button" className="btn-primary" onClick={beginRecording} disabled={!supported || thinking}>
            <Mic size={18} /> {thinking ? 'AI đang trả lời...' : 'Ghi âm'}
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary vchat-recording" onClick={finishRecording}>
              <Square size={18} /> Dừng & gửi
            </button>
            <button type="button" className="btn-secondary" onClick={cancelRecording}>Hủy</button>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={restartScenario} disabled={recording || thinking}>
          <RotateCcw size={18} /> Nói lại từ đầu
        </button>
        {turns.length > 0 && (
          <button type="button" className="btn-secondary" onClick={exitScenario} disabled={recording || thinking}>
            <Trash2 size={18} /> Kết thúc
          </button>
        )}
      </div>

      {!supported && <p className="vchat-warn">Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</p>}
      {errorToast}
    </div>
  );
}
