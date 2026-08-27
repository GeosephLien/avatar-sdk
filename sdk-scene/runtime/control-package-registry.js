function normalizePackage(definition) {
  const id = String(definition?.id || '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id) || typeof definition?.install !== 'function') {
    throw new Error('A control package requires a lowercase id and install(context).');
  }
  return Object.freeze({ id, type: definition.type, install: definition.install });
}

export function createControlPackageRegistry({ context = {} } = {}) {
  const definitions = new Map();
  const installations = new Map();
  let disposed = false;

  function assertActive() {
    if (disposed) throw new Error('The control package registry has been disposed.');
  }

  function register(definition) {
    assertActive();
    const normalized = normalizePackage(definition);
    if (definitions.has(normalized.id)) throw new Error(`Control package "${normalized.id}" is already registered.`);
    definitions.set(normalized.id, normalized);
    return normalized.id;
  }

  function registerAll(items) {
    return Object.freeze([...items].map(register));
  }

  function install(id, options = {}) {
    assertActive();
    if (installations.has(id)) return installations.get(id);
    const definition = definitions.get(id);
    if (!definition) throw new Error(`Control package "${id}" is not registered.`);
    const instance = definition.install(Object.freeze({ ...context, options })) || {};
    if (typeof instance !== 'object') throw new Error(`Control package "${id}" returned an invalid instance.`);
    const installation = { id, type: definition.type, active: false, instance };
    installations.set(id, installation);
    return installation;
  }

  function activate(id, activationContext = {}) {
    assertActive();
    const installation = installations.get(id);
    if (!installation) throw new Error(`Control package "${id}" is not installed.`);
    if (installation.active) return installation;
    installation.instance.activate?.(activationContext);
    installation.active = true;
    return installation;
  }

  function deactivate(id) {
    const installation = installations.get(id);
    if (!installation || !installation.active) return false;
    installation.instance.deactivate?.();
    installation.active = false;
    return true;
  }

  function uninstallInternal(id, force = false) {
    assertActive();
    const installation = installations.get(id);
    if (!installation) return false;
    if (installation.active && !force) {
      throw new Error(`Control package "${id}" must be deactivated before uninstalling.`);
    }
    deactivate(id);
    installation.instance.dispose?.();
    installations.delete(id);
    return true;
  }

  function uninstall(id) {
    return uninstallInternal(id);
  }

  function dispose() {
    if (disposed) return;
    for (const id of [...installations.keys()].reverse()) uninstallInternal(id, true);
    definitions.clear();
    disposed = true;
  }

  return Object.freeze({
    register,
    registerAll,
    install,
    activate,
    deactivate,
    uninstall,
    dispose,
    has: (id) => definitions.has(id),
    isInstalled: (id) => installations.has(id),
    get: (id) => installations.get(id) || null,
    get availableIds() { return Object.freeze([...definitions.keys()]); },
    get installedIds() { return Object.freeze([...installations.keys()]); }
  });
}

export function createControlProfileRegistry({ packages, profiles, clearInput = () => {} }) {
  const definitions = new Map(Object.entries(profiles || {}));
  let activeId = null;
  let disposed = false;

  function install(id) {
    if (disposed) throw new Error('The control profile registry has been disposed.');
    const profile = definitions.get(id);
    if (!profile) throw new Error(`Unknown control profile "${id}".`);
    packages.install(profile.camera);
    packages.install(profile.control);
    return id;
  }

  function activate(id) {
    if (disposed) throw new Error('The control profile registry has been disposed.');
    if (id === activeId) return id;
    const profile = definitions.get(id);
    if (!profile) throw new Error(`Unknown control profile "${id}".`);
    install(id);
    const previousId = activeId;
    const previous = previousId ? definitions.get(previousId) : null;
    clearInput();
    if (previous) {
      packages.deactivate(previous.control);
      packages.deactivate(previous.camera);
    }
    try {
      packages.activate(profile.camera, { profileId: id });
      packages.activate(profile.control, { profileId: id });
      activeId = id;
      return id;
    } catch (error) {
      packages.deactivate(profile.control);
      packages.deactivate(profile.camera);
      if (previous) {
        packages.activate(previous.camera, { profileId: previousId });
        packages.activate(previous.control, { profileId: previousId });
      }
      throw error;
    }
  }

  function dispose() {
    if (disposed) return;
    if (activeId) {
      const active = definitions.get(activeId);
      packages.deactivate(active.control);
      packages.deactivate(active.camera);
    }
    activeId = null;
    disposed = true;
  }

  return Object.freeze({
    install,
    installAll() { return Object.freeze([...definitions.keys()].map(install)); },
    activate,
    dispose,
    get availableIds() { return Object.freeze([...definitions.keys()]); },
    get activeId() { return activeId; }
  });
}