<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo.svg" width="64" alt="">
  </picture><br>
  Sunspill
</h1>

<p align="center"><strong>Set up your own room in a few minutes, then see where the sun lands on its floor, by the hour and the season.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Sunspill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-231b12?style=flat-square" alt="MIT license"></a>
  <a href="https://arthur031221.github.io/Sunspill/"><img src="https://img.shields.io/badge/live%20demo-open-f5a524?style=flat-square" alt="Live demo"></a>
  <a href="https://github.com/Arthur031221/Sunspill/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Sunspill?style=flat-square&color=c2410c" alt="Latest release"></a>
  <a href="https://github.com/Arthur031221/Sunspill/stargazers"><img src="https://img.shields.io/github/stars/Arthur031221/Sunspill?style=flat-square&color=f5a524" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-TW.md">zh-TW</a> | <a href="README.zh-CN.md">zh-CN</a> | <a href="README.ja.md">ja</a> | <a href="README.ko.md">ko</a> | <a href="README.es.md">es</a> | <a href="README.fr.md">fr</a> | <a href="README.de.md">de</a> | <a href="README.pt-BR.md">pt-BR</a>
</p>

<table align="center">
  <tr>
    <td valign="middle">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.png">
        <img src="assets/hero-light.png" alt="Sunspill showing a west facing bedroom with the afternoon sun patch across the floor and the bed" width="620">
      </picture>
    </td>
    <td valign="middle"><img src="assets/setup.gif" alt="On a phone: an address is searched, a room type picked, the room turned over the buildings on the map until it faces the street, and the sun patch crosses the floor" width="240"></td>
  </tr>
</table>

<p align="center">
  Sun elevation within <b>0.007 degrees</b> of the NREL reference. <b>0 disagreements in 54,000 probe points</b> where buildings, trees and balconies shade a window, against pvlib and shapely.<br>
  <sub>Every geometry piece is compared with an independent reference, from the sun (pvlib, NREL SPA) and the shadows (a ray tracer and shapely) to the magnetic declination (pygeomag), the map offsets (pyproj) and the photo flattening (OpenCV). <code>node scripts/validate.mjs</code> reproduces it, and <a href="docs/VALIDATION.md">docs/VALIDATION.md</a> lists the choices that aren't checked. It hasn't been compared with a photograph of a real room yet, so there's a check mode that compares the model with what you saw. <a href="docs/ACCURACY.md">docs/ACCURACY.md</a> says how far each wrong input moves the patch.</sub>
</p>

It isn't a rendering or an AR app. The patch on your floor is an exact polygon, and you can check it against a ray tracer.

