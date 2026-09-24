import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, loadSource } from './helpers/load-source.mjs';

async function setup(callbacks = {}) {
  const requests = [];
  const events = [];
  const speech = [];
  const { PipelineCallSession } = await loadSource('src/realtime/pipeline-call.js', {
    imports: {
      '../api-core.js': {
        streamVoiceChat(payload, onEvent, { signal }) {
          const response = deferred();
          requests.push({ payload, onEvent, signal, ...response });
          return response.promise;
        },
      },
      '../speech.jsx': {
        beginSpeechQueue: () => speech.push(['begin']),
        setSpeechQueueStreaming: value => speech.push(['streaming', value]),
        speakQueued: text => speech.push(['speak', text]),
        interruptSpeech: () => speech.push(['interrupt']),
        stopSpeech: () => speech.push(['stop']),
      },
    },
  });
  const options = Object.fromEntries([
    'onTranscript', 'onAsrDelta', 'onSentence', 'onReplyDone', 'onError', 'onState',
  ].map(name => [name, (...args) => {
    events.push([name, ...args]);
    callbacks[name]?.(...args);
  }]));
  const session = new PipelineCallSession(options);
  return { session, requests, events, speech, PipelineCallSession };
}

const reply = { reply_cn: '你好！', reply_vi: 'Xin chào!' };

test('voice flow preserves ASR deltas, transcript, TTS and history for the next turn', async () => {
  const { session, requests, events, speech } = await setup();
  const pending = session.processUtterance('wav-data', 'audio/wav');
  assert.equal(session.isProcessing, true);
  assert.deepEqual(structuredClone(requests[0].payload), {
    audio_base64: 'wav-data', mime_type: 'audio/wav', text: '', history: [],
  });
  requests[0].onEvent({ type: 'asr_delta', delta: '你' });
  requests[0].onEvent({ type: 'asr_delta', delta: '好' });
  requests[0].onEvent({ type: 'transcript', user_text: '  你好  ' });
  requests[0].onEvent({ type: 'sentence', text: '  你好！  ' });
  requests[0].resolve(reply);
  await pending;

  assert.equal(session.isProcessing, false);
  assert.deepEqual(events, [
    ['onState', 'asr'], ['onAsrDelta', '你'], ['onAsrDelta', '好'],
    ['onTranscript', '你好'], ['onState', 'chat'], ['onSentence', '你好！'],
    ['onReplyDone', '你好！', 'Xin chào!'], ['onState', 'idle'],
  ]);
  assert.deepEqual(speech, [['begin'], ['streaming', true], ['speak', '你好！']]);

  const next = session.sendText('  再见  ');
  assert.deepEqual(structuredClone(requests[1].payload), {
    audio_base64: '', mime_type: 'text/plain', text: '再见',
    history: [
      { role: 'user', cn: '你好', vi: '' },
      { role: 'model', cn: '你好！', vi: 'Xin chào!' },
      { role: 'user', cn: '再见', vi: '' },
    ],
  });
  requests[1].onEvent({ type: 'sentence', text: '  再见！  ' });
  requests[1].resolve({ reply_cn: '再见！', reply_vi: 'Tạm biệt!' });
  await next;
  assert.deepEqual(speech.at(-1), ['speak', '再见！']);
  assert.equal(events.filter(([name, state]) => name === 'onState' && state === 'idle').length, 2);
  session.destroy();
});

test('blank messages and concurrent voice/text submissions do not start extra requests', async () => {
  const { session, requests, events } = await setup();
  await session.sendText('   ');
  assert.equal(requests.length, 0);
  assert.equal(events.length, 0);
  const pending = session.sendText('你好');
  await session.sendText('ignored');
  await session.processUtterance('ignored', 'audio/wav');
  assert.equal(requests.length, 1);
  requests[0].resolve(reply);
  await pending;
  assert.equal(session.isProcessing, false);
  session.destroy();
});

test('empty final transcript finishes once without adding a model turn', async () => {
  const { session, requests, events } = await setup();
  const pending = session.processUtterance('wav-data', 'audio/wav');
  requests[0].onEvent({ type: 'transcript', user_text: '' });
  requests[0].resolve(reply);
  await pending;
  assert.equal(session.isProcessing, false);
  assert.equal(session._history.length, 0);
  assert.equal(events.filter(([name]) => name === 'onReplyDone').length, 0);
  assert.equal(events.filter(([name, state]) => name === 'onState' && state === 'idle').length, 1);
  session.destroy();
});

