// Mic recording helper for speech features (pronunciation + voice chat).
//
// Records raw PCM via the Web Audio API and encodes a 16-bit mono WAV in the
// browser — NO MediaRecorder/webm and NO server-side ffmpeg. The backend's DSP
// layer (parselmouth F0 tracking) needs decodable WAV PCM, and Render's free
// tier has no ffmpeg, so we hand it a clean WAV directly.

const TARGET_SAMPLE_RATE = 16000; // 16 kHz mono is plenty for F0 + speech.

export function isRecordingSupported() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined'
  );
}

function arrayBufferToBase64(bytes) {
  // Chunked to avoid call-stack limits on large clips.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Condition the mono signal for pitch/tone analysis:
//   1) remove DC offset (a nonzero mean biases the F0 autocorrelation),
//   2) trim leading/trailing silence (spurious voiced runs confuse syllable
//      splitting), keeping a small margin so real onsets aren't clipped,
//   3) peak-normalize to a consistent level so quiet clips don't under-drive
//      the F0 tracker — but only when there's real signal, to avoid blowing up
//      background noise in an empty recording.
function conditionSignal(samples, sampleRate) {
  const n = samples.length;
  if (!n) return samples;

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += samples[i];
  mean /= n;

  let peak = 0;
  for (let i = 0; i < n; i += 1) {
    samples[i] -= mean;
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak < 1e-4) return samples; // effectively silent — leave untouched

  // Energy-based silence trim over ~10ms windows.
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const gate = Math.max(0.02, peak * 0.08);
  const windowRms = (i) => {
    let e = 0;
    for (let j = i; j < i + win; j += 1) e += samples[j] * samples[j];
    return Math.sqrt(e / win);
  };
  let start = 0;
  let end = n;
  for (let i = 0; i + win <= n; i += win) {
    if (windowRms(i) >= gate) { start = i; break; }
  }
  for (let i = n - win; i >= 0; i -= win) {
    if (windowRms(i) >= gate) { end = i + win; break; }
  }
  const margin = Math.round(sampleRate * 0.05); // 50ms guard
  start = Math.max(0, start - margin);
  end = Math.min(n, end + margin);
  const trimmed = start > 0 || end < n ? samples.subarray(start, end) : samples;

  // Peak-normalize the trimmed region to ~0.95 full scale.
  const gain = 0.95 / peak;
  for (let i = 0; i < trimmed.length; i += 1) trimmed[i] *= gain;
  return trimmed;
}

// Downmix to mono and resample (linear) from the capture rate to the target.
function resampleToMono(channels, inRate, outRate) {
  const inLength = channels[0].length;
  const mono = new Float32Array(inLength);
  const nCh = channels.length;
  for (let i = 0; i < inLength; i += 1) {
    let sum = 0;
    for (let c = 0; c < nCh; c += 1) sum += channels[c][i];
    mono[i] = sum / nCh;
  }
  if (inRate === outRate) return mono;
  const ratio = inRate / outRate;
  const outLength = Math.round(inLength / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, inLength - 1);
    const frac = srcPos - i0;
    out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }
  return out;
}

// Encode Float32 [-1,1] samples to a 16-bit PCM mono WAV (RIFF) ArrayBuffer.
function encodeWav(samples, sampleRate) {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

// Start recording. Returns a controller with stop() -> { base64, mimeType }.
export async function startRecording() {
  if (!isRecordingSupported()) {
    throw new Error('Trình duyệt không hỗ trợ ghi âm.');
  }
  // Disable the browser's voice-call DSP: echo cancellation, noise suppression
  // and auto gain control all distort the pitch contour and amplitude dynamics
  // that the tone scorer measures. We want the raw mic signal.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally supported and adequate here.
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let recording = true;

  processor.onaudioprocess = (event) => {
    if (!recording) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(audioCtx.destination);

  const teardown = () => {
    recording = false;
    try { processor.disconnect(); } catch { /* ignore */ }
    try { source.disconnect(); } catch { /* ignore */ }
    stream.getTracks().forEach((track) => track.stop());
    audioCtx.close().catch(() => {});
  };

  return {
    stop() {
      return new Promise((resolve, reject) => {
        try {
          const captureRate = audioCtx.sampleRate;
          teardown();
          const total = chunks.reduce((sum, c) => sum + c.length, 0);
          if (!total) { reject(new Error('Không ghi được âm thanh.')); return; }
          const merged = new Float32Array(total);
          let pos = 0;
          for (const c of chunks) { merged.set(c, pos); pos += c.length; }
          const mono = resampleToMono([merged], captureRate, TARGET_SAMPLE_RATE);
          const conditioned = conditionSignal(mono, TARGET_SAMPLE_RATE);
          const wav = encodeWav(conditioned, TARGET_SAMPLE_RATE);
          const base64 = arrayBufferToBase64(new Uint8Array(wav));
          resolve({ base64, mimeType: 'audio/wav' });
        } catch (err) {
          reject(err);
        }
      });
    },
    cancel() {
      teardown();
    },
  };
}
