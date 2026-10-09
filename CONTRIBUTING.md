# Contributing

Bug reports with a room file or a link are the most useful thing you can send. The Share tab can save the room as a file, and the address bar always holds the whole room.

## Set up

```sh
git clone https://github.com/Arthur031221/Sunspill.git
cd Sunspill
npm ci
npm run build
npm test                                   # unit tests, about 5 seconds
npx playwright install chromium firefox
npm run test:e2e                           # browser tests; BROWSER=firefox for Firefox
node scripts/validate.mjs                  # the numbers quoted in docs/VALIDATION.md
node scripts/sensitivity.mjs               # the numbers quoted in docs/ACCURACY.md
```

The reference data in `test/fixtures/` was made with Python and is committed, so the tests need no Python. To make it again:

```sh
python3 -m venv .venv && .venv/bin/pip install pvlib shapely pyproj pygeomag timezonefinder opencv-python-headless numpy pandas
.venv/bin/python scripts/make-reference.py            # the sun, with pvlib
.venv/bin/python scripts/make-geo-reference.py        # declination, compass, offsets, tiles, zones, homography
.venv/bin/python scripts/make-obstacle-reference.py   # shadows of buildings, trees and rails, with pvlib and shapely
```

`dist/` is committed and CI fails when it is stale, so run `npm run build` before you commit.

## Where things go

- `src/core` is pure and has no dependencies. Keep it free of DOM calls so it runs in Node and in the browser, and cover every change with a unit test.
- A change to the light model needs a test against a closed form case, and the random comparisons in `test/light.test.js` and `test/obstacles.test.js`, including the one against the Python reference, must stay at zero disagreements. If you add a modelling choice, say so in `docs/VALIDATION.md`.
- Anything that makes a request goes through `src/app/net.js`, behind a switch in `src/app/consent.js`, and its host is added to the list there. The page's Content Security Policy is built from that list. Keep `docs/PRIVACY.md` true.
- `src/app` is the interface. Keep new controls keyboard reachable, make touch targets at least 44 pixels on a phone, and give every string a key in `src/locales/en.json` and all eight other languages.

## Add or fix a language

Copy `src/locales/en.json` to the language code, translate the values and keep the `{placeholders}` as they are. Add the language to `src/app/i18n.js` and to the list in `test/e2e/app.e2e.js`. `npm test` checks the keys and placeholders. Translated READMEs are named `README.<code>.md`.

## Add a city

Add one line to `src/core/cities.js`: name, country code, latitude, longitude, an IANA time zone and spellings in other scripts. The test checks that the zone exists and agrees with the longitude within about three hours.

## Make a release

Set `version` in `package.json`, write the section for it at the top of `CHANGELOG.md` (the heading is the version and the date, and its text becomes the release notes), run `npm run build` and `npm test`, commit, then push a tag with a `v` in front of the version, such as `v0.2.0`. `.github/workflows/release.yml` checks the tag against `package.json`, rebuilds, tests, and publishes the release with `sunspill.html` and `sunspill.js`.

## Style

Plain code, no framework, comments only where the reason is not obvious. English in docs and commit messages is plain: short sentences, no dashes, no filler. Numbers in docs come from a command in this repository.

## Real rooms

The model has not been compared with a photograph of a real room yet. If you can measure one, open an issue with the room file (or the link), the date, the place, the time, the observation you marked in the check step and a photograph with a tape measure in the frame. A case like that is worth more than a new feature.
