function normalizeDefinition(definition) {
  if (!definition || typeof definition.create !== 'function') {
    throw new Error('A scene addon definition must provide create(options).');
  }
  const id = String(definition.id || '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error('A scene addon definition id must use lowercase letters, numbers, and hyphens.');
  }
  const fallbackLabel = id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  const label = String(definition.label || '').trim() || fallbackLabel;
  return Object.freeze({
    id,
    label,
    defaultEnabled: definition.defaultEnabled === true,
    create: definition.create
  });
}

export function createSceneAddonRegistry(options = {}) {
  const { mountAddon } = options;
  if (typeof mountAddon !== 'function') {
    throw new Error('createSceneAddonRegistry requires mountAddon().');
  }

  const definitions = new Map();
  const installations = new Map();
  const listeners = new Set();
  let disposed = false;
  let batchDepth = 0;
  let notificationPending = false;
  let lastSnapshotSignature = '';

  function assertActive() {
    if (disposed) throw new Error('The scene addon registry has been disposed.');
  }

  function createSnapshot() {
    const availableAddons = Object.freeze([...definitions.values()].map((definition) => Object.freeze({
      id: definition.id,
      label: definition.label,
      defaultEnabled: definition.defaultEnabled
    })));
    const installedIds = Object.freeze([...installations.keys()]);
    return Object.freeze({ availableAddons, installedIds });
  }

  function publish() {
    if (batchDepth > 0) {
      notificationPending = true;
      return;
    }
    const snapshot = createSnapshot();
    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        // A UI subscriber must not interrupt addon lifecycle operations.
      }
    }
  }

  function runBatch(callback) {
    batchDepth += 1;
    try {
      return callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && notificationPending) {
        notificationPending = false;
        publish();
      }
    }
  }

  function getInstallation(id) {
    const handle = installations.get(id);
    if (handle && handle.mounted === false) {
      installations.delete(id);
      publish();
      return null;
    }
    return handle || null;
  }

  function registerAll(addonDefinitions) {
    assertActive();
    if (!addonDefinitions || typeof addonDefinitions[Symbol.iterator] !== 'function') {
      throw new Error('registerAll() requires an iterable of scene addon definitions.');
    }

    const normalized = [...addonDefinitions].map(normalizeDefinition);
    const pendingIds = new Set();
    for (const definition of normalized) {
      if (definitions.has(definition.id) || pendingIds.has(definition.id)) {
        throw new Error(`Scene addon "${definition.id}" is already registered.`);
      }
      pendingIds.add(definition.id);
    }
    for (const definition of normalized) definitions.set(definition.id, definition);
    publish();
    return Object.freeze(normalized.map((definition) => definition.id));
  }

  function register(definition) {
    return registerAll([definition])[0];
  }

  function install(id, installOptions = {}) {
    assertActive();
    const definition = definitions.get(id);
    if (!definition) throw new Error(`Scene addon "${id}" is not registered.`);
    const existing = getInstallation(id);
    if (existing) return existing;

    const addon = definition.create(installOptions);
    if (!addon || addon.id !== id || typeof addon.mount !== 'function') {
      throw new Error(`Scene addon definition "${id}" created an invalid addon.`);
    }
    const handle = mountAddon(addon);
    if (!handle || typeof handle.unmount !== 'function') {
      throw new Error(`Scene addon "${id}" did not return a valid mount handle.`);
    }
    installations.set(id, handle);
    publish();
    return handle;
  }

  function uninstallInternal(id) {
    const handle = getInstallation(id);
    if (!handle) return false;
    installations.delete(id);
    handle.unmount();
    publish();
    return true;
  }

  function uninstall(id) {
    assertActive();
    return uninstallInternal(id);
  }

  function installAll(optionsById = {}) {
    assertActive();
    return runBatch(() => {
      const installedNow = [];
      const handles = [];
      try {
        for (const id of definitions.keys()) {
          const wasInstalled = Boolean(getInstallation(id));
          const handle = install(id, optionsById[id] || {});
          handles.push(handle);
          if (!wasInstalled) installedNow.push(id);
        }
        return Object.freeze(handles);
      } catch (error) {
        for (const id of installedNow.reverse()) uninstallInternal(id);
        throw error;
      }
    });
  }

  function uninstallAll() {
    assertActive();
    return runBatch(() => {
      let count = 0;
      for (const id of [...installations.keys()].reverse()) {
        if (uninstallInternal(id)) count += 1;
      }
      return count;
    });
  }

  function unregister(id) {
    assertActive();
    if (!definitions.has(id)) return false;
    return runBatch(() => {
      uninstallInternal(id);
      definitions.delete(id);
      publish();
      return true;
    });
  }

  function unregisterAll() {
    assertActive();
    return runBatch(() => {
      uninstallAll();
      const count = definitions.size;
      definitions.clear();
      publish();
      return count;
    });
  }

  function has(id) {
    return definitions.has(id);
  }

  function isInstalled(id) {
    return Boolean(getInstallation(id));
  }

  function get(id) {
    return getInstallation(id);
  }

  function subscribe(listener) {
    assertActive();
    if (typeof listener !== 'function') throw new Error('subscribe() requires a listener function.');
    listeners.add(listener);
    try {
      listener(createSnapshot());
    } catch {
      // Initial state delivery follows the same error isolation as later updates.
    }
    return () => listeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    runBatch(() => {
      for (const id of [...installations.keys()].reverse()) uninstallInternal(id);
      definitions.clear();
      publish();
      disposed = true;
    });
    listeners.clear();
  }

  return Object.freeze({
    register,
    registerAll,
    unregister,
    unregisterAll,
    install,
    installAll,
    uninstall,
    uninstallAll,
    has,
    isInstalled,
    get,
    subscribe,
    dispose,
    get availableIds() { return Object.freeze([...definitions.keys()]); },
    get availableAddons() { return createSnapshot().availableAddons; },
    get installedIds() {
      for (const id of [...installations.keys()]) getInstallation(id);
      return Object.freeze([...installations.keys()]);
    }
  });
}
