import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

function makeTrack({ throws = false } = {}) {
  return {
    stopCalls: 0,
    stop() {
      this.stopCalls += 1;
      if (throws) throw new Error('track stop failed');
    },
  };
}

function makeStream(tracks = [makeTrack()]) {
  return {
    tracks,
    getTracks() {
      return this.tracks;
    },
  };
}

function makeBrowser({
  stream = makeStream(),
  getUserMedia = async () => stream,
  createSourceError = null,
  sourceConnectError = null,
  processorConnectError = null,
} = {}) {
  const contexts = [];

  class FakeProcessor {
    constructor(config) {
      this.config = config;
      this.onaudioprocess = null;
      this.disconnectCalls = 0;
      this.connectCalls = 0;
    }

    connect() {
      this.connectCalls += 1;
      if (this.config.processorConnectError) throw this.config.processorConnectError;
    }

    disconnect() {
      this.disconnectCalls += 1;
    }

    emit(samples) {
      this.onaudioprocess?.({
        inputBuffer: { getChannelData: () => samples },
      });
    }
  }

  class FakeSource {
    constructor(config) {
      this.config = config;
      this.disconnectCalls = 0;
      this.connectCalls = 0;
    }

    connect() {
      this.connectCalls += 1;
      if (this.config.sourceConnectError) throw this.config.sourceConnectError;
    }

    disconnect() {
      this.disconnectCalls += 1;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = {};
      this.config = { createSourceError, sourceConnectError, processorConnectError };
      this.source = null;
      this.processor = null;
      this.closeCalls = 0;
      this.resumeCalls = 0;
      contexts.push(this);
    }

    resume() {
      this.resumeCalls += 1;
      return Promise.resolve();
    }

    close() {
      this.closeCalls += 1;
      return Promise.resolve();
    }

    createMediaStreamSource() {
      if (this.config.createSourceError) throw this.config.createSourceError;
      this.source = new FakeSource(this.config);
      return this.source;
    }

    createScriptProcessor() {
      this.processor = new FakeProcessor(this.config);
      return this.processor;
    }
  }

  return {
    contexts,
    stream,
    globals: {
      window: { AudioContext: FakeAudioContext, webkitAudioContext: undefined },
      navigator: { mediaDevices: { getUserMedia } },
    },
  };
}

async function loadMic({ browser, supported = true, actions = [] } = {}) {
  const vadCalls = [];
  const namespace = await loadSource('src/realtime/streaming-mic.js', {
    imports: {
      '../voice-vad.js': {
        createVadState(sampleRate, options) {
          const state = { sampleRate, options, speaking: false };
          vadCalls.push(['create', state]);
          return state;
        },
        feedVad(state, samples, options) {
          vadCalls.push(['feed', state, samples.length, options]);
          return {
            action: actions.shift() || 'silence',
            utteranceMs: 500,
            rms: 0.25,
          };
        },
      },
      '../speech-ai.js': {
        isRecordingSupported: () => supported,
      },
    },
    globals: browser.globals,
  });
  return { ...namespace, vadCalls };
}

test('getUserMedia failure closes the AudioContext', async () => {
  const browser = makeBrowser({
    getUserMedia: async () => {
      throw new Error('permission denied');
    },
  });
  const { startStreamingMic } = await loadMic({ browser });

  await assert.rejects(startStreamingMic(), /permission denied/);
  assert.equal(browser.contexts[0].closeCalls, 1);
});

test('setup failure releases every track even when one track stop throws', async () => {
  const tracks = [makeTrack({ throws: true }), makeTrack()];
  const browser = makeBrowser({
    stream: makeStream(tracks),
    createSourceError: new Error('source unavailable'),
  });
  const { startStreamingMic } = await loadMic({ browser });

  await assert.rejects(startStreamingMic(), /source unavailable/);
  assert.deepEqual(tracks.map(track => track.stopCalls), [1, 1]);
  assert.equal(browser.contexts[0].closeCalls, 1);
});

test('connection failure disconnects created nodes and closes the context', async () => {
  const tracks = [makeTrack()];
  const browser = makeBrowser({
    stream: makeStream(tracks),
    sourceConnectError: new Error('source connect failed'),
  });
  const { startStreamingMic } = await loadMic({ browser });

  await assert.rejects(startStreamingMic(), /source connect failed/);
  const { source, processor } = browser.contexts[0];
  assert.equal(source.disconnectCalls, 1);
  assert.equal(processor.disconnectCalls, 1);
  assert.equal(processor.onaudioprocess, null);
  assert.equal(tracks[0].stopCalls, 1);
  assert.equal(browser.contexts[0].closeCalls, 1);
});

test('stop is idempotent and late audio callbacks are ignored', async () => {
  const browser = makeBrowser();
  const { startStreamingMic } = await loadMic({ browser });
  const states = [];
  const pcmChunks = [];
  const controller = await startStreamingMic({
    onPcmChunk: chunk => pcmChunks.push(chunk),
    onState: state => states.push(state),
  });
  const { processor } = browser.contexts[0];
  const lateCallback = processor.onaudioprocess;
  const samples = new Float32Array(480).fill(0.25);

  controller.stop();
  controller.stop();
  lateCallback({ inputBuffer: { getChannelData: () => samples } });

  assert.equal(states.length, 0);
  assert.equal(pcmChunks.length, 0);
  assert.equal(browser.contexts[0].closeCalls, 1);
  assert.equal(browser.stream.tracks[0].stopCalls, 1);
  assert.equal(browser.contexts[0].source.disconnectCalls, 1);
  assert.equal(browser.contexts[0].processor.disconnectCalls, 1);
});

test('normal processing preserves PCM chunks and 16 kHz WAV utterances', async () => {
  const browser = makeBrowser();
  const { startStreamingMic, vadCalls } = await loadMic({
    browser,
    actions: ['speech-start', 'utterance-end'],
  });
  const pcmChunks = [];
  const utterances = [];
  const controller = await startStreamingMic({
    onPcmChunk: chunk => pcmChunks.push(chunk),
    onUtteranceComplete: (...args) => utterances.push(args),
  });
  const { processor } = browser.contexts[0];
  const samples = new Float32Array(480).fill(0.25);

  processor.emit(samples);
  processor.emit(samples);

  assert.equal(vadCalls.filter(([name]) => name === 'feed').length, 2);
  assert.equal(pcmChunks.length, 2);
  assert.equal(Buffer.from(pcmChunks[0], 'base64').length, 320);
  assert.equal(utterances.length, 1);
  assert.equal(utterances[0][1], 'audio/wav');

  const wav = Buffer.from(utterances[0][0], 'base64');
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), 320);
  assert.equal(wav.length, 364);

  controller.stop();
});
