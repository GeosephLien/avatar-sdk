export function createVrmaCache(load) {
  if (typeof load !== 'function') throw new TypeError('A VRMA loader is required.');
  const entries = new Map();

  function getOrLoad(url) {
    const key = String(url || '');
    if (!key) return Promise.reject(new Error('A VRMA URL is required.'));
    if (entries.has(key)) return entries.get(key);

    const pending = Promise.resolve().then(() => load(key));
    entries.set(key, pending);
    pending.catch(() => {
      if (entries.get(key) === pending) entries.delete(key);
    });
    return pending;
  }

  function clear() {
    entries.clear();
  }

  return { getOrLoad, clear };
}