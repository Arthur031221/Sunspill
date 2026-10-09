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
```

`dist/` is committed and CI fails when it is stale, so run `npm run build` before you commit.

## Where things go

- `src/core` is pure and has no dependencies. Keep it free of DOM calls so it runs in Node and in the browser, and cover every change with a unit test.
- A change to the light model needs a test against a closed form case and the random comparison in `test/light.test.js` must stay at zero disagreements. If you add a modelling choice, say so in `docs/VALIDATION.md`.
- `src/app` is the interface. Keep new controls keyboard reachable and give every string a key in `src/locales/en.json`.

## Add or fix a language

Copy `src/locales/en.json` to the language code, translate the values and keep the `{placeholders}` as they are. Add the language to `src/app/i18n.js` and to the list in `test/e2e/app.e2e.js`. `npm test` checks the keys and placeholders. Translated READMEs are named `README.<code>.md`.

## Add a city

Add one line to `src/core/cities.js`: name, country code, latitude, longitude, an IANA time zone and spellings in other scripts. The test checks that the zone exists and agrees with the longitude within about three hours.

## Style

Plain code, no framework, comments only where the reason is not obvious. English in docs and commit messages is plain: short sentences, no dashes, no filler. Numbers in docs come from a command in this repository.

## Real rooms

The model has not been compared with a photograph of a real room yet. If you can measure one, open an issue with the room file, the date, the place, the time and a photograph with a tape measure in the frame. A case like that is worth more than a new feature.
