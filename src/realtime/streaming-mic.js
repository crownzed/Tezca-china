// Streaming mic capture cho gọi thoại AI.
//
// Hai chế độ:
//   1. Realtime: stream raw PCM chunks qua WebSocket → server VAD.
//      onPcmChunk được gọi mỗi audio callback (~85ms tại 48kHz).
//   2. Pipeline: buffer utterance tại client → encode WAV → callback.
//      onUtteranceComplete(wavBase64, mimeType) được gọi khi VAD chốt lượt.
//
// Cả hai đều dùng client-side VAD (voice-vad.js) để detect speech boundaries
// và barge-in. AEC BẮT BUỘC bật vì speaker phát AI audio cùng lúc.
//
// Tách từ speech-ai.js vì chế độ streaming khác hẳn startRecording:
//   - AEC bật (startRecording tắt vì méo F0)
//   - Resample xuống 16kHz mono
//   - Buffer theo utterance thay vì record trọn file

import { createVadState, feedVad } from '../voice-vad.js';
import { isRecordingSupported } from '../speech-ai.js';

// Pipeline keeps its 16 kHz WAV contract; Realtime uses session.ready's rate.
const PIPELINE_SAMPLE_RATE = 16000;

function normalizeSampleRate(value) {
  if (!Number.isInteger(value) || value < 8000 || value > 48000) {
    throw new Error('Sample rate must be an integer between 8000 and 48000 Hz.');
  }
  return value;
}

// --- Internal helpers (copied from speech-ai.js to avoid coupling) ---

function arrayBufferToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Streaming linear resampler: carry fractional source position across audio
// callbacks, including a boundary sample, so non-divisible rates do not drift.
function createResampler(inRate, outRate) {
  const step = inRate / outRate;
  let totalInput = 0;
  let nextPosition = 0;
  let previousSample = 0;
  return {
    process(input) {
      if (inRate === outRate) return new Float32Array(input);
      const start = totalInput;
      const end = start + input.length;
      const output = new Float32Array(Math.ceil(input.length / step) + 2);
      let written = 0;
      while (nextPosition < end) {
        const lower = Math.floor(nextPosition);
        if (lower + 1 >= end && nextPosition !== lower) break;
        const first = lower < start ? previousSample : input[lower - start];
        const second = lower + 1 < end ? input[lower + 1 - start] : first;
        output[written++] = first + (second - first) * (nextPosition - lower);
        nextPosition += step;
      }
      previousSample = input[input.length - 1] ?? previousSample;
      totalInput = end;
      return output.subarray(0, written);
    },
    reset() {
      totalInput = 0;
      nextPosition = 0;
      previousSample = 0;
    },
  };
}

/** Encode Float32 samples [-1,1] thành WAV base64 (16-bit PCM, mono). */
function encodeWavBase64(floatSamples, sampleRate) {
  const numSamples = floatSamples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true); // file size - 8
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return arrayBufferToBase64(new Uint8Array(buffer));
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// --- Exported API ---

/**
 * Mở mic liên tục.
 *
 * @param {Object} opts
 * @param {(base64Pcm: string) => void} [opts.onPcmChunk] — realtime mode: gọi mỗi ~256ms với Int16 base64
 * @param {(wavBase64: string, mimeType: string) => void} [opts.onUtteranceComplete] — pipeline mode: gọi khi VAD chốt lượt
 * @param {(state: Object) => void} [opts.onState] — calibrating | speech-start | utterance-end | barge-in
 * @param {number} [opts.hangoverMs=600] — silence before utterance ends; Pipeline uses 400ms.
 * @param {number} [opts.outputSampleRate=16000] — PCM/WAV output rate. Pipeline keeps 16000.
 * @param {string} [opts.deviceId] — optional audio input device ID
 * @param {() => boolean} [opts.shouldTransmit] — gate sending while muted
 * @returns {Promise<MicController>} controller with setDucked(), setMuted(), stop()
 */
