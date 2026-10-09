#!/usr/bin/env python3
"""Writes test/fixtures/obstacle-reference.json: which points of a room are in
direct sun when buildings, trees, a balcony rail and an eave stand outside,
worked out without any of Sunspill's code.

  * The sun comes from the NREL Solar Position Algorithm in pvlib.
  * The room, its windows and the buildings are placed in a world frame of
    metres east, north and up, using compass bearings only.
  * Each probe point is traced to the sun with shapely: the ray leaves the room
    through a window, and every building, tree, rail and eave is an extruded
    polygon that the ray is intersected with, whatever its shape.

Sunspill's answer for the same probes is compared in test/obstacles.test.js.

  python3 -m venv .venv && .venv/bin/pip install pvlib shapely numpy pandas
  .venv/bin/python scripts/make-obstacle-reference.py
"""
import json
import math
import random
from pathlib import Path

import numpy as np
import pandas as pd
import pvlib
from shapely.geometry import LineString, Point, Polygon

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "obstacle-reference.json"
PLACES = [
    ("Taipei", 25.033, 121.565, "Asia/Taipei"), ("Singapore", 1.3521, 103.8198, "Asia/Singapore"), ("Sydney", -33.8688, 151.2093, "Australia/Sydney"),
    ("London", 51.5072, -0.1276, "Europe/London"), ("New York", 40.7128, -74.006, "America/New_York"), ("Tokyo", 35.6762, 139.6503, "Asia/Tokyo"),
    ("Sao Paulo", -23.5505, -46.6333, "America/Sao_Paulo"), ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik"),
]
WALLS = ["top", "right", "bottom", "left"]
MIN_NORMAL = 0.02  # the model ignores beams within about a degree of running along a wall
FLOOR_PROBES, WALL_PROBES = 100, 20


def halton(i, base):
    f, r = 1.0, 0.0
    while i > 0:
        f /= base
        r += f * (i % base)
        i //= base
    return r


def vec(bearing_deg):
    b = math.radians(bearing_deg)
    return np.array([math.sin(b), math.cos(b)])


class Case:
    def __init__(self, rng):
        r = rng.uniform
        self.place = rng.choice(PLACES)
        self.room = {"w": round(r(2.8, 6.0), 3), "d": round(r(2.8, 6.0), 3), "h": round(r(2.4, 3.2), 3), "wall": rng.choice([0, round(r(0.08, 0.3), 3)])}
        self.facing = round(r(0, 360), 1)
        self.floor = {"n": rng.randint(1, 8), "storey": round(r(2.8, 3.4), 2)}
        self.windows = []
        for wall in rng.sample(WALLS, rng.randint(1, 3)):
            length = self.room["w"] if wall in ("top", "bottom") else self.room["d"]
            w = round(r(1.0, min(3.5, length - 0.2)), 3)
            h = round(r(1.0, 2.0), 3)
            win = {"wall": wall, "w": w, "h": h, "pos": round(r(0.05, length - w - 0.05), 3), "sill": round(r(0, self.room["h"] - h - 0.05), 3),
                   "eave": {"depth": rng.choice([0, round(r(0.2, 1.0), 3)]), "gap": round(r(0, 0.3), 3), "ext": round(r(0, 0.6), 3)}, "across": None, "balcony": None}
            if rng.random() < 0.35:
                win["balcony"] = {"depth": round(r(0.6, 2.0), 3), "rail": round(r(0.4, 1.3), 3), "ext": round(r(0, 0.8), 3)}
            self.windows.append(win)
        self.obstacles = []
        for _ in range(rng.randint(1, 5)):
            bearing, dist = r(0, 360), r(8, 90)
            cx, cy = math.sin(math.radians(bearing)) * dist, math.cos(math.radians(bearing)) * dist
            if rng.random() < 0.3:
                self.obstacles.append({"type": "tree", "x": round(cx, 2), "y": round(cy, 2), "r": round(r(1.5, 5), 2), "h": round(r(5, 22), 1), "base": round(r(1, 4), 1), "on": True})
            else:
                size, turn = r(5, 25), r(0, math.pi)
                if rng.random() < 0.5:
                    base = [(-1, -1), (1, -1), (1, 0), (0, 0), (0, 1), (-1, 1)]  # an L
                else:
                    k = rng.randint(3, 7)
                    base = []
                    for j in range(k):
                        rad = r(0.6, 1.0)
                        base.append((math.cos(2 * math.pi * j / k) * rad, math.sin(2 * math.pi * j / k) * rad))
                ring = [[round(cx + size * (u * math.cos(turn) - v * math.sin(turn)), 2), round(cy + size * (u * math.sin(turn) + v * math.cos(turn)), 2)] for u, v in base]
                self.obstacles.append({"type": "building", "ring": ring, "h": round(r(6, 45), 1), "base": 0, "on": True})


