import {
  DEFAULT_CONTROL_PROFILE_ID,
  getControlProfileOptions,
  normalizeControlProfileId,
  resolveControlProfileId
} from '../../runtime/control-profile-options.js';

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="${new URL('./input-profile-dropdown.css', import.meta.url).href}">
  <button class="input-profile-trigger" type="button" aria-label="Input profile" title="Input profile" aria-haspopup="menu" aria-expanded="false">
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M189-160q-60 0-102.5-43T42-307q0-9 1-18t3-18l84-336q14-54 57-87.5t98-33.5h390q55 0 98 33.5t57 87.5l84 336q2 9 3.5 18.5T919-306q0 61-43.5 103.5T771-160q-42 0-78-22t-54-60l-28-58q-5-10-15-15t-21-5H385q-11 0-21 5t-15 15l-28 58q-18 38-54 60t-78 22Zm3-80q19 0 34.5-10t23.5-27l28-57q15-31 44-48.5t63-17.5h190q34 0 63 18t45 48l28 57q8 17 23.5 27t34.5 10q28 0 48-18.5t21-46.5q0 1-2-19l-84-335q-7-27-28-44t-49-17H285q-28 0-49.5 17T208-659l-84 335q-2 6-2 18 0 28 20.5 47t49.5 19Zm376.5-291.5Q580-543 580-560t-11.5-28.5Q557-600 540-600t-28.5 11.5Q500-577 500-560t11.5 28.5Q523-520 540-520t28.5-11.5Zm80-80Q660-623 660-640t-11.5-28.5Q637-680 620-680t-28.5 11.5Q580-657 580-640t11.5 28.5Q603-600 620-600t28.5-11.5Zm0 160Q660-463 660-480t-11.5-28.5Q637-520 620-520t-28.5 11.5Q580-497 580-480t11.5 28.5Q603-440 620-440t28.5-11.5Zm80-80Q740-543 740-560t-11.5-28.5Q717-600 700-600t-28.5 11.5Q660-577 660-560t11.5 28.5Q683-520 700-520t28.5-11.5Zm-367 63Q370-477 370-490v-40h40q13 0 21.5-8.5T440-560q0-13-8.5-21.5T410-590h-40v-40q0-13-8.5-21.5T340-660q-13 0-21.5 8.5T310-630v40h-40q-13 0-21.5 8.5T240-560q0 13 8.5 21.5T270-530h40v40q0 13 8.5 21.5T340-460q13 0 21.5-8.5ZM480-480Z"/></svg>
  </button>
  <div class="input-profile-dropdown" role="menu" aria-label="Input profile settings" hidden>
    <div class="profile-row">
      <span class="profile-label">View</span>
      <div class="profile-options" role="group" aria-label="View options">
        <button class="profile-endpoint view-third-person" type="button" data-dimension="view" data-value="third-person" aria-label="Third Person view" aria-pressed="true">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/></svg>
        </button>
        <button class="profile-endpoint view-top-down" type="button" data-dimension="view" data-value="top-down" aria-label="Top Down view" aria-pressed="false">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="m400-80-68-509q-5-36 19-63.5t60-27.5h138q36 0 60 27.5t19 63.5L560-80H400Zm80-640q-33 0-56.5-23.5T400-800q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800q0 33-23.5 56.5T480-720Z"/></svg>
        </button>
      </div>
    </div>
    <div class="profile-row">
      <span class="profile-label">Input</span>
      <div class="profile-options" role="group" aria-label="Input options">
        <button class="profile-endpoint input-wasd" type="button" data-dimension="input" data-value="wasd" aria-label="WASD input" aria-pressed="true">
          <svg class="wasd-icon" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor" aria-hidden="true">
            <g transform="translate(0 3)"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="9" y="10" width="6" height="6" rx="1"/><rect x="16" y="10" width="6" height="6" rx="1"/></g>
          </svg>
        </button>
        <button class="profile-endpoint input-click-to-move" type="button" data-dimension="input" data-value="click-to-move" aria-label="Click to Move input" aria-pressed="false">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M80-480v-80h120v80H80Zm136 222-56-58 84-84 58 56-86 86Zm28-382-84-84 56-58 86 86-58 56Zm476 480L530-350l-50 150-120-400 400 120-148 52 188 188-80 80ZM400-720v-120h80v120h-80Zm236 80-58-56 86-86 56 56-84 86Z"/></svg>
        </button>
      </div>
    </div>
  </div>
