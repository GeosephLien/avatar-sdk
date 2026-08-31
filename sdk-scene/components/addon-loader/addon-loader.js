const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="${new URL('./addon-loader.css?v=20260830-addon-loader', import.meta.url).href}">
  <button class="addon-loader-trigger" type="button" aria-label="Manage addons" title="Manage addons" aria-haspopup="true" aria-expanded="false">
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M200-200h520v-184l45-22q16-8 25.5-22t9.5-32q0-17-9.5-31.5T765-514l-45-21v-185H528l-10-68q-3-22-19.5-37T460-840q-23 0-39.5 15T401-788l-10 68H200v86q56 21 88 68t32 106q0 60-32 107t-88 68v85Zm0 80q-34 0-57-23t-23-57v-152q48 0 84-30.5t36-77.5q0-46-36-76t-84-32v-152q0-33 23.5-56.5T200-800h122q7-51 46-85.5t92-34.5q52 0 91 34.5t47 85.5h122q33 0 56.5 23.5T800-720v134q36 18 58 52t22 74q0 41-22 75t-58 51v134q0 34-23.5 57T720-120H200Zm300-340Z"/></svg>
  </button>
  <div class="addon-loader-dropdown" aria-label="Addons" hidden>
    <div class="addon-list"></div>
  </div>
`;

function normalizeAddons(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const addons = [];
  for (const item of value) {
    const id = String(item?.id || '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    addons.push(Object.freeze({
      id,
      label: String(item?.label || '').trim() || id,
      installed: item?.installed === true
    }));
  }
  return Object.freeze(addons);
}

export class AddonLoader extends HTMLElement {
  static observedAttributes = ['disabled'];

  #abortController = null;
  #addons = Object.freeze([]);
  #pendingTargets = new Map();

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
  }

  connectedCallback() {
    if (this.#abortController) return;
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    this.shadowRoot.querySelector('.addon-loader-trigger').addEventListener('click', () => this.#toggleDropdown(), { signal });
    this.shadowRoot.querySelector('.addon-list').addEventListener('change', (event) => this.#requestToggle(event), { signal });
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

  get addons() {
    return this.#addons;
  }

  set addons(value) {
    this.#addons = normalizeAddons(value);
    const availableIds = new Set(this.#addons.map((addon) => addon.id));
    for (const [id, target] of this.#pendingTargets) {
      const addon = this.#addons.find((candidate) => candidate.id === id);
      if (!availableIds.has(id) || addon.installed === target) this.#pendingTargets.delete(id);
    }
    this.#render();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  setAddonState(addonId, state = {}) {
    const id = String(addonId || '').trim();
    const index = this.#addons.findIndex((addon) => addon.id === id);
    if (index < 0) return false;
    const next = [...this.#addons];
    next[index] = Object.freeze({ ...next[index], installed: state.installed === true });
    this.#addons = Object.freeze(next);
    if (state.pending === true) this.#pendingTargets.set(id, state.installed === true);
    else this.#pendingTargets.delete(id);
    this.#render();
    return true;
  }

  #toggleDropdown() {
    if (this.disabled) return;
    const dropdown = this.shadowRoot.querySelector('.addon-loader-dropdown');
    if (dropdown.hidden) this.#openDropdown();
    else this.#closeDropdown();
  }

  #openDropdown() {
    const dropdown = this.shadowRoot.querySelector('.addon-loader-dropdown');
    dropdown.hidden = false;
    this.shadowRoot.querySelector('.addon-loader-trigger').setAttribute('aria-expanded', 'true');
    const focusTarget = this.shadowRoot.querySelector('.addon-switch input') || dropdown;
    focusTarget.focus({ preventScroll: true });
  }

  #closeDropdown({ restoreFocus = false } = {}) {
    const dropdown = this.shadowRoot.querySelector('.addon-loader-dropdown');
    if (!dropdown) return;
    dropdown.hidden = true;
    const trigger = this.shadowRoot.querySelector('.addon-loader-trigger');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  #handleKeydown(event) {
    const dropdown = this.shadowRoot.querySelector('.addon-loader-dropdown');
    if (dropdown?.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#closeDropdown({ restoreFocus: true });
    } else if (event.key === 'Tab') {
      this.#closeDropdown();
    }
  }

  #requestToggle(event) {
    const input = event.target.closest?.('input[data-addon-id]');
    if (!input) return;
    const addonId = input.dataset.addonId;
    const addon = this.#addons.find((candidate) => candidate.id === addonId);
    if (!addon || this.disabled || this.#pendingTargets.has(addonId)) return this.#render();
    const installed = input.checked;
    this.#pendingTargets.set(addonId, installed);
    this.#render();
    this.dispatchEvent(new CustomEvent('addon-toggle-request', {
      bubbles: true,
      composed: true,
      detail: { addonId, installed }
    }));
  }

  #render() {
    if (!this.shadowRoot) return;
    const trigger = this.shadowRoot.querySelector('.addon-loader-trigger');
    const list = this.shadowRoot.querySelector('.addon-list');
    const focusedId = this.shadowRoot.activeElement?.dataset?.addonId || '';
    trigger.disabled = this.disabled;
    list.replaceChildren();

    if (this.#addons.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'addon-empty';
      empty.textContent = 'No addons available';
      list.appendChild(empty);
    } else {
      for (const addon of this.#addons) {
        const row = document.createElement('div');
        row.className = 'addon-row';
        const label = document.createElement('span');
        label.className = 'addon-label';
        label.textContent = addon.label;
        const switchLabel = document.createElement('label');
        switchLabel.className = 'addon-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.role = 'switch';
        input.dataset.addonId = addon.id;
        input.checked = addon.installed;
        input.disabled = this.disabled || this.#pendingTargets.has(addon.id);
        input.setAttribute('aria-label', `${addon.installed ? 'Uninstall' : 'Install'} ${addon.label}`);
        const track = document.createElement('span');
        track.className = 'switch-track';
        track.setAttribute('aria-hidden', 'true');
        switchLabel.append(input, track);
        row.append(label, switchLabel);
        list.appendChild(row);
      }
    }

    if (focusedId) this.shadowRoot.querySelector(`input[data-addon-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    if (this.disabled) this.#closeDropdown();
  }
}

if (!customElements.get('addon-loader')) {
  customElements.define('addon-loader', AddonLoader);
}