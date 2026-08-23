# Avatar SDK

Avatar SDK provides a browser-based VRM reference scene with avatar creation, local persistence, movement, camera controls, and VRMA animation playback.

This repository is currently a private preview. The Avatar Creator and runtime assets are hosted services configured in `sdk-scene/sdk-config.js`; generated avatars remain in the host Origin's IndexedDB.

## Run locally

```sh
npm install
npm test
npm run check
npm start
```

Open `http://localhost:4173/sdk-scene/`.

## Runtime configuration

Set `window.__AVATAR_SDK_CONFIG__` before loading SDK modules to override the hosted service endpoints:

```html
<script>
  window.__AVATAR_SDK_CONFIG__ = {
    apiBaseUrl: 'https://api.example.com',
    creatorUrl: 'https://creator.example.com/',
    assetBaseUrl: 'https://assets.example.com'
  };
</script>
```

The host must permit the configured API, Creator, and asset origins in its Content Security Policy. The Creator is accepted only from its exact configured Origin.

## Storage

The newest avatar is stored as one `current` record in the host Origin's IndexedDB. If persistence is unavailable, the newest avatar remains available only for the current page lifetime.

## License

MIT
