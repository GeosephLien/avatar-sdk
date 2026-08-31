import assert from 'node:assert/strict';
import test from 'node:test';

import { createSdkAssetUrl, getAvatarSdkConfig } from '../sdk-config.js';

const publicOrigin = 'https://ac3-website.pages.dev';

test('uses the canonical public deployment without host configuration', () => {
  const config = getAvatarSdkConfig({
    location: { href: 'http://localhost:4173/sdk-scene/' },
    __AVATAR_SDK_CONFIG__: {
      assetBaseUrl: 'https://assets.example.test',
      creatorUrl: 'https://creator.example.test'
    }
  });

  assert.deepEqual(config, {
    assetBaseUrl: `${publicOrigin}/assets`,
    creatorUrl: `${publicOrigin}/avatar-creator/index.html`
  });
});

test('resolves every default public asset from the canonical deployment', () => {
  const paths = [
    'avatars/default/v1/default-avatar.vrm',
    'avatars/default/v1/default-avatar.png',
    'animations/v1/idle.vrma',
    'animations/v1/walk.vrma',
    'animations/v1/run.vrma',
    'animations/v1/jump_start.vrma',
    'animations/v1/jump_up.vrma',
    'animations/v1/jump_loop.vrma',
    'animations/v1/jump_down.vrma'
  ];

  for (const path of paths) {
    assert.equal(createSdkAssetUrl(path), `${publicOrigin}/assets/${path}`);
  }
});
