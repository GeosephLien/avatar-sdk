const CREATOR_STATE_SCHEMA_VERSION = 1;
const MAX_CREATOR_STATE_BYTES = 64 * 1024;
const MAX_DEPTH = 8;
const MAX_COLLECTION_ENTRIES = 256;
const MAX_STRING_LENGTH = 512;

function cloneJsonValue(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new TypeError('Creator state is too deeply nested.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Creator state numbers must be finite.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new TypeError('Creator state contains an oversized string.');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ENTRIES) throw new TypeError('Creator state contains too many entries.');
    return value.map((entry) => cloneJsonValue(entry, depth + 1));
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Creator state must contain only plain JSON values.');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_COLLECTION_ENTRIES) throw new TypeError('Creator state contains too many fields.');
  return Object.fromEntries(entries.map(([key, entry]) => {
    if (!key || key.length > MAX_STRING_LENGTH) throw new TypeError('Creator state contains an invalid field name.');
    return [key, cloneJsonValue(entry, depth + 1)];
  }));
}

export function normalizeCreatorState(value, { optional = true } = {}) {
  if (value == null && optional) return null;
  const state = cloneJsonValue(value);
  if (state.schemaVersion !== CREATOR_STATE_SCHEMA_VERSION) {
    throw new TypeError(`Creator state schemaVersion must be ${CREATOR_STATE_SCHEMA_VERSION}.`);
  }
  if (typeof state.catalogVersion !== 'string' || !state.catalogVersion.trim()) {
    throw new TypeError('Creator state catalogVersion is required.');
  }
  const encoded = JSON.stringify(state);
  if (new TextEncoder().encode(encoded).byteLength > MAX_CREATOR_STATE_BYTES) {
    throw new TypeError('Creator state is too large.');
  }
  return state;
}