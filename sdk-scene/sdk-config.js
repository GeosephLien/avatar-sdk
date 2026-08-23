const PREVIEW_CONFIG = Object.freeze({
  apiBaseUrl: 'https://ac3-sdk.kuanyi-lien.workers.dev',
  creatorUrl: 'https://ac3-website.pages.dev/sdk-scene/apps/avatar-creator/index.html?embedded=1&uiMode=modal&contentMode=export-host',
  assetBaseUrl: 'https://pub-552a75ff4cbd40beb47ecc096bee1dd9.r2.dev'
});

function normalizeHttpUrl(value, name) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`${name} must use HTTP or HTTPS.`);
  }
  return url.href.replace(/\/$/, '');
}

export function getAvatarSdkConfig(windowObject = globalThis.window) {
  const overrides = windowObject?.__AVATAR_SDK_CONFIG__;
  const config = overrides && typeof overrides === 'object' ? overrides : {};
  return Object.freeze({
    apiBaseUrl: normalizeHttpUrl(config.apiBaseUrl || PREVIEW_CONFIG.apiBaseUrl, 'apiBaseUrl'),
    creatorUrl: normalizeHttpUrl(config.creatorUrl || PREVIEW_CONFIG.creatorUrl, 'creatorUrl'),
    assetBaseUrl: normalizeHttpUrl(config.assetBaseUrl || PREVIEW_CONFIG.assetBaseUrl, 'assetBaseUrl')
  });
}

export function createSdkAssetUrl(path, config = getAvatarSdkConfig()) {
  return new URL(String(path || '').replace(/^\/+/, ''), `${config.assetBaseUrl}/`).href;
}
