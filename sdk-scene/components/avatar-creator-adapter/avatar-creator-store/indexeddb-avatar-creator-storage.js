const DATABASE_NAME = 'viverse-avatar';
const DATABASE_VERSION = 2;
const STORE_NAME = 'avatars';
const CURRENT_AVATAR_ID = 'current';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed.')), { once: true });
  });
}

export function createIndexedDbAvatarCreatorStorage(indexedDBImpl = globalThis.indexedDB) {
  let databasePromise = null;

  function openDatabase() {
    if (!indexedDBImpl) return Promise.reject(new Error('IndexedDB is unavailable.'));
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDBImpl.open(DATABASE_NAME, DATABASE_VERSION);
        request.addEventListener('upgradeneeded', () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        }, { once: true });
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => {
          databasePromise = null;
          reject(request.error || new Error('Unable to open IndexedDB.'));
        }, { once: true });
      });
    }
    return databasePromise;
  }

  async function run(mode, operation) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, mode);
    const result = await operation(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted.')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed.')), { once: true });
    });
    return result;
  }

  return {
    getCurrent: () => run('readonly', (store) => requestResult(store.get(CURRENT_AVATAR_ID))),
    putCurrent: (record) => run('readwrite', (store) => requestResult(store.put({ ...record, id: CURRENT_AVATAR_ID })))
  };
}

export const indexedDbAvatarCreatorStorage = createIndexedDbAvatarCreatorStorage();
