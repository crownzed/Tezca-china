// Browser-to-backend Realtime session. The provider key never reaches the browser.
// WebSocket URLs carry no JWT; the first frame authenticates the connection.
import { getAuthToken } from '../api-core.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');
const READY_TIMEOUT_MS = 40000;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 48000;
// A slow browser must not accumulate unbounded audio in the WebSocket impl.
const MAX_WS_BUFFERED_BYTES = 1024 * 1024;
// JavaScript's $ also matches before a final newline; use an actual end-of-input
// assertion so the browser applies the same full-match rule as the backend.
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}(?![\s\S])/;

function getWsUrl() {
  const base = (API_BASE || window.location.origin).replace(/\/$/, '');
  const url = new URL(`${base}/ws/voice-chat`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

function validRate(value) {
  return Number.isInteger(value) && value >= MIN_SAMPLE_RATE && value <= MAX_SAMPLE_RATE;
}

const CLOSE_DETAILS = {
  4001: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  4003: 'Nguồn kết nối không được phép.',
  4008: 'Cuộc gọi đã vượt giới hạn cho phép.',
  4408: 'Kết nối Realtime đã hết thời gian chờ.',
  4410: 'Phiên gọi đã hết hạn.',
  4503: 'Dịch vụ Realtime hiện không khả dụng.',
};

/** One connection per instance. Any failure is terminal; there is no reconnect. */
export class RealtimeVoiceSession {
  constructor(callbacks = {}) {
    this._callbacks = callbacks;
    this._ws = null;
    this._connectPromise = null;
    this._pending = null;
    this._readyTimer = null;
    this._ready = false;
    this._authSent = false;
    this._closed = false;
    this._hasSentAudio = false;
  }

  /** Resolve only after the backend sends session.ready with validated PCM rates. */
  connect() {
    if (this._closed) return Promise.reject(new Error('Session already closed'));
    if (this._connectPromise) return this._connectPromise;

    const token = getAuthToken();
    if (!token) {
      this._closed = true;
      return Promise.reject(new Error('Cần đăng nhập để dùng Realtime.'));
    }

    this._connectPromise = new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      let ws;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        this._terminate('Không mở được kết nối Realtime.');
        return;
      }
      this._ws = ws;
      this._readyTimer = setTimeout(() => {
        this._terminate('Kết nối Realtime đã hết thời gian chờ.');
      }, READY_TIMEOUT_MS);

      ws.onopen = () => {
        if (this._closed || this._ws !== ws) return;
        try {
          // No application event (audio, text, etc.) precedes this frame.
          ws.send(JSON.stringify({ type: 'auth', token }));
          this._authSent = true;
        } catch {
          this._terminate('Không xác thực được kết nối Realtime.');
        }
      };
      ws.onmessage = (event) => {
        if (this._closed || this._ws !== ws) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message !== 'object') return;
        this._dispatch(message);
      };
      // Browser WebSocket errors are opaque; wait for onclose to preserve the
      // backend's public close code and avoid reporting the failure twice.
      ws.onerror = () => {};
      ws.onclose = (event) => {
        if (this._closed || this._ws !== ws) return;
        this._terminate(CLOSE_DETAILS[event.code] || 'Mất kết nối Realtime.', {
          type: 'disconnect', closeCode: event.code,
        });
      };
    });
    return this._connectPromise;
  }

  _dispatch(message) {
    switch (message.type) {
      case 'session.ready': {
        if (this._ready) return;
        if (!this._authSent) {
          this._terminate('Phiên Realtime chưa được xác thực.');
          return;
        }
        const input = message.input_sample_rate;
        const output = message.output_sample_rate;
        if (!validRate(input) || !validRate(output)) {
          this._terminate('Định dạng âm thanh Realtime không hợp lệ.');
          return;
        }
        if (typeof message.session_id !== 'string' || !SESSION_ID.test(message.session_id)) {
          this._terminate('Phiên Realtime không có mã phiên hợp lệ.');
          return;
        }
        this._ready = true;
        this._clearReadyTimer();
        const formats = {
          session_id: message.session_id,
          input_sample_rate: input,
          output_sample_rate: output,
        };
        // Resolve before callbacks; user callbacks cannot strand the handshake.
        const pending = this._pending;
        this._pending = null;
        pending?.resolve(formats);
        this._callbacks.onReady?.(formats);
        break;
      }
      case 'error':
      case 'fallback_needed':
        this._terminate(typeof message.detail === 'string' ? message.detail : 'Dịch vụ Realtime hiện không khả dụng.', {
          type: message.type, code: message.code,
        });
        break;
      case 'response.created':
        if (this._ready) this._callbacks.onResponseCreated?.(message.response);
        break;
      case 'response.audio.delta':
        if (this._ready && typeof message.delta === 'string') {
          this._callbacks.onAudioDelta?.(message.delta, message.response_id);
        }
        break;
      case 'response.text.delta':
      case 'response.audio_transcript.delta':
        if (this._ready && typeof message.delta === 'string') {
          this._callbacks.onTextDelta?.(message.delta, message.type);
        }
        break;
      case 'response.done':
        if (this._ready) {
          const status = message.response?.status;
          if (status === 'failed' || status === 'incomplete') {
            this._terminate('Phản hồi Realtime bị gián đoạn.');
          } else {
            this._callbacks.onResponseDone?.(message.response);
          }
        }
        break;
      case 'input_audio_buffer.speech_started':
        if (this._ready) this._callbacks.onSpeechStarted?.();
        break;
      case 'input_audio_buffer.speech_stopped':
        if (this._ready) this._callbacks.onSpeechStopped?.();
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (this._ready && typeof message.transcript === 'string') {
          this._callbacks.onTranscript?.(message.transcript);
        }
        break;
      case 'session.expiring_soon':
        if (this._ready) this._callbacks.onSessionExpiring?.(message.remaining_sec);
        break;
      default:
        // Unrecognized upstream/provider events are not part of the browser UI.
        break;
    }
  }

  _clearReadyTimer() {
    if (this._readyTimer !== null) clearTimeout(this._readyTimer);
    this._readyTimer = null;
  }

  _terminate(detail, extra = {}) {
    if (this._closed) return;
    const wasReady = this._ready;
    this._closed = true;
    this._ready = false;
    this._clearReadyTimer();
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch { /* transport already closed */ }
    }
    const pending = this._pending;
    this._pending = null;
    pending?.reject(new Error(detail));
    this._callbacks.onTerminal?.({ detail, wasReady, hasSentAudio: this._hasSentAudio, ...extra });
  }

  _send(message) {
    if (!this.isConnected) return false;
    const payload = JSON.stringify(message);
    const payloadBytes = new TextEncoder().encode(payload).byteLength;
    if (this._ws.bufferedAmount + payloadBytes > MAX_WS_BUFFERED_BYTES) {
      this._terminate('Kết nối Realtime đang quá tải.');
      return false;
    }
    try {
      this._ws.send(payload);
      return true;
    } catch {
      this._terminate('Không gửi được dữ liệu Realtime.');
      return false;
    }
  }

  /** True means the PCM frame was successfully queued on the open socket. */
  sendAudio(audio) {
    if (typeof audio !== 'string' || !audio) return false;
    const sent = this._send({ type: 'input_audio_buffer.append', audio });
    if (sent) this._hasSentAudio = true;
    return sent;
  }

  sendText(text) {
    const message = String(text || '').trim();
    if (!message || message.length > 2000) return false;
    if (!this._send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: message }] },
    })) return false;
    return this._send({ type: 'response.create' });
  }

  cancelResponse() { return this._send({ type: 'response.cancel' }); }
  clearAudio() { return this._send({ type: 'input_audio_buffer.clear' }); }

  /** User-initiated close is silent, idempotent, and never reconnects. */
  close() {
    if (this._closed) return;
    this._closed = true;
    this._ready = false;
    this._clearReadyTimer();
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch { /* ignore */ }
    }
    this._pending?.reject(new Error('Session closed'));
    this._pending = null;
  }

  get isConnected() { return this._ready && !this._closed && this._ws?.readyState === WebSocket.OPEN; }
  get hasSentAudio() { return this._hasSentAudio; }
}
