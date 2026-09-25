// Geometry for the ward map and the field app. Small, pure and tested: no
// map library needed, so the field app can match a GPS fix to a building
// on a phone with no signal.

export type LngLat = [number, number];
export type Ring = LngLat[];

export type BuildingCollection = {
  type: "FeatureCollection";
  attribution?: string;
  ward?: string;
  features: {
    type: "Feature";
    properties: { pc: string; a: number };
    geometry: { type: "Polygon"; coordinates: Ring[] };
  }[];
};

/** A building outline with its plus code (the id visits are recorded against). */
export type Building = { id: string; area: number; centre: LngLat; rings: Ring[] };

export type Box = { west: number; south: number; east: number; north: number };

const EARTH_M = 6_371_000;
const RAD = Math.PI / 180;

/** Metres between two points. Equirectangular: well under 1% off across a ward. */
export function distanceM(a: LngLat, b: LngLat): number {
  const x = (b[0] - a[0]) * RAD * Math.cos(((a[1] + b[1]) / 2) * RAD);
  const y = (b[1] - a[1]) * RAD;
  return Math.hypot(x, y) * EARTH_M;
}

/** Local metres east (x) and north (y) of an origin, for drawing without map tiles. */
export function toLocalM(p: LngLat, origin: LngLat): [number, number] {
  return [
    (p[0] - origin[0]) * RAD * Math.cos(origin[1] * RAD) * EARTH_M,
    (p[1] - origin[1]) * RAD * EARTH_M,
  ];
}

function inRing(p: LngLat, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Inside the outline and not in a hole (a courtyard). */
export function inPolygon(p: LngLat, rings: Ring[]): boolean {
  let hit = false;
  for (const ring of rings) if (inRing(p, ring)) hit = !hit;
  return hit;
}

/** Area-weighted centre of an outline; the vertex average if it is degenerate. */
export function ringCentre(ring: Ring): LngLat {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-18) {
    const n = Math.max(ring.length, 1);
    return [ring.reduce((s, c) => s + c[0], 0) / n, ring.reduce((s, c) => s + c[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function toBuildings(fc: BuildingCollection): Building[] {
  return fc.features
    .filter((f) => f.geometry?.type === "Polygon" && f.geometry.coordinates[0]?.length)
    .map((f) => ({
      id: f.properties.pc,
      area: f.properties.a,
      rings: f.geometry.coordinates,
      centre: ringCentre(f.geometry.coordinates[0]!),
    }));
}

/**
 * The building someone is standing at: the one whose outline contains the
 * fix, else the nearest centre within maxM metres. Phones are rarely better
 * than 5-10 m, so a fix on the pavement outside still finds the house.
 */
export function nearestBuilding(
  p: LngLat,
  buildings: Building[],
  maxM = 30,
): { building: Building; distanceM: number } | null {
  let best: { building: Building; distanceM: number } | null = null;
  // A degree of latitude is ~111 km: skip anything clearly out of range cheaply.
  const pad = (maxM + 200) / 111_000;
  for (const b of buildings) {
    if (Math.abs(b.centre[1] - p[1]) > pad || Math.abs(b.centre[0] - p[0]) > pad) continue;
    if (inPolygon(p, b.rings)) return { building: b, distanceM: 0 };
    const d = distanceM(p, b.centre);
    if (d <= maxM && (!best || d < best.distanceM)) best = { building: b, distanceM: d };
  }
  return best;
}

/** Buildings within radiusM of a point, nearest first, for picking by hand. */
export function buildingsNear(
  p: LngLat,
  buildings: Building[],
  radiusM = 80,
  limit = 80,
): { building: Building; distanceM: number }[] {
  const pad = (radiusM + 50) / 111_000;
  const near: { building: Building; distanceM: number }[] = [];
  for (const b of buildings) {
    if (Math.abs(b.centre[1] - p[1]) > pad || Math.abs(b.centre[0] - p[0]) > pad) continue;
    const d = inPolygon(p, b.rings) ? 0 : distanceM(p, b.centre);
    if (d <= radiusM) near.push({ building: b, distanceM: d });
  }
  return near.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

export function inBox(p: LngLat, box: Box): boolean {
  return p[0] >= box.west && p[0] <= box.east && p[1] >= box.south && p[1] <= box.north;
}

/** The box around every coordinate in a (Multi)Polygon, for fitting the map to it. */
export function boundsOf(geometry: { type: string; coordinates: unknown }): Box {
  const box: Box = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      box.west = Math.min(box.west, c[0]);
      box.east = Math.max(box.east, c[0]);
      box.south = Math.min(box.south, c[1]);
      box.north = Math.max(box.north, c[1]);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  return box;
}
