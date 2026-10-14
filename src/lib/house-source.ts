// The browser's reader for a house file (public/tiles/houses-<id>.pmtiles):
// the header and directory once, then one tile per request, by HTTP range.
// Each file is opened once a session; an open that fails (no signal) is
// forgotten, so the next read tries again.

import type { Building } from "@/lib/geo";
import { decodeTile, HOUSE_ZOOM, toTileSpace } from "@/lib/house-tiles";
import type { MapArea } from "@/lib/map-areas";
import { plusCodeCentre } from "@/lib/pluscode";
import { gunzip, openArchive, type Archive } from "@/lib/pmtiles";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const archives = new Map<string, Promise<Archive>>();

/** length bytes of url from offset. A host that ignores the range sends the whole file, which is cut. */
export async function readRange(
  url: string,
  offset: number,
  length: number,
  fetcher: Fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetcher(url, {
    headers: { Range: `bytes=${offset}-${offset + length - 1}` },
  });
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return res.status === 206 ? bytes : bytes.subarray(offset, offset + length);
}

/** The house file at url, opened once a session. */
export function houseArchive(url: string, fetcher: Fetch = fetch): Promise<Archive> {
  let opened = archives.get(url);
  if (!opened) {
    opened = openArchive((o, l) => readRange(url, o, l, fetcher), gunzip);
    archives.set(url, opened);
    opened.catch(() => archives.delete(url));
  }
  return opened;
}

/** The houses in one zoom-16 tile of an area's house file; none where the file has no tile. */
export async function housesInTile(
  area: MapArea,
  x: number,
  y: number,
  fetcher: Fetch = fetch,
): Promise<Building[]> {
  const archive = await houseArchive(area.houses, fetcher);
  const bytes = await archive.getTile(HOUSE_ZOOM, x, y);
  return bytes ? decodeTile(x, y, bytes) : [];
}

/** The house a plus code names, from the tile its centre is in; null when the file has none there. */
export async function houseAt(
  area: MapArea,
  pc: string,
  fetcher: Fetch = fetch,
): Promise<Building | null> {
  const code = pc.trim().toUpperCase();
  const centre = plusCodeCentre(code);
  if (!centre) return null;
  const [x, y] = toTileSpace(centre);
  const houses = await housesInTile(area, Math.floor(x), Math.floor(y), fetcher);
  return houses.find((h) => h.id === code) ?? null;
}
