// Checks for the PMTiles archives the house files use: tile ids along the
// Hilbert curve, the directory, and a file written then read back a tile at a
// time. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/pmtiles.test.ts

import { gzipSync } from "node:zlib";

import {
  findEntry,
  gunzip,
  openArchive,
  parseDirectory,
  readHeader,
  serializeDirectory,
  writeArchive,
  zxyToTileId,
  type ArchiveInfo,
  type TileIn,
} from "@/lib/pmtiles";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

function throws(name: string, f: () => unknown, message: RegExp) {
  try {
    f();
    fail++;
    console.log(`FAIL ${name}: nothing was thrown`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (message.test(m)) pass++;
    else {
      fail++;
      console.log(`FAIL ${name}: threw "${m}"`);
    }
  }
}

const gz = (b: Uint8Array) => new Uint8Array(gzipSync(b));

eq(
  "tile ids from the PMTiles spec",
  [
    zxyToTileId(0, 0, 0),
    zxyToTileId(1, 0, 0),
    zxyToTileId(1, 0, 1),
    zxyToTileId(1, 1, 1),
    zxyToTileId(1, 1, 0),
    zxyToTileId(2, 0, 0),
    zxyToTileId(12, 3423, 1763),
  ],
  [0, 1, 2, 3, 4, 5, 19078479],
);
{
  const ids = new Set<number>();
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) ids.add(zxyToTileId(3, x, y));
  eq(
    "zoom 3's 64 tiles each have an id, after zoom 2's",
    [ids.size, Math.min(...ids), Math.max(...ids)],
    [64, 21, 84],
  );
}
throws("no such tile", () => zxyToTileId(1, 2, 0), /no tile 1\/2\/0/);

const entries = [
  { tileId: 5, offset: 0, length: 10, runLength: 1 },
  { tileId: 7, offset: 10, length: 4, runLength: 1 },
  { tileId: 300000000, offset: 99, length: 1, runLength: 1 },
];
eq("a directory reads back as written", parseDirectory(serializeDirectory(entries)), entries);
eq("a tile is found by its id", findEntry(entries, 7), entries[1]);
eq(
  "and a tile not there isn't",
  [findEntry(entries, 6), findEntry(entries, 4), findEntry(entries, 400000000)],
  [null, null, null],
);

const INFO: ArchiveInfo = {
  minZoom: 16,
  maxZoom: 16,
  bounds: [36.66, -1.45, 37.11, -1.16],
  center: [36.82, -1.29, 16],
  metadata: { name: "test" },
};
const text = (s: string) => new TextEncoder().encode(s);
const TILES: TileIn[] = [
  { z: 16, x: 39460, y: 32998, data: text("first") },
  { z: 16, x: 39461, y: 32998, data: text("second") },
  { z: 16, x: 39460, y: 32999, data: text("third") },
];
const file = writeArchive(TILES, INFO, gz);
const archive = await openArchive(
  async (offset, length) => file.subarray(offset, offset + length),
  gunzip,
);
const read = async (z: number, x: number, y: number) => {
  const b = await archive.getTile(z, x, y);
  return b ? new TextDecoder().decode(b) : null;
};
eq(
  "each tile reads back",
  [await read(16, 39460, 32998), await read(16, 39461, 32998), await read(16, 39460, 32999)],
  ["first", "second", "third"],
);
eq("a tile the file doesn't have", await read(16, 39462, 32998), null);
eq("a zoom the file doesn't have", await read(15, 19730, 16499), null);
eq(
  "the header says what the file holds",
  (({ minZoom, maxZoom, tileCount, bounds }) => ({ minZoom, maxZoom, tileCount, bounds }))(
    readHeader(file),
  ),
  { minZoom: 16, maxZoom: 16, tileCount: 3, bounds: [36.66, -1.45, 37.11, -1.16] },
);
throws("not a PMTiles file", () => readHeader(new Uint8Array(127)), /Not a PMTiles v3 file/);
throws("two tiles at one place", () => writeArchive([TILES[0]!, TILES[0]!], INFO, gz), /Two tiles/);
{
  // 6,000 tiles scattered across the world: a directory too big for the first read.
  const many: TileIn[] = [];
  for (let i = 0; i < 6000; i++)
    many.push({
      z: 16,
      x: (i * 7919) % 65536,
      y: (i * 104729) % 65536,
      data: Uint8Array.of(i % 251),
    });
  throws("too many tiles for one directory", () => writeArchive(many, INFO, gz), /Too many tiles/);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
