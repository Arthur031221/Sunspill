# Install and run

Sunspill is one static HTML file. There is nothing to install to use it.

## Use it

Open https://arthur031221.github.io/Sunspill/ in any current browser. After the first visit it also opens with no network connection, because the page installs a small cache worker.

## Run it from the repository

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```

`npm run build` writes `dist/index.html` (the whole app, fonts included), `dist/sw.js` (the offline worker) and `dist/sunspill.js` (the library). The committed `dist` is always current: CI rebuilds it and fails if it differs.

## Host it yourself

Copy `dist/index.html` and `dist/sw.js` to any static host, side by side. The page sets a Content Security Policy that allows no network requests at all, so a host that adds its own `connect-src` rules cannot break it. Serve it over HTTPS if you want the offline worker, which browsers only allow on secure origins and on localhost.

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

- Any browser from the last two years (Chrome, Edge, Firefox, Safari). The page needs canvas, `Intl.DateTimeFormat` with time zones and ES2022.
- To build or test: Node 20 or newer. The browser tests use Playwright, installed by `npm ci`, and download Chromium and Firefox with `npx playwright install chromium firefox`.
