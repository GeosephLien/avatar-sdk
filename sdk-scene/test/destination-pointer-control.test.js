import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDestinationPointerState,
  updateDestinationPointer
} from '../runtime/destination-pointer-control.js';

function begin(pointerId = 1) {
  return updateDestinationPointer(createDestinationPointerState(), {
    type: 'down',
    pointerId,
    x: 10,
    y: 20
  }).state;
}

test('enters continuous mode after a 200ms stationary hold', () => {
  const pending = begin();
  const beforeThreshold = updateDestinationPointer(pending, { type: 'tick', delta: 0.199 });
  assert.equal(beforeThreshold.state.phase, 'pending');
  assert.equal(beforeThreshold.intent, '');

  const atThreshold = updateDestinationPointer(beforeThreshold.state, { type: 'tick', delta: 0.001 });
  assert.equal(atThreshold.state.phase, 'continuous');
  assert.equal(atThreshold.intent, 'enter-continuous');
});

test('releasing before the hold threshold remains a click', () => {
  const result = updateDestinationPointer(begin(), { type: 'up', pointerId: 1 });
  assert.equal(result.state.phase, 'idle');
  assert.equal(result.intent, 'click');
});

test('moving beyond the drag threshold cancels hold activation', () => {
  const moved = updateDestinationPointer(begin(), {
    type: 'move',
    pointerId: 1,
    x: 17,
    y: 20
  });
  assert.equal(moved.state.phase, 'drag');

  const ticked = updateDestinationPointer(moved.state, { type: 'tick', delta: 1 });
  assert.equal(ticked.state.phase, 'drag');
  assert.equal(ticked.intent, '');
  assert.equal(updateDestinationPointer(ticked.state, { type: 'up', pointerId: 1 }).intent, '');
});

test('continuous mode tracks the active pointer and stops on release', () => {
  const continuous = updateDestinationPointer(begin(), { type: 'tick', delta: 0.2 }).state;
  const ignored = updateDestinationPointer(continuous, {
    type: 'move',
    pointerId: 2,
    x: 50,
    y: 60
  });
  assert.strictEqual(ignored.state, continuous);

  const moved = updateDestinationPointer(continuous, {
    type: 'move',
    pointerId: 1,
    x: 30,
    y: 40
  });
  assert.deepEqual({ x: moved.state.x, y: moved.state.y }, { x: 30, y: 40 });

  const released = updateDestinationPointer(moved.state, { type: 'up', pointerId: 1 });
  assert.equal(released.state.phase, 'idle');
  assert.equal(released.intent, 'stop');
});

test('cancel only requests a stop for active continuous movement', () => {
  assert.equal(updateDestinationPointer(begin(), { type: 'cancel' }).intent, '');
  const continuous = updateDestinationPointer(begin(), { type: 'tick', delta: 0.2 }).state;
  const cancelled = updateDestinationPointer(continuous, { type: 'cancel' });
  assert.equal(cancelled.state.phase, 'idle');
  assert.equal(cancelled.intent, 'stop');
});
