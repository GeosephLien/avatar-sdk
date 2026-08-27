import assert from 'node:assert/strict';
import test from 'node:test';

import { createGemGame, createGemPositions } from '../gem-game-state.js';

function createSeededRandom(initialSeed = 1) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

test('places five to ten separated gems inside the default 15 by 15 area', () => {
  const positions = createGemPositions({ random: createSeededRandom(42) });
  assert.ok(positions.length >= 5 && positions.length <= 10);

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    assert.ok(position.x >= -7.5 && position.x <= 7.5);
    assert.ok(position.z >= -7.5 && position.z <= 7.5);
    assert.ok(Math.hypot(position.x, position.z) >= 1.5);
    for (let otherIndex = index + 1; otherIndex < positions.length; otherIndex += 1) {
      const other = positions[otherIndex];
      assert.ok(Math.hypot(position.x - other.x, position.z - other.z) >= 1);
    }
  }
});

test('collects each gem once and completes after the last gem', () => {
  const game = createGemGame({ random: createSeededRandom(7) });
  const gems = game.getSnapshot().gems;

  for (let index = 0; index < gems.length; index += 1) {
    const state = game.collectNearby(gems[index]);
    assert.deepEqual(state.collectedIndices, [index]);
    assert.equal(state.collectedCount, index + 1);
    assert.equal(state.completed, index === gems.length - 1);
    assert.equal(state.justCompleted, index === gems.length - 1);
  }

  const afterCompletion = game.collectNearby(gems[0]);
  assert.deepEqual(afterCompletion.collectedIndices, []);
  assert.equal(afterCompletion.collectedCount, gems.length);
  assert.equal(afterCompletion.justCompleted, false);
});

test('restart clears progress and creates a new random layout', () => {
  const game = createGemGame({ random: createSeededRandom(99) });
  const firstLayout = game.getSnapshot().gems;
  game.collectNearby(firstLayout[0]);

  const restarted = game.restart();
  assert.equal(restarted.collectedCount, 0);
  assert.equal(restarted.completed, false);
  assert.ok(restarted.gems.length >= 5 && restarted.gems.length <= 10);
  assert.notDeepEqual(restarted.gems, firstLayout);
});

test('rejects invalid placement configuration and random values', () => {
  assert.throws(() => createGemPositions({ gemCount: 0 }), /positive integer/);
  assert.throws(() => createGemPositions({ minGemCount: 8, maxGemCount: 7 }), /greater than or equal/);
  assert.throws(() => createGemPositions({ areaSize: 1, edgePadding: 0.5 }), /usable space/);
  assert.throws(() => createGemPositions({ random: () => 1 }), /must return/);
});
