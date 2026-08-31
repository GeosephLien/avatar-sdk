import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneAddonRegistry } from '../runtime/scene-addon-registry.js';

function createHarness() {
  const mounts = [];
  const unmounts = [];
  const registry = createSceneAddonRegistry({
    mountAddon(addon) {
      let mounted = true;
      mounts.push(addon.id);
      return {
        id: addon.id,
        get mounted() { return mounted; },
        unmount() {
          if (!mounted) return false;
          mounted = false;
          unmounts.push(addon.id);
          return true;
        }
      };
    }
  });
  return { registry, mounts, unmounts };
}

function createDefinition(id, onCreate = () => {}) {
  return {
    id,
    create(options) {
      onCreate(options);
      return { id, mount() {} };
    }
  };
}

test('registers, installs, uninstalls, and reinstalls an addon by id', () => {
  const { registry, mounts, unmounts } = createHarness();
  let receivedOptions;
  registry.register(createDefinition('test-addon', (options) => { receivedOptions = options; }));

  const firstHandle = registry.install('test-addon', { enabled: true });
  assert.deepEqual(receivedOptions, { enabled: true });
  assert.equal(registry.install('test-addon'), firstHandle);
  assert.deepEqual(registry.availableIds, ['test-addon']);
  assert.deepEqual(registry.installedIds, ['test-addon']);

  assert.equal(registry.uninstall('test-addon'), true);
  assert.equal(registry.uninstall('test-addon'), false);
  assert.equal(registry.has('test-addon'), true);
  assert.equal(registry.isInstalled('test-addon'), false);

  registry.install('test-addon');
  assert.deepEqual(mounts, ['test-addon', 'test-addon']);
  assert.deepEqual(unmounts, ['test-addon']);
});

test('unregister completely uninstalls and removes the package definition', () => {
  const { registry, unmounts } = createHarness();
  registry.register(createDefinition('removable-addon'));
  registry.install('removable-addon');

  assert.equal(registry.unregister('removable-addon'), true);
  assert.equal(registry.unregister('removable-addon'), false);
  assert.deepEqual(unmounts, ['removable-addon']);
  assert.deepEqual(registry.availableIds, []);
  assert.deepEqual(registry.installedIds, []);
  assert.throws(() => registry.install('removable-addon'), /not registered/);
});

test('installAll rolls back addons installed during a failed batch', () => {
  const { registry, mounts, unmounts } = createHarness();
  registry.registerAll([
    createDefinition('healthy-addon'),
    {
      id: 'broken-addon',
      create() { throw new Error('package failed'); }
    }
  ]);

  assert.throws(() => registry.installAll(), /package failed/);
  assert.deepEqual(mounts, ['healthy-addon']);
  assert.deepEqual(unmounts, ['healthy-addon']);
  assert.deepEqual(registry.installedIds, []);
});

test('recognizes external unmounts and disposes all registry state', () => {
  const { registry, unmounts } = createHarness();
  registry.registerAll([
    createDefinition('first-addon'),
    createDefinition('second-addon')
  ]);
  const firstHandle = registry.install('first-addon');
  registry.install('second-addon');
  firstHandle.unmount();

  assert.equal(registry.isInstalled('first-addon'), false);
  assert.deepEqual(registry.installedIds, ['second-addon']);
  registry.dispose();
  assert.deepEqual(unmounts, ['first-addon', 'second-addon']);
  assert.deepEqual(registry.availableIds, []);
  assert.throws(() => registry.register(createDefinition('late-addon')), /disposed/);
});

test('publishes portable metadata with a readable fallback label', () => {
  const { registry } = createHarness();
  registry.registerAll([
    { ...createDefinition('named-addon'), label: 'Named Addon', defaultEnabled: true },
    createDefinition('fallback-addon')
  ]);

  assert.deepEqual(registry.availableAddons, [
    { id: 'named-addon', label: 'Named Addon', defaultEnabled: true },
    { id: 'fallback-addon', label: 'Fallback Addon', defaultEnabled: false }
  ]);
  assert.equal(Object.isFrozen(registry.availableAddons), true);
  assert.equal(Object.isFrozen(registry.availableAddons[0]), true);
});

test('subscribers receive immutable committed lifecycle snapshots', () => {
  const { registry } = createHarness();
  const snapshots = [];
  const unsubscribe = registry.subscribe((snapshot) => snapshots.push(snapshot));

  registry.register({ ...createDefinition('test-addon'), label: 'Test Addon' });
  registry.install('test-addon');
  registry.uninstall('test-addon');
  unsubscribe();
  registry.unregister('test-addon');

  assert.deepEqual(snapshots.map((snapshot) => snapshot.installedIds), [[], [], ['test-addon'], []]);
  assert.deepEqual(snapshots[1].availableAddons, [
    { id: 'test-addon', label: 'Test Addon', defaultEnabled: false }
  ]);
  assert.equal(Object.isFrozen(snapshots[1]), true);
  assert.equal(Object.isFrozen(snapshots[1].installedIds), true);
});

test('isolates subscriber failures and batches installAll rollback notifications', () => {
  const { registry } = createHarness();
  registry.registerAll([
    createDefinition('healthy-addon'),
    { id: 'broken-addon', create() { throw new Error('package failed'); } }
  ]);
  const snapshots = [];
  registry.subscribe(() => { throw new Error('listener failed'); });
  registry.subscribe((snapshot) => snapshots.push(snapshot.installedIds));

  assert.throws(() => registry.installAll(), /package failed/);
  assert.deepEqual(snapshots, [[]]);
  assert.doesNotThrow(() => registry.install('healthy-addon'));
  assert.deepEqual(snapshots, [[], ['healthy-addon']]);
});

test('detects an externally unmounted handle and publishes the corrected state', () => {
  const { registry } = createHarness();
  registry.register(createDefinition('test-addon'));
  const handle = registry.install('test-addon');
  const snapshots = [];
  registry.subscribe((snapshot) => snapshots.push(snapshot.installedIds));

  handle.unmount();
  assert.equal(registry.isInstalled('test-addon'), false);
  assert.deepEqual(snapshots, [['test-addon'], []]);
});

test('publishes unregister as one committed mutation', () => {
  const { registry } = createHarness();
  registry.register(createDefinition('test-addon'));
  registry.install('test-addon');
  const snapshots = [];
  registry.subscribe((snapshot) => snapshots.push(snapshot));

  registry.unregister('test-addon');

  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1], { availableAddons: [], installedIds: [] });
});
