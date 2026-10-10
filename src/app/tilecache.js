// The map pictures: which are loaded, which are on their way, and which to stop waiting for. A picture is
// asked for only when it is on the screen, at most a few at a time and the nearest the middle first. One that
// has left the screen for a moment is cancelled, and one that fails is asked for again after a short wait,
// twice, and then forgotten for a while, so a failed tile never stays a hole and the server is not asked
// again on every frame. The cache keeps the last used pictures, which a map one level up and one level down
// needs to stand in for a tile that has not come.

import { tileKey } from '../core/tilemap.js'

export class TileCache {
  /**
   * @param options.url   (z, x, y) => the address of a picture (it throws when the service is off)
   * @param options.load  (url, ok, bad) => cancel: starts a load, calls ok(picture) or bad(), returns a way to stop it
   * @param options.onChange called when a picture has come, or when a failed one may be asked for again
   */
  constructor({ url, load, onChange = () => {}, max = 240, concurrency = 6, retries = 2, backoff = 400, cooldown = 20000, grace = 300, now = () => performance.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) }) {
    Object.assign(this, { url, load, onChange, max, concurrency, retries, backoff, cooldown, grace, now, setTimer, clearTimer })
    // in the order of use, the one used longest ago first
    this.tiles = new Map()
    // a tile that failed for good, and the time it may be asked for again
    this.cool = new Map()
    this.order = []
    this.flying = 0
  }

  get size() {
    return this.tiles.size
  }

  /** The picture of a loaded tile, or null. Looking at a tile counts as using it. */
  ready(z, x, y) {
    const key = tileKey(z, x, y)
    const e = this.tiles.get(key)
    if (!e || e.state !== 'ready') return null
    this.tiles.delete(key)
    this.tiles.set(key, e)
    return e.img
  }

  /** The tiles on the screen now, nearest the middle first. Starts what is new, and lets go of what is not wanted any more. */
  want(list) {
    const now = this.now()
    const wanted = new Set()
    this.order = []
    for (const { z, x, y } of list) {
      const key = tileKey(z, x, y)
      wanted.add(key)
      this.order.push(key)
      let e = this.tiles.get(key)
      if (e) {
        e.wantedAt = now
        this.tiles.delete(key)
        this.tiles.set(key, e)
        continue
      }
      const until = this.cool.get(key)
      if (until !== undefined) {
        if (until > now) continue
        this.cool.delete(key)
      }
      e = { key, z, x, y, state: 'queued', tries: 0, img: null, cancel: null, timer: null, wantedAt: now }
      this.tiles.set(key, e)
    }
    for (const e of [...this.tiles.values()]) {
      if (wanted.has(e.key) || e.state === 'ready') continue
      // a tile that is only waiting its turn costs nothing to drop, one that is loading is given a moment to come back
      if (e.state === 'queued' || now - e.wantedAt >= this.grace) this.drop(e)
    }
    this.evict(wanted)
    this.pump()
  }

  drop(e) {
    if (e.state === 'loading') {
      e.cancel?.()
      this.flying--
    }
    if (e.timer) this.clearTimer(e.timer)
    e.state = 'gone'
    if (this.tiles.get(e.key) === e) this.tiles.delete(e.key)
  }

  evict(wanted) {
    if (this.tiles.size <= this.max) return
    for (const e of [...this.tiles.values()]) {
      if (this.tiles.size <= this.max) break
      if (!wanted.has(e.key)) this.drop(e)
    }
  }

  pump() {
    for (const key of this.order) {
      if (this.flying >= this.concurrency) return
      const e = this.tiles.get(key)
      if (e?.state === 'queued') this.start(e)
    }
  }

  start(e) {
    let url
    try {
      url = this.url(e.z, e.x, e.y)
    } catch {
      // the service was switched off while the tile waited
      this.drop(e)
      return
    }
    e.state = 'loading'
    this.flying++
    e.cancel = this.load(url, (img) => this.arrived(e, img), () => this.failed(e))
  }

  arrived(e, img) {
    if (e.state !== 'loading') return
    this.flying--
    e.state = 'ready'
    e.img = img
    e.cancel = null
    this.onChange()
    this.pump()
  }

  failed(e) {
    if (e.state !== 'loading') return
    this.flying--
    e.cancel = null
    e.tries++
    if (e.tries <= this.retries) {
      e.state = 'waiting'
      e.timer = this.setTimer(() => {
        e.timer = null
        if (e.state !== 'waiting') return
        e.state = 'queued'
        this.pump()
      }, this.backoff * 3 ** (e.tries - 1))
    } else {
      // given up: nothing is kept for it, and it may be asked for again after a pause
      e.state = 'gone'
      this.tiles.delete(e.key)
      this.cool.set(e.key, this.now() + this.cooldown)
      this.setTimer(() => this.onChange(), this.cooldown)
    }
    this.pump()
  }
}
