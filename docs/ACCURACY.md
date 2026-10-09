# How accurate is it

Sunspill predicts where direct sun lands in a room on a clear day, from the room you describe. The geometry is checked against independent references, see [VALIDATION.md](VALIDATION.md). Whether the patch lands where it does in your real room depends on how close your inputs are to the real room. This page says how much each input matters and what the app does to help.

I have not yet compared the model with photographs of a real room taken under a measured sun. Until that exists, the numbers below are sensitivities of the model, not measurements of real rooms. If you can send a room file and a photograph, see [CONTRIBUTING.md](../CONTRIBUTING.md#real-rooms).

## What matters most

The table moves one input at a time on a west bedroom in Taipei (3.6 by 4.4 metres, a 1.8 by 1.4 metre window, clear sky). "Overlap" is the part of the true patch that the wrong patch also covers, divided by the area either covers, so 100% is a perfect match. `node scripts/sensitivity.mjs` reproduces every number.

| One input wrong | Overlap, 15 July 16:30 (4.2 m2 patch) | Overlap, 21 December 15:00 (0.7 m2 patch) |
| --- | ---: | ---: |
| facing off by 2 degrees | 87% | 71% |
| facing off by 5 degrees | 72% | 40% |
| facing off by 10 degrees | 53% | 10% |
| window 10 cm to the side | 89% | 83% |
| window sill 5 cm off | 93% | 87% |
| room 10 cm too deep | 90% | 73% |
| wall thickness 5 cm off | 97% | 92% |
| window 10 cm too wide | 95% | 100% |
| latitude off by 0.01 degrees (1 km) | 100% | 100% |

The direction the window faces is the input that matters most, and a small patch (winter, a small window) is more sensitive than a big one. A compass reading that is 5 degrees out leaves less than three quarters of a summer patch in the right place and less than half of a winter one. That is why the phone compass in Sunspill adds the local magnetic declination. In Taipei a compass points 5.1 degrees west of true north, so an uncorrected reading is wrong by about as much as the table's 5 degree row.

| Place | Declination on 1 October 2026 |
| --- | ---: |
| Taipei | 5.1 degrees west |
| Tokyo | 7.9 degrees west |
| London | 1.2 degrees east |
| New York | 12.5 degrees west |
| Sydney | 12.8 degrees east |
| Anchorage | 14.0 degrees east |

The model for these numbers (World Magnetic Model 2025) is itself good to about 0.4 degrees in most places. A phone compass is also bent by metal, magnets in cases and electronics by a few degrees. So the best check of the facing is the building outline on the map, or a patch you saw.

## Buildings across the street

With a block 18 metres away and 15 metres high, in front of a fourth floor west window on 15 July, the room gets 5 h 17 min of direct sun a day. These change that figure.

| One input wrong | Direct sun inside, change per day |
| --- | ---: |
| block 3 m too low | +49 min |
| block 3 m too high | -46 min |
| room 5 m farther from the block than it is | +14 min |
| room 10 m farther from the block than it is | +23 min |
| floor number one too high | +49 min |
| floor number one too low | -46 min |
| block left out altogether | +61 min |

So the height of a building across the street matters more than where exactly the pin is, and one floor of difference in the floor number matters as much as one floor of difference in the block. OpenStreetMap often has no height for a building. Sunspill then uses 3.2 metres a floor when the floors are counted. For a plain building with neither, it takes the middle height of the five nearest buildings that have one, because neighbours tend to be about as tall, and falls back to a typical value for that kind of building (nine metres when it has no kind). It marks the height as estimated in the list so that you can correct it. Leaving each building with a height out in turn and guessing it from the others, on five real stretches of Taipei, the neighbours' guess is off by a middle factor of 1.2 to 1.3 and a fixed nine metres by 1.7 to 5.7. That test uses buildings whose height is known, and buildings with no height tag may differ from them. A pin that is 10 metres off still moves the result by about 20 minutes a day.

## What the app does about it

- **Facing.** Rotate the room over the outline of your own building on the map, or read the phone compass with the declination added. The two can be compared on the screen.
- **Check against what you saw.** Mark where the sun landed on the floor at a time you remember, or lay a photo of the floor under the plan and mark it there. The app shows how much of what you marked the model covers, how far apart the two patches are, and can fit the facing and, with a second observation at another hour, the placement of the window. Fitting is only as good as the marks. A fit that agrees well on one hour can still be one of several rooms that would give the same patch, so mark a second hour before you trust it.
- **Heights.** Every building height that was guessed says so. Change it to what you can see from the window.
- **Which buildings are loaded.** At most 60 buildings come from OpenStreetMap, the ones that rise highest above your window, counted from the floor number and the lowest sill. The page says how many were left out and how many degrees above your window the highest of them rises, and a building lower than the window cannot shade it. The rest only shade a sun lower than that angle. Load again after you change the floor number.
- **Your own building.** The outline that holds the room is left out, because the room is inside it. If a wing or a bay of your building stands in front of your window, add it as a building by hand, or switch the outline on in the list.
- **Courtyards.** A building drawn with an inner ring (a courtyard or an atrium) is read by its outer ring only, so the courtyard counts as solid and the building can shade a little more than it does. This matters for a window that looks across a wide courtyard of another block. Switch that building off, or redraw it as a few buildings by hand.

## What is left out

Clear sky and direct sun only. No sky light, reflections from the ground or nearby glass, window frames or tinted glass. Furniture does not cast shadows. Trees are solid shade, so they show the most shade they could cast, with the leaves on. Balcony side walls, pitched roofs on buildings across the street and the slope of the ground are not modelled. The room is one rectangle: for an L shaped or angled room, trace the part the window lights, and expect the rest to be wrong. The list of modelling choices is in [VALIDATION.md](VALIDATION.md#the-modelling-choices).

## Getting the most from it

- Measure the window and its distance from the wall end with a tape. A few centimetres cost little, but a window 10 cm off leaves only 83% of a small winter patch in place.
- Take the facing from the map outline first, then check it with the compass.
- Mark the sun at two different hours, at least an hour apart, before you fit.
- Choose a clear day. Clouds change the sun, not the geometry, but you will not see a patch to mark.
