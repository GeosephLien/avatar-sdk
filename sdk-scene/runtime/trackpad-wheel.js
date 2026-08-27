export const TRACKPAD_HORIZONTAL_EPSILON = 0.01;
export const TRACKPAD_VERTICAL_DELTA_LIMIT = 80;
export const TRACKPAD_STREAM_WINDOW_MS = 160;

export const WHEEL_INPUT_KINDS = Object.freeze({
  PINCH_ZOOM: 'pinch-zoom',
  TRACKPAD_ROTATE: 'trackpad-rotate',
  WHEEL_ZOOM: 'wheel-zoom'
});

function normalizeDelta(value, deltaMode) {
  const delta = Number(value) || 0;
  const factor = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  return delta * factor;
}

export function classifyWheelInput(event = {}, lastTrackpadTime = -Infinity) {
  const deltaMode = Number(event.deltaMode) || 0;
  const rawDeltaX = Number(event.deltaX) || 0;
  const rawDeltaY = Number(event.deltaY) || 0;
  const timestamp = Number.isFinite(Number(event.timeStamp)) ? Number(event.timeStamp) : 0;
  const normalizedDeltaX = normalizeDelta(rawDeltaX, deltaMode);
  const normalizedDeltaY = normalizeDelta(rawDeltaY, deltaMode);
  const result = {
    kind: WHEEL_INPUT_KINDS.WHEEL_ZOOM,
    deltaX: normalizedDeltaX,
    deltaY: normalizedDeltaY,
    lastTrackpadTime
  };

  if (event.ctrlKey) {
    return { ...result, kind: WHEEL_INPUT_KINDS.PINCH_ZOOM, lastTrackpadTime: -Infinity };
  }
  if (deltaMode !== 0 || (!rawDeltaX && !rawDeltaY)) {
    return result;
  }

  const hasHorizontalDelta = Math.abs(rawDeltaX) > TRACKPAD_HORIZONTAL_EPSILON;
  const hasFractionalDelta = !Number.isInteger(rawDeltaX) || !Number.isInteger(rawDeltaY);
  const hasSmallVerticalDelta = Math.abs(rawDeltaY) > 0 && Math.abs(rawDeltaY) < TRACKPAD_VERTICAL_DELTA_LIMIT;
  const continuesTrackpadStream = timestamp >= lastTrackpadTime
    && timestamp - lastTrackpadTime <= TRACKPAD_STREAM_WINDOW_MS;

  if (hasHorizontalDelta || hasFractionalDelta || hasSmallVerticalDelta || continuesTrackpadStream) {
    return {
      ...result,
      kind: WHEEL_INPUT_KINDS.TRACKPAD_ROTATE,
      lastTrackpadTime: timestamp
    };
  }
  return { ...result, lastTrackpadTime: -Infinity };
}