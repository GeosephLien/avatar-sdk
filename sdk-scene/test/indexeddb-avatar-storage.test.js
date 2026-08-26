import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

import { createIndexedDbAvatarStorage } from '../services/indexeddb-avatar-storage.js';

const DATABASE_NAME = 'viverse-avatar';
const STORE_NAME = 'avatars';

function openDatabase(indexedDB, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, version);
    request.addEventListener('upgradeneeded', () => upgrade?.(request.result), { once: true });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

test('creates the Avatar store and overwrites the fixed current record', async () => {
  const indexedDB = new IDBFactory();
  const storage = createIndexedDbAvatarStorage(indexedDB);
  await storage.putCurrent({ fileName: 'first.vrm' });
  await storage.putCurrent({ fileName: 'second.vrm' });
  assert.deepEqual(await storage.getCurrent(), { id: 'current', fileName: 'second.vrm' });

  const reopened = createIndexedDbAvatarStorage(indexedDB);
  assert.equal((await reopened.getCurrent()).fileName, 'second.vrm');
});

test('repairs an existing version 1 database that has no Avatar store', async () => {
  const indexedDB = new IDBFactory();
  const emptyVersionOneDatabase = await openDatabase(indexedDB, 1);
  emptyVersionOneDatabase.close();

  const storage = createIndexedDbAvatarStorage(indexedDB);
  await storage.putCurrent({ fileName: 'repaired.vrm' });

  assert.deepEqual(await storage.getCurrent(), { id: 'current', fileName: 'repaired.vrm' });
});

test('preserves an existing Avatar record while upgrading from version 1', async () => {
  const indexedDB = new IDBFactory();
  const versionOneDatabase = await openDatabase(indexedDB, 1, (database) => {
    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
  });
  const transaction = versionOneDatabase.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put({ id: 'current', fileName: 'existing.vrm' });
  await transactionComplete(transaction);
  versionOneDatabase.close();

  const storage = createIndexedDbAvatarStorage(indexedDB);

  assert.deepEqual(await storage.getCurrent(), { id: 'current', fileName: 'existing.vrm' });
});
