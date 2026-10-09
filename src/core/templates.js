// Typical rooms to start from. The sizes are those of common new apartments and
// suites in Taiwan and are only a starting point: the guided setup shows them
// next to the measured room and asks to change them.

const win = (wall, pos, w, h, sill, extra = {}) => ({ wall, pos, w, h, sill, eave: { depth: 0, gap: 0.15, ext: 0.3 }, across: null, balcony: null, ...extra })
const balcony = (depth, rail = 1) => ({ depth, rail, ext: 0.3 })
// Most flats in Taiwan have the balcony of the floor above overhead, reaching as far out as this one does, with its underside at the ceiling.
// The top floor is the exception, and the setup says how to switch the roof off.
const covered = (b, ceiling, sill, h) => ({ depth: b.depth, gap: Math.round((ceiling - sill - h) * 100) / 100, ext: 0.3 })
const balconyWindow = (wall, pos, w, h, sill, depth, ceiling) => {
  const b = balcony(depth)
  return win(wall, pos, w, h, sill, { balcony: b, eave: covered(b, ceiling, sill, h) })
}

/** Each template: an id, the room, its windows and doors, and the furniture to place. Positions are in room metres. */
export const TEMPLATES = [
  {
    id: 'studio',
    room: { w: 3.3, d: 5.2, h: 2.6, wall: 0.15 },
    windows: [balconyWindow('top', 0.45, 2.4, 2.1, 0, 1.2, 2.6)],
    doors: [{ wall: 'bottom', pos: 0.3, w: 0.9 }],
    items: [{ kind: 'bed', x: 0.2, y: 2.6, w: 1.5, d: 1.9, h: 0.5 }, { kind: 'desk', x: 2.0, y: 1.4, w: 1.2, d: 0.6, h: 0.75 }, { kind: 'sofa', x: 0.2, y: 0.4, w: 1.8, d: 0.9, h: 0.8 }],
  },
  {
    id: 'bedroom',
    room: { w: 3.3, d: 3.9, h: 2.6, wall: 0.15 },
    windows: [win('top', 0.75, 1.8, 1.3, 0.9)],
    doors: [{ wall: 'bottom', pos: 0.2, w: 0.9 }],
    items: [{ kind: 'bed', x: 0.9, y: 1.1, w: 1.5, d: 1.9, h: 0.5 }, { kind: 'shelf', x: 0.1, y: 0.2, w: 0.8, d: 0.45, h: 2.0 }],
  },
  {
    id: 'master',
    room: { w: 3.6, d: 4.5, h: 2.6, wall: 0.15 },
    windows: [balconyWindow('top', 0.7, 2.2, 2.1, 0, 1.3, 2.6)],
    doors: [{ wall: 'bottom', pos: 0.25, w: 0.9 }],
    items: [{ kind: 'bed', x: 0.9, y: 1.4, w: 1.8, d: 2.0, h: 0.5 }, { kind: 'desk', x: 2.3, y: 0.3, w: 1.2, d: 0.6, h: 0.75 }, { kind: 'shelf', x: 0.1, y: 0.2, w: 0.9, d: 0.5, h: 2.1 }],
  },
  {
    id: 'small',
    room: { w: 2.7, d: 3.2, h: 2.6, wall: 0.15 },
    windows: [win('top', 0.75, 1.2, 1.2, 1.0)],
    doors: [{ wall: 'bottom', pos: 0.2, w: 0.8 }],
    items: [{ kind: 'bed', x: 0.1, y: 1.1, w: 1.0, d: 2.0, h: 0.5 }, { kind: 'desk', x: 1.4, y: 0.2, w: 1.1, d: 0.55, h: 0.75 }],
  },
  {
    id: 'living',
    room: { w: 4.0, d: 5.6, h: 2.7, wall: 0.15 },
    windows: [balconyWindow('top', 0.6, 2.8, 2.1, 0, 1.5, 2.7)],
    doors: [{ wall: 'bottom', pos: 0.4, w: 1.0 }],
    items: [{ kind: 'sofa', x: 0.9, y: 1.6, w: 2.2, d: 0.95, h: 0.8 }, { kind: 'table', x: 1.3, y: 2.9, w: 1.2, d: 0.7, h: 0.45 }, { kind: 'shelf', x: 0.1, y: 4.6, w: 1.6, d: 0.4, h: 1.8 }],
  },
  {
    id: 'open',
    room: { w: 4.2, d: 7.2, h: 2.7, wall: 0.15 },
    windows: [balconyWindow('top', 0.7, 2.8, 2.1, 0, 1.5, 2.7), win('left', 5.6, 1.2, 1.2, 1.0)],
    doors: [{ wall: 'bottom', pos: 0.5, w: 1.0 }],
    items: [{ kind: 'sofa', x: 1.0, y: 5.0, w: 2.2, d: 0.95, h: 0.8 }, { kind: 'table', x: 1.4, y: 3.0, w: 1.6, d: 0.9, h: 0.75 }, { kind: 'plant', x: 3.6, y: 6.5, w: 0.35, d: 0.35, h: 1.1 }],
  },
  {
    id: 'office',
    room: { w: 2.8, d: 3.3, h: 2.6, wall: 0.15 },
    windows: [win('top', 0.65, 1.5, 1.2, 0.95)],
    doors: [{ wall: 'bottom', pos: 0.2, w: 0.8 }],
    items: [{ kind: 'desk', x: 0.9, y: 2.2, w: 1.4, d: 0.65, h: 0.75 }, { kind: 'shelf', x: 0.1, y: 0.2, w: 0.8, d: 0.35, h: 1.9 }],
  },
]

/** A scene (without place, date and orientation) filled in from a template. */
export function applyTemplate(scene, id) {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) return scene
  return { ...scene, room: { ...t.room }, windows: structuredClone(t.windows), doors: structuredClone(t.doors), items: structuredClone(t.items), checks: [] }
}
