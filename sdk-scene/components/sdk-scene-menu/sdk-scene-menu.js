import { DEFAULT_PROFILE_ID, PROFILE_STATE, resolveProfileId } from './control-profile-state.js';

const TEMPLATE = `
  <button class="sdk-scene-menu-btn" type="button" aria-label="Scene menu" aria-haspopup="menu" aria-expanded="false">
    <svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"/></svg>
  </button>
  <div class="sdk-scene-menu-dropdown" role="menu" aria-label="Scene settings" hidden>
    <button class="control-settings-btn" type="button" role="menuitem">Control Settings</button>
  </div>
  <div class="control-settings-modal" hidden>
    <div class="control-settings-backdrop" aria-hidden="true"></div>
    <section class="control-settings-panel" role="dialog" aria-modal="true" aria-labelledby="control-settings-title">
      <button class="control-settings-close" type="button" aria-label="Close control settings" title="Close">
        <svg viewBox="0 -960 960 960" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
      </button>
      <h2 id="control-settings-title">Control Settings</h2>
      <div class="setting-group">
        <p class="setting-label">Camera</p>
        <div class="camera-options" role="radiogroup" aria-label="Camera">
          <button type="button" data-camera="third-person" role="radio">Third Person</button>
          <button type="button" data-camera="top-down" role="radio">Top Down</button>
        </div>
      </div>
      <div class="setting-group">
        <p class="setting-label">Movement</p>
        <label class="control-toggle">
          <span>WASD</span>
          <input type="checkbox" role="switch" aria-label="Use Click to Move instead of WASD">
          <span class="toggle-track" aria-hidden="true"></span>
          <span>Click to Move</span>
        </label>
      </div>
    </section>
  </div>
`;

export class SdkSceneMenu extends HTMLElement {
  #activeProfile = DEFAULT_PROFILE_ID;
  #abortController = null;

  connectedCallback() {
    if (!this.hasChildNodes()) this.innerHTML = TEMPLATE;
    if (this.#abortController) return;
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    this.querySelector('.sdk-scene-menu-btn').addEventListener('click', () => this.#toggleMenu(), { signal });
    this.querySelector('.control-settings-btn').addEventListener('click', () => this.#openPanel(), { signal });
    this.querySelector('.control-settings-close').addEventListener('click', () => this.#closePanel(), { signal });
    this.querySelector('.control-settings-backdrop').addEventListener('click', () => this.#closePanel(), { signal });
    for (const button of this.querySelectorAll('[data-camera]')) {
      button.addEventListener('click', () => this.#requestProfile(button.dataset.camera, PROFILE_STATE[this.#activeProfile].clickToMove), { signal });
    }
    this.querySelector('.control-toggle input').addEventListener('change', (event) => {
      this.#requestProfile(PROFILE_STATE[this.#activeProfile].camera, event.currentTarget.checked);
    }, { signal });
    document.addEventListener('pointerdown', (event) => {
      if (!event.composedPath().includes(this)) this.#closeMenu();
    }, { signal });
    document.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });
    this.activeProfile = this.#activeProfile;
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  #toggleMenu() {
    const dropdown = this.querySelector('.sdk-scene-menu-dropdown');
    if (dropdown.hidden) this.#openMenu();
    else this.#closeMenu();
  }

  #openMenu() {
    const button = this.querySelector('.sdk-scene-menu-btn');
    const dropdown = this.querySelector('.sdk-scene-menu-dropdown');
    dropdown.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    this.querySelector('.control-settings-btn').focus({ preventScroll: true });
  }

  #closeMenu({ restoreFocus = false } = {}) {
    const button = this.querySelector('.sdk-scene-menu-btn');
    this.querySelector('.sdk-scene-menu-dropdown').hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus({ preventScroll: true });
  }

  #openPanel() {
    this.#closeMenu();
    this.setAttribute('panel-open', '');
    this.querySelector('.control-settings-modal').hidden = false;
    this.querySelector('.control-settings-close').focus({ preventScroll: true });
  }

  #closePanel() {
    const modal = this.querySelector('.control-settings-modal');
    if (modal.hidden) return;
    modal.hidden = true;
    this.removeAttribute('panel-open');
    this.querySelector('.sdk-scene-menu-btn').focus({ preventScroll: true });
  }

  #handleKeydown(event) {
    const modal = this.querySelector('.control-settings-modal');
    const dropdown = this.querySelector('.sdk-scene-menu-dropdown');
    if (event.key === 'Escape') {
      if (!modal.hidden) {
        event.preventDefault();
        this.#closePanel();
      } else if (!dropdown.hidden) {
        event.preventDefault();
        this.#closeMenu({ restoreFocus: true });
      }
      return;
    }
    if (event.key === 'Tab' && !modal.hidden) this.#trapPanelFocus(event);
    else if (event.key === 'Tab' && !dropdown.hidden) this.#closeMenu();
  }

  #trapPanelFocus(event) {
    const focusable = [...this.querySelectorAll('.control-settings-panel button, .control-settings-panel input')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #requestProfile(camera, clickToMove) {
    this.dispatchEvent(new CustomEvent('control-profile-change', {
      bubbles: true,
      detail: { profileId: resolveProfileId(camera, clickToMove) }
    }));
  }

  set activeProfile(value) {
    const next = PROFILE_STATE[value] ? value : DEFAULT_PROFILE_ID;
    const state = PROFILE_STATE[next];
    this.#activeProfile = next;
    if (!this.hasChildNodes()) return;
    for (const button of this.querySelectorAll('[data-camera]')) {
      const selected = button.dataset.camera === state.camera;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('is-active', selected);
    }
    const input = this.querySelector('.control-toggle input');
    if (input) input.checked = state.clickToMove;
    const labels = this.querySelectorAll('.control-toggle > span:not(.toggle-track)');
    labels[0]?.classList.toggle('is-active', !state.clickToMove);
    labels[1]?.classList.toggle('is-active', state.clickToMove);
  }

  get activeProfile() {
    return this.#activeProfile;
  }
}

if (!customElements.get('sdk-scene-menu')) customElements.define('sdk-scene-menu', SdkSceneMenu);