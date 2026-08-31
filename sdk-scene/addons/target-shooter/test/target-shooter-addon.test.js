import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const addonUrl = new URL('../target-shooter-addon.js', import.meta.url);
const worldUrl = new URL('../target-shooter-world.js', import.meta.url);
const catalogUrl = new URL('../../sdk-scene-addons.js', import.meta.url);

test('addon requires pointer input and consumes only target hits', async () => {
  const source = await readFile(addonUrl, 'utf8');
  assert.match(source, /typeof context\.input\?\.onClick !== 'function'/);
  assert.match(source, /const hit = world\.raycastTarget\(event\.ray\);\s*if \(!hit\) return false;/);
  assert.match(source, /void audio\.playShot\(\);\s*return true;/);
});

test('damage happens on projectile arrival and completion waits for death cleanup', async () => {
  const source = await readFile(addonUrl, 'utf8');
  assert.match(source, /if \(!position\.done\) continue;[\s\S]*resolveProjectileHit\(projectile\)/);
  assert.match(source, /world\.setTargetHealth\(state\.hit\.id, state\.hit\.health\);\s*world\.showDamage\(state\.hit\.id, state\.hit\.damage\)/);
  assert.match(source, /updateDeaths\(delta\);\s*world\.updateDamageFeedback\(delta\)/);
  assert.match(source, /if \(!state\.hit\.defeated\) \{[\s\S]*return;\s*\}\s*ui\.render\(state\);\s*ui\.pulseCount\(\)/);
  assert.match(source, /game\.getSnapshot\(\)\.completed && deathMotions\.size === 0/);
  assert.match(source, /api: Object\.freeze\(\{ restart \}\)/);
});

test('new rounds reset the player before spawning targets around world origin', async () => {
  const source = await readFile(addonUrl, 'utf8');
  assert.match(source, /resetPlayerPosition\(\);\s*const center = context\.player\.getPosition\(playerPosition\);\s*const state = game\.restart\(center\);/);
  assert.match(source, /onRestart: handleResultRestart/);
  assert.match(source, /api: Object\.freeze\(\{ restart \}\)/);
});

test('Game Over retry resets only the player and preserves target state', async () => {
  const source = await readFile(addonUrl, 'utf8');
  const uiSource = await readFile(new URL('../target-shooter-ui.js', import.meta.url), 'utf8');
  assert.match(source, /function retryAfterGameOver\(\) \{\s*if \(disposed \|\| !gameOver\) return;\s*resetPlayerPosition\(\);\s*gameOver = false;\s*ui\.setGameOver\(false\);\s*\}/);
  assert.match(source, /if \(result === 'game-over'\) retryAfterGameOver\(\);\s*else restart\(\);/);
  assert.doesNotMatch(source.match(/function retryAfterGameOver[\s\S]*?\n      \}/)?.[0] || '', /game\.restart|world\.setTargets|chaseMotions\.clear/);
  assert.match(uiSource, /onRestart\(activeResult\)/);
});

