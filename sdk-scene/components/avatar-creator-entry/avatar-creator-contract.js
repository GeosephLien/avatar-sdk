const AVATAR_FIELDS = ['fileName', 'createdAt', 'lastUsedAt', 'vrmUrl', 'thumbnailUrl', 'expiresAt'];

export function resolveCreatorUrl(value, baseUrl) {
  const url = new URL(String(value || ''), baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Creator URL must use HTTP or HTTPS.');
  }
  return url;
}

export function normalizeAvatarDescriptor(value) {
  const avatar = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    AVATAR_FIELDS
      .filter((field) => typeof avatar[field] === 'string' || (field === 'expiresAt' && Number.isFinite(avatar[field])))
      .map((field) => [field, avatar[field]])
  );
}

export function isTrustedCreatorMessage(event, frameWindow, expectedOrigin, requestId) {
  const message = event?.data;
  return Boolean(
    event?.origin === expectedOrigin
    && event?.source === frameWindow
    && message
    && message.protocol === 'ac3'
    && String(message.type || '').startsWith('ac3:')
    && (!message.requestId || message.requestId === requestId)
  );
}
