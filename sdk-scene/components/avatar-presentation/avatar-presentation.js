import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip
} from '@pixiv/three-vrm-animation';

import {
  normalizeMotionState,
  resolveAnimationIntent,
  resolveGazeBoneYaws,
  resolveLocomotionBlend,
  resolveWalkAnimationTimeScale,
  resolveTransientIntent
} from './avatar-motion.js';
import { createVrmaCache } from './vrma-cache.js';
import { createSdkAssetUrl } from '../../sdk-config.js';

export const DEFAULT_ANIMATION_BASE_URL = createSdkAssetUrl('animations/v1/');
export const DEFAULT_ANIMATION_REVISION = '20260821-cors';
export const DEFAULT_ANIMATION_NAMES = [
  'idle',
  'walk',
  'run',
  'jump_start',
  'jump_up',
  'jump_loop',
  'jump_down'
];

export function createAnimationManifest(baseUrl, revision = '') {
  return Object.fromEntries(DEFAULT_ANIMATION_NAMES.map((name) => {
    const url = new URL(`${name}.vrma`, baseUrl);
    if (revision) url.searchParams.set('v', revision);
    return [name, url.href];
  }));
}

function normalizeAnimations(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(DEFAULT_ANIMATION_NAMES.map((name) => [
    name,
    typeof source[name] === 'string' ? source[name] : ''
  ]));
}

