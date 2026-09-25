"""Building outlines for one ward, from Google Open Buildings v3 (CC BY 4.0).

Usage:
  python3 scripts/geo/ward_buildings.py BUILDINGS_CSV WARDS_GEOJSON WARD_SLUG OUT_GEOJSON

BUILDINGS_CSV is the Open Buildings v3 CSV (or an extract of it) with columns
latitude, longitude, area_in_meters, confidence, geometry (WKT), full_plus_code.
For Nairobi, tile 183 of the v3 polygons_s2_level_4_gzip set covers the county:
  https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/183_buildings.csv.gz

Keeps each building whose centre lies inside the ward, at confidence 0.65 or
more (Google's suggested threshold), and writes GeoJSON whose feature
property "pc" is the building's plus code: a stable id the field app records
against a door visit. Coordinates are kept to 6 decimals (about 0.1 m).
"""
import csv
import json
import re
import sys

MIN_CONFIDENCE = 0.65

csv.field_size_limit(10_000_000)


def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def inside_polygon(x, y, polygon):
    hit = False
    for ring in polygon:
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def parse_wkt_polygon(wkt):
    """POLYGON((x y, ...), (x y, ...)) -> [[[x, y], ...], ...]; None for anything else.

    Each innermost bracket group is one ring: the outline, then any holes
    (courtyards), however the separators are spaced.
    """
    wkt = wkt.strip()
    if not wkt.upper().startswith("POLYGON"):
        return None
    rings = []
    for part in re.findall(r"\(([^()]+)\)", wkt):
        ring = []
        for pair in part.split(","):
            xs = pair.split()
            ring.append([round(float(xs[0]), 6), round(float(xs[1]), 6)])
        if len(ring) >= 4:
            rings.append(ring)
    return rings or None


def main():
    src, wards_path, slug, out = sys.argv[1:5]
    wards = json.load(open(wards_path))
    ward = next((f for f in wards["features"] if f["properties"]["slug"] == slug), None)
    if ward is None:
        sys.exit(f"No ward with slug {slug!r} in {wards_path}")
    polys = rings_of(ward["geometry"])
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)

    features, low_conf, seen = [], 0, set()
    with open(src, newline="") as fh:
        for row in csv.DictReader(fh):
            lat, lng = float(row["latitude"]), float(row["longitude"])
            if not (miny <= lat <= maxy and minx <= lng <= maxx):
                continue
            if not any(inside_polygon(lng, lat, p) for p in polys):
                continue
            if float(row["confidence"]) < MIN_CONFIDENCE:
                low_conf += 1
                continue
            pc = row["full_plus_code"].strip()
            geom = parse_wkt_polygon(row["geometry"])
            if not pc or geom is None or pc in seen:
                continue
            seen.add(pc)
            features.append({
                "type": "Feature",
                "properties": {"pc": pc, "a": round(float(row["area_in_meters"]))},
                "geometry": {"type": "Polygon", "coordinates": geom},
            })

    json.dump(
        {
            "type": "FeatureCollection",
            "attribution": "Buildings: Google Open Buildings v3, CC BY 4.0",
            "ward": slug,
            "features": features,
        },
        open(out, "w"),
        separators=(",", ":"),
    )
    print(f"{slug}: {len(features)} buildings kept, {low_conf} below confidence {MIN_CONFIDENCE}")


main()
