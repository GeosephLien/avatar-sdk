import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeEntryUrl = new URL('../runtime/avatar-input-runtime.js', import.meta.url);
const controllerUrl = new URL('../runtime/scene-avatar-controller.js', import.meta.url);
const sceneHostUrl = new URL('../sdk-scene.js', import.meta.url);
const [runtimeEntry, controller, sceneHost] = await Promise.all([
  readFile(runtimeEntryUrl, 'utf8'),
  readFile(controllerUrl, 'utf8'),
  readFile(sceneHostUrl, 'utf8')
]);

test('publishes the existing Scene controller through a stable runtime entry', () => {
  assert.match(runtimeEntry, /createSceneAvatarController as createAvatarInputRuntime/);
  assert.match(runtimeEntry, /CONTROL_PROFILE_IDS/);
  assert.match(runtimeEntry, /resolveControlProfileId/);
  assert.match(runtimeEntry, /normalizeControlProfileId/);
});

test('keeps legacy controller names and exposes consistent control profile aliases', () => {
  assert.match(controller, /setProfile:\s*controlProfiles\.activate/);
  assert.match(controller, /setControlProfile:\s*controlProfiles\.activate/);
  assert.match(controller, /get activeProfile\(\) \{ return controlProfiles\.activeId; \}/);
  assert.match(controller, /get activeControlProfile\(\) \{ return controlProfiles\.activeId; \}/);
});

test('disposes the destination marker mesh resources owned by the runtime', () => {
  assert.match(controller, /destinationRing\.geometry\.dispose\(\)/);
  assert.match(controller, /destinationRing\.material\.dispose\(\)/);
  assert.match(controller, /destinationDot\.geometry\.dispose\(\)/);
  assert.match(controller, /destinationDot\.material\.dispose\(\)/);
  assert.doesNotMatch(controller, /destinationMarker\.(?:geometry|material)\.dispose\(\)/);
});

test('keeps SDK Scene as a Host adapter instead of a component dependency', () => {
  assert.match(sceneHost, /addEventListener\('input-profile-change'/);
  assert.match(sceneHost, /sceneController\.setControlProfile\(event\.detail\?\.profileId\)/);
  assert.match(sceneHost, /inputProfileDropdown\.activeProfile = sceneController\.activeControlProfile/);
});