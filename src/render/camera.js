// An orthographic camera over the room: yaw turns the room about the vertical
// axis, pitch tilts it from the horizon (about 30 degrees) up to straight
// down (90 degrees, the plan view). Screen y grows downward.

const RAD = Math.PI / 180

export function makeCamera(room, { yaw, pitch }, width, height, { padding = 28, extra = [], offsetY = 0 } = {}) {
  const cy_ = Math.cos(yaw * RAD)
  const sy_ = Math.sin(yaw * RAD)
  const cp = Math.cos(pitch * RAD)
  const sp = Math.sin(pitch * RAD)
  const cx0 = room.w / 2
  const cy0 = room.d / 2

  // unit scale, centred on the room centre
  const raw = (x, y, z) => {
    const dx = x - cx0
    const dy = y - cy0
    const xr = dx * cy_ - dy * sy_
    const yr = dx * sy_ + dy * cy_
    return [xr, -(yr * sp + z * cp), yr * cp - z * sp]
  }

  const corners = []
  for (const x of [0, room.w]) for (const y of [0, room.d]) for (const z of [-0.12, room.h]) corners.push(raw(x, y, z))
  for (const p of extra) corners.push(raw(p[0], p[1], p[2]))
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min((width - 2 * padding) / Math.max(1e-6, maxX - minX), (height - 2 * padding) / Math.max(1e-6, maxY - minY))
  const ox = width / 2 - ((minX + maxX) / 2) * scale
  const oy = height / 2 + offsetY - ((minY + maxY) / 2) * scale

  const project = (x, y, z = 0) => {
    const [a, b] = raw(x, y, z)
    return [ox + a * scale, oy + b * scale]
  }
  /** Distance along the view direction: larger is farther from the viewer. */
  const depth = (x, y, z = 0) => raw(x, y, z)[2]

  /** The floor (or any horizontal plane z) point under a screen position. Null when the view is edge on. */
  const planeAt = (sx, sy, z = 0) => {
    if (sp < 0.12) return null
    const xr = (sx - ox) / scale
    const yr = (-(sy - oy) / scale - z * cp) / sp
    return [xr * cy_ + yr * sy_ + cx0, -xr * sy_ + yr * cy_ + cy0]
  }

  /**
   * The point on a vertical wall plane under a screen position, as [u, z] with u the
   * x (for top and bottom walls) or y (for left and right walls) room coordinate.
   * Null when the wall is edge on to the view.
   */
  const wallAt = (wall, sx, sy) => {
    const horizontal = wall === 'top' || wall === 'bottom'
    const fixed = wall === 'top' ? room.d : wall === 'right' ? room.w : 0
    const at = (u, z) => (horizontal ? project(u, fixed, z) : project(fixed, u, z))
    const [x0, y0] = at(0, 0)
    const [x1, y1] = at(1, 0)
    const [x2, y2] = at(0, 1)
    const a = x1 - x0
    const b = x2 - x0
    const c = y1 - y0
    const d = y2 - y0
    const det = a * d - b * c
    if (Math.abs(det) < 1e-3 * scale * scale) return null
    const rx = sx - x0
    const ry = sy - y0
    return [(d * rx - b * ry) / det, (-c * rx + a * ry) / det]
  }

  /** Screen direction of a horizontal room-axis vector (dx, dy), as a unit-free pair. */
  const direction = (dx, dy) => {
    const xr = dx * cy_ - dy * sy_
    const yr = dx * sy_ + dy * cy_
    return [xr, -(yr * sp)]
  }

  /** True when the outward normal (nx, ny) of a wall points away from the viewer, so the wall's inside face is visible. */
  const isBackWall = (nx, ny) => nx * sy_ + ny * cy_ > 0.001 || sp > 0.995

  return { project, depth, planeAt, wallAt, direction, isBackWall, scale, yaw, pitch, width, height }
}
