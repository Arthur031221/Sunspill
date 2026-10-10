// Tap and double tap on the map. The first tap acts at once, since choosing a building or placing a pin does no
// harm twice. A second tap close to it inside the window is a double tap: it zooms, and does not act again.
// `onDouble` is told, so a page can take back what the first tap did.

export function createTapper({ onTap, onDouble, window: gap = 250, slop = 28, now = () => performance.now() }) {
  let last = null
  return {
    tap(x, y) {
      const at = now()
      if (last && at - last.at <= gap && Math.hypot(x - last.x, y - last.y) <= slop) {
        last = null
        onDouble(x, y)
        return
      }
      last = { x, y, at }
      onTap(x, y)
    },
    cancel() {
      last = null
    },
  }
}
