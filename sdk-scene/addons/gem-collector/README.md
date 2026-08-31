# Gem Collector addon

`gem-collector` is a portable Three.js addon and is enabled by default in the reference SDK Scene. It owns its game state, Three.js objects, UI, event listeners, and GPU cleanup. A Host only supplies isolated world, overlay, and optional HUD roots plus a narrow player-position interface. The counter uses the HUD root while the completion dialog uses the overlay root; older hosts without HUD support fall back to the overlay root.

```js
import { gemCollectorAddonDefinition } from './index.js';

sceneRuntime.addons.register(gemCollectorAddonDefinition);
const handle = sceneRuntime.addons.install('gem-collector', {
  minGemCount: 5,
  maxGemCount: 10,
  areaSize: 15,
  soundEnabled: true
});

handle.api.restart();
sceneRuntime.addons.uninstall('gem-collector');

// Removes both the active instance and its registered package definition.
sceneRuntime.addons.unregister('gem-collector');
```

`uninstall()` removes the addon roots and calls its disposer while keeping the definition available for a later `install()`. `unregister()` performs the same cleanup and then removes the definition from the registry. Neither operation replaces or re-creates the Avatar, camera, renderer, base floor, lighting, or controls.

The reference SDK Scene's available package catalog lives only in `../sdk-scene-addons.js`. The definition supplies its portable label and `defaultEnabled` preference. SDK Scene's `<addon-loader>` is an optional Host UI over the generic registry; other Hosts can register and install this definition without loading that component or SDK Scene CSS.

## Host interaction

When the completion dialog becomes visible, Gem Collector requests the optional Host interaction lock described in the [scene addon Host contract](../README.md#interaction-locks). It releases its lock before Restart and during disposal. Without that Host capability, Gem Collector stops its own collection logic but cannot pause the Host's player, camera, render loop, physics, or other addons.

## Options

- `gemCount`: optional fixed positive integer; overrides the random range.
- `minGemCount`: random range minimum, default `5`.
- `maxGemCount`: random range maximum, default `10`.
- `areaSize`: square world size, default `15`.
- `edgePadding`: distance from the square edge, default `0.4`.
- `minSpacing`: minimum distance between generated gems, default `1`.
- `spawnClearRadius`: empty radius around the player start, default `1.5`.
- `collectRadius`: horizontal collection distance, default `0.65`.
- `random`: optional random-number function for deterministic variants or tests.
- `soundEnabled`: enables the synthesized collection chime, default `true`.

Each collection pulses the HUD count, shows a white, unoutlined `+1` Sprite that rises and fades above the collected gem, and plays a short synthesized chime. The final gem uses a higher-pitched chime, and the completion dialog waits briefly so it does not cover the world-space feedback. No audio files or particle systems are required.
