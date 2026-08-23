import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCreatorPanelSize,
  createCreatorFrameLayout
} from '../components/avatar-creator-entry/creator-frame-layout.js';

test('keeps the legacy 16:9 anchor on desktop', () => {
  const size = calculateCreatorPanelSize({ viewportWidth: 1440, viewportHeight: 900 });
  assert.deepEqual(size, { width: 1400, height: 787.5 });
});

test('uses the legacy tall ratio on narrow portrait viewports', () => {
  const size = calculateCreatorPanelSize({ viewportWidth: 390, viewportHeight: 844 });
  assert.deepEqual(size, { width: 350, height: 622.2222222222222 });
});

test('keeps the panel inside a short landscape viewport', () => {
  const size = calculateCreatorPanelSize({ viewportWidth: 844, viewportHeight: 390 });
  assert.deepEqual(size, { width: 622.2222222222222, height: 350 });
});

test('uses layout variables inherited from the component host', () => {
  const panel = { style: {} };
  const values = {
    '--creator-inline-gutter': '30px',
    '--creator-block-gutter': '40px',
    '--creator-panel-max-width': '900px'
  };
  const windowObject = {
    innerWidth: 1200,
    innerHeight: 800,
    document: { body: { classList: { contains: () => false } } },
    getComputedStyle: (element) => {
      assert.equal(element, panel);
      return { getPropertyValue: (propertyName) => values[propertyName] || '' };
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const layout = createCreatorFrameLayout({ panel, windowObject });
  layout.start();
  assert.equal(panel.style.width, '900px');
  assert.equal(panel.style.height, '506.25px');
  layout.stop();
});

test('attaches resize listeners once and removes them on stop', () => {
  const windowListeners = new Map();
  const viewportListeners = new Map();
  const addListener = (listeners) => (type, listener) => listeners.set(type, listener);
  const removeListener = (listeners) => (type, listener) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  };
  const windowObject = {
    innerWidth: 390,
    innerHeight: 844,
    document: {
      body: { classList: { contains: () => false } },
      documentElement: {}
    },
    visualViewport: {
      width: 390,
      height: 844,
      addEventListener: addListener(viewportListeners),
      removeEventListener: removeListener(viewportListeners)
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
    addEventListener: addListener(windowListeners),
    removeEventListener: removeListener(windowListeners)
  };
  const panel = { style: {} };
  const layout = createCreatorFrameLayout({ panel, windowObject });

  layout.start();
  layout.start();
  assert.equal(windowListeners.size, 2);
  assert.equal(viewportListeners.size, 2);
  assert.equal(panel.style.width, '350px');

  layout.stop();
  assert.equal(windowListeners.size, 0);
  assert.equal(viewportListeners.size, 0);
});