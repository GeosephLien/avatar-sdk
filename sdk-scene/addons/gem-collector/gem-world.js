import * as THREE from 'three';

const GEM_HEIGHT = 0.55;
const GEM_ROTATION_SPEED = 1.6;
const FEEDBACK_DURATION = 0.72;
const FEEDBACK_WIDTH = 0.42;
const FEEDBACK_HEIGHT = 0.21;
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

function createGainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the gem collection feedback canvas.');

  context.font = '700 58px "Roboto", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.fillText('+1', 96, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function createGemWorld(options = {}) {
  const { root } = options;
  if (!root || typeof root.add !== 'function' || typeof root.remove !== 'function') {
    throw new Error('createGemWorld requires a THREE.Object3D root.');
  }

  const diamondGeometry = new THREE.OctahedronGeometry(0.16, 0);
  diamondGeometry.scale(0.85, 1.2, 0.85);
  applyLogoGradient(diamondGeometry);
  const gemMaterial = new THREE.MeshPhysicalMaterial({
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
  const gainTexture = createGainTexture();
  let elapsed = 0;
  let gemObjects = [];
  const feedbackPool = [];
  let disposed = false;

  function resetCollectionFeedback() {
    for (const feedback of feedbackPool) {
      feedback.active = false;
      feedback.sprite.visible = false;
      feedback.sprite.material.opacity = 1;
    }
  }

  function acquireCollectionFeedback() {
    const available = feedbackPool.find((feedback) => !feedback.active);
    if (available) return available;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: gainTexture,
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
    const feedback = { sprite, active: false, age: 0, startY: 0 };
    feedbackPool.push(feedback);
    return feedback;
  }

  function clearGemObjects() {
    for (const gem of gemObjects) root.remove(gem);
    gemObjects = [];
  }

  function setGems(gems) {
    if (disposed) return;
    clearGemObjects();
    resetCollectionFeedback();
    elapsed = 0;
    gemObjects = gems.map((position, index) => {
      const gem = new THREE.Group();
      const diamond = new THREE.Mesh(diamondGeometry, gemMaterial);
      diamond.castShadow = true;
      gem.add(diamond);
      gem.position.set(position.x, GEM_HEIGHT, position.z);
      gem.rotation.y = index * 0.73;
      gem.userData.phase = index * 0.61;
      root.add(gem);
      return gem;
    });
  }

  function collectGems(indices) {
    for (const index of indices) {
      const gem = gemObjects[index];
      if (!gem?.visible) continue;
      const feedback = acquireCollectionFeedback();
      feedback.active = true;
      feedback.age = 0;
      feedback.startY = gem.position.y + 0.32;
      feedback.sprite.visible = true;
      feedback.sprite.material.opacity = 1;
      feedback.sprite.position.set(gem.position.x, feedback.startY, gem.position.z);
      feedback.sprite.scale.set(FEEDBACK_WIDTH, FEEDBACK_HEIGHT, 1);
      gem.visible = false;
    }
  }

  function update(delta) {
    if (disposed) return;
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    elapsed += dt;
    for (const gem of gemObjects) {
      if (!gem.visible) continue;
      gem.rotation.y += dt * GEM_ROTATION_SPEED;
      gem.position.y = GEM_HEIGHT + Math.sin(elapsed * 2.4 + gem.userData.phase) * 0.07;
    }
    for (const feedback of feedbackPool) {
      if (!feedback.active) continue;
      feedback.age += dt;
      const progress = feedback.age / FEEDBACK_DURATION;
      if (progress >= 1) {
        feedback.active = false;
        feedback.sprite.visible = false;
        continue;
      }
      feedback.sprite.position.y = feedback.startY + progress * 0.24;
      feedback.sprite.material.opacity = 1 - progress;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearGemObjects();
    for (const feedback of feedbackPool) {
      root.remove(feedback.sprite);
      feedback.sprite.material.dispose();
    }
    resetCollectionFeedback();
    diamondGeometry.dispose();
    gemMaterial.dispose();
    gainTexture.dispose();
  }

  return { setGems, collectGems, update, dispose };
}
