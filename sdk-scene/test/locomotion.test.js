import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveJoystickLocomotionInput,
  resolveProgressiveLocomotion
} from '../runtime/locomotion.js';

test('accelerates from walking to running over two seconds', () => {
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 0 }), {
    progress: 0,
    locomotion: 'walk',
    speed: 2.4
  });
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 1 }), {
    progress: 0.5,
    locomotion: 'run',
    speed: 3.96
  });
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 2 }), {
    progress: 1,
    locomotion: 'run',
    speed: 5.52
  });
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 10 }), {
    progress: 1,
    locomotion: 'run',
    speed: 5.52
  });
});

test('Shift sprint overrides natural progress without changing it', () => {
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 0.8, sprinting: true }), {
    progress: 1,
    locomotion: 'run',
    speed: 5.52
  });
  const afterShiftRelease = resolveProgressiveLocomotion({ elapsed: 0.8, sprinting: false });
  assert.equal(afterShiftRelease.locomotion, 'walk');
  assert.equal(afterShiftRelease.progress, 0.8 / 2);
  assert.ok(Math.abs(afterShiftRelease.speed - 3.648) < 0.000001);
});

test('joystick starts locomotion acceleration for any non-zero displacement', () => {
  assert.deepEqual(resolveJoystickLocomotionInput({ horizontal: 0.6, vertical: 0.8 }), {
    horizontal: 0.6,
    vertical: 0.8,
    accelerating: true
  });
  assert.deepEqual(resolveJoystickLocomotionInput(), {
    horizontal: 0,
    vertical: 0,
    accelerating: false
  });
});