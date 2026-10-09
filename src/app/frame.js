// Everything the drawing needs that depends on the scene and the moment.

import { scenePatches, windowPatches, totalArea } from '../core/light.js'
import { clipConvex } from '../core/poly.js'
import { sunInRoom, itemFootprint } from '../core/room.js'
import { sceneObstacles } from '../core/obstacles.js'
import { sunAt, sunPath, daySteps } from '../core/hours.js'

const pathCache = { key: '', value: null }

export function pathFor(scene) {
  const { place, date } = scene
  const key = `${place.lat},${place.lon},${place.zone},${date.month},${date.day}`
  if (pathCache.key !== key) {
    pathCache.key = key
    pathCache.value = sunPath(place, date.month, date.day, 15)
  }
  return pathCache.value
}

/** Sun position, the lit patches on floor and walls, and the lit tops of furniture. */
export function computeFrame(scene) {
  const { place, date, minutes } = scene
  const sun = sunAt(place, date.month, date.day, minutes)
  const live = { azimuth: sun.azimuth, elevation: sun.elevation }
  const patches = scenePatches(scene, live)
  const itemTops = scene.items.map((item) => {
    if (item.kind === 'plant' || !(sun.elevation > 0)) return []
    const s = sunInRoom(scene, sun.azimuth, sun.elevation)
    const footprint = itemFootprint(item)
    const obstacles = sceneObstacles(scene)
    return scene.windows
      .flatMap((win) => windowPatches(scene.room, win, s, { planeZ: item.h, walls: false, obstacles }).floor)
      .map((poly) => clipConvex(poly, footprint))
      .filter((poly) => poly.length)
  })
  return { sun: live, geometric: sun.geometric, patches, itemTops, path: pathFor(scene) }
}

let cached = { scene: null, frame: null }
/** computeFrame, remembered for the scene object it was computed from. */
export function frameFor(scene) {
  if (cached.scene !== scene) cached = { scene, frame: computeFrame(scene) }
  return cached.frame
}

/** Hours of the day in which the sun touches the top of each piece of furniture. */
export function itemSunHours(scene) {
  const { steps } = daySteps(scene.place, scene.date.month, scene.date.day, 10)
  const obstacles = sceneObstacles(scene)
  return scene.items.map((item) => {
    if (item.kind === 'plant') return null
    const footprint = itemFootprint(item)
    let lit = 0
    for (const step of steps) {
      const s = sunInRoom(scene, step.azimuth, step.elevation)
      const hit = scene.windows.some((win) => windowPatches(scene.room, win, s, { planeZ: item.h, walls: false, obstacles }).floor.some((poly) => clipConvex(poly, footprint).length))
      if (hit) lit += step.w
    }
    return lit
  })
}

/** Sunlit floor area in square metres, where windows overlap counted once. */
export const floorArea = (patches) => totalArea(patches.floor)

/** Hours of direct sun that reach the floor on the day shown, from the sun's own steps through the day. */
export function sunHoursInside(scene) {
  const { steps } = daySteps(scene.place, scene.date.month, scene.date.day, 10)
  let hours = 0
  for (const step of steps) {
    const p = scenePatches(scene, step)
    if (p.floor.length || p.walls.length) hours += step.w
  }
  return hours
}