test('hits and proximity start pursuit while moving contact sends targets home', async () => {
  const source = await readFile(addonUrl, 'utf8');
  const uiSource = await readFile(new URL('../target-shooter-ui.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!state\.hit\.defeated\) \{[\s\S]*chaseMotions\.set\(state\.hit\.id, createTargetChaseMotion\(target\.position\)\)/);
  assert.match(source, /distance > target\.activationDistance[\s\S]*chaseMotions\.set\(target\.id, createTargetChaseMotion\(target\.position\)\)/);
  assert.match(source, /returnMotions\.set\(id, createTargetReturnMotion\(motion\.position, target\.position\)\)/);
  assert.match(source, /updateTargetReturnMotion\(motion, delta, \{\s*speed: options\.targetMoveSpeed,\s*speedMultiplier: 3,/);
  assert.match(source, /activationBlockedUntilExit\.add\(id\);\s*world\.setTargetClickable\(id, false\)/);
  assert.match(source, /if \(distance > target\.activationDistance\) activationBlockedUntilExit\.delete\(target\.id\);\s*else continue;/);
  assert.match(source, /for \(const \[id, motion\] of chaseMotions\)[\s\S]*updateTargetChaseMotion\(motion, player, delta/);
  assert.match(source, /gameOver = true;[\s\S]*startReturningTargets\(\);\s*ui\.setGameOver\(true\)/);
  assert.match(source, /if \(!gameOver\) \{\s*updateProjectiles\(delta\);\s*activateNearbyTargets\(\);\s*collision = updateChases\(delta\);\s*\}\s*if \(!collision\) updateReturns\(delta\);\s*updateDeaths\(delta\)/);
  assert.match(source, /if \(!state\.arrived\) continue;\s*returnMotions\.delete\(id\);\s*world\.setTargetClickable\(id, true\)/);
  assert.match(uiSource, /title: 'Game Over'/);
  assert.match(uiSource, /setResult\(gameOver \? 'game-over' : null\)/);
});

test('mounts progress in the HUD slot with an overlay fallback', async () => {
  const source = await readFile(addonUrl, 'utf8');
  const uiSource = await readFile(new URL('../target-shooter-ui.js', import.meta.url), 'utf8');
  assert.match(source, /hudRoot: context\.hudRoot \|\| context\.uiRoot/);
  assert.match(source, /overlayRoot: context\.uiRoot/);
  assert.match(source, /interaction: context\.interaction/);
  assert.match(uiSource, /counterHost\.dataset\.targetShooterView = 'counter'/);
  assert.match(uiSource, /`\$\{state\.defeatedCount\} \/ \$\{state\.total\}`/);
  assert.match(uiSource, /interaction\.acquireLock\(\)/);
  assert.match(uiSource, /unlockInteraction\(\);\s*onRestart\(activeResult\)/);
  assert.match(uiSource, /unlockInteraction\(\);\s*restartButton\.removeEventListener/);
});

test('world owns health bars, bullets, target input, and resource disposal', async () => {
  const source = await readFile(worldUrl, 'utf8');
  assert.match(source, /new THREE\.CanvasTexture\(canvas\)/);
  assert.match(source, /const label = `-\$\{damage\}`/);
  assert.match(source, /context\.fillStyle = '#ffffff'/);
  assert.doesNotMatch(source, /strokeText\(label/);
  assert.match(source, /damageFeedbackPool\.find\(\(feedback\) => !feedback\.active\)/);
  assert.match(source, /feedback\.sprite\.position\.y = feedback\.startY \+ progress \* 0\.24/);
  assert.match(source, /feedback\.sprite\.material\.opacity = 1 - progress/);
  assert.match(source, /new THREE\.SpriteMaterial\(\{[\s\S]*depthTest: true,[\s\S]*depthWrite: false/);
  assert.match(source, /healthSprite\.scale\.set\(0\.54, 0\.135, 1\)/);
  assert.doesNotMatch(source, /context\.strokeRect/);
  assert.doesNotMatch(source, /rgba\(10, 14, 18, 0\.82\)/);
  assert.match(source, /entry\.group\.position\.set\(state\.position\.x, state\.height, state\.position\.z\)/);
  assert.match(source, /function setTargetClickable\(id, clickable\)[\s\S]*entry\.clickable = Boolean\(clickable\)/);
  assert.match(source, /entry\.meshes\[0\]\.rotation\.z = state\.tilt/);
  assert.match(source, /entry\.meshes\[0\]\.rotation\.z = 0/);
  assert.match(source, /entry\.clickable = false/);
  assert.match(source, /new THREE\.BoxGeometry\(0\.018, 0\.018, 0\.32\)/);
  assert.match(source, /new THREE\.MeshBasicMaterial\(\{ color: 0xffffff \}\)/);
  assert.match(source, /bullet\.lookAt\(position\.x, position\.y, position\.z\)/);
  assert.doesNotMatch(source, /new THREE\.SphereGeometry\(0\.055/);
  assert.match(source, /bulletGeometry\.dispose\(\)/);
  assert.match(source, /entry\.healthTexture\.dispose\(\)/);
  assert.match(source, /feedback\.sprite\.material\.dispose\(\);\s*feedback\.texture\.dispose\(\)/);
});

test('world builds configurable faceted capsules with the Gem Collector finish', async () => {
  const source = await readFile(worldUrl, 'utf8');
  assert.match(source, /const TARGET_HEIGHT = 1;/);
  assert.match(source, /const TARGET_RADIUS = 0\.3;/);
  assert.match(source, /const TARGET_RADIAL_SEGMENTS = 8;/);
  assert.match(source, /TARGET_RADIAL_SEGMENTS \/ 2/);
  assert.match(source, /TARGET_HEIGHT - TARGET_RADIUS \* 2/);
  assert.match(source, /new THREE\.CapsuleGeometry\(\s*TARGET_RADIUS,\s*TARGET_BODY_LENGTH,\s*TARGET_CAP_SEGMENTS,\s*TARGET_RADIAL_SEGMENTS\s*\)/);
  assert.match(source, /applyLogoGradient\(targetGeometry\)/);
  assert.match(source, /geometry\.setAttribute\('color', new THREE\.BufferAttribute\(colors, 3\)\)/);
  assert.match(source, /new THREE\.MeshPhysicalMaterial\(\{[\s\S]*vertexColors: true,[\s\S]*emissive: 0x141c5c,[\s\S]*roughness: 0\.5,[\s\S]*clearcoat: 0\.7,[\s\S]*clearcoatRoughness: 0\.1,[\s\S]*specularIntensity: 0\.5/);
  assert.match(source, /targetMesh\.position\.y = TARGET_CENTER_HEIGHT/);
  assert.match(source, /healthSprite\.position\.set\(0, TARGET_HEIGHT \+ HEALTH_BAR_OFFSET, 0\)/);
  assert.match(source, /point: Object\.freeze\(\{ x: entry\.group\.position\.x, y: TARGET_CENTER_HEIGHT, z: entry\.group\.position\.z \}\)/);
});

test('catalog exposes Target Shooter disabled by default', async () => {
  const source = await readFile(catalogUrl, 'utf8');
  const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /targetShooterAddonDefinition/);
  assert.match(indexSource, /defaultEnabled: false/);
});