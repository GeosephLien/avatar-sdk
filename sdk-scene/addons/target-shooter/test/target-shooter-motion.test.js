import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectileTrajectory,
  createTargetChaseMotion,
  createTargetDeathMotion,
  createTargetReturnMotion,
  resolveProjectileOrigin,
  updateProjectileTrajectory,
  updateTargetChaseMotion,
  updateTargetDeathMotion,
  updateTargetReturnMotion
} from '../target-shooter-motion.js';

test('resolves an adjustable chest origin toward the target', () => {
  assert.deepEqual(
    resolveProjectileOrigin({ x: 1, y: 0, z: 2 }, { x: 11, z: 2 }, { forward: 0.5, right: 0.2, height: 1.3 }),
    { x: 1.5, y: 1.3, z: 2.2 }
  );
});

test('samples a slight arc and lands exactly at the target', () => {
  const trajectory = createProjectileTrajectory({
    origin: { x: 0, y: 1, z: 0 },
    target: { x: 10, y: 1.5, z: 0 },
    speed: 10,
    arcHeight: 0.2
  });
  const midpoint = updateProjectileTrajectory(trajectory, trajectory.duration / 2);
  assert.equal(midpoint.x, 5);
  assert.ok(Math.abs(midpoint.y - 1.45) < 1e-9);
  const end = updateProjectileTrajectory(trajectory, trajectory.duration / 2);
  assert.deepEqual(end, { x: 10, y: 1.5, z: 0, progress: 1, done: true });
});

test('moves an active target toward the player with a subtle wobble', () => {
  const motion = createTargetChaseMotion({ x: 4, z: 3 });
  const state = updateTargetChaseMotion(motion, { x: 0, z: 0 }, 0.5, {
    speed: 2,
    collisionRadius: 0.5,
    wobbleHeight: 0.04,
    wobbleAngle: 0.1,
    wobbleFrequency: Math.PI
  });
  assert.deepEqual(state.position, { x: 3.2, z: 2.4 });
  assert.equal(state.height, 0.04);
  assert.equal(state.tilt, 0.1);
  assert.equal(state.collided, false);
});

test('reports collision only after a chasing target reaches the player', () => {
  const motion = createTargetChaseMotion({ x: 1, z: 0 });
  const state = updateTargetChaseMotion(motion, { x: 0, z: 0 }, 1, {
    speed: 2,
    collisionRadius: 0.6
  });
  assert.deepEqual(state.position, { x: 0.6, z: 0 });
  assert.equal(state.collided, true);
});

test('returns a target toward its spawn position with the pursuit wobble', () => {
  const motion = createTargetReturnMotion({ x: 0, z: 0 }, { x: 4, z: 3 });
  const state = updateTargetReturnMotion(motion, 0.5, {
    speed: 2,
    speedMultiplier: 3,
    wobbleHeight: 0.04,
    wobbleAngle: 0.1,
    wobbleFrequency: Math.PI
  });
  assert.ok(Math.abs(state.position.x - 2.4) < 1e-9);
  assert.ok(Math.abs(state.position.z - 1.8) < 1e-9);
  assert.equal(state.height, 0.04);
  assert.equal(state.tilt, 0.1);
  assert.equal(state.arrived, false);
});

test('stops a returning target exactly at its spawn position', () => {
  const motion = createTargetReturnMotion({ x: 0, z: 0 }, { x: 1, z: 0 });
  const state = updateTargetReturnMotion(motion, 1, { speed: 2 });
  assert.deepEqual(state.position, { x: 1, z: 0 });
  assert.equal(state.height, 0);
  assert.equal(state.tilt, 0);
  assert.equal(state.arrived, true);
});

test('target death motion rises, settles on the ground, then fades', () => {
  const motion = createTargetDeathMotion({
    position: { x: 4, y: 0, z: 0 },
    impactOrigin: { x: 0, y: 1, z: 0 }
  });
  updateTargetDeathMotion(motion, 0.05);
  assert.ok(motion.position.y > 0);
  for (let index = 0; index < 500 && !motion.settled; index += 1) updateTargetDeathMotion(motion, 0.05);
  assert.equal(motion.settled, true);
  assert.equal(motion.position.y, 0);
  for (let index = 0; index < 20 && !motion.remove; index += 1) updateTargetDeathMotion(motion, 0.05);
  assert.equal(motion.remove, true);
});