import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTrustedCreatorMessage,
  normalizeAvatarDescriptor,
  resolveCreatorUrl
} from '../components/avatar-creator-adapter/avatar-creator-contract.js';

test('resolves only HTTP Creator URLs against the host page', () => {
  assert.equal(resolveCreatorUrl('/custom-creator', 'https://host.example/page').href, 'https://host.example/custom-creator');
  assert.equal(resolveCreatorUrl('https://creator.example/ac3/', 'https://host.example/').origin, 'https://creator.example');
  assert.throws(() => resolveCreatorUrl('javascript:alert(1)', 'https://host.example/'), /HTTP or HTTPS/);
});

test('exposes only the public avatar descriptor fields', () => {
  assert.deepEqual(normalizeAvatarDescriptor({
    fileName: 'avatar.vrm',
    vrmUrl: 'https://content.example/avatar.vrm',
    thumbnailUrl: 'https://content.example/thumbnail.png',
    expiresAt: 123,
    sessionToken: 'secret',
    vrmBuffer: new ArrayBuffer(1)
  }), {
    fileName: 'avatar.vrm',
    vrmUrl: 'https://content.example/avatar.vrm',
    thumbnailUrl: 'https://content.example/thumbnail.png',
    expiresAt: 123
  });
});

test('exposes an isolated validated Creator state in the avatar descriptor', () => {
  const creatorState = {
    schemaVersion: 1,
    catalogVersion: '2026-08-29',
    characterId: 'iris'
  };
  const descriptor = normalizeAvatarDescriptor({ creatorState });
  creatorState.characterId = 'external-mutation';

  assert.deepEqual(descriptor.creatorState, {
    schemaVersion: 1,
    catalogVersion: '2026-08-29',
    characterId: 'iris'
  });
});

test('keeps a valid avatar descriptor when optional Creator state is malformed', () => {
  const descriptor = normalizeAvatarDescriptor({
    vrmUrl: 'blob:avatar',
    thumbnailUrl: 'blob:thumbnail',
    creatorState: { schemaVersion: 99 }
  });

  assert.deepEqual(descriptor, {
    vrmUrl: 'blob:avatar',
    thumbnailUrl: 'blob:thumbnail'
  });
});

test('accepts Creator messages only from the active frame and request', () => {
  const frameWindow = {};
  const message = { protocol: 'ac3', type: 'ac3:ready', requestId: 'creator-1' };
  assert.equal(isTrustedCreatorMessage({ origin: 'https://app.example', source: frameWindow, data: message }, frameWindow, 'https://app.example', 'creator-1'), true);
  assert.equal(isTrustedCreatorMessage({ origin: 'https://evil.example', source: frameWindow, data: message }, frameWindow, 'https://app.example', 'creator-1'), false);
  assert.equal(isTrustedCreatorMessage({ origin: 'https://app.example', source: {}, data: message }, frameWindow, 'https://app.example', 'creator-1'), false);
  assert.equal(isTrustedCreatorMessage({ origin: 'https://app.example', source: frameWindow, data: { ...message, requestId: 'creator-2' } }, frameWindow, 'https://app.example', 'creator-1'), false);
});
