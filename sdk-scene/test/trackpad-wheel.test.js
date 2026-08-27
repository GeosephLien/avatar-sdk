import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyWheelInput,
  WHEEL_INPUT_KINDS
} from '../runtime/trackpad-wheel.js';

test('classifies ctrl+wheel as pinch zoom', () => {
  const result = classifyWheelInput({ deltaY: 2.5, deltaMode: 0, ctrlKey: true, timeStamp: 10 }, 5);
  assert.equal(result.kind, WHEEL_INPUT_KINDS.PINCH_ZOOM);
  assert.equal(result.deltaY, 2.5);
  assert.equal(result.lastTrackpadTime, -Infinity);
});

test('classifies line and page deltas as wheel zoom and normalizes them', () => {
  const line = classifyWheelInput({ deltaY: 3, deltaMode: 1, timeStamp: 10 });
  const page = classifyWheelInput({ deltaY: -2, deltaMode: 2, timeStamp: 10 });
  assert.deepEqual([line.kind, line.deltaY], [WHEEL_INPUT_KINDS.WHEEL_ZOOM, 48]);
  assert.deepEqual([page.kind, page.deltaY], [WHEEL_INPUT_KINDS.WHEEL_ZOOM, -800]);
});

test('keeps large discrete vertical pixel deltas as wheel zoom', () => {
  const result = classifyWheelInput({ deltaY: 100, deltaMode: 0, timeStamp: 100 });
  assert.equal(result.kind, WHEEL_INPUT_KINDS.WHEEL_ZOOM);
});

test('classifies horizontal, small vertical, and fractional pixel deltas as trackpad rotation', () => {
  const horizontal = classifyWheelInput({ deltaX: 12, deltaMode: 0, timeStamp: 100 });
  const vertical = classifyWheelInput({ deltaY: -24, deltaMode: 0, timeStamp: 200 });
  const fractional = classifyWheelInput({ deltaY: 100.5, deltaMode: 0, timeStamp: 300 });
  assert.equal(horizontal.kind, WHEEL_INPUT_KINDS.TRACKPAD_ROTATE);
  assert.equal(vertical.kind, WHEEL_INPUT_KINDS.TRACKPAD_ROTATE);
  assert.equal(fractional.kind, WHEEL_INPUT_KINDS.TRACKPAD_ROTATE);
});

test('continues a trackpad stream through large inertia deltas until it expires', () => {
  const initial = classifyWheelInput({ deltaY: 12, deltaMode: 0, timeStamp: 1000 });
  const continued = classifyWheelInput({ deltaY: 100, deltaMode: 0, timeStamp: 1150 }, initial.lastTrackpadTime);
  const expired = classifyWheelInput({ deltaY: 100, deltaMode: 0, timeStamp: 1311 }, initial.lastTrackpadTime);
  assert.equal(continued.kind, WHEEL_INPUT_KINDS.TRACKPAD_ROTATE);
  assert.equal(expired.kind, WHEEL_INPUT_KINDS.WHEEL_ZOOM);
});

test('preserves directions and does not extend a stream for zero deltas', () => {
  const result = classifyWheelInput({ deltaX: -4.5, deltaY: 7.25, deltaMode: 0, timeStamp: 50 });
  const zero = classifyWheelInput({ deltaMode: 0, timeStamp: 100 }, result.lastTrackpadTime);
  assert.deepEqual([result.deltaX, result.deltaY], [-4.5, 7.25]);
  assert.equal(zero.kind, WHEEL_INPUT_KINDS.WHEEL_ZOOM);
  assert.equal(zero.lastTrackpadTime, 50);
});