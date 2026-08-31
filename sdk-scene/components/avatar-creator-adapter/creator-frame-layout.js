const DEFAULT_MAX_WIDTH = 1400;
const DEFAULT_VIEWPORT_GUTTER = 20;

export function calculateCreatorPanelSize({
  viewportWidth,
  viewportHeight,
  inlineGutter = DEFAULT_VIEWPORT_GUTTER,
  blockGutter = DEFAULT_VIEWPORT_GUTTER,
  maxWidth = DEFAULT_MAX_WIDTH
}) {
  const viewportHeightLimit = Math.max(0, viewportHeight - (blockGutter * 2));
  const shellWidthLimit = Math.max(0, viewportWidth - (inlineGutter * 2));
  const anchorWidth = Math.min(maxWidth, viewportHeightLimit * (16 / 9));
  const fixedHeight = Math.min(viewportHeightLimit, anchorWidth * (9 / 16));
  const portraitWidthThreshold = fixedHeight * (9 / 16);
  const width = Math.min(shellWidthLimit, anchorWidth);
  const height = width < portraitWidthThreshold
    ? Math.min(viewportHeightLimit, width * (16 / 9))
    : fixedHeight;

  return { width, height };
}

function getVisibleViewportSize(windowObject) {
  const viewport = windowObject.visualViewport;
  return {
    width: viewport?.width || windowObject.innerWidth,
    height: viewport?.height || windowObject.innerHeight
  };
}

function readCssNumber(windowObject, element, propertyName, fallback) {
  const value = Number.parseFloat(
    windowObject.getComputedStyle(element).getPropertyValue(propertyName)
  );
  return Number.isFinite(value) ? value : fallback;
}

export function createCreatorFrameLayout({ panel, windowObject = window }) {
  let resizeFrame = 0;
  let active = false;

  function update() {
    if (!active) return;
    const isFullscreen = windowObject.document.body.classList.contains('is-embedded-creator');
    if (isFullscreen) {
      panel.style.width = '';
      panel.style.height = '';
      panel.style.aspectRatio = '';
      return;
    }

    const viewport = getVisibleViewportSize(windowObject);
    const size = calculateCreatorPanelSize({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      inlineGutter: readCssNumber(windowObject, panel, '--creator-inline-gutter', DEFAULT_VIEWPORT_GUTTER),
      blockGutter: readCssNumber(windowObject, panel, '--creator-block-gutter', DEFAULT_VIEWPORT_GUTTER),
      maxWidth: readCssNumber(windowObject, panel, '--creator-panel-max-width', DEFAULT_MAX_WIDTH)
    });
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    panel.style.aspectRatio = 'auto';
  }

  function scheduleUpdate() {
    if (!active) return;
    if (resizeFrame) windowObject.cancelAnimationFrame(resizeFrame);
    resizeFrame = windowObject.requestAnimationFrame(() => {
      resizeFrame = 0;
      update();
    });
  }

  function start() {
    if (active) return;
    active = true;
    update();
    windowObject.addEventListener('resize', scheduleUpdate);
    windowObject.addEventListener('orientationchange', scheduleUpdate);
    windowObject.visualViewport?.addEventListener('resize', scheduleUpdate);
    windowObject.visualViewport?.addEventListener('scroll', scheduleUpdate);
  }

  function stop() {
    if (!active) return;
    active = false;
    windowObject.removeEventListener('resize', scheduleUpdate);
    windowObject.removeEventListener('orientationchange', scheduleUpdate);
    windowObject.visualViewport?.removeEventListener('resize', scheduleUpdate);
    windowObject.visualViewport?.removeEventListener('scroll', scheduleUpdate);
    if (resizeFrame) windowObject.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
  }

  return { start, update, stop };
}