# Scene addon Host contract

Scene addons run inside a Host-provided context. An addon owns its game state, world objects, UI, listeners, and cleanup, while the Host owns the render loop, player and camera controls, physics, and coordination between addons.

## Interaction locks

`context.interaction` is an optional Host capability for modal addon UI. An addon requests a scene-wide interaction lock when a result dialog or another blocking view becomes visible:

```js
const releaseInteractionLock = context.interaction?.acquireLock?.();

// Release when the blocking view closes, restarts, or the addon is disposed.
releaseInteractionLock?.();
```

`acquireLock()` must return a release function when the Host accepts the lock. The release function should be idempotent so repeated cleanup is safe.

While at least one interaction lock is active, a Host should:

- disable player movement, jumping, camera controls, and scene pointer actions;
- stop or suspend the scene update loop, including addon `update()` calls;
- keep DOM overlay controls available so the user can dismiss the message or restart;
- preserve any independent Host pause or controls-disabled state.

The Host should reference-count or token-track locks. Releasing one addon's lock must not release another addon's lock or an independent Host pause. Removing an addon must release any lock owned by that addon.

If a Host does not provide `context.interaction.acquireLock()`, portable addons still render their result UI and stop their own gameplay where supported, but they cannot guarantee that the Host's player, camera, render loop, physics, or other addons will pause. Addons cannot implement those Host-specific systems on behalf of an unknown Host.

The reference SDK Scene implements this contract with token-tracked locks in `runtime/three-scene.js` and passes the capability through `runtime/scene-addon-host.js`.
