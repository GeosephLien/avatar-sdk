import assert from 'node:assert/strict';
import test from 'node:test';

import { createTargetShooterGame } from '../target-shooter-game-state.js';

function createSeededRandom(initialSeed = 1) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

test('places five to ten separated targets with random health and activation distance', () => {
  const center = { x: 4, z: -3 };
  const game = createTargetShooterGame({ center, random: createSeededRandom(42) });
  const { targets } = game.getSnapshot();
  assert.ok(targets.length >= 5 && targets.length <= 10);
  for (let index = 0; index < targets.length; index += 1) {
    assert.ok(targets[index].health >= 3 && targets[index].health <= 5);
    assert.equal(targets[index].health, targets[index].maxHealth);
    assert.ok(targets[index].activationDistance >= 3 && targets[index].activationDistance <= 5);
    const distance = Math.hypot(targets[index].position.x - center.x, targets[index].position.z - center.z);
    assert.ok(distance >= 10 && distance <= 15);
    for (let otherIndex = index + 1; otherIndex < targets.length; otherIndex += 1) {
      assert.ok(Math.hypot(
        targets[index].position.x - targets[otherIndex].position.x,
        targets[index].position.z - targets[otherIndex].position.z
      ) >= 2.2);
    }
  }
});

test('defeats each target on the third hit and completes once', () => {
  const game = createTargetShooterGame({ targetCount: 2, targetHealth: 3, random: createSeededRandom(7) });
  const [first, second] = game.getSnapshot().targets;
  assert.deepEqual(game.hitTarget(first.id).hit, { id: first.id, damage: 1, health: 2, defeated: false });
  assert.equal(game.hitTarget(first.id).hit.health, 1);
  assert.equal(game.hitTarget(first.id).hit.defeated, true);
  assert.equal(game.hitTarget(first.id).hit, null);
  game.hitTarget(second.id);
  game.hitTarget(second.id);
  const completed = game.hitTarget(second.id);
  assert.equal(completed.completed, true);
  assert.equal(completed.justCompleted, true);
  assert.equal(game.hitTarget(second.id).justCompleted, false);
});

test('restart uses a new center and restores target health', () => {
  const game = createTargetShooterGame({ targetCount: 1, targetHealth: 3, random: createSeededRandom(9) });
  const first = game.getSnapshot().targets[0];
  game.hitTarget(first.id);
  const restarted = game.restart({ x: 20, z: 30 });
  assert.equal(restarted.targets[0].health, 3);
  assert.ok(Math.hypot(restarted.targets[0].position.x - 20, restarted.targets[0].position.z - 30) >= 10);
});

test('rejects invalid placement and health options', () => {
  assert.throws(() => createTargetShooterGame({ targetCount: 0 }), /positive integer/);
  assert.throws(() => createTargetShooterGame({ minSpawnRadius: 15, maxSpawnRadius: 15 }), /greater than/);
  assert.throws(() => createTargetShooterGame({ targetHealth: 0 }), /positive integer/);
  assert.throws(() => createTargetShooterGame({ minTargetHealth: 5, maxTargetHealth: 3 }), /greater than or equal/);
  assert.throws(() => createTargetShooterGame({ minActivationDistance: 5, maxActivationDistance: 3 }), /greater than or equal/);
  assert.throws(() => createTargetShooterGame({ random: () => 1 }), /must return/);
});