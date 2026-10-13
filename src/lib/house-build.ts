// Building the house files from Google Open Buildings v3 (CC BY 4.0): a row is
// kept when Google is at least 65% sure it is a building and its centre is in
// one of the area's wards, as scripts/geo/ward_buildings.py did for one ward.
// Pure; scripts/geo/house-tiles.ts reads the CSV and writes the files.

import { inBox, wardAt, type Box, type LngLat, type Ring, type WardShape } from "@/lib/geo";
import { encodeTile, HOUSE_ZOOM, tilesOf, toTileHouse, type TileHouse } from "@/lib/house-tiles";
import type { HouseCounts, MapArea } from "@/lib/map-areas";
import type { TileIn } from "@/lib/pmtiles";

export const MIN_CONFIDENCE = 0.65;
/** The largest static file the app's host (Cloudflare) serves. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CSV_HEADER = "latitude,longitude,area_in_meters,confidence,geometry,full_plus_code";
export const SOURCE = "Google Open Buildings v3 (CC BY 4.0)";
/** As record_door accepts a building id. */
const BUILDING_ID = /^[0-9A-Z+]{4,24}$/;

export type Row = { lat: number; lng: number; confidence: number; wkt: string; pc: string };

/** A CSV line's fields: a quoted field keeps its commas, and "" inside one is a quote. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The latitude and longitude that start every row, read without splitting the rest. */
export function quickPosition(line: string): LngLat | null {
  const a = line.indexOf(",");
  const b = line.indexOf(",", a + 1);
  if (a <= 0 || b <= a + 1) return null;
  const lat = Number(line.slice(0, a));
  const lng = Number(line.slice(a + 1, b));
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
}

export function parseRow(line: string): Row | null {
  const f = splitCsv(line);
  if (f.length !== 6) return null;
  const lat = Number(f[0]);
  const lng = Number(f[1]);
  const confidence = Number(f[3]);
  if (![lat, lng, confidence].every(Number.isFinite)) return null;
  return { lat, lng, confidence, wkt: f[4]!, pc: f[5]!.trim() };
}

/** POLYGON((x y, ...), (x y, ...)): the outline, then any holes (courtyards). */
export function parseWkt(wkt: string): Ring[] | null {
  if (!/^\s*POLYGON\b/i.test(wkt)) return null;
  const rings: Ring[] = [];
  for (const m of wkt.matchAll(/\(([^()]+)\)/g)) {
    const ring: Ring = [];
    for (const pair of m[1]!.split(",")) {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      ring.push([x!, y!]);
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings.length ? rings : null;
}

export type Collected = {
  houses: TileHouse[];
  perWard: Record<string, number>;
  seen: Set<string>;
  lowConfidence: number;
};

export const emptyCollected = (): Collected => ({
  houses: [],
  perWard: {},
  seen: new Set(),
  lowConfidence: 0,
});

/** Keeps the row's house when it is in one of the wards. */
export function collect(wards: WardShape[], box: Box, row: Row, into: Collected): void {
  const p: LngLat = [row.lng, row.lat];
  if (!inBox(p, box)) return;
  const ward = wardAt(p, wards);
  if (!ward) return;
  if (row.confidence < MIN_CONFIDENCE) {
    into.lowConfidence += 1;
    return;
  }
  if (!BUILDING_ID.test(row.pc) || into.seen.has(row.pc)) return;
  const rings = parseWkt(row.wkt);
  const house = rings ? toTileHouse(row.pc, rings) : null;
  if (!house) return;
  into.seen.add(row.pc);
  into.houses.push(house);
  into.perWard[ward.slug] = (into.perWard[ward.slug] ?? 0) + 1;
}

/** Each zoom-16 tile with the houses that touch it, encoded. */
export function tilesFor(houses: TileHouse[]): TileIn[] {
  const byTile = new Map<string, { x: number; y: number; houses: TileHouse[] }>();
  for (const h of houses)
    for (const t of tilesOf(h)) {
      const k = `${t.x}/${t.y}`;
      const cur = byTile.get(k) ?? { x: t.x, y: t.y, houses: [] };
      cur.houses.push(h);
      byTile.set(k, cur);
    }
  return [...byTile.values()].map((t) => ({
    z: HOUSE_ZOOM,
    x: t.x,
    y: t.y,
    data: encodeTile(t.x, t.y, t.houses),
  }));
}

export function countsFile(area: MapArea, found: Collected, built: string): HouseCounts {
  const wards = Object.fromEntries(
    Object.entries(found.perWard).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    area: area.key,
    source: SOURCE,
    minConfidence: MIN_CONFIDENCE,
    built,
    total: found.houses.length,
    wards,
  };
}

/** What stops a build: a ward with no houses, or a file the host won't serve. */
export function problems(
  wards: WardShape[],
  perWard: Record<string, number>,
  bytes: number,
): string[] {
  const out = wards.filter((w) => !perWard[w.slug]).map((w) => `No houses in ${w.slug}.`);
  if (bytes > MAX_FILE_BYTES)
    out.push(
      `The file is ${(bytes / 1024 / 1024).toFixed(1)} MiB, over the 25 MiB a static file may be.`,
    );
  return out;
}