def sun_for(case, rng):
    """A date and time when the sun is above 5 degrees and in front of one of the windows."""
    lat, lon, tz = case.place[1], case.place[2], case.place[3]
    for _ in range(400):
        month, day = rng.randint(1, 12), rng.randint(1, 28)
        minutes = rng.randint(6 * 60, 19 * 60)
        local = pd.Timestamp(f"2026-{month:02d}-{day:02d} {minutes // 60:02d}:{minutes % 60:02d}", tz=tz)
        pos = pvlib.solarposition.spa_python(pd.DatetimeIndex([local.tz_convert("UTC")]), lat, lon, altitude=0, pressure=101325, temperature=10, delta_t=0.0).iloc[0]
        az, el = float(pos["azimuth"]), float(pos["apparent_elevation"])
        if not 5 < el < 65:
            continue
        for win in case.windows:
            bearing = case.facing + 90 * WALLS.index(win["wall"])
            off = abs((az - bearing + 180) % 360 - 180)
            if off < 55:
                return {"month": month, "day": day, "minutes": minutes, "azimuth": az, "elevation": el}
    return None


class Tracer:
    """Rays against a room with thick walls, in world metres east, north and up."""

    def __init__(self, case, sun):
        self.c = case
        a, e = math.radians(sun["azimuth"]), math.radians(sun["elevation"])
        self.S = np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])
        self.lift = (case.floor["n"] - 1) * case.floor["storey"]
        room = case.room
        self.walls = {}
        for k, name in enumerate(WALLS):
            bearing = case.facing + 90 * k
            n = vec(bearing)
            t = vec(bearing + 90)  # to the right of someone inside looking out through the wall
            half = room["d"] / 2 if name in ("top", "bottom") else room["w"] / 2
            length = room["w"] if name in ("top", "bottom") else room["d"]
            self.walls[name] = {"n": n, "t": t, "centre": n * half, "length": length, "start": n * half - t * length / 2}
        self.prisms = []
        for o in case.obstacles:
            if o["type"] == "tree":
                ring = [(o["x"] + 1.02 * o["r"] * math.cos(i * math.pi / 6), o["y"] + 1.02 * o["r"] * math.sin(i * math.pi / 6)) for i in range(12)]
            else:
                ring = [tuple(p) for p in o["ring"]]
            self.prisms.append((Polygon(ring), o["base"] - self.lift, o["h"] - self.lift))

    def to_world(self, x, y):
        """Room coordinates (x right, y up the plan) from the compass bearings of the top wall."""
        ydir, xdir = vec(self.c.facing), vec(self.c.facing + 90)
        return xdir * (x - self.c.room["w"] / 2) + ydir * (y - self.c.room["d"] / 2)

    def hits_prism(self, o, poly, z0, z1):
        sxy = self.S[:2]
        speed2 = float(sxy @ sxy)
        seg = LineString([tuple(o[:2]), tuple(o[:2] + sxy / math.sqrt(speed2) * 5000)])
        inter = seg.intersection(poly)
        if inter.is_empty:
            return False
        parts = [inter] if inter.geom_type == "LineString" else [g for g in getattr(inter, "geoms", []) if g.geom_type == "LineString"]
        for g in parts:
            ts = [float((np.array(p) - o[:2]) @ sxy / speed2) for p in g.coords]
            ta, tb = min(ts), max(ts)
            lo, hi = o[2] + ta * self.S[2], o[2] + tb * self.S[2]
            if max(lo, z0) < min(hi, z1) - 1e-9 and tb > 1e-12:
                return True
        return False

    def lit(self, p, obstacles=True):
        """Is the world point p = (x, y, z), z above the room floor, in direct sun?"""
        room = self.c.room
        ydir, xdir = vec(self.c.facing), vec(self.c.facing + 90)
        # leave the room: first of the four inner wall planes or the ceiling
        best, which = (room["h"] - p[2]) / self.S[2], None
        for name, w in self.walls.items():
            sn = float(self.S[:2] @ w["n"])
            if sn <= 1e-12:
                continue
            t = (float(w["centre"] @ w["n"]) - float(p[:2] @ w["n"])) / sn
            if 1e-9 < t < best:
                best, which = t, name
        if which is None:
            return False
        w = self.walls[which]
        sn = float(self.S[:2] @ w["n"])
        if sn < MIN_NORMAL:
            return False
        e = p + best * self.S
        for win in self.c.windows:
            if win["wall"] != which:
                continue
            thick = room["wall"]
            run = thick / sn
            o = e + run * self.S  # where the ray leaves the outer face
            u_in = float((e[:2] - w["start"]) @ w["t"]) - win["pos"]
            u_out = float((o[:2] - w["start"]) @ w["t"]) - win["pos"]
            top = win["sill"] + win["h"]
            if not (0 <= u_in <= win["w"] and win["sill"] <= e[2] <= top and 0 <= u_out <= win["w"] and win["sill"] <= o[2] <= top):
                continue
            # the eave: a thin horizontal plate above the window, out from the outer face
            eave = win["eave"]
            if eave["depth"] > 0:
                ze = top + eave["gap"]
                te = (ze - o[2]) / self.S[2]
                q = o + te * self.S
                out = float((q[:2] - o[:2]) @ w["n"]) + 0.0
                uq = float((q[:2] - w["start"]) @ w["t"]) - win["pos"]
                if te > 0 and 0 < out <= eave["depth"] + 1e-12 and -eave["ext"] <= uq <= win["w"] + eave["ext"]:
                    continue
            hit = False
            b = win["balcony"]
            if b and b["rail"] >= 0.05:
                # a rail 10 cm thick at the balcony depth, as wide as the window plus the extension on each side
                n, t = w["n"], w["t"]
                base = o[:2] - n * 0.0
                corner = lambda uu, vv: w["start"] + t * (win["pos"] + uu) + n * (float(w["start"] @ n) * 0 + 0) + n * vv  # noqa: E731
                # outer face plane passes through o: measure along n from the outer face
                outer = float(o[:2] @ n)
                def at(uu, vv):
                    return w["start"] + t * (win["pos"] + uu) + n * (outer - float(w["start"] @ n) + vv)
                ring = [at(-b["ext"], b["depth"]), at(win["w"] + b["ext"], b["depth"]), at(win["w"] + b["ext"], b["depth"] + 0.1), at(-b["ext"], b["depth"] + 0.1)]
                hit = self.hits_prism(o, Polygon([tuple(q) for q in ring]), -0.3, b["rail"])
                del base, corner
            if hit:
                continue
            if obstacles and any(self.hits_prism(o, poly, z0, z1) for poly, z0, z1 in self.prisms):
                continue
            return True
        return False

    def floor_probe(self, x, y, obstacles=True):
        w = self.to_world(x, y)
        return self.lit(np.array([w[0], w[1], 0.0]), obstacles)

    def wall_probe(self, name, u, z, obstacles=True):
        w = self.walls[name]
        if float(self.S[:2] @ w["n"]) >= -1e-9:
            return False
        p = w["start"] + w["t"] * u - w["n"] * 1e-7
        return self.lit(np.array([p[0], p[1], z]), obstacles)


