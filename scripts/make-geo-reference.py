#!/usr/bin/env python3
"""Writes the reference fixtures the geography tests compare against. Each one
comes from a library that shares no code with Sunspill:

  declination-reference.json  World Magnetic Model 2025 through pygeomag
  compass-reference.json      phone angles to headings with numpy rotation matrices
  geo-reference.json          east and north offsets from pyproj (WGS84 topocentric)
                              and map tile numbers from the slippy map formula
  zone-reference.json         time zones from timezonefinder, the polygons of
                              the timezone-boundary-builder project

  python3 -m venv .venv && .venv/bin/pip install pygeomag pyproj timezonefinder numpy
  .venv/bin/python scripts/make-geo-reference.py
"""
import json
import math
import random
from pathlib import Path

import numpy as np
from pygeomag import GeoMag
from pyproj import Transformer
from timezonefinder import TimezoneFinder

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures"


def write(name, source, columns, rows):
    (OUT / name).write_text(json.dumps({"source": source, "columns": columns, "rows": rows}, separators=(",", ":")))
    print(name, len(rows))


def declination():
    geo = GeoMag(coefficients_file="wmm/WMM_2025.COF")
    random.seed(3)
    places = [(25.033, 121.565), (40.7, -74.0), (51.5, -0.1), (-33.9, 151.2), (64.1, -21.9), (61.2, -149.9), (35.68, 139.65), (-23.55, -46.63), (1.35, 103.82), (-54.8, -68.3), (78.2, 15.6), (-77.8, 166.7), (0, 0), (19.4, -99.1), (55.75, 37.6)]
    rows = []
    for lat, lon in places:
        for year in (2025.5, 2026.77, 2028.2):
            rows.append([lat, lon, year, 0, geo.calculate(glat=lat, glon=lon, alt=0, time=year).d])
    for _ in range(60):
        lat, lon, year, alt = random.uniform(-80, 80), random.uniform(-180, 180), random.uniform(2025, 2030), random.choice([0, 0, 0.5, 3])
        rows.append([round(lat, 4), round(lon, 4), round(year, 3), alt, geo.calculate(glat=lat, glon=lon, alt=alt, time=year).d])
    write("declination-reference.json", "pygeomag, WMM_2025.COF", ["lat", "lon", "year", "heightKm", "declination"], rows)


def rot(axis, a):
    c, s = math.cos(a), math.sin(a)
    return np.array({"z": [[c, -s, 0], [s, c, 0], [0, 0, 1]], "x": [[1, 0, 0], [0, c, -s], [0, s, c]], "y": [[c, 0, s], [0, 1, 0], [-s, 0, c]]}[axis])


def compass():
    random.seed(21)
    rows = []
    for _ in range(120):
        alpha, beta, gamma = random.uniform(0, 360), random.uniform(-180, 180), random.uniform(-90, 90)
        r = rot("z", math.radians(alpha)) @ rot("x", math.radians(beta)) @ rot("y", math.radians(gamma))
        back = -r @ np.array([0, 0, 1.0])
        top = r @ np.array([0, 1.0, 0])
        rows.append([alpha, beta, gamma, math.degrees(math.atan2(back[0], back[1])) % 360, math.degrees(math.atan2(top[0], top[1])) % 360, math.hypot(back[0], back[1])])
    write("compass-reference.json", "numpy, Rz(alpha) Rx(beta) Ry(gamma) as in the W3C DeviceOrientation specification", ["alpha", "beta", "gamma", "backBearing", "topBearing", "upright"], rows)


def tiles(lon, lat, z):
    n = 2**z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def geo():
    random.seed(8)
    rows = []
    for _ in range(80):
        lat0, lon0 = random.uniform(-62, 70), random.uniform(-180, 180)
        topo = Transformer.from_pipeline(f"+proj=pipeline +step +proj=cart +ellps=WGS84 +step +proj=topocentric +ellps=WGS84 +lat_0={lat0} +lon_0={lon0} +h_0=0")
        # points up to 400 m from the centre, which is the radius buildings are loaded from
        dlat = random.uniform(-400, 400) / 111000
        dlon = random.uniform(-400, 400) / (111000 * math.cos(math.radians(lat0)))
        lat, lon = lat0 + dlat, lon0 + dlon
        e, n, _u = topo.transform(lon, lat, 0)
        rows.append([lat0, lon0, lat, lon, e, n])
    write("geo-reference.json", "pyproj 3, WGS84 topocentric east and north in metres", ["lat0", "lon0", "lat", "lon", "east", "north"], rows)
    random.seed(9)
    trows = []
    for _ in range(40):
        lat, lon, z = random.uniform(-80, 80), random.uniform(-180, 180), random.randint(2, 19)
        x, y = tiles(lon, lat, z)
        trows.append([lat, lon, z, x, y])
    write("tile-reference.json", "slippy map tile formula, wiki.openstreetmap.org/wiki/Slippy_map_tilenames", ["lat", "lon", "zoom", "x", "y"], trows)


def zones():
    finder = TimezoneFinder()
    random.seed(5)
    rows = []
    for lat, lon in [(25.033, 121.565), (22.63, 120.3), (24.15, 120.67), (35.68, 139.65), (40.71, -74.0), (33.45, -112.07), (39.77, -86.15), (-33.87, 151.2), (51.5, -0.12), (48.85, 2.35), (37.57, 126.98), (31.23, 121.47), (19.43, -99.13), (-23.55, -46.63), (52.52, 13.4), (55.75, 37.6), (28.61, 77.21), (25.2, 55.27), (-26.2, 28.04), (49.28, -123.12)]:
        rows.append([lat, lon, finder.timezone_at(lat=lat, lng=lon)])
    for _ in range(300):
        lat, lon = random.uniform(-55, 65), random.uniform(-170, 175)
        zone = finder.timezone_at(lat=lat, lng=lon)
        if zone:
            rows.append([round(lat, 4), round(lon, 4), zone])
    write("zone-reference.json", "timezonefinder, timezone-boundary-builder polygons", ["lat", "lon", "zone"], rows)


if __name__ == "__main__":
    declination()
    compass()
    geo()
    zones()
