import { CONTROL_PROFILE_IDS } from '../../runtime/control-package-definitions.js';

export const DEFAULT_PROFILE_ID = CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION;

export const PROFILE_STATE = Object.freeze({
  [CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION]: Object.freeze({ camera: 'third-person', clickToMove: false }),
  [CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE]: Object.freeze({ camera: 'third-person', clickToMove: true }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_CAMERA_RELATIVE]: Object.freeze({ camera: 'top-down', clickToMove: false }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE]: Object.freeze({ camera: 'top-down', clickToMove: true })
});

export function resolveProfileId(camera, clickToMove) {
  if (camera === 'top-down') {
    return clickToMove
      ? CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE
      : CONTROL_PROFILE_IDS.TOP_DOWN_CAMERA_RELATIVE;
  }
  return clickToMove
    ? CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE
    : CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION;
}