import { createTargetShooterAudio } from './target-shooter-audio.js?v=20260831-target-shooter';
import { createTargetShooterGame } from './target-shooter-game-state.js?v=20260831-damage-feedback';
import {
  createProjectileTrajectory,
  createTargetChaseMotion,
  createTargetDeathMotion,
  createTargetReturnMotion,
  resolveProjectileOrigin,
  updateProjectileTrajectory,
  updateTargetChaseMotion,
  updateTargetDeathMotion,
  updateTargetReturnMotion
} from './target-shooter-motion.js?v=20260831-target-return-3x';
import { createTargetShooterUi } from './target-shooter-ui.js?v=20260831-result-lock';
import { createTargetShooterWorld } from './target-shooter-world.js?v=20260831-white-projectile';

export function createTargetShooterAddon(options = {}) {
  return Object.freeze({
    id: 'target-shooter',

    mount(context) {
      if (!context?.worldRoot || !context?.uiRoot || typeof context.player?.getPosition !== 'function') {
        throw new Error('target-shooter requires world, UI, and player addon capabilities.');
      }
      if (typeof context.input?.onClick !== 'function') {
        throw new Error('target-shooter requires the addon pointer input capability.');
      }

      const game = createTargetShooterGame(options);
      const playerPosition = { x: 0, y: 0, z: 0 };
      const projectiles = new Map();
      const chaseMotions = new Map();
      const returnMotions = new Map();
      const deathMotions = new Map();
      const activationBlockedUntilExit = new Set();
      let world;
      let ui;
      let audio;
      let nextProjectileId = 1;
      let completionShown = false;
      let gameOver = false;
      let disposed = false;

      function resetPlayerPosition() {
        if (typeof context.player.resetPosition === 'function') context.player.resetPosition();
      }

      function restart() {
        if (disposed) return;
        projectiles.clear();
        chaseMotions.clear();
        returnMotions.clear();
        deathMotions.clear();
        activationBlockedUntilExit.clear();
        completionShown = false;
        gameOver = false;
        ui.setCompleted(false);
        resetPlayerPosition();
        const center = context.player.getPosition(playerPosition);
        const state = game.restart(center);
        world.setTargets(state.targets, center);
        ui.render(state);
      }

      function retryAfterGameOver() {
        if (disposed || !gameOver) return;
        resetPlayerPosition();
        gameOver = false;
        ui.setGameOver(false);
      }

      function handleResultRestart(result) {
        if (result === 'game-over') retryAfterGameOver();
        else restart();
      }

      function handleClick(event) {
        if (disposed || gameOver || game.getSnapshot().completed) return false;
        const hit = world.raycastTarget(event.ray);
        if (!hit) return false;
        const player = context.player.getPosition(playerPosition);
        const origin = resolveProjectileOrigin(player, hit.point, options.projectileOriginOffset);
        const id = `projectile-${nextProjectileId++}`;
        const trajectory = createProjectileTrajectory({
          origin,
          target: hit.point,
          speed: options.projectileSpeed,
          arcHeight: options.projectileArcHeight
        });
        projectiles.set(id, { id, targetId: hit.id, origin, trajectory });
        world.addBullet(id, origin);
        void audio.playShot();
        return true;
      }

      try {
        world = createTargetShooterWorld({ root: context.worldRoot });
        ui = createTargetShooterUi({
          hudRoot: context.hudRoot || context.uiRoot,
          overlayRoot: context.uiRoot,
          interaction: context.interaction,
          signal: context.signal,
          onRestart: handleResultRestart
        });
        audio = createTargetShooterAudio({ enabled: options.soundEnabled });
        context.input.onClick(handleClick, { signal: context.signal });
        restart();
      } catch (error) {
        ui?.dispose();
        audio?.dispose();
        world?.dispose();
        throw error;
      }

      function resolveProjectileHit(projectile) {
        const state = game.hitTarget(projectile.targetId);
        if (!state.hit) return;
        world.setTargetHealth(state.hit.id, state.hit.health);
        world.showDamage(state.hit.id, state.hit.damage);
        const target = state.targets.find((candidate) => candidate.id === state.hit.id);
        if (!state.hit.defeated) {
          if (!chaseMotions.has(state.hit.id)) {
            chaseMotions.set(state.hit.id, createTargetChaseMotion(target.position));
          }
          return;
        }
        ui.render(state);
        ui.pulseCount();
        const chaseMotion = chaseMotions.get(state.hit.id);
        chaseMotions.delete(state.hit.id);
        activationBlockedUntilExit.delete(state.hit.id);
        world.startTargetDeath(state.hit.id);
        deathMotions.set(state.hit.id, createTargetDeathMotion({
          position: {
            x: chaseMotion?.position.x ?? target.position.x,
            y: 0,
            z: chaseMotion?.position.z ?? target.position.z
          },
          impactOrigin: projectile.origin,
          impulse: options.targetDeathImpulse,
          lift: options.targetDeathLift
        }));
      }

      function updateProjectiles(delta) {
        for (const projectile of [...projectiles.values()]) {
          const position = updateProjectileTrajectory(projectile.trajectory, delta);
          world.updateBullet(projectile.id, position);
          if (!position.done) continue;
          projectiles.delete(projectile.id);
          world.removeBullet(projectile.id);
          resolveProjectileHit(projectile);
        }
      }

      function updateDeaths(delta) {
        for (const [id, motion] of [...deathMotions]) {
          updateTargetDeathMotion(motion, delta, {
            gravity: options.targetDeathGravity,
            groundY: options.groundY,
            fadeDuration: options.targetFadeDuration
          });
          world.updateTargetDeath(id, motion);
          if (!motion.remove) continue;
          world.removeTarget(id);
          deathMotions.delete(id);
        }
      }

      function startReturningTargets() {
        const targets = new Map(game.getSnapshot().targets.map((target) => [target.id, target]));
        for (const [id, motion] of chaseMotions) {
          const target = targets.get(id);
          if (!target || target.defeated) continue;
          returnMotions.set(id, createTargetReturnMotion(motion.position, target.position));
          activationBlockedUntilExit.add(id);
          world.setTargetClickable(id, false);
        }
        chaseMotions.clear();
      }

      function updateReturns(delta) {
        for (const [id, motion] of [...returnMotions]) {
          const state = updateTargetReturnMotion(motion, delta, {
            speed: options.targetMoveSpeed,
            speedMultiplier: 3,
            wobbleHeight: options.targetWobbleHeight,
            wobbleAngle: options.targetWobbleAngle,
            wobbleFrequency: options.targetWobbleFrequency
          });
          world.updateTargetChase(id, state);
          if (!state.arrived) continue;
          returnMotions.delete(id);
          world.setTargetClickable(id, true);
        }
      }

      function updateChases(delta) {
        if (chaseMotions.size === 0) return false;
        const player = context.player.getPosition(playerPosition);
        for (const [id, motion] of chaseMotions) {
          const state = updateTargetChaseMotion(motion, player, delta, {
            speed: options.targetMoveSpeed,
            collisionRadius: options.targetCollisionRadius,
            wobbleHeight: options.targetWobbleHeight,
            wobbleAngle: options.targetWobbleAngle,
            wobbleFrequency: options.targetWobbleFrequency
          });
          world.updateTargetChase(id, state);
          if (!state.collided) continue;
          gameOver = true;
          for (const projectile of projectiles.values()) world.removeBullet(projectile.id);
          projectiles.clear();
          startReturningTargets();
          ui.setGameOver(true);
          return true;
        }
        return false;
      }

      function activateNearbyTargets() {
        const player = context.player.getPosition(playerPosition);
        for (const target of game.getSnapshot().targets) {
          const distance = Math.hypot(target.position.x - player.x, target.position.z - player.z);
          if (activationBlockedUntilExit.has(target.id)) {
            if (distance > target.activationDistance) activationBlockedUntilExit.delete(target.id);
            else continue;
          }
          if (
            target.defeated
            || chaseMotions.has(target.id)
            || returnMotions.has(target.id)
            || deathMotions.has(target.id)
          ) continue;
          if (distance > target.activationDistance) continue;
          chaseMotions.set(target.id, createTargetChaseMotion(target.position));
        }
      }

      function update(delta) {
        if (disposed) return;
        let collision = false;
        if (!gameOver) {
          updateProjectiles(delta);
          activateNearbyTargets();
          collision = updateChases(delta);
        }
        if (!collision) updateReturns(delta);
        updateDeaths(delta);
        world.updateDamageFeedback(delta);
        if (!completionShown && game.getSnapshot().completed && deathMotions.size === 0) {
          completionShown = true;
          ui.setCompleted(true);
        }
      }

      function dispose() {
        if (disposed) return;
        disposed = true;
        projectiles.clear();
        chaseMotions.clear();
        returnMotions.clear();
        deathMotions.clear();
        activationBlockedUntilExit.clear();
        ui.dispose();
        audio.dispose();
        world.dispose();
      }

      return { update, dispose, api: Object.freeze({ restart }) };
    }
  });
}