// PMTiles v3 (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md):
// a whole map's tiles in one file, read a tile at a time with HTTP range
// requests, so a static host can serve it. This writes the house files
// (scripts/geo/house-tiles.ts) and reads them in the browser. It holds only
// what they use: one root directory and no leaf directories, gzip for the
// directory, the metadata and the tiles, and vector tiles. Pure apart from the
// gzip and the reading handed in, so it runs the same in tests and browsers.

import { readVarint, writeVarint } from "@/lib/varint";

/** Where a tile's bytes are in the tile data. A run length of 0 marks a leaf directory. */
export type Entry = { tileId: number; offset: number; length: number; runLength: number };

export type Header = {
  rootOffset: number;
  rootLength: number;
  tileDataOffset: number;
  tileCount: number;
  minZoom: number;
  maxZoom: number;
  /** West, south, east, north, in degrees. */
  bounds: [number, number, number, number];
};

/** A tile to write, not yet compressed. */
export type TileIn = { z: number; x: number; y: number; data: Uint8Array };

export type ArchiveInfo = {
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  /** Longitude, latitude and zoom to open at. */
  center: [number, number, number];
  metadata: Record<string, unknown>;
};

export type Archive = {
  header: Header;
  /** The tile's bytes, uncompressed; null when the file has no such tile. */
  getTile(z: number, x: number, y: number): Promise<Uint8Array | null>;
};

/** Reads length bytes from offset; fewer when the file ends first. */
export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

const HEADER_BYTES = 127;
/** The header and root directory are in the first 16 KiB, so one request reads both. */
const FIRST_READ = 16_384;
const GZIP = 2;
const MVT = 1;
const U32 = 2 ** 32;

/** A tile's place along the Hilbert curve, after every tile of the zooms below it. */
export function zxyToTileId(z: number, x: number, y: number): number {
  if (z > 26) throw new Error("Zoom past 26 is beyond whole-number precision.");
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n)
    throw new Error(`There is no tile ${z}/${x}/${y}.`);
  let tx = x;
  let ty = y;
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0;
    const ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        tx = n - 1 - tx;
        ty = n - 1 - ty;
      }
      [tx, ty] = [ty, tx];
    }
  }
  return (4 ** z - 1) / 3 + d;
}

export function serializeDirectory(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  writeVarint(out, entries.length);
  let last = 0;
  for (const e of entries) {
    writeVarint(out, e.tileId - last);
    last = e.tileId;
  }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    // 0 means "straight after the previous tile", which most are.
    writeVarint(out, prev && e.offset === prev.offset + prev.length ? 0 : e.offset + 1);
  });
  return Uint8Array.from(out);
}

export function parseDirectory(b: Uint8Array): Entry[] {
  const at = { pos: 0 };
  const count = readVarint(b, at);
  const entries: Entry[] = [];
  let id = 0;
  for (let i = 0; i < count; i++) {
    id += readVarint(b, at);
    entries.push({ tileId: id, offset: 0, length: 0, runLength: 0 });
  }
  for (const e of entries) e.runLength = readVarint(b, at);
  for (const e of entries) e.length = readVarint(b, at);
  entries.forEach((e, i) => {
    const v = readVarint(b, at);
    const prev = entries[i - 1];
    e.offset = v === 0 && prev ? prev.offset + prev.length : v - 1;
  });
  return entries;
}

/** The entry for a tile, by binary search, as the spec has it; null when there is none. */
export function findEntry(entries: Entry[], tileId: number): Entry | null {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid]!;
    if (tileId > e.tileId) lo = mid + 1;
    else if (tileId < e.tileId) hi = mid - 1;
    else return e;
  }
  // A leaf directory covers the ids after its own; a run of one tile repeated covers its run.
  const before = entries[hi];
  if (before && (before.runLength === 0 || tileId - before.tileId < before.runLength))
    return before;
  return null;
}

function setU64(v: DataView, at: number, n: number): void {
  v.setUint32(at, n % U32, true);
  v.setUint32(at + 4, Math.floor(n / U32), true);
}

function getU64(v: DataView, at: number): number {
  return v.getUint32(at, true) + v.getUint32(at + 4, true) * U32;
}

