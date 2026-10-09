# Configuration

Sunspill has no config file. A room is a scene, a plain JSON object, and the interface keeps its own small set of preferences.

## The scene

```json
{
  "v": 2,
  "room": { "w": 3.6, "d": 4.4, "h": 2.6, "wall": 0.15 },
  "facing": 270,
  "floor": { "n": 4, "storey": 3 },
  "windows": [
    { "wall": "top", "pos": 0.9, "w": 1.8, "h": 1.4, "sill": 0.9,
      "eave": { "depth": 0, "gap": 0.15, "ext": 0.3 }, "across": null,
      "balcony": { "depth": 1.2, "rail": 1, "ext": 0.3 } }
  ],
  "doors": [{ "wall": "bottom", "pos": 0.3, "w": 0.9 }],
  "place": { "name": "Taipei", "lat": 25.033, "lon": 121.565, "zone": "Asia/Taipei" },
  "obstacles": [
    { "type": "building", "src": "osm", "id": 587073793, "name": "", "est": false, "own": false, "on": true,
      "ring": [[-18, -30], [-18, 30], [-40, 30], [-40, -30]], "h": 15, "base": 0 },
    { "type": "tree", "src": "manual", "x": -9, "y": 6, "r": 2.5, "h": 9, "base": 2.5, "on": true }
  ],
  "date": { "month": 7, "day": 15 },
  "minutes": 990,
  "items": [{ "kind": "bed", "x": 0.25, "y": 1.5, "w": 1.5, "d": 2, "h": 0.5, "rot": 0 }],
  "checks": [{ "month": 7, "day": 15, "minutes": 990, "poly": [[0.5, 3.1], [1.4, 3.1], [1.6, 3.9], [0.4, 3.9]] }]
}
```

All lengths are metres. The interface can show feet, but files and links always hold metres. A file from version 0.1 (`"v": 1`) opens as it is and gains the new fields with their defaults.

| Field | Meaning | Range |
| --- | --- | --- |
| `room.w`, `room.d`, `room.h` | width (x), depth (y) and ceiling height | 1.5 to 20, 1.5 to 20, 2 to 6 |
| `room.wall` | wall thickness, used to trim oblique sun | 0 to 0.6 |
| `facing` | compass bearing in degrees that the outside of the top wall faces, clockwise from true north | any number, stored 0 to 360 |
| `floor.n` | the floor the room is on, where the ground floor is 1 | 1 to 99 |
| `floor.storey` | height of one floor, which sets how high the room sits above the ground | 2.4 to 6 |
| `windows[].wall` | `top`, `right`, `bottom` or `left` | |
| `windows[].pos` | distance from the left end of the wall, seen from inside, to the left edge of the window | 0 to wall length minus width |
| `windows[].w`, `h`, `sill` | width, height, sill height | 0.3 to 12, 0.3 to 4, 0 to ceiling minus height |
| `windows[].eave` | a horizontal shade at `sill + h + gap`: `depth` out from the wall, `ext` past each side. Depth 0 means none | depth 0 to 4, gap 0 to 1.5, ext 0 to 3 |
| `windows[].across` | a flat-fronted building facing the window: `height` of its roof above this floor and `distance` from the wall, or `null`. Kept for files from version 0.1, the obstacles below do the same job with real outlines | height 0 to 400, distance 2 to 300 |
| `windows[].balcony` | a balcony outside the window: `depth`, the height `rail` of a solid railing and `ext`, how far the railing reaches past each side. Or `null` | depth 0.3 to 4, rail 0 to 2, ext 0 to 3 |
| `doors[]` | `wall`, `pos` and width `w`, drawn on the plan and in the room. A door lets no light in | up to 3, width 0.5 to 3 |
| `place` | `lat` (-80 to 80), `lon`, and `zone`, an IANA name such as `Asia/Taipei` or a fixed offset such as `UTC+8` or `UTC-3:30` | |
| `obstacles[]` | buildings and trees that cast shade, see below | up to 60 |
| `date` | month and day of the day shown. Year is fixed at 2026 for daylight saving rules | |
| `minutes` | local time as minutes after midnight | 0 to 1439 |
| `items[]` | `kind` (`bed`, `desk`, `sofa`, `table`, `plant`, `box`, `shelf`), position of the corner of the unturned box nearest the left and bottom walls, size and `rot`, the turn in degrees about its centre | up to 16 items, kept inside the room |
| `checks[]` | observations for the check against the real sun: a day, a time and the corners of the sunlit patch marked on the floor, in room metres | up to 6, 3 to 12 corners each |

The room axes: x runs left to right and y runs up the page in the plan view. The top wall is the one at the top of the plan. The four walls face `facing`, `facing + 90`, `facing + 180` and `facing + 270` degrees for top, right, bottom and left.

### Obstacles

Buildings and trees are placed in metres east (x) and north (y) of the room centre, so turning the room does not move them, and each keeps its place on the ground when the room is moved on the map. Heights are above the ground outside. The room's floor sits `(floor.n - 1) * floor.storey` metres above it.

- **Building:** `ring` is the outline, 3 to 40 corners in any order and of any simple shape. `h` is the roof height (1 to 600) and `base` the height of the underside, for a building raised on pillars. `src` is `osm` for outlines loaded from OpenStreetMap and `manual` for those you drew, `id` is the OpenStreetMap number, `est` is true when `h` is a guess, `own` is true for the building that holds the room, and `on` switches it in or out of the shade. A building from OpenStreetMap that holds the room starts switched off.
- **Tree:** `x`, `y` the trunk, `r` the crown radius (0.4 to 15), `h` the top (1 to 45) and `base` the underside of the crown.

`normalizeScene` clamps every number into its range, drops unknown fields and never throws, so a hand edited file or a hostile link cannot put the page in a state it cannot draw.

## The link

The part after `#` is `r2=` followed by the scene as a short JSON array in base64url, at most 16,000 characters. Outlines are written in tenths of a metre as steps from the corner before. When the link would be longer, the observations are dropped first and then the buildings that are farthest from the room. A link that does not parse is ignored and the sample room opens instead. Links of the first format (`r1=`) still open. `decodeScene` and `encodeScene` are exported by the library.

## Interface preferences

Stored in the browser under `localStorage["sunspill.prefs"]` and never sent anywhere: `theme` (`auto`, `light`, `dark`), `lang`, `units` (`m` or `ft`), `arc` (show the sun path), `net` (which of the three online services you allowed, see [PRIVACY.md](PRIVACY.md)) and `setup` (whether you finished the guided setup).

The language is picked from the browser language list the first time. Supported: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. Messages live in `src/locales/*.json`, one flat file per language. A test checks that every language has every key and the same placeholders.
