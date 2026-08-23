import { localAvatarStore } from './local-avatar-store.js';

export function createAvatarStore({
  localStore = localAvatarStore
} = {}) {
  return {
    getAvatar: (...args) => localStore.getAvatar(...args),
    saveAvatar: (...args) => localStore.saveAvatar(...args),
    releaseAvatar: (...args) => localStore.releaseAvatar(...args)
  };
}

export const avatarStore = createAvatarStore();