/** One file holding every tile, in tile-id order. Throws if the directory won't fit the first read. */
export function writeArchive(
  tiles: TileIn[],
  info: ArchiveInfo,
  gzip: (b: Uint8Array) => Uint8Array,
): Uint8Array {
  const sorted = tiles
    .map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), data: gzip(t.data) }))
    .sort((a, b) => a.id - b.id);
  const entries: Entry[] = [];
  let tileBytes = 0;
  for (const t of sorted) {
    if (entries[entries.length - 1]?.tileId === t.id) throw new Error("Two tiles at one place.");
    entries.push({ tileId: t.id, offset: tileBytes, length: t.data.length, runLength: 1 });
    tileBytes += t.data.length;
  }
  const root = gzip(serializeDirectory(entries));
  if (HEADER_BYTES + root.length > FIRST_READ)
    throw new Error(`Too many tiles for one directory (${entries.length}): split the area.`);
  const metadata = gzip(new TextEncoder().encode(JSON.stringify(info.metadata)));
  const rootOffset = HEADER_BYTES;
  const metadataOffset = rootOffset + root.length;
  const tileDataOffset = metadataOffset + metadata.length;

  const out = new Uint8Array(tileDataOffset + tileBytes);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("PMTiles"), 0);
  out[7] = 3;
  setU64(v, 8, rootOffset);
  setU64(v, 16, root.length);
  setU64(v, 24, metadataOffset);
  setU64(v, 32, metadata.length);
  setU64(v, 40, tileDataOffset); // no leaf directories: an empty section
  setU64(v, 48, 0);
  setU64(v, 56, tileDataOffset);
  setU64(v, 64, tileBytes);
  setU64(v, 72, entries.length); // tiles addressed
  setU64(v, 80, entries.length); // directory entries
  setU64(v, 88, entries.length); // distinct tiles
  out[96] = 1; // clustered: tiles in id order
  out[97] = GZIP; // directory and metadata
  out[98] = GZIP; // tiles
  out[99] = MVT;
  out[100] = info.minZoom;
  out[101] = info.maxZoom;
  const e7 = (deg: number) => Math.round(deg * 1e7);
  const [west, south, east, north] = info.bounds;
  v.setInt32(102, e7(west), true);
  v.setInt32(106, e7(south), true);
  v.setInt32(110, e7(east), true);
  v.setInt32(114, e7(north), true);
  const [lng, lat, zoom] = info.center;
  out[118] = zoom;
  v.setInt32(119, e7(lng), true);
  v.setInt32(123, e7(lat), true);
  out.set(root, rootOffset);
  out.set(metadata, metadataOffset);
  let at = tileDataOffset;
  for (const t of sorted) {
    out.set(t.data, at);
    at += t.data.length;
  }
  return out;
}

export function readHeader(b: Uint8Array): Header {
  if (
    b.length < HEADER_BYTES ||
    new TextDecoder().decode(b.subarray(0, 7)) !== "PMTiles" ||
    b[7] !== 3
  )
    throw new Error("Not a PMTiles v3 file.");
  if (b[97] !== GZIP || b[98] !== GZIP || b[99] !== MVT)
    throw new Error("Only gzipped vector tiles are read here.");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (getU64(v, 48) > 0) throw new Error("Leaf directories aren't read here.");
  const deg = (at: number) => v.getInt32(at, true) / 1e7;
  return {
    rootOffset: getU64(v, 8),
    rootLength: getU64(v, 16),
    tileDataOffset: getU64(v, 56),
    tileCount: getU64(v, 72),
    minZoom: b[100]!,
    maxZoom: b[101]!,
    bounds: [deg(102), deg(106), deg(110), deg(114)],
  };
}

/** An archive read through `read`: the header and directory once, then a tile per call. */
export async function openArchive(
  read: ReadRange,
  unzip: (b: Uint8Array) => Promise<Uint8Array>,
): Promise<Archive> {
  const first = await read(0, FIRST_READ);
  const header = readHeader(first);
  const rootEnd = header.rootOffset + header.rootLength;
  if (rootEnd > first.length) throw new Error("The directory isn't where the header says.");
  const entries = parseDirectory(await unzip(first.subarray(header.rootOffset, rootEnd)));
  return {
    header,
    async getTile(z, x, y) {
      if (z < header.minZoom || z > header.maxZoom) return null;
      const n = 2 ** z;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n)
        return null;
      const e = findEntry(entries, zxyToTileId(z, x, y));
      if (!e) return null;
      if (e.runLength === 0) throw new Error("Leaf directories aren't read here.");
      return unzip(await read(header.tileDataOffset + e.offset, e.length));
    },
  };
}

/** gzip undone with the platform's own streams, in browsers and Node alike. */
export async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(b)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
