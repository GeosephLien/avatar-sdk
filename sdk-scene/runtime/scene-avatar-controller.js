// VIVERSE Scene Avatar Controller
// Scene-side input, movement, camera, and optional gravity-driven jump behavior.
//
// Two integration modes:
//   - physics: 'builtin' (default) — the controller owns position.y, applies
//     gravity and mounts a Space / on-screen
//     Jump button. Recommended for simple integrations.
//   - physics: 'none' — the controller never modifies position.y and never
//     binds Space or shows a jump button. Use this when the host has its own
//     physics engine and only wants input-driven locomotion.
//
// Peer dependencies (host importmap must provide):
//   - three: tested r158-r164, supported r155-r169
//   controller.update(delta) returns an Avatar Presentation motion state.

import * as THREE from 'three';
import {
  resolveCameraStrafeGazeYaw,
  resolveCameraStrafeInput
} from './camera-strafe.js';
import {
  resolveLocomotionDeceleration,
  resolveJoystickLocomotionInput,
  resolveProgressiveLocomotion
} from './locomotion.js';
import {
  resolveDestinationStep,
  resolveFollowCameraPosition
} from './control-profile-motion.js';
import {
  createDestinationPointerState,
  updateDestinationPointer
} from './destination-pointer-control.js';
import {
  classifyWheelInput,
  WHEEL_INPUT_KINDS
} from './trackpad-wheel.js';
import {
  createControlPackageRegistry,
  createControlProfileRegistry
} from './control-package-registry.js';
import {
  CONTROL_PACKAGE_IDS,
  CONTROL_PROFILE_IDS,
  CONTROL_PROFILES
} from './control-package-definitions.js';
import { installCanvasCursorControl } from './canvas-cursor-control.js';

const TESTED_MIN = 158;
const TESTED_MAX = 164;
const SUPPORTED_MIN = 155;
const SUPPORTED_MAX = 169;

let versionChecked = false;

function checkThreeVersionOnce() {
  if (versionChecked) {
    return;
  }
  versionChecked = true;
  const rev = Number(THREE.REVISION);
  if (!Number.isFinite(rev)) {
    return;
  }
  if (rev < SUPPORTED_MIN || rev > SUPPORTED_MAX) {
    console.warn(
      `[viverse-me] three r${rev} is outside the supported range (r${SUPPORTED_MIN}-r${SUPPORTED_MAX}). ` +
      'Avatar controller may misbehave. Pin three to a supported version.'
    );
    return;
  }
  if (rev < TESTED_MIN || rev > TESTED_MAX) {
    console.warn(
      `[viverse-me] three r${rev} is outside the tested range (r${TESTED_MIN}-r${TESTED_MAX}). ` +
      `Avatar controller should still work between r${SUPPORTED_MIN}-r${SUPPORTED_MAX}.`
    );
  }
}

