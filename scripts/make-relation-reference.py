#!/usr/bin/env python3
"""Writes test/fixtures/overpass-relations.json: building relations as the Overpass
API really returned them, and for each one the outline that shapely and pyproj
find. Shapely joins the outer ways end to end (linemerge, polygonize) and
measures the area in an azimuthal equidistant projection, which shares no code
with src/core/osm.js. The tests compare the page's outlines with these.

The relations were fetched with the query that buildingQuery() makes, around
the points below, on 2026-10-10 (OpenStreetMap contributors, ODbL):
  25.0478 121.5170  Taipei Main Station, two relations whose outer ring is 2 to 3 ways
  25.0338 121.5645  Taipei 101, an outer ring of 80 points with four inner rings
  25.0611 121.5445  an apartment block with a courtyard

  python3 -m venv .venv && .venv/bin/pip install shapely pyproj
  .venv/bin/python scripts/make-relation-reference.py raw-station.json 25.0478 121.5170 raw-t101.json ...
Each pair of arguments is an Overpass answer file and the point it was asked for.
"""
import json
import sys
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge, polygonize

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "overpass-relations.json"


def main(args):
    elements = []
    expected = {}
    centers = {}
    for path, lat, lon in zip(args[0::3], args[1::3], args[2::3]):
        lat, lon = float(lat), float(lon)
        to_m = Transformer.from_crs("EPSG:4326", f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84", always_xy=True)
        for el in json.load(open(path))["elements"]:
            if el["type"] != "relation" or "members" not in el:
                continue
            proj = lambda geometry: [to_m.transform(g["lon"], g["lat"]) for g in geometry]
            outer = [LineString(proj(m["geometry"])) for m in el["members"] if m["type"] == "way" and m["role"] == "outer"]
            inner = [Polygon(proj(m["geometry"])) for m in el["members"] if m["type"] == "way" and m["role"] == "inner" and len(m["geometry"]) >= 4]
            rings = list(polygonize(linemerge(outer)))
            expected[str(el["id"])] = {
                "rings": len(rings),
                "area": round(sum(r.area for r in rings), 2),
                "inner": round(sum(i.area for i in inner), 2),
                "ways": sum(1 for m in el["members"] if m["type"] == "way" and m["role"] == "outer"),
            }
            centers[str(el["id"])] = {"lat": lat, "lon": lon}
            keep = {k: el[k] for k in ("type", "id", "tags")}
            keep["members"] = [{"type": m["type"], "role": m["role"], "geometry": m["geometry"]} for m in el["members"] if m["type"] == "way"]
            elements.append(keep)
    OUT.write_text(json.dumps({"source": "Overpass API answers to buildingQuery(), OpenStreetMap contributors, ODbL; areas from shapely linemerge and polygonize in an aeqd projection of pyproj", "centers": centers, "expected": expected, "elements": elements}, separators=(",", ":")))
    print(OUT, len(elements), expected)


if __name__ == "__main__":
    main(sys.argv[1:])
