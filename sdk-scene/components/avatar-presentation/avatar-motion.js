const LOCOMOTION_STATES = new Set(['idle', 'walk', 'run']);
const AIRBORNE_PHASES = new Set(['grounded', 'rising', 'falling']);

export function normalizeMotionState(value = {}) {
  const motion = value && typeof value === 'object' ? value : {};
  const locomotion = LOCOMOTION_STATES.has(motion.locomotion) ? motion.locomotion : 'idle';
  const airbornePhase = AIRBORNE_PHASES.has(motion.airbornePhase) ? motion.airbornePhase : 'grounded';
  const speed = Number(motion.speed);
  const locomotionProgress = Number(motion.locomotionProgress);
  const gazeLockYaw = Number(motion.gazeLockYaw);

  return {
    locomotion,
    airbornePhase,
    justJumped: motion.justJumped === true,
    justLanded: motion.justLanded === true,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 0,
    locomotionProgress: Number.isFinite(locomotionProgress)
      ? Math.min(Math.max(locomotionProgress, 0), 1)
      : 0,
    gazeLockYaw: Number.isFinite(gazeLockYaw)
      ? Math.min(Math.max(gazeLockYaw, -Math.PI), Math.PI)
      : 0
  };
}

export function resolveLocomotionBlend(value, capabilities = {}) {
  const motion = normalizeMotionState(value);
  const available = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const moving = motion.locomotion !== 'idle' && motion.speed > 0;
  if (!moving || !available.walk) return { walk: 0, run: 0 };
  if (!available.run || motion.locomotionProgress <= 0.5) return { walk: 1, run: 0 };
  if (motion.locomotionProgress >= 1) return { walk: 0, run: 1 };

  const blendProgress = (motion.locomotionProgress - 0.5) / 0.5;
  const run = blendProgress * blendProgress;
  return { walk: 1 - run, run };
}

export function resolveWalkAnimationTimeScale(value, maximum = 1.15) {
  const motion = normalizeMotionState(value);
  const maximumScale = Math.max(1, Number(maximum) || 1);
  return 1 + (maximumScale - 1) * motion.locomotionProgress;
}

export function resolveGazeBoneYaws(value) {
  const totalYaw = normalizeMotionState(value).gazeLockYaw;
  return {
    head: totalYaw * 0.5,
    neck: totalYaw * 0.3,
    chest: totalYaw * 0.2
  };
}

export function resolveAnimationIntent(value, capabilities = {}) {
  const motion = normalizeMotionState(value);
  const available = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const locomotion = resolveLocomotion(motion.locomotion, available);
  const moving = motion.locomotion !== 'idle' && motion.speed > 0;

  if (motion.airbornePhase === 'rising') {
    if (available.jump_up) return 'jump_up';
    if (available.jump_loop) return 'jump_loop';
  }
  if (motion.airbornePhase === 'falling') {
    if (available.jump_loop) return 'jump_loop';
    if (!moving && available.jump_down) return 'jump_down';
  }
  if (motion.justLanded && !moving && available.jump_down) return 'jump_down';
  return locomotion;
}

export function resolveTransientIntent(previousIntent, value, capabilities = {}) {
  const motion = normalizeMotionState(value);
  const available = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const moving = motion.locomotion !== 'idle' && motion.speed > 0;
  let nextIntent = previousIntent;

  if (nextIntent === 'jump_down' && (moving || motion.airbornePhase !== 'grounded')) nextIntent = null;
  if (motion.justLanded && !moving && available.jump_down) nextIntent = 'jump_down';
  return nextIntent;
}

function resolveLocomotion(locomotion, capabilities) {
  if (locomotion === 'run' && capabilities.run) return 'run';
  if ((locomotion === 'run' || locomotion === 'walk') && capabilities.walk) return 'walk';
  return capabilities.idle ? 'idle' : null;
}
