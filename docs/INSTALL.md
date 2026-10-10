# Install and run

Sunspill is one static HTML file. There is nothing to install to use it.

## Use it

Open https://arthur031221.github.io/Sunspill/ in any current browser. After the first visit it also opens with no network connection, because the page installs a small cache worker.

## Use it from one file

Each [release](https://github.com/Arthur031221/Sunspill/releases) has `sunspill.html`, the whole app in one file. Download it and open it in a browser, from disk or from any host. From disk there is no offline worker, and no network is needed anyway. The release is made by `.github/workflows/release.yml` when a tag such as `v0.2.0` is pushed, and the tag has to match the version in `package.json`.

## Run it from the repository

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

`npm run build` writes `dist/index.html` (the whole app, fonts included), `dist/sw.js` (the offline worker), `dist/manifest.webmanifest` with the icons (for "Add to Home Screen") and `dist/sunspill.js` (the library). The committed `dist` is always current: CI rebuilds it and fails if it differs.

## Host it yourself

Copy `dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest` and the three `dist/icon-*.png` files to any static host, side by side. The manifest and the icons only matter for "Add to Home Screen", and the page works without them. The page sets a Content Security Policy that allows no network requests except the three optional OpenStreetMap services (address search, map pictures and building outlines), which stay off until a person allows them, see [PRIVACY.md](PRIVACY.md). A host that adds its own `connect-src` rules can stop those three and nothing else. Serve it over HTTPS if you want the offline worker, which browsers only allow on secure origins and on localhost. To have the "nearby past deals" part of the quick check, copy the `data/deals` folder of the repository to `data/deals` next to `index.html` too. It is read from the page's own address, so no setting is needed, and without it the page says that the deals data is not there. [DEALS.md](DEALS.md) says how the folder is made.

## Use the library

The sun and light code has no dependencies and no browser calls.

```sh
npm install github:Arthur031221/Sunspill
```

```js
import { solarPosition, defaultScene, scenePatches, sunAt } from 'sunspill'

const scene = defaultScene()
const sun = sunAt(scene.place, 7, 15, 16 * 60 + 30)
const patches = scenePatches(scene, { azimuth: sun.azimuth, elevation: sun.elevation })
console.log(patches.floor)
```

See [API.md](API.md) for every export.

## Requirements

- Any browser from the last two years (Chrome, Edge, Firefox, Safari). The page needs canvas, `Intl.DateTimeFormat` with time zones and ES2022. The phone compass needs a browser that shares `DeviceOrientation`, and iOS asks permission first.
- To build or test: Node 20 or newer. The browser tests use Playwright, installed by `npm ci`, and download Chromium and Firefox with `npx playwright install chromium firefox`.
