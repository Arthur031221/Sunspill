#!/usr/bin/env python3
"""Writes test/fixtures/solar-reference.json: sun positions from the NREL
Solar Position Algorithm as implemented in pvlib, for the places, days and
local times the tests compare src/core/solar.js against.

  python3 -m venv .venv && .venv/bin/pip install pvlib && .venv/bin/python scripts/make-reference.py
"""
import json
from pathlib import Path

import pandas as pd
import pvlib

PLACES = [
    ("Taipei", 25.033, 121.565, "Asia/Taipei"),
    ("Singapore", 1.3521, 103.8198, "Asia/Singapore"),
    ("Quito", -0.1807, -78.4678, "America/Guayaquil"),
    ("Sydney", -33.8688, 151.2093, "Australia/Sydney"),
    ("Cape Town", -33.9249, 18.4241, "Africa/Johannesburg"),
    ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik"),
    ("Tromso", 69.6492, 18.9553, "Europe/Oslo"),
    ("New York", 40.7128, -74.006, "America/New_York"),
    ("Los Angeles", 34.0522, -118.2437, "America/Los_Angeles"),
    ("London", 51.5072, -0.1276, "Europe/London"),
    ("Mumbai", 19.076, 72.8777, "Asia/Kolkata"),
    ("Tokyo", 35.6762, 139.6503, "Asia/Tokyo"),
    ("Sao Paulo", -23.5505, -46.6333, "America/Sao_Paulo"),
    ("Dubai", 25.2048, 55.2708, "Asia/Dubai"),
    ("Auckland", -36.8509, 174.7645, "Pacific/Auckland"),
]
DAYS = ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21", "2026-08-09"]
CLOCKS = ["08:00", "10:30", "12:00", "14:00", "16:30", "18:30"]

rows = []
for name, lat, lon, tz in PLACES:
    for day in DAYS:
        for clock in CLOCKS:
            local = pd.Timestamp(f"{day} {clock}", tz=tz)
            utc = local.tz_convert("UTC")
            pos = pvlib.solarposition.spa_python(pd.DatetimeIndex([utc]), lat, lon, altitude=0, pressure=101325, temperature=10, delta_t=0.0).iloc[0]
            if pos["apparent_elevation"] < 0.5:
                continue
            rows.append({
                "place": name, "lat": lat, "lon": lon, "zone": tz,
                "local": f"{day} {clock}", "utcMs": int(utc.timestamp() * 1000),
                "azimuth": round(float(pos["azimuth"]), 5),
                "elevation": round(float(pos["elevation"]), 5),
                "apparent": round(float(pos["apparent_elevation"]), 5),
            })

out = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "solar-reference.json"
out.write_text(json.dumps({"source": f"pvlib {pvlib.__version__} solarposition.spa_python, delta_t=0, 101325 Pa, 10 C", "rows": rows}, indent=0) + "\n")
print(len(rows), "rows ->", out)
