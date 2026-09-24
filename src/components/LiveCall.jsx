// LiveCall — Pipeline mặc định, Realtime là chế độ thử nghiệm có capability-gate.
//
// Pipeline giữ nguyên hợp đồng WAV mono 16 kHz. Realtime chỉ bắt đầu thu mic
// sau session.ready và dùng đúng sample rate mà backend công bố.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone } from 'lucide-react';
import { getRealtimeCapabilities } from '../api-core.js';
import {
  startStreamingMic,
  AudioVisualizer,
  CallControls,
  CallStatusBar,
  RealtimeVoiceSession,
  RealtimeAudioPlayer,
} from '../realtime/index.js';
import { PipelineCallSession } from '../realtime/pipeline-call.js';
import { isRecordingSupported } from '../speech-ai.js';

function disposeCall(call) {
  if (!call) return;
  try { call.mic?.stop(); } catch { /* release the other resources */ }
  try { call.session?.close(); } catch { /* transport may already be closed */ }
  try { call.player?.stop(); } catch { /* audio may already be closed */ }
  try { call.pipeline?.destroy(); } catch { /* request may already be aborted */ }
  call.mic = null;
  call.session = null;
  call.player = null;
  call.pipeline = null;
}

function terminalDetail(details) {
  const detail = details?.detail;
  return typeof detail === 'string' && detail.trim()
    ? detail
    : 'Kết nối Realtime đã kết thúc.';
}

