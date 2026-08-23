import { createCreatorFrameLayout } from './creator-frame-layout.js';
import { embedSession } from '../../services/embed-session.js';
import { avatarStore } from '../../services/avatar-store.js';
import { createSdkAssetUrl, getAvatarSdkConfig } from '../../sdk-config.js';
import {
  isTrustedCreatorMessage,
  normalizeAvatarDescriptor,
  resolveCreatorUrl
} from './avatar-creator-contract.js';

const config = getAvatarSdkConfig();
const DEFAULT_THUMBNAIL_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.png', config)}?v=20260821-cors`;

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="${new URL('./avatar-creator-entry.css', import.meta.url).href}">
  <section class="avatar-control" aria-label="Avatar actions">
    <button class="avatar-thumbnail" type="button" aria-label="Open avatar menu" aria-expanded="false" aria-controls="avatar-menu">
      <img class="avatar-thumbnail-image" alt="" decoding="async">
    </button>
    <div id="avatar-menu" class="avatar-menu" hidden>
      <button class="create-avatar-button" type="button"><strong>Create New</strong></button>
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
        <img src="${new URL('./Icon_close.svg', import.meta.url).href}" alt="">
      </button>
    </section>
  </div>
`;

function createRequestId() {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `creator-${Date.now()}-${suffix}`;
}

class AvatarCreatorEntry extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.connected = false;
    this.creatorLaunchToken = '';
    this.creatorRequestId = '';
    this.creatorBusy = false;
    this.creatorLaunchLoading = false;
    this.opened = false;
    this.currentAvatar = null;
    this.creatorOrigin = '';
    this.handleThumbnailClick = () => this.setAvatarMenu(this.elements.avatarMenu.hidden);
    this.handleCreateClick = () => {
      this.setAvatarMenu(false);
      this.openCreator();
    };
    this.handleCloseClick = () => this.closeCreator();
    this.handleSaveCloseClick = () => this.teardownCreator();
    this.handleDocumentClick = (event) => {
      if (!event.composedPath().includes(this)) this.setAvatarMenu(false);
    };
    this.handleDocumentKeydown = (event) => {
      if (event.key !== 'Escape') return;
      if (this.opened) this.closeCreator();
      else this.setAvatarMenu(false);
    };
    this.handleWindowMessage = (event) => this.onWindowMessage(event);
  }

  connectedCallback() {
    if (this.connected) return;
    this.connected = true;
    this.elements = {
      avatarThumbnail: this.shadowRoot.querySelector('.avatar-thumbnail'),
      avatarThumbnailImage: this.shadowRoot.querySelector('.avatar-thumbnail-image'),
      avatarMenu: this.shadowRoot.querySelector('.avatar-menu'),
      createAvatarButton: this.shadowRoot.querySelector('.create-avatar-button'),
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
    this.elements.avatarThumbnail.addEventListener('click', this.handleThumbnailClick);
    this.elements.createAvatarButton.addEventListener('click', this.handleCreateClick);
    this.elements.creatorCloseButton.addEventListener('click', this.handleCloseClick);
    this.elements.saveAvatarClose.addEventListener('click', this.handleSaveCloseClick);
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleDocumentKeydown);
    window.addEventListener('message', this.handleWindowMessage);
    this.renderAvatar();
  }

  disconnectedCallback() {
    if (!this.connected) return;
    this.connected = false;
    this.elements.avatarThumbnail.removeEventListener('click', this.handleThumbnailClick);
    this.elements.createAvatarButton.removeEventListener('click', this.handleCreateClick);
    this.elements.creatorCloseButton.removeEventListener('click', this.handleCloseClick);
    this.elements.saveAvatarClose.removeEventListener('click', this.handleSaveCloseClick);
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
    window.removeEventListener('message', this.handleWindowMessage);
    this.teardownCreator({ restoreFocus: false });
  }

  set avatar(value) {
    this.currentAvatar = value && typeof value === 'object' ? value : null;
    this.renderAvatar();
  }

  get avatar() {
    return this.currentAvatar;
  }

  get isOpen() {
    return this.opened;
  }

  renderAvatar() {
    if (!this.elements) return;
    this.elements.avatarThumbnailImage.src = this.currentAvatar?.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
  }

  setAvatarMenu(open) {
    this.elements.avatarMenu.hidden = !open;
    this.elements.avatarThumbnail.setAttribute('aria-expanded', String(open));
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
      this.creatorLaunchToken = await embedSession.createLaunchToken();
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

  teardownCreator({ restoreFocus = true } = {}) {
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
    this.creatorLaunchToken = '';
    this.creatorRequestId = '';
    this.creatorOrigin = '';
    this.creatorBusy = false;
    if (wasOpen) this.emit('avatar-creator-close');
    if (restoreFocus && this.connected) this.elements.avatarThumbnail.focus();
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
    this.showSavingAvatar();
    try {
      const savedAvatar = await avatarStore.saveAvatar({ vrm, thumbnail });
      const avatar = normalizeAvatarDescriptor(savedAvatar);
      if (!avatar.vrmUrl || !avatar.thumbnailUrl) throw new Error('Saved avatar is incomplete.');
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
      this.postToCreator('init', {
        launchToken: this.creatorLaunchToken,
        apiBase: embedSession.apiBase,
        contentMode: 'export-host',
        uiMode: 'modal',
        autoStart: true,
        locale: document.documentElement.lang || 'en'
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
      this.emit('avatar-creator-notice', { message: message.payload?.detail || message.payload?.message || 'Creator authorization failed.' });
    } else if (message.type === 'ac3:close-request') {
      this.closeCreator();
    }
  }
}

if (!customElements.get('avatar-creator-entry')) {
  customElements.define('avatar-creator-entry', AvatarCreatorEntry);
}
