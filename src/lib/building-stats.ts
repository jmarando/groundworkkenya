// How a place lives, from its buildings: the footprints in the house files
// (public/tiles, from Google Open Buildings v3) counted inside each ward, with
// the ward's size from its map. Pure: the script (scripts/atlas/buildings.ts)
// reads a house file and hands each building in.

import { boundsOf, wardAt, type Ring, type WardShape } from "@/lib/geo";

/** Under this a building is a small structure: a single room, a kiosk, a shack. */
export const SMALL_M2 = 40;
/** From this a building is a large house or block. */
export const LARGE_M2 = 200;

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_AT_EQUATOR = 111.32;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One ring's area in km², flat-projected around its middle latitude (fine at a ward's size). */
function ringKm2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lats = ring.map((p) => p[1]);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = KM_PER_DEG_LON_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    twice += x1 * kx * (y2 * KM_PER_DEG_LAT) - x2 * kx * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(twice) / 2;
}

/** An area's size in km²: each polygon's outer ring, less its holes. */
export function areaKm2(polygons: Ring[][]): number {
  return polygons.reduce((sum, [outer, ...holes]) => {
    const hole = holes.reduce((h, r) => h + ringKm2(r), 0);
    return sum + (outer ? ringKm2(outer) : 0) - hole;
  }, 0);
}

/** Which area a point falls in, or null: the Voters map's ward lookup, keyed by atlas key. */
export function makeLocator(
  areas: { key: string; polygons: Ring[][] }[],
): (lon: number, lat: number) => string | null {
  const shapes: WardShape[] = areas.map((a) => ({
    slug: a.key,
    polygons: a.polygons,
    box: boundsOf({ type: "MultiPolygon", coordinates: a.polygons }),
  }));
  return (lon, lat) => wardAt([lon, lat], shapes)?.slug ?? null;
}

export type BuildingStats = {
  buildings: number;
  buildings_per_km2: number;
  median_building_m2: number;
  small_building_share: number;
  large_building_share: number;
};

/** One area's building figures from its footprints (m²) and its size; null with no buildings. */
export function buildingStats(sizes: number[], km2: number): BuildingStats | null {
  if (!sizes.length || km2 <= 0) return null;
  const xs = [...sizes].sort((a, b) => a - b);
  const mid = xs.length / 2;
  const median = xs.length % 2 ? xs[Math.floor(mid)]! : (xs[mid - 1]! + xs[mid]!) / 2;
  return {
    buildings: xs.length,
    buildings_per_km2: Math.round(xs.length / km2),
    median_building_m2: Math.round(median),
    small_building_share: round3(xs.filter((m) => m < SMALL_M2).length / xs.length),
    large_building_share: round3(xs.filter((m) => m >= LARGE_M2).length / xs.length),
  };
}

export type AreaBuildings = { key: string; km2: number; sizes: number[] };

/**
 * The wards, then each constituency made from all its wards' buildings and
 * sizes. A constituency counts only when every one of its wards is mapped:
 * half a constituency would read as the whole.
 */
export function withConstituencies(
  wards: AreaBuildings[],
  constituencies: { key: string; wards: string[] }[],
): AreaBuildings[] {
  const byKey = new Map(wards.map((w) => [w.key, w]));
  const whole = constituencies.flatMap((c) => {
    const parts = c.wards.map((k) => byKey.get(k));
    if (!parts.length || parts.some((p) => !p)) return [];
    const ws = parts as AreaBuildings[];
    return [
      {
        key: c.key,
        km2: ws.reduce((t, w) => t + w.km2, 0),
        sizes: ws.flatMap((w) => w.sizes),
      },
    ];
  });
  return [...wards, ...whole];
}

export type IndicatorOut = {
  area: string;
  indicator: string;
  year: number;
  value: number;
  source: string;
};

/** The rows for indicators.csv: each area's size, and its building figures where it has buildings. */
export function indicatorRows(
  areas: AreaBuildings[],
  src: { area: string; areaYear: number; buildings: string; buildingsYear: number },
): IndicatorOut[] {
  const out: IndicatorOut[] = [];
  for (const a of areas) {
    out.push({
      area: a.key,
      indicator: "area_km2",
      year: src.areaYear,
      value: round3(a.km2),
      source: src.area,
    });
    const s = buildingStats(a.sizes, a.km2);
    if (!s) continue;
    for (const [indicator, value] of Object.entries(s))
      out.push({ area: a.key, indicator, year: src.buildingsYear, value, source: src.buildings });
  }
  return out;
}
