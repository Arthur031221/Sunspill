# Changelog

## Unreleased

- **GitHub button.** The header has a GitHub button next to undo. On a phone it shows only the mark, so the header keeps two rows.
- **Furniture that looks like furniture.** Each piece is drawn from its parts: the bed has legs, a frame, a headboard, a mattress, a duvet and pillows, the desk a top, metal legs and a drawer, the sofa cushions, a back and arms, the shelf boards and books, the chest drawers and handles. The light still treats each piece as one box of its full height, and its patch lands on the parts at that height.

## 0.2.3 (2026-10-10)

Walking the live page with real addresses and the real OpenStreetMap servers found several things that fixtures had hidden.

- **Taiwanese addresses.** Nominatim found nothing for a Taiwanese address that ends in a house number and a floor, because it wants the number after a space and has no word for the floor. A search that finds nothing now tries plainer forms of the same words, at most three more, a second apart: the road and the number after a space (the building), then the street, then the road a lane or alley leaves from. A Latin address loses its floor and unit first, then its house number. When the house number had to go, the page says so and asks you to drop a pin on your building. Checked against the real servers on three Taipei addresses, which now land on the right building. Only words you typed are sent, and the privacy notes say so. `addressVariants` is exported.
- **Buildings.** `overpass.openstreetmap.fr` answers every browser with 403 ("white-listed usages") and no CORS header, so one of the three servers could never help. `overpass.kumi.systems` takes its place. When no server sends the buildings, the page now says so in plain words, stays on the page after the toast, and offers the way on (try again, or add them by hand), where it showed a raw error list that was gone in a few seconds.
- **Pressing Next while buildings load.** Leaving the facing or surroundings step cancelled the request, so a person who tapped Load and then Next arrived at a step that said "No buildings". The load now goes on across steps and stops only when the setup is closed, and a second tap says it is loading.
- **Check step.** Putting right the date or time no longer clears the corners already marked.
- **Screen reader.** A door's width box said "Window width" and now says "Door width", a door's wall shows its compass direction, and the remove and copy buttons and the shade boxes name the piece they belong to. Choosing an address from the list no longer drops the focus to the page, it moves to the line that says where the room is.

## 0.2.2 (2026-10-10)

Buildings from OpenStreetMap that were silently missing now load, and rooms can be kept by name.

- **Buildings drawn as relations load.** The Overpass query asked for `out geom tags`, which leaves the members out of a relation, so every building that OpenStreetMap draws as a multipolygon (a station, a department store, Taipei 101) never came in. The query now asks relations for their members, their outer ways are joined into rings in whatever order and direction they come, and two outlines that touch at a corner stay two. Checked against shapely on real answers. A courtyard counts as solid.
- **Heights.** A plain building with no height or floor count takes the middle height of the five nearest buildings that have one, and is marked estimated. Leaving each building with a height out in turn on five stretches of Taipei, that guess is off by a middle factor of 1.2 to 1.3, against 1.7 to 5.7 for the fixed nine metres it replaces.
- **Which buildings are kept.** When more than 60 stand within 200 metres, the ones that rise highest above your window are kept (the floor number counts), and a note says how many were left out and how low they are. Before, they were ranked from the ground.
- **Saved rooms.** In the Share tab, name a room and keep up to twelve in this browser. Opening one saves the room on the page first, as "Earlier: place", unless it is saved already, and does nothing when that cannot be done. Each is the whole room, with every building and mark, and delete asks twice.
- **Keyboard and screen reader.** The drawing says what the keys do, an arrow key on a piece or a window is read out with its place, a keyboard picks a piece by moving into its card, and the sun patch edge is darker so it stands out from the floor by 3 to 1.
- **Map.** A height label that would sit on another is left off, so a tower drawn as five parts carries one. When the first Overpass server is busy the page says it is trying the next, and starts with the server that answered last the next time.
- **Floor area.** The room step shows it, with ping, the Taiwanese unit, added on the Traditional Chinese page.
- **Validation.** Overlap, difference, union, centroids, crossing edges and the convex split of concave outlines are compared with shapely (2e-14 m2 worst), and the undo trail, which kept growing on replace and redo, is capped at 80 with tests. `docs/CONFIG.md` now says 80 buildings and trees, as the code does.

