import assert from 'node:assert/strict';
import test from 'node:test';

import { createAvatarCreatorStore, validateAvatarCreatorStore } from './avatar-creator-store.js';

function recordingStore(name, calls) {
  return {
    getAvatar: async () => { calls.push(`${name}:get`); return name; },
    getDownloadPayload: async () => { calls.push(`${name}:download`); return name; },
    saveAvatar: async () => { calls.push(`${name}:save`); return name; },
    releaseAvatar: () => { calls.push(`${name}:release`); }
  };
}

test('routes every operation through the local store', async () => {
  const calls = [];
  const store = createAvatarCreatorStore({
    localStore: recordingStore('local', calls)
  });
  await store.getAvatar();
  await store.getDownloadPayload();
  await store.saveAvatar({});
  store.releaseAvatar({});
  assert.deepEqual(calls, ['local:get', 'local:download', 'local:save', 'local:release']);
});

test('requires the complete Avatar Creator store contract', () => {
  const completeStore = recordingStore('custom', []);
  assert.equal(validateAvatarCreatorStore(completeStore), completeStore);
  assert.throws(() => validateAvatarCreatorStore(null), /getAvatar, saveAvatar, and releaseAvatar/);
  assert.throws(() => validateAvatarCreatorStore({ saveAvatar() {} }), /getAvatar, saveAvatar, and releaseAvatar/);
});

test('keeps the download capability optional for custom stores', () => {
  const customStore = {
    getAvatar: async () => null,
    saveAvatar: async () => null,
    releaseAvatar() {}
  };
  assert.equal(validateAvatarCreatorStore(customStore), customStore);
  assert.equal('getDownloadPayload' in createAvatarCreatorStore({ localStore: customStore }), false);
});