export function createSceneAvatarController(options = {}) {
  checkThreeVersionOnce();

  const {
    scene,
    target,
    domElement,
    enableControl = true,
    physics: physicsMode = 'builtin',
    enableJump = true,
    bindSpaceKey = true,
    gravity = 18,
    jumpVelocity = 6.97,
    groundY = 0,
    input = {},
    onPointerClick = null,
    uiContainer = domElement?.parentElement,
    keyboardTarget = globalThis.window,
    moveSpeed = 1.6,
    runSpeedMultiplier = 3,
    locomotionAccelerationDuration = 2,
    turnResponsiveness = 12,
    cameraOffset = 1.1,
    initialCameraDistance = 4.5,
    minCameraDistance = 1.75,
    maxCameraDistance = 6.5,
    initialProfile = CONTROL_PROFILE_IDS.THIRD_PERSON_LOCOMOTION,
    fixedCameraYaw = Math.PI / 4,
    fixedCameraPitch = 0.58,
    fixedCameraDistance = 10,
    fixedCameraMinDistance = 5,
    fixedCameraMaxDistance = 16,
    destinationStoppingDistance = 0.08
  } = options;

  if (!scene || typeof scene.add !== 'function') {
    throw new Error('[viverse-me] createSceneAvatarController requires options.scene (THREE.Scene).');
  }
  if (!target || typeof target.position?.addScaledVector !== 'function') {
    throw new Error('[viverse-me] createSceneAvatarController requires options.target (THREE.Object3D).');
  }
  // Camera is optional and only auto-created in Tier A (physics: 'builtin').
  // In Tier B (physics: 'none') the SDK does not touch the camera at all —
  // host owns it. If the host passes one in Tier B it's still exposed via
  // controller.camera for convenience but SDK won't drive it.
  const tierAOwnsCamera = (options.physics ?? 'builtin') === 'builtin';
  let camera = options.camera || null;
  if (!camera && tierAOwnsCamera) {
    const aspect = (domElement && domElement.clientWidth && domElement.clientHeight)
      ? (domElement.clientWidth / domElement.clientHeight)
      : 1;
    camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
  } else if (camera && typeof camera.position?.set !== 'function') {
    throw new Error('[viverse-me] options.camera must be a THREE.PerspectiveCamera (or compatible).');
  }
  if (!domElement || typeof domElement.addEventListener !== 'function') {
    throw new Error('[viverse-me] createSceneAvatarController requires options.domElement.');
  }
  if (onPointerClick !== null && typeof onPointerClick !== 'function') {
    throw new Error('[viverse-me] options.onPointerClick must be a function.');
  }

  const cursorControl = installCanvasCursorControl({ element: domElement });

  const useKeyboard = input.keyboard !== false;
  const usePointer = input.pointer !== false;
  const useWheel = input.wheel !== false;
  const useTouch = input.touch !== false;
  // input.joystick: 'auto' (default; show on coarse pointer / touch devices), true (always), false (never)
  const joystickMode = input.joystick === undefined ? 'auto' : input.joystick;

  const anchor = new THREE.Group();
  anchor.add(target);
  scene.add(anchor);

  const cameraTarget = new THREE.Vector3(0, cameraOffset, 0);
  const desiredCameraTarget = new THREE.Vector3(0, cameraOffset, 0);
  const desiredCameraPosition = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  const cameraState = {
    yaw: 0,
    pitch: 0.105,
    distance: initialCameraDistance,
    minDistance: minCameraDistance,
    maxDistance: maxCameraDistance
  };
  const fixedCameraState = {
    yaw: fixedCameraYaw,
    pitch: fixedCameraPitch,
    distance: fixedCameraDistance,
    minDistance: fixedCameraMinDistance,
    maxDistance: fixedCameraMaxDistance
  };
  let cameraMode = 'orbit';
  let controlMode = 'analog';
  let controlBehavior = 'locomotion';
  let activeDestination = null;
  let continuousDestination = false;
  let destinationPointerState = createDestinationPointerState();
  const clickDragThreshold = 6;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const destinationPoint = new THREE.Vector3();
  const controlWorldRoot = new THREE.Group();
  controlWorldRoot.name = 'scene-control-packages';
  const destinationMarker = new THREE.Group();
  const destinationRing = new THREE.Mesh(
    new THREE.RingGeometry(0.19, 0.21, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  const destinationDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  destinationRing.rotation.x = -Math.PI / 2;
  destinationDot.rotation.x = -Math.PI / 2;
  destinationMarker.add(destinationRing, destinationDot);
  destinationMarker.visible = false;
  let destinationMarkerAnimationElapsed = 0;
  const destinationMarkerAnimationDuration = 0.32;
  let destinationMarkerFade = '';
  let destinationMarkerFadeElapsed = 0;
  const destinationMarkerFadeDuration = 0.3;
  const destinationMarkerDefaultColor = 0xffffff;
  const destinationMarkerContinuousColor = 0x3b82f6;
  controlWorldRoot.add(destinationMarker);
  scene.add(controlWorldRoot);

  // Seed an initial camera position from cameraState so the first paint
  // (before update() runs) is already in the right spot instead of (0,0,0).
  // Skipped in Tier B (no SDK-owned camera).
  if (camera && tierAOwnsCamera) {
    const cosPitch = Math.cos(cameraState.pitch);
    camera.position.set(
      cameraTarget.x + Math.sin(cameraState.yaw) * cosPitch * cameraState.distance,
      cameraTarget.y + Math.sin(cameraState.pitch) * cameraState.distance + 0.05,
      cameraTarget.z + Math.cos(cameraState.yaw) * cosPitch * cameraState.distance
    );
    camera.lookAt(cameraTarget);
  }

  const keyState = {
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
    KeyQ: false, KeyE: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    ShiftLeft: false, ShiftRight: false
  };

  const activePointers = new Map();
  let pinchPrevDistance = 0;
  let lastTrackpadTime = -Infinity;

  const joystickInput = { horizontal: 0, vertical: 0, accelerating: false };
  let joystickActive = false;
  let joystickPointerId = null;
  const LOCOMOTION_ACCELERATION_DURATION = Math.max(0.01, Number(locomotionAccelerationDuration) || 2);
  let locomotionElapsed = 0;
  const joystickCenter = { x: 0, y: 0 };
  const joystickSize = { base: 90, knob: 40, drag: 24 };
  const JUMP_BUTTON_DIAMETER = 64;
  let joystickUi = null;
  let joystickRequestedVisible = false;

  const physicsEnabled = physicsMode === 'builtin';
  const GRAVITY = Math.max(0, Number(gravity) || 0);
  const JUMP_VELOCITY = Math.max(0, Number(jumpVelocity) || 0);
  const GROUND_Y = Number.isFinite(groundY) ? Number(groundY) : 0;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
  let jumpEnabledFlag = enableJump !== false;
  let profileAllowsJump = true;
  const jumpState = {
    vy: 0,
    grounded: true,
    phase: 'grounded',
    airJumpUsed: false
  };
  let jumpButtonUi = null;
  let jumpButtonHideTimer = 0;
  let controlEnabledFlag = enableControl !== false;
  let justJumped = false;
  let justLanded = false;
  let currentLocomotion = 'idle';
  let currentSpeed = 0;
  let currentLocomotionProgress = 0;
  let currentGazeLockYaw = 0;
  const destinationDecelerationDuration = 0.25;
  const destinationDeceleration = {
    active: false,
    elapsed: 0,
    initialSpeed: 0,
    initialProgress: 0,
    directionX: 0,
    directionZ: 0
  };

  const previousTouchAction = domElement.style.touchAction;
  domElement.style.touchAction = 'none';

  function resetJumpState() {
    jumpState.vy = 0;
    jumpState.grounded = true;
    jumpState.phase = 'grounded';
    jumpState.airJumpUsed = false;
    anchor.position.y = GROUND_Y;
    justJumped = false;
    justLanded = false;
  }

  function requestJump() {
    if (!physicsEnabled || !jumpEnabledFlag || !profileAllowsJump) return;
    const isAirJump = jumpState.phase !== 'grounded';
    if (isAirJump && jumpState.airJumpUsed) return;
    jumpState.airJumpUsed = isAirJump;
    jumpState.vy = JUMP_VELOCITY;
    jumpState.grounded = false;
    jumpState.phase = 'rising';
    justJumped = true;
  }

  function finishJumpLanding() {
    if (jumpState.phase === 'grounded') return;
    jumpState.phase = 'grounded';
    jumpState.grounded = true;
    jumpState.airJumpUsed = false;
    jumpState.vy = 0;
    justLanded = true;
  }

  function updateJump(delta) {
    if (!physicsEnabled) return;
    if (jumpState.phase === 'grounded') return;

    jumpState.vy -= GRAVITY * delta;
    anchor.position.y += jumpState.vy * delta;

    if (jumpState.phase === 'rising' && jumpState.vy <= 0) jumpState.phase = 'falling';
    if (anchor.position.y <= GROUND_Y) {
      anchor.position.y = GROUND_Y;
      finishJumpLanding();
    }
  }

  function getMovementInput() {
    if (!controlEnabledFlag || controlMode !== 'analog') {
      return { horizontal: 0, vertical: 0, sprinting: false };
    }
    let horizontal = 0;
    let vertical = 0;
    let sprinting = false;
    let gazeLocked = false;
    let accelerating = true;
    if (useKeyboard) {
      const keyboardMovement = resolveCameraStrafeInput({
        forward: keyState.KeyW || keyState.ArrowUp,
        backward: keyState.KeyS || keyState.ArrowDown,
        left: keyState.KeyA || keyState.ArrowLeft,
        right: keyState.KeyD || keyState.ArrowRight,
        strafeLeft: keyState.KeyQ,
        strafeRight: keyState.KeyE
      });
      horizontal = keyboardMovement.horizontal;
      vertical = keyboardMovement.vertical;
      gazeLocked = keyboardMovement.gazeLocked;
      if (horizontal || vertical) {
        sprinting = keyState.ShiftLeft || keyState.ShiftRight;
      }
    }
    if (joystickActive) {
      horizontal = joystickInput.horizontal;
      vertical = joystickInput.vertical;
      sprinting = false;
      gazeLocked = false;
      accelerating = joystickInput.accelerating;
    }
    return { horizontal, vertical, sprinting, gazeLocked, accelerating };
  }

  function getActiveCameraState() {
    return cameraMode === 'fixed' ? fixedCameraState : cameraState;
  }

  function cancelDestination() {
    activeDestination = null;
    continuousDestination = false;
    if (destinationMarker.visible) {
      destinationMarkerFade = 'out';
      destinationMarkerFadeElapsed = 0;
    }
  }

  function resetDestinationDeceleration({ preserveDirection = false } = {}) {
    destinationDeceleration.active = false;
    destinationDeceleration.elapsed = 0;
    destinationDeceleration.initialSpeed = 0;
    destinationDeceleration.initialProgress = 0;
    if (!preserveDirection) {
      destinationDeceleration.directionX = 0;
      destinationDeceleration.directionZ = 0;
    }
  }

  function stopContinuousDestination() {
    const shouldDecelerate = continuousDestination
      && currentSpeed > 0
      && (destinationDeceleration.directionX || destinationDeceleration.directionZ);
    if (shouldDecelerate) {
      destinationDeceleration.active = true;
      destinationDeceleration.elapsed = 0;
      destinationDeceleration.initialSpeed = currentSpeed;
      destinationDeceleration.initialProgress = currentLocomotionProgress;
    }
    cancelDestination();
  }

  function setDestinationMarkerColor(color) {
    destinationRing.material.color.setHex(color);
    destinationDot.material.color.setHex(color);
  }

  function setDestinationFromClientPoint(clientX, clientY, { continuous = false } = {}) {
    if (!camera || controlMode !== 'destination') return;
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, destinationPoint)) return;
    resetDestinationDeceleration({ preserveDirection: true });
    activeDestination = { x: destinationPoint.x, z: destinationPoint.z };
    destinationMarker.position.set(destinationPoint.x, GROUND_Y + 0.025, destinationPoint.z);
    if (continuousDestination && continuous) return;
    continuousDestination = continuous;
    setDestinationMarkerColor(continuous ? destinationMarkerContinuousColor : destinationMarkerDefaultColor);
    destinationMarker.visible = true;
    destinationMarker.scale.setScalar(1.7);
    destinationMarkerAnimationElapsed = 0;
    destinationMarkerFade = '';
    destinationMarkerFadeElapsed = 0;
    destinationRing.material.opacity = 0.95;
    destinationDot.material.opacity = 0.95;
  }

  function setDestinationFromPointer(event) {
    setDestinationFromClientPoint(event.clientX, event.clientY);
  }

  function updateDestinationPointerHold(delta) {
    const result = updateDestinationPointer(destinationPointerState, { type: 'tick', delta }, {
      dragThreshold: clickDragThreshold
    });
    destinationPointerState = result.state;
    if (result.intent === 'enter-continuous' || destinationPointerState.phase === 'continuous') {
      setDestinationFromClientPoint(destinationPointerState.x, destinationPointerState.y, { continuous: true });
    }
  }

  function updateDestinationMarker(delta) {
    if (!destinationMarker.visible) return;
    if (destinationMarkerAnimationElapsed < destinationMarkerAnimationDuration) {
      destinationMarkerAnimationElapsed = Math.min(
        destinationMarkerAnimationElapsed + delta,
        destinationMarkerAnimationDuration
      );
      const progress = destinationMarkerAnimationElapsed / destinationMarkerAnimationDuration;
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      destinationMarker.scale.setScalar(1.7 - 0.7 * easedProgress);
    }
    if (!destinationMarkerFade) return;
    destinationMarkerFadeElapsed = Math.min(
      destinationMarkerFadeElapsed + delta,
      destinationMarkerFadeDuration
    );
    const fadeProgress = destinationMarkerFadeElapsed / destinationMarkerFadeDuration;
    const opacity = destinationMarkerFade === 'in' ? fadeProgress * 0.95 : (1 - fadeProgress) * 0.95;
    destinationRing.material.opacity = opacity;
    destinationDot.material.opacity = opacity;
    if (fadeProgress < 1) return;
    if (destinationMarkerFade === 'out') {
      destinationMarker.visible = false;
      destinationMarkerAnimationElapsed = 0;
    }
    destinationMarkerFade = '';
  }

  function updateDestinationMovement(delta) {
    currentGazeLockYaw = 0;
    if (destinationDeceleration.active) {
      const previousSpeed = currentSpeed;
      destinationDeceleration.elapsed += delta;
      const deceleration = resolveLocomotionDeceleration({
        elapsed: destinationDeceleration.elapsed,
        duration: destinationDecelerationDuration,
        initialSpeed: destinationDeceleration.initialSpeed
      });
      const distance = (previousSpeed + deceleration.speed) * 0.5 * delta;
      anchor.position.x += destinationDeceleration.directionX * distance;
      anchor.position.z += destinationDeceleration.directionZ * distance;
      currentSpeed = deceleration.speed;
      currentLocomotionProgress = destinationDeceleration.initialProgress
        * (deceleration.speed / destinationDeceleration.initialSpeed);
      currentLocomotion = currentLocomotionProgress >= 0.5 ? 'run' : 'walk';
      if (deceleration.complete) {
        resetDestinationDeceleration();
        currentSpeed = 0;
        currentLocomotionProgress = 0;
        currentLocomotion = 'idle';
      }
      return;
    }
    if (!controlEnabledFlag || !activeDestination) {
      currentSpeed = 0;
      locomotionElapsed = 0;
      currentLocomotionProgress = 0;
      currentLocomotion = 'idle';
      return;
    }
    locomotionElapsed = Math.min(locomotionElapsed + delta, LOCOMOTION_ACCELERATION_DURATION);
    const locomotion = resolveProgressiveLocomotion({
      elapsed: locomotionElapsed,
      accelerationDuration: LOCOMOTION_ACCELERATION_DURATION,
      moveSpeed,
      runSpeedMultiplier
    });
    const step = resolveDestinationStep({
      current: anchor.position,
      destination: activeDestination,
      maxDistance: locomotion.speed * delta,
      stoppingDistance: destinationStoppingDistance
    });
    if (step.arrived) {
      anchor.position.x = step.x;
      anchor.position.z = step.z;
      if (continuousDestination) {
        destinationPointerState = updateDestinationPointer(destinationPointerState, { type: 'cancel' }).state;
        stopContinuousDestination();
      } else {
        cancelDestination();
      }
      if (!destinationDeceleration.active) {
        locomotionElapsed = 0;
        currentLocomotionProgress = 0;
        currentLocomotion = 'idle';
      }
      return;
    }
    anchor.position.x = step.x;
    anchor.position.z = step.z;
    currentSpeed = locomotion.speed;
    currentLocomotionProgress = locomotion.progress;
    currentLocomotion = locomotion.locomotion;
    destinationDeceleration.directionX = step.directionX;
    destinationDeceleration.directionZ = step.directionZ;
    const targetRotation = Math.atan2(step.directionX, step.directionZ);
    const rotationDelta = Math.atan2(
      Math.sin(targetRotation - target.rotation.y),
      Math.cos(targetRotation - target.rotation.y)
    );
    target.rotation.y += rotationDelta * (1 - Math.exp(-Math.max(0, turnResponsiveness) * delta));
  }

  function updateMovement(delta) {
    if (controlMode === 'destination') {
      updateDestinationMovement(delta);
      return;
    }
    const { horizontal, vertical, sprinting, gazeLocked, accelerating } = getMovementInput();
    const moving = Boolean(horizontal || vertical);
    currentSpeed = 0;
    if (!moving) {
      locomotionElapsed = 0;
      currentLocomotionProgress = 0;
      currentLocomotion = 'idle';
      currentGazeLockYaw = 0;
      return;
    }

    locomotionElapsed = accelerating
      ? Math.min(locomotionElapsed + delta, LOCOMOTION_ACCELERATION_DURATION)
      : 0;
    const locomotion = resolveProgressiveLocomotion({
      elapsed: locomotionElapsed,
      accelerationDuration: LOCOMOTION_ACCELERATION_DURATION,
      moveSpeed,
      runSpeedMultiplier,
      sprinting
    });
    currentLocomotionProgress = locomotion.progress;
    currentLocomotion = locomotion.locomotion;
    const activeCameraState = getActiveCameraState();
    currentGazeLockYaw = resolveCameraStrafeGazeYaw({
      cameraYaw: activeCameraState.yaw,
      horizontal,
      vertical,
      gazeLocked: controlBehavior === 'locomotion' && gazeLocked
    });

    const moveDirection = new THREE.Vector3();
    const forward = new THREE.Vector3(-Math.sin(activeCameraState.yaw), 0, -Math.cos(activeCameraState.yaw)).normalize();
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    moveDirection.addScaledVector(forward, vertical);
    moveDirection.addScaledVector(right, horizontal);
    const length = moveDirection.length();
    if (length === 0) return;
    const speedScale = Math.min(length, 1);
    moveDirection.divideScalar(length);
    currentSpeed = locomotion.speed * speedScale;
    anchor.position.addScaledVector(moveDirection, delta * currentSpeed);
    const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
    const rotationDelta = Math.atan2(
      Math.sin(targetRotation - target.rotation.y),
      Math.cos(targetRotation - target.rotation.y)
    );
    const turnAlpha = 1 - Math.exp(-Math.max(0, turnResponsiveness) * delta);
    target.rotation.y += rotationDelta * turnAlpha;
  }

  function updateCamera(delta) {
    if (!tierAOwnsCamera || !camera) return;
    desiredCameraTarget.set(
      anchor.position.x,
      anchor.position.y + cameraOffset,
      anchor.position.z
    );
    cameraTarget.lerp(desiredCameraTarget, 1 - Math.exp(-delta * 12));

    const activeCameraState = getActiveCameraState();
    const position = resolveFollowCameraPosition({
      target: cameraTarget,
      yaw: activeCameraState.yaw,
      pitch: activeCameraState.pitch,
      distance: activeCameraState.distance
    });
    desiredCameraPosition.set(position.x, position.y + 0.05, position.z);
    camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 12));
    camera.lookAt(cameraTarget);
  }

  function update(delta) {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.05) : 0;
    updateDestinationPointerHold(dt);
    updateMovement(dt);
    updateJump(dt);
    updateCamera(dt);
    updateDestinationMarker(dt);
    const motion = {
      locomotion: currentLocomotion,
      airbornePhase: jumpState.phase,
      justJumped,
      justLanded,
      speed: currentSpeed,
      locomotionProgress: currentLocomotionProgress,
      gazeLockYaw: currentGazeLockYaw
    };
    justJumped = false;
    justLanded = false;
    return motion;
  }

  function clearInputState() {
    activePointers.clear();
    cursorControl.setCameraRotating(false);
    destinationPointerState = updateDestinationPointer(destinationPointerState, { type: 'cancel' }).state;
    pinchPrevDistance = 0;
    lastTrackpadTime = -Infinity;
    Object.keys(keyState).forEach((key) => {
      keyState[key] = false;
    });
    locomotionElapsed = 0;
    currentLocomotionProgress = 0;
    currentGazeLockYaw = 0;
    cancelDestination();
    resetDestinationDeceleration();
    resetJoystick();
    if (jumpButtonUi && jumpButtonUi.btn) {
      jumpButtonUi.btn.classList.remove('is-pressed');
      jumpButtonUi.btn.style.transform = 'translateY(0) scale(1)';
    }
  }

  // --- Pointer / touch ---
  function onPointerDown(event) {
    if (!controlEnabledFlag || !usePointer) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType !== 'mouse' && !useTouch) return;
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    });
    if (controlMode === 'destination' && activePointers.size === 1) {
      destinationPointerState = updateDestinationPointer(destinationPointerState, {
        type: 'down',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      }, { dragThreshold: clickDragThreshold }).state;
    }
    if (activePointers.size === 2 && useTouch) {
      cursorControl.setCameraRotating(false);
      const holdCancel = updateDestinationPointer(destinationPointerState, { type: 'cancel' });
      destinationPointerState = holdCancel.state;
      if (holdCancel.intent === 'stop') stopContinuousDestination();
      for (const pointer of activePointers.values()) pointer.moved = true;
      pinchPrevDistance = getPinchDistance();
    }
    try { domElement.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }

  function onPointerMove(event) {
    if (!controlEnabledFlag || !usePointer) return;
    const prev = activePointers.get(event.pointerId);
    if (!prev) return;
    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    prev.x = event.clientX;
    prev.y = event.clientY;
    prev.moved = prev.moved || Math.hypot(event.clientX - prev.startX, event.clientY - prev.startY) > clickDragThreshold;
    if (controlMode === 'destination') {
      destinationPointerState = updateDestinationPointer(destinationPointerState, {
        type: 'move',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      }, { dragThreshold: clickDragThreshold }).state;
    }

    if (activePointers.size === 1) {
      const rotatingCamera = (
        cameraMode === 'orbit'
        && (controlMode !== 'destination' || destinationPointerState.phase === 'drag')
      );
      cursorControl.setCameraRotating(rotatingCamera);
      if (rotatingCamera) {
        cameraState.yaw -= dx * 0.006;
        cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + dy * 0.0045, -0.15, 0.75);
      }
      return;
    }
    if (activePointers.size === 2 && useTouch) {
      const next = getPinchDistance();
      if (pinchPrevDistance > 0 && next > 0) {
        const ratio = pinchPrevDistance / next;
        const activeCameraState = getActiveCameraState();
        activeCameraState.distance = THREE.MathUtils.clamp(
          activeCameraState.distance * ratio,
          activeCameraState.minDistance,
          activeCameraState.maxDistance
        );
      }
      pinchPrevDistance = next;
    }
  }

  function onPointerUp(event) {
    cursorControl.setCameraRotating(false);
    const pointer = activePointers.get(event.pointerId);
    const singlePointerClick = activePointers.size === 1 && pointer && !pointer.moved;
    let clickIntent = controlMode !== 'destination' && singlePointerClick;
    let holdResult = null;
    if (controlMode === 'destination') {
      holdResult = updateDestinationPointer(destinationPointerState, {
        type: 'up',
        pointerId: event.pointerId
      });
      destinationPointerState = holdResult.state;
      clickIntent = holdResult.intent === 'click' && singlePointerClick;
    }
    const clickConsumed = clickIntent && onPointerClick?.(event) === true;
    if (controlMode === 'destination') {
      if (clickIntent && !clickConsumed) {
        setDestinationFromPointer(event);
      } else if (holdResult.intent === 'stop') {
        stopContinuousDestination();
      }
    }
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchPrevDistance = 0;
    }
    if (domElement.hasPointerCapture && domElement.hasPointerCapture(event.pointerId)) {
      try { domElement.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    }
  }

  function onPointerCancel(event) {
    cursorControl.setCameraRotating(false);
    const holdResult = updateDestinationPointer(destinationPointerState, { type: 'cancel' });
    destinationPointerState = holdResult.state;
    if (holdResult.intent === 'stop') stopContinuousDestination();
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchPrevDistance = 0;
    if (domElement.hasPointerCapture && domElement.hasPointerCapture(event.pointerId)) {
      try { domElement.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    }
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function getPinchDistance() {
    const points = Array.from(activePointers.values());
    if (points.length < 2) return 0;
    const dx = points[0].x - points[1].x;
    const dy = points[0].y - points[1].y;
    return Math.hypot(dx, dy);
  }

  // --- Wheel ---
  function onWheel(event) {
    if (!controlEnabledFlag || !useWheel) return;
    event.preventDefault();
    const wheelInput = classifyWheelInput(event, lastTrackpadTime);
    lastTrackpadTime = wheelInput.lastTrackpadTime;
    if (!wheelInput.deltaX && !wheelInput.deltaY) return;

    if (cameraMode === 'orbit' && wheelInput.kind === WHEEL_INPUT_KINDS.TRACKPAD_ROTATE) {
      cameraState.yaw += wheelInput.deltaX * 0.003;
      cameraState.pitch = THREE.MathUtils.clamp(
        cameraState.pitch - wheelInput.deltaY * 0.0025,
        -0.15,
        0.75
      );
      return;
    }

    // Mac trackpad pinch fires wheel with ctrlKey=true and very small deltaY,
    // so amplify it; mouse wheel keeps the gentler step.
    const step = wheelInput.kind === WHEEL_INPUT_KINDS.PINCH_ZOOM
      ? wheelInput.deltaY * 0.02
      : wheelInput.deltaY * 0.0025;
    const activeCameraState = getActiveCameraState();
    activeCameraState.distance = THREE.MathUtils.clamp(
      activeCameraState.distance + step,
      activeCameraState.minDistance,
      activeCameraState.maxDistance
    );
  }

  // --- Keyboard ---
  function onKeyDown(event) {
    if (!controlEnabledFlag || !useKeyboard) return;
    if (bindSpaceKey && physicsEnabled && jumpEnabledFlag && profileAllowsJump && event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      requestJump();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      keyState[event.code] = true;
    }
  }
  function onKeyUp(event) {
    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      keyState[event.code] = false;
    }
  }

  // --- Gesture (Safari trackpad pinch + iOS) ---
  let gestureBaselineDistance = 0;
  function onGestureStart(event) {
    event.preventDefault();
    gestureBaselineDistance = getActiveCameraState().distance;
  }
  function onGestureChange(event) {
    event.preventDefault();
    if (!controlEnabledFlag || !useWheel) return;
    const scale = Number(event.scale);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const activeCameraState = getActiveCameraState();
    activeCameraState.distance = THREE.MathUtils.clamp(
      gestureBaselineDistance / scale,
      activeCameraState.minDistance,
      activeCameraState.maxDistance
    );
  }
  function onGestureEnd(event) {
    event.preventDefault();
  }

  // --- Virtual joystick (touch / coarse pointer devices) ---
  function resetJoystick() {
    joystickActive = false;
    joystickPointerId = null;
    joystickInput.horizontal = 0;
    joystickInput.vertical = 0;
    joystickInput.accelerating = false;
    if (joystickUi && joystickUi.knob) {
      joystickUi.knob.style.transform = 'translate(0px, 0px)';
    }
  }

  function updateJoystickFromPointer(clientX, clientY) {
    const dx = clientX - joystickCenter.x;
    const dy = clientY - joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, joystickSize.drag);
    const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
    const knobX = Math.cos(angle) * clamped;
    const knobY = Math.sin(angle) * clamped;
    const locomotionInput = resolveJoystickLocomotionInput({
      horizontal: knobX,
      vertical: -knobY
    });
    joystickInput.horizontal = locomotionInput.horizontal;
    joystickInput.vertical = locomotionInput.vertical;
    joystickInput.accelerating = locomotionInput.accelerating;
    if (joystickUi && joystickUi.knob) {
      joystickUi.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }
  }

  function onJoystickPointerDown(event) {
    if (!controlEnabledFlag) return;
    if (joystickPointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    joystickPointerId = event.pointerId;
    joystickActive = true;
    const rect = joystickUi.base.getBoundingClientRect();
    joystickCenter.x = rect.left + rect.width / 2;
    joystickCenter.y = rect.top + rect.height / 2;
    try { joystickUi.base.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    updateJoystickFromPointer(event.clientX, event.clientY);
  }

  function onJoystickPointerMove(event) {
    if (event.pointerId !== joystickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystickFromPointer(event.clientX, event.clientY);
  }

  function onJoystickPointerUp(event) {
    if (event.pointerId !== joystickPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resetJoystick();
  }

  function onJoystickTouchEvent(event) {
    event.preventDefault();
  }

  function onJoystickClickSuppress(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function shouldShowJoystick() {
    if (joystickMode === false) return false;
    if (joystickMode === true) return true;
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return 'ontouchstart' in window;
  }

  let joystickParentPrevPosition = '';
  function mountJoystick() {
    if (!shouldShowJoystick()) return;
    const parent = uiContainer;
    if (!parent) return;
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      joystickParentPrevPosition = parent.style.position;
      parent.style.position = 'relative';
    }
    const base = document.createElement('div');
    base.setAttribute('aria-hidden', 'true');
    base.dataset.viverseMeJoystick = 'true';
    base.style.cssText = [
      'position:absolute',
      'left:20px',
      'bottom:24px',
      `width:${joystickSize.base}px`,
      `height:${joystickSize.base}px`,
      'border-radius:50%',
      'background:rgba(20,25,45,0.32)',
      'border:1px solid rgba(255,255,255,0.18)',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      'touch-action:none',
      'pointer-events:none',
      'z-index:20',
      'user-select:none',
      '-webkit-user-select:none',
      'opacity:0',
      'transform:translateY(16px)',
      'transition:opacity 0.5s cubic-bezier(0.20,0.50,0.50,0.90), transform 0.5s cubic-bezier(0.20,0.50,0.50,0.90)',
      'will-change:opacity, transform',
      'display:none'
    ].join(';');
    const knob = document.createElement('div');
    const knobHalf = joystickSize.knob / 2;
    knob.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      `width:${joystickSize.knob}px`,
      `height:${joystickSize.knob}px`,
      `margin:${-knobHalf}px 0 0 ${-knobHalf}px`,
      'border-radius:50%',
      'background:rgba(176,182,196,0.82)',
      'box-shadow:0 4px 14px rgba(0,0,0,0.35)',
      'transform:translate(0px,0px)',
      'transition:transform 0.08s ease-out',
      'pointer-events:none'
    ].join(';');
    base.append(knob);
    parent.append(base);
    base.addEventListener('pointerdown', onJoystickPointerDown);
    base.addEventListener('pointermove', onJoystickPointerMove);
    base.addEventListener('pointerup', onJoystickPointerUp);
    base.addEventListener('pointercancel', onJoystickPointerUp);
    base.addEventListener('touchstart', onJoystickTouchEvent, { passive: false });
    base.addEventListener('touchend', onJoystickTouchEvent, { passive: false });
    base.addEventListener('dblclick', onJoystickClickSuppress);
    base.addEventListener('click', onJoystickClickSuppress);
    joystickUi = { base, knob };
    applyJoystickVisibility();
  }

  let joystickHideTimer = 0;
  function applyJoystickVisibility() {
    if (!joystickUi || !joystickUi.base) return;
    const base = joystickUi.base;
    const shouldShow = joystickRequestedVisible && controlEnabledFlag && controlMode === 'analog';
    if (joystickHideTimer) {
      clearTimeout(joystickHideTimer);
      joystickHideTimer = 0;
    }
    if (shouldShow) {
      base.style.display = '';
      base.style.pointerEvents = 'auto';
      // Force a reflow so the next style change runs the transition.
      void base.offsetWidth;
      base.style.opacity = '1';
      base.style.transform = 'translateY(0)';
      return;
    }
    base.style.opacity = '0';
    base.style.transform = 'translateY(16px)';
    base.style.pointerEvents = 'none';
    resetJoystick();
    joystickHideTimer = window.setTimeout(() => {
      joystickHideTimer = 0;
      if (!joystickRequestedVisible || !controlEnabledFlag) {
        base.style.display = 'none';
      }
    }, 520);
  }

  function setJoystickVisible(visible) {
    joystickRequestedVisible = Boolean(visible);
    applyJoystickVisibility();
    applyJumpButtonVisibility();
  }

  // --- Jump button (mobile / coarse pointer) ---
  function getJumpButtonDiameter() {
    return JUMP_BUTTON_DIAMETER;
  }

  function shouldShowJumpButton() {
    return physicsEnabled && jumpEnabledFlag && profileAllowsJump && shouldShowJoystick();
  }

  function onJumpButtonDown(event) {
    if (!controlEnabledFlag) return;
    event.preventDefault();
    event.stopPropagation();
    try { jumpButtonUi.btn.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    jumpButtonUi.btn.classList.add('is-pressed');
    jumpButtonUi.btn.style.transform = 'translateY(0) scale(0.94)';
    requestJump();
  }

  function onJumpButtonUp(event) {
    event.preventDefault();
    event.stopPropagation();
    if (jumpButtonUi && jumpButtonUi.btn) {
      jumpButtonUi.btn.classList.remove('is-pressed');
      jumpButtonUi.btn.style.transform = 'translateY(0) scale(1)';
      if (jumpButtonUi.btn.hasPointerCapture && jumpButtonUi.btn.hasPointerCapture(event.pointerId)) {
        try { jumpButtonUi.btn.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
      }
    }
  }

  function onJumpButtonTouchEvent(event) {
    event.preventDefault();
  }

  function onJumpButtonClickSuppress(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function mountJumpButton() {
    if (!shouldShowJumpButton()) return;
    if (jumpButtonUi) return;
    const parent = uiContainer;
    if (!parent) return;
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }
    const diameter = getJumpButtonDiameter();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Jump');
    btn.dataset.viverseMeJumpButton = 'true';
    const jumpIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    jumpIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    jumpIcon.setAttribute('height', '24px');
    jumpIcon.setAttribute('viewBox', '0 -960 960 960');
    jumpIcon.setAttribute('width', '24px');
    jumpIcon.setAttribute('fill', '#e3e3e3');
    jumpIcon.setAttribute('aria-hidden', 'true');
    const jumpIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    jumpIconPath.setAttribute('d', 'M440-727 256-544l-56-56 280-280 280 280-56 57-184-184v287h-80v-287Zm0 487v-120h80v120h-80Zm0 160v-80h80v80h-80Z');
    jumpIcon.append(jumpIconPath);
    btn.append(jumpIcon);
    btn.style.cssText = [
      'position:absolute',
      'display:grid',
      'place-items:center',
      'padding:0',
      'right:24px',
      'bottom:32px',
      `width:${diameter}px`,
      `height:${diameter}px`,
      'border-radius:50%',
      'background:rgba(20,25,45,0.42)',
      'border:1px solid rgba(255,255,255,0.22)',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      'color:rgba(240,243,255,0.92)',
      'touch-action:none',
      'user-select:none',
      '-webkit-user-select:none',
      'cursor:pointer',
      'z-index:20',
      'opacity:0',
      'transform:translateY(16px)',
      'transition:opacity 0.5s cubic-bezier(0.20,0.50,0.50,0.90), transform 0.18s ease-out',
      'will-change:opacity, transform',
      'display:none'
    ].join(';');
    parent.append(btn);
    btn.addEventListener('pointerdown', onJumpButtonDown);
    btn.addEventListener('pointerup', onJumpButtonUp);
    btn.addEventListener('pointercancel', onJumpButtonUp);
    btn.addEventListener('touchstart', onJumpButtonTouchEvent, { passive: false });
    btn.addEventListener('touchend', onJumpButtonTouchEvent, { passive: false });
    btn.addEventListener('dblclick', onJumpButtonClickSuppress);
    btn.addEventListener('click', onJumpButtonClickSuppress);
    jumpButtonUi = { btn };
    applyJumpButtonVisibility();
  }

  function applyJumpButtonVisibility() {
    if (!jumpButtonUi || !jumpButtonUi.btn) return;
    const btn = jumpButtonUi.btn;
    const shouldShow = joystickRequestedVisible && controlEnabledFlag && physicsEnabled && jumpEnabledFlag && profileAllowsJump;
    if (jumpButtonHideTimer) {
      clearTimeout(jumpButtonHideTimer);
      jumpButtonHideTimer = 0;
    }
    if (shouldShow) {
      btn.style.display = '';
      btn.style.pointerEvents = 'auto';
      void btn.offsetWidth;
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0) scale(1)';
      return;
    }
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(16px) scale(1)';
    btn.style.pointerEvents = 'none';
    jumpButtonHideTimer = window.setTimeout(() => {
      jumpButtonHideTimer = 0;
      if (!(joystickRequestedVisible && controlEnabledFlag && physicsEnabled && jumpEnabledFlag)) {
        btn.style.display = 'none';
      }
    }, 520);
  }

  function setEnableJump(value) {
    const next = value !== false;
    if (next === jumpEnabledFlag) return;
    jumpEnabledFlag = next;
    if (!jumpEnabledFlag) {
      if (jumpState.phase !== 'grounded') {
        resetJumpState();
      }
    } else if (!jumpButtonUi) {
      mountJumpButton();
    }
    applyJumpButtonVisibility();
  }

  // Orbit / pinch-zoom on the canvas only matter when SDK drives the camera.
  // In Tier B the host owns the camera, so we skip these listeners entirely.
  if (tierAOwnsCamera) {
    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerCancel);
    domElement.addEventListener('contextmenu', onContextMenu);
    domElement.addEventListener('wheel', onWheel, { passive: false });
    domElement.addEventListener('gesturestart', onGestureStart, { passive: false });
    domElement.addEventListener('gesturechange', onGestureChange, { passive: false });
    domElement.addEventListener('gestureend', onGestureEnd, { passive: false });
  }
  if (useKeyboard) {
    if (!keyboardTarget || typeof keyboardTarget.addEventListener !== 'function') {
      throw new Error('[viverse-me] options.keyboardTarget must support addEventListener.');
    }
    keyboardTarget.addEventListener('keydown', onKeyDown);
    keyboardTarget.addEventListener('keyup', onKeyUp);
  }
  mountJoystick();
  mountJumpButton();

  function setEnableControl(value) {
    const next = value !== false;
    if (next === controlEnabledFlag) {
      return;
    }
    controlEnabledFlag = next;
    applyJoystickVisibility();
    applyJumpButtonVisibility();
    if (!controlEnabledFlag) {
      clearInputState();
    }
  }

  function setCameraDistance(distance) {
    const next = Number(distance);
    if (!Number.isFinite(next)) return;
    const activeCameraState = getActiveCameraState();
    activeCameraState.distance = THREE.MathUtils.clamp(next, activeCameraState.minDistance, activeCameraState.maxDistance);
  }

  function resetPosition(position = {}) {
    const nextPosition = position && typeof position === 'object' ? position : {};
    const x = Number.isFinite(nextPosition.x) ? nextPosition.x : 0;
    const z = Number.isFinite(nextPosition.z) ? nextPosition.z : 0;
    const y = Number.isFinite(nextPosition.y) ? nextPosition.y : GROUND_Y;
    clearInputState();
    anchor.position.set(x, y, z);
    if (physicsEnabled) resetJumpState();
    currentLocomotion = 'idle';
    currentSpeed = 0;
    target.rotation.y = Number.isFinite(nextPosition.rotationY) ? nextPosition.rotationY : 0;
  }

  const controlPackages = createControlPackageRegistry();
  let activeCameraPackage = '';
  let activeControlPackage = '';
  controlPackages.registerAll([
    {
      id: CONTROL_PACKAGE_IDS.THIRD_PERSON_CAMERA, type: 'camera', install: () => ({
        activate() { cameraMode = 'orbit'; activeCameraPackage = CONTROL_PACKAGE_IDS.THIRD_PERSON_CAMERA; },
        deactivate() { cursorControl.setCameraRotating(false); if (activeCameraPackage === CONTROL_PACKAGE_IDS.THIRD_PERSON_CAMERA) activeCameraPackage = ''; }
      })
    },
    {
      id: CONTROL_PACKAGE_IDS.TOP_DOWN_CAMERA, type: 'camera', install: () => ({
        activate() { cameraMode = 'fixed'; activeCameraPackage = CONTROL_PACKAGE_IDS.TOP_DOWN_CAMERA; },
        deactivate() { if (activeCameraPackage === CONTROL_PACKAGE_IDS.TOP_DOWN_CAMERA) activeCameraPackage = ''; }
      })
    },
    {
      id: CONTROL_PACKAGE_IDS.LOCOMOTION_CONTROL, type: 'control', install: () => ({
        activate() { controlMode = 'analog'; controlBehavior = 'locomotion'; profileAllowsJump = true; activeControlPackage = CONTROL_PACKAGE_IDS.LOCOMOTION_CONTROL; applyJoystickVisibility(); applyJumpButtonVisibility(); },
        deactivate() { if (activeControlPackage === CONTROL_PACKAGE_IDS.LOCOMOTION_CONTROL) activeControlPackage = ''; }
      })
    },
    {
      id: CONTROL_PACKAGE_IDS.LOCOMOTION_NO_GAZE_CONTROL, type: 'control', install: () => ({
        activate() { controlMode = 'analog'; controlBehavior = 'locomotion-no-gaze'; profileAllowsJump = true; activeControlPackage = CONTROL_PACKAGE_IDS.LOCOMOTION_NO_GAZE_CONTROL; applyJoystickVisibility(); applyJumpButtonVisibility(); },
        deactivate() { if (activeControlPackage === CONTROL_PACKAGE_IDS.LOCOMOTION_NO_GAZE_CONTROL) activeControlPackage = ''; }
      })
    },
    {
      id: CONTROL_PACKAGE_IDS.CLICK_TO_MOVE_CONTROL, type: 'control', install: () => ({
        activate() { controlMode = 'destination'; cursorControl.setClickToMoveActive(true); profileAllowsJump = false; activeControlPackage = CONTROL_PACKAGE_IDS.CLICK_TO_MOVE_CONTROL; applyJoystickVisibility(); applyJumpButtonVisibility(); },
        deactivate() { cursorControl.setClickToMoveActive(false); if (activeControlPackage === CONTROL_PACKAGE_IDS.CLICK_TO_MOVE_CONTROL) activeControlPackage = ''; cancelDestination(); }
      })
    }
  ]);
  const controlProfiles = createControlProfileRegistry({
    packages: controlPackages,
    profiles: CONTROL_PROFILES,
    clearInput: clearInputState
  });
  controlProfiles.installAll();
  controlProfiles.activate(initialProfile);

  function dispose() {
    controlProfiles.dispose();
    controlPackages.dispose();
    cursorControl.dispose();
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerCancel);
    domElement.removeEventListener('contextmenu', onContextMenu);
    domElement.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('gesturestart', onGestureStart);
    domElement.removeEventListener('gesturechange', onGestureChange);
    domElement.removeEventListener('gestureend', onGestureEnd);
    if (joystickUi && joystickUi.base) {
      if (joystickHideTimer) {
        clearTimeout(joystickHideTimer);
        joystickHideTimer = 0;
      }
      joystickUi.base.removeEventListener('pointerdown', onJoystickPointerDown);
      joystickUi.base.removeEventListener('pointermove', onJoystickPointerMove);
      joystickUi.base.removeEventListener('pointerup', onJoystickPointerUp);
      joystickUi.base.removeEventListener('pointercancel', onJoystickPointerUp);
      joystickUi.base.removeEventListener('touchstart', onJoystickTouchEvent);
      joystickUi.base.removeEventListener('touchend', onJoystickTouchEvent);
      joystickUi.base.removeEventListener('dblclick', onJoystickClickSuppress);
      joystickUi.base.removeEventListener('click', onJoystickClickSuppress);
      if (joystickUi.base.parentNode) {
        const parent = joystickUi.base.parentNode;
        parent.removeChild(joystickUi.base);
        if (joystickParentPrevPosition !== undefined && parent instanceof HTMLElement) {
          parent.style.position = joystickParentPrevPosition;
        }
      }
      joystickUi = null;
    }
    if (useKeyboard) {
      keyboardTarget.removeEventListener('keydown', onKeyDown);
      keyboardTarget.removeEventListener('keyup', onKeyUp);
    }
    if (jumpButtonUi && jumpButtonUi.btn) {
      if (jumpButtonHideTimer) {
        clearTimeout(jumpButtonHideTimer);
        jumpButtonHideTimer = 0;
      }
      jumpButtonUi.btn.removeEventListener('pointerdown', onJumpButtonDown);
      jumpButtonUi.btn.removeEventListener('pointerup', onJumpButtonUp);
      jumpButtonUi.btn.removeEventListener('pointercancel', onJumpButtonUp);
      jumpButtonUi.btn.removeEventListener('touchstart', onJumpButtonTouchEvent);
      jumpButtonUi.btn.removeEventListener('touchend', onJumpButtonTouchEvent);
      jumpButtonUi.btn.removeEventListener('dblclick', onJumpButtonClickSuppress);
      jumpButtonUi.btn.removeEventListener('click', onJumpButtonClickSuppress);
      if (jumpButtonUi.btn.parentNode) {
        jumpButtonUi.btn.parentNode.removeChild(jumpButtonUi.btn);
      }
      jumpButtonUi = null;
    }
    domElement.style.touchAction = previousTouchAction;
    clearInputState();
    scene.remove(controlWorldRoot);
    destinationRing.geometry.dispose();
    destinationRing.material.dispose();
    destinationDot.geometry.dispose();
    destinationDot.material.dispose();
    scene.remove(anchor);
  }

  return {
    update,
    setEnableControl,
    setEnableJump,
    setCameraDistance,
    resetPosition,
    setJoystickVisible,
    setProfile: controlProfiles.activate,
    setControlProfile: controlProfiles.activate,
    jump: requestJump,
    dispose,
    controlPackages,
    controlProfiles,
    get anchor() { return anchor; },
    get target() { return target; },
    get camera() { return camera; },
    get cameraTarget() { return cameraTarget; },
    get cameraState() { return { ...getActiveCameraState() }; },
    get activeProfile() { return controlProfiles.activeId; },
    get activeControlProfile() { return controlProfiles.activeId; },
    get enableControl() { return controlEnabledFlag; },
    get enableJump() { return jumpEnabledFlag; },
    get physicsMode() { return physicsEnabled ? 'builtin' : 'none'; },
    get isGrounded() { return jumpState.grounded; },
    get jumpPhase() { return jumpState.phase; }
  };
}
