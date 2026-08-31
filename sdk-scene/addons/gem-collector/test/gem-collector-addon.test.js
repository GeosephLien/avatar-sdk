import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const addonUrl = new URL('../gem-collector-addon.js', import.meta.url);
const uiUrl = new URL('../gem-ui.js', import.meta.url);

test('completion message locks interaction until restart or disposal', async () => {
  const addonSource = await readFile(addonUrl, 'utf8');
  const uiSource = await readFile(uiUrl, 'utf8');
  assert.match(addonSource, /interaction: context\.interaction/);
  assert.match(uiSource, /interaction\.acquireLock\(\)/);
  assert.match(uiSource, /lockInteraction\(\);\s*completion\.hidden = false/);
  assert.match(uiSource, /unlockInteraction\(\);\s*onRestart\(\)/);
  assert.match(uiSource, /unlockInteraction\(\);\s*clearCountPulse\(\)/);
});