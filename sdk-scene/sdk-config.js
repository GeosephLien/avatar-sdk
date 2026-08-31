const PUBLIC_DEPLOYMENT_ORIGIN = 'https://ac3-website.pages.dev';

const PUBLIC_DEPLOYMENT = Object.freeze({
  assetBaseUrl: `${PUBLIC_DEPLOYMENT_ORIGIN}/assets`,
  creatorUrl: `${PUBLIC_DEPLOYMENT_ORIGIN}/avatar-creator/index.html`
});

export function getAvatarSdkConfig() {
  return PUBLIC_DEPLOYMENT;
}

export function createSdkAssetUrl(path, config = getAvatarSdkConfig()) {
  return new URL(String(path || '').replace(/^\/+/, ''), `${config.assetBaseUrl}/`).href;
}
