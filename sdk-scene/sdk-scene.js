import { createSdkAssetUrl, getAvatarSdkConfig } from './sdk-config.js';
import { sdkSceneAddonDefinitions } from './addons/sdk-scene-addons.js?v=20260831-white-projectile';
import './components/addon-loader/addon-loader.js?v=20260830-addon-loader';
import './components/input-profile-dropdown/input-profile-dropdown.js?v=20260831-gamepad-trigger';

const config = getAvatarSdkConfig();

const PUBLIC_ASSET_REVISION = '20260821-cors';
const DEFAULT_VRM_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.vrm', config)}?v=${PUBLIC_ASSET_REVISION}`;
const DEFAULT_THUMBNAIL_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.png', config)}?v=${PUBLIC_ASSET_REVISION}`;

const elements = {
  creatorAdapter: document.querySelector('avatar-creator-adapter'),
  addonLoader: document.querySelector('addon-loader'),
  inputProfileDropdown: document.querySelector('input-profile-dropdown'),
  addonHudRoot: document.querySelector('.addon-hud-slot'),
  addonOverlayRoot: document.querySelector('.addon-overlay-layer')
};
const avatarCreatorStore = elements.creatorAdapter?.store;

let sceneController = null;
let currentLocalAvatar = null;
let unsubscribeAddonRegistry = null;

function syncAddonLoader(snapshot) {
  if (!elements.addonLoader) return;
  const installedIds = new Set(snapshot.installedIds);
  elements.addonLoader.addons = snapshot.availableAddons.map((addon) => ({
    id: addon.id,
    label: addon.label,
    installed: installedIds.has(addon.id)
  }));
}

async function applyCustomAvatar(avatar) {
  if (!(avatar && avatar.vrmUrl && avatar.thumbnailUrl)) return;
  const previousAvatar = currentLocalAvatar;
  try {
    await sceneController.loadAvatarFromUrl(avatar.vrmUrl, {
      key: 'custom-avatar',
      displayName: String(avatar.fileName || 'My Avatar').replace(/\.vrm$/i, '')
    });
    currentLocalAvatar = avatar;
    if (elements.creatorAdapter) elements.creatorAdapter.avatar = avatar;
    if (previousAvatar && previousAvatar !== avatar) avatarCreatorStore.releaseAvatar(previousAvatar);
  } catch (error) {
    if (avatar !== previousAvatar) avatarCreatorStore.releaseAvatar(avatar);
    throw error;
  }
}

async function restoreCustomAvatar() {
  if (!avatarCreatorStore) return;
  try {
    const avatar = await avatarCreatorStore.getAvatar();
    if (avatar) await applyCustomAvatar(avatar);
  } catch (error) {
    console.warn('Unable to restore the browser avatar:', error);
  }
}

async function bootstrapScene() {
  const { createVrmScene } = await import('./runtime/three-scene.js?v=20260831-shadow-30m');
  sceneController = await createVrmScene({
    canvas: document.getElementById('landing-scene-canvas'),
    addonHudRoot: elements.addonHudRoot,
    addonOverlayRoot: elements.addonOverlayRoot,
    animationBaseUrl: createSdkAssetUrl('animations/v1/', config)
  });
  try {
    sceneController.addons.registerAll(sdkSceneAddonDefinitions);
    for (const definition of sdkSceneAddonDefinitions) {
      if (definition.defaultEnabled === true) sceneController.addons.install(definition.id);
    }
  } catch (error) {
    sceneController.dispose();
    sceneController = null;
    throw error;
  }
  sceneController.start();
  if (elements.creatorAdapter?.isOpen) sceneController.pause();
  if (elements.addonLoader) {
    unsubscribeAddonRegistry = sceneController.addons.subscribe(syncAddonLoader);
    elements.addonLoader.disabled = false;
  }
  if (elements.inputProfileDropdown) {
    elements.inputProfileDropdown.activeProfile = sceneController.activeControlProfile;
    elements.inputProfileDropdown.disabled = false;
  }
  await sceneController.loadAvatarFromUrl(DEFAULT_VRM_URL, {
    key: 'default-avatar',
    displayName: 'Default Avatar'
  });
  sceneController.setJoystickVisible(true);
  if (elements.creatorAdapter) elements.creatorAdapter.avatar = { thumbnailUrl: DEFAULT_THUMBNAIL_URL };
  await restoreCustomAvatar();
}

elements.creatorAdapter?.addEventListener('avatar-creator-open', () => sceneController?.pause());
elements.creatorAdapter?.addEventListener('avatar-creator-close', () => sceneController?.resume());
elements.creatorAdapter?.addEventListener('avatar-created', (event) => {
  applyCustomAvatar(event.detail?.avatar).catch((error) => console.error('Unable to load avatar:', error));
});
elements.creatorAdapter?.addEventListener('avatar-creator-notice', (event) => {
  console.info('Avatar Creator:', event.detail?.message);
});
elements.addonLoader?.addEventListener('addon-toggle-request', (event) => {
  if (!sceneController) return;
  const addonId = String(event.detail?.addonId || '');
  const installed = event.detail?.installed === true;
  if (!sceneController.addons.has(addonId)) return;
  try {
    if (installed) sceneController.addons.install(addonId);
    else sceneController.addons.uninstall(addonId);
    elements.addonLoader.setAddonState(addonId, { installed: sceneController.addons.isInstalled(addonId) });
  } catch (error) {
    console.error(`Unable to ${installed ? 'install' : 'uninstall'} addon "${addonId}":`, error);
    elements.addonLoader.setAddonState(addonId, { installed: sceneController.addons.isInstalled(addonId) });
  }
});
elements.inputProfileDropdown?.addEventListener('input-profile-change', (event) => {
  if (!sceneController) return;
  try {
    const profileId = sceneController.setControlProfile(event.detail?.profileId);
    elements.inputProfileDropdown.activeProfile = profileId;
  } catch (error) {
    console.error('Unable to switch camera and control profile:', error);
    elements.inputProfileDropdown.activeProfile = sceneController.activeControlProfile;
  }
});
window.addEventListener('pagehide', () => {
  unsubscribeAddonRegistry?.();
  unsubscribeAddonRegistry = null;
  avatarCreatorStore?.releaseAvatar(currentLocalAvatar);
}, { once: true });

bootstrapScene().catch((error) => {
  console.error('Unable to start the scene:', error);
});
