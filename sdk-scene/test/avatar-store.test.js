import assert from 'node:assert/strict';
import test from 'node:test';

import { createAvatarStore } from '../services/avatar-store.js';

function recordingStore(name, calls) {
  return {
    getAvatar: async () => { calls.push(`${name}:get`); return name; },
    saveAvatar: async () => { calls.push(`${name}:save`); return name; },
    releaseAvatar: () => { calls.push(`${name}:release`); }
  };
}

test('routes every operation through the local store', async () => {
  const calls = [];
  const store = createAvatarStore({
    localStore: recordingStore('local', calls)
  });
  await store.getAvatar();
  await store.saveAvatar({});
  store.releaseAvatar({});
  assert.deepEqual(calls, ['local:get', 'local:save', 'local:release']);
});