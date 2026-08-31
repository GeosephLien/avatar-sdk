import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTROL_PROFILE_IDS } from '../runtime/control-package-definitions.js';
import {
  DEFAULT_CONTROL_PROFILE_ID,
  getControlProfileOptions,
  normalizeControlProfileId,
  resolveControlProfileId
} from '../runtime/control-profile-options.js';

test('maps every View and Input combination to its semantic control profile', () => {
  assert.equal(resolveControlProfileId('third-person', 'wasd'), CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION);
  assert.equal(resolveControlProfileId('third-person', 'click-to-move'), CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE);
  assert.equal(resolveControlProfileId('top-down', 'wasd'), CONTROL_PROFILE_IDS.TOP_DOWN_LOCOMOTION_NO_GAZE);
  assert.equal(resolveControlProfileId('top-down', 'click-to-move'), CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE);
});

test('maps every profile back to View and Input options', () => {
  assert.deepEqual(getControlProfileOptions(CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION), { view: 'third-person', input: 'wasd' });
  assert.deepEqual(getControlProfileOptions(CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE), { view: 'third-person', input: 'click-to-move' });
  assert.deepEqual(getControlProfileOptions(CONTROL_PROFILE_IDS.TOP_DOWN_LOCOMOTION_NO_GAZE), { view: 'top-down', input: 'wasd' });
  assert.deepEqual(getControlProfileOptions(CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE), { view: 'top-down', input: 'click-to-move' });
});

test('falls back to the default profile for unsupported options', () => {
  assert.equal(DEFAULT_CONTROL_PROFILE_ID, CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION);
  assert.equal(normalizeControlProfileId('unknown'), DEFAULT_CONTROL_PROFILE_ID);
  assert.equal(resolveControlProfileId('unknown', 'unknown'), DEFAULT_CONTROL_PROFILE_ID);
  assert.deepEqual(getControlProfileOptions('unknown'), { view: 'third-person', input: 'wasd' });
});