for (const mode of ['voice', 'text']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`${mode}: late events and ${outcome} after destroy have no side effects`, async () => {
      const { session, requests, events, speech } = await setup();
      const pending = mode === 'voice'
        ? session.processUtterance('wav-data', 'audio/wav')
        : session.sendText('你好');
      const request = requests[0];
      session.destroy();
      assert.equal(request.signal.aborted, true);
      assert.equal(session.isProcessing, false);
      const snapshot = { events: [...events], speech: [...speech] };

      request.onEvent({ type: 'asr_delta', delta: 'late' });
      request.onEvent({ type: 'transcript', user_text: 'late' });
      request.onEvent({ type: 'sentence', text: 'late' });
      if (outcome === 'resolve') request.resolve(reply);
      else request.reject(new Error('late failure'));
      await pending;
      assert.deepEqual(events, snapshot.events);
      assert.deepEqual(speech, snapshot.speech);
      assert.equal(session._history.length, 0);
      assert.equal(session.isProcessing, false);
      await session.sendText('ignored');
      await session.processUtterance('ignored', 'audio/wav');
      assert.equal(requests.length, 1);
    });
  }

  test(`${mode}: active errors notify once and release the next request`, async () => {
    const { session, requests, events } = await setup();
    const pending = mode === 'voice'
      ? session.processUtterance('wav-data', 'audio/wav')
      : session.sendText('你好');
    requests[0].reject(new Error('offline failure'));
    await pending;
    assert.equal(session.isProcessing, false);
    assert.deepEqual(events.slice(-2), [['onError', 'offline failure'], ['onState', 'idle']]);
    const next = session.sendText('再试');
    assert.equal(requests.length, 2);
    requests[1].resolve(reply);
    await next;
    session.destroy();
  });

  test(`${mode}: destroying from a sentence callback prevents queued TTS and completion`, async () => {
    let session;
    const harness = await setup({ onSentence: () => session.destroy() });
    session = harness.session;
    const pending = mode === 'voice'
      ? session.processUtterance('wav-data', 'audio/wav')
      : session.sendText('你好');
    if (mode === 'voice') harness.requests[0].onEvent({ type: 'transcript', user_text: '你好' });
    harness.requests[0].onEvent({ type: 'sentence', text: '你好！' });
    harness.requests[0].resolve(reply);
    await pending;
    assert.equal(harness.speech.some(([name]) => name === 'speak'), false);
    assert.equal(harness.events.some(([name]) => name === 'onReplyDone'), false);
    assert.equal(session._history.length, 0);
    assert.equal(session.isProcessing, false);
  });

  test(`${mode}: destroying from transcript callback prevents history and follow-up work`, async () => {
    let session;
    const harness = await setup({ onTranscript: () => session.destroy() });
    session = harness.session;
    const pending = mode === 'voice'
      ? session.processUtterance('wav-data', 'audio/wav')
      : session.sendText('你好');
    if (mode === 'voice') {
      harness.requests[0].onEvent({ type: 'transcript', user_text: '你好' });
      harness.requests[0].resolve(reply);
    } else {
      assert.equal(harness.requests.length, 0);
    }
    await pending;
    assert.equal(session._history.length, 0);
    assert.equal(session.isProcessing, false);
    assert.equal(harness.events.some(([name, state]) => name === 'onState' && state === 'chat'), false);
  });
}

test('destroy is idempotent and old cleanup cannot stop a newer session', async () => {
  const { session, speech, requests, PipelineCallSession } = await setup();
  session.bargeIn();
  session.destroy();
  const newer = new PipelineCallSession();
  const pending = newer.sendText('新会话');
  const snapshot = [...speech];
  session.destroy();
  session.bargeIn();
  assert.deepEqual(speech, snapshot);
  assert.equal(requests[0].signal.aborted, false);
  assert.equal(newer.isProcessing, true);
  requests[0].resolve(reply);
  await pending;
  newer.destroy();
  assert.deepEqual(speech.filter(([name]) => name === 'stop'), [['stop'], ['stop']]);
});

test('history keeps the existing 20-turn payload and 40-turn storage limits', async () => {
  const { session, requests } = await setup();
  for (let i = 0; i < 25; i++) {
    const pending = session.sendText(`user-${i}`);
    const request = requests[i];
    assert.ok(request.payload.history.length <= 20);
    request.resolve({ reply_cn: `reply-${i}`, reply_vi: `vi-${i}` });
    await pending;
  }
  assert.equal(session._history.length, 40);
  assert.equal(session._history[0].cn, 'user-5');
  assert.equal(session._history.at(-1).cn, 'reply-24');
  assert.equal(requests.at(-1).payload.history.length, 20);
  assert.equal(requests.at(-1).payload.history.at(-1).cn, 'user-24');
  session.destroy();
});
