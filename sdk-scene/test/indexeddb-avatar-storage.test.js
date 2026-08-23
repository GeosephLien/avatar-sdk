import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { createIndexedDbAvatarStorage } from '../services/indexeddb-avatar-storage.js';

test('creates the Avatar store and overwrites the fixed current record', async () => {
  const indexedDB = new IDBFactory();
  const storage = createIndexedDbAvatarStorage(indexedDB);
  await storage.putCurrent({ fileName: 'first.vrm' });
  await storage.putCurrent({ fileName: 'second.vrm' });
  assert.deepEqual(await storage.getCurrent(), { id: 'current', fileName: 'second.vrm' });

  const reopened = createIndexedDbAvatarStorage(indexedDB);
  assert.equal((await reopened.getCurrent()).fileName, 'second.vrm');
});