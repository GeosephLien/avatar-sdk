import { indexedDbAvatarCreatorStorage } from './indexeddb-avatar-creator-storage.js';
import { normalizeCreatorState } from '../creator-state.js';

const MAX_VRM_BYTES = 20 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const THUMBNAIL_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

function sanitizeFileName(value) {
  return String(value || 'avatar.vrm').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'avatar.vrm';
}

async function validateFiles(vrmBlob, thumbnailBlob) {
  if (!(vrmBlob instanceof Blob) || !(thumbnailBlob instanceof Blob)) {
    throw new Error('VRM and thumbnail files are required.');
  }
  if (vrmBlob.size > MAX_VRM_BYTES || thumbnailBlob.size > MAX_THUMBNAIL_BYTES) {
    throw new Error('Avatar is too large to save.');
  }
  const magic = new Uint8Array(await vrmBlob.slice(0, 4).arrayBuffer());
  if (magic[0] !== 0x67 || magic[1] !== 0x6c || magic[2] !== 0x54 || magic[3] !== 0x46) {
    throw new Error('The avatar is not a valid VRM binary.');
  }
  if (!THUMBNAIL_TYPES.has(thumbnailBlob.type)) {
    throw new Error('Thumbnail must be PNG, WebP, or JPEG.');
  }
}

export function createLocalAvatarCreatorStore({
  persistence = indexedDbAvatarCreatorStorage,
  urlObject = globalThis.URL,
  now = () => new Date().toISOString()
} = {}) {
  let volatileRecord = null;
  let volatileRecordPersisted = false;

  function createDescriptor(record) {
    const descriptor = {
      fileName: record.fileName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      vrmUrl: urlObject.createObjectURL(record.vrmBlob),
      thumbnailUrl: urlObject.createObjectURL(record.thumbnailBlob)
    };
    try {
      const creatorState = normalizeCreatorState(record.creatorState);
      if (creatorState) descriptor.creatorState = creatorState;
    } catch (error) {
      console.warn('Ignoring invalid persisted Creator state.', error);
    }
    return descriptor;
  }

  async function saveAvatar({ vrm, thumbnail, creatorState: creatorStateValue }) {
    await validateFiles(vrm, thumbnail);
    const creatorState = normalizeCreatorState(creatorStateValue);
    const timestamp = now();
    const record = {
      vrmBlob: vrm,
      thumbnailBlob: thumbnail,
      fileName: sanitizeFileName(vrm.name),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    if (creatorState) record.creatorState = creatorState;
    volatileRecord = record;
    volatileRecordPersisted = false;
    try {
      await persistence.putCurrent(record);
      volatileRecordPersisted = true;
    } catch {
      // The requested fallback keeps the newest Avatar for this page lifetime.
    }
    return createDescriptor(record);
  }

  async function getAvatar() {
    if (volatileRecord) return createDescriptor(volatileRecord);
    let record = null;
    try {
      record = await persistence.getCurrent();
    } catch {
      // IndexedDB failures intentionally fall back to page memory without UI.
    }
    return record ? createDescriptor(record) : null;
  }

  async function getDownloadPayload() {
    if (volatileRecord && !volatileRecordPersisted) return null;
    let record = null;
    try {
      record = await persistence.getCurrent();
    } catch {
      return null;
    }
    if (!(record?.vrmBlob instanceof Blob) || !(record?.thumbnailBlob instanceof Blob)) return null;
    const payload = {
      vrmBlob: record.vrmBlob,
      thumbnailBlob: record.thumbnailBlob,
      fileName: sanitizeFileName(record.fileName),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
    try {
      const creatorState = normalizeCreatorState(record.creatorState);
      if (creatorState) payload.creatorState = creatorState;
    } catch {
      // Invalid optional state does not make the persisted files unavailable.
    }
    return payload;
  }

  function releaseAvatar(avatar) {
    for (const url of [avatar?.vrmUrl, avatar?.thumbnailUrl]) {
      if (typeof url === 'string' && url.startsWith('blob:')) urlObject.revokeObjectURL(url);
    }
  }

  return { getAvatar, getDownloadPayload, saveAvatar, releaseAvatar };
}

export const localAvatarCreatorStore = createLocalAvatarCreatorStore();