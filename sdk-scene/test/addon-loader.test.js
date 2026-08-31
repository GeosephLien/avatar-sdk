import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('../components/addon-loader/addon-loader.js', import.meta.url);
const cssUrl = new URL('../components/addon-loader/addon-loader.css', import.meta.url);
const sceneHostUrl = new URL('../sdk-scene.js', import.meta.url);
const sceneHtmlUrl = new URL('../index.html', import.meta.url);
const [javascript, css, sceneHost, sceneHtml] = await Promise.all([
  readFile(componentUrl, 'utf8'),
  readFile(cssUrl, 'utf8'),
  readFile(sceneHostUrl, 'utf8'),
  readFile(sceneHtmlUrl, 'utf8')
]);

test('defines the supplied icon trigger and a direct dropdown', () => {
  assert.match(javascript, /class="addon-loader-trigger"[^>]*aria-label="Manage addons"[^>]*aria-expanded="false"/);
  assert.match(javascript, /M200-200h520v-184l45-22/);
  assert.match(javascript, /class="addon-loader-dropdown"[^>]*hidden/);
  assert.doesNotMatch(javascript, /modal|backdrop|role="dialog"/i);
});

test('keeps the trigger borderless and positions the dropdown beneath it', () => {
  assert.match(css, /\.addon-loader-trigger \{[\s\S]*border:\s*0;[\s\S]*color:\s*#fff;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /\.addon-loader-dropdown \{[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*right:\s*0;/);
  assert.match(css, /--addon-loader-accent/);
});

test('emits an intent without optimistically changing committed addon state', () => {
  assert.match(javascript, /new CustomEvent\('addon-toggle-request',[\s\S]*bubbles:\s*true,[\s\S]*composed:\s*true,[\s\S]*detail:\s*\{ addonId, installed \}/);
  assert.match(javascript, /#pendingTargets\.set\(addonId, installed\)/);
  assert.match(javascript, /input\.checked = addon\.installed/);
  assert.match(javascript, /setAddonState\(addonId, state = \{\}\)/);
  assert.doesNotMatch(javascript, /import .*three|scene-addon-registry|three-scene|sdk-scene\.js/);
});

test('renders labels safely and supports dropdown keyboard cleanup', () => {
  assert.match(javascript, /label\.textContent = addon\.label/);
  assert.match(javascript, /event\.key === 'Escape'/);
  assert.match(javascript, /event\.key === 'Tab'/);
  assert.match(javascript, /event\.composedPath\(\)\.includes\(this\)/);
  assert.match(javascript, /static observedAttributes = \['disabled'\]/);
});

test('keeps SDK Scene as the Host adapter for addon lifecycle requests', () => {
  assert.match(sceneHost, /addons\.registerAll\(sdkSceneAddonDefinitions\)/);
  assert.match(sceneHost, /definition\.defaultEnabled === true/);
  assert.match(sceneHost, /addons\.subscribe\(syncAddonLoader\)/);
  assert.match(sceneHost, /addEventListener\('addon-toggle-request'/);
  assert.match(sceneHost, /addons\.install\(addonId\)/);
  assert.match(sceneHost, /addons\.uninstall\(addonId\)/);
  assert.doesNotMatch(sceneHost, /addons\.installAll\(\)/);
  assert.match(sceneHtml, /<addon-loader disabled><\/addon-loader>/);
});