import { createGemGame } from './gem-game-state.js?v=20260827-plus-one-fade';
import { createGemCollectorUi } from './gem-ui.js?v=20260831-result-lock';
import { createGemWorld } from './gem-world.js?v=20260828-roboto';
import { createGemCollectionAudio } from './gem-audio.js?v=20260827-plus-one-fade';

export function createGemCollectorAddon(options = {}) {
  return Object.freeze({
    id: 'gem-collector',

    mount(context) {
      if (!context?.worldRoot || !context?.uiRoot || typeof context.player?.getPosition !== 'function') {
        throw new Error('gem-collector requires world, UI, and player addon capabilities.');
      }

      const game = createGemGame(options);
      const playerPosition = { x: 0, y: 0, z: 0 };
      let world;
      let ui;
      let audio;
      let disposed = false;
      let completed = false;

      function restart() {
        if (disposed) return;
        if (typeof context.player.resetPosition === 'function') context.player.resetPosition();
        const state = game.restart();
        completed = false;
        world.setGems(state.gems);
        ui.render(state);
      }

      function onRestart() {
        restart();
      }

      try {
        world = createGemWorld({ root: context.worldRoot });
        ui = createGemCollectorUi({
          hudRoot: context.hudRoot || context.uiRoot,
          overlayRoot: context.uiRoot,
          interaction: context.interaction,
          signal: context.signal,
          onRestart
        });
        audio = createGemCollectionAudio({ enabled: options.soundEnabled });
        const initialState = game.getSnapshot();
        world.setGems(initialState.gems);
        ui.render(initialState);
      } catch (error) {
        ui?.dispose();
        audio?.dispose();
        world?.dispose();
        throw error;
      }

      function update(delta) {
        if (disposed) return;
        world.update(delta);
        if (completed) return;
        const state = game.collectNearby(context.player.getPosition(playerPosition));
        if (state.collectedIndices.length === 0) return;
        completed = state.completed;
        world.collectGems(state.collectedIndices);
        ui.render(state);
        ui.pulseCount();
        void audio.play({ completed: state.justCompleted });
      }

      function dispose() {
        if (disposed) return;
        disposed = true;
        ui.dispose();
        audio.dispose();
        world.dispose();
      }

      return {
        update,
        dispose,
        api: Object.freeze({ restart })
      };
    }
  });
}
