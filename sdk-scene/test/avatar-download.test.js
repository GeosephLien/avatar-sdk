import assert from 'node:assert/strict';
import test from 'node:test';

import { strFromU8, unzipSync } from '../components/avatar-creator-adapter/vendor/fflate.js';
import {
  AVATAR_ARCHIVE_FILE_NAME,
  createAvatarArchive,
  triggerAvatarDownload
} from '../components/avatar-creator-adapter/avatar-download.js';

const VRM_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2]);
const THUMBNAIL_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

test('creates a stable Avatar ZIP with files and a versioned manifest', async () => {
  const creatorState = { schemaVersion: 1, catalogVersion: '2026-08-29', characterId: 'iris' };
  const archive = await createAvatarArchive({
    vrmBlob: new Blob([VRM_BYTES], { type: 'model/vrm' }),
    thumbnailBlob: new Blob([THUMBNAIL_BYTES], { type: 'image/png' }),
    fileName: 'my-avatar.vrm',
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    creatorState
  }, { now: () => '2026-08-30T12:00:00.000Z' });

  assert.equal(archive.fileName, AVATAR_ARCHIVE_FILE_NAME);
  assert.equal(archive.blob.type, 'application/zip');
  const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  assert.deepEqual([...entries['my-avatar.vrm']], [...VRM_BYTES]);
  assert.deepEqual([...entries['thumbnail.png']], [...THUMBNAIL_BYTES]);
  assert.deepEqual(JSON.parse(strFromU8(entries['avatar.json'])), {
    schemaVersion: 1,
    exportedAt: '2026-08-30T12:00:00.000Z',
    fileName: 'my-avatar.vrm',
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    files: { vrm: 'my-avatar.vrm', thumbnail: 'thumbnail.png' },
    creatorState
  });
});

test('sanitizes archive paths and preserves a fixed manifest for legacy records', async () => {
  const archive = await createAvatarArchive({
    vrmBlob: new Blob([VRM_BYTES]),
    thumbnailBlob: new Blob([THUMBNAIL_BYTES], { type: 'image/jpeg' }),
    fileName: '../unsafe avatar'
  }, { now: () => '2026-08-30T12:00:00.000Z' });
  const entries = unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(entries).sort(), ['avatar.json', 'thumbnail.jpg', 'unsafe-avatar.vrm']);
  assert.equal(JSON.parse(strFromU8(entries['avatar.json'])).creatorState, null);
});

test('rejects incomplete or unsupported persisted files', async () => {
  await assert.rejects(() => createAvatarArchive({}), /persisted VRM and thumbnail/);
  await assert.rejects(() => createAvatarArchive({
    vrmBlob: new Blob([VRM_BYTES]),
    thumbnailBlob: new Blob(['gif'], { type: 'image/gif' })
  }), /thumbnail type is not supported/);
});

test('triggers a browser download and releases its object URL', () => {
  const calls = [];
  const link = {
    hidden: false,
    click: () => calls.push('click'),
    remove: () => calls.push('remove')
  };
  triggerAvatarDownload({ blob: new Blob(['zip']), fileName: 'avatar.zip' }, {
    documentObject: {
      body: { append: (value) => calls.push(value === link ? 'append' : 'wrong') },
      createElement: () => link
    },
    urlObject: {
      createObjectURL: () => 'blob:archive',
      revokeObjectURL: (url) => calls.push(`revoke:${url}`)
    },
    schedule: (callback) => callback()
  });
  assert.equal(link.href, 'blob:archive');
  assert.equal(link.download, 'avatar.zip');
  assert.deepEqual(calls, ['append', 'click', 'remove', 'revoke:blob:archive']);
});