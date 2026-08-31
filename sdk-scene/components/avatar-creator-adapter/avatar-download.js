import { strToU8, zipSync } from './vendor/fflate.js';

export const AVATAR_ARCHIVE_FILE_NAME = 'avatar.zip';

const THUMBNAIL_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function sanitizeVrmFileName(value) {
  const fileName = String(value || 'avatar.vrm')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  const normalized = fileName || 'avatar.vrm';
  return normalized.toLowerCase().endsWith('.vrm') ? normalized : `${normalized}.vrm`;
}

function validatePayload(payload) {
  if (!(payload?.vrmBlob instanceof Blob) || !(payload?.thumbnailBlob instanceof Blob)) {
    throw new TypeError('A persisted VRM and thumbnail are required to create an avatar archive.');
  }
  const thumbnailExtension = THUMBNAIL_EXTENSIONS.get(payload.thumbnailBlob.type);
  if (!thumbnailExtension) throw new TypeError('The persisted avatar thumbnail type is not supported.');
  return {
    vrmFileName: sanitizeVrmFileName(payload.fileName),
    thumbnailFileName: `thumbnail.${thumbnailExtension}`
  };
}

export async function createAvatarArchive(payload, { now = () => new Date().toISOString() } = {}) {
  const { vrmFileName, thumbnailFileName } = validatePayload(payload);
  const manifest = {
    schemaVersion: 1,
    exportedAt: now(),
    fileName: payload.fileName || vrmFileName,
    createdAt: payload.createdAt || null,
    updatedAt: payload.updatedAt || null,
    files: {
      vrm: vrmFileName,
      thumbnail: thumbnailFileName
    },
    creatorState: payload.creatorState || null
  };
  const archive = zipSync({
    [vrmFileName]: new Uint8Array(await payload.vrmBlob.arrayBuffer()),
    [thumbnailFileName]: new Uint8Array(await payload.thumbnailBlob.arrayBuffer()),
    'avatar.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  }, { level: 0 });
  return { blob: new Blob([archive], { type: 'application/zip' }), fileName: AVATAR_ARCHIVE_FILE_NAME };
}

export function triggerAvatarDownload(archive, {
  documentObject = globalThis.document,
  urlObject = globalThis.URL,
  schedule = (callback) => setTimeout(callback, 0)
} = {}) {
  if (!(archive?.blob instanceof Blob) || !archive.fileName) {
    throw new TypeError('A valid avatar archive is required.');
  }
  const url = urlObject.createObjectURL(archive.blob);
  const link = documentObject.createElement('a');
  link.href = url;
  link.download = archive.fileName;
  link.hidden = true;
  documentObject.body.append(link);
  link.click();
  link.remove();
  schedule(() => urlObject.revokeObjectURL(url));
}