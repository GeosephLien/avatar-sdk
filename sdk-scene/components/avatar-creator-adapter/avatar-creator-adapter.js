import { createCreatorFrameLayout } from './creator-frame-layout.js';
import { createAvatarArchive, triggerAvatarDownload } from './avatar-download.js';
import { avatarCreatorStore, validateAvatarCreatorStore } from './avatar-creator-store/avatar-creator-store.js';
import { createSdkAssetUrl, getAvatarSdkConfig } from '../../sdk-config.js';
import {
  isTrustedCreatorMessage,
  normalizeAvatarDescriptor,
  resolveCreatorUrl
} from './avatar-creator-contract.js';
import { normalizeCreatorState } from './creator-state.js';

const config = getAvatarSdkConfig();
const DEFAULT_THUMBNAIL_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.png', config)}?v=20260821-cors`;

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="${new URL('./avatar-creator-adapter.css?v=20260830-avatar-download', import.meta.url).href}">
  <section class="avatar-control" aria-label="Avatar actions">
    <img class="avatar-thumbnail" alt="" decoding="async">
    <div class="avatar-menu">
      <button class="avatar-dropdown-btn" type="button" aria-label="Avatar menu" title="Avatar menu" aria-haspopup="menu" aria-expanded="false">
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"/></svg>
      </button>
      <div class="avatar-dropdown" role="menu" aria-label="Avatar actions" hidden>
        <button class="create-avatar-button" type="button" role="menuitem">Create Avatar</button>
        <button class="download-avatar-button" type="button" role="menuitem" disabled>Download Avatar</button>
      </div>
    </div>
  </section>
  <div class="creator-modal" hidden aria-hidden="true">
    <div class="creator-backdrop"></div>
    <div class="launch-loading-panel" role="status" aria-live="polite" aria-labelledby="launch-loading-title" hidden>
      <h2 id="launch-loading-title">Launching Avatar Creator</h2>
      <div class="launch-loading-track" aria-hidden="true"><div class="launch-loading-progress-bar"></div></div>
      <p class="launch-loading-progress-text">Loading... 0％</p>
    </div>
    <div class="save-avatar" role="status" aria-live="polite" aria-labelledby="save-avatar-title" hidden>
      <h2 id="save-avatar-title" class="save-avatar-title">Saving Avatar</h2>
      <p class="save-avatar-message">Your avatar will be ready soon.</p>
      <div class="save-avatar-track" aria-hidden="true"><div class="save-avatar-progress-bar"></div></div>
      <button class="save-avatar-close" type="button" hidden>Close</button>
    </div>
    <section class="creator-panel is-loading" role="dialog" aria-modal="true" aria-label="AC3 Avatar Creator" aria-hidden="true">
      <iframe class="creator-frame" title="AC3 Avatar Creator" allow="clipboard-read; clipboard-write" referrerpolicy="strict-origin"></iframe>
      <button class="creator-close-button" type="button" aria-label="Close Creator" title="Close Creator">
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
      </button>
    </section>
  </div>
