# Using Sunspill

## The first minute

The page opens on a sample bedroom in Taipei with a west window and the sun already moving across the floor. Press space to pause, then drag the time bar to scrub the day. The amber curve behind the bar shows how much floor is in sun at each hour, so you can see when the sun comes in before you play it.

## Set up your own room

Press **Set up my room**. It takes a few minutes on a phone and has seven steps, each with a Back and a Next button. Every step changes the room straight away, and Undo (top right) takes back the last change.

1. **Where is the room.** Type an address, a building or a town and press Search, or drop a pin on the map. The latitude, longitude and time zone fill in by themselves. The first time you search, or show the map, Sunspill asks and says what it will send, see [PRIVACY.md](PRIVACY.md). A Taiwanese address with a house number and a floor is found by its plainer form, and when OpenStreetMap has no entry for the number you get the street and a note to drop a pin on your building. The built in city list works with no connection. "Use my location" asks your browser.
2. **The room.** Start from the type of room closest to yours (studio suite, bedroom, main bedroom with balcony, small bedroom, living room with balcony, open living and dining, home office), then set the width, depth, ceiling height and the floor number, where the ground floor is 1. A template with a balcony also puts the balcony of the floor above overhead, as most flats in Taiwan have. On a top floor, switch off "A roof or shade above" in the next step. Or press "Trace a floor plan or photo". Pick a picture of the plan, tap two points that you know the real distance between and type it, tap two corners along one wall and one point on the opposite wall, then tap the two ends of each window and door. The picture stays on your device.
3. **Windows and doors.** Each window has a wall, a distance from the left end of that wall as you face it from inside, a width, a height and a sill height. Switch on "A balcony outside this window" for a balcony of a depth you set with a solid railing of a height you set, and "A roof or shade above" for an overhead balcony or an awning. The plan shows real lengths along the walls. Drag a window along its wall in the plan. It snaps to the wall ends, the middle of the wall, other windows and doors. Add up to four windows and three doors.
4. **Which way does it face.** The map always has north up. Drag the room, and turn it with two fingers or the round handle, until it fits the outline of your building. Once a building is on the map, "Line the window wall up with the building" turns the room by the smallest angle that makes the window wall parallel to the nearest long wall of the building that holds the room, or of the nearest building if the room is in the street. Use it when the window is in a main wall. A bay or an angled wing will not fit. A dotted line on the map points at the sun at the time on the small clock above the buttons, so you can drag the clock to a time you remember and see what the sun comes over. Or press "Read the phone compass", hold the phone upright against the window glass with the screen toward you and wait for the bar to fill. The compass reads magnetic north, and Sunspill adds the local declination. If the phone gives the opposite direction, press Flip. You can type the bearing instead. "Load building outlines" brings the outlines of the buildings within 200 metres from OpenStreetMap after you allow it.
5. **What stands around it.** The buildings that were loaded come with their heights. A height marked "estimated" is a guess from the number of floors (3.2 metres each), from the buildings around it or the kind of building. Change it to what you see, and switch a building off if it does not shade the window. Add a building by its direction from the room, distance, width, depth and height, and add trees. The same clock moves the sun here, and the buildings and trees that put a shadow on a window at that time are outlined in orange on the map. A line shows the hours of direct sun inside on the chosen day with and without them, and says so when there is none at all, with or without them. Tap a building on the map to select it. A building or tree you added yourself can be dragged. When more than 60 buildings stand within 200 metres, the ones that rise highest above your window are kept and a note says how many were left out.
6. **Furniture.** Add a bed, desk, sofa, table, plant, box or shelf. A new piece lands on free floor near the middle, and two of a kind are called Desk 1 and Desk 2. Drag it on the plan, turn it with the round handle, the buttons or the `[` and `]` keys. It snaps to the walls, the middle and its neighbours. The sun that reaches the top of a piece is drawn on it, with the hours it gets.
7. **Check against the real sun.** The date starts as today and the time as now, or as the middle of the day when the sun is down. Change them to when you saw the sun (a note appears when the sun is below the horizon at the time you set), then press "Mark the patch on the floor" and tap the corners of the sunlit patch on the plan, one after another around its edge. Without a pointer you can type each corner as two distances from the walls. Or press "Use a photo of the floor", tap the four floor corners in the photo and mark the patch on the flattened photo. Save each observation (up to six). The page shows how much of what you marked the model covers, how far the two patches are apart, and "Fit the direction and windows to my marks" turns the room and, with a second observation at another hour, moves the window until they agree. Apply it, and Undo takes it back. [ACCURACY.md](ACCURACY.md) says how far to trust it.

Finish and the page shows the 3D room with the Results tab. Everything is saved in the link as you go, and the last room you edited is also kept in this browser, so it comes back when you open the page without a link. If you open a friend's link and start editing it, your own room is set aside rather than replaced, and "Bring back my earlier room" in the Share tab swaps them back. "Start over" forgets both. Closing the setup with corners marked but not saved, or with a photo laid down, asks first. Copy the link from the Share tab and the same room opens for whoever has it.

## The tabs

The tabs under the room are for changes after the setup. **Room** has the size, the direction and every window with its shade, balcony and building across the street. **Place** is the search of the built in city list and the coordinates. **Things** is the furniture. **Results** and **Share** are below. "Set up my room" is always there if you want to go through the steps again.

## Read the answers

- **Clock and curve.** The strip under the room shows the time, the sun height and bearing, the floor area in sun right now and the hours of direct sun that reach inside on the chosen date.
- **Sun hours map** (Results tab). Colours the floor, or any flat surface at a height you choose, by the hours of direct sun it gets per day, averaged over a day, a month, the year or a range of months. Hover or touch the floor for the number at that spot.
- **Afternoon sun check.** The rule is printed in the panel: on sample days between the months you pick, count the minutes after the time you pick when direct sun reaches the floor or a wall, and average per day. It also lists the first and last sun and the largest lit floor area.
- **Where a plant gets its light.** Pick a light need, a leaf height and a period. The finder lists up to three spots where the whole 30 cm footprint falls in the range, at least 60 cm apart, and can place a plant there.

## Share it

- **Copy link** puts the room in the address. **Hide my exact location** rounds the place to whole degrees and drops its name and the names of buildings, in the link, the picture, the GIF and the file.
- **Save a picture** makes a 1080 by 1350 PNG card with the room, the date, the hours of sun and the assumptions.
- **Make a GIF** records the sun crossing the room: 540 pixels wide, 12 frames a second, silent, made inside the page. Cancel any time.
- **Save as file** writes the room as JSON (see [CONFIG.md](CONFIG.md)) and **Open a file** reads it back.

## Keyboard and touch

| Key | Action |
| --- | --- |
| Space | play or pause the day |
| Left and Right on the time bar | move 5 minutes (Shift: 30) |
| Left and Right on the room | turn the view (Shift: bigger steps) |
| Arrow keys on a selected piece in the plan (with Alt held in 3D) | move it 5 cm (Shift: 25 cm) |
| `[` and `]` on a selected piece | turn it 15 degrees (Shift: 90) |
| Left and Right on a selected window in the plan | slide it 5 cm |
| Delete on a selected piece or window | remove it |
| Arrow keys, `+` and `-` on the map | pan and zoom |
| `[` and `]` on the map in the facing step | turn the room 1 degree (Shift: 15) |
| Shift + arrow keys on the map in the facing step | move the room 50 cm (Alt: 25 cm) |
| Ctrl or Cmd + Z, Shift + Z | undo, redo |

To pick a piece or a window with the keyboard, Tab into its card (in the Things or Room tab, or in the furniture and windows steps) and then Tab or click to the drawing, which tells a screen reader what the keys do. Each move of a piece or a window is read out with its place. On a phone, drag to turn the room, drag pieces and windows to move them, and use the steps under the room. Reduced motion settings stop the autoplay and the view animations.

## What it does not model

Clear sky and direct sun only. No sky light, no reflections off the ground or nearby glass, no furniture shadows, no window frames or glass tint. Buildings and trees are solid shapes with a flat top, and the room is a single box. See [VALIDATION.md](VALIDATION.md) for what was checked and [ACCURACY.md](ACCURACY.md) for how far off each input can put the patch.
