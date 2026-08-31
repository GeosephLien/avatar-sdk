import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adapterUrl = new URL('../components/avatar-creator-adapter/avatar-creator-adapter.js', import.meta.url);
const cssUrl = new URL('../components/avatar-creator-adapter/avatar-creator-adapter.css', import.meta.url);
const [javascript, css] = await Promise.all([
  readFile(adapterUrl, 'utf8'),
  readFile(cssUrl, 'utf8')
]);

test('defines the accessible Avatar actions dropdown', () => {
  assert.match(javascript, /class="avatar-dropdown-btn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(javascript, /class="avatar-dropdown" role="menu"[^>]*hidden/);
  assert.match(javascript, /class="create-avatar-button"[^>]*role="menuitem">Create Avatar<\/button>/);
  assert.match(javascript, /class="download-avatar-button"[^>]*role="menuitem" disabled>Download Avatar<\/button>/);
  assert.match(javascript, /fill="currentColor"[^>]*aria-hidden="true"/);
});

test('keeps the menu trigger borderless and exposes disabled download styling', () => {
  assert.match(css, /\.avatar-dropdown-btn \{[\s\S]*border:\s*0;[\s\S]*color:\s*#fff;[\s\S]*background:\s*transparent;/);
  assert.match(css, /\.avatar-dropdown-btn:hover \{ color:\s*#73eaff; \}/);
  assert.match(css, /\.avatar-dropdown button\[role="menuitem"\]:disabled \{[^}]*opacity:/);
});

test('exposes reusable archive APIs and composed download events', () => {
  assert.match(javascript, /async canDownloadAvatar\(\)/);
  assert.match(javascript, /async createAvatarArchive\(\)/);
  assert.match(javascript, /async downloadAvatar\(\)/);
  for (const eventName of [
    'avatar-download-state-change',
    'avatar-download-start',
    'avatar-download-complete',
    'avatar-download-error'
  ]) {
    assert.match(javascript, new RegExp(`this\\.emit\\('${eventName}'`));
  }
});