export async function startStreamingMic({
  onPcmChunk, onUtteranceComplete, onState, hangoverMs = 600,
  outputSampleRate = PIPELINE_SAMPLE_RATE, deviceId, shouldTransmit,
} = {}) {
  // Reject unsupported rates before opening any audio resources.
  const sampleRate = normalizeSampleRate(outputSampleRate);
  if (onUtteranceComplete && sampleRate !== PIPELINE_SAMPLE_RATE) {
    throw new Error('Pipeline WAV requires 16000 Hz.');
  }
  if (typeof shouldTransmit !== 'undefined' && typeof shouldTransmit !== 'function') {
    throw new TypeError('shouldTransmit must be a function.');
  }
  if (!isRecordingSupported()) {
    throw new Error('Trình duyệt không hỗ trợ ghi âm.');
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch { /* dưới sẽ báo lỗi nếu thật sự chết */ }
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
  } catch (err) {
    audioCtx.close().catch(() => {});
    throw err;
  }

  let alive = true;
  let stopped = false;
  let source = null;
  let processor = null;
  let vad;
  const captureRate = audioCtx.sampleRate;
  const resampler = createResampler(captureRate, sampleRate);

  // Utterance buffer cho pipeline mode
  let utteranceBuffer = []; // Array of Float32Array (resampled chunks)
  let bufferingUtterance = false;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    alive = false;
    bufferingUtterance = false;
    utteranceBuffer = [];
    try {
      if (processor) processor.onaudioprocess = null;
    } catch { /* ignore */ }
    try { processor?.disconnect(); } catch { /* ignore */ }
    try { source?.disconnect(); } catch { /* ignore */ }
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* release the remaining tracks */ }
    }
    audioCtx.close().catch(() => {});
  };

  try {
    source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    vad = createVadState(captureRate, { hangoverMs });
  } catch (err) {
    cleanup();
    throw err;
  }

  let ducked = false;
  let muted = false;
  const mayTransmit = () => alive && !muted && (!shouldTransmit || shouldTransmit());

  // Helper: Float32 [-1,1] → Int16 base64
  const float32ToPcmBase64 = (floatSamples) => {
    const int16 = new Int16Array(floatSamples.length);
    for (let i = 0; i < floatSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, floatSamples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return arrayBufferToBase64(new Uint8Array(int16.buffer));
  };

  processor.onaudioprocess = (event) => {
    if (!mayTransmit()) return;
    const input = event.inputBuffer.getChannelData(0);

    // VAD
    const result = feedVad(vad, input, { ducked });

    // Emit RMS level cho visualizer (mỗi frame ~86ms ở 48kHz/4096)
    onState?.({ type: 'rms', rms: result.rms });
    if (!mayTransmit()) return;

    if (result.action === 'calibrating') {
      onState?.({ type: 'calibrating' });
    }
    if (!mayTransmit()) return;

    if (ducked && result.action === 'speech-start') {
      onState?.({ type: 'barge-in' });
    }
    if (!mayTransmit()) return;

    if (result.action === 'speech-start') {
      onState?.({ type: 'speech-start' });
      if (!mayTransmit()) return;
      // Bắt đầu buffer utterance
      if (onUtteranceComplete) {
        bufferingUtterance = true;
        utteranceBuffer = [];
      }
    }

    if (result.action === 'utterance-end') {
      onState?.({ type: 'utterance-end', utteranceMs: result.utteranceMs });
      if (!mayTransmit()) return;

      // Pipeline mode: encode và gửi utterance
      if (onUtteranceComplete && bufferingUtterance && utteranceBuffer.length > 0) {
        bufferingUtterance = false;
        // Concat all buffered chunks
        const totalLength = utteranceBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of utteranceBuffer) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        utteranceBuffer = [];

        try {
          const wavBase64 = encodeWavBase64(merged, PIPELINE_SAMPLE_RATE);
          if (mayTransmit()) {
            onUtteranceComplete(wavBase64, 'audio/wav');
          }
        } catch {
          // Encode lỗi không giết session
        }
      }
    }

    if (!mayTransmit()) return;
    // Resample chunk
    let mono;
    try {
      mono = resampler.process(new Float32Array(input));
    } catch {
      return;
    }

    // Realtime mode: stream PCM (including silence for server VAD)
    if (onPcmChunk && mono.length && mayTransmit()) {
      try {
        const pcmBase64 = float32ToPcmBase64(mono);
        if (mayTransmit()) onPcmChunk(pcmBase64);
      } catch {
        // Một chunk lỗi không giết cả session
      }
    }

    // Pipeline mode: buffer nếu đang trong utterance
    if (bufferingUtterance && mayTransmit()) {
      utteranceBuffer.push(new Float32Array(mono));
    }
  };

  try {
    source.connect(processor);
    processor.connect(audioCtx.destination);
  } catch (err) {
    cleanup();
    throw err;
  }

  return {
    setDucked(value) { ducked = Boolean(value); },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) {
        bufferingUtterance = false;
        utteranceBuffer = [];
        vad = createVadState(captureRate, { hangoverMs });
        resampler.reset();
      }
    },
    get isSpeaking() { return vad.speaking; },
    stop: cleanup,
  };
}
