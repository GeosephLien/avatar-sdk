import { createGemCollectorAddon } from './gem-collector-addon.js?v=20260831-result-lock';

export { createGemCollectorAddon };

export const gemCollectorAddonDefinition = Object.freeze({
  id: 'gem-collector',
  label: 'Gem Collector',
  defaultEnabled: true,
  create: createGemCollectorAddon
});
