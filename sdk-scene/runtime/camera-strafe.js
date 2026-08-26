export function normalizeYaw(value) {
  const yaw = Number(value);
  if (!Number.isFinite(yaw)) return 0;
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

export function resolveCameraStrafeInput({
  forward = false,
  backward = false,
  left = false,
  right = false,
  strafeLeft = false,
  strafeRight = false
} = {}) {
  const strafe = (strafeRight ? 1 : 0) - (strafeLeft ? 1 : 0);
  if (strafe) {
    return {
      horizontal: strafe,
      vertical: forward ? 1 : 0,
      gazeLocked: true
    };
  }

  return {
    horizontal: (right ? 1 : 0) - (left ? 1 : 0),
    vertical: (forward ? 1 : 0) - (backward ? 1 : 0),
    gazeLocked: false
  };
}

export function resolveCameraStrafeGazeYaw({ cameraYaw = 0, horizontal = 0, vertical = 0, gazeLocked = false } = {}) {
  if (!gazeLocked || (!horizontal && !vertical)) return 0;
  const bodyYaw = normalizeYaw(Number(cameraYaw) + Math.atan2(horizontal, -vertical));
  const cameraForwardYaw = normalizeYaw(Number(cameraYaw) + Math.PI);
  const rawGazeYaw = normalizeYaw(cameraForwardYaw - bodyYaw);
  const totalYaw = Math.abs(rawGazeYaw) > Math.PI * 0.375 ? Math.PI / 3 : Math.PI * 2 / 9;
  return Math.sign(rawGazeYaw) * totalYaw;
}