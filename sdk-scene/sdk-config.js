const PUBLIC_DEPLOYMENT_ORIGIN = 'https://ac3-website.pages.dev';

const PUBLIC_DEPLOYMENT = Object.freeze({
  assetBaseUrl: `${PUBLIC_DEPLOYMENT_ORIGIN}/assets`,
  creatorUrl: `${PUBLIC_DEPLOYMENT_ORIGIN}/sdk-scene/apps/avatar-creator/index.html?embedded=1&uiMode=modal`
});

export function getAvatarSdkConfig() {
  return PUBLIC_DEPLOYMENT;
}

export function createSdkAssetUrl(path, config = getAvatarSdkConfig()) {
  return new URL(String(path || '').replace(/^\/+/, ''), `${config.assetBaseUrl}/`).href;
}