`;

function createRequestId() {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `creator-${Date.now()}-${suffix}`;
}

class AvatarCreatorAdapter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.connected = false;
    this.creatorRequestId = '';
    this.creatorBusy = false;
    this.creatorLaunchLoading = false;
    this.opened = false;
    this.currentAvatar = null;
    this.avatarCreatorStore = avatarCreatorStore;
    this.creatorOrigin = '';
    this.downloadAvailable = null;
    this.downloadBusy = false;
    this.downloadStateRequest = 0;
    this.handleDropdownClick = () => this.setDropdownOpen(this.elements.avatarDropdown.hidden);
    this.handleCreateClick = () => {
      this.setDropdownOpen(false);
      this.openCreator();
    };
    this.handleDownloadClick = () => {
      this.setDropdownOpen(false);
      this.downloadAvatar().catch(() => {});
    };
    this.handleCloseClick = () => this.closeCreator();
    this.handleSaveCloseClick = () => this.teardownCreator();
    this.handleDocumentPointerDown = (event) => {
      if (!event.composedPath().includes(this)) this.setDropdownOpen(false);
    };
    this.handleDocumentKeydown = (event) => {
      if (event.key === 'Escape' && this.opened) {
        this.closeCreator();
      } else if (event.key === 'Escape' && !this.elements.avatarDropdown.hidden) {
        event.preventDefault();
        this.setDropdownOpen(false, { restoreFocus: true });
      } else if (event.key === 'Tab' && !this.elements.avatarDropdown.hidden) {
        this.setDropdownOpen(false);
      }
    };
    this.handleWindowMessage = (event) => this.onWindowMessage(event);
  }

  connectedCallback() {
    if (this.connected) return;
    this.connected = true;
    this.elements = {
      avatarThumbnail: this.shadowRoot.querySelector('.avatar-thumbnail'),
      avatarDropdownButton: this.shadowRoot.querySelector('.avatar-dropdown-btn'),
      avatarDropdown: this.shadowRoot.querySelector('.avatar-dropdown'),
      createAvatarButton: this.shadowRoot.querySelector('.create-avatar-button'),
      downloadAvatarButton: this.shadowRoot.querySelector('.download-avatar-button'),
      creatorModal: this.shadowRoot.querySelector('.creator-modal'),
      creatorBackdrop: this.shadowRoot.querySelector('.creator-backdrop'),
      creatorCloseButton: this.shadowRoot.querySelector('.creator-close-button'),
      launchLoadingPanel: this.shadowRoot.querySelector('.launch-loading-panel'),
      launchLoadingProgressBar: this.shadowRoot.querySelector('.launch-loading-progress-bar'),
      launchLoadingProgressText: this.shadowRoot.querySelector('.launch-loading-progress-text'),
      saveAvatar: this.shadowRoot.querySelector('.save-avatar'),
      saveAvatarTitle: this.shadowRoot.querySelector('.save-avatar-title'),
      saveAvatarMessage: this.shadowRoot.querySelector('.save-avatar-message'),
      saveAvatarTrack: this.shadowRoot.querySelector('.save-avatar-track'),
      saveAvatarClose: this.shadowRoot.querySelector('.save-avatar-close'),
      creatorPanel: this.shadowRoot.querySelector('.creator-panel'),
      creatorFrame: this.shadowRoot.querySelector('.creator-frame')
    };
    this.frameLayout = createCreatorFrameLayout({ panel: this.elements.creatorPanel });
    this.elements.avatarDropdownButton.addEventListener('click', this.handleDropdownClick);
    this.elements.createAvatarButton.addEventListener('click', this.handleCreateClick);
    this.elements.downloadAvatarButton.addEventListener('click', this.handleDownloadClick);
    this.elements.creatorCloseButton.addEventListener('click', this.handleCloseClick);
    this.elements.saveAvatarClose.addEventListener('click', this.handleSaveCloseClick);
    document.addEventListener('pointerdown', this.handleDocumentPointerDown);
    document.addEventListener('keydown', this.handleDocumentKeydown);
    window.addEventListener('message', this.handleWindowMessage);
    this.renderAvatar();
    this.refreshDownloadState();
  }

  disconnectedCallback() {
    if (!this.connected) return;
    this.connected = false;
    this.downloadStateRequest += 1;
    this.elements.avatarDropdownButton.removeEventListener('click', this.handleDropdownClick);
    this.elements.createAvatarButton.removeEventListener('click', this.handleCreateClick);
    this.elements.downloadAvatarButton.removeEventListener('click', this.handleDownloadClick);
    this.elements.creatorCloseButton.removeEventListener('click', this.handleCloseClick);
    this.elements.saveAvatarClose.removeEventListener('click', this.handleSaveCloseClick);
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
    window.removeEventListener('message', this.handleWindowMessage);
    this.teardownCreator();
  }

  set avatar(value) {
    this.currentAvatar = value && typeof value === 'object' ? value : null;
    this.renderAvatar();
  }

  get avatar() {
    return this.currentAvatar;
  }

  set store(value) {
    this.avatarCreatorStore = validateAvatarCreatorStore(value);
    this.refreshDownloadState();
  }

  get store() {
    return this.avatarCreatorStore;
  }

  get isOpen() {
    return this.opened;
  }

  renderAvatar() {
    if (!this.elements) return;
    this.elements.avatarThumbnail.src = this.currentAvatar?.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
  }

  setDropdownOpen(open, { restoreFocus = false } = {}) {
    if (!this.elements) return;
    this.elements.avatarDropdown.hidden = !open;
    this.elements.avatarDropdownButton.setAttribute('aria-expanded', String(open));
    if (open) {
      this.refreshDownloadState();
      this.elements.createAvatarButton.focus({ preventScroll: true });
    } else if (restoreFocus) {
      this.elements.avatarDropdownButton.focus({ preventScroll: true });
    }
  }

  renderDownloadState() {
    if (!this.elements) return;
    this.elements.downloadAvatarButton.disabled = !this.downloadAvailable || this.downloadBusy;
  }

  async canDownloadAvatar() {
    if (typeof this.store?.getDownloadPayload !== 'function') return false;
    try {
      return Boolean(await this.store.getDownloadPayload());
    } catch {
      return false;
    }
  }

  async refreshDownloadState() {
    const request = ++this.downloadStateRequest;
    const available = await this.canDownloadAvatar();
    if (request !== this.downloadStateRequest) return available;
    const changed = available !== this.downloadAvailable;
    this.downloadAvailable = available;
    this.renderDownloadState();
    if (changed) this.emit('avatar-download-state-change', { available });
    return available;
  }

  async createAvatarArchive() {
    if (typeof this.store?.getDownloadPayload !== 'function') {
      throw new Error('This Avatar store does not support downloads.');
    }
    const payload = await this.store.getDownloadPayload();
    if (!payload) throw new Error('No persisted Avatar is available to download.');
    return createAvatarArchive(payload);
  }

  async downloadAvatar() {
    if (this.downloadBusy) return null;
    this.downloadBusy = true;
    this.renderDownloadState();
    this.emit('avatar-download-start');
    try {
      const archive = await this.createAvatarArchive();
      triggerAvatarDownload(archive);
      this.emit('avatar-download-complete', { fileName: archive.fileName });
      return archive;
    } catch (error) {
      this.emit('avatar-download-error', {
        error,
        message: error.message || 'Unable to download Avatar.'
      });
      throw error;
    } finally {
      this.downloadBusy = false;
      this.refreshDownloadState();
    }
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  createMessage(type, payload = {}) {
    return { type: `ac3:${type}`, protocol: 'ac3', version: '1.0', requestId: this.creatorRequestId, payload };
  }

  postToCreator(type, payload) {
    if (!this.elements.creatorFrame.contentWindow || !this.creatorOrigin) return false;
    this.elements.creatorFrame.contentWindow.postMessage(this.createMessage(type, payload), this.creatorOrigin);
    return true;
  }

  async openCreator() {
    if (this.creatorBusy || this.opened) return;
    this.setDropdownOpen(false);
    this.creatorBusy = true;
    this.creatorLaunchLoading = true;
    this.opened = true;
    this.setAttribute('open', '');
    this.elements.creatorModal.hidden = false;
    this.elements.creatorModal.setAttribute('aria-hidden', 'false');
    this.showCreatorLoading(0);
    this.frameLayout.start();
    this.emit('avatar-creator-open');
    try {
      const creatorUrl = resolveCreatorUrl(this.getAttribute('creator-src') || config.creatorUrl, window.location.href);
      this.creatorOrigin = creatorUrl.origin;
      this.creatorRequestId = createRequestId();
      this.elements.creatorFrame.src = creatorUrl.href;
    } catch (error) {
      this.creatorBusy = false;
      this.teardownCreator();
      this.emit('avatar-creator-notice', { message: error.message || 'Unable to open AC3 Creator.' });
    }
  }

  closeCreator() {
    if (this.creatorBusy && !window.confirm('Your avatar is still being prepared. Close the creator?')) return;
    this.teardownCreator();
  }

  teardownCreator() {
    if (!this.elements) return;
    const wasOpen = this.opened;
    this.opened = false;
    this.removeAttribute('open');
    this.creatorLaunchLoading = false;
    this.frameLayout?.stop();
    this.elements.creatorModal.hidden = true;
    this.elements.creatorModal.setAttribute('aria-hidden', 'true');
    this.elements.creatorFrame.removeAttribute('src');
    this.elements.launchLoadingPanel.hidden = true;
    this.elements.saveAvatar.hidden = true;
    this.elements.launchLoadingProgressBar.style.width = '0%';
    this.elements.launchLoadingProgressText.textContent = 'Loading... 0％';
    this.elements.creatorPanel.classList.add('is-loading');
    this.elements.creatorPanel.setAttribute('aria-hidden', 'true');
    this.elements.creatorPanel.hidden = false;
    this.elements.creatorCloseButton.hidden = false;
    this.creatorRequestId = '';
    this.creatorOrigin = '';
    this.creatorBusy = false;
    if (wasOpen) this.emit('avatar-creator-close');
  }

  showCreatorLoading(progress = 0) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    this.elements.launchLoadingPanel.hidden = false;
    this.elements.launchLoadingProgressBar.style.width = `${percent}%`;
    this.elements.launchLoadingProgressText.textContent = `Loading... ${percent}％`;
    this.elements.creatorPanel.classList.add('is-loading');
    this.elements.creatorPanel.setAttribute('aria-hidden', 'true');
    this.elements.creatorPanel.hidden = false;
    this.elements.creatorCloseButton.hidden = false;
  }

  showLoadedCreator() {
    this.creatorLaunchLoading = false;
    this.elements.launchLoadingPanel.hidden = true;
    this.elements.saveAvatar.hidden = true;
    this.elements.creatorPanel.classList.remove('is-loading');
    this.elements.creatorPanel.setAttribute('aria-hidden', 'false');
    this.elements.creatorCloseButton.hidden = false;
    this.elements.creatorCloseButton.focus();
  }

  showSavingAvatar() {
    this.elements.launchLoadingPanel.hidden = true;
    this.elements.creatorPanel.hidden = true;
    this.elements.creatorPanel.classList.add('is-loading');
    this.elements.creatorPanel.setAttribute('aria-hidden', 'true');
    this.elements.saveAvatar.hidden = false;
    this.elements.saveAvatarTitle.textContent = 'Saving Avatar';
    this.elements.saveAvatarMessage.textContent = 'Your avatar will be ready soon.';
    this.elements.saveAvatarTrack.hidden = false;
    this.elements.saveAvatarClose.hidden = true;
    this.elements.creatorCloseButton.hidden = true;
    this.frameLayout.stop();
    this.elements.creatorFrame.removeAttribute('src');
  }

  showSaveError(message) {
    this.elements.launchLoadingPanel.hidden = true;
    this.elements.creatorPanel.hidden = true;
    this.elements.saveAvatar.hidden = false;
    this.elements.saveAvatarTitle.textContent = 'Something is Wrong';
    this.elements.saveAvatarMessage.textContent = message || 'Please refresh the page and try again.';
    this.elements.saveAvatarTrack.hidden = true;
    this.elements.saveAvatarClose.hidden = false;
    this.elements.creatorCloseButton.hidden = false;
    this.elements.saveAvatarClose.focus();
  }

  async saveExport(payload) {
    const vrmBuffer = payload?.vrmBuffer;
    const thumbnailBuffer = payload?.thumbnailBuffer;
    if (!(vrmBuffer instanceof ArrayBuffer)) throw new Error('AC3 did not return a VRM file.');
    if (!(thumbnailBuffer instanceof ArrayBuffer)) throw new Error('AC3 did not return an avatar thumbnail.');
    this.creatorBusy = true;
    const fileName = String(payload.fileName || 'avatar.vrm').replace(/[^A-Za-z0-9._-]+/g, '-') || 'avatar.vrm';
    const vrm = new File([vrmBuffer], fileName, { type: 'model/vrm' });
    const thumbnail = new File([thumbnailBuffer], 'thumbnail.png', { type: payload.thumbnailContentType || 'image/png' });
    let creatorState = null;
    try {
      creatorState = normalizeCreatorState(payload.creatorState);
    } catch (error) {
      console.warn('Ignoring invalid Creator state from export.', error);
    }
    this.showSavingAvatar();
    try {
      const savedAvatar = await this.store.saveAvatar({ vrm, thumbnail, ...(creatorState ? { creatorState } : {}) });
      const avatar = normalizeAvatarDescriptor(savedAvatar);
      if (!avatar.vrmUrl || !avatar.thumbnailUrl) throw new Error('Saved avatar is incomplete.');
      await this.refreshDownloadState();
      this.teardownCreator();
      this.emit('avatar-created', { avatar });
      this.emit('avatar-creator-notice', { message: 'Avatar created' });
    } catch (error) {
      this.creatorBusy = false;
      this.showSaveError(error.message || 'Unable to save avatar.');
    }
  }

  onWindowMessage(event) {
    const message = event.data || {};
    if (!isTrustedCreatorMessage(event, this.elements.creatorFrame.contentWindow, this.creatorOrigin, this.creatorRequestId)) return;
    if (message.type === 'ac3:ready') {
      let creatorState = null;
      try {
        creatorState = normalizeCreatorState(this.currentAvatar?.creatorState);
      } catch (error) {
        console.warn('Ignoring invalid saved Creator state.', error);
      }
      this.postToCreator('init', {
        autoStart: true,
        locale: document.documentElement.lang || 'en',
        ...(creatorState ? { creatorState } : {})
      });
    } else if (message.type === 'ac3:init-ack') {
      this.creatorBusy = false;
    } else if (message.type === 'ac3:launch-progress' && this.creatorLaunchLoading) {
      this.showCreatorLoading(message.payload?.progress);
    } else if (message.type === 'ac3:unity-started') {
      this.showLoadedCreator();
    } else if (message.type === 'ac3:avatar-exported') {
      this.saveExport(message.payload).catch((error) => {
        this.creatorBusy = false;
        this.showSaveError(error.message || 'Unable to save avatar.');
      });
    } else if (message.type === 'ac3:blocked' || message.type === 'ac3:error') {
      this.creatorBusy = false;
      this.emit('avatar-creator-notice', { message: message.payload?.detail || message.payload?.message || 'Creator failed to start.' });
    } else if (message.type === 'ac3:close-request') {
      this.closeCreator();
    }
  }
}

if (!customElements.get('avatar-creator-adapter')) {
  customElements.define('avatar-creator-adapter', AvatarCreatorAdapter);
}
