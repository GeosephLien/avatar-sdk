function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeHorizontal(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

export function resolveProjectileOrigin(player, target, offset = {}) {
  const forward = normalizeHorizontal(player, target);
  const right = { x: -forward.z, z: forward.x };
  const forwardOffset = Number.isFinite(offset.forward) ? offset.forward : 0.32;
  const rightOffset = Number.isFinite(offset.right) ? offset.right : 0;
  const height = Number.isFinite(offset.height) ? offset.height : 1.15;
  return Object.freeze({
    x: player.x + forward.x * forwardOffset + right.x * rightOffset,
    y: player.y + height,
    z: player.z + forward.z * forwardOffset + right.z * rightOffset
  });
}

export function createProjectileTrajectory(options) {
  const origin = { ...options.origin };
  const target = { ...options.target };
  const speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : 24;
  const arcHeight = Number.isFinite(options.arcHeight) && options.arcHeight >= 0 ? options.arcHeight : 0.18;
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z);
  return { origin, target, arcHeight, duration: Math.max(0.05, distance / speed), elapsed: 0, done: false };
}

export function updateProjectileTrajectory(trajectory, delta) {
  trajectory.elapsed += Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const progress = clamp01(trajectory.elapsed / trajectory.duration);
  trajectory.done = progress >= 1;
  return Object.freeze({
    x: trajectory.origin.x + (trajectory.target.x - trajectory.origin.x) * progress,
    y: trajectory.origin.y + (trajectory.target.y - trajectory.origin.y) * progress
      + Math.sin(Math.PI * progress) * trajectory.arcHeight,
    z: trajectory.origin.z + (trajectory.target.z - trajectory.origin.z) * progress,
    progress,
    done: trajectory.done
  });
}

export function createTargetChaseMotion(position) {
  return {
    position: { x: position.x, z: position.z },
    elapsed: 0
  };
}

export function updateTargetChaseMotion(motion, player, delta, options = {}) {
  const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const speed = Number.isFinite(options.speed) && options.speed >= 0 ? options.speed : 1.8;
  const collisionRadius = Number.isFinite(options.collisionRadius) && options.collisionRadius >= 0
    ? options.collisionRadius
    : 0.65;
  const wobbleHeight = Number.isFinite(options.wobbleHeight) && options.wobbleHeight >= 0
    ? options.wobbleHeight
    : 0.045;
  const wobbleAngle = Number.isFinite(options.wobbleAngle) && options.wobbleAngle >= 0
    ? options.wobbleAngle
    : 0.08;
  const wobbleFrequency = Number.isFinite(options.wobbleFrequency) && options.wobbleFrequency >= 0
    ? options.wobbleFrequency
    : 10;
  const dx = player.x - motion.position.x;
  const dz = player.z - motion.position.z;
  const distance = Math.hypot(dx, dz);
  const travel = Math.min(speed * dt, Math.max(0, distance - collisionRadius));
  if (distance > 0 && travel > 0) {
    motion.position.x += dx / distance * travel;
    motion.position.z += dz / distance * travel;
  }
  motion.elapsed += dt;
  const phase = motion.elapsed * wobbleFrequency;
  return Object.freeze({
    position: Object.freeze({ ...motion.position }),
    height: Math.abs(Math.sin(phase)) * wobbleHeight,
    tilt: Math.sin(phase) * wobbleAngle,
    collided: distance - travel <= collisionRadius
  });
}

export function createTargetReturnMotion(position, destination) {
  return {
    position: { x: position.x, z: position.z },
    destination: { x: destination.x, z: destination.z },
    elapsed: 0
  };
}

export function updateTargetReturnMotion(motion, delta, options = {}) {
  const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const baseSpeed = Number.isFinite(options.speed) && options.speed >= 0 ? options.speed : 1.8;
  const speedMultiplier = Number.isFinite(options.speedMultiplier) && options.speedMultiplier >= 0
    ? options.speedMultiplier
    : 1;
  const speed = baseSpeed * speedMultiplier;
  const wobbleHeight = Number.isFinite(options.wobbleHeight) && options.wobbleHeight >= 0
    ? options.wobbleHeight
    : 0.045;
  const wobbleAngle = Number.isFinite(options.wobbleAngle) && options.wobbleAngle >= 0
    ? options.wobbleAngle
    : 0.08;
  const wobbleFrequency = Number.isFinite(options.wobbleFrequency) && options.wobbleFrequency >= 0
    ? options.wobbleFrequency
    : 10;
  const dx = motion.destination.x - motion.position.x;
  const dz = motion.destination.z - motion.position.z;
  const distance = Math.hypot(dx, dz);
  const travel = Math.min(speed * dt, distance);
  if (distance > 0 && travel > 0) {
    motion.position.x += dx / distance * travel;
    motion.position.z += dz / distance * travel;
  }
  const arrived = distance - travel <= Number.EPSILON;
  if (arrived) {
    motion.position.x = motion.destination.x;
    motion.position.z = motion.destination.z;
  }
  motion.elapsed += dt;
  const phase = motion.elapsed * wobbleFrequency;
  return Object.freeze({
    position: Object.freeze({ ...motion.position }),
    height: arrived ? 0 : Math.abs(Math.sin(phase)) * wobbleHeight,
    tilt: arrived ? 0 : Math.sin(phase) * wobbleAngle,
    arrived
  });
}

export function createTargetDeathMotion(options) {
  const direction = normalizeHorizontal(options.impactOrigin, options.position);
  const impulse = Number.isFinite(options.impulse) ? options.impulse : 3.8;
  const lift = Number.isFinite(options.lift) ? options.lift : 4.5;
  return {
    position: { ...options.position },
    rotation: { x: 0, z: 0 },
    velocity: { x: direction.x * impulse, y: lift, z: direction.z * impulse },
    angularVelocity: { x: direction.z * 2.8, z: -direction.x * 2.8 },
    settled: false,
    fade: 0,
    remove: false
  };
}

export function updateTargetDeathMotion(motion, delta, options = {}) {
  if (motion.remove) return motion;
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
  const gravity = Number.isFinite(options.gravity) ? options.gravity : 12;
  const groundY = Number.isFinite(options.groundY) ? options.groundY : 0;
  const fadeDuration = Number.isFinite(options.fadeDuration) && options.fadeDuration > 0 ? options.fadeDuration : 0.45;
  if (!motion.settled) {
    motion.velocity.y -= gravity * dt;
    motion.position.x += motion.velocity.x * dt;
    motion.position.y += motion.velocity.y * dt;
    motion.position.z += motion.velocity.z * dt;
    motion.rotation.x += motion.angularVelocity.x * dt;
    motion.rotation.z += motion.angularVelocity.z * dt;
    if (motion.position.y <= groundY && motion.velocity.y <= 0) {
      motion.position.y = groundY;
      motion.velocity.y = 0;
      motion.velocity.x *= Math.pow(0.02, dt);
      motion.velocity.z *= Math.pow(0.02, dt);
      motion.angularVelocity.x *= Math.pow(0.01, dt);
      motion.angularVelocity.z *= Math.pow(0.01, dt);
      if (Math.hypot(motion.velocity.x, motion.velocity.z, motion.angularVelocity.x, motion.angularVelocity.z) < 0.12) {
        motion.settled = true;
      }
    }
  } else {
    motion.fade = clamp01(motion.fade + dt / fadeDuration);
    motion.remove = motion.fade >= 1;
  }
  return motion;
}