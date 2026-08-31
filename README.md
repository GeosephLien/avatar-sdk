# Avatar SDK

Avatar SDK provides a browser-based VRM reference scene with avatar creation, local persistence, movement, switchable camera and control profiles, optional scene addons, and VRMA animation playback.

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

Load the Creator Adapter component directly:

```html
<script type="module" src="https://ac3-website.pages.dev/sdk-scene/components/avatar-creator-adapter/avatar-creator-adapter.js"></script>
<avatar-creator-adapter></avatar-creator-adapter>
```

The Adapter includes an IndexedDB-backed store by default. A host can replace the complete persistence policy before SDK Scene starts by assigning a store that implements `saveAvatar`, `getAvatar`, and `releaseAvatar`:

```js
const adapter = document.querySelector('avatar-creator-adapter');
adapter.store = {
	saveAvatar: async ({ vrm, thumbnail }) => saveAvatar(vrm, thumbnail),
	getAvatar: async () => restoreAvatar(),
	releaseAvatar: (avatar) => releaseAvatarResources(avatar)
};
```

The same store handles creation, restore, replacement cleanup, and page-exit cleanup for the session. `saveAvatar` receives VRM and thumbnail `File` objects. Save and restore results use `vrmUrl`, `thumbnailUrl`, and optional `fileName`, `createdAt`, `updatedAt`, and `expiresAt` fields; `getAvatar` may return `null` when no Avatar exists.

The host Content Security Policy must allow `https://ac3-website.pages.dev` in `script-src`, `style-src`, `frame-src`, `connect-src`, and `img-src`. It must also allow `blob:` in `connect-src` and `img-src` for locally created avatars. Creator messages are accepted only from the active iframe at its exact origin.

## Storage

The newest avatar is stored as one `current` record in the embedding Origin's IndexedDB. Creating an avatar transfers its VRM and thumbnail directly to the embedding page. If persistence is unavailable, the newest avatar remains available only for the current page lifetime. Clearing site data removes it.

`sdk-scene/components/avatar-presentation/avatar-presentation.js` provides the DOM-free VRM and animation runtime. Applications can supply their own animation manifest through `createAvatarPresentation`; the reference scene uses the hosted defaults.

## Controls and addons

The reference scene includes third-person locomotion, camera-relative locomotion, top-down locomotion, and click-to-move profiles. The standalone `<input-profile-dropdown>` selects View and Input combinations while the scene Host switches profiles atomically. Pointer destinations and keyboard or mobile input share the same locomotion and deceleration runtime.

Optional scene addons are installed through `sdk-scene/addons/sdk-scene-addons.js`. The standalone `<addon-loader>` displays the catalog and sends install or uninstall requests to the scene Host. Each addon receives isolated world and UI roots plus a narrow player adapter, so it can be uninstalled without mutating the base scene.

The bundled [Gem Collector](sdk-scene/addons/gem-collector/README.md) and [Target Shooter](sdk-scene/addons/target-shooter/README.md) demonstrate this lifecycle. Gem Collector is enabled by default; Target Shooter is available from the Addon Loader.

## License

MIT
