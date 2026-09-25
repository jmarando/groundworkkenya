"""Maps for the demo scenarios: Kenya's 47 counties and Mathira's 6 wards.

Usage (run in a folder holding the two inputs):
  python3 demo_maps.py public/geo

Inputs:
  ken_adm1_full.geojson  geoBoundaries gbOpen KEN ADM1 (counties)
  ken_adm3_full.geojson  geoBoundaries gbOpen KEN ADM3 (wards; Omare & Omare 2020, CC BY 4.0)
      both from https://www.geoboundaries.org/api/current/gbOpen/KEN/<level>/

Writes kenya-counties.json (simplified to about 900 m, enough for a national map)
and mathira-wards.json (about 17 m), each feature carrying {slug, name}.
"""
import json
import re
import sys

ADM1 = "ken_adm1_full.geojson"
ADM3 = "ken_adm3_full.geojson"
OUT = sys.argv[1] if len(sys.argv) > 1 else "."

MATHIRA = ["Ruguru", "Magutu", "Iriaini", "Konyu", "Kirimukuyu", "Karatina Town"]
# geoBoundaries names that differ from the official county name.
COUNTY_NAMES = {"Tharaka": "Tharaka-Nithi"}


def simplify(ring, tol):
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

    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    out = dp(ring[: far + 1])[:-1] + dp(ring[far:])
    return out if len(out) >= 4 else ring


def rings(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def area(ring):
    return abs(sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))) / 2


def inside(pt, polygon):
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
    """Centroid of the largest polygon, or a point on a line through it for concave shapes."""
    polys = sorted(rings(geom), key=lambda p: area(p[0]), reverse=True)
    if not polys:
        return None
    poly = polys[0]
    ring = poly[0]
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
        a += f
        cx += (ring[i][0] + ring[i + 1][0]) * f
        cy += (ring[i][1] + ring[i + 1][1]) * f
    c = (cx / (3 * a), cy / (3 * a)) if a else tuple(ring[0][:2])
    if inside(c, poly):
        return c
    xs = [p[0] for p in ring]
    for k in range(1, 200):
        cand = (min(xs) + (max(xs) - min(xs)) * k / 200, c[1])
        if inside(cand, poly):
            return cand
    return tuple(ring[0][:2])


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def shrink(geom, tol, nd, min_area):
    """Simplify every ring, drop specks (small islands), round the coordinates."""
    polys = []
    for poly in rings(geom):
        outer = simplify(poly[0], tol)
        if area(outer) < min_area:
            continue
        holes = [simplify(h, tol) for h in poly[1:]]
        holes = [h for h in holes if area(h) >= min_area]
        polys.append([[[round(x, nd), round(y, nd)] for x, y, *_ in ring] for ring in [outer, *holes]])
    if not polys:  # keep the largest piece of anything that would vanish
        biggest = max(rings(geom), key=lambda p: area(p[0]))
        polys = [[[[round(x, nd), round(y, nd)] for x, y, *_ in simplify(biggest[0], tol)]]]
    if len(polys) == 1:
        return {"type": "Polygon", "coordinates": polys[0]}
    return {"type": "MultiPolygon", "coordinates": polys}


def write(path, features):
    json.dump({"type": "FeatureCollection", "features": features}, open(path, "w"), separators=(",", ":"))


adm1 = json.load(open(ADM1))
counties = []
for f in adm1["features"]:
    raw = f["properties"]["shapeName"]
    name = COUNTY_NAMES.get(raw, raw)
    counties.append({
        "type": "Feature",
        "properties": {"slug": slug(name), "name": name},
        "geometry": shrink(f["geometry"], tol=0.008, nd=3, min_area=0.0004),
    })
counties.sort(key=lambda f: f["properties"]["slug"])
write(f"{OUT}/kenya-counties.json", counties)
print("counties:", len(counties))

nyeri = next(f for f in adm1["features"] if f["properties"]["shapeName"] == "Nyeri")
adm3 = json.load(open(ADM3))
wards = []
for f in adm3["features"]:
    name = f["properties"]["shapeName"]
    if name not in MATHIRA:
        continue
    p = interior_point(f["geometry"])
    if not p or not any(inside(p, poly) for poly in rings(nyeri["geometry"])):
        continue
    wards.append({
        "type": "Feature",
        "properties": {"slug": slug(name), "name": name},
        "geometry": shrink(f["geometry"], tol=0.00015, nd=5, min_area=0.0),
    })
wards.sort(key=lambda f: f["properties"]["slug"])
write(f"{OUT}/mathira-wards.json", wards)
print("Mathira wards:", len(wards), [w["properties"]["name"] for w in wards])
missing = set(MATHIRA) - {w["properties"]["name"] for w in wards}
print("missing:", sorted(missing) or "none")
