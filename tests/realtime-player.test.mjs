import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

function pcm16Base64(samples) {
  const values = Int16Array.from(samples);
  return Buffer.from(values.buffer).toString('base64');
}

function makeBrowser({ sampleRate = 48000, processorConnectError = null } = {}) {
  const contexts = [];

  class FakeGain {
    constructor() {
      this.gain = { value: 1 };
      this.disconnectCalls = 0;
    }
    connect(destination) { this.destination = destination; }
    disconnect() { this.disconnectCalls += 1; }
  }

  class FakeProcessor {
    constructor() {
      this.onaudioprocess = null;
      this.disconnectCalls = 0;
    }
    connect() {
      if (processorConnectError) throw processorConnectError;
    }
    disconnect() { this.disconnectCalls += 1; }
    emit(length = 128) {
      const samples = new Float32Array(length);
      this.onaudioprocess?.({ outputBuffer: { getChannelData: () => samples } });
      return samples;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.sampleRate = sampleRate;
      this.state = 'running';
      this.destination = {};
      this.processor = null;
      this.gain = null;
      this.closeCalls = 0;
      contexts.push(this);
    }
    resume() { return Promise.resolve(); }
    close() { this.closeCalls += 1; return Promise.resolve(); }
    createGain() { this.gain = new FakeGain(); return this.gain; }
    createScriptProcessor() { this.processor = new FakeProcessor(); return this.processor; }
  }

  return {
    contexts,
    globals: {
      window: { AudioContext: FakeAudioContext, webkitAudioContext: undefined },
      performance: { now: () => 100 },
    },
  };
}

async function loadPlayer(browser) {
  return loadSource('src/realtime/audio-player.js', {
    globals: browser.globals,
  });
}

test('player retains pre-init volume, resamples, and reports only non-silent output', async () => {
  const browser = makeBrowser({ sampleRate: 48000 });
  const { RealtimeAudioPlayer } = await loadPlayer(browser);
  const player = new RealtimeAudioPlayer();
  const transitions = [];
  player.onPlayingChange = value => transitions.push(value);

  player.setVolume(0.25);
  assert.equal(player.getVolume(), 0.25);
  player.init();
  assert.equal(browser.contexts[0].gain.gain.value, 0.25);
  player.start({ inputSampleRate: 16000 });

  assert.equal(player.feed(pcm16Base64(new Array(800).fill(0))), true);
  browser.contexts[0].processor.emit(128);
  assert.deepEqual(transitions, []);

  assert.equal(player.feed(pcm16Base64(new Array(800).fill(12000))), true);
  const output = browser.contexts[0].processor.emit(128);
  assert.ok(output.some(sample => sample !== 0));
  assert.deepEqual(transitions, [true]);

  player.flush();
  assert.deepEqual(transitions, [true, false]);
  player.stop();
  assert.equal(browser.contexts[0].closeCalls, 1);
});

test('player clears audibility after an underrun and caps whole chunks', async () => {
  const browser = makeBrowser({ sampleRate: 16000 });
  const { RealtimeAudioPlayer } = await loadPlayer(browser);
  const player = new RealtimeAudioPlayer({ maxQueueSec: 0.1 });
  const transitions = [];
  player.onPlayingChange = value => transitions.push(value);
  player.start({ inputSampleRate: 16000 });

  const chunk = pcm16Base64(new Array(800).fill(9000));
  assert.equal(player.feed(chunk), true);
  assert.equal(player.feed(chunk), false);
  browser.contexts[0].processor.emit(4096);
  assert.deepEqual(transitions, [true, false]);
  assert.equal(player.queuedSec, 0);
  player.stop();
});

test('failed processor setup releases player resources', async () => {
  const browser = makeBrowser({ processorConnectError: new Error('processor failed') });
  const { RealtimeAudioPlayer } = await loadPlayer(browser);
  const player = new RealtimeAudioPlayer();
  assert.throws(() => player.start({ inputSampleRate: 16000 }), /processor failed/);
  assert.equal(browser.contexts[0].closeCalls, 1);
  assert.equal(player.isPlaying, false);
});
