import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDestinationStep,
  resolveFollowCameraPosition
} from '../runtime/control-profile-motion.js';

test('fixed follow camera preserves its angle while translating with the target', () => {
  const first = resolveFollowCameraPosition({ target: { x: 0, y: 1, z: 0 }, yaw: Math.PI / 2, distance: 10 });
  const second = resolveFollowCameraPosition({ target: { x: 4, y: 3, z: -2 }, yaw: Math.PI / 2, distance: 10 });
  assert.ok(Math.abs(first.x - 10) < 0.000001);
  assert.ok(Math.abs(second.x - first.x - 4) < 0.000001);
  assert.ok(Math.abs(second.y - first.y - 2) < 0.000001);
  assert.ok(Math.abs(second.z - first.z + 2) < 0.000001);
});

test('destination movement clamps its step and stops at the destination', () => {
  assert.deepEqual(resolveDestinationStep({
    current: { x: 0, z: 0 },
    destination: { x: 3, z: 4 },
    maxDistance: 2
  }), {
    arrived: false,
    distance: 5,
    x: 1.2,
    z: 1.6,
    directionX: 0.6,
    directionZ: 0.8
  });
  assert.equal(resolveDestinationStep({
    current: { x: 2.98, z: 4 },
    destination: { x: 3, z: 4 }
  }).arrived, true);
});