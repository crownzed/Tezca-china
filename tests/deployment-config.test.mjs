import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { loadSource } from './helpers/load-source.mjs';

const root = new URL('../', import.meta.url);
const backendOrigin = 'https://tezca-china.fly.dev';
const buildScripts = [
  'scripts/generate-hanzi-data.mjs',
  'scripts/sync-exam-passages.mjs',
  'scripts/validate-exam-passages.mjs',
  'scripts/validate-grammar-pool.mjs',
  'scripts/sync-grammar-pool.mjs',
  'scripts/validate-grammar.mjs',
  'scripts/validate-conversation-bank.mjs',
];
const buildData = [
  'backend/app/data/exam_passages.json',
  'backend/app/data/grammar_pool.json',
  'backend/app/data/conversation_scenarios.json',
  'backend/app/data/words_export.json',
];
const ignorePatterns = (await readFile(new URL('.vercelignore', root), 'utf8'))
  .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));

// Static deployment contracts, not an emulation of Vercel's routing or upload collector.
test('API and health rewrites precede the SPA fallback', async () => {
  const { rewrites } = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const apiSources = new Map([
    ['/api/(.*)', `${backendOrigin}/api/$1`],
    ['/api/:path*', `${backendOrigin}/api/:path*`],
  ]);
  const apiIndex = rewrites.findIndex(rule => apiSources.has(rule.source));
  const healthIndex = rewrites.findIndex(rule => rule.source === '/health');
  const spaIndex = rewrites.findIndex(rule => rule.source === '/(.*)' && rule.destination === '/index.html');

  assert.ok(apiIndex >= 0, 'API proxy is required');
  assert.ok(healthIndex >= 0, 'health proxy is required');
  assert.ok(spaIndex >= 0, 'SPA deep-link fallback is required');
  assert.equal(rewrites[apiIndex].destination, apiSources.get(rewrites[apiIndex].source));
  assert.equal(rewrites[healthIndex].destination, `${backendOrigin}/health`);
  assert.ok(apiIndex < spaIndex, 'API must not be swallowed by the SPA fallback');
  assert.ok(healthIndex < spaIndex, 'health must not be swallowed by the SPA fallback');
});

test('CLI source package explicitly allows build scripts and their data inputs', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const entryScripts = [...pkg.scripts.build.matchAll(/\bnode\s+(scripts\/[^\s&]+\.mjs)/g)]
    .map(match => match[1]);
  assert.ok(entryScripts.length > 0, 'build must have its source inputs checked');
  for (const path of entryScripts) assert.ok(buildScripts.includes(path), `unlisted build script: ${path}`);

  for (const path of buildScripts) {
    const source = await readFile(new URL(path, root), 'utf8');
    for (const match of source.matchAll(/\bfrom\s+['"]\.\/([^'"]+\.mjs)['"]/g)) {
      assert.ok(buildScripts.includes(`scripts/${match[1]}`), `unlisted build dependency: ${match[1]}`);
    }
  }
  for (const path of [...buildScripts, ...buildData]) {
    assert.ok(ignorePatterns.includes(`!${path}`), `missing upload allowlist: ${path}`);
    const info = await stat(new URL(path, root)).catch(error => {
      if (path === 'backend/app/data/words_export.json' && error.code === 'ENOENT') return null;
      throw error;
    });
    if (info) assert.ok(info.isFile(), `build input is not a file: ${path}`);
  }

  for (const parent of ['scripts/', 'backend/', 'backend/app/', 'backend/app/data/']) {
    assert.ok(!ignorePatterns.includes(parent), `parent exclusion prevents re-including build inputs: ${parent}`);
  }
  for (const pattern of [
    'scripts/*', 'backend/*', '!backend/app/', 'backend/app/*',
    '!backend/app/data/', 'backend/app/data/*',
  ]) {
    assert.ok(ignorePatterns.includes(pattern), `missing selective exclusion: ${pattern}`);
  }
});

