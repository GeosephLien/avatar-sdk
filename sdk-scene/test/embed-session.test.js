import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmbedSession } from '../services/embed-session.js';

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function createSession(fetchImpl) {
  return createEmbedSession({
    apiBase: 'https://api.example',
    fetchImpl,
    storage: { getItem: () => 'anon_1234567890abcdef', setItem: () => {} },
    cryptoObject: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' }
  });
}

test('reuses one session across concurrent launch requests', async () => {
  const calls = [];
  const session = createSession(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/session')) return response(200, { sessionToken: 'session-1' });
    return response(200, { launchToken: 'launch-1' });
  });
  assert.deepEqual(await Promise.all([session.createLaunchToken(), session.createLaunchToken()]), ['launch-1', 'launch-1']);
  assert.equal(calls.filter(({ url }) => url.endsWith('/session')).length, 1);
  assert.equal(calls.some(({ url }) => url.includes('/api/embed/avatar')), false);
});

test('refreshes an expired session once', async () => {
  let sessionCount = 0;
  let launchCount = 0;
  const session = createSession(async (url) => {
    if (url.endsWith('/session')) return response(200, { sessionToken: `session-${++sessionCount}` });
    launchCount += 1;
    return launchCount === 1 ? response(401, {}) : response(200, { launchToken: 'launch-2' });
  });
  assert.equal(await session.createLaunchToken(), 'launch-2');
  assert.equal(sessionCount, 2);
  assert.equal(launchCount, 2);
});