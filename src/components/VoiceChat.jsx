import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Compass,
  Languages,
  MessageCircle,
  Mic,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { streamVoiceChat } from '../api-core';
import { beginSpeechQueue, setSpeechQueueStreaming, speakEleven, speakQueued, stopSpeech } from '../speech.jsx';
import { isRecordingSupported, startRecording, VOICE_MAX_RECORDING_SEC } from '../speech-ai.js';
import ChatBubble from './Conversation/ChatBubble.jsx';
import TypingIndicator from './Conversation/TypingIndicator.jsx';
import { ensureHanziIndex } from './Conversation/hanzi-lookup.js';
import './Conversation/conversation.css';

const AUTO_SPEAK_KEY = 'tezcaChatAutoSpeak';
const SPEECH_RATE_KEY = 'tezcaChatSpeechRate';
const SHOW_PINYIN_KEY = 'tezcaChatShowPinyin';
const SHOW_VI_KEY = 'tezcaChatShowVi';

const SPEECH_RATES = [
  { value: 0.72, label: '0.72x · Chậm dễ nghe' },
  { value: 0.82, label: '0.82x · Tự nhiên chuẩn' },
  { value: 0.95, label: '0.95x · Nhanh lưu loát' },
];

export const CONVERSATION_SCENARIOS = [
  {
    id: 'cafe',
    title: 'Quán cà phê & Trà sữa',
    icon: '☕',
    tag: 'HSK 1-2',
    starterCn: '我想点一杯珍珠奶茶，半糖少冰。',
    starterVi: 'Tôi muốn gọi một ly trà sữa trân châu, nửa đường ít đá.',
    description: 'Gọi đồ uống, hỏi độ ngọt, lượng đá và thanh toán.',
  },
  {
    id: 'restaurant',
    title: 'Nhà hàng ẩm thực',
    icon: '🍜',
    tag: 'HSK 2-3',
    starterCn: '服务员，请给我们看一下菜单，有什么特色菜吗？',
    starterVi: 'Phục vụ ơi, cho xem thực đơn, có món gì đặc sắc không?',
    description: 'Hỏi món ngon đặc sản, dặn khẩu vị ít cay và gọi tính tiền.',
  },
  {
    id: 'shopping',
    title: 'Mua sắm & Mặc cả',
    icon: '🛍️',
    tag: 'HSK 2-3',
    starterCn: '老板，这件衣服有点大，有小一号的吗？可以便宜点吗？',
    starterVi: 'Ông chủ ơi, áo này hơi rộng, có cỡ nhỏ hơn không? Bớt chút được không?',
    description: 'Hỏi giá tiền, đổi kích cỡ, thương lượng giảm giá.',
  },
  {
    id: 'taxi',
    title: 'Taxi & Hỏi đường',
    icon: '🚕',
    tag: 'HSK 1-2',
    starterCn: '师傅，我要去王府井大街，大概需要多长时间？',
    starterVi: 'Bác tài, tôi muốn đến phố Vương Phủ Tỉnh, khoảng bao lâu thì tới?',
    description: 'Nói điểm đến, hỏi thời gian, chi phí và chỉ hướng đi.',
  },
  {
    id: 'friends',
    title: 'Gặp gỡ & Kết bạn',
    icon: '👋',
    tag: 'HSK 1-2',
    starterCn: '你好！我是从越南来的留学生，很高兴认识你。',
    starterVi: 'Xin chào! Tôi là du học sinh đến từ Việt Nam, rất vui được làm quen.',
    description: 'Tự giới thiệu tên tuổi, quê quán, sở thích và trường học.',
  },
  {
    id: 'interview',
    title: 'Phỏng vấn & Công sở',
    icon: '💼',
    tag: 'HSK 3-4',
    starterCn: '您好！今天非常感谢您给我这次面试的机会。',
    starterVi: 'Chào bạn! Hôm nay rất cảm ơn bạn đã cho tôi cơ hội phỏng vấn này.',
    description: 'Chào hỏi trang trọng, nói về kinh nghiệm và định hướng nghề nghiệp.',
  },
];

export const QUICK_PROMPTS = [
  { cn: '请用简单的HSK 1-2词汇和我练习。', vi: 'Hãy dùng từ vựng HSK 1-2 đơn giản luyện tập với tôi.' },
  { cn: '如果我句子有错误，请帮我指出来并纠正。', vi: 'Nếu câu tôi có lỗi, xin hãy chỉ ra và sửa giúp tôi.' },
  { cn: '今天北京天气怎么样？', vi: 'Hôm nay thời tiết Bắc Kinh thế nào?' },
  { cn: '你能用中文向我提一个日常问题吗？', vi: 'Bạn có thể dùng tiếng Trung hỏi tôi 1 câu thường ngày không?' },
];

