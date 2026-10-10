#!/usr/bin/env python3
"""Writes test/fixtures/twd97-reference.json: points on the TWD97 TM2 grid (EPSG:3826) and their latitude and
longitude from pyproj, a library that shares no code with Sunspill. scripts/lib/twd97.mjs is tested against it.

  python3 -m venv .venv && .venv/bin/pip install pyproj
  .venv/bin/python scripts/make-twd97-reference.py
"""
import json
import random
from pathlib import Path

from pyproj import Transformer

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "twd97-reference.json"


def main():
    to_geo = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
    random.seed(97)
    # the four cities of the deals data, the edges of the island and the middle line, then random points across Taiwan
    points = [(306847.966, 2772208.374), (298143.043, 2767433.787), (217337.128, 2671158.633), (282372.09, 2766451.47),
              (250000.0, 2600000.0), (170000.0, 2400000.0), (350000.0, 2800000.0), (330000.0, 2540000.0)]
    points += [(random.uniform(150000, 360000), random.uniform(2420000, 2800000)) for _ in range(120)]
    rows = []
    for x, y in points:
        lon, lat = to_geo.transform(x, y)
        rows.append([round(x, 3), round(y, 3), lat, lon])
    OUT.write_text(json.dumps({"source": "pyproj EPSG:3826 to EPSG:4326", "columns": ["x", "y", "lat", "lon"], "rows": rows}, separators=(",", ":")))
    print(OUT.name, len(rows))


main()
