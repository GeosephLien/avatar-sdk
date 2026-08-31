import * as THREE from 'three';

const TARGET_HEIGHT = 1;
const TARGET_RADIUS = 0.3;
const TARGET_RADIAL_SEGMENTS = 8;
const TARGET_CAP_SEGMENTS = Math.max(2, Math.round(TARGET_RADIAL_SEGMENTS / 2));
const TARGET_BODY_LENGTH = Math.max(0, TARGET_HEIGHT - TARGET_RADIUS * 2);
const TARGET_CENTER_HEIGHT = TARGET_HEIGHT / 2;
const HEALTH_BAR_OFFSET = 0.3;
const DAMAGE_FEEDBACK_DURATION = 0.72;
const DAMAGE_FEEDBACK_WIDTH = 0.48;
const DAMAGE_FEEDBACK_HEIGHT = 0.24;
const VIVERSE_PURPLE = 0xc761d6;
const LOGO_GRADIENT_STOPS = Object.freeze([
  Object.freeze({ offset: 0.05, color: new THREE.Color(0x73eaff) }),
  Object.freeze({ offset: 0.25, color: new THREE.Color(0x01b0e0) }),
  Object.freeze({ offset: 0.6, color: new THREE.Color(0x415ff8) }),
  Object.freeze({ offset: 1, color: new THREE.Color(VIVERSE_PURPLE) })
]);

function sampleLogoGradient(position, target) {
  const first = LOGO_GRADIENT_STOPS[0];
  if (position <= first.offset) return target.copy(first.color);

  for (let index = 1; index < LOGO_GRADIENT_STOPS.length; index += 1) {
    const right = LOGO_GRADIENT_STOPS[index];
    if (position > right.offset) continue;
    const left = LOGO_GRADIENT_STOPS[index - 1];
    const mix = (position - left.offset) / (right.offset - left.offset);
    return target.lerpColors(left.color, right.color, mix);
  }

  return target.copy(LOGO_GRADIENT_STOPS.at(-1).color);
}

function applyLogoGradient(geometry) {
  const positions = geometry.getAttribute('position');
  let minX = Infinity;
  let maxX = -Infinity;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const span = maxX - minX || 1;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const mix = THREE.MathUtils.clamp((positions.getX(index) - minX) / span, 0, 1);
    sampleLogoGradient(mix, color).toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function createHealthTexture(health, maxHealth) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  drawHealthTexture(canvas, health, maxHealth);
  texture.needsUpdate = true;
  return { canvas, texture };
}

function drawHealthTexture(canvas, health, maxHealth) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create target health canvas.');
  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = ratio > 0.34 ? '#73eaff' : '#ff5d5d';
  context.fillRect(14, 18, 228 * ratio, 28);
}

function createDamageFeedbackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create target damage feedback canvas.');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { canvas, context, texture };
}

