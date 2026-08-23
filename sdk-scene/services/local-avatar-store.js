import { indexedDbAvatarStorage } from './indexeddb-avatar-storage.js';

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

export function createLocalAvatarStore({
  persistence = indexedDbAvatarStorage,
  urlObject = globalThis.URL,
  now = () => new Date().toISOString()
} = {}) {
  let volatileRecord = null;

  function createDescriptor(record) {
    return {
      fileName: record.fileName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      vrmUrl: urlObject.createObjectURL(record.vrmBlob),
      thumbnailUrl: urlObject.createObjectURL(record.thumbnailBlob)
    };
  }

  async function saveAvatar({ vrm, thumbnail }) {
    await validateFiles(vrm, thumbnail);
    const timestamp = now();
    const record = {
      vrmBlob: vrm,
      thumbnailBlob: thumbnail,
      fileName: sanitizeFileName(vrm.name),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    volatileRecord = record;
    try {
      await persistence.putCurrent(record);
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

  function releaseAvatar(avatar) {
    for (const url of [avatar?.vrmUrl, avatar?.thumbnailUrl]) {
      if (typeof url === 'string' && url.startsWith('blob:')) urlObject.revokeObjectURL(url);
    }
  }

  return { getAvatar, saveAvatar, releaseAvatar };
}

export const localAvatarStore = createLocalAvatarStore();