**[Open the live demo](https://arthur031221.github.io/Sunspill/)**. It's free, needs no login and opens offline after the first visit. Your room stays in your browser. Address search, the map and building outlines ask OpenStreetMap, but only after you say yes to each one.

## Set up your own room

Press **Set up my room**. On a phone it takes a few minutes, in seven steps with a Back and a Next button.

1. **Where.** Type an address or drop a pin on the OpenStreetMap map. The latitude, longitude and time zone fill in by themselves.
2. **The room.** Start from a typical Taiwanese studio suite, bedroom, living room or home office, or trace your own floor plan or listing photo with a two point scale. Set the floor number.
3. **Windows and doors.** Real dimensions along the walls, snapping to the wall ends, the middle and each other, balconies with a railing, eaves and doors.
4. **Which way it faces.** Turn the room over the outline of your building on the map, or hold the phone against the window and read its compass with the magnetic declination added. North is always on screen.
5. **What stands around it.** Neighbouring buildings and their heights load from OpenStreetMap. A height that was guessed is marked and can be edited. Add buildings and trees by hand.
6. **Furniture.** Place, drag and turn beds, desks, sofas, shelves and plants, and see the sun land on them.
7. **Check against the real sun.** Mark where the sun really was on the floor at a time you saw it, or lay a photo of the floor under the plan. Sunspill shows how far the model is off and can fit the facing and the window to your marks.

## Before and after

The same bedroom in Taipei at 16:30 on 15 July. Turn the window from west to east and the afternoon sun is gone.

| West window | East window |
| :---: | :---: |
| <img src="assets/before.png" alt="West window with the sun patch on the floor and bed" width="380"> | <img src="assets/after.png" alt="East window with no sun inside" width="380"> |
| **4 h 28 min** of direct sun a day after 14:00 | **0 min** |

<sub>Average per day over 40 sample days from June to September (every third day), clear sky, direct sun only, from the Afternoon sun check in the Results tab. The rule is printed in the app.</sub>

## Why I built it

> *West sun is a standing worry for people who rent in Taiwan, and a listing photo cannot show what it will do in your room.*

A compass app gives you an angle. A map shadow tool draws the buildings in the street. Neither shows the patch of light on the floor of the room you're about to sign for. Sunspill does. You describe the room, the window and what stands outside, pick a place and a date, and the patch moves as you drag the clock. The same engine answers the other questions people ask about light: how many hours a desk or a plant gets, and which corner is best.

## What it makes

<table align="center">
  <tr>
    <td align="center"><a href="assets/cards/west-july.png"><img src="assets/cards/west-july-thumb.png" width="190" alt="Share card for the west bedroom on 15 July"></a><br><sub><i>West bedroom, 15 July, 16:30</i></sub></td>
    <td align="center"><a href="assets/cards/west-december.png"><img src="assets/cards/west-december-thumb.png" width="190" alt="Share card for the west bedroom on 21 December"></a><br><sub><i>Same room, 21 December</i></sub></td>
    <td align="center"><a href="assets/cards/south-winter.png"><img src="assets/cards/south-winter-thumb.png" width="190" alt="Share card for a south living room at noon in winter"></a><br><sub><i>South room, noon in winter</i></sub></td>
    <td align="center"><a href="assets/cards/east-morning.png"><img src="assets/cards/east-morning-thumb.png" width="190" alt="Share card for an east bedroom on a summer morning"></a><br><sub><i>East bedroom, summer morning</i></sub></td>
  </tr>
</table>

*New in 0.2: a guided setup for a phone, address search and a map pin, the phone compass with declination, neighbouring buildings and trees from OpenStreetMap, balconies, doors, floors and turned furniture, tracing a floor plan, and a check against the sun you saw.*

## What you can do

- **Draw the room.** Size, wall thickness, up to four windows with a shade, a balcony and a rail, up to three doors, the floor number and furniture you can turn.
- **Scrub any day.** Pick a city, an address, your location or a latitude and longitude. The clock, the sun path and the patch follow, with daylight saving handled.
- **See what shades it.** Buildings from OpenStreetMap with their heights, trees, and your own balcony and eave. Switch any of them off to see what it costs in hours of sun.
- **See hours, not guesses.** The sun hours map colours the floor, or a surface at a height you set, by the hours of direct sun per day for a day, a month, a year or a range of months. Hover for the number.
- **Check the afternoon.** A printed rule, not a score: the minutes after a time you choose when direct sun reaches the floor or a wall, averaged over the months you choose.
- **Find a spot for a plant.** Full sun, partial sun or low light, for a 30 cm footprint, ranked, at least 60 cm apart.
- **Compare with reality.** Mark the patch you saw, see the overlap and the offset in centimetres, and fit the direction.
- **Share it.** A link that holds the whole room, a PNG card, a GIF, or the room as a JSON file. One switch rounds the place to whole degrees and drops the names from all of them.
- **Use it anywhere.** Nine languages, light and dark themes, keyboard and touch, undo and redo, offline after the first visit.

## Privacy

Your room, the pictures you trace and the marks you make never leave your browser. There's no account, no analytics and no cookie. Three optional services talk to OpenStreetMap servers, each off until you allow it, with the page saying what it sends first:

| Service | Sends |
| --- | --- |
| Address search (Nominatim) | the text you type |
| Map pictures (OpenStreetMap tiles) | the part of the map you look at |
| Building outlines (Overpass) | the position of the room, to about one metre |

You can switch each one off again under "Online services". The page's Content Security Policy names those four hosts and no others, and the browser tests check it. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Install

<details>
<summary><b>In the browser (recommended)</b></summary>

Open <https://arthur031221.github.io/Sunspill/>. Nothing to install. After one visit it opens with no connection. CI tests it in Chromium and Firefox and runs WebKit as an extra check. A real iPhone hasn't been tried.
</details>

<details>
<summary><b>From the repository</b></summary>

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npx --yes serve dist
```
</details>

<details>
<summary><b>On your own site</b></summary>

Copy `dist/index.html` and `dist/sw.js` to any static host. Only the three optional services above reach out, and they stay off until you allow them. See [docs/INSTALL.md](docs/INSTALL.md).
</details>

<details>
<summary><b>As a library</b></summary>

```sh
npm install github:Arthur031221/Sunspill
```

```js
import { defaultScene, sunAt, scenePatches, totalArea } from 'sunspill'

const scene = defaultScene()                       // a west facing bedroom in Taipei
const sun = sunAt(scene.place, 7, 15, 16 * 60 + 30) // 16:30 on 15 July
const { floor } = scenePatches(scene, { azimuth: sun.azimuth, elevation: sun.elevation })
console.log(`${totalArea(floor).toFixed(1)} square metres of floor in sun`)
```

No dependencies, no DOM, runs in Node 20 or newer and in the browser. See [docs/API.md](docs/API.md).
</details>

## How it works

The sun position follows the NOAA equations. A window opening is trimmed by the wall thickness and the shadows of the eave, the balcony rail, and every building and tree outside, which leaves a few convex pieces. Each piece is carried along the sun rays onto the floor and walls and clipped there. A building outline of any shape is cut into convex prisms first, and the shadow of a prism on the window is the hull of its corners carried along the rays. The room is convex, so a ray that gets in meets the boundary once and nothing inside can block it. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the details.

What it leaves out is listed on the page and on every picture it exports: clear sky and direct sun only, no reflections, no furniture shadows, one box shaped room, buildings as flat topped prisms and trees as solid shade. Beams almost parallel to a wall are ignored. If you can photograph a room under a sun you can date, [please open an issue](CONTRIBUTING.md#real-rooms).

## Docs

[Usage](docs/USAGE.md) | [Privacy](docs/PRIVACY.md) | [Accuracy](docs/ACCURACY.md) | [Validation](docs/VALIDATION.md) | [Install](docs/INSTALL.md) | [Config and file format](docs/CONFIG.md) | [Library API](docs/API.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

## Planned

L shaped rooms. Vertical fins and blinds. Shadows from furniture. A comparison with photographed rooms. Leaf-off seasons for trees. Published npm package.

## Related tools

[SunCalc](https://github.com/mourner/suncalc) gives sun angles as a library. Sunspill uses its own NOAA implementation, checked against NREL. [building-sunlight-simulator](https://github.com/SeanWong17/building-sunlight-simulator) shows building shadows for housing estates. The [Flat Sun and Shade Simulator](https://www.smartcalculator.sg/housing/flat-sun-shade-simulator) covers flats in Singapore. Sunspill is for the inside of one room, anywhere, with the code open.

## License and data

MIT. The Fraunces font is embedded under the SIL Open Font License. Map pictures, building outlines and address search come from OpenStreetMap contributors and are under the Open Database License. The time zone table is `@photostructure/tz-lookup` (CC0) and the magnetic field model is the World Magnetic Model 2025 (public domain). See [THIRD_PARTY.md](THIRD_PARTY.md).
