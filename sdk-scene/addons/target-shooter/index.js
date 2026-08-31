import { createTargetShooterAddon } from './target-shooter-addon.js?v=20260831-white-projectile';

export { createTargetShooterAddon };

export const targetShooterAddonDefinition = Object.freeze({
  id: 'target-shooter',
  label: 'Target Shooter',
  defaultEnabled: false,
  create: createTargetShooterAddon
});