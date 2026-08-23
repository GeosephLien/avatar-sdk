import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalAvatarStore } from '../services/local-avatar-store.js';

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
  const store = createLocalAvatarStore({
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
  const store = createLocalAvatarStore({
    persistence: { getCurrent: async () => ({ vrmBlob: files.vrm, thumbnailBlob: files.thumbnail, fileName: 'avatar.vrm' }) },
    urlObject: urls
  });
  const first = await store.getAvatar();
  const second = await store.getAvatar();
  assert.notEqual(first.vrmUrl, second.vrmUrl);
  store.releaseAvatar(first);
  assert.deepEqual(urls.revoked, [first.vrmUrl, first.thumbnailUrl]);
});

test('silently falls back to page memory when persistence fails', async () => {
  const urls = urlApi();
  const store = createLocalAvatarStore({
    persistence: {
      getCurrent: async () => { throw new Error('blocked'); },
      putCurrent: async () => { throw new Error('quota'); }
    },
    urlObject: urls
  });
  await store.saveAvatar(avatarFiles());
  assert.equal((await store.getAvatar()).fileName, 'avatar.vrm');
});

test('keeps the volatile replacement when IndexedDB still contains an older Avatar', async () => {
  const oldFiles = avatarFiles('old.vrm');
  const store = createLocalAvatarStore({
    persistence: {
      getCurrent: async () => ({ vrmBlob: oldFiles.vrm, thumbnailBlob: oldFiles.thumbnail, fileName: 'old.vrm' }),
      putCurrent: async () => { throw new Error('quota'); }
    },
    urlObject: urlApi()
  });
  await store.saveAvatar(avatarFiles('new.vrm'));
  assert.equal((await store.getAvatar()).fileName, 'new.vrm');
});

test('rejects invalid VRM and thumbnail data before persistence', async () => {
  let writes = 0;
  const store = createLocalAvatarStore({
    persistence: { putCurrent: async () => { writes += 1; } },
    urlObject: urlApi()
  });
  await assert.rejects(() => store.saveAvatar({
    vrm: new File([new Uint8Array([0, 1, 2, 3])], 'bad.vrm'),
    thumbnail: new File(['x'], 'thumbnail.gif', { type: 'image/gif' })
  }), /valid VRM/);
  assert.equal(writes, 0);
});