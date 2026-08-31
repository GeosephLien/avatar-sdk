import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controllerUrl = new URL('../runtime/scene-avatar-controller.js', import.meta.url);
const sceneUrl = new URL('../runtime/three-scene.js', import.meta.url);

test('controller dispatches un-dragged clicks and lets addons consume destination clicks', async () => {
  const source = await readFile(controllerUrl, 'utf8');

  assert.match(source, /singlePointerClick = activePointers\.size === 1 && pointer && !pointer\.moved/);
  assert.match(source, /clickConsumed = clickIntent && onPointerClick\?\.\(event\) === true/);
  assert.match(source, /if \(clickIntent && !clickConsumed\) \{\s*setDestinationFromPointer\(event\)/);
});

test('three scene converts canvas clicks to rays and exposes scene input to addons', async () => {
  const source = await readFile(sceneUrl, 'utf8');

  assert.match(source, /pointerRaycaster\.setFromCamera\(pointerNdc, controller\.camera\)/);
  assert.match(source, /return sceneInput\.dispatchClick\(\{/);
  assert.match(source, /input: sceneInput\.input,/);
  assert.match(source, /sceneInput\.dispose\(\)/);
});

test('three scene keeps shadows in a 30 meter light-space area around the player', async () => {
  const source = await readFile(sceneUrl, 'utf8');

  assert.match(source, /directionalLight\.shadow\.camera\.left = -15/);
  assert.match(source, /directionalLight\.shadow\.camera\.right = 15/);
  assert.match(source, /directionalLight\.shadow\.camera\.top = 15/);
  assert.match(source, /directionalLight\.shadow\.camera\.bottom = -15/);
  assert.match(source, /directionalLight\.position\.set\(avatarPosition\.x \+ 4, 7, avatarPosition\.z \+ 5\)/);
});

test('addon interaction locks stop controls and cannot be bypassed by loop restarts', async () => {
  const source = await readFile(sceneUrl, 'utf8');

  assert.match(source, /interaction: Object\.freeze\(\{ acquireLock: acquireInteractionLock \}\)/);
  assert.match(source, /hostPaused \|\| interactionLocks\.size > 0/);
  assert.match(source, /controller\.setEnableControl\(!blocked && controlsEnabled\)/);
  assert.match(source, /if \(blocked\) stopAnimationLoop\(\);\s*else startAnimationLoop\(\);/);
});