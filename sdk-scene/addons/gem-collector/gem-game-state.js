const DEFAULTS = Object.freeze({
  minGemCount: 5,
  maxGemCount: 10,
  areaSize: 15,
  edgePadding: 0.4,
  minSpacing: 1,
  spawnClearRadius: 1.5,
  collectRadius: 0.65
});

function requireFiniteNumber(value, name, minimum, fallback) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || resolved < minimum) {
    throw new Error(`${name} must be a finite number greater than or equal to ${minimum}.`);
  }
  return resolved;
}

function normalizeOptions(options = {}) {
  const fixedGemCount = options.gemCount === undefined ? null : Number(options.gemCount);
  if (fixedGemCount !== null && (!Number.isInteger(fixedGemCount) || fixedGemCount < 1)) {
    throw new Error('gemCount must be a positive integer.');
  }
  const minGemCount = options.minGemCount === undefined ? DEFAULTS.minGemCount : Number(options.minGemCount);
  const maxGemCount = options.maxGemCount === undefined ? DEFAULTS.maxGemCount : Number(options.maxGemCount);
  if (!Number.isInteger(minGemCount) || minGemCount < 1) {
    throw new Error('minGemCount must be a positive integer.');
  }
  if (!Number.isInteger(maxGemCount) || maxGemCount < minGemCount) {
    throw new Error('maxGemCount must be an integer greater than or equal to minGemCount.');
  }

  const areaSize = requireFiniteNumber(options.areaSize, 'areaSize', 0.1, DEFAULTS.areaSize);
  const edgePadding = requireFiniteNumber(options.edgePadding, 'edgePadding', 0, DEFAULTS.edgePadding);
  const minSpacing = requireFiniteNumber(options.minSpacing, 'minSpacing', 0, DEFAULTS.minSpacing);
  const spawnClearRadius = requireFiniteNumber(
    options.spawnClearRadius,
    'spawnClearRadius',
    0,
    DEFAULTS.spawnClearRadius
  );
  const collectRadius = requireFiniteNumber(options.collectRadius, 'collectRadius', 0.01, DEFAULTS.collectRadius);
  const random = options.random || Math.random;

  if (typeof random !== 'function') throw new Error('random must be a function.');
  if (edgePadding * 2 >= areaSize) throw new Error('edgePadding must leave usable space inside areaSize.');

  return {
    fixedGemCount,
    minGemCount,
    maxGemCount,
    areaSize,
    edgePadding,
    minSpacing,
    spawnClearRadius,
    collectRadius,
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

function createGemPositionsFromConfig(config) {
  const gemCount = config.fixedGemCount ?? (
    config.minGemCount + Math.floor(randomUnit(config.random) * (config.maxGemCount - config.minGemCount + 1))
  );
  const halfExtent = config.areaSize / 2 - config.edgePadding;
  const minSpacingSquared = config.minSpacing * config.minSpacing;
  const spawnClearSquared = config.spawnClearRadius * config.spawnClearRadius;
  const maxAttempts = Math.max(1000, gemCount * 500);
  const positions = [];

  for (let attempt = 0; positions.length < gemCount && attempt < maxAttempts; attempt += 1) {
    const position = {
      x: (randomUnit(config.random) * 2 - 1) * halfExtent,
      z: (randomUnit(config.random) * 2 - 1) * halfExtent
    };
    if (position.x * position.x + position.z * position.z < spawnClearSquared) continue;
    if (positions.some((other) => {
      const dx = other.x - position.x;
      const dz = other.z - position.z;
      return dx * dx + dz * dz < minSpacingSquared;
    })) continue;
    positions.push(Object.freeze(position));
  }

  if (positions.length !== gemCount) {
    throw new Error('Unable to place all gems. Increase areaSize or reduce spacing constraints.');
  }
  return Object.freeze(positions);
}

export function createGemPositions(options = {}) {
  return createGemPositionsFromConfig(normalizeOptions(options));
}

export function createGemGame(options = {}) {
  const config = normalizeOptions(options);
  let gems = Object.freeze([]);
  let collected = new Set();
  let completed = false;

  function getSnapshot(extra = {}) {
    return Object.freeze({
      gems,
      collectedCount: collected.size,
      total: gems.length,
      completed,
      ...extra
    });
  }

  function restart() {
    gems = createGemPositionsFromConfig(config);
    collected = new Set();
    completed = false;
    return getSnapshot({ collectedIndices: Object.freeze([]), justCompleted: false });
  }

  function collectNearby(position) {
    if (completed || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
      return getSnapshot({ collectedIndices: Object.freeze([]), justCompleted: false });
    }

    const collectedIndices = [];
    const collectRadiusSquared = config.collectRadius * config.collectRadius;
    for (let index = 0; index < gems.length; index += 1) {
      if (collected.has(index)) continue;
      const dx = gems[index].x - position.x;
      const dz = gems[index].z - position.z;
      if (dx * dx + dz * dz > collectRadiusSquared) continue;
      collected.add(index);
      collectedIndices.push(index);
    }

    const justCompleted = collected.size === gems.length && !completed;
    if (justCompleted) completed = true;
    return getSnapshot({
      collectedIndices: Object.freeze(collectedIndices),
      justCompleted
    });
  }

  restart();

  return {
    collectNearby,
    restart,
    getSnapshot
  };
}