export default function LiveCall({ onExit }) {
  // --- State ---
  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState('pipeline');
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rmsLevel, setRmsLevel] = useState(0);
  const [pipelineState, setPipelineState] = useState('idle'); // 'asr' | 'chat' | 'idle'
  const [sessionRemainingSec, setSessionRemainingSec] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // --- Refs ---
  const callRef = useRef(null);
  const mountedRef = useRef(true);
  const callIdRef = useRef(0);
  const transcriptClearTimerRef = useRef(null);

  const supported = isRecordingSupported();

  // Capability discovery is authenticated by api-core. A malformed or failed
  // response leaves the experimental option hidden and Pipeline untouched.
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    (async () => {
      try {
        const capabilities = await getRealtimeCapabilities({ signal: controller.signal });
        if (disposed) return;
        setRealtimeAvailable(
          Boolean(capabilities && typeof capabilities === 'object' && capabilities.realtime_available === true),
        );
      } catch {
        if (!disposed) setRealtimeAvailable(false);
      } finally {
        if (!disposed) setCapabilityLoading(false);
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const clearTranscriptTimer = useCallback(() => {
    if (transcriptClearTimerRef.current !== null) {
      clearTimeout(transcriptClearTimerRef.current);
      transcriptClearTimerRef.current = null;
    }
  }, []);

  // Invalidate callbacks before stopping anything that may complete
  // asynchronously. This is the generation guard for both call paths.
  const endCallInternal = useCallback(() => {
    callIdRef.current += 1;
    clearTranscriptTimer();
    const call = callRef.current;
    callRef.current = null;
    disposeCall(call);
  }, [clearTranscriptTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      endCallInternal();
    };
  }, [endCallInternal]);

  const endCall = useCallback(() => {
    endCallInternal();
    setActive(false);
    setConnecting(false);
    setStreamingText('');
    setMuted(false);
    setVolume(1);
    setRmsLevel(0);
    setPipelineState('idle');
    setSessionRemainingSec(null);
    setError('');
    setNote('');
  }, [endCallInternal]);

  const handleExit = useCallback(() => {
    endCall();
    onExit?.();
  }, [endCall, onExit]);

  // --- Start call ---
  const startCall = useCallback(async () => {
    if (!supported || !mountedRef.current || callRef.current) return;
    if (mode === 'realtime' && !realtimeAvailable) return;

    clearTranscriptTimer();
    const call = {
      id: callIdRef.current + 1,
      mode,
      pipeline: null,
      session: null,
      player: null,
      mic: null,
      hasSentAudio: false,
      wasReady: false,
      responseTextSource: null,
    };
    callIdRef.current = call.id;
    callRef.current = call;

    const isCurrent = () => (
      mountedRef.current &&
      callIdRef.current === call.id &&
      callRef.current === call
    );

    setError('');
    setNote(mode === 'realtime' ? 'Đang kết nối Realtime thử nghiệm...' : 'Đang khởi động micro...');
    setConnecting(true);
    setActive(false);
    setStreamingText('');
    setMuted(false);
    setPipelineState('idle');
    setSessionRemainingSec(null);

    try {
      if (mode === 'pipeline') {
        const pipeline = new PipelineCallSession({
          onTranscript(text) {
            if (!isCurrent()) return;
            clearTranscriptTimer();
            setStreamingText(text);
          },
          onAsrDelta(delta) {
            if (!isCurrent()) return;
            clearTranscriptTimer();
            setStreamingText((prev) => prev ? prev + delta : delta);
          },
          onSentence(sentence) {
            if (!isCurrent()) return;
            clearTranscriptTimer();
            setStreamingText((prev) => prev ? `${prev} ${sentence}` : sentence);
          },
          onReplyDone() {
            if (!isCurrent()) return;
            clearTranscriptTimer();
            const timer = setTimeout(() => {
              if (transcriptClearTimerRef.current !== timer) return;
              transcriptClearTimerRef.current = null;
              if (isCurrent()) setStreamingText('');
            }, 1500);
            transcriptClearTimerRef.current = timer;
          },
          onError(detail) {
            if (!isCurrent()) return;
            console.error('[LiveCall] Pipeline error:', detail);
            setError(String(detail));
          },
          onState(state) {
            if (!isCurrent()) return;
            setPipelineState(state || 'idle');
          },
        });
        call.pipeline = pipeline;

        const micController = await startStreamingMic({
          hangoverMs: 400,
          onUtteranceComplete(wavBase64, mimeType) {
            if (!isCurrent()) return;
            pipeline.processUtterance(wavBase64, mimeType);
          },
          onState(state) {
            if (!isCurrent()) return;
            if (state.type === 'rms') {
              setRmsLevel(state.rms);
            } else if (state.type === 'speech-start') {
              clearTranscriptTimer();
              setStreamingText('');
            } else if (state.type === 'barge-in') {
              clearTranscriptTimer();
              pipeline.bargeIn();
              setStreamingText('');
            }
          },
        });

        if (!isCurrent()) {
          micController.stop();
          pipeline.destroy();
          return;
        }
        call.mic = micController;
        setConnecting(false);
        setActive(true);
        setNote('');
        return;
      }

      // Realtime resources are created in the user-gesture call stack. The
      // microphone is deliberately not opened until connect() resolves with a
      // validated session.ready event.
      const player = new RealtimeAudioPlayer();
      call.player = player;
      player.onRmsUpdate = (rms) => {
        if (isCurrent()) setRmsLevel(rms);
      };
      player.onPlayingChange = (isPlaying) => {
        if (!isCurrent()) return;
        // Duck only while actual response PCM is playing. Mute remains a
        // separate hard transmission gate in streaming-mic.
        call.mic?.setDucked(isPlaying);
      };
      player.setVolume(volume);
      player.init();

      const session = new RealtimeVoiceSession({
        onReady() {
          // connect() resolves the same formats; this callback only records
          // readiness for terminal-state classification.
          if (isCurrent()) call.wasReady = true;
        },
        onResponseCreated() {
          if (!isCurrent()) return;
          call.responseTextSource = null;
          clearTranscriptTimer();
          setStreamingText('');
          setPipelineState('chat');
        },
        onAudioDelta(delta) {
          if (!isCurrent()) return;
          player.feed(delta);
        },
        onTextDelta(delta, type) {
          if (!isCurrent()) return;
          // Providers may expose both text and audio-transcript deltas. Use the
          // first stream for a response so the UI never duplicates both.
          if (!call.responseTextSource) call.responseTextSource = type;
          if (call.responseTextSource !== type) return;
          clearTranscriptTimer();
          setStreamingText((prev) => prev + delta);
        },
        onResponseDone() {
          if (!isCurrent()) return;
          setPipelineState('idle');
          clearTranscriptTimer();
          const timer = setTimeout(() => {
            if (transcriptClearTimerRef.current !== timer) return;
            transcriptClearTimerRef.current = null;
            if (isCurrent()) setStreamingText('');
          }, 1500);
          transcriptClearTimerRef.current = timer;
        },
        onTranscript(text) {
          if (!isCurrent() || call.responseTextSource) return;
          clearTranscriptTimer();
          setStreamingText(text);
        },
        onSpeechStarted() {
          if (!isCurrent()) return;
          setPipelineState('asr');
        },
        onSpeechStopped() {
          if (isCurrent()) setPipelineState('idle');
        },
        onSessionExpiring(remaining) {
          if (!isCurrent()) return;
          setSessionRemainingSec(Number.isFinite(remaining) ? remaining : null);
        },
        onTerminal(details) {
          if (!isCurrent()) return;
          const sentAudio = Boolean(details?.hasSentAudio || call.hasSentAudio);
          const detail = terminalDetail(details);
          endCallInternal();
          setActive(false);
          setConnecting(false);
          setStreamingText('');
          setMuted(false);
          setRmsLevel(0);
          setPipelineState('idle');
          setSessionRemainingSec(null);

          if (!sentAudio) {
            // Initial failure: choose Pipeline, but never start it or replay
            // any captured PCM automatically.
            setMode('pipeline');
            setError('');
            setNote(`Realtime chưa sẵn sàng (${detail}). Đã chọn Pipeline; hãy nhấn “Bắt đầu cuộc gọi”.`);
          } else {
            setError(detail);
            setNote('');
          }
        },
      });
      call.session = session;

      const ready = await session.connect();
      if (!isCurrent()) return;
      call.wasReady = true;

      player.start({ inputSampleRate: ready.output_sample_rate });
      const micController = await startStreamingMic({
        outputSampleRate: ready.input_sample_rate,
        onPcmChunk(pcmBase64) {
          if (!isCurrent()) return;
          const sent = session.sendAudio(pcmBase64);
          if (sent) call.hasSentAudio = true;
        },
        onState(state) {
          if (!isCurrent()) return;
          if (state.type === 'rms') {
            setRmsLevel(state.rms);
          } else if (state.type === 'speech-start') {
            clearTranscriptTimer();
            setStreamingText('');
          } else if (state.type === 'barge-in') {
            // Barge-in edge is generated only while the player has output
            // audio queued/playing. Flush locally before cancelling upstream.
            player.flush();
            session.cancelResponse();
            clearTranscriptTimer();
            setStreamingText('');
            setPipelineState('asr');
          }
        },
      });

      if (!isCurrent()) {
        micController.stop();
        return;
      }
      call.mic = micController;
      setConnecting(false);
      setActive(true);
      setNote('');
    } catch (caught) {
      if (!isCurrent()) return;
      const established = call.hasSentAudio || Boolean(call.session?.hasSentAudio);
      endCallInternal();
      setActive(false);
      setConnecting(false);
      setStreamingText('');
      setMuted(false);
      setRmsLevel(0);
      setPipelineState('idle');
      setSessionRemainingSec(null);

      if (call.mode === 'realtime' && !established) {
        setMode('pipeline');
        setError('');
        setNote(`Không thể bắt đầu Realtime (${caught?.message || 'lỗi kết nối'}). Đã chọn Pipeline; hãy nhấn “Bắt đầu cuộc gọi”.`);
      } else {
        setError(caught?.message || 'Không thể truy cập micro. Kiểm tra quyền và thử lại.');
        setNote('');
      }
    }
  }, [
    supported,
    mode,
    realtimeAvailable,
    volume,
    clearTranscriptTimer,
    endCallInternal,
  ]);

  // --- Controls ---
  const toggleMute = useCallback(() => {
    const call = callRef.current;
    const mic = call?.mic;
    if (!mic) return;
    const newMuted = !muted;
    setMuted(newMuted);
    // This is a true transmission mute, not VAD ducking.
    mic.setMuted(newMuted);
  }, [muted]);

  const handleVolumeChange = useCallback((level) => {
    const numeric = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    setVolume(numeric);
    const player = callRef.current?.player;
    if (mode === 'realtime') player?.setVolume(numeric);
  }, [mode]);

  const sendText = useCallback((text) => {
    const message = String(text || '').trim();
    const call = callRef.current;
    if (!message || !call) return;
    clearTranscriptTimer();
    setStreamingText('');
    if (call.mode === 'realtime') {
      call.session?.sendText(message);
    } else {
      call.pipeline?.sendText(message);
    }
  }, [clearTranscriptTimer]);

  // --- Status text ---
  const statusText = (() => {
    if (capabilityLoading && !active && !connecting) return 'Đang kiểm tra chế độ Realtime...';
    if (connecting) return mode === 'realtime' ? 'Đang kết nối Realtime...' : 'Đang khởi động...';
    if (!active) return error ? 'Lỗi' : 'Sẵn sàng';
    if (pipelineState === 'asr') return 'Đang nghe...';
    if (pipelineState === 'chat') return 'AI đang suy nghĩ...';
    if (streamingText) return 'AI đang nói...';
    return 'AI đang lắng nghe...';
  })();

  const handleRetry = useCallback(() => {
    // Retry is an explicit user action; there is no timer or automatic
    // replacement call after a Realtime failure.
    endCall();
    startCall();
  }, [endCall, startCall]);

  return (
    <section style={styles.page}>
      <header style={styles.header}>
        <button onClick={handleExit} style={styles.backBtn} title="Quay lại Hội thoại">
          <ArrowLeft size={18} />
          <span>Quay lại</span>
        </button>

        <div className="header-right" style={styles.headerRight}>
          <Phone size={16} style={{ color: active ? '#a6e3a1' : '#6c7086' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cdd6f4' }}>
            Gọi điện AI
          </span>
        </div>
      </header>

      <main style={styles.main}>
        <CallStatusBar
          isActive={active}
          mode={mode}
          sessionRemainingSec={sessionRemainingSec}
        />

        <div style={styles.visualizerWrap}>
          <AudioVisualizer
            rmsLevel={rmsLevel}
            isActive={active}
            size={200}
            color={pipelineState === 'chat' ? '#f9e2af' : '#89b4fa'}
          />
        </div>

        <p style={{
          ...styles.statusText,
          color: pipelineState === 'chat' ? '#f9e2af' : active ? '#a6e3a1' : '#6c7086',
        }}>
          {statusText}
        </p>

        {streamingText && (
          <div style={styles.transcript} aria-live="polite">
            {streamingText}
            {pipelineState === 'chat' && <span style={styles.cursor}>▊</span>}
          </div>
        )}

        {note && !error && (
          <p style={styles.note} role="status">{note}</p>
        )}
      </main>

      <footer style={styles.footer}>
        {!active && !connecting && realtimeAvailable && (
          <fieldset style={styles.modeSelector}>
            <legend style={styles.modeLegend}>Chế độ cuộc gọi</legend>
            <label style={styles.modeOption}>
              <input
                type="radio"
                name="live-call-mode"
                value="pipeline"
                checked={mode === 'pipeline'}
                onChange={() => setMode('pipeline')}
              />
              Pipeline
            </label>
            <label style={styles.modeOption}>
              <input
                type="radio"
                name="live-call-mode"
                value="realtime"
                checked={mode === 'realtime'}
                onChange={() => setMode('realtime')}
              />
              Realtime (thử nghiệm)
            </label>
          </fieldset>
        )}

        {active || connecting ? (
          <CallControls
            isMuted={muted}
            onToggleMute={toggleMute}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            onEndCall={handleExit}
            onSendText={sendText}
            disabled={connecting}
          />
        ) : error ? (
          <div style={styles.errorBox} role="alert">
            <p style={{ margin: 0, color: '#f38ba8', fontSize: '0.9rem' }}>{error}</p>
            <button onClick={handleRetry} style={styles.retryBtn}>Thử lại</button>
          </div>
        ) : (
          <button onClick={startCall} disabled={!supported || (mode === 'realtime' && capabilityLoading)} style={styles.startBtn}>
            <Phone size={20} />
            <span>Bắt đầu cuộc gọi{mode === 'realtime' ? ' Realtime' : ''}</span>
          </button>
        )}
      </footer>

      {!supported && (
        <div style={styles.unsupportedBanner} role="status">
          Trình duyệt không hỗ trợ ghi âm. Vui lòng dùng Chrome/Edge/Firefox.
        </div>
      )}
    </section>
  );
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#11111b',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: '#a6adc8',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '6px 10px',
    borderRadius: '8px',
    transition: 'background 0.15s',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '20px',
    minHeight: 0,
  },
  visualizerWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
    textAlign: 'center',
  },
  transcript: {
    maxWidth: '500px',
    padding: '12px 20px',
    background: '#1e1e2e',
    borderRadius: '12px',
    color: '#cdd6f4',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    textAlign: 'center',
    maxHeight: '120px',
    overflowY: 'auto',
  },
  cursor: {
    animation: 'blink 1s step-end infinite',
    marginLeft: '2px',
    color: '#89b4fa',
  },
  note: {
    fontSize: '0.82rem',
    color: '#a6adc8',
    margin: 0,
    textAlign: 'center',
    maxWidth: '620px',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #313244',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  modeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid #45475a',
    borderRadius: '10px',
    padding: '7px 10px',
    color: '#cdd6f4',
    fontSize: '0.8rem',
  },
  modeLegend: {
    padding: '0 4px',
    color: '#a6adc8',
  },
  modeOption: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  retryBtn: {
    padding: '8px 20px',
    borderRadius: '10px',
    border: 'none',
    background: '#89b4fa',
    color: '#1e1e2e',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  startBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 28px',
    borderRadius: '14px',
    border: 'none',
    background: '#a6e3a1',
    color: '#1e1e2e',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  unsupportedBanner: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#f9e2af',
    color: '#1e1e2e',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '0.82rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
