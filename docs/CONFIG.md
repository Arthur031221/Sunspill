# Configuration

Sunspill has no config file. A room is a scene, a plain JSON object, and the interface keeps its own small set of preferences.

## The scene

```json
{
  "v": 1,
  "room": { "w": 3.6, "d": 4.4, "h": 2.6, "wall": 0.15 },
  "facing": 270,
  "windows": [
    { "wall": "top", "pos": 0.9, "w": 1.8, "h": 1.4, "sill": 0.9,
      "eave": { "depth": 0, "gap": 0.15, "ext": 0.3 }, "across": null }
  ],
  "place": { "name": "Taipei", "lat": 25.033, "lon": 121.565, "zone": "Asia/Taipei" },
  "date": { "month": 7, "day": 15 },
  "minutes": 990,
  "items": [{ "kind": "bed", "x": 0.25, "y": 1.5, "w": 1.5, "d": 2, "h": 0.5 }]
}
```

All lengths are metres. The interface can show feet, but files and links always hold metres.

| Field | Meaning | Range |
| --- | --- | --- |
| `room.w`, `room.d`, `room.h` | width (x), depth (y) and ceiling height | 1.5 to 20, 1.5 to 20, 2 to 6 |
| `room.wall` | wall thickness, used to trim oblique sun | 0 to 0.6 |
| `facing` | compass bearing in degrees that the outside of the top wall faces, clockwise from north | any number, stored 0 to 360 |
| `windows[].wall` | `top`, `right`, `bottom` or `left` | |
| `windows[].pos` | distance from the left end of the wall, seen from inside, to the left edge of the window | 0 to wall length minus width |
| `windows[].w`, `h`, `sill` | width, height, sill height | 0.3 to 12, 0.3 to 4, 0 to ceiling minus height |
| `windows[].eave` | a horizontal shade at `sill + h + gap`: `depth` out from the wall, `ext` past each side. Depth 0 means none | depth 0 to 4, gap 0 to 1.5, ext 0 to 3 |
| `windows[].across` | a flat-fronted building facing the window: `height` of its roof above this floor and `distance` from the wall, or `null` | height 0 to 400, distance 2 to 300 |
| `place` | `lat` (-80 to 80), `lon`, and `zone`, an IANA name such as `Asia/Taipei` or a fixed offset such as `UTC+8` or `UTC-3:30` | |
| `date` | month and day of the day shown. Year is fixed at 2026 for daylight saving rules | |
| `minutes` | local time as minutes after midnight | 0 to 1439 |
| `items[]` | `kind` (`bed`, `desk`, `sofa`, `table`, `plant`, `box`), position of the corner nearest the left and bottom walls, and size | up to 12 items, kept inside the room |

The room axes: x runs left to right and y runs up the page in the plan view. The top wall is the one at the top of the plan. The four walls face `facing`, `facing + 90`, `facing + 180` and `facing + 270` degrees for top, right, bottom and left.

`normalizeScene` clamps every number into its range, drops unknown fields and never throws, so a hand edited file or a hostile link cannot put the page in a state it cannot draw.

## The link

The part after `#` is `r1=` followed by the scene as a short JSON array in base64url. It is at most 6,000 characters. A link that does not parse is ignored and the sample room opens instead. `decodeScene` and `encodeScene` are exported by the library.

## Interface preferences

Stored in the browser under `localStorage["sunspill.prefs"]` and never sent anywhere: `theme` (`auto`, `light`, `dark`), `lang`, `units` (`m` or `ft`) and `arc` (show the sun path).

The language is picked from the browser language list the first time. Supported: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. Messages live in `src/locales/*.json`, one flat file per language. A test checks that every language has every key and the same placeholders.