def probes(room):
    floor = [(halton(i, 2) * room["w"], halton(i, 3) * room["d"]) for i in range(1, FLOOR_PROBES + 1)]
    walls = {}
    for name in WALLS:
        length = room["w"] if name in ("top", "bottom") else room["d"]
        walls[name] = [(halton(i, 2) * length, 0.05 + halton(i, 3) * (room["h"] - 0.1)) for i in range(1, WALL_PROBES + 1)]
    return floor, walls


def main(count=300, seed=2026):
    rng = random.Random(seed)
    cases = []
    while len(cases) < count:
        case = Case(rng)
        sun = sun_for(case, rng)
        if not sun:
            continue
        tr = Tracer(case, sun)
        floor, walls = probes(case.room)
        bits = [tr.floor_probe(x, y) for x, y in floor]
        bare = [tr.floor_probe(x, y, False) for x, y in floor]
        for name in WALLS:
            bits += [tr.wall_probe(name, u, z) for u, z in walls[name]]
            bare += [tr.wall_probe(name, u, z, False) for u, z in walls[name]]
        cases.append({
            "place": {"name": case.place[0], "lat": case.place[1], "lon": case.place[2], "zone": case.place[3]},
            "room": case.room, "facing": case.facing, "floor": case.floor, "windows": case.windows, "obstacles": case.obstacles, "sun": sun,
            "lit": "".join("1" if b else "0" for b in bits),
            "bare": "".join("1" if b else "0" for b in bare),
        })
    lit = sum(c["lit"].count("1") for c in cases)
    total = sum(len(c["lit"]) for c in cases)
    OUT.write_text(json.dumps({"source": "pvlib spa_python for the sun, shapely ray and extruded polygon tests for the shadows", "probes": {"floor": FLOOR_PROBES, "wall": WALL_PROBES, "scheme": "Halton bases 2 and 3 over the room, i from 1"}, "cases": cases}, separators=(",", ":")))
    shaded = sum(sum(1 for a, b in zip(c["bare"], c["lit"]) if a == "1" and b == "0") for c in cases)
    print(f"{len(cases)} cases, {total} probes, {lit} lit, {shaded} lit without the obstacles and dark with them")


if __name__ == "__main__":
    main()
