import { localAvatarCreatorStore } from './local-avatar-creator-store.js';

const REQUIRED_METHODS = ['getAvatar', 'saveAvatar', 'releaseAvatar'];

export function validateAvatarCreatorStore(store) {
  if (!store || REQUIRED_METHODS.some((method) => typeof store[method] !== 'function')) {
    throw new TypeError('Avatar Creator store must implement getAvatar, saveAvatar, and releaseAvatar.');
  }
  return store;
}

export function createAvatarCreatorStore({
  localStore = localAvatarCreatorStore
} = {}) {
  return validateAvatarCreatorStore({
    getAvatar: (...args) => localStore.getAvatar(...args),
    ...(typeof localStore.getDownloadPayload === 'function'
      ? { getDownloadPayload: (...args) => localStore.getDownloadPayload(...args) }
      : {}),
    saveAvatar: (...args) => localStore.saveAvatar(...args),
    releaseAvatar: (...args) => localStore.releaseAvatar(...args)
  });
}

export const avatarCreatorStore = createAvatarCreatorStore();