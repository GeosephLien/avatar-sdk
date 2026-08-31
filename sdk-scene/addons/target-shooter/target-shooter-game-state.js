const DEFAULTS = Object.freeze({
  minTargetCount: 5,
  maxTargetCount: 10,
  minSpawnRadius: 10,
  maxSpawnRadius: 15,
  minSpacing: 2.2,
  minTargetHealth: 3,
  maxTargetHealth: 5,
  minActivationDistance: 3,
  maxActivationDistance: 5
});

function requireFinite(value, name, minimum, fallback) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || resolved < minimum) {
    throw new Error(`${name} must be a finite number greater than or equal to ${minimum}.`);
  }
  return resolved;
}

function requirePositiveInteger(value, name, fallback) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < 1) throw new Error(`${name} must be a positive integer.`);
  return resolved;
}

function normalizeOptions(options = {}) {
  const targetCount = options.targetCount === undefined
    ? null
    : requirePositiveInteger(options.targetCount, 'targetCount');
  const minTargetCount = requirePositiveInteger(options.minTargetCount, 'minTargetCount', DEFAULTS.minTargetCount);
  const maxTargetCount = requirePositiveInteger(options.maxTargetCount, 'maxTargetCount', DEFAULTS.maxTargetCount);
  const minSpawnRadius = requireFinite(options.minSpawnRadius, 'minSpawnRadius', 0, DEFAULTS.minSpawnRadius);
  const maxSpawnRadius = requireFinite(options.maxSpawnRadius, 'maxSpawnRadius', 0.1, DEFAULTS.maxSpawnRadius);
  const minSpacing = requireFinite(options.minSpacing, 'minSpacing', 0, DEFAULTS.minSpacing);
  const targetHealth = options.targetHealth === undefined
    ? null
    : requirePositiveInteger(options.targetHealth, 'targetHealth');
  const minTargetHealth = requirePositiveInteger(options.minTargetHealth, 'minTargetHealth', DEFAULTS.minTargetHealth);
  const maxTargetHealth = requirePositiveInteger(options.maxTargetHealth, 'maxTargetHealth', DEFAULTS.maxTargetHealth);
  const minActivationDistance = requireFinite(
    options.minActivationDistance,
    'minActivationDistance',
    0,
    DEFAULTS.minActivationDistance
  );
  const maxActivationDistance = requireFinite(
    options.maxActivationDistance,
    'maxActivationDistance',
    0,
    DEFAULTS.maxActivationDistance
  );
  const random = options.random || Math.random;
  if (maxTargetCount < minTargetCount) throw new Error('maxTargetCount must be greater than or equal to minTargetCount.');
  if (maxSpawnRadius <= minSpawnRadius) throw new Error('maxSpawnRadius must be greater than minSpawnRadius.');
  if (maxTargetHealth < minTargetHealth) throw new Error('maxTargetHealth must be greater than or equal to minTargetHealth.');
  if (maxActivationDistance < minActivationDistance) {
    throw new Error('maxActivationDistance must be greater than or equal to minActivationDistance.');
  }
  if (typeof random !== 'function') throw new Error('random must be a function.');
  return {
    targetCount,
    minTargetCount,
    maxTargetCount,
    minSpawnRadius,
    maxSpawnRadius,
    minSpacing,
    targetHealth,
    minTargetHealth,
    maxTargetHealth,
    minActivationDistance,
    maxActivationDistance,
    random
  };
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('random() must return a finite value from 0 (inclusive) to 1 (exclusive).');
  }
  return value;
}

function createTargets(config, center) {
  const count = config.targetCount ?? (
    config.minTargetCount + Math.floor(randomUnit(config.random) * (config.maxTargetCount - config.minTargetCount + 1))
  );
  const targets = [];
  const minSpacingSquared = config.minSpacing * config.minSpacing;
  const maxAttempts = Math.max(1000, count * 500);
  for (let attempt = 0; targets.length < count && attempt < maxAttempts; attempt += 1) {
    const angle = randomUnit(config.random) * Math.PI * 2;
    const radiusSquared = config.minSpawnRadius ** 2
      + randomUnit(config.random) * (config.maxSpawnRadius ** 2 - config.minSpawnRadius ** 2);
    const radius = Math.sqrt(radiusSquared);
    const position = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
    if (targets.some((target) => {
      const dx = target.position.x - position.x;
      const dz = target.position.z - position.z;
      return dx * dx + dz * dz < minSpacingSquared;
    })) continue;
    const maxHealth = config.targetHealth ?? (
      config.minTargetHealth
      + Math.floor(randomUnit(config.random) * (config.maxTargetHealth - config.minTargetHealth + 1))
    );
    targets.push({
      id: `target-${targets.length + 1}`,
      position: Object.freeze(position),
      health: maxHealth,
      maxHealth,
      activationDistance: config.minActivationDistance
        + randomUnit(config.random) * (config.maxActivationDistance - config.minActivationDistance),
      defeated: false
    });
  }
  if (targets.length !== count) throw new Error('Unable to place all targets. Increase the spawn area or reduce minSpacing.');
  return targets;
}

function snapshotTargets(targets) {
  return Object.freeze(targets.map((target) => Object.freeze({ ...target })));
}

export function createTargetShooterGame(options = {}) {
  const config = normalizeOptions(options);
  let targets = [];
  let completed = false;

  function getSnapshot(extra = {}) {
    const defeatedCount = targets.filter((target) => target.defeated).length;
    return Object.freeze({
      targets: snapshotTargets(targets),
      defeatedCount,
      total: targets.length,
      completed,
      ...extra
    });
  }

  function restart(center = {}) {
    const resolvedCenter = {
      x: Number.isFinite(center.x) ? center.x : 0,
      z: Number.isFinite(center.z) ? center.z : 0
    };
    targets = createTargets(config, resolvedCenter);
    completed = false;
    return getSnapshot({ hit: null, justCompleted: false });
  }

  function hitTarget(id) {
    const target = targets.find((candidate) => candidate.id === id);
    if (!target || target.defeated || completed) return getSnapshot({ hit: null, justCompleted: false });
    const damage = Math.min(1, target.health);
    target.health -= damage;
    if (target.health === 0) target.defeated = true;
    const justCompleted = target.defeated && targets.every((candidate) => candidate.defeated);
    if (justCompleted) completed = true;
    return getSnapshot({
      hit: Object.freeze({ id: target.id, damage, health: target.health, defeated: target.defeated }),
      justCompleted
    });
  }

  restart(options.center);
  return { restart, hitTarget, getSnapshot };
}