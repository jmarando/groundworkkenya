// Checks for "Which house am I at?": whether the houses around the phone are
// known (no map area, no fix, outside the area), and reading a house file a
// tile at a time by range requests, from a host that honours ranges and one
// that doesn't, and again after a failed first try. Nothing leaves this
// process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/door-place.test.ts

import { gzipSync } from "node:zlib";

import { houseStatus } from "@/hooks/useHousesAround";
import type { Ring } from "@/lib/geo";
import { houseArchive, houseAt, housesInTile, readRange } from "@/lib/house-source";
import { encodeTile, toTileHouse, toTileSpace } from "@/lib/house-tiles";
import { mapAreaFor, type MapArea } from "@/lib/map-areas";
import { writeArchive } from "@/lib/pmtiles";

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

const NAIROBI = mapAreaFor("nairobi")!;
const KILELESHWA: [number, number] = [36.760926, -1.265323];
const THIKA: [number, number] = [37.0693, -1.0388];

eq(
  "no map area: no houses, the visit is placed by GPS",
  houseStatus(null, KILELESHWA, false, 0),
  "none",
);
eq("no fix yet: still finding where you are", houseStatus(NAIROBI, null, false, 0), "loading");
eq("a fix outside the area: not on the house map", houseStatus(NAIROBI, THIKA, false, 0), "none");
eq("inside, before the first tile arrives", houseStatus(NAIROBI, KILELESHWA, true, 0), "loading");
eq(
  "inside, with houses (more tiles may follow)",
  houseStatus(NAIROBI, KILELESHWA, true, 12),
  "ready",
);
eq(
  "inside, every tile read, even none with houses",
  houseStatus(NAIROBI, KILELESHWA, false, 0),
  "ready",
);

// A house file with one tile holding one Kileleshwa house.
const PC = "6GCRPQM6+V9F4";
const RING: Ring = [
  [36.760986, -1.265294],
  [36.760894, -1.265264],
  [36.760866, -1.265352],
  [36.760958, -1.265382],
  [36.760986, -1.265294],
];
const [tx, ty] = toTileSpace(RING[0]!);
const x = Math.floor(tx);
const y = Math.floor(ty);
const FILE = writeArchive(
  [{ z: 16, x, y, data: encodeTile(x, y, [toTileHouse(PC, [RING])!]) }],
  { minZoom: 16, maxZoom: 16, bounds: NAIROBI.bounds, center: [36.82, -1.29, 16], metadata: {} },
  (b) => new Uint8Array(gzipSync(b)),
);

/** A host for FILE: honouring ranges (206), ignoring them (200), or failing the first n reads. */
function host(mode: "ranges" | "whole", failFirst = 0) {
  let reads = 0;
  const f = async (_url: string, init?: RequestInit) => {
    reads++;
    if (reads <= failFirst) throw new TypeError("Failed to fetch");
    const range = new Headers(init?.headers).get("Range") ?? "";
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (mode === "whole" || !m) return new Response(FILE, { status: 200 });
    const from = Number(m[1]);
    const to = Math.min(Number(m[2]), FILE.length - 1);
    return new Response(FILE.subarray(from, to + 1), { status: 206 });
  };
  return { fetch: f, reads: () => reads };
}

{
  const h = host("ranges");
  const b = await readRange("mem://a", 10, 5, h.fetch);
  eq("a range from a host that honours them", [...b], [...FILE.subarray(10, 15)]);
  const w = await readRange("mem://a", 10, 5, host("whole").fetch);
  eq("and from one that sends the whole file, cut", [...w], [...FILE.subarray(10, 15)]);
}

const areaAt = (url: string): MapArea => ({ ...NAIROBI, houses: url });
{
  const h = host("ranges");
  const houses = await housesInTile(areaAt("mem://ranges"), x, y, h.fetch);
  eq(
    "the house in its tile, by its plus code",
    houses.map((b) => b.id),
    [PC],
  );
  eq(
    "a tile the file doesn't have holds no houses",
    await housesInTile(areaAt("mem://ranges"), x + 1, y, h.fetch),
    [],
  );
  const before = h.reads();
  await housesInTile(areaAt("mem://ranges"), x, y, h.fetch);
  eq("the file is opened once: a tile is one more read", h.reads() - before, 1);
}
{
  const h = host("ranges");
  const tile = await housesInTile(areaAt("mem://at"), x, y, h.fetch);
  const house = await houseAt(areaAt("mem://at"), PC.toLowerCase(), h.fetch);
  eq(
    "a house by its plus code, with its footprint, from the tile its centre is in",
    [house?.id, house?.area],
    [PC, tile[0]?.area],
  );
  eq(
    "a plus code the file has no house for",
    await houseAt(areaAt("mem://at"), "6GCRPQM6+X95Q", h.fetch),
    null,
  );
  const before = h.reads();
  eq(
    "not a plus code: nothing read",
    [await houseAt(areaAt("mem://at"), "hello", h.fetch), h.reads() - before],
    [null, 0],
  );
}
{
  const h = host("whole");
  eq(
    "a host that ignores ranges still works",
    (await housesInTile(areaAt("mem://whole"), x, y, h.fetch)).map((b) => b.id),
    [PC],
  );
}
{
  const h = host("ranges", 1);
  let first = "no error";
  try {
    await houseArchive("mem://flaky", h.fetch);
  } catch (e) {
    first = e instanceof Error ? e.message : String(e);
  }
  eq("no signal: the open fails", first, "Failed to fetch");
  eq(
    "signal back: it is tried again, not remembered as failed",
    (await housesInTile(areaAt("mem://flaky"), x, y, h.fetch)).map((b) => b.id),
    [PC],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
