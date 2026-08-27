import { gemCollectorAddonDefinition } from './gem-collector/index.js?v=20260828-addon-ui-slots';

// This is the only source-level install list for the SDK Scene. Add or remove
// package definitions here; sdk-scene.js and the Three.js runtime stay generic.
export const sdkSceneAddonDefinitions = Object.freeze([
  gemCollectorAddonDefinition
]);
