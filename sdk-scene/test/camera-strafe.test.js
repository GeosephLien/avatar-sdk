import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCameraStrafeGazeYaw,
  resolveCameraStrafeInput
} from '../runtime/camera-strafe.js';

const within = (actual, expected) => Math.abs(actual - expected) < 0.000001;

test('Q and E strafe perpendicular to the camera while locking gaze', () => {
  const left = resolveCameraStrafeInput({ strafeLeft: true });
  const right = resolveCameraStrafeInput({ strafeRight: true });
  assert.deepEqual(left, { horizontal: -1, vertical: 0, gazeLocked: true });
  assert.deepEqual(right, { horizontal: 1, vertical: 0, gazeLocked: true });
  assert.ok(within(resolveCameraStrafeGazeYaw({ ...left }), -Math.PI / 3));
  assert.ok(within(resolveCameraStrafeGazeYaw({ ...right }), Math.PI / 3));
});

test('Q and E combine with forward movement but ignore backward movement', () => {
  const forwardLeft = resolveCameraStrafeInput({ strafeLeft: true, forward: true, backward: true });
  const backwardRight = resolveCameraStrafeInput({ strafeRight: true, backward: true });
  assert.deepEqual(forwardLeft, { horizontal: -1, vertical: 1, gazeLocked: true });
  assert.deepEqual(backwardRight, { horizontal: 1, vertical: 0, gazeLocked: true });
  assert.ok(within(resolveCameraStrafeGazeYaw({ ...forwardLeft }), -Math.PI * 2 / 9));
  assert.ok(within(resolveCameraStrafeGazeYaw({ ...backwardRight }), Math.PI / 3));
});

test('cancelling Q and E retains normal movement controls without gaze lock', () => {
  assert.deepEqual(resolveCameraStrafeInput({ strafeLeft: true, strafeRight: true, forward: true, backward: true, left: true }), {
    horizontal: -1,
    vertical: 0,
    gazeLocked: false
  });
  assert.equal(resolveCameraStrafeGazeYaw({ horizontal: 1, gazeLocked: false }), 0);
});

test('gaze yaw wraps cleanly around the pi boundary', () => {
  const input = resolveCameraStrafeInput({ strafeRight: true });
  assert.ok(within(resolveCameraStrafeGazeYaw({ ...input, cameraYaw: Math.PI - 0.01 }), Math.PI / 3));
});