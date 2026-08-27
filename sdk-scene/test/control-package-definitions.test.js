import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROL_PACKAGE_IDS,
  CONTROL_PROFILE_IDS,
  CONTROL_PROFILES
} from '../runtime/control-package-definitions.js';

test('exposes five semantic package IDs and composes the four supported profiles', () => {
  assert.deepEqual(Object.values(CONTROL_PACKAGE_IDS), [
    'third-person-camera',
    'top-down-camera',
    'locomotion-control',
    'camera-relative-control',
    'click-to-move-control'
  ]);
  assert.deepEqual(Object.values(CONTROL_PROFILE_IDS), [
    'third-person-locomotion',
    'third-person-click-to-move',
    'top-down-camera-relative',
    'top-down-click-to-move'
  ]);
  assert.deepEqual(CONTROL_PROFILES, {
    'third-person-locomotion': { camera: 'third-person-camera', control: 'locomotion-control' },
    'third-person-click-to-move': { camera: 'third-person-camera', control: 'click-to-move-control' },
    'top-down-camera-relative': { camera: 'top-down-camera', control: 'camera-relative-control' },
    'top-down-click-to-move': { camera: 'top-down-camera', control: 'click-to-move-control' }
  });
});