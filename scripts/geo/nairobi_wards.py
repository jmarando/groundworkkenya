"""Nairobi's wards from geoBoundaries KEN ADM3, matched to the wards in our database.

Usage (run in a folder holding the three inputs):
  python3 nairobi_wards.py public/geo/nairobi-wards.json

Inputs:
  ken_adm1_full.geojson  geoBoundaries gbOpen KEN ADM1 (counties)
  ken_adm3_full.geojson  geoBoundaries gbOpen KEN ADM3 (wards; Omare & Omare 2020, CC BY 4.0)
      both from https://www.geoboundaries.org/api/current/gbOpen/KEN/<level>/
  db_wards.json          [{slug, name, constituency}] exported from public.wards

Picks every ADM3 polygon whose interior point lies inside the Nairobi ADM1
polygon, matches it to a database ward by name, simplifies it to about 3 m and
writes a compact GeoJSON keyed by our ward slug. Reports anything it could not
match, both ways.
"""
import json
import re
import sys

ADM1 = "ken_adm1_full.geojson"
ADM3 = "ken_adm3_full.geojson"
DB = "db_wards.json"
OUT = sys.argv[1] if len(sys.argv) > 1 else "nairobi-wards.geojson"
# Douglas-Peucker tolerance: about 3 m at Nairobi's latitude.
TOL = 3 / 111_320


def simplify(ring, tol=TOL):
    """Douglas-Peucker on a closed ring, keeping the closing point."""
    if len(ring) <= 4:
        return ring

    def dp(pts):
        if len(pts) < 3:
            return pts
        (x1, y1), (x2, y2) = pts[0][:2], pts[-1][:2]
        dx, dy = x2 - x1, y2 - y1
        norm2 = dx * dx + dy * dy
        best, idx = -1.0, 0
        for i in range(1, len(pts) - 1):
            px, py = pts[i][0], pts[i][1]
            if norm2 == 0:
                d = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / norm2))
                d = ((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best <= tol:
            return [pts[0], pts[-1]]
        return dp(pts[: idx + 1])[:-1] + dp(pts[idx:])

    # Split the ring at its farthest point from the start, so both halves are open paths.
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    out = dp(ring[: far + 1])[:-1] + dp(ring[far:])
    return out if len(out) >= 4 else ring


def rings(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def inside(pt, polygon):
    """Even-odd rule over the outer ring and holes of one polygon."""
    x, y = pt
    hit = False
    for ring in polygon:
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def interior_point(geom):
    """Centroid of the largest polygon; falls back to a vertex if that lands outside (concave shapes)."""
    best, best_area = None, -1.0
    for poly in rings(geom):
        ring = poly[0]
        a = cx = cy = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[i + 1][0], ring[i + 1][1]
            f = x1 * y2 - x2 * y1
            a += f
            cx += (x1 + x2) * f
            cy += (y1 + y2) * f
        if abs(a) > best_area and a != 0:
            best_area = abs(a)
            best = (poly, (cx / (3 * a), cy / (3 * a)))
    if best is None:
        return None
    poly, c = best
    if inside(c, poly):
        return c
    # Concave: scan a horizontal line through the centroid for a point inside.
    xs = [p[0] for p in poly[0]]
    lo, hi = min(xs), max(xs)
    for k in range(1, 200):
        cand = (lo + (hi - lo) * k / 200, c[1])
        if inside(cand, poly):
            return cand
    return tuple(poly[0][0][:2])


def in_geom(pt, geom):
    return any(inside(pt, poly) for poly in rings(geom))


def norm(s):
    s = s.lower().replace("&", "and")
    s = re.sub(r"\bward\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def round_geom(geom, nd=5):
    def r(c):
        return [round(c[0], nd), round(c[1], nd)]

    def ring_out(ring):
        return [r(c) for c in simplify(ring)]

    if geom["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [ring_out(ring) for ring in geom["coordinates"]]}
    return {
        "type": "MultiPolygon",
        "coordinates": [[ring_out(ring) for ring in poly] for poly in geom["coordinates"]],
    }


adm1 = json.load(open(ADM1))
nairobi = next(f for f in adm1["features"] if f["properties"]["shapeName"].lower().startswith("nairobi"))
adm3 = json.load(open(ADM3))
db = json.load(open(DB))

picked = []
for f in adm3["features"]:
    p = interior_point(f["geometry"])
    if p and in_geom(p, nairobi["geometry"]):
        picked.append(f)

by_norm = {}
for w in db:
    by_norm.setdefault(norm(w["name"]), []).append(w)

# Names that differ between the two sources, seen once and fixed by hand.
ALIASES = {}

features, unmatched_geo, used = [], [], set()
for f in picked:
    name = f["properties"]["shapeName"]
    key = ALIASES.get(norm(name), norm(name))
    cands = by_norm.get(key, [])
    if not cands:
        # Try matching the first part of names like "Parklands/Highridge".
        cands = [w for k, ws in by_norm.items() for w in ws if k.startswith(key) or key.startswith(k)]
    if len(cands) != 1:
        unmatched_geo.append((name, [c["name"] for c in cands]))
        continue
    w = cands[0]
    if w["slug"] in used:
        unmatched_geo.append((name, ["duplicate of " + w["name"]]))
        continue
    used.add(w["slug"])
    features.append({
        "type": "Feature",
        "properties": {"slug": w["slug"], "name": w["name"], "constituency": w["constituency"]},
        "geometry": round_geom(f["geometry"]),
    })

unmatched_db = [w["name"] + " (" + w["constituency"] + ")" for w in db if w["slug"] not in used]
json.dump({"type": "FeatureCollection", "features": features}, open(OUT, "w"), separators=(",", ":"))

print(f"Nairobi polygons found: {len(picked)} · matched to database wards: {len(features)} of {len(db)}")
print("geo names not matched:", unmatched_geo or "none")
print("database wards without a shape:", unmatched_db or "none")
