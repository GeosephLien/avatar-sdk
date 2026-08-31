const COUNTER_MARKUP = `
  <style>
    :host {
      display: block;
      pointer-events: none;
      color: #121417;
      font-family: "Roboto", sans-serif;
    }
    * { box-sizing: border-box; }
    .counter {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 8px 15px;
      border: 1px solid rgba(18, 20, 23, 0.16);
      border-radius: 999px;
      background: rgba(244, 246, 241, 0.9);
      box-shadow: 0 12px 32px rgba(18, 20, 23, 0.14);
      backdrop-filter: blur(14px);
    }
    .target-icon {
      width: 19px;
      height: 19px;
      border: 3px solid #ef4f4f;
      border-radius: 50%;
      background: radial-gradient(circle, #ef4f4f 0 24%, #f4f6f1 26% 52%, #ef4f4f 54% 100%);
      box-shadow: inset 0 0 0 1px rgba(18, 20, 23, 0.12);
    }
    .label {
      color: rgba(18, 20, 23, 0.68);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .count {
      display: inline-block;
      min-width: 42px;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
      transform-origin: center;
    }
    .count.is-bumping { animation: target-count-bump 280ms cubic-bezier(0.22, 1.4, 0.36, 1); }
    @keyframes target-count-bump {
      0%, 100% { color: #121417; transform: scale(1); }
      42% { color: #ef4f4f; transform: scale(1.35); }
    }
    @media (prefers-reduced-motion: reduce) {
      .count.is-bumping { animation: none; color: #ef4f4f; }
    }
  </style>
  <section class="counter" aria-label="Target shooting progress" aria-live="polite">
    <span class="target-icon" aria-hidden="true"></span>
    <span class="label">Targets</span>
    <strong class="count">0 / 0</strong>
  </section>
`;

const COMPLETION_MARKUP = `
  <style>
    :host { position: absolute; inset: 0; display: block; pointer-events: none; color: #121417; font-family: "Roboto", sans-serif; }
    * { box-sizing: border-box; }
    .completion { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; pointer-events: auto; background: rgba(18, 24, 30, 0.48); backdrop-filter: blur(5px); }
    .completion[hidden] { display: none; }
    .card { width: min(360px, 100%); padding: 32px; border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 8px; background: #f4f6f1; box-shadow: 0 24px 72px rgba(18, 20, 23, 0.3); text-align: center; }
    .eyebrow { margin: 0 0 8px; color: #596673; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    h2 { margin: 0; font-size: 36px; line-height: 1.1; }
    p { margin: 12px 0 24px; color: rgba(18, 20, 23, 0.68); font-size: 15px; line-height: 1.5; }
    button { width: 100%; min-height: 48px; border: 0; border-radius: 8px; color: #111820; background: #73eaff; font: inherit; font-weight: 700; cursor: pointer; }
    button:focus-visible { outline: 3px solid #121417; outline-offset: 3px; }
  </style>
  <section class="completion" role="dialog" aria-modal="true" aria-labelledby="target-shooter-complete-title" hidden>
    <div class="card">
      <div class="eyebrow">All targets cleared</div>
      <h2 id="target-shooter-complete-title">Complete!</h2>
      <p>Every target is down.</p>
      <button type="button">Restart</button>
    </div>
  </section>
`;

const RESULT_COPY = Object.freeze({
  completed: Object.freeze({
    eyebrow: 'All targets cleared',
    title: 'Complete!',
    message: 'Every target is down.'
  }),
  'game-over': Object.freeze({
    eyebrow: 'Target reached you',
    title: 'Game Over',
    message: 'A moving target caught you.'
  })
});

export function createTargetShooterUi(options = {}) {
  const { hudRoot, overlayRoot, interaction, signal, onRestart } = options;
  if (!hudRoot || typeof hudRoot.appendChild !== 'function' || !overlayRoot || typeof overlayRoot.appendChild !== 'function') {
    throw new Error('createTargetShooterUi requires DOM-compatible HUD and overlay roots.');
  }
  if (typeof onRestart !== 'function') throw new Error('createTargetShooterUi requires onRestart().');
  const counterHost = document.createElement('div');
  const completionHost = document.createElement('div');
  counterHost.dataset.targetShooterView = 'counter';
  completionHost.dataset.targetShooterView = 'completion';
  hudRoot.appendChild(counterHost);
  overlayRoot.appendChild(completionHost);
  const counterShadow = counterHost.attachShadow({ mode: 'open' });
  const completionShadow = completionHost.attachShadow({ mode: 'open' });
  counterShadow.innerHTML = COUNTER_MARKUP;
  completionShadow.innerHTML = COMPLETION_MARKUP;
  const count = counterShadow.querySelector('.count');
  const completion = completionShadow.querySelector('.completion');
  const eyebrow = completionShadow.querySelector('.eyebrow');
  const title = completionShadow.querySelector('h2');
  const message = completionShadow.querySelector('p');
  const restartButton = completionShadow.querySelector('button');
  let countPulseTimer = null;
  let activeResult = null;
  let releaseInteractionLock = null;
  let disposed = false;

  function lockInteraction() {
    if (releaseInteractionLock || typeof interaction?.acquireLock !== 'function') return;
    const release = interaction.acquireLock();
    if (typeof release === 'function') releaseInteractionLock = release;
  }

  function unlockInteraction() {
    releaseInteractionLock?.();
    releaseInteractionLock = null;
  }

  function handleRestart() {
    if (disposed) return;
    unlockInteraction();
    onRestart(activeResult);
  }
  restartButton.addEventListener('click', handleRestart, { signal });

  function render(state) {
    if (disposed) return;
    count.textContent = `${state.defeatedCount} / ${state.total}`;
  }

  function pulseCount() {
    if (disposed) return;
    count.classList.remove('is-bumping');
    void count.offsetWidth;
    count.classList.add('is-bumping');
    if (countPulseTimer !== null) clearTimeout(countPulseTimer);
    countPulseTimer = setTimeout(() => {
      countPulseTimer = null;
      count.classList.remove('is-bumping');
    }, 320);
  }

  function setResult(result) {
    if (disposed) return;
    const copy = RESULT_COPY[result];
    activeResult = copy ? result : null;
    completion.hidden = !copy;
    if (!copy) {
      unlockInteraction();
      return;
    }
    lockInteraction();
    eyebrow.textContent = copy.eyebrow;
    title.textContent = copy.title;
    message.textContent = copy.message;
    restartButton.focus({ preventScroll: true });
  }

  function setCompleted(completed) {
    setResult(completed ? 'completed' : null);
  }

  function setGameOver(gameOver) {
    setResult(gameOver ? 'game-over' : null);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (countPulseTimer !== null) clearTimeout(countPulseTimer);
    unlockInteraction();
    restartButton.removeEventListener('click', handleRestart);
    counterHost.remove();
    completionHost.remove();
  }

  return { render, pulseCount, setCompleted, setGameOver, dispose };
}