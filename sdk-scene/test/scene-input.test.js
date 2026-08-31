import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneInput } from '../runtime/scene-input.js';

function createClick(overrides = {}) {
  return {
    pointerId: 3,
    pointerType: 'mouse',
    clientX: 120,
    clientY: 80,
    ray: {
      origin: { x: 1, y: 2, z: 3 },
      direction: { x: 0, y: 0, z: -1 }
    },
    ...overrides
  };
}

test('dispatches immutable click ray snapshots and aggregates consumption', () => {
  const sceneInput = createSceneInput();
  const received = [];
  sceneInput.input.onClick((event) => { received.push(event); return false; });
  sceneInput.input.onClick(() => true);

  assert.equal(sceneInput.dispatchClick(createClick()), true);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].ray.origin, { x: 1, y: 2, z: 3 });
  assert.equal(Object.isFrozen(received[0]), true);
  assert.equal(Object.isFrozen(received[0].ray.origin), true);
});

test('supports unsubscribe and abort cleanup', () => {
  const sceneInput = createSceneInput();
  const abortController = new AbortController();
  let calls = 0;
  const unsubscribe = sceneInput.input.onClick(() => { calls += 1; }, { signal: abortController.signal });

  sceneInput.dispatchClick(createClick());
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  sceneInput.dispatchClick(createClick());

  sceneInput.input.onClick(() => { calls += 1; }, { signal: abortController.signal });
  abortController.abort();
  sceneInput.dispatchClick(createClick());
  assert.equal(calls, 1);
});

test('isolates listener and error-handler failures', () => {
  const errors = [];
  const sceneInput = createSceneInput({ onError: (error) => errors.push(error.message) });
  let healthyCalls = 0;
  sceneInput.input.onClick(() => { throw new Error('failed listener'); });
  sceneInput.input.onClick(() => { healthyCalls += 1; return true; });

  assert.equal(sceneInput.dispatchClick(createClick()), true);
  assert.deepEqual(errors, ['failed listener']);
  assert.equal(healthyCalls, 1);
  sceneInput.dispose();
  assert.equal(sceneInput.dispatchClick(createClick()), false);
});