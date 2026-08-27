export function resolveFollowCameraPosition({ target, yaw = 0, pitch = 0, distance = 0 } = {}) {
  const safeTarget = target || {};
  const safeYaw = Number(yaw) || 0;
  const safePitch = Number(pitch) || 0;
  const safeDistance = Math.max(0, Number(distance) || 0);
  const cosPitch = Math.cos(safePitch);
  return {
    x: (Number(safeTarget.x) || 0) + Math.sin(safeYaw) * cosPitch * safeDistance,
    y: (Number(safeTarget.y) || 0) + Math.sin(safePitch) * safeDistance,
    z: (Number(safeTarget.z) || 0) + Math.cos(safeYaw) * cosPitch * safeDistance
  };
}

export function resolveDestinationStep({ current, destination, maxDistance = 0, stoppingDistance = 0.08 } = {}) {
  const currentX = Number(current?.x) || 0;
  const currentZ = Number(current?.z) || 0;
  const destinationX = Number(destination?.x) || 0;
  const destinationZ = Number(destination?.z) || 0;
  const deltaX = destinationX - currentX;
  const deltaZ = destinationZ - currentZ;
  const distance = Math.hypot(deltaX, deltaZ);
  const stop = Math.max(0, Number(stoppingDistance) || 0);
  if (distance <= stop) {
    return { arrived: true, distance, x: destinationX, z: destinationZ, directionX: 0, directionZ: 0 };
  }
  const step = Math.min(distance, Math.max(0, Number(maxDistance) || 0));
  const directionX = deltaX / distance;
  const directionZ = deltaZ / distance;
  return {
    arrived: false,
    distance,
    x: currentX + directionX * step,
    z: currentZ + directionZ * step,
    directionX,
    directionZ
  };
}