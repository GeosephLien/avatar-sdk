function normalizeDefinition(definition) {
  if (!definition || typeof definition.create !== 'function') {
    throw new Error('A scene addon definition must provide create(options).');
  }
  const id = String(definition.id || '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error('A scene addon definition id must use lowercase letters, numbers, and hyphens.');
  }
  return Object.freeze({ id, create: definition.create });
}

export function createSceneAddonRegistry(options = {}) {
  const { mountAddon } = options;
  if (typeof mountAddon !== 'function') {
    throw new Error('createSceneAddonRegistry requires mountAddon().');
  }

  const definitions = new Map();
  const installations = new Map();
  let disposed = false;

  function assertActive() {
    if (disposed) throw new Error('The scene addon registry has been disposed.');
  }

  function getInstallation(id) {
    const handle = installations.get(id);
    if (handle && handle.mounted === false) {
      installations.delete(id);
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
    return handle;
  }

  function uninstallInternal(id) {
    const handle = getInstallation(id);
    if (!handle) return false;
    installations.delete(id);
    handle.unmount();
    return true;
  }

  function uninstall(id) {
    assertActive();
    return uninstallInternal(id);
  }

  function installAll(optionsById = {}) {
    assertActive();
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
  }

  function uninstallAll() {
    assertActive();
    let count = 0;
    for (const id of [...installations.keys()].reverse()) {
      if (uninstallInternal(id)) count += 1;
    }
    return count;
  }

  function unregister(id) {
    assertActive();
    if (!definitions.has(id)) return false;
    uninstallInternal(id);
    definitions.delete(id);
    return true;
  }

  function unregisterAll() {
    assertActive();
    uninstallAll();
    const count = definitions.size;
    definitions.clear();
    return count;
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

  function dispose() {
    if (disposed) return;
    for (const id of [...installations.keys()].reverse()) uninstallInternal(id);
    definitions.clear();
    disposed = true;
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
    dispose,
    get availableIds() { return Object.freeze([...definitions.keys()]); },
    get installedIds() {
      for (const id of [...installations.keys()]) getInstallation(id);
      return Object.freeze([...installations.keys()]);
    }
  });
}
