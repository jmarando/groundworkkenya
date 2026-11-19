// Reads Meru's house file (public/tiles/houses-meru.pmtiles), a county whose tiles are too many
// for one directory, the way the browser does: by range requests through house-source, the
// header and root once, each leaf directory the first time a tile needs it, then a tile per
// request. Nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/house-leaves.test.ts

import { readFileSync } from "node:fs";

import { houseAt, housesInTile } from "@/lib/house-source";
import { toTileSpace } from "@/lib/house-tiles";
import { mapAreaFor } from "@/lib/map-areas";
import { gunzip, parseDirectory, readHeader } from "@/lib/pmtiles";

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

const MERU = mapAreaFor("meru")!;
const FILE = new Uint8Array(readFileSync(`public${MERU.houses}`));
const header = readHeader(FILE);
const root = parseDirectory(
  await gunzip(FILE.subarray(header.rootOffset, header.rootOffset + header.rootLength)),
);

eq(
  "Meru's house file has leaf directories, its root fits the first read and points only to leaves",
  [
    header.leafLength > 0,
    header.rootOffset + header.rootLength <= 16384,
    root.every((e) => e.runLength === 0),
  ],
  [true, true, true],
);

/** A host for the file that honours ranges, noting every read. */
function host() {
  const reads: number[] = [];
  const f = async (_url: string, init?: RequestInit) => {
    const m = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get("Range") ?? "");
    if (!m) return new Response(FILE as BodyInit, { status: 200 });
    const from = Number(m[1]);
    reads.push(from);
    return new Response(
      FILE.subarray(from, Math.min(Number(m[2]), FILE.length - 1) + 1) as BodyInit,
      {
        status: 206,
      },
    );
  };
  return { fetch: f, reads };
}

const tileOf = (lng: number, lat: number) =>
  toTileSpace([lng, lat]).map(Math.floor) as [number, number];
const h = host();
const area = { ...MERU, houses: "mem://meru" };

// Meru town (Municipality ward), then Maua and Nkubu: three corners of the county.
const [mx, my] = tileOf(37.6495, 0.0475);
const town = await housesInTile(area, mx, my, h.fetch);
eq("Meru town's tile has houses", town.length > 50, true);
eq("the first tile takes three reads: the header and root, its leaf, the tile", h.reads.length, 3);
const next = await housesInTile(area, mx + 1, my, h.fetch);
eq("the tile next door has houses too", next.length > 0, true);
const leafReads = () => h.reads.filter((o) => o >= header.leafOffset && o < header.tileDataOffset);
const afterTown = leafReads().length;
const maua = await housesInTile(area, ...tileOf(37.9405, 0.2325), h.fetch);
const nkubu = await housesInTile(area, ...tileOf(37.6665, -0.0655), h.fetch);
eq("Maua's and Nkubu's tiles have houses", [maua.length > 20, nkubu.length > 20], [true, true]);
eq(
  "no leaf is read twice",
  new Set(leafReads()).size === leafReads().length && afterTown >= 1,
  true,
);
eq("the header is read once", h.reads.filter((o) => o === 0).length, 1);

// A house found again by its plus code, from the tile its centre is in.
const first = town[0]!;
eq(
  "a house is found again by its plus code",
  (await houseAt(area, first.id, h.fetch))?.id,
  first.id,
);

// A tile the county doesn't have: past its north edge, in Isiolo.
eq(
  "a tile outside the county has no houses",
  await housesInTile(area, ...tileOf(37.6, 0.9), h.fetch),
  [],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
