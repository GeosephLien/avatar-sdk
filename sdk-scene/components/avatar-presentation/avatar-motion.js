const LOCOMOTION_STATES = new Set(['idle', 'walk', 'run']);
const AIRBORNE_PHASES = new Set(['grounded', 'rising', 'falling']);

export function normalizeMotionState(value = {}) {
  const motion = value && typeof value === 'object' ? value : {};
  const locomotion = LOCOMOTION_STATES.has(motion.locomotion) ? motion.locomotion : 'idle';
  const airbornePhase = AIRBORNE_PHASES.has(motion.airbornePhase) ? motion.airbornePhase : 'grounded';
  const speed = Number(motion.speed);

  return {
    locomotion,
    airbornePhase,
    justJumped: motion.justJumped === true,
    justLanded: motion.justLanded === true,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 0
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
