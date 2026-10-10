# What leaves your browser

Your room stays in your browser. It is never sent anywhere by Sunspill. It lives in the address bar of the page (the part after the `#`, which browsers do not send to a server), in the page's local storage for a few settings, and in files you save yourself.

Three optional services talk to public servers. Each one is off until you allow it, and the page names it and says what it sends before the first request. The first screen, the quick check, asks once for all three together, in one sheet that says what is sent and to whom, and one yes switches the three on. You can turn each one off again from "Online services" at the bottom of the page, and in the setup under its step title.

| Service | Used for | Server | What it receives |
| --- | --- | --- | --- |
| Address search | Finding your address or building | nominatim.openstreetmap.org (OpenStreetMap Foundation) | The text you type in the search box. When nothing matches, plainer forms of the same words follow, without the floor or the house number,so a Taiwanese address with a house number and a floor is found. Four requests at most, a second apart, and nothing that you did not type. When the text is a listing or a message, only the city, the street and the house number found in it go out (as the street and city fields of the search), and never the price, the phone number or the rest of it |
| Map pictures | The map behind the pin and the room | tile.openstreetmap.org (OpenStreetMap Foundation) | The map tiles for the part of the world you are looking at |
| Building outlines | Neighbouring buildings and their heights | overpass-api.de, or if it fails overpass.kumi.systems and then overpass.private.coffee (run by Kumi Systems and by the private.coffee collective, not by the OpenStreetMap Foundation) | The latitude and longitude of the room (or, in the quick check, of the address that was found), rounded to five decimals (about one metre), and the radius of 200 metres. A busy server is asked again after a wait |

Every request also carries what any web request carries: your network address, your browser's name and the site this page is on (not its full address, and never the part after the `#`). OpenStreetMap's own [privacy policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy) and the policies of the Overpass server operators say what they do with it.

The page's Content Security Policy lists exactly those five hosts (the Nominatim server, three Overpass servers and the tile server) and no others, so the browser blocks a script request to anything else (the page's own address is also allowed, for its icon). It does not stop a link that someone clicks. `test/e2e/setup.e2e.js` and `test/e2e/quick.e2e.js` check that:

- a fresh page makes no request but its own,
- a "Not now" sends nothing,
- address search sends one `GET` with the typed text and nothing else,
- the map asks for nothing but tiles,
- the building request sends only the position and the radius,
- the quick check sends the street and city of an address found in pasted text and no other word of it, and never the floor.

## What never leaves

- The room, the windows, the furniture, the surroundings and the marks you make on the floor.
- A floor plan or photo you trace or lay on the floor. It is read into memory in the page and not stored or uploaded.
- Your location, unless you press "Use my location". The browser then asks you, and what it does with the request is up to the browser and your device.
- Anything about how you use the page. There is no analytics, no cookie and no account.

## Remembered on your device

`localStorage` holds the language, the theme, the units, whether the sun path shows, which of the three services you allowed, whether you finished the setup, whether you last used the quick check or the full editor, the flats you added to the compare list of the quick check (up to four, each a label, an address, a floor, a place and the numbers of every side, under `sunspill.compare`), the last room you edited, so that it comes back the next time you open the page, and up to twelve rooms you saved by name in the Share tab, each one the whole room. If you open somebody's link over a room of your own and then edit theirs, your own room is kept under a second name until you press "Bring back my earlier room" in the Share tab. "Start over" in the Share tab forgets both rooms but not the ones you saved by name, which you delete one at a time in the same tab, and clearing site data forgets everything.

The link in the address bar holds the whole room too, so it sits in your browser history, and in synced history if you use sync.

## Sharing

A link holds the whole room, so whoever has it can see it. "Hide my exact location" rounds the place to whole degrees, drops its name and drops the names and OpenStreetMap numbers of the buildings. The outlines of the buildings are kept, as shapes in metres around the room without coordinates, because the shade depends on them. A very distinctive outline could still hint at where a room is, so share the picture instead of the link if that matters.

The picture and the GIF carry the place name only when the box is not ticked.

The Share button of the quick check makes a link that holds the place searched (to about one metre), the name of the place, the outline and OpenStreetMap number of the building you chose, the floor and the sides you picked. Whoever has the link knows which building you looked at, so share it only with people who may know. The link is not sent anywhere by Sunspill, and opening it sends nothing until the one yes about OpenStreetMap, then the same requests as a search that found the place (the tiles and the building outlines, but no address search). Where the phone has a share sheet the link goes to the app you pick in it, which is outside Sunspill. Opening the link takes it out of the address bar, so a reload does not bring the old answer back. The browser may still keep the address you opened in its history.
