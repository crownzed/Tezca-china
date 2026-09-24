// PCM streaming audio player cho Realtime Voice Chat response.
//
// The browser receives PCM16 at the rate announced by session.ready. The player
// converts that stream to the actual AudioContext rate before enqueueing it and
// keeps a hard upper bound on queued samples so a slow tab/network cannot grow
// memory without limit.

const DEFAULT_INPUT_SAMPLE_RATE = 16000;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 48000;
const MAX_QUEUE_SEC = 2;

// Adaptive jitter target. This is a playback-start target, not a queue bound.
const MIN_BUFFER_SEC = 0.05;
const MAX_BUFFER_SEC = 0.5;
const INITIAL_BUFFER_SEC = 0.1;
const BUFFER_GROWTH_FACTOR = 1.5;
const BUFFER_DECAY_FACTOR = 0.98;
const ARRIVAL_HISTORY_SIZE = 50;

function normalizeSampleRate(value) {
  if (!Number.isInteger(value) || value < MIN_SAMPLE_RATE || value > MAX_SAMPLE_RATE) {
    throw new Error('Sample rate must be an integer between 8000 and 48000 Hz.');
  }
  return value;
}

function normalizePlaybackRate(value) {
  // Browser AudioContext rates are not limited by the backend's 8–48 kHz
  // contract (a 96/192 kHz output device is valid).
  if (!Number.isFinite(value) || value < 3000 || value > 384000) {
    throw new Error('Unsupported audio output device rate.');
  }
  return value;
}

