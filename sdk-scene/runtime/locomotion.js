export function resolveProgressiveLocomotion({
  elapsed = 0,
  accelerationDuration = 2,
  moveSpeed = 1.6,
  runSpeedMultiplier = 3,
  sprinting = false
} = {}) {
  const duration = Math.max(0.01, Number(accelerationDuration) || 2);
  const naturalProgress = Math.min(Math.max(Number(elapsed) || 0, 0), duration) / duration;
  const progress = sprinting ? 1 : naturalProgress;
  const walkSpeed = Math.max(0, Number(moveSpeed) || 0);
  const runSpeed = walkSpeed * Math.max(0, Number(runSpeedMultiplier) || 0);

  return {
    progress,
    locomotion: progress >= 0.5 ? 'run' : 'walk',
    speed: walkSpeed + (runSpeed - walkSpeed) * progress
  };
}

export function resolveJoystickLocomotionInput({
  horizontal = 0,
  vertical = 0
} = {}) {
  const inputLength = Math.hypot(Number(horizontal) || 0, Number(vertical) || 0);
  if (inputLength === 0) {
    return { horizontal: 0, vertical: 0, accelerating: false };
  }

  return {
    horizontal: horizontal / inputLength,
    vertical: vertical / inputLength,
    accelerating: true
  };
}

export function resolveLocomotionDeceleration({ elapsed = 0, duration = 0.25, initialSpeed = 0 } = {}) {
  const safeDuration = Math.max(0.01, Number(duration) || 0.25);
  const progress = Math.min(Math.max(Number(elapsed) || 0, 0), safeDuration) / safeDuration;
  return {
    complete: progress >= 1,
    speed: Math.max(0, Number(initialSpeed) || 0) * (1 - progress)
  };
}