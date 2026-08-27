export const DESTINATION_HOLD_DURATION = 0.2;

export function createDestinationPointerState() {
  return {
    phase: 'idle',
    pointerId: null,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    elapsed: 0
  };
}

export function updateDestinationPointer(state, event, {
  holdDuration = DESTINATION_HOLD_DURATION,
  dragThreshold = 6
} = {}) {
  if (event.type === 'down') {
    if (state.phase !== 'idle') return { state, intent: '' };
    return {
      state: {
        phase: 'pending',
        pointerId: event.pointerId,
        startX: event.x,
        startY: event.y,
        x: event.x,
        y: event.y,
        elapsed: 0
      },
      intent: ''
    };
  }

  if (event.type === 'cancel') {
    return {
      state: createDestinationPointerState(),
      intent: state.phase === 'continuous' ? 'stop' : ''
    };
  }

  if (event.pointerId !== undefined && event.pointerId !== state.pointerId) {
    return { state, intent: '' };
  }

  if (event.type === 'move') {
    const nextState = { ...state, x: event.x, y: event.y };
    if (
      state.phase === 'pending'
      && Math.hypot(event.x - state.startX, event.y - state.startY) > dragThreshold
    ) {
      nextState.phase = 'drag';
    }
    return { state: nextState, intent: '' };
  }

  if (event.type === 'tick' && state.phase === 'pending') {
    const elapsed = state.elapsed + Math.max(0, Number(event.delta) || 0);
    const nextState = { ...state, elapsed };
    if (elapsed >= holdDuration) {
      nextState.phase = 'continuous';
      return { state: nextState, intent: 'enter-continuous' };
    }
    return { state: nextState, intent: '' };
  }

  if (event.type === 'up') {
    const intent = state.phase === 'pending'
      ? 'click'
      : state.phase === 'continuous' ? 'stop' : '';
    return { state: createDestinationPointerState(), intent };
  }

  return { state, intent: '' };
}
