import { avatarStore } from './services/avatar-store.js';
import { createSdkAssetUrl, getAvatarSdkConfig } from './sdk-config.js';
import { sdkSceneAddonDefinitions } from './addons/sdk-scene-addons.js?v=20260828-scene-menu';
import './components/sdk-scene-menu/sdk-scene-menu.js?v=20260828-scene-menu';

const config = getAvatarSdkConfig();

const PUBLIC_ASSET_REVISION = '20260821-cors';
const DEFAULT_VRM_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.vrm', config)}?v=${PUBLIC_ASSET_REVISION}`;
const DEFAULT_THUMBNAIL_URL = `${createSdkAssetUrl('avatars/default/v1/default-avatar.png', config)}?v=${PUBLIC_ASSET_REVISION}`;

const elements = {
  creatorEntry: document.querySelector('avatar-creator-entry'),
  sceneMenu: document.querySelector('sdk-scene-menu'),
  addonHudRoot: document.querySelector('.addon-hud-slot'),
  addonOverlayRoot: document.querySelector('.addon-overlay-layer')
};

let sceneController = null;
let currentLocalAvatar = null;

async function applyCustomAvatar(avatar) {
  if (!(avatar && avatar.vrmUrl && avatar.thumbnailUrl)) return;
  const previousAvatar = currentLocalAvatar;
  try {
    await sceneController.loadAvatarFromUrl(avatar.vrmUrl, {
      key: 'custom-avatar',
      displayName: String(avatar.fileName || 'My Avatar').replace(/\.vrm$/i, '')
    });
    currentLocalAvatar = avatar;
    if (elements.creatorEntry) elements.creatorEntry.avatar = avatar;
    if (previousAvatar && previousAvatar !== avatar) avatarStore.releaseAvatar(previousAvatar);
  } catch (error) {
    if (avatar !== previousAvatar) avatarStore.releaseAvatar(avatar);
    throw error;
  }
}

async function restoreCustomAvatar() {
  try {
    const avatar = await avatarStore.getAvatar();
    if (avatar) await applyCustomAvatar(avatar);
  } catch (error) {
    console.warn('Unable to restore the browser avatar:', error);
  }
}

async function bootstrapScene() {
  const { createVrmScene } = await import('./runtime/three-scene.js?v=20260828-addon-ui-slots');
  sceneController = await createVrmScene({
    canvas: document.getElementById('landing-scene-canvas'),
    addonHudRoot: elements.addonHudRoot,
    addonOverlayRoot: elements.addonOverlayRoot,
    animationBaseUrl: createSdkAssetUrl('animations/v1/', config)
  });
  try {
    sceneController.addons.registerAll(sdkSceneAddonDefinitions);
    sceneController.addons.installAll();
  } catch (error) {
    sceneController.dispose();
    sceneController = null;
    throw error;
  }
  sceneController.start();
  if (elements.creatorEntry?.isOpen) sceneController.pause();
  await sceneController.loadAvatarFromUrl(DEFAULT_VRM_URL, {
    key: 'default-avatar',
    displayName: 'Default Avatar'
  });
  sceneController.setJoystickVisible(true);
  if (elements.sceneMenu) elements.sceneMenu.activeProfile = sceneController.activeControlProfile;
  if (elements.creatorEntry) elements.creatorEntry.avatar = { thumbnailUrl: DEFAULT_THUMBNAIL_URL };
  await restoreCustomAvatar();
}

elements.creatorEntry?.addEventListener('avatar-creator-open', () => sceneController?.pause());
elements.creatorEntry?.addEventListener('avatar-creator-close', () => sceneController?.resume());
elements.creatorEntry?.addEventListener('avatar-created', (event) => {
  applyCustomAvatar(event.detail?.avatar).catch((error) => console.error('Unable to load avatar:', error));
});
elements.creatorEntry?.addEventListener('avatar-creator-notice', (event) => {
  console.info('Avatar Creator:', event.detail?.message);
});
elements.sceneMenu?.addEventListener('control-profile-change', (event) => {
  if (!sceneController) return;
  try {
    const profileId = sceneController.setControlProfile(event.detail?.profileId);
    elements.sceneMenu.activeProfile = profileId;
  } catch (error) {
    console.error('Unable to switch camera and control profile:', error);
    elements.sceneMenu.activeProfile = sceneController.activeControlProfile;
  }
});
window.addEventListener('pagehide', () => avatarStore.releaseAvatar(currentLocalAvatar), { once: true });

bootstrapScene().catch((error) => {
  console.error('Unable to start the scene:', error);
});
