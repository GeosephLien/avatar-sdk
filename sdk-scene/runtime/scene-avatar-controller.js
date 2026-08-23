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
    uiContainer = domElement?.parentElement,
    keyboardTarget = globalThis.window,
    moveSpeed = 2.4,
    runSpeedMultiplier = 2.3,
    turnResponsiveness = 12,
    cameraOffset = 1.1,
    initialCameraDistance = 4.5,
    minCameraDistance = 1.75,
    maxCameraDistance = 6.5
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
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    ShiftLeft: false, ShiftRight: false
  };

  const activePointers = new Map();
  let pinchPrevDistance = 0;

  const joystickInput = { horizontal: 0, vertical: 0 };
  let joystickActive = false;
  let joystickPointerId = null;
  let joystickRunning = false;
  let lastJoystickReleaseTime = 0;
  const JOYSTICK_DOUBLE_TAP_MS = 320;
  const KEYBOARD_DOUBLE_TAP_MS = 320;
  const MOVEMENT_KEY_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  let lastMovementKeyReleaseTime = 0;
  let keyboardRunning = false;
  const joystickCenter = { x: 0, y: 0 };
  const JOYSTICK_SIZE_PRESETS = {
    default: { base: 120, knob: 52, drag: 44 },
    small: { base: 80, knob: 36, drag: 30 }
  };
  let joystickSize = JOYSTICK_SIZE_PRESETS.default;
  let joystickSizeKey = 'default';
  let joystickUi = null;
  let joystickRequestedVisible = false;

  const physicsEnabled = physicsMode === 'builtin';
  const GRAVITY = Math.max(0, Number(gravity) || 0);
  const JUMP_VELOCITY = Math.max(0, Number(jumpVelocity) || 0);
  const GROUND_Y = Number.isFinite(groundY) ? Number(groundY) : 0;
  let jumpEnabledFlag = enableJump !== false;
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
    if (!physicsEnabled || !jumpEnabledFlag) return;
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
    if (!controlEnabledFlag) {
      return { horizontal: 0, vertical: 0, running: false };
    }
    let horizontal = 0;
    let vertical = 0;
    let running = false;
    if (useKeyboard) {
      horizontal = (keyState.KeyD || keyState.ArrowRight ? 1 : 0) - (keyState.KeyA || keyState.ArrowLeft ? 1 : 0);
      vertical = (keyState.KeyW || keyState.ArrowUp ? 1 : 0) - (keyState.KeyS || keyState.ArrowDown ? 1 : 0);
      if (horizontal || vertical) {
        running = keyState.ShiftLeft || keyState.ShiftRight || keyboardRunning;
      }
    }
    if (joystickActive) {
      horizontal = joystickInput.horizontal;
      vertical = joystickInput.vertical;
      running = joystickRunning;
    }
    return { horizontal, vertical, running };
  }

  function updateMovement(delta) {
    const { horizontal, vertical, running } = getMovementInput();
    const moving = Boolean(horizontal || vertical);
    currentLocomotion = moving ? (running ? 'run' : 'walk') : 'idle';
    currentSpeed = 0;
    if (!moving) return;

    const moveDirection = new THREE.Vector3();
    const forward = new THREE.Vector3(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw)).normalize();
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    moveDirection.addScaledVector(forward, vertical);
    moveDirection.addScaledVector(right, horizontal);
    const length = moveDirection.length();
    if (length === 0) return;
    const speedScale = Math.min(length, 1);
    moveDirection.divideScalar(length);
    const speed = running ? moveSpeed * runSpeedMultiplier : moveSpeed;
    currentSpeed = speed * speedScale;
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
    cameraTarget.lerp(desiredCameraTarget, 1 - Math.exp(-delta * 8));

    const cosPitch = Math.cos(cameraState.pitch);
    desiredCameraPosition.set(
      cameraTarget.x + Math.sin(cameraState.yaw) * cosPitch * cameraState.distance,
      cameraTarget.y + Math.sin(cameraState.pitch) * cameraState.distance + 0.05,
      cameraTarget.z + Math.cos(cameraState.yaw) * cosPitch * cameraState.distance
    );
    camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 9.6));
    camera.lookAt(cameraTarget);
  }

  function update(delta) {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.05) : 0;
    updateMovement(dt);
    updateJump(dt);
    updateCamera(dt);
    const motion = {
      locomotion: currentLocomotion,
      airbornePhase: jumpState.phase,
      justJumped,
      justLanded,
      speed: currentSpeed
    };
    justJumped = false;
    justLanded = false;
    return motion;
  }

  function clearInputState() {
    activePointers.clear();
    pinchPrevDistance = 0;
    Object.keys(keyState).forEach((key) => {
      keyState[key] = false;
    });
    keyboardRunning = false;
    lastMovementKeyReleaseTime = 0;
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
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2 && useTouch) {
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
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 1) {
      cameraState.yaw -= dx * 0.006;
      cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + dy * 0.0045, -0.15, 0.75);
      return;
    }
    if (activePointers.size === 2 && useTouch) {
      const next = getPinchDistance();
      if (pinchPrevDistance > 0 && next > 0) {
        const ratio = pinchPrevDistance / next;
        cameraState.distance = THREE.MathUtils.clamp(
          cameraState.distance * ratio,
          cameraState.minDistance,
          cameraState.maxDistance
        );
      }
      pinchPrevDistance = next;
    }
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchPrevDistance = 0;
    }
    if (domElement.hasPointerCapture && domElement.hasPointerCapture(event.pointerId)) {
      try { domElement.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    }
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
    // Normalize deltaY across deltaMode (0=pixel, 1=line, 2=page).
    const deltaModeFactor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const normalizedDelta = event.deltaY * deltaModeFactor;
    // Mac trackpad pinch fires wheel with ctrlKey=true and very small deltaY,
    // so amplify it; mouse wheel keeps the gentler step.
    const step = event.ctrlKey ? normalizedDelta * 0.02 : normalizedDelta * 0.0025;
    cameraState.distance = THREE.MathUtils.clamp(
      cameraState.distance + step,
      cameraState.minDistance,
      cameraState.maxDistance
    );
  }

  // --- Keyboard ---
  function anyMovementKeyDown() {
    for (let i = 0; i < MOVEMENT_KEY_CODES.length; i++) {
      if (keyState[MOVEMENT_KEY_CODES[i]]) return true;
    }
    return false;
  }

  function onKeyDown(event) {
    if (!controlEnabledFlag || !useKeyboard) return;
    if (bindSpaceKey && physicsEnabled && jumpEnabledFlag && event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      requestJump();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      const isMovementKey = MOVEMENT_KEY_CODES.includes(event.code);
      const wasDown = keyState[event.code];
      keyState[event.code] = true;
      if (isMovementKey && !wasDown && !keyboardRunning) {
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (lastMovementKeyReleaseTime > 0 && (now - lastMovementKeyReleaseTime) <= KEYBOARD_DOUBLE_TAP_MS) {
          keyboardRunning = true;
        }
      }
    }
  }
  function onKeyUp(event) {
    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      const isMovementKey = MOVEMENT_KEY_CODES.includes(event.code);
      keyState[event.code] = false;
      if (isMovementKey && !anyMovementKeyDown()) {
        lastMovementKeyReleaseTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        keyboardRunning = false;
      }
    }
  }

  // --- Gesture (Safari trackpad pinch + iOS) ---
  let gestureBaselineDistance = 0;
  function onGestureStart(event) {
    event.preventDefault();
    gestureBaselineDistance = cameraState.distance;
  }
  function onGestureChange(event) {
    event.preventDefault();
    if (!controlEnabledFlag || !useWheel) return;
    const scale = Number(event.scale);
    if (!Number.isFinite(scale) || scale <= 0) return;
    cameraState.distance = THREE.MathUtils.clamp(
      gestureBaselineDistance / scale,
      cameraState.minDistance,
      cameraState.maxDistance
    );
  }
  function onGestureEnd(event) {
    event.preventDefault();
  }

  // --- Virtual joystick (touch / coarse pointer devices) ---
  function resetJoystick() {
    joystickActive = false;
    joystickPointerId = null;
    joystickRunning = false;
    joystickInput.horizontal = 0;
    joystickInput.vertical = 0;
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
    joystickInput.horizontal = knobX / joystickSize.drag;
    joystickInput.vertical = -knobY / joystickSize.drag; // screen-y down -> forward negative
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
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    joystickRunning = lastJoystickReleaseTime > 0 && (now - lastJoystickReleaseTime) <= JOYSTICK_DOUBLE_TAP_MS;
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
    lastJoystickReleaseTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
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
    const shouldShow = joystickRequestedVisible && controlEnabledFlag;
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

  function setControllerSize(size) {
    const nextKey = size === 'small' ? 'small' : 'default';
    if (nextKey === joystickSizeKey) return;
    joystickSizeKey = nextKey;
    joystickSize = JOYSTICK_SIZE_PRESETS[nextKey];
    if (joystickUi && joystickUi.base && joystickUi.knob) {
      const { base, knob } = joystickUi;
      base.style.width = `${joystickSize.base}px`;
      base.style.height = `${joystickSize.base}px`;
      const knobHalf = joystickSize.knob / 2;
      knob.style.width = `${joystickSize.knob}px`;
      knob.style.height = `${joystickSize.knob}px`;
      knob.style.margin = `${-knobHalf}px 0 0 ${-knobHalf}px`;
    }
    applyJumpButtonSize();
    resetJoystick();
  }

  // --- Jump button (mobile / coarse pointer) ---
  function getJumpButtonDiameter() {
    return joystickSize.knob + 28;
  }

  function applyJumpButtonSize() {
    if (!jumpButtonUi || !jumpButtonUi.btn) return;
    const diameter = getJumpButtonDiameter();
    const btn = jumpButtonUi.btn;
    btn.style.width = `${diameter}px`;
    btn.style.height = `${diameter}px`;
    btn.style.fontSize = joystickSizeKey === 'small' ? '11px' : '13px';
  }

  function shouldShowJumpButton() {
    return physicsEnabled && jumpEnabledFlag && shouldShowJoystick();
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
    btn.textContent = 'Jump';
    btn.style.cssText = [
      'position:absolute',
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
      `font:600 ${joystickSizeKey === 'small' ? '11px' : '13px'}/1 system-ui, -apple-system, "Segoe UI", sans-serif`,
      'letter-spacing:0.04em',
      'text-transform:uppercase',
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
    const shouldShow = joystickRequestedVisible && controlEnabledFlag && physicsEnabled && jumpEnabledFlag;
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
    domElement.addEventListener('pointercancel', onPointerUp);
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
    cameraState.distance = THREE.MathUtils.clamp(next, cameraState.minDistance, cameraState.maxDistance);
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
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
    scene.remove(anchor);
  }

  return {
    update,
    setEnableControl,
    setEnableJump,
    setCameraDistance,
    setJoystickVisible,
    setControllerSize,
    jump: requestJump,
    dispose,
    get anchor() { return anchor; },
    get target() { return target; },
    get camera() { return camera; },
    get cameraTarget() { return cameraTarget; },
    get cameraState() { return { ...cameraState }; },
    get enableControl() { return controlEnabledFlag; },
    get enableJump() { return jumpEnabledFlag; },
    get physicsMode() { return physicsEnabled ? 'builtin' : 'none'; },
    get isGrounded() { return jumpState.grounded; },
    get jumpPhase() { return jumpState.phase; }
  };
}
