// The polygon work behind every sun patch, against shapely (GEOS) answers that
// scripts/make-polygon-reference.py wrote. Nothing in that script shares code with
// src/core/poly.js or the convex split in src/core/obstacles.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { area, centroid, clipConvex, insideConvex, selfCrossing, subtractConvex, unionArea } from '../src/core/poly.js'
import { convexParts } from '../src/core/obstacles.js'

const ref = JSON.parse(readFileSync(new URL('./fixtures/polygon-reference.json', import.meta.url), 'utf8'))
const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${what}: ${got} against ${want}`)
const sum = (polys) => polys.reduce((s, p) => s + area(p), 0)

test('overlap, difference and union of two convex polygons have the area shapely finds', () => {
  let worst = 0
  for (const [i, c] of ref.pairs.entries()) {
    const inter = clipConvex(c.a, c.b)
    const diff = subtractConvex(c.a, c.b)
    near(sum(inter.length ? [inter] : []), c.inter, `pair ${i} overlap`)
    near(sum(diff), c.diff, `pair ${i} difference`)
    near(unionArea([c.a, c.b]), c.union, `pair ${i} union`)
    worst = Math.max(worst, Math.abs(sum(inter.length ? [inter] : []) - c.inter), Math.abs(sum(diff) - c.diff), Math.abs(unionArea([c.a, c.b]) - c.union))
    // the pieces of a difference do not overlap each other and stay inside A
    for (let a = 0; a < diff.length; a++) for (let b = a + 1; b < diff.length; b++) {
      const both = clipConvex(diff[a], diff[b])
      assert.equal(both.length, 0, `pair ${i}: pieces ${a} and ${b} overlap`)
    }
  }
  console.log(`# polygons against shapely: ${ref.pairs.length} pairs, worst area difference ${worst.toExponential(1)} m2`)
})

test('the area of a set of overlapping convex polygons counts each part once', () => {
  for (const [i, c] of ref.sets.entries()) near(unionArea(c.polys), c.area, `set ${i}`)
})

test('a point is inside a convex polygon where shapely says so, and the centroid agrees', () => {
  let probes = 0
  for (const [i, c] of ref.pairs.entries()) {
    for (const [x, y, inside] of c.probes) {
      assert.equal(insideConvex(c.a, x, y), inside, `pair ${i} point ${x},${y}`)
      probes++
    }
    const m = centroid(c.a)
    near(m[0], c.centroid[0], `pair ${i} centroid x`)
    near(m[1], c.centroid[1], `pair ${i} centroid y`)
  }
  assert.ok(probes > 2000)
})

test('an outline crosses itself exactly when shapely calls it invalid', () => {
  const crossing = ref.rings.filter((r) => r.crossing).length
  assert.ok(crossing > 100 && crossing < ref.rings.length - 100, 'both kinds are in the set')
  for (const [i, r] of ref.rings.entries()) assert.equal(selfCrossing(r.ring), r.crossing, `ring ${i}`)
})

test('a simple outline, convex or not, is cut into convex parts that cover its area once', () => {
  let concave = 0
  for (const [i, r] of ref.simple.entries()) {
    const parts = convexParts(r.ring)
    near(sum(parts), r.area, `outline ${i} parts`)
    if (!r.convex) concave++
    else assert.equal(parts.length, 1, `outline ${i} is convex and comes back whole`)
    for (const p of parts) assert.ok(p.length >= 3 && !selfCrossing(p))
    for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
      const both = clipConvex(parts[a], parts[b])
      assert.ok(both.length === 0 || area(both) < 1e-9, `outline ${i}: parts ${a} and ${b} overlap`)
    }
  }
  assert.ok(concave > 80, `${concave} concave outlines`)
})