## 0.2.1 (2026-10-10)

Smaller things that a first walk through the setup on a phone turned up.

- **Furniture.** A new piece lands on free floor near the middle and no longer on top of the bed. Two of a kind are called Desk 1 and Desk 2.
- **Check step.** At night the clock starts in the middle of the day, and a note says when the time you set has the sun below the horizon.
- **Surroundings step.** It says so when no direct sun reaches the floor that day, with or without the buildings, and suggests what to look at.
- **Map.** Building heights follow the unit you chose, so the labels and the scale agree. The label of a window no longer sits on the ring that turns the room.

## 0.2.0 (2026-10-09)

A room set up on a phone in a few minutes, and a way to check it against the sun you saw.

- **Guided setup.** Seven steps: address, room, windows and doors, which way it faces, what stands around, furniture, and a check against the real sun. Built for a phone, with large touch targets, and it works on a desktop too.
- **Address and map.** Search an address or drop a pin on an OpenStreetMap map. Latitude, longitude and time zone fill in. All three online services (address search, map pictures, building outlines) are off until allowed, say what they send, and can be switched off again. See docs/PRIVACY.md.
- **Facing.** Turn the room over the outline of your building, press one button to line the window wall up with a wall of that building, or read the phone compass with the World Magnetic Model declination added. Averages the reading and waits until it is steady.
- **Rooms.** Seven typical rooms to start from, a trace of a floor plan or listing photo with a two point scale, real lengths drawn along the walls, snapping, doors, balconies with a rail, floors, and furniture that can be turned and snaps to walls and neighbours. A shelf is new.
- **Surroundings.** Buildings and their heights from OpenStreetMap, with guessed heights marked and editable, trees, and buildings you add. Outlines of any shape. Switch each one off to see what it costs in hours of sun. A clock on the map moves a dotted line toward the sun and outlines in orange the buildings that shade a window at that time.
- **Check mode.** Mark the sun patch you saw on the floor, or lay a photo of the floor under the plan. See the overlap and offset, and fit the facing and the window to your marks.
- **Validation.** Every geometry piece is compared with an independent reference: pvlib and shapely for the shadows, pygeomag, pyproj, timezonefinder and OpenCV for the rest. 0 disagreements in 54,000 shadow probes. docs/ACCURACY.md shows how much each wrong input moves the patch.
- **Kept on your device.** The last room you edited comes back when you open the page without a link. "Start over" in the Share tab forgets it.
- **Sharing.** A new link format (`r2`) that carries buildings, floors, balconies and observations. Old links still open. "Hide my exact location" also drops building names.
- **Install on a phone.** A web manifest and icons, so "Add to Home Screen" opens the page full screen.
- **Library.** New exports for obstacles, geography, declination, the compass, fitting and tracing.
- **Fixed.** A sun running exactly along a wall no longer lights it. An outline that crosses itself no longer disappears. A latitude and longitude typed in another time zone bring that zone along. A friend's link that you edit no longer replaces your own room: yours is set aside and "Bring back my earlier room" in the Share tab returns it. Closing the setup with corners marked but not saved asks first. Moving the room to a new place says that the buildings loaded for the old one were removed. Text boxes are 16 pixels high on a phone, which stops Safari on an iPhone from zooming in when one gets the focus, and a 320 pixel wide screen no longer pushes the Undo button or the three buttons of the Share tab out of view.

## 0.1.0

First release. A box shaped room with up to four windows, a shade and a building across the street, the sun by the hour and season, the sun hours map, the afternoon check, a plant spot finder, share cards and GIFs, nine languages.
