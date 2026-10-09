#!/usr/bin/env python3
"""Writes test/fixtures/polygon-reference.json: the answers shapely gives for the
polygon work that every sun patch goes through. Sunspill's own code is in
src/core/poly.js and the convex split in src/core/obstacles.js. Shapely (GEOS)
shares nothing with it. The cases:

  pairs   two convex polygons: area of the overlap, of A minus B and of both together,
          whether random points are inside A, and the centroid of A
  sets    two to six overlapping convex polygons: the area they cover together
  rings   closed paths with random corners: whether any two edges cross (about half do)
  simple  simple outlines that are not convex (stars and combs): the area, which the
          convex parts that Sunspill cuts them into must add up to without overlap

  python3 -m venv .venv && .venv/bin/pip install shapely numpy
  .venv/bin/python scripts/make-polygon-reference.py
"""
import json
import math
import random
from pathlib import Path

from shapely.geometry import MultiPoint, Point, Polygon
from shapely.ops import unary_union

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "polygon-reference.json"
random.seed(11)


def r6(v):
    return round(v, 6)


def pt(spread=5.0):
    return (r6(random.uniform(-spread, spread)), r6(random.uniform(-spread, spread)))


def convex(center=(0.0, 0.0), spread=4.0):
    while True:
        pts = [(r6(center[0] + random.uniform(-spread, spread)), r6(center[1] + random.uniform(-spread, spread))) for _ in range(random.randint(3, 9))]
        hull = MultiPoint(pts).convex_hull
        if hull.geom_type == "Polygon" and hull.area > 0.5:
            ring = list(hull.exterior.coords)[:-1]
            # either winding, since the page meets both
            return ring if random.random() < 0.5 else ring[::-1]


def coords(poly):
    return [list(p) for p in poly]


def star(corners, inner=0.3):
    out = []
    for i in range(corners):
        a = 2 * math.pi * i / corners + random.uniform(-0.1, 0.1)
        r = random.uniform(inner, 1.0) * 5
        out.append((r6(r * math.cos(a)), r6(r * math.sin(a))))
    return out


def comb(teeth):
    width = r6(1.0 + random.random())
    top = []
    for i in range(teeth):
        x = i * 2 * width
        top += [(r6(x), 0), (r6(x), r6(random.uniform(2, 5))), (r6(x + width), r6(random.uniform(2, 5))), (r6(x + width), 0)]
    return [(0, -1)] + top + [(r6((teeth * 2 - 1) * width), -1)]


def main():
    pairs = []
    for _ in range(300):
        a = convex()
        b = convex(center=(r6(random.uniform(-2, 2)), r6(random.uniform(-2, 2))))
        pa, pb = Polygon(a), Polygon(b)
        probes = []
        for _ in range(8):
            p = pt(6)
            # a point on the edge is a coin toss for any code, so those are left out
            if pa.exterior.distance(Point(p)) > 1e-6:
                probes.append([p[0], p[1], pa.contains(Point(p))])
        c = pa.centroid
        pairs.append({
            "a": coords(a), "b": coords(b),
            "inter": pa.intersection(pb).area, "diff": pa.difference(pb).area, "union": pa.union(pb).area,
            "probes": probes, "centroid": [c.x, c.y],
        })
    sets = []
    for _ in range(150):
        polys = [convex(center=(r6(random.uniform(-2, 2)), r6(random.uniform(-2, 2))), spread=3.0) for _ in range(random.randint(2, 6))]
        sets.append({"polys": [coords(p) for p in polys], "area": unary_union([Polygon(p) for p in polys]).area})
    rings = []
    for _ in range(300):
        ring = [pt() for _ in range(random.randint(4, 9))]
        rings.append({"ring": coords(ring), "crossing": not Polygon(ring).is_valid})
    for _ in range(100):
        ring = star(random.randint(5, 14))
        rings.append({"ring": coords(ring), "crossing": not Polygon(ring).is_valid})
    simple = []
    for i in range(160):
        ring = star(random.randint(5, 16)) if i % 4 else comb(random.randint(2, 5))
        poly = Polygon(ring)
        if not poly.is_valid or poly.area < 1:
            continue
        if random.random() < 0.5:
            ring = ring[::-1]
        simple.append({"ring": coords(ring), "area": poly.area, "convex": abs(poly.convex_hull.area - poly.area) < 1e-9})
    OUT.write_text(json.dumps({"source": "shapely (GEOS) answers for the polygon work in src/core/poly.js and the convex split in src/core/obstacles.js", "pairs": pairs, "sets": sets, "rings": rings, "simple": simple}, separators=(",", ":")))
    print(OUT, len(pairs), len(sets), len(rings), len(simple), sum(r["crossing"] for r in rings))


main()
