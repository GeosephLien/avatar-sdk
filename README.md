# Avatar SDK

Avatar SDK provides a browser-based VRM reference scene with avatar creation, local persistence, movement, camera controls, and VRMA animation playback.

This repository is a public preview. It runs without credentials or environment configuration. The Avatar Creator and versioned default runtime assets are served from `https://ac3-website.pages.dev`; avatars created by a user remain in the embedding site's browser storage.

## Run locally

```sh
npm install
npm test
npm run check
npm start
```

Open `http://localhost:4173/sdk-scene/`.

## Hosted resources

The reference scene uses the hosted Creator, default VRM and thumbnail, seven default VRMA clips, and the Creator's Unity files. These resources are versioned and are not duplicated in this repository.

Load the Creator Entry component directly:

```html
<script type="module" src="https://ac3-website.pages.dev/sdk-scene/components/avatar-creator-entry/avatar-creator-entry.js"></script>
<avatar-creator-entry></avatar-creator-entry>
```

The host Content Security Policy must allow `https://ac3-website.pages.dev` in `script-src`, `style-src`, `frame-src`, `connect-src`, and `img-src`. It must also allow `blob:` in `connect-src` and `img-src` for locally created avatars. Creator messages are accepted only from the active iframe at its exact origin.

## Storage

The newest avatar is stored as one `current` record in the embedding Origin's IndexedDB. Creating an avatar transfers its VRM and thumbnail directly to the embedding page. If persistence is unavailable, the newest avatar remains available only for the current page lifetime. Clearing site data removes it.

`sdk-scene/components/avatar-presentation/avatar-presentation.js` provides the DOM-free VRM and animation runtime. Applications can supply their own animation manifest through `createAvatarPresentation`; the reference scene uses the hosted defaults.

## License

MIT
