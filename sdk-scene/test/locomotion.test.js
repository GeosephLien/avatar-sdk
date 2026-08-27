import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveLocomotionDeceleration,
  resolveJoystickLocomotionInput,
  resolveProgressiveLocomotion
} from '../runtime/locomotion.js';

test('accelerates from walking to running over two seconds', () => {
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 0 }), {
    progress: 0,
    locomotion: 'walk',
    speed: 1.6
  });
  assert.deepEqual(resolveProgressiveLocomotion({ elapsed: 1 }), {
    progress: 0.5,
    locomotion: 'run',
    speed: 3.2
  });
  const terminalSpeed = resolveProgressiveLocomotion({ elapsed: 2 });
  assert.equal(terminalSpeed.progress, 1);
  assert.equal(terminalSpeed.locomotion, 'run');
  assert.ok(Math.abs(terminalSpeed.speed - 4.8) < 0.000001);
  const clampedTerminalSpeed = resolveProgressiveLocomotion({ elapsed: 10 });
  assert.equal(clampedTerminalSpeed.progress, 1);
  assert.equal(clampedTerminalSpeed.locomotion, 'run');
  assert.ok(Math.abs(clampedTerminalSpeed.speed - 4.8) < 0.000001);
});

test('Shift sprint overrides natural progress without changing it', () => {
  const sprinting = resolveProgressiveLocomotion({ elapsed: 0.8, sprinting: true });
  assert.equal(sprinting.progress, 1);
  assert.equal(sprinting.locomotion, 'run');
  assert.ok(Math.abs(sprinting.speed - 4.8) < 0.000001);
  const afterShiftRelease = resolveProgressiveLocomotion({ elapsed: 0.8, sprinting: false });
  assert.equal(afterShiftRelease.locomotion, 'walk');
  assert.equal(afterShiftRelease.progress, 0.8 / 2);
  assert.ok(Math.abs(afterShiftRelease.speed - 2.88) < 0.000001);
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

test('decelerates locomotion linearly to a complete stop', () => {
  assert.deepEqual(resolveLocomotionDeceleration({ elapsed: 0, initialSpeed: 4 }), {
    complete: false,
    speed: 4
  });
  assert.deepEqual(resolveLocomotionDeceleration({ elapsed: 0.125, initialSpeed: 4 }), {
    complete: false,
    speed: 2
  });
  assert.deepEqual(resolveLocomotionDeceleration({ elapsed: 0.25, initialSpeed: 4 }), {
    complete: true,
    speed: 0
  });
});