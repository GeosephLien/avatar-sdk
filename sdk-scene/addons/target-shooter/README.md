# Target Shooter addon

`target-shooter` adds a click-to-shoot target round to a Three.js scene. It is available but disabled by default in the reference SDK Scene. Each new round resets the player to world origin and places five to ten targets in a 10-15 meter ring around it. Each target has a random three to five health points, a random three to five meter activation distance, and a world-space health bar. A target starts pursuing the player after its first hit or when the player enters its activation distance, and shows a subtle wobble while moving. If a moving target reaches the player, the game pauses on a Game Over dialog and every pursuing target returns to its spawn position. Returning targets cannot be shot and move at three times the pursuit speed. Restarting after Game Over resets only the player and preserves target health, defeated state, and return progress. A returned target does not reactivate from proximity until the player leaves and enters its activation distance again. Restarting after a win creates a new round.

```js
import { targetShooterAddonDefinition } from './index.js';

sceneRuntime.addons.register(targetShooterAddonDefinition);
const handle = sceneRuntime.addons.install('target-shooter', {
  projectileOriginOffset: { right: 0, height: 1.15, forward: 0.32 },
  soundEnabled: true
});

handle.api.restart();
sceneRuntime.addons.uninstall('target-shooter');
```

The Host must provide world, overlay, player-position, and pointer-ray input capabilities. Hosts can also provide `player.resetPosition()` to support the world-origin restart behavior. Clicking an alive target consumes the scene click and fires a projectile; clicking elsewhere remains available to the Host. Damage is applied when the projectile arrives and appears briefly above the target as a floating damage number. A defeated target is removed from input immediately, knocked back, allowed to settle on the ground, and faded out. The completion dialog appears after all defeated targets finish that sequence.

## Host interaction

When the Complete or Game Over dialog becomes visible, Target Shooter requests the optional Host interaction lock described in the [scene addon Host contract](../README.md#interaction-locks). It releases its lock before Restart, when the result closes, and during disposal. Without that Host capability, Target Shooter stops its own result-state gameplay but cannot pause the Host's player, camera, render loop, physics, or other addons.

## Options

- `targetCount`: optional fixed positive integer; overrides the random count.
- `minTargetCount`, `maxTargetCount`: random count range, defaults `5` and `10`.
- `minSpawnRadius`, `maxSpawnRadius`: spawn ring radii, defaults `10` and `15` meters.
- `minSpacing`: minimum target separation, default `2.2` meters.
- `targetHealth`: optional fixed positive health value that overrides the random range.
- `minTargetHealth`, `maxTargetHealth`: random health range, defaults `3` and `5`.
- `projectileOriginOffset`: local `{ right, height, forward }` offset from the player, default `{ 0, 1.15, 0.32 }`.
- `projectileSpeed`: projectile speed, default `24` meters per second.
- `projectileArcHeight`: arc lift above linear travel, default `0.18` meters.
- `targetMoveSpeed`: pursuit speed, default `1.8` meters per second; return speed is three times this value.
- `minActivationDistance`, `maxActivationDistance`: random pursuit activation-distance range, defaults `3` and `5` meters.
- `targetCollisionRadius`: player-contact distance for a moving target, default `0.65` meters.
- `targetWobbleHeight`: vertical movement amplitude while pursuing, default `0.045` meters.
- `targetWobbleAngle`: lateral tilt amplitude while pursuing, default `0.08` radians.
- `targetWobbleFrequency`: pursuit wobble frequency, default `10` radians per second.
- `targetDeathImpulse`, `targetDeathLift`, `targetDeathGravity`: knockback tuning.
- `targetFadeDuration`: fade after settling, default `0.45` seconds.
- `groundY`: target ground height, default `0`.
- `soundEnabled`: enables synthesized shot audio, default `true`.
- `random`: optional random-number function for deterministic variants and tests.