export function createAvatarPresentation(options = {}) {
  const object3D = options.object3D || new THREE.Group();
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const avatarLoader = new GLTFLoader();
  avatarLoader.crossOrigin = 'anonymous';
  avatarLoader.register((parser) => new VRMLoaderPlugin(parser));
  const animationLoader = new GLTFLoader();
  animationLoader.crossOrigin = 'anonymous';
  animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const vrmaCache = createVrmaCache(async (url) => {
    const gltf = await animationLoader.loadAsync(url);
    const vrmAnimation = gltf.userData.vrmAnimations?.[0];
    if (!vrmAnimation) throw new Error(`No VRM animation was found at ${url}`);
    return vrmAnimation;
  });

  let animationUrls = normalizeAnimations(options.animations);
  let animationEnabled = options.enableAnimation !== false;
  let currentVrm = null;
  let ownsCurrentVrm = false;
  let mixer = null;
  let actions = {};
  let capabilities = Object.fromEntries(DEFAULT_ANIMATION_NAMES.map((name) => [name, false]));
  let currentIntent = null;
  let transientIntent = null;
  let motion = normalizeMotionState();
  let loadSequence = 0;
  let disposed = false;
  let previousFootstepPhase = null;
  let previousFootstepIntent = null;
  let appliedGazeLockYaw = 0;
  let smoothedGazeLockYaw = 0;
  const runAnimationTimeScale = Math.max(1, Number(options.runAnimationTimeScale) || 1.15);
  const walkAnimationTimeScale = Math.max(1, Number(options.walkAnimationTimeScale) || runAnimationTimeScale);
  const headGazeAxis = new THREE.Vector3(0, 1, 0);
  const headGazeQuaternion = new THREE.Quaternion();

  function emit(type, detail = {}) {
    onEvent({ type, detail });
  }

  function clearMixer() {
    if (mixer) mixer.stopAllAction();
    mixer = null;
    actions = {};
    capabilities = Object.fromEntries(DEFAULT_ANIMATION_NAMES.map((name) => [name, false]));
    currentIntent = null;
    transientIntent = null;
    previousFootstepPhase = null;
    previousFootstepIntent = null;
  }

  function getHumanoidBone(name) {
    if (!currentVrm || !currentVrm.humanoid) return null;
    return currentVrm.humanoid.getRawBoneNode(name)
      || currentVrm.humanoid.getNormalizedBoneNode(name);
  }

  function applyGazeBoneYaws(gazeLockYaw, direction = 1) {
    const boneYaws = resolveGazeBoneYaws({ gazeLockYaw });
    Object.entries(boneYaws).forEach(([name, yaw]) => {
      const bone = getHumanoidBone(name);
      if (!bone) return;
      headGazeQuaternion.setFromAxisAngle(headGazeAxis, yaw * direction);
      bone.quaternion.multiply(headGazeQuaternion);
    });
  }

  function clearAppliedHeadGaze() {
    if (!appliedGazeLockYaw) return;
    applyGazeBoneYaws(appliedGazeLockYaw, -1);
    appliedGazeLockYaw = 0;
  }

  function applyHeadGaze(delta) {
    const targetYaw = motion.gazeLockYaw;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - smoothedGazeLockYaw),
      Math.cos(targetYaw - smoothedGazeLockYaw)
    );
    const response = 1 - Math.exp(-16 * delta);
    smoothedGazeLockYaw += yawDelta * response;
    if (Math.abs(smoothedGazeLockYaw) < 0.0001 && Math.abs(targetYaw) < 0.0001) {
      smoothedGazeLockYaw = 0;
      return;
    }

    applyGazeBoneYaws(smoothedGazeLockYaw);
    appliedGazeLockYaw = smoothedGazeLockYaw;
  }

  function releaseCurrentAvatar() {
    clearAppliedHeadGaze();
    clearMixer();
    if (!currentVrm) return;
    object3D.remove(currentVrm.scene);
    if (ownsCurrentVrm) VRMUtils.deepDispose(currentVrm.scene);
    currentVrm = null;
    ownsCurrentVrm = false;
    smoothedGazeLockYaw = 0;
  }

  function activateIntent(nextIntent, fadeDuration = 0.2, restart = false) {
    if (!mixer || !nextIntent) return;
    const previousAction = actions[currentIntent];
    const nextAction = actions[nextIntent];
    if (!nextAction) return;
    if (nextIntent === currentIntent && !restart) return;
    if (currentIntent === 'walk' || currentIntent === 'run') {
      ['walk', 'run'].forEach((name) => {
        if (actions[name]) actions[name].fadeOut(fadeDuration);
      });
    } else if (previousAction) {
      previousAction.fadeOut(fadeDuration);
    }
    nextAction.reset().fadeIn(fadeDuration).play();
    currentIntent = nextIntent;
  }

  function activateLocomotionBlend() {
    const blend = resolveLocomotionBlend(motion, capabilities);
    if (blend.walk === 0 && blend.run === 0) return false;

    const wasLocomoting = currentIntent === 'walk' || currentIntent === 'run';
    if (!wasLocomoting && actions[currentIntent]) actions[currentIntent].fadeOut(0.2);

    const walkAction = actions.walk;
    const runAction = actions.run;
    if (!wasLocomoting) {
      walkAction.reset().play();
      if (runAction) runAction.reset().play();
    }
    walkAction.enabled = true;
    walkAction.setEffectiveTimeScale(resolveWalkAnimationTimeScale(motion, walkAnimationTimeScale));
    walkAction.setEffectiveWeight(blend.walk);
    if (runAction) {
      runAction.enabled = true;
      runAction.setEffectiveWeight(blend.run);
    }
    currentIntent = blend.run >= blend.walk ? 'run' : 'walk';
    return true;
  }

  function applyMotion() {
    if (!animationEnabled || !mixer) return;
    transientIntent = resolveTransientIntent(transientIntent, motion, capabilities);
    const intent = transientIntent || resolveAnimationIntent(motion, capabilities);
    if (!transientIntent && (intent === 'walk' || intent === 'run') && activateLocomotionBlend()) return;
    activateIntent(intent, 0.2, motion.justJumped || motion.justLanded);
  }

  async function loadAnimations(vrm, sequence) {
    const entries = DEFAULT_ANIMATION_NAMES.filter((name) => animationUrls[name]);
    const loaded = await Promise.all(entries.map(async (name) => {
      try {
        return [name, await vrmaCache.getOrLoad(animationUrls[name])];
      } catch (error) {
        if (name === 'idle' || name === 'walk') throw error;
        return [name, null];
      }
    }));

    if (disposed || sequence !== loadSequence || currentVrm !== vrm) return;
    const clips = loaded.map(([name, vrmAnimation]) => [
      name,
      vrmAnimation ? createVRMAnimationClip(vrmAnimation, vrm) : null
    ]);
    clearMixer();
    mixer = new THREE.AnimationMixer(vrm.scene);
    actions = Object.fromEntries(clips.map(([name, clip]) => [name, clip ? mixer.clipAction(clip) : null]));
    capabilities = Object.fromEntries(DEFAULT_ANIMATION_NAMES.map((name) => [name, Boolean(actions[name])]));
    if (actions.run) actions.run.setEffectiveTimeScale(runAnimationTimeScale);
    ['jump_start', 'jump_up', 'jump_down'].forEach((name) => {
      if (!actions[name]) return;
      actions[name].setLoop(THREE.LoopOnce, 1);
      actions[name].clampWhenFinished = true;
    });
    if (actions.jump_loop) actions.jump_loop.setLoop(THREE.LoopRepeat, Infinity);
    mixer.addEventListener('finished', ({ action }) => {
      if (action !== actions[transientIntent]) return;
      transientIntent = null;
      applyMotion();
    });
    applyMotion();
    emit('animations-ready', { capabilities: { ...capabilities } });
  }

  function refreshAnimations() {
    const sequence = ++loadSequence;
    clearMixer();
    if (!currentVrm || !animationEnabled) return;
    void loadAnimations(currentVrm, sequence).catch((error) => {
      if (sequence !== loadSequence || disposed) return;
      emit('animation-error', { error });
    });
  }

  function setAvatar(vrm, avatarOptions = {}) {
    if (disposed) throw new Error('Avatar presentation has been disposed.');
    releaseCurrentAvatar();
    if (!vrm) return;
    currentVrm = vrm;
    ownsCurrentVrm = avatarOptions.owned === true;
    if (avatarOptions.animations) animationUrls = normalizeAnimations(avatarOptions.animations);
    object3D.add(vrm.scene);
    vrm.scene.position.set(0, 0, 0);
    vrm.scene.rotation.set(0, Math.PI, 0);
    refreshAnimations();
  }

  async function loadAvatarFromUrl(url, avatarOptions = {}) {
    if (disposed) throw new Error('Avatar presentation has been disposed.');
    const sequence = ++loadSequence;
    const gltf = await avatarLoader.loadAsync(url);
    if (disposed || sequence !== loadSequence) {
      if (gltf.userData.vrm) VRMUtils.deepDispose(gltf.userData.vrm.scene);
      return null;
    }
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('The selected file is not a VRM.');
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    vrm.scene.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = avatarOptions.castShadow !== false;
      child.receiveShadow = avatarOptions.receiveShadow !== false;
    });
    setAvatar(vrm, { ...avatarOptions, owned: true });
    emit('avatar-loaded', { vrm, metadata: avatarOptions.metadata || null });
    return vrm;
  }

  function setAnimations(value) {
    animationUrls = normalizeAnimations(value);
    refreshAnimations();
  }

  function setMotion(value) {
    motion = normalizeMotionState(value);
    applyMotion();
  }

  function setEnableAnimation(value) {
    const next = value !== false;
    if (next === animationEnabled) return;
    animationEnabled = next;
    refreshAnimations();
  }

  function update(delta) {
    if (disposed || !currentVrm) return;
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.05) : 0;
    clearAppliedHeadGaze();
    if (animationEnabled && mixer) {
      mixer.update(dt);
      const action = currentIntent === 'walk' ? actions.walk : currentIntent === 'run' ? actions.run : null;
      if (action) {
        const duration = action.getClip().duration;
        const phase = duration > 0 ? (action.time / duration) % 1 : 0;
        if (previousFootstepIntent === currentIntent && previousFootstepPhase !== null) {
          const crossed = (step) => previousFootstepPhase <= phase
            ? previousFootstepPhase < step && phase >= step
            : previousFootstepPhase < step || phase >= step;
          if (crossed(0.15) || crossed(0.65)) emit('footstep', { locomotion: currentIntent });
        }
        previousFootstepPhase = phase;
        previousFootstepIntent = currentIntent;
      } else {
        previousFootstepPhase = null;
        previousFootstepIntent = null;
      }
    }
    if (typeof currentVrm.update === 'function') currentVrm.update(dt);
    applyHeadGaze(dt);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    loadSequence += 1;
    releaseCurrentAvatar();
    vrmaCache.clear();
    object3D.removeFromParent();
  }

  return {
    object3D,
    loadAvatarFromUrl,
    setAvatar,
    setAnimations,
    setMotion,
    setEnableAnimation,
    update,
    dispose,
    get avatar() { return currentVrm; },
    get capabilities() { return { ...capabilities }; },
    get enableAnimation() { return animationEnabled; }
  };
}
