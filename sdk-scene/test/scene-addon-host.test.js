import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneAddonHost } from '../runtime/scene-addon-host.js';

function createParent(methodName) {
  return {
    children: [],
    [methodName](child) {
      child.parentNode = this;
      this.children.push(child);
    },
    remove(child) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parentNode = null;
    },
    removeChild(child) {
      this.remove(child);
    }
  };
}

function createHarness(onError = () => {}, { withHud = false, input = null, interaction = null } = {}) {
  const worldParent = createParent('add');
  const uiParent = createParent('appendChild');
  const hudParent = createParent('appendChild');
  const player = {
    getPosition(target) {
      Object.assign(target, { x: 1, y: 0, z: 2 });
      return target;
    },
    resetPosition() {}
  };
  const host = createSceneAddonHost({
    worldParent,
    uiParent,
    player,
    input,
    interaction,
    onError,
    createWorldRoot: ({ id }) => ({ type: 'world', id }),
    createUiRoot: ({ id }) => ({ type: 'ui', id, parentNode: null }),
    ...(withHud ? {
      hudParent,
      createHudRoot: ({ id }) => ({ type: 'hud', id, parentNode: null })
    } : {})
  });
  return { host, worldParent, uiParent, hudParent, player };
}

test('mounts, updates, and fully unmounts an isolated addon', () => {
  const { host, worldParent, uiParent, player } = createHarness();
  const updates = [];
  let mountedContext;
  let disposeCount = 0;
  const handle = host.mountAddon({
    id: 'test-addon',
    mount(context) {
      mountedContext = context;
      return {
        update: (delta) => updates.push(delta),
        dispose: () => { disposeCount += 1; },
        api: { restart: () => 'restarted' }
      };
    }
  });

  assert.equal(host.size, 1);
  assert.equal(handle.mounted, true);
  assert.equal(handle.api.restart(), 'restarted');
  assert.equal(mountedContext.player, player);
  assert.equal(mountedContext.input, null);
  assert.equal(mountedContext.hudRoot, null);
  assert.equal(worldParent.children.length, 1);
  assert.equal(uiParent.children.length, 1);

  host.update(0.25);
  assert.deepEqual(updates, [0.25]);
  assert.equal(handle.unmount(), true);
  assert.equal(handle.unmount(), false);
  assert.equal(handle.mounted, false);
  assert.equal(mountedContext.signal.aborted, true);
  assert.equal(disposeCount, 1);
  assert.equal(host.size, 0);
  assert.equal(worldParent.children.length, 0);
  assert.equal(uiParent.children.length, 0);
});

test('passes the optional input capability to addons', () => {
  const input = Object.freeze({ onClick() {} });
  const { host } = createHarness(() => {}, { input });
  let mountedContext;

  host.mountAddon({
    id: 'input-addon',
    mount(context) { mountedContext = context; }
  });

  assert.equal(mountedContext.input, input);
});

test('passes the optional interaction lock capability to addons', () => {
  const interaction = Object.freeze({ acquireLock() {} });
  const { host } = createHarness(() => {}, { interaction });
  let mountedContext;

  host.mountAddon({
    id: 'locking-addon',
    mount(context) { mountedContext = context; }
  });

  assert.equal(mountedContext.interaction, interaction);
});

test('mounts ordered isolated HUD roots and removes them with each addon', () => {
  const { host, hudParent } = createHarness(() => {}, { withHud: true });
  let firstContext;
  let secondContext;

  const firstHandle = host.mountAddon({
    id: 'first-addon',
    mount(context) {
      firstContext = context;
    }
  });
  host.mountAddon({
    id: 'second-addon',
    mount(context) {
      secondContext = context;
    }
  });

  assert.deepEqual(hudParent.children.map(({ id }) => id), ['first-addon', 'second-addon']);
  assert.equal(firstContext.hudRoot.type, 'hud');
  assert.notEqual(firstContext.hudRoot, secondContext.hudRoot);

  firstHandle.unmount();
  assert.deepEqual(hudParent.children.map(({ id }) => id), ['second-addon']);
  host.dispose();
  assert.equal(hudParent.children.length, 0);
});

test('removes every root when an addon mount fails', () => {
  const { host, worldParent, uiParent, hudParent } = createHarness(() => {}, { withHud: true });

  assert.throws(() => host.mountAddon({
    id: 'broken-addon',
    mount() {
      throw new Error('mount failed');
    }
  }), /mount failed/);

  assert.equal(host.size, 0);
  assert.equal(worldParent.children.length, 0);
  assert.equal(uiParent.children.length, 0);
  assert.equal(hudParent.children.length, 0);
});

test('cleans up a failed addon update without stopping other addons', () => {
  const errors = [];
  const { host, worldParent, uiParent } = createHarness((error, details) => {
    errors.push({ error, details });
  });
  let healthyUpdates = 0;
  let failedDisposals = 0;

  host.mountAddon({
    id: 'failed-addon',
    mount: () => ({
      update: () => { throw new Error('update failed'); },
      dispose: () => { failedDisposals += 1; }
    })
  });
  host.mountAddon({
    id: 'healthy-addon',
    mount: () => ({ update: () => { healthyUpdates += 1; } })
  });

  host.update(0.016);
  assert.equal(failedDisposals, 1);
  assert.equal(healthyUpdates, 1);
  assert.equal(host.size, 1);
  assert.equal(worldParent.children.length, 1);
  assert.equal(uiParent.children.length, 1);
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].details, { id: 'failed-addon', phase: 'update' });
});

test('rejects duplicate ids and disposes every mounted addon with the host', () => {
  const { host } = createHarness();
  let disposeCount = 0;
  const addon = {
    id: 'single-addon',
    mount: () => ({ dispose: () => { disposeCount += 1; } })
  };

  host.mountAddon(addon);
  assert.throws(() => host.mountAddon(addon), /already mounted/);
  host.dispose();
  assert.equal(disposeCount, 1);
  assert.equal(host.size, 0);
  assert.throws(() => host.mountAddon(addon), /host is disposed/);
});
