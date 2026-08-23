import { getAvatarSdkConfig } from '../sdk-config.js';

const ANONYMOUS_ID_STORAGE_KEY = 'viverse-avatar:embed-anonymous-id';

function createAnonymousId(cryptoObject) {
  if (cryptoObject.randomUUID) return `anon_${cryptoObject.randomUUID()}`;
  const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
  return `anon_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function createEmbedSession({
  apiBase = getAvatarSdkConfig().apiBaseUrl,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  cryptoObject = globalThis.crypto
} = {}) {
  const baseUrl = String(apiBase || '').replace(/\/+$/, '');
  let sessionToken = '';
  let sessionPromise = null;

  function getOrCreateAnonymousId() {
    try {
      const stored = storage?.getItem(ANONYMOUS_ID_STORAGE_KEY);
      if (/^anon_[A-Za-z0-9-]{16,128}$/.test(stored || '')) return stored;
      const created = createAnonymousId(cryptoObject);
      storage?.setItem(ANONYMOUS_ID_STORAGE_KEY, created);
      return created;
    } catch {
      return createAnonymousId(cryptoObject);
    }
  }

  async function ensureSession() {
    if (sessionToken) return sessionToken;
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const response = await fetchImpl(`${baseUrl}/api/embed/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anonymousId: getOrCreateAnonymousId() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.sessionToken) {
          throw new Error(payload.message || 'Unable to start an anonymous Creator session.');
        }
        sessionToken = payload.sessionToken;
        return sessionToken;
      })().finally(() => {
        sessionPromise = null;
      });
    }
    return sessionPromise;
  }

  async function createLaunchToken(retry = true) {
    const response = await fetchImpl(`${baseUrl}/api/embed/launch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await ensureSession()}` }
    });
    if (response.status === 401 && retry) {
      sessionToken = '';
      return createLaunchToken(false);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.launchToken) {
      throw new Error(payload.message || 'Unable to authorize AC3 Creator.');
    }
    return payload.launchToken;
  }

  return { apiBase: baseUrl, createLaunchToken };
}

export const embedSession = createEmbedSession({
  apiBase: getAvatarSdkConfig().apiBaseUrl
});