/** Decode base64 string → Int16Array. */
function base64ToInt16(base64) {
  const binary = atob(base64);
  if (binary.length % 2 !== 0) throw new Error('PCM16 payload has an odd byte length.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Streaming linear resampler. The fractional source position and boundary
 * sample survive feed() calls, so chunk boundaries cannot change the pitch or
 * drift the playback clock.
 */
function createResampler(inputRate, outputRate) {
  if (inputRate === outputRate) {
    return {
      process(input) { return new Float32Array(input); },
      reset() {},
    };
  }

  const step = inputRate / outputRate;
  let totalInput = 0;
  let nextPosition = 0;
  let previousSample = 0;

  return {
    process(input) {
      const start = totalInput;
      const end = start + input.length;
      const output = new Float32Array(Math.ceil(input.length / step) + 2);
      let written = 0;

      while (nextPosition < end) {
        const lower = Math.floor(nextPosition);
        // A fractional sample at the end needs the next callback's first sample.
        if (lower + 1 >= end && nextPosition !== lower) break;
        const first = lower < start ? previousSample : input[lower - start];
        const second = lower + 1 < end ? input[lower + 1 - start] : first;
        output[written] = first + (second - first) * (nextPosition - lower);
        written += 1;
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

function int16ToFloat32(input) {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    output[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return output;
}

/**
 * Player nhận PCM chunks và phát realtime với adaptive jitter buffer.
 *
 * Usage:
 *   const player = new RealtimeAudioPlayer();
 *   player.init(); // optional; useful while the click still has user activation
 *   player.start({ inputSampleRate: ready.output_sample_rate });
 *   player.feed(base64PcmChunk);
 *   player.flush(); // barge-in; keeps the AudioContext alive
 *   player.stop();  // end call; closes the AudioContext
 */
export class RealtimeAudioPlayer {
  constructor({ maxQueueSec = MAX_QUEUE_SEC } = {}) {
    if (!Number.isFinite(maxQueueSec) || maxQueueSec <= 0 || maxQueueSec > MAX_QUEUE_SEC) {
      throw new RangeError('maxQueueSec must be between 0 and 2 seconds.');
    }

    this._audioCtx = null;
    this._processor = null;
    this._gainNode = null;
    this._buffer = []; // Float32 chunks at the AudioContext rate
    this._totalBuffered = 0;
    this._playing = false;
    this._audible = false;
    this._started = false;
    this._readPos = 0;
    this._currentChunk = null;
    this._onPlayingChange = null;
    this._onRmsUpdate = null;
    this._volume = 1;

    this._inputSampleRate = null;
    this._playbackSampleRate = null;
    this._resampler = null;
    this._maxQueueSec = maxQueueSec;
    this._maxBufferSamples = 0;

    this._targetBufferSamples = 0;
    this._arrivalTimes = [];
    this._lastArrivalTime = 0;
    this._rmsLevel = 0;
  }

  set onPlayingChange(fn) { this._onPlayingChange = fn; }
  set onRmsUpdate(fn) { this._onRmsUpdate = fn; }

  /** Khởi tạo AudioContext. Gọi trong user gesture handler khi có thể. */
  init() {
    if (this._audioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Trình duyệt không hỗ trợ phát âm thanh.');
    const audioCtx = new AudioCtx();
    let gainNode;
    try {
      this._playbackSampleRate = normalizePlaybackRate(audioCtx.sampleRate);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = this._volume;
      gainNode.connect(audioCtx.destination);
      this._audioCtx = audioCtx;
      this._gainNode = gainNode;
    } catch (error) {
      try { gainNode?.disconnect(); } catch { /* ignore */ }
      try { audioCtx.close().catch(() => {}); } catch { /* ignore */ }
      this._playbackSampleRate = null;
      throw error;
    }
  }

  resume() {
    if (this._audioCtx?.state === 'suspended') this._audioCtx.resume().catch(() => {});
  }

  setVolume(level) {
    const numeric = Number(level);
    this._volume = Number.isFinite(numeric)
      ? Math.max(0, Math.min(1, numeric))
      : 0;
    if (this._gainNode) this._gainNode.gain.value = this._volume;
    if (this._volume === 0) this._setAudible(false);
  }

  getVolume() { return this._volume; }
  get rmsLevel() { return this._rmsLevel; }
  get bufferSec() {
    const rate = this._playbackSampleRate || DEFAULT_INPUT_SAMPLE_RATE;
    return this._targetBufferSamples / rate;
  }
  get queuedSec() {
    const rate = this._playbackSampleRate || DEFAULT_INPUT_SAMPLE_RATE;
    return this._totalBuffered / rate;
  }

  /** Start playback using the output PCM rate from session.ready. */
  start({ inputSampleRate = this._inputSampleRate || DEFAULT_INPUT_SAMPLE_RATE } = {}) {
    const sourceRate = normalizeSampleRate(inputSampleRate);
    if (this._playing) return;
    if (!this._audioCtx) this.init();
    this.resume();

    this._inputSampleRate = sourceRate;
    this._playbackSampleRate = normalizePlaybackRate(this._audioCtx.sampleRate);
    this._resampler = createResampler(this._inputSampleRate, this._playbackSampleRate);
    this._maxBufferSamples = Math.max(1, Math.floor(this._playbackSampleRate * this._maxQueueSec));
    this._resetBufferState();
    this._playing = true;

    try {
      this._processor = this._audioCtx.createScriptProcessor(4096, 1, 1);
      this._processor.onaudioprocess = (event) => this._process(event);
      this._processor.connect(this._gainNode);
    } catch (error) {
      // start() may be called after init() during a browser/device failure.
      // Release the processor and context just as stop() would, then surface
      // the error to the caller instead of leaving a live audio graph behind.
      this._playing = false;
      this._resampler = null;
      try { this._processor?.disconnect(); } catch { /* ignore */ }
      try { if (this._processor) this._processor.onaudioprocess = null; } catch { /* ignore */ }
      this._processor = null;
      try { this._gainNode?.disconnect(); } catch { /* ignore */ }
      try { this._audioCtx.close().catch(() => {}); } catch { /* ignore */ }
      this._audioCtx = null;
      this._gainNode = null;
      this._resetBufferState();
      throw error;
    }
    // The processor may be started well before any response PCM arrives. Only
    // actual output callbacks report audibility (and duck the mic).
  }

  /** Feed a PCM chunk; reject the entire chunk when the queue cannot hold it. */
  feed(base64Pcm) {
    if (!this._playing || !this._resampler) return false;
    try {
      const int16 = base64ToInt16(base64Pcm);
      if (int16.length === 0) return false;
      const converted = this._resampler.process(int16ToFloat32(int16));
      if (converted.length === 0) return false;
      // Drop newest, whole chunks on overflow: never play a truncated PCM
      // fragment or retain more than maxQueueSec of decoded playback samples.
      if (converted.length > this._maxBufferSamples - this._totalBuffered) return false;

      this._computeRms(int16);
      this._trackArrival(performance.now());
      this._buffer.push(converted);
      this._totalBuffered += converted.length;
      if (!this._started && this._totalBuffered >= this._targetBufferSamples) {
        this._started = true;
      }
      return true;
    } catch {
      // Bad base64/PCM — skip the chunk without killing the call.
      return false;
    }
  }

  /** Dừng phát và dọn buffer. Chỉ gọi khi END CALL. */
  stop() {
    this._playing = false;
    this._setAudible(false);
    this._started = false;
    this._buffer = [];
    this._totalBuffered = 0;
    this._readPos = 0;
    this._currentChunk = null;
    this._rmsLevel = 0;
    this._resampler = null;
    if (this._processor) {
      try { this._processor.onaudioprocess = null; } catch { /* ignore */ }
      try { this._processor.disconnect(); } catch { /* ignore */ }
      this._processor = null;
    }
    if (this._audioCtx) {
      try { this._gainNode?.disconnect(); } catch { /* ignore */ }
      try { this._audioCtx.close().catch(() => {}); } catch { /* ignore */ }
      this._audioCtx = null;
      this._gainNode = null;
    }
  }

  /** Flush pending response audio while keeping AudioContext + processor alive. */
  flush() {
    this._setAudible(false);
    this._resetBufferState();
    this._resampler?.reset();
  }

  get isPlaying() { return this._playing; }

  _resetBufferState() {
    this._buffer = [];
    this._totalBuffered = 0;
    this._readPos = 0;
    this._currentChunk = null;
    this._started = false;
    this._rmsLevel = 0;
    this._arrivalTimes = [];
    this._lastArrivalTime = 0;
    const rate = this._playbackSampleRate || DEFAULT_INPUT_SAMPLE_RATE;
    this._targetBufferSamples = Math.min(
      Math.round(rate * INITIAL_BUFFER_SEC),
      this._maxBufferSamples || Math.round(rate * this._maxQueueSec),
    );
  }

  _trackArrival(now) {
    if (this._lastArrivalTime > 0) {
      this._arrivalTimes.push(now - this._lastArrivalTime);
      if (this._arrivalTimes.length > ARRIVAL_HISTORY_SIZE) this._arrivalTimes.shift();
      this._adaptJitterBuffer();
    }
    this._lastArrivalTime = now;
  }

  _adaptJitterBuffer() {
    if (this._arrivalTimes.length < 5) return;
    const n = this._arrivalTimes.length;
    let sum = 0;
    for (const interval of this._arrivalTimes) sum += interval;
    const mean = sum / n;
    let variance = 0;
    for (const interval of this._arrivalTimes) variance += (interval - mean) ** 2;
    const stddev = Math.sqrt(variance / n);
    const targetSec = Math.min(
      Math.max((mean + stddev * 2) / 1000, MIN_BUFFER_SEC),
      MAX_BUFFER_SEC,
    );
    const rate = this._playbackSampleRate || DEFAULT_INPUT_SAMPLE_RATE;
    const targetSamples = Math.round(targetSec * rate);
    if (targetSamples > this._targetBufferSamples) {
      this._targetBufferSamples = Math.min(
        Math.round(this._targetBufferSamples + (targetSamples - this._targetBufferSamples) * 0.3),
        this._maxBufferSamples,
      );
    } else {
      this._targetBufferSamples = Math.max(
        Math.round(this._targetBufferSamples * BUFFER_DECAY_FACTOR),
        Math.round(MIN_BUFFER_SEC * rate),
      );
    }
  }

  _computeRms(int16) {
    if (!int16.length) return;
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < int16.length; i += 4) {
      const sample = int16[i] / 32768;
      sumSq += sample * sample;
      count += 1;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    this._rmsLevel = this._rmsLevel * 0.7 + rms * 0.3;
    this._notifyRms();
  }

  _process(event) {
    const output = event.outputBuffer.getChannelData(0);
    const n = output.length;
    if (!this._playing || !this._started) {
      output.fill(0);
      this._setAudible(false);
      return;
    }

    let written = 0;
    let hasAudibleSample = false;
    while (written < n) {
      if (!this._currentChunk || this._readPos >= this._currentChunk.length) {
        if (this._buffer.length === 0) {
          output.fill(0, written);
          this._started = false;
          const rate = this._playbackSampleRate || DEFAULT_INPUT_SAMPLE_RATE;
          this._targetBufferSamples = Math.min(
            Math.round(this._targetBufferSamples * BUFFER_GROWTH_FACTOR),
            Math.round(MAX_BUFFER_SEC * rate),
            this._maxBufferSamples,
          );
          this._setAudible(hasAudibleSample && (this._gainNode?.gain.value || 0) > 0);
          return;
        }
        this._currentChunk = this._buffer.shift();
        this._readPos = 0;
      }

      const available = this._currentChunk.length - this._readPos;
      const toWrite = Math.min(available, n - written);
      const samples = this._currentChunk.subarray(this._readPos, this._readPos + toWrite);
      output.set(samples, written);
      if (!hasAudibleSample) {
        // A queued chunk may contain only silence; do not duck the mic until
        // an actual non-silent sample reaches the output device.
        for (let i = 0; i < samples.length; i += 1) {
          if (Math.abs(samples[i]) > 1 / 32768) {
            hasAudibleSample = true;
            break;
          }
        }
      }
      this._readPos += toWrite;
      this._totalBuffered -= toWrite;
      written += toWrite;
    }
    this._setAudible(hasAudibleSample && (this._gainNode?.gain.value || 0) > 0);
  }

  _setAudible(value) {
    const audible = Boolean(value);
    if (audible === this._audible) return;
    this._audible = audible;
    this._notifyPlaying(audible);
  }

  _notifyPlaying(isPlaying) {
    try { this._onPlayingChange?.(isPlaying); } catch { /* ignore */ }
  }

  _notifyRms() {
    try { this._onRmsUpdate?.(this._rmsLevel); } catch { /* ignore */ }
  }
}
