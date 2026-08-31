import { CONTROL_PROFILE_IDS } from './control-package-definitions.js';

export const DEFAULT_CONTROL_PROFILE_ID = CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION;

export const CONTROL_PROFILE_OPTIONS = Object.freeze({
  [CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION]: Object.freeze({ view: 'third-person', input: 'wasd' }),
  [CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE]: Object.freeze({ view: 'third-person', input: 'click-to-move' }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_LOCOMOTION_NO_GAZE]: Object.freeze({ view: 'top-down', input: 'wasd' }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE]: Object.freeze({ view: 'top-down', input: 'click-to-move' })
});

export function normalizeControlProfileId(profileId) {
  return Object.hasOwn(CONTROL_PROFILE_OPTIONS, profileId) ? profileId : DEFAULT_CONTROL_PROFILE_ID;
}

export function getControlProfileOptions(profileId) {
  return CONTROL_PROFILE_OPTIONS[normalizeControlProfileId(profileId)];
}

export function resolveControlProfileId(view, input) {
  if (view === 'top-down') {
    return input === 'click-to-move'
      ? CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE
      : CONTROL_PROFILE_IDS.TOP_DOWN_LOCOMOTION_NO_GAZE;
  }
  return input === 'click-to-move'
    ? CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE
    : CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION;
}