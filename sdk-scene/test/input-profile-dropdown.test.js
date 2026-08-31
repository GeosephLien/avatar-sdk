import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('../components/input-profile-dropdown/input-profile-dropdown.js', import.meta.url);
const cssUrl = new URL('../components/input-profile-dropdown/input-profile-dropdown.css', import.meta.url);
const [javascript, css] = await Promise.all([
  readFile(componentUrl, 'utf8'),
  readFile(cssUrl, 'utf8')
]);

test('defines an icon-only trigger and two endpoint option groups', () => {
  assert.match(javascript, /class="input-profile-trigger"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(javascript, /class="input-profile-dropdown" role="menu"[^>]*hidden/);
  assert.equal((javascript.match(/class="profile-options" role="group"/g) || []).length, 2);
  assert.equal((javascript.match(/<button class="profile-endpoint/g) || []).length, 4);
  assert.equal((javascript.match(/<button class="profile-endpoint[^>]*aria-pressed="(?:true|false)"/g) || []).length, 4);
  assert.match(javascript, /class="profile-label">View<\/span>/);
  assert.match(javascript, /class="profile-label">Input<\/span>/);
  assert.match(javascript, /class="wasd-icon"[\s\S]*<rect[^>]*><\/rect>|class="wasd-icon"[\s\S]*<rect/);
  assert.doesNotMatch(javascript, /type="checkbox"|role="switch"|switch-track|modal|backdrop|role="dialog"/i);
});

test('keeps the trigger borderless and positions the dropdown below it', () => {
  assert.match(css, /\.input-profile-trigger \{[\s\S]*border:\s*0;[\s\S]*color:\s*#fff;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  assert.match(css, /\.input-profile-dropdown \{[\s\S]*top:\s*calc\(100% \+ 8px\);[\s\S]*right:\s*0;[\s\S]*width:\s*max-content;[\s\S]*min-width:\s*160px;/);
  assert.match(css, /\.profile-endpoint\[aria-pressed="true"\] \{[\s\S]*color:\s*var\(--input-profile-accent\);/);
  assert.doesNotMatch(css, /--input-profile-selected/);
  assert.doesNotMatch(css, /\.profile-switch|\.switch-track/);
});

test('exposes active profile state and a composed Host intent event', () => {
  assert.match(javascript, /static observedAttributes = \['active-profile', 'disabled'\]/);
  assert.match(javascript, /new CustomEvent\('input-profile-change',[\s\S]*bubbles:\s*true,[\s\S]*composed:\s*true,[\s\S]*detail:\s*\{ profileId, view, input \}/);
  assert.match(javascript, /event\.key === 'Escape'/);
  assert.match(javascript, /event\.key === 'Tab'/);
  assert.match(javascript, /'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'/);
  assert.match(javascript, /event\.composedPath\(\)\.includes\(this\)/);
  assert.match(javascript, /committed\[changedDimension\] === selectedValue/);
  assert.match(javascript, /setAttribute\('aria-pressed', String\(state\[endpoint\.dataset\.dimension\] === endpoint\.dataset\.value\)\)/);
});