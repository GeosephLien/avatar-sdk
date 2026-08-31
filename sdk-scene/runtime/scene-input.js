function defaultErrorHandler(error) {
  console.error('Scene input listener failed:', error);
}

export function createSceneInput(options = {}) {
  const onError = options.onError || defaultErrorHandler;
  if (typeof onError !== 'function') throw new Error('createSceneInput options.onError must be a function.');

  const clickListeners = new Set();
  let disposed = false;

  function onClick(listener, listenerOptions = {}) {
    if (disposed) throw new Error('Cannot subscribe after scene input is disposed.');
    if (typeof listener !== 'function') throw new Error('Scene input onClick() requires a listener.');

    const signal = listenerOptions.signal;
    if (signal?.aborted) return () => {};
    clickListeners.add(listener);

    let active = true;
    function unsubscribe() {
      if (!active) return false;
      active = false;
      clickListeners.delete(listener);
      signal?.removeEventListener('abort', unsubscribe);
      return true;
    }

    signal?.addEventListener('abort', unsubscribe, { once: true });
    return unsubscribe;
  }

  function dispatchClick(event) {
    if (disposed) return false;
    const snapshot = Object.freeze({
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      ray: Object.freeze({
        origin: Object.freeze({ ...event.ray.origin }),
        direction: Object.freeze({ ...event.ray.direction })
      })
    });
    let consumed = false;
    for (const listener of [...clickListeners]) {
      try {
        if (listener(snapshot) === true) consumed = true;
      } catch (error) {
        try { onError(error); } catch { /* Input error reporting must not break pointer handling. */ }
      }
    }
    return consumed;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clickListeners.clear();
  }

  return Object.freeze({
    input: Object.freeze({ onClick }),
    dispatchClick,
    dispose
  });
}