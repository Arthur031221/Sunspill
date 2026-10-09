# Changelog

## 0.2.0

A room set up on a phone in a few minutes, and a way to check it against the sun you saw.

- **Guided setup.** Seven steps: address, room, windows and doors, which way it faces, what stands around, furniture, and a check against the real sun. Built for a phone, with large touch targets, and it works on a desktop too.
- **Address and map.** Search an address or drop a pin on an OpenStreetMap map. Latitude, longitude and time zone fill in. All three online services (address search, map pictures, building outlines) are off until allowed, say what they send, and can be switched off again. See docs/PRIVACY.md.
- **Facing.** Turn the room over the outline of your building, or read the phone compass with the World Magnetic Model declination added. Averages the reading and waits until it is steady.
- **Rooms.** Seven typical rooms to start from, a trace of a floor plan or listing photo with a two point scale, real lengths drawn along the walls, snapping, doors, balconies with a rail, floors, and furniture that can be turned and snaps to walls and neighbours. A shelf is new.
- **Surroundings.** Buildings and their heights from OpenStreetMap, with guessed heights marked and editable, trees, and buildings you add. Outlines of any shape. Switch each one off to see what it costs in hours of sun. A clock on the map moves a dotted line toward the sun and outlines in orange the buildings that shade a window at that time.
- **Check mode.** Mark the sun patch you saw on the floor, or lay a photo of the floor under the plan. See the overlap and offset, and fit the facing and the window to your marks.
- **Validation.** Every geometry piece is compared with an independent reference: pvlib and shapely for the shadows, pygeomag, pyproj, timezonefinder and OpenCV for the rest. 0 disagreements in 54,000 shadow probes. docs/ACCURACY.md shows how much each wrong input moves the patch.
- **Kept on your device.** The last room you edited comes back when you open the page without a link. "Start over" in the Share tab forgets it.
- **Sharing.** A new link format (`r2`) that carries buildings, floors, balconies and observations. Old links still open. "Hide my exact location" also drops building names.
- **Install on a phone.** A web manifest and icons, so "Add to Home Screen" opens the page full screen.
- **Library.** New exports for obstacles, geography, declination, the compass, fitting and tracing.
- **Fixed.** A sun running exactly along a wall no longer lights it. An outline that crosses itself no longer disappears. Wall patches above a raised plane were already fixed in 0.1.

## 0.1.0

First release. A box shaped room with up to four windows, a shade and a building across the street, the sun by the hour and season, the sun hours map, the afternoon check, a plant spot finder, share cards and GIFs, nine languages.
