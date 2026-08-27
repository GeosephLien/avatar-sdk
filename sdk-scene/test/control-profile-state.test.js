import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProfileId } from '../components/sdk-scene-menu/control-profile-state.js';
import { CONTROL_PROFILE_IDS } from '../runtime/control-package-definitions.js';

test('maps every camera and movement setting to its semantic control profile', () => {
  assert.equal(resolveProfileId('third-person', false), CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION);
  assert.equal(resolveProfileId('third-person', true), CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE);
  assert.equal(resolveProfileId('top-down', false), CONTROL_PROFILE_IDS.TOP_DOWN_CAMERA_RELATIVE);
  assert.equal(resolveProfileId('top-down', true), CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE);
});