test('source packaging keeps environment files, databases and local tooling excluded', () => {
  for (const pattern of ['.env*', '*.db', '.git/', '.claude/', 'node_modules/', 'dist/', 'Tezca-Vault/']) {
    assert.ok(ignorePatterns.includes(pattern), `missing sensitive/local exclusion: ${pattern}`);
  }
  const allowedBuildInputs = new Set([
    ...buildScripts.map(path => `!${path}`),
    ...buildData.map(path => `!${path}`),
    '!backend/app/', '!backend/app/data/',
  ]);
  assert.deepEqual(new Set(ignorePatterns.filter(pattern => pattern.startsWith('!'))), allowedBuildInputs);
});

function response(body, { status = 200, contentType = 'application/json; charset=utf-8' } = {}) {
  let jsonReads = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    async json() { jsonReads += 1; return structuredClone(body); },
    get jsonReads() { return jsonReads; },
  };
}

async function apiHarness(metaEnv, reply) {
  const requests = [];
  const unused = () => { throw new Error('Unexpected app dependency in deployment test'); };
  const api = await loadSource('src/api-core.js', {
    metaEnv,
    imports: {
      './user-scope': { scopedKey: unused },
      './vocab-srs': { recordWordReview: unused },
      './auto-confidence.js': { inferConfidence: unused },
      './vocab-loader': { loadAllFlashcards: unused },
      './hsk-levels': { effectiveLevels: unused, primaryLevel: unused },
      './exam-items': { buildExamQuestions: unused },
      './ordering-contract.js': {
        ORDERING_VERSION: 'v1', OrderingError: Error,
        normalizeOrdering: unused, gradeOrdering: unused, scrambleOrder: unused,
      },
    },
    globals: {
      setTimeout: () => { throw new Error('Unexpected retry in deployment test'); },
      fetch: async (url, options = {}) => {
        requests.push({ url: String(url), method: options.method || 'GET', headers: { ...options.headers } });
        return reply;
      },
    },
  });
  return { api, requests };
}

for (const [label, metaEnv] of [
  ['absent', { PROD: true }],
  ['empty', { PROD: true, VITE_API_BASE: '' }],
]) {
  test(`production with ${label} API base uses same-origin and accepts JSON`, async () => {
    const body = [{ id: 1, hanzi: '好' }];
    const reply = response(body);
    const { api, requests } = await apiHarness(metaEnv, reply);
    assert.deepEqual(await api.getWords([1, 2]), body);
    assert.equal(requests[0].url, '/api/words?level=1&level=2');
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests.length, 1);
    assert.equal(reply.jsonReads, 1);
  });
}

test('explicit production API base preserves direct-backend requests', async () => {
  const reply = response([]);
  const { api, requests } = await apiHarness({ PROD: true, VITE_API_BASE: backendOrigin }, reply);
  assert.deepEqual(await api.getWords(1), []);
  assert.equal(requests[0].url, `${backendOrigin}/api/words?level=1`);
  assert.equal(requests.length, 1);
});

test('a 200 HTML SPA fallback is rejected before JSON parsing, without retries', async () => {
  const reply = response('<!doctype html><html></html>', { contentType: 'text/html; charset=utf-8' });
  const { api, requests } = await apiHarness({ PROD: true }, reply);
  await assert.rejects(api.getWords(1), {
    message: 'Expected JSON from /api/words?level=1 but got "text/html; charset=utf-8" (API_BASE may be misconfigured)',
  });
  assert.equal(reply.jsonReads, 0);
  assert.equal(requests.length, 1);
});

for (const token of [null, 'offline-test-token']) {
  test(`JSON 401 is an error ${token ? 'with' : 'without'} a user token`, async () => {
    const reply = response({ detail: 'Not authenticated' }, { status: 401 });
    const { api, requests } = await apiHarness({ PROD: true }, reply);
    let authExpired = 0;
    api.setAuthToken(token);
    api.setAuthExpiredHandler(() => { authExpired += 1; });
    await assert.rejects(api.getWords(1), { message: 'Not authenticated', status: 401 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.Authorization, token ? `Bearer ${token}` : undefined);
    assert.equal(reply.jsonReads, 1);
    assert.equal(authExpired, token ? 1 : 0);
  });
}
