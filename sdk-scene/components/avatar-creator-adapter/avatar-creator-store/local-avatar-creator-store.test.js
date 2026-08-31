import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalAvatarCreatorStore } from './local-avatar-creator-store.js';

function avatarFiles(name = 'avatar.vrm') {
  return {
    vrm: new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], name, { type: 'model/vrm' }),
    thumbnail: new File([new Uint8Array([0x89, 0x50])], 'thumbnail.png', { type: 'image/png' })
  };
}

function urlApi() {
  let nextId = 0;
  const revoked = [];
  return {
    revoked,
    createObjectURL: () => `blob:test-${++nextId}`,
    revokeObjectURL: (url) => revoked.push(url)
  };
}

test('saves one current record and overwrites it on the next Avatar', async () => {
  let current = null;
  const writes = [];
  const urls = urlApi();
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => current,
      putCurrent: async (record) => { current = { ...record, id: 'current' }; writes.push(current); }
    },
    urlObject: urls,
    now: () => '2026-08-23T00:00:00.000Z'
  });
  const first = await store.saveAvatar(avatarFiles('first.vrm'));
  const second = await store.saveAvatar(avatarFiles('second.vrm'));
  assert.equal(writes.length, 2);
  assert.equal(current.id, 'current');
  assert.equal(current.fileName, 'second.vrm');
  assert.equal(first.vrmUrl, 'blob:test-1');
  assert.equal(second.vrmUrl, 'blob:test-3');
});

test('restores persisted Blobs with fresh object URLs', async () => {
  const files = avatarFiles();
  const urls = urlApi();
  const store = createLocalAvatarCreatorStore({
    persistence: { getCurrent: async () => ({ vrmBlob: files.vrm, thumbnailBlob: files.thumbnail, fileName: 'avatar.vrm' }) },
    urlObject: urls
  });
  const first = await store.getAvatar();
  const second = await store.getAvatar();
  assert.notEqual(first.vrmUrl, second.vrmUrl);
  store.releaseAvatar(first);
  assert.deepEqual(urls.revoked, [first.vrmUrl, first.thumbnailUrl]);
});

test('persists Creator state with the Avatar and returns isolated descriptor copies', async () => {
  let current = null;
  const creatorState = {
    schemaVersion: 1,
    catalogVersion: '2026-08-29',
    characterId: 'iris',
    clothingId: 'template-01'
  };
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => current,
      putCurrent: async (record) => { current = structuredClone(record); }
    },
    urlObject: urlApi()
  });

  const saved = await store.saveAvatar({ ...avatarFiles(), creatorState });
  creatorState.characterId = 'mutated-outside';
  saved.creatorState.characterId = 'mutated-descriptor';
  const restored = await store.getAvatar();

  assert.equal(current.creatorState.characterId, 'iris');
  assert.equal(restored.creatorState.characterId, 'iris');
});

test('restores legacy Avatar records without Creator state', async () => {
  const files = avatarFiles();
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => ({ vrmBlob: files.vrm, thumbnailBlob: files.thumbnail, fileName: 'legacy.vrm' })
    },
    urlObject: urlApi()
  });

  const restored = await store.getAvatar();
  assert.equal(restored.fileName, 'legacy.vrm');
  assert.equal('creatorState' in restored, false);
});

test('returns persisted files and optional Creator state for download', async () => {
  const files = avatarFiles('download.vrm');
  const creatorState = {
    schemaVersion: 1,
    catalogVersion: '2026-08-29',
    characterId: 'iris'
  };
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => ({
        vrmBlob: files.vrm,
        thumbnailBlob: files.thumbnail,
        fileName: 'download.vrm',
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
        creatorState
      })
    },
    urlObject: urlApi()
  });

  const payload = await store.getDownloadPayload();
  assert.equal(payload.vrmBlob, files.vrm);
  assert.equal(payload.thumbnailBlob, files.thumbnail);
  assert.equal(payload.fileName, 'download.vrm');
  assert.deepEqual(payload.creatorState, creatorState);
});

test('restores persisted Avatar files while ignoring malformed optional Creator state', async () => {
  const files = avatarFiles();
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => ({
        vrmBlob: files.vrm,
        thumbnailBlob: files.thumbnail,
        fileName: 'avatar.vrm',
        creatorState: { schemaVersion: 99 }
      })
    },
    urlObject: urlApi()
  });

  const restored = await store.getAvatar();
  assert.equal(restored.fileName, 'avatar.vrm');
  assert.equal('creatorState' in restored, false);
});

test('silently falls back to page memory when persistence fails', async () => {
  const urls = urlApi();
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => { throw new Error('blocked'); },
      putCurrent: async () => { throw new Error('quota'); }
    },
    urlObject: urls
  });
  await store.saveAvatar(avatarFiles());
  assert.equal((await store.getAvatar()).fileName, 'avatar.vrm');
  assert.equal(await store.getDownloadPayload(), null);
});

test('keeps the volatile replacement when IndexedDB still contains an older Avatar', async () => {
  const oldFiles = avatarFiles('old.vrm');
  const store = createLocalAvatarCreatorStore({
    persistence: {
      getCurrent: async () => ({ vrmBlob: oldFiles.vrm, thumbnailBlob: oldFiles.thumbnail, fileName: 'old.vrm' }),
      putCurrent: async () => { throw new Error('quota'); }
    },
    urlObject: urlApi()
  });
  await store.saveAvatar(avatarFiles('new.vrm'));
  assert.equal((await store.getAvatar()).fileName, 'new.vrm');
  assert.equal(await store.getDownloadPayload(), null);
});

test('rejects invalid VRM and thumbnail data before persistence', async () => {
  let writes = 0;
  const store = createLocalAvatarCreatorStore({
    persistence: { putCurrent: async () => { writes += 1; } },
    urlObject: urlApi()
  });
  await assert.rejects(() => store.saveAvatar({
    vrm: new File([new Uint8Array([0, 1, 2, 3])], 'bad.vrm'),
    thumbnail: new File(['x'], 'thumbnail.gif', { type: 'image/gif' })
  }), /valid VRM/);
  assert.equal(writes, 0);
});