function drawDamageFeedback(feedback, damage) {
  const { canvas, context, texture } = feedback;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 58px "Roboto", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  const label = `-${damage}`;
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

function createTargetObject(target, center) {
  const group = new THREE.Group();
  group.position.set(target.position.x, 0, target.position.z);
  group.lookAt(center.x, 0, center.z);

  const targetGeometry = new THREE.CapsuleGeometry(
    TARGET_RADIUS,
    TARGET_BODY_LENGTH,
    TARGET_CAP_SEGMENTS,
    TARGET_RADIAL_SEGMENTS
  );
  applyLogoGradient(targetGeometry);
  const targetMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x141c5c,
    emissiveIntensity: 0.14,
    metalness: 0,
    roughness: 0.5,
    clearcoat: 0.7,
    clearcoatRoughness: 0.1,
    specularIntensity: 0.5
  });
  const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
  targetMesh.position.y = TARGET_CENTER_HEIGHT;
  targetMesh.castShadow = true;
  targetMesh.receiveShadow = true;
  targetMesh.userData.targetShooterTargetId = target.id;
  group.add(targetMesh);

  const health = createHealthTexture(target.health, target.maxHealth);
  const healthMaterial = new THREE.SpriteMaterial({
    map: health.texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const healthSprite = new THREE.Sprite(healthMaterial);
  healthSprite.position.set(0, TARGET_HEIGHT + HEALTH_BAR_OFFSET, 0);
  healthSprite.scale.set(0.54, 0.135, 1);
  healthSprite.renderOrder = 900;
  group.add(healthSprite);

  return {
    id: target.id,
    group,
    meshes: [targetMesh],
    materials: [targetMaterial, healthMaterial],
    geometries: [targetGeometry],
    healthCanvas: health.canvas,
    healthTexture: health.texture,
    healthSprite,
    maxHealth: target.maxHealth,
    clickable: true
  };
}

export function createTargetShooterWorld(options = {}) {
  const { root } = options;
  if (!root || typeof root.add !== 'function' || typeof root.remove !== 'function') {
    throw new Error('createTargetShooterWorld requires a THREE.Object3D root.');
  }

  const raycaster = new THREE.Raycaster();
  const targets = new Map();
  const bullets = new Map();
  const damageFeedbackPool = [];
  const bulletGeometry = new THREE.BoxGeometry(0.018, 0.018, 0.32);
  const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let disposed = false;

  function resetDamageFeedback() {
    for (const feedback of damageFeedbackPool) {
      feedback.active = false;
      feedback.sprite.visible = false;
      feedback.sprite.material.opacity = 1;
    }
  }

  function acquireDamageFeedback() {
    const available = damageFeedbackPool.find((feedback) => !feedback.active);
    if (available) return available;
    const surface = createDamageFeedbackTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: surface.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false
    }));
    sprite.visible = false;
    sprite.renderOrder = 1000;
    sprite.frustumCulled = false;
    root.add(sprite);
    const feedback = { ...surface, sprite, active: false, age: 0, startY: 0 };
    damageFeedbackPool.push(feedback);
    return feedback;
  }

  function disposeTarget(entry) {
    root.remove(entry.group);
    for (const geometry of entry.geometries) geometry.dispose();
    for (const material of entry.materials) material.dispose();
    entry.healthTexture.dispose();
  }

  function clear() {
    for (const entry of targets.values()) disposeTarget(entry);
    targets.clear();
    for (const bullet of bullets.values()) root.remove(bullet);
    bullets.clear();
    resetDamageFeedback();
  }

  function setTargets(nextTargets, center) {
    if (disposed) return;
    clear();
    for (const target of nextTargets) {
      const entry = createTargetObject(target, center);
      targets.set(target.id, entry);
      root.add(entry.group);
    }
  }

  function raycastTarget(ray) {
    if (disposed) return null;
    raycaster.ray.origin.set(ray.origin.x, ray.origin.y, ray.origin.z);
    raycaster.ray.direction.set(ray.direction.x, ray.direction.y, ray.direction.z).normalize();
    const meshes = [...targets.values()].filter((entry) => entry.clickable).flatMap((entry) => entry.meshes);
    const intersection = raycaster.intersectObjects(meshes, false)[0];
    if (!intersection) return null;
    const id = intersection.object.userData.targetShooterTargetId;
    const entry = targets.get(id);
    if (!entry?.clickable) return null;
    return Object.freeze({
      id,
      point: Object.freeze({ x: entry.group.position.x, y: TARGET_CENTER_HEIGHT, z: entry.group.position.z })
    });
  }

  function addBullet(id, position) {
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.set(position.x, position.y, position.z);
    bullet.renderOrder = 20;
    bullets.set(id, bullet);
    root.add(bullet);
  }

  function updateBullet(id, position) {
    const bullet = bullets.get(id);
    if (!bullet) return;
    if (bullet.position.distanceToSquared(position) > Number.EPSILON) {
      bullet.lookAt(position.x, position.y, position.z);
    }
    bullet.position.set(position.x, position.y, position.z);
  }

  function removeBullet(id) {
    const bullet = bullets.get(id);
    if (!bullet) return;
    root.remove(bullet);
    bullets.delete(id);
  }

  function setTargetHealth(id, health) {
    const entry = targets.get(id);
    if (!entry) return;
    drawHealthTexture(entry.healthCanvas, health, entry.maxHealth);
    entry.healthTexture.needsUpdate = true;
  }

  function showDamage(id, damage) {
    const entry = targets.get(id);
    if (!entry || !Number.isFinite(damage) || damage <= 0) return;
    const feedback = acquireDamageFeedback();
    drawDamageFeedback(feedback, damage);
    feedback.active = true;
    feedback.age = 0;
    feedback.startY = entry.group.position.y + TARGET_HEIGHT + HEALTH_BAR_OFFSET + 0.22;
    feedback.sprite.visible = true;
    feedback.sprite.material.opacity = 1;
    feedback.sprite.position.set(entry.group.position.x, feedback.startY, entry.group.position.z);
    feedback.sprite.scale.set(DAMAGE_FEEDBACK_WIDTH, DAMAGE_FEEDBACK_HEIGHT, 1);
  }

  function updateDamageFeedback(delta) {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    for (const feedback of damageFeedbackPool) {
      if (!feedback.active) continue;
      feedback.age += dt;
      const progress = feedback.age / DAMAGE_FEEDBACK_DURATION;
      if (progress >= 1) {
        feedback.active = false;
        feedback.sprite.visible = false;
        continue;
      }
      feedback.sprite.position.y = feedback.startY + progress * 0.24;
      feedback.sprite.material.opacity = 1 - progress;
    }
  }

  function setTargetClickable(id, clickable) {
    const entry = targets.get(id);
    if (!entry) return;
    entry.clickable = Boolean(clickable);
  }

  function startTargetDeath(id) {
    const entry = targets.get(id);
    if (!entry) return;
    entry.clickable = false;
    entry.healthSprite.visible = false;
    entry.meshes[0].rotation.z = 0;
  }

  function updateTargetChase(id, state) {
    const entry = targets.get(id);
    if (!entry) return;
    entry.group.position.set(state.position.x, state.height, state.position.z);
    entry.meshes[0].rotation.z = state.tilt;
  }

  function updateTargetDeath(id, motion) {
    const entry = targets.get(id);
    if (!entry) return;
    entry.group.position.set(motion.position.x, motion.position.y, motion.position.z);
    entry.group.rotation.x = motion.rotation.x;
    entry.group.rotation.z = motion.rotation.z;
    const opacity = 1 - motion.fade;
    for (const material of entry.materials) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
    }
  }

  function removeTarget(id) {
    const entry = targets.get(id);
    if (!entry) return;
    disposeTarget(entry);
    targets.delete(id);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    for (const feedback of damageFeedbackPool) {
      root.remove(feedback.sprite);
      feedback.sprite.material.dispose();
      feedback.texture.dispose();
    }
    damageFeedbackPool.length = 0;
    bulletGeometry.dispose();
    bulletMaterial.dispose();
  }

  return {
    setTargets,
    raycastTarget,
    addBullet,
    updateBullet,
    removeBullet,
    setTargetHealth,
    showDamage,
    updateDamageFeedback,
    setTargetClickable,
    startTargetDeath,
    updateTargetChase,
    updateTargetDeath,
    removeTarget,
    dispose
  };
}