function readStoredBoolean(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function readStoredRate() {
  try {
    const value = Number(window.localStorage.getItem(SPEECH_RATE_KEY));
    return SPEECH_RATES.some((item) => item.value === value) ? value : 0.82;
  } catch {
    return 0.82;
  }
}

const HISTORY_TURNS_SENT = 8;

function buildHistory(turns) {
  return turns.slice(-HISTORY_TURNS_SENT).map((turn) => ({ role: turn.role, text: turn.cn }));
}

export default function VoiceChat() {
  const [turns, setTurns] = useState([]); // { role: 'user'|'model', cn, vi, isVoice }
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [indexReady, setIndexReady] = useState(false);

  // Studio Toggles & State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState(null);
  const [showPinyin, setShowPinyin] = useState(() => readStoredBoolean(SHOW_PINYIN_KEY, true));
  const [showVi, setShowVi] = useState(() => readStoredBoolean(SHOW_VI_KEY, true));
  const [autoSpeak, setAutoSpeak] = useState(() => readStoredBoolean(AUTO_SPEAK_KEY, true));
  const [speechRate, setSpeechRate] = useState(readStoredRate);
  const [playingState, setPlayingState] = useState(null); // { text, speed }

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const recorderRef = useRef(null);
  const mountedRef = useRef(true);
  const finishRecordingRef = useRef(null);
  const supported = isRecordingSupported();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    ensureHanziIndex().then(() => {
      if (alive) setIndexReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns, thinking]);

  useEffect(() => {
    if (!recordingStartedAt) return undefined;
    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
      setRecordingDuration(elapsed);
      if (elapsed >= VOICE_MAX_RECORDING_SEC) {
        window.clearInterval(timer);
        setNote(`Đã tự dừng ở ${VOICE_MAX_RECORDING_SEC} giây — đang xử lý đoạn vừa nói.`);
        finishRecordingRef.current?.();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recordingStartedAt]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? '1' : '0');
      window.localStorage.setItem(SPEECH_RATE_KEY, String(speechRate));
      window.localStorage.setItem(SHOW_PINYIN_KEY, showPinyin ? '1' : '0');
      window.localStorage.setItem(SHOW_VI_KEY, showVi ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [autoSpeak, speechRate, showPinyin, showVi]);

  const clearChat = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    stopSpeech();
    setTurns([]);
    setDraft('');
    setThinking(false);
    setRecording(false);
    setRecordingStartedAt(null);
    setRecordingDuration(0);
    setNote('');
    setError('');
    setActiveScenario(null);
    setPlayingState(null);
    inputRef.current?.focus();
  }, []);

  const handleReplay = useCallback((text, speed = 0.82) => {
    if (!text) return;
    stopSpeech();
    setPlayingState({ text, speed });
    speakEleven(text, speed);
    const estDurationMs = Math.max(2000, (text.length * 350) / speed);
    setTimeout(() => {
      setPlayingState(null);
    }, estDurationMs);
  }, []);

  const runStreamTurn = useCallback(
    async (payload, { userAlreadyShown, isVoiceTurn = false }) => {
      let userShown = userAlreadyShown;
      if (autoSpeak) {
        beginSpeechQueue();
        // Hội thoại phát qua /tts/stream (MP3 theo khối) thay vì /tts (trọn file).
        // Đo thật: byte đầu về sau ~1.2s so với ~3.7-4.4s, tức nhanh hơn ~2.5s mỗi câu.
        // Không bật thì giữa hai câu liên tiếp người học nghe khoảng lặng ~3s — chính
        // là "đứt quãng" đã báo.
        setSpeechQueueStreaming(true);
      }

      const done = await streamVoiceChat(payload, (event) => {
        if (event.type === 'transcript') {
          const said = String(event.user_text || '').trim();
          if (said && !userShown) {
            userShown = true;
            setTurns((previous) => [
              ...previous,
              { role: 'user', cn: said, vi: '', isVoice: isVoiceTurn },
            ]);
          }
        } else if (event.type === 'sentence') {
          if (autoSpeak) speakQueued(String(event.text || ''), speechRate);
        }
      });

      const replyCn = String(done.reply_cn || '').trim();
      if (!replyCn) throw new Error('AI không trả về nội dung.');
      setTurns((previous) => [
        ...(userShown
          ? previous
          : [
              ...previous,
              {
                role: 'user',
                cn: String(done.user_text || '').trim() || '…',
                vi: '',
                isVoice: isVoiceTurn,
              },
            ]),
        { role: 'model', cn: replyCn, vi: String(done.reply_vi || '').trim() },
      ]);
      return done;
    },
    [autoSpeak, speechRate]
  );

  const sendTextWithContent = useCallback(
    async (content) => {
      const message = String(content || '').trim();
      if (!message || thinking || recording) return;

      const history = buildHistory(turns);
      setDraft('');
      setError('');
      setNote('');
      stopSpeech();
      setTurns((previous) => [...previous, { role: 'user', cn: message, vi: '', isVoice: false }]);
      setThinking(true);

      try {
        await runStreamTurn(
          { audio_base64: '', mime_type: 'text/plain', text: message, history },
          { userAlreadyShown: true, isVoiceTurn: false }
        );
        setNote('AI đã phản hồi bằng tiếng Trung kèm phiên âm và nghĩa tiếng Việt.');
      } catch (caught) {
        setError(caught.message || 'Không nhận được phản hồi từ AI.');
      } finally {
        setThinking(false);
        inputRef.current?.focus();
      }
    },
    [recording, runStreamTurn, thinking, turns]
  );

  const sendText = useCallback(() => {
    sendTextWithContent(draft);
  }, [draft, sendTextWithContent]);

  const handleSelectScenario = useCallback(
    (scenario) => {
      setActiveScenario(scenario);
      setScenariosOpen(false);
      sendTextWithContent(scenario.starterCn);
    },
    [sendTextWithContent]
  );

  const beginRecording = useCallback(async () => {
    if (!supported || thinking || recording) return;
    setError('');
    setNote('');
    stopSpeech();
    try {
      const recorder = await startRecording();
      if (!mountedRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = recorder;
      setRecordingDuration(0);
      setRecordingStartedAt(Date.now());
      setRecording(true);
    } catch (caught) {
      setError(caught.message || 'Không truy cập được micro.');
    }
  }, [recording, supported, thinking]);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.cancel();
      recorderRef.current = null;
    }
    setRecording(false);
    setRecordingStartedAt(null);
    setRecordingDuration(0);
    setNote('Đã hủy lượt ghi âm.');
  }, []);

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || thinking) return;
    recorderRef.current = null;
    setRecording(false);
    setRecordingStartedAt(null);
    setRecordingDuration(0);
    setThinking(true);
    setError('');
    setNote('');

    try {
      const { base64, mimeType } = await recorder.stop();
      if (!base64) throw new Error('Không ghi được âm thanh.');
      const history = buildHistory(turns);

      await runStreamTurn(
        { audio_base64: base64, mime_type: mimeType, text: '', history },
        { userAlreadyShown: false, isVoiceTurn: true }
      );
      setNote('Giọng nói của bạn đã được chép thành chữ và AI đã phản hồi.');
    } catch (caught) {
      setError(caught.message || 'Không nhận được phản hồi từ micro.');
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [runStreamTurn, thinking, turns]);

  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

  const formatRecDuration = (sec) => {
    const mins = String(Math.floor(sec / 60)).padStart(2, '0');
    const secs = String(sec % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <section className="cv-studio" aria-label="Studio Hội thoại AI">
      {/* 1. Header & Quick Toolbar */}
      <header className="cv-header">
        <div className="cv-tutor-profile">
          <div className="cv-tutor-avatar" aria-hidden="true">
            <Bot size={24} />
            <span className="cv-tutor-pulse" />
          </div>
          <div className="cv-tutor-info">
            <h3>
              <span>Tezca AI Tutor</span>
              <span className="cv-tutor-badge">
                {activeScenario ? activeScenario.title : 'Hội thoại tự do'}
              </span>
            </h3>
            <p className="cv-tutor-status">
              <span className="dot" />
              <span>Trực tuyến · Sẵn sàng luyện khẩu ngữ</span>
            </p>
          </div>
        </div>

        <div className="cv-toolbar">
          <button
            type="button"
            className={`cv-btn-tool${showPinyin ? ' is-active' : ''}`}
            onClick={() => setShowPinyin((prev) => !prev)}
            title={showPinyin ? 'Tắt hiển thị Pinyin' : 'Bật hiển thị Pinyin'}
            aria-pressed={showPinyin}
          >
            <Languages size={15} />
            <span>Pinyin: {showPinyin ? 'Bật' : 'Tắt'}</span>
          </button>

          <button
            type="button"
            className={`cv-btn-tool${showVi ? ' is-active' : ''}`}
            onClick={() => setShowVi((prev) => !prev)}
            title={showVi ? 'Tắt dịch tiếng Việt' : 'Bật dịch tiếng Việt'}
            aria-pressed={showVi}
          >
            <Sparkles size={14} />
            <span>Dịch: {showVi ? 'Bật' : 'Tắt'}</span>
          </button>

          <button
            type="button"
            className={`cv-btn-tool${scenariosOpen ? ' is-active' : ''}`}
            onClick={() => setScenariosOpen((prev) => !prev)}
            title="Chọn tình huống giao tiếp nhập vai"
            aria-expanded={scenariosOpen}
          >
            <Compass size={15} />
            <span>Tình huống</span>
          </button>

          <button
            type="button"
            className={`cv-btn-tool${settingsOpen ? ' is-active' : ''}`}
            onClick={() => setSettingsOpen((prev) => !prev)}
            title="Cài đặt giọng đọc và tốc độ"
            aria-expanded={settingsOpen}
          >
            <Settings2 size={15} />
            <span>Giọng nói</span>
          </button>

          <button
            type="button"
            className="cv-btn-tool is-danger"
            onClick={clearChat}
            disabled={thinking || recording || turns.length === 0}
            title="Xóa toàn bộ cuộc trò chuyện"
            aria-label="Xóa chat"
          >
            <Trash2 size={15} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* Settings Dropdown Panel */}
      {settingsOpen && (
        <aside className="cv-settings-panel" aria-label="Cài đặt giọng đọc AI">
          <div className="cv-settings-item">
            <div className="cv-settings-icon">
              <Volume2 size={18} />
            </div>
            <div className="cv-settings-label">
              <strong>Tự động phát âm câu trả lời</strong>
              <span>Đọc từng câu ngay khi AI phản hồi</span>
            </div>
          </div>

          <label className="cv-toggle-wrapper">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => {
                setAutoSpeak(e.target.checked);
                if (!e.target.checked) stopSpeech();
              }}
            />
            <span className="cv-toggle-slider" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              {autoSpeak ? 'Đang bật' : 'Đang tắt'}
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--cv-text-muted)', fontWeight: 600 }}>
              Tốc độ:
            </span>
            <select
              className="cv-speed-select"
              value={speechRate}
              onChange={(e) => setSpeechRate(Number(e.target.value))}
              disabled={!autoSpeak}
            >
              {SPEECH_RATES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </aside>
      )}

      {/* Scenarios Picker Panel */}
      {scenariosOpen && (
        <section className="cv-scenarios-section" aria-label="Chọn tình huống giao tiếp">
          <div className="cv-scenarios-header">
            <div className="cv-scenarios-title">
              <Compass size={18} color="var(--cv-jade)" />
              <h4>Tình huống giao tiếp nhập vai thực tế</h4>
              <span>(Bấm vào để bắt đầu cuộc trò chuyện tương ứng)</span>
            </div>
            <button
              type="button"
              className="cv-btn-tool"
              onClick={() => setScenariosOpen(false)}
              aria-label="Đóng bảng tình huống"
            >
              <X size={14} /> Đóng
            </button>
          </div>

          <div className="cv-scenarios-grid">
            {CONVERSATION_SCENARIOS.map((sc) => (
              <div
                key={sc.id}
                className="cv-scenario-card"
                onClick={() => handleSelectScenario(sc)}
                role="button"
                tabIndex={0}
              >
                <div className="cv-scenario-card-head">
                  <span className="cv-scenario-icon">{sc.icon}</span>
                  <span className="cv-scenario-tag">{sc.tag}</span>
                </div>
                <div className="cv-scenario-title">{sc.title}</div>
                <div className="cv-scenario-desc">{sc.description}</div>
                <div className="cv-scenario-starter">{sc.starterCn}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Chat Log & Bubbles */}
      <div className="cv-chat-log" ref={scrollRef} aria-live="polite">
        {turns.length === 0 && !thinking && (
          <div className="cv-empty-welcome">
            <div className="cv-empty-icon" aria-hidden="true">
              <MessageCircle size={32} />
            </div>
            <h3>Hôm nay bạn muốn luyện chủ đề gì?</h3>
            <p>
              Hãy gõ văn bản hoặc bấm micro để trò chuyện trực tiếp với Tezca AI. Bạn có thể chọn
              nhanh một tình huống dưới đây để bắt đầu ngay:
            </p>

            {/* In-view Scenarios Grid for Empty State */}
            <div className="cv-scenarios-grid" style={{ width: '100%', marginTop: 20 }}>
              {CONVERSATION_SCENARIOS.slice(0, 4).map((sc) => (
                <div
                  key={sc.id}
                  className="cv-scenario-card"
                  onClick={() => handleSelectScenario(sc)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="cv-scenario-card-head">
                    <span className="cv-scenario-icon">{sc.icon}</span>
                    <span className="cv-scenario-tag">{sc.tag}</span>
                  </div>
                  <div className="cv-scenario-title">{sc.title}</div>
                  <div className="cv-scenario-desc">{sc.description}</div>
                  <div className="cv-scenario-starter">{sc.starterCn}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <ChatBubble
            key={`${turn.role}-${index}`}
            role={turn.role}
            cn={turn.cn}
            vi={turn.vi}
            isVoice={turn.isVoice}
            showPinyin={showPinyin}
            showViGlobal={showVi}
            isPlaying={playingState?.text === turn.cn}
            playingSpeed={playingState?.speed || 1}
            onReplay={turn.role === 'model' && turn.cn ? handleReplay : undefined}
            onReplaySlow={turn.role === 'model' && turn.cn ? handleReplay : undefined}
            onSelectHint={sendTextWithContent}
            enableTooltip={indexReady}
          />
        ))}

        {thinking && (
          <div className="cv-row cv-row--ai">
            <div className="cv-msg-avatar" aria-hidden="true">
              <Bot size={18} />
            </div>
            <div className="cv-msg-body">
              <div className="cv-bubble-ai" style={{ width: 'fit-content' }}>
                <TypingIndicator />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="ai-chat-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Quick Prompts Bar */}
      <div className="cv-quick-prompts">
        <span style={{ fontSize: '0.74rem', color: 'var(--cv-text-dim)', fontWeight: 700, paddingLeft: 4 }}>
          💡 Gợi ý nhanh:
        </span>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            className="cv-prompt-pill"
            onClick={() => sendTextWithContent(qp.cn)}
            disabled={thinking || recording}
            title={qp.vi}
          >
            <span>{qp.cn}</span>
          </button>
        ))}
      </div>

      {/* 3. Floating Smart Composer & Voice Bar */}
      <form
        className="cv-composer-container"
        onSubmit={(e) => {
          e.preventDefault();
          if (!recording) sendText();
        }}
      >
        <div className="cv-composer-shell">
          {recording ? (
            /* ACTIVE STUDIO RECORDING BAR */
            <div className="cv-recording-bar">
              <div className="cv-recording-status">
                <span className="cv-recording-pulse-dot" />
                <span className="cv-recording-time">{formatRecDuration(recordingDuration)}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--cv-red)' }}>
                  Đang ghi âm giọng nói...
                </span>
              </div>

              {/* Audio Waveform Equalizer */}
              <div className="cv-audio-waveform" aria-hidden="true">
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
                <span className="cv-wave-bar" />
              </div>

              <div className="cv-recording-actions">
                <button
                  type="button"
                  className="cv-btn-cancel-rec"
                  onClick={cancelRecording}
                  title="Hủy đoạn ghi âm"
                >
                  <X size={14} /> Hủy
                </button>
                <button
                  type="button"
                  className="cv-btn-stop-rec"
                  onClick={finishRecording}
                  title="Dừng và gửi bản ghi"
                >
                  <Square size={14} /> Dừng & Gửi
                </button>
              </div>
            </div>
          ) : (
            /* TEXT COMPOSER */
            <>
              <textarea
                ref={inputRef}
                className="cv-composer-textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder={
                  activeScenario
                    ? `Nhắn tin cho kịch bản "${activeScenario.title}"... (Enter gửi)`
                    : 'Nhắn tin cho Tezca AI... (Enter gửi, Shift+Enter xuống dòng)'
                }
                maxLength={1200}
                rows={1}
                disabled={thinking}
                aria-label="Tin nhắn cho Tezca AI"
              />

              <div className="cv-composer-actions">
                <button
                  type="button"
                  className="cv-btn-mic"
                  onClick={beginRecording}
                  disabled={!supported || thinking}
                  title={supported ? 'Nói bằng micro' : 'Trình duyệt không hỗ trợ micro'}
                  aria-label="Nói bằng micro"
                >
                  <Mic size={20} />
                </button>

                <button
                  type="submit"
                  className="cv-btn-send"
                  disabled={!draft.trim() || thinking}
                  title="Gửi tin nhắn"
                  aria-label="Gửi tin nhắn"
                >
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="cv-composer-meta">
          <span className="cv-composer-meta-tip">
            {note ? (
              <span>✨ {note}</span>
            ) : (
              <span>{supported ? '🎙️ Micro đã sẵn sàng · Bấm icon mic để nói' : '⚠️ Trình duyệt chưa hỗ trợ ghi âm'}</span>
            )}
          </span>
          <span>Phím tắt: Enter gửi · Shift + Enter xuống dòng</span>
        </div>
      </form>
    </section>
  );
}
