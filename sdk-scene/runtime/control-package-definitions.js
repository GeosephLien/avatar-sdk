export const CONTROL_PACKAGE_IDS = Object.freeze({
  THIRD_PERSON_CAMERA: 'third-person-camera',
  TOP_DOWN_CAMERA: 'top-down-camera',
  LOCOMOTION_CONTROL: 'locomotion-control',
  CAMERA_RELATIVE_CONTROL: 'camera-relative-control',
  CLICK_TO_MOVE_CONTROL: 'click-to-move-control'
});

export const CONTROL_PROFILE_IDS = Object.freeze({
  THIRD_PERSON_LOCOMOTION: 'third-person-locomotion',
  THIRD_PERSON_CLICK_TO_MOVE: 'third-person-click-to-move',
  TOP_DOWN_CAMERA_RELATIVE: 'top-down-camera-relative',
  TOP_DOWN_CLICK_TO_MOVE: 'top-down-click-to-move'
});

export const CONTROL_PROFILES = Object.freeze({
  [CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION]: Object.freeze({
    camera: CONTROL_PACKAGE_IDS.THIRD_PERSON_CAMERA,
    control: CONTROL_PACKAGE_IDS.LOCOMOTION_CONTROL
  }),
  [CONTROL_PROFILE_IDS.THIRD_PERSON_CLICK_TO_MOVE]: Object.freeze({
    camera: CONTROL_PACKAGE_IDS.THIRD_PERSON_CAMERA,
    control: CONTROL_PACKAGE_IDS.CLICK_TO_MOVE_CONTROL
  }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_CAMERA_RELATIVE]: Object.freeze({
    camera: CONTROL_PACKAGE_IDS.TOP_DOWN_CAMERA,
    control: CONTROL_PACKAGE_IDS.CAMERA_RELATIVE_CONTROL
  }),
  [CONTROL_PROFILE_IDS.TOP_DOWN_CLICK_TO_MOVE]: Object.freeze({
    camera: CONTROL_PACKAGE_IDS.TOP_DOWN_CAMERA,
    control: CONTROL_PACKAGE_IDS.CLICK_TO_MOVE_CONTROL
  })
});