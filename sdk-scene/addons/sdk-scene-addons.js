import { gemCollectorAddonDefinition } from './gem-collector/index.js?v=20260828-roboto';
import { targetShooterAddonDefinition } from './target-shooter/index.js?v=20260831-white-projectile';

// This is the SDK Scene's available addon catalog. Definitions decide whether
// they are enabled by default; sdk-scene.js and the Three.js runtime stay generic.
export const sdkSceneAddonDefinitions = Object.freeze([
  gemCollectorAddonDefinition,
  targetShooterAddonDefinition
]);
