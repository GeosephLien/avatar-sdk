import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createControlPackageRegistry,
  createControlProfileRegistry
} from '../runtime/control-package-registry.js';

function definition(id, type, events, fail = false) {
  return {
    id,
    type,
    install() {
      events.push(`install:${id}`);
      return {
        activate() {
          events.push(`activate:${id}`);
          if (fail) throw new Error('activation failed');
        },
        deactivate() { events.push(`deactivate:${id}`); },
        dispose() { events.push(`dispose:${id}`); }
      };
    }
  };
}

test('installs packages once and cleans up active packages when uninstalled', () => {
  const events = [];
  const registry = createControlPackageRegistry();
  registry.register(definition('camera-a', 'camera', events));
  assert.equal(registry.install('camera-a'), registry.install('camera-a'));
  registry.activate('camera-a');
  assert.throws(() => registry.uninstall('camera-a'), /must be deactivated/);
  registry.deactivate('camera-a');
  registry.uninstall('camera-a');
  assert.deepEqual(events, ['install:camera-a', 'activate:camera-a', 'deactivate:camera-a', 'dispose:camera-a']);
});

test('profile activation switches packages and rolls back a failed activation', () => {
  const events = [];
  const packages = createControlPackageRegistry();
  packages.registerAll([
    definition('camera-a', 'camera', events),
    definition('camera-b', 'camera', events),
    definition('control-x', 'control', events),
    definition('control-broken', 'control', events, true)
  ]);
  const profiles = createControlProfileRegistry({
    packages,
    profiles: {
      default: { camera: 'camera-a', control: 'control-x' },
      broken: { camera: 'camera-b', control: 'control-broken' }
    },
    clearInput() { events.push('clear'); }
  });

  profiles.activate('default');
  assert.throws(() => profiles.activate('broken'), /activation failed/);
  assert.equal(profiles.activeId, 'default');
  assert.equal(packages.get('camera-a').active, true);
  assert.equal(packages.get('control-x').active, true);
  assert.equal(packages.get('camera-b').active, false);
});