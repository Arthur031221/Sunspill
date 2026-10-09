# Using Sunspill

## The first minute

The page opens on a sample bedroom in Taipei with a west window and the sun already moving across the floor. Press space to pause, then drag the time bar to scrub the day. The amber curve behind the bar shows how much floor is in sun at each hour, so you can see when the sun comes in before you play it.

## Make it your room

1. **Room tab.** Set the width, depth and ceiling height. Turn the compass dial to the direction you see when you stand at the window and look out, or read your phone compass (phone compasses point at magnetic north, which differs from true north by your local declination).
2. **Windows.** Each window has a wall, a distance from the left end of that wall (as you face it from inside), a width, a height and a sill height. You can also drag a window along its wall in the 3D view. Add up to four.
3. **Shade or balcony above.** Depth is how far it sticks out. Gap is the space between the window top and the underside. Extends past each side is how far it reaches beyond the window left and right. A building across the street is a roof height above this floor and a distance.
4. **Place tab.** Search a city from the built-in list, use your location, or type a latitude, a longitude and a time zone.
5. **Things tab.** Add a bed, desk, sofa, table, plant or box and drag it on the floor. The top of each piece lights up where the sun reaches it, at the height of the piece.

Everything is saved in the link as you go. Copy it from the Share tab and the same room opens for whoever has it.

## Read the answers

- **Clock and curve.** The strip under the room shows the time, the sun height and bearing, the floor area in sun right now and the hours of direct sun that reach inside on the chosen date.
- **Sun hours map** (Results tab). Colours the floor, or any flat surface at a height you choose, by the hours of direct sun it gets per day, averaged over a day, a month, the year or a range of months. Hover or touch the floor for the number at that spot.
- **Afternoon sun check.** The rule is printed in the panel: on sample days between the months you pick, count the minutes after the time you pick when direct sun reaches the floor or a wall, and average per day. It also lists the first and last sun and the largest lit floor area.
- **Where a plant gets its light.** Pick a light need, a leaf height and a period. The finder lists up to three spots where the whole 30 cm footprint falls in the range, at least 60 cm apart, and can place a plant there.

## Share it

- **Copy link** puts the room in the address. **Hide my exact location** rounds the place to whole degrees and drops its name, in the link, the picture and the GIF.
- **Save a picture** makes a 1080 by 1350 PNG card with the room, the date, the hours of sun and the assumptions.
- **Make a GIF** records the sun crossing the room: 540 pixels wide, 12 frames a second, silent, made inside the page. Cancel any time.
- **Save as file** writes the room as JSON (see [CONFIG.md](CONFIG.md)) and **Open a file** reads it back.

## Keyboard and touch

| Key | Action |
| --- | --- |
| Space | play or pause the day |
| Left and Right on the time bar | move 5 minutes (Shift: 30) |
| Left and Right on the room | turn the view (Shift: bigger steps) |
| Delete on a selected piece or window | remove it |
| Ctrl or Cmd + Z, Shift + Z | undo, redo |

On a phone, drag to turn the room, drag pieces and windows to move them, and use the tabs under the room. Reduced motion settings stop the autoplay and the view animations.

## What it does not model

Clear sky and direct sun only. No sky light, no reflections off the ground or nearby glass, no furniture shadows, no window frames or glass tint, no trees, no neighbouring buildings except the one flat-fronted block you can describe per window. The room is a single box. See [VALIDATION.md](VALIDATION.md) for what was checked.
