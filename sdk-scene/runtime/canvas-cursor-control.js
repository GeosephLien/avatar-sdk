export function installCanvasCursorControl({ element } = {}) {
  if (!element?.style) {
    throw new Error('installCanvasCursorControl requires an element with a style object.');
  }

  const previousCursor = element.style.cursor;
  let clickToMoveActive = false;
  let cameraRotating = false;
  let disposed = false;

  function render() {
    if (disposed) return;
    element.style.cursor = clickToMoveActive
      ? (cameraRotating ? 'grab' : 'pointer')
      : previousCursor;
  }

  function setClickToMoveActive(value) {
    clickToMoveActive = value === true;
    if (!clickToMoveActive) cameraRotating = false;
    render();
  }

  function setCameraRotating(value) {
    cameraRotating = clickToMoveActive && value === true;
    render();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    element.style.cursor = previousCursor;
  }

  return Object.freeze({
    setClickToMoveActive,
    setCameraRotating,
    dispose
  });
}