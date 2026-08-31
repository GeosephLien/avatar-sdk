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

    .gem-icon {
      width: 17px;
      height: 17px;
      margin: 2px 3px;
      border: 2px solid #7d8792;
      border-radius: 3px;
      background: linear-gradient(90deg, #73eaff 5%, #01b0e0 25%, #415ff8 60%, #c761d6 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
      transform: rotate(45deg);
    }

    .label {
      color: rgba(18, 20, 23, 0.68);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .count {
      display: inline-block;
      min-width: 42px;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
      transform-origin: center;
    }

    .count.is-bumping {
      animation: gem-count-bump 280ms cubic-bezier(0.22, 1.4, 0.36, 1);
    }

    @keyframes gem-count-bump {
      0%, 100% { color: #121417; transform: scale(1); }
      42% { color: #415ff8; transform: scale(1.35); }
    }

    @media (prefers-reduced-motion: reduce) {
      .count.is-bumping { animation: none; color: #415ff8; }
    }
  </style>

  <section class="counter" aria-label="Gem collection progress" aria-live="polite">
    <span class="gem-icon" aria-hidden="true"></span>
    <span class="label">Gems</span>
    <strong class="count">0 / 0</strong>
  </section>
`;

const COMPLETION_MARKUP = `
  <style>
    :host {
      position: absolute;
      inset: 0;
      display: block;
      pointer-events: none;
      color: #121417;
      font-family: "Roboto", sans-serif;
    }
    * { box-sizing: border-box; }
    .completion {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      pointer-events: auto;
      background: rgba(24, 28, 38, 0.45);
      backdrop-filter: blur(5px);
    }
    .completion[hidden] { display: none; }
    .card {
      width: min(360px, 100%);
      padding: 32px;
      border: 1px solid rgba(255, 255, 255, 0.65);
      border-radius: 8px;
      background: #f4f6f1;
      box-shadow: 0 24px 72px rgba(18, 20, 23, 0.3);
      text-align: center;
    }
    .eyebrow { margin: 0 0 8px; color: #596673; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    h2 { margin: 0; font-size: clamp(28px, 7vw, 40px); line-height: 1.1; }
    p { margin: 12px 0 24px; color: rgba(18, 20, 23, 0.68); font-size: 15px; line-height: 1.5; }
    button { width: 100%; min-height: 48px; border: 0; border-radius: 8px; color: #06212a; background: linear-gradient(90deg, #73eaff 5%, #01b0e0 100%); font: inherit; font-weight: 700; cursor: pointer; }
    button:hover { filter: brightness(1.04); }
    button:focus-visible { outline: 3px solid #121417; outline-offset: 3px; }
    @media (max-width: 640px) { .completion { padding: 18px; } .card { padding: 28px 24px; } }
  </style>
  <section class="completion" role="dialog" aria-modal="true" aria-labelledby="gem-complete-title" hidden>
    <div class="card">
      <div class="eyebrow">All gems collected</div>
      <h2 id="gem-complete-title">Complete!</h2>
      <p>You found every gem in the scene.</p>
      <button type="button">Restart</button>
    </div>
  </section>
`;

export function createGemCollectorUi(options = {}) {
  const { hudRoot, overlayRoot, interaction, signal, onRestart } = options;
  if (!hudRoot || typeof hudRoot.appendChild !== 'function' || !overlayRoot || typeof overlayRoot.appendChild !== 'function') {
    throw new Error('createGemCollectorUi requires DOM-compatible HUD and overlay roots.');
  }
  if (typeof onRestart !== 'function') throw new Error('createGemCollectorUi requires onRestart().');

  const counterHost = document.createElement('div');
  const completionHost = document.createElement('div');
  counterHost.dataset.gemCollectorView = 'counter';
  completionHost.dataset.gemCollectorView = 'completion';
  hudRoot.appendChild(counterHost);
  overlayRoot.appendChild(completionHost);
  const counterShadow = counterHost.attachShadow({ mode: 'open' });
  const completionShadow = completionHost.attachShadow({ mode: 'open' });
  counterShadow.innerHTML = COUNTER_MARKUP;
  completionShadow.innerHTML = COMPLETION_MARKUP;
  const count = counterShadow.querySelector('.count');
  const completion = completionShadow.querySelector('.completion');
  const restartButton = completionShadow.querySelector('button');
  let wasCompleted = false;
  let disposed = false;
  let countPulseTimer = null;
  let completionTimer = null;
  let releaseInteractionLock = null;

  function lockInteraction() {
    if (releaseInteractionLock || typeof interaction?.acquireLock !== 'function') return;
    const release = interaction.acquireLock();
    if (typeof release === 'function') releaseInteractionLock = release;
  }

  function unlockInteraction() {
    releaseInteractionLock?.();
    releaseInteractionLock = null;
  }

  function clearCountPulse() {
    if (countPulseTimer !== null) clearTimeout(countPulseTimer);
    countPulseTimer = null;
    count.classList.remove('is-bumping');
  }

  function clearCompletionTimer() {
    if (completionTimer !== null) clearTimeout(completionTimer);
    completionTimer = null;
  }

  function handleRestart() {
    if (disposed) return;
    unlockInteraction();
    onRestart();
  }

  restartButton.addEventListener('click', handleRestart, { signal });

  function render(state) {
    if (disposed) return;
    if (state.collectedCount === 0) clearCountPulse();
    count.textContent = `${state.collectedCount} / ${state.total}`;
    if (!state.completed) {
      clearCompletionTimer();
      completion.hidden = true;
      unlockInteraction();
    } else if (!wasCompleted) {
      completion.hidden = true;
      clearCompletionTimer();
      completionTimer = setTimeout(() => {
        completionTimer = null;
        if (disposed) return;
        lockInteraction();
        completion.hidden = false;
        restartButton.focus({ preventScroll: true });
      }, 780);
    }
    wasCompleted = state.completed;
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

  function dispose() {
    if (disposed) return;
    disposed = true;
    restartButton.removeEventListener('click', handleRestart);
    unlockInteraction();
    clearCountPulse();
    clearCompletionTimer();
    counterHost.remove();
    completionHost.remove();
  }

  return { render, pulseCount, dispose };
}
