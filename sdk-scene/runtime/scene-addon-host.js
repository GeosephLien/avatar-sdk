function defaultErrorHandler(error, details) {
  console.error(`Scene addon "${details.id}" failed during ${details.phase}:`, error);
}

function assertFunction(value, message) {
  if (typeof value !== 'function') throw new Error(message);
}

function removeUiRoot(uiParent, uiRoot) {
  if (!uiRoot) return;
  if (uiRoot.parentNode === uiParent && typeof uiParent.removeChild === 'function') {
    uiParent.removeChild(uiRoot);
    return;
  }
  if (typeof uiRoot.remove === 'function') uiRoot.remove();
}

export function createSceneAddonHost(options = {}) {
  const {
    worldParent,
    uiParent,
    hudParent = null,
    createWorldRoot,
    createUiRoot,
    createHudRoot = null,
    player,
    onError = defaultErrorHandler
  } = options;

  if (!worldParent || typeof worldParent.add !== 'function' || typeof worldParent.remove !== 'function') {
    throw new Error('createSceneAddonHost requires a worldParent with add() and remove().');
  }
  if (!uiParent || typeof uiParent.appendChild !== 'function') {
    throw new Error('createSceneAddonHost requires a DOM-compatible uiParent.');
  }
  assertFunction(createWorldRoot, 'createSceneAddonHost requires createWorldRoot().');
  assertFunction(createUiRoot, 'createSceneAddonHost requires createUiRoot().');
  if ((hudParent && !createHudRoot) || (!hudParent && createHudRoot)) {
    throw new Error('createSceneAddonHost requires hudParent and createHudRoot() together.');
  }
  if (hudParent && typeof hudParent.appendChild !== 'function') {
    throw new Error('createSceneAddonHost options.hudParent must be DOM-compatible.');
  }
  if (createHudRoot) assertFunction(createHudRoot, 'createSceneAddonHost options.createHudRoot must be a function.');
  if (!player || typeof player.getPosition !== 'function') {
    throw new Error('createSceneAddonHost requires player.getPosition().');
  }
  assertFunction(onError, 'createSceneAddonHost options.onError must be a function.');

  const entries = new Map();
  let disposed = false;

  function reportError(error, entry, phase) {
    try {
      onError(error, { id: entry.id, phase });
    } catch {
      // Error reporting must never interrupt scene cleanup or the render loop.
    }
  }

  function detachEntryRoots(entry) {
    worldParent.remove(entry.worldRoot);
    removeUiRoot(hudParent, entry.hudRoot);
    removeUiRoot(uiParent, entry.uiRoot);
  }

  function disposeEntry(entry, phase = 'unmount') {
    if (!entry || entries.get(entry.id) !== entry) return false;
    entries.delete(entry.id);
    entry.abortController.abort();
    try {
      if (typeof entry.instance.dispose === 'function') entry.instance.dispose();
    } catch (error) {
      reportError(error, entry, phase);
    } finally {
      detachEntryRoots(entry);
    }
    return true;
  }

  function mountAddon(addon) {
    if (disposed) throw new Error('Cannot mount an addon after the scene addon host is disposed.');
    if (!addon || typeof addon.mount !== 'function') {
      throw new Error('A scene addon must provide mount(context).');
    }

    const id = String(addon.id || '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new Error('A scene addon id must use lowercase letters, numbers, and hyphens.');
    }
    if (entries.has(id)) throw new Error(`Scene addon "${id}" is already mounted.`);

    const worldRoot = createWorldRoot({ id });
    const uiRoot = createUiRoot({ id });
    const hudRoot = createHudRoot ? createHudRoot({ id }) : null;
    const abortController = new AbortController();
    const entry = {
      id,
      addon,
      worldRoot,
      uiRoot,
      hudRoot,
      abortController,
      instance: {}
    };

    worldParent.add(worldRoot);
    if (hudRoot) hudParent.appendChild(hudRoot);
    uiParent.appendChild(uiRoot);

    try {
      const instance = addon.mount(Object.freeze({
        worldRoot,
        uiRoot,
        hudRoot,
        signal: abortController.signal,
        player
      }));
      if (instance && typeof instance.then === 'function') {
        throw new Error(`Scene addon "${id}" mount() must be synchronous.`);
      }
      if (instance !== undefined && (!instance || typeof instance !== 'object')) {
        throw new Error(`Scene addon "${id}" mount() must return an object or undefined.`);
      }
      entry.instance = instance || {};
      entries.set(id, entry);
    } catch (error) {
      abortController.abort();
      try {
        if (typeof entry.instance.dispose === 'function') entry.instance.dispose();
      } finally {
        detachEntryRoots(entry);
      }
      throw error;
    }

    return Object.freeze({
      id,
      get api() { return entry.instance.api || null; },
      get mounted() { return entries.get(id) === entry; },
      unmount() { return disposeEntry(entry); }
    });
  }

  function unmountAddon(addonOrId) {
    if (addonOrId && typeof addonOrId !== 'string' && typeof addonOrId.unmount === 'function') {
      return addonOrId.unmount();
    }
    return disposeEntry(entries.get(addonOrId));
  }

  function update(delta) {
    if (disposed) return;
    for (const entry of [...entries.values()]) {
      if (typeof entry.instance.update !== 'function') continue;
      try {
        entry.instance.update(delta);
      } catch (error) {
        reportError(error, entry, 'update');
        disposeEntry(entry, 'error cleanup');
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of [...entries.values()]) disposeEntry(entry, 'host disposal');
  }

  return {
    mountAddon,
    unmountAddon,
    update,
    dispose,
    get size() { return entries.size; }
  };
}