`;

export class InputProfileDropdown extends HTMLElement {
  static observedAttributes = ['active-profile', 'disabled'];

  #abortController = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
  }

  connectedCallback() {
    if (this.#abortController) return;
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    this.shadowRoot.querySelector('.input-profile-trigger').addEventListener('click', () => this.#toggleDropdown(), { signal });
    this.shadowRoot.querySelectorAll('.profile-endpoint').forEach((endpoint) => {
      endpoint.addEventListener('click', () => this.#requestProfile(endpoint.dataset.dimension, endpoint.dataset.value), { signal });
    });
    document.addEventListener('pointerdown', (event) => {
      if (!event.composedPath().includes(this)) this.#closeDropdown();
    }, { signal });
    document.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });
    this.#render();
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  attributeChangedCallback() {
    this.#render();
  }

  get activeProfile() {
    return normalizeControlProfileId(this.getAttribute('active-profile'));
  }

  set activeProfile(value) {
    this.setAttribute('active-profile', normalizeControlProfileId(value));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  #toggleDropdown() {
    if (this.disabled) return;
    const dropdown = this.shadowRoot.querySelector('.input-profile-dropdown');
    if (dropdown.hidden) this.#openDropdown();
    else this.#closeDropdown();
  }

  #openDropdown() {
    const dropdown = this.shadowRoot.querySelector('.input-profile-dropdown');
    dropdown.hidden = false;
    this.shadowRoot.querySelector('.input-profile-trigger').setAttribute('aria-expanded', 'true');
    this.shadowRoot.querySelector('[data-dimension="view"][aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  #closeDropdown({ restoreFocus = false } = {}) {
    const dropdown = this.shadowRoot.querySelector('.input-profile-dropdown');
    if (!dropdown) return;
    dropdown.hidden = true;
    const trigger = this.shadowRoot.querySelector('.input-profile-trigger');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  #handleKeydown(event) {
    const dropdown = this.shadowRoot.querySelector('.input-profile-dropdown');
    if (dropdown?.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#closeDropdown({ restoreFocus: true });
    } else if (event.key === 'Tab') {
      this.#closeDropdown();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const endpoint = event.composedPath()[0];
      const group = endpoint?.closest?.('.profile-options');
      if (!group) return;
      event.preventDefault();
      const endpoints = [...group.querySelectorAll('.profile-endpoint')];
      const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const nextEndpoint = endpoints[(endpoints.indexOf(endpoint) + offset + endpoints.length) % endpoints.length];
      nextEndpoint.focus({ preventScroll: true });
      nextEndpoint.click();
    }
  }

  #requestProfile(changedDimension, selectedValue) {
    if (this.disabled) return this.#render();
    const committed = getControlProfileOptions(this.activeProfile);
    if (committed[changedDimension] === selectedValue) return;
    const view = changedDimension === 'view'
      ? selectedValue
      : committed.view;
    const input = changedDimension === 'input'
      ? selectedValue
      : committed.input;
    const profileId = resolveControlProfileId(view, input);
    this.dispatchEvent(new CustomEvent('input-profile-change', {
      bubbles: true,
      composed: true,
      detail: { profileId, view, input }
    }));
    this.#render();
  }

  #render() {
    if (!this.shadowRoot) return;
    const state = getControlProfileOptions(this.activeProfile);
    const trigger = this.shadowRoot.querySelector('.input-profile-trigger');
    trigger.disabled = this.disabled;
    this.shadowRoot.querySelectorAll('.profile-endpoint').forEach((endpoint) => {
      endpoint.disabled = this.disabled;
      endpoint.setAttribute('aria-pressed', String(state[endpoint.dataset.dimension] === endpoint.dataset.value));
    });
    if (this.disabled) this.#closeDropdown();
  }
}

if (!customElements.get('input-profile-dropdown')) {
  customElements.define('input-profile-dropdown', InputProfileDropdown);
}