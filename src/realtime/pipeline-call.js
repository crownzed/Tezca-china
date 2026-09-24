// Pipeline ASR→Chat→TTS cho chế độ gọi thoại.
//
// Thay thế RealtimeVoiceSession khi StepFun Realtime API không khả dụng.
// Flow: VAD phát hiện utterance-end → encode WAV → ASR → streaming chat → TTS queue.
// Latency ~2.7-4.3s (so với realtime ~0.5-1s) nhưng dùng được với keys hiện có.
//
// Tách riêng để LiveCall.jsx không phình ra và dễ swap lại realtime khi có key.

import { streamVoiceChat } from '../api-core.js';
import { beginSpeechQueue, setSpeechQueueStreaming, speakQueued, interruptSpeech, stopSpeech } from '../speech.jsx';

// Giới hạn history để tránh payload quá lớn. 20 turns = ~10 lượt hỏi đáp.
const MAX_HISTORY = 20;

export class PipelineCallSession {
  /**
   * @param {Object} opts
   * @param {(text: string) => void} opts.onTranscript — ASR transcript cuối cùng của user
   * @param {(delta: string) => void} opts.onAsrDelta — partial ASR transcript (streaming)
   * @param {(text: string) => void} opts.onSentence — mỗi câu AI trả lời (trigger TTS)
   * @param {(replyCn: string, replyVi: string) => void} opts.onReplyDone — AI trả lời xong
   * @param {(detail: string) => void} opts.onError — lỗi ASR/chat/TTS
   * @param {(state: string) => void} opts.onState — 'asr' | 'chat' | 'idle'
   */
  constructor({ onTranscript, onAsrDelta, onSentence, onReplyDone, onError, onState } = {}) {
    this._onTranscript = onTranscript;
    this._onAsrDelta = onAsrDelta;
    this._onSentence = onSentence;
    this._onReplyDone = onReplyDone;
    this._onError = onError;
    this._onState = onState;
    this._history = [];
    this._processing = false;
    this._destroyed = false;
    this._abortController = null;
  }

  get isProcessing() {
    return this._processing;
  }

  _ownsRequest(controller) {
    return (
      !this._destroyed &&
      this._abortController === controller &&
      !controller.signal.aborted
    );
  }

  /**
   * Xử lý một utterance hoàn chỉnh từ VAD.
   *
   * Gửi audio trực tiếp qua streamVoiceChat — backend inline ASR streaming,
   * forward partial transcript (asr_delta) ngay khi nhận, rồi bắt đầu LLM ngay
   * khi ASR done. Giảm 1 HTTP round-trip so với gọi ASR riêng rồi chat riêng.
   *
   * @param {string} wavBase64 — WAV audio base64-encoded
   * @param {string} mimeType — 'audio/wav'
   */
  async processUtterance(wavBase64, mimeType) {
    if (this._destroyed || this._processing) return;
    this._processing = true;

    // Cancel previous request nếu có
    this._abortController?.abort();
    const controller = new AbortController();
    this._abortController = controller;
    const { signal } = controller;

    try {
      // --- Streaming ASR + Chat (single request) ---
      this._onState?.('asr');
      if (!this._ownsRequest(controller)) return;
      beginSpeechQueue();
      setSpeechQueueStreaming(true);

      let transcript = '';
      const done = await streamVoiceChat(
        {
          audio_base64: wavBase64,
          mime_type: mimeType,
          text: '',
          history: this._history.slice(-MAX_HISTORY),
        },
        (event) => {
          if (!this._ownsRequest(controller)) return;

          if (event.type === 'asr_delta') {
            // Partial ASR transcript — hiển thị dần trong UI
            const delta = String(event.delta || '');
            if (delta) {
              transcript += delta;
              this._onAsrDelta?.(delta);
            }
          } else if (event.type === 'transcript') {
            // Final ASR transcript
            transcript = String(event.user_text || '').trim();
            this._onTranscript?.(transcript);
            if (!this._ownsRequest(controller)) return;
            // Add user turn to history
            if (transcript) {
              this._addHistory({ role: 'user', cn: transcript, vi: '' });
            }
            // Chuyển sang state chat khi ASR xong
            this._onState?.('chat');
          } else if (event.type === 'sentence') {
            const sentence = String(event.text || '').trim();
            if (sentence) {
              this._onSentence?.(sentence);
              if (this._ownsRequest(controller)) speakQueued(sentence);
            }
          }
        },
        { signal }
      );

      if (!this._ownsRequest(controller) || !transcript) return;
      const replyCn = String(done?.reply_cn || '').trim();
      const replyVi = String(done?.reply_vi || '').trim();
      if (replyCn) {
        this._addHistory({ role: 'model', cn: replyCn, vi: replyVi });
        this._onReplyDone?.(replyCn, replyVi);
      }
    } catch (err) {
      if (this._ownsRequest(controller)) {
        this._onError?.(err.message || 'AI không phản hồi được.');
      }
    } finally {
      if (this._ownsRequest(controller)) {
        this._abortController = null;
        this._processing = false;
        this._onState?.('idle');
      }
    }
  }

  /**
   * Gửi text thay vì voice (skip ASR).
   */
  async sendText(text) {
    if (this._destroyed || this._processing) return;
    const message = String(text || '').trim();
    if (!message) return;

    this._processing = true;
    this._abortController?.abort();
    const controller = new AbortController();
    this._abortController = controller;
    const { signal } = controller;

    try {
      this._onTranscript?.(message);
      if (!this._ownsRequest(controller)) return;
      this._addHistory({ role: 'user', cn: message, vi: '' });

      this._onState?.('chat');
      if (!this._ownsRequest(controller)) return;
      beginSpeechQueue();
      setSpeechQueueStreaming(true);

      const done = await streamVoiceChat(
        {
          audio_base64: '',
          mime_type: 'text/plain',
          text: message,
          history: this._history.slice(-MAX_HISTORY),
        },
        (event) => {
          if (!this._ownsRequest(controller)) return;
          if (event.type === 'sentence') {
            const sentence = String(event.text || '').trim();
            if (sentence) {
              this._onSentence?.(sentence);
              if (this._ownsRequest(controller)) speakQueued(sentence);
            }
          }
        },
        { signal }
      );

      if (!this._ownsRequest(controller)) return;
      const replyCn = String(done?.reply_cn || '').trim();
      const replyVi = String(done?.reply_vi || '').trim();

      if (replyCn) {
        this._addHistory({ role: 'model', cn: replyCn, vi: replyVi });
        this._onReplyDone?.(replyCn, replyVi);
      }
    } catch (err) {
      if (this._ownsRequest(controller)) {
        this._onError?.(err.message || 'AI không phản hồi được.');
      }
    } finally {
      if (this._ownsRequest(controller)) {
        this._abortController = null;
        this._processing = false;
        this._onState?.('idle');
      }
    }
  }

  /** Barge-in: dừng AI đang nói, chuẩn bị nhận lượt mới. */
  bargeIn() {
    if (this._destroyed) return;
    interruptSpeech();
  }

  /** Dừng toàn bộ: cancel request đang chạy + dừng audio. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const controller = this._abortController;
    this._abortController = null;
    controller?.abort();
    stopSpeech();
    this._history = [];
    this._processing = false;
  }

  _addHistory(turn) {
    this._history.push(turn);
    // Trim old turns
    if (this._history.length > MAX_HISTORY * 2) {
      this._history = this._history.slice(-MAX_HISTORY * 2);
    }
  }
}
