// Checks for building the house files: reading Open Buildings rows, keeping
// the houses inside an area's wards, and the tiles they make. Pure. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/house-build.test.ts

import { gzipSync } from "node:zlib";

import { wardShapes } from "@/lib/geo";
import {
  collect,
  countsFile,
  emptyCollected,
  MAX_FILE_BYTES,
  parseRow,
  parseWkt,
  problems,
  quickPosition,
  splitCsv,
  tilesFor,
} from "@/lib/house-build";
import { decodeTile } from "@/lib/house-tiles";
import { MAP_AREAS, mapAreaFor } from "@/lib/map-areas";
import { gunzip, openArchive, writeArchive } from "@/lib/pmtiles";

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

// Two square wards side by side, each about 1.1 km across.
const WARDS = wardShapes({
  features: [
    {
      properties: { slug: "west" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [36.8, -1.3],
            [36.81, -1.3],
            [36.81, -1.29],
            [36.8, -1.29],
            [36.8, -1.3],
          ],
        ],
      },
    },
    {
      properties: { slug: "east" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [36.81, -1.3],
              [36.82, -1.3],
              [36.82, -1.29],
              [36.81, -1.29],
              [36.81, -1.3],
            ],
          ],
        ],
      },
    },
  ],
});
const BOX = { west: 36.8, south: -1.3, east: 36.82, north: -1.29 };

/** A row as the Open Buildings CSV has it: an 11 m square around its centre. */
function row(lat: number, lng: number, confidence: number, pc: string): string {
  const d = 0.00005;
  const ring = [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ];
  return `${lat},${lng},121.0,${confidence},"POLYGON((${ring.map(([x, y]) => `${x} ${y}`).join(", ")}))",${pc}`;
}

eq("a quoted field keeps its commas", splitCsv('1,2,"a, b",3'), ["1", "2", "a, b", "3"]);
eq("a doubled quote is a quote", splitCsv('"say ""hi""",x'), ['say "hi"', "x"]);
eq(
  "the position, read first",
  quickPosition(row(-1.295, 36.805, 0.9, "6GCRPQ22+22")),
  [36.805, -1.295],
);
eq("the header is not a position", quickPosition("latitude,longitude,area_in_meters"), null);
eq(
  "a row",
  (({ lat, lng, confidence, pc }) => ({ lat, lng, confidence, pc }))(
    parseRow(row(-1.295, 36.805, 0.9, "6GCRPQ22+22"))!,
  ),
  { lat: -1.295, lng: 36.805, confidence: 0.9, pc: "6GCRPQ22+22" },
);
eq(
  "an outline with a courtyard",
  parseWkt("POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 1))"),
  [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 1],
    ],
  ],
);
eq("not a polygon", parseWkt("POINT (1 2)"), null);

const found = emptyCollected();
for (const line of [
  row(-1.295, 36.805, 0.9, "6GCRPQ22+22"), // west
  row(-1.295, 36.815, 0.9, "6GCRPQ22+23"), // east
  row(-1.295, 36.816, 0.5, "6GCRPQ22+24"), // east, but Google isn't sure it's a building
  row(-1.295, 36.805, 0.9, "6GCRPQ22+22"), // the first one again
  row(-1.28, 36.805, 0.9, "6GCRPQ22+25"), // north of both wards
  row(-1.295, 36.806, 0.9, "not a code"), // a bad plus code
]) {
  const r = parseRow(line);
  if (r) collect(WARDS, BOX, r, found);
}
eq(
  "houses kept, per ward",
  [found.houses.length, found.perWard, found.lowConfidence],
  [2, { west: 1, east: 1 }, 1],
);

const tiles = tilesFor(found.houses);
const file = writeArchive(
  tiles,
  {
    minZoom: 16,
    maxZoom: 16,
    bounds: [36.8, -1.3, 36.82, -1.29],
    center: [36.81, -1.295, 16],
    metadata: {},
  },
  (b) => new Uint8Array(gzipSync(b)),
);
const archive = await openArchive(async (o, l) => file.subarray(o, o + l), gunzip);
const inFile = new Set<string>();
for (const t of tiles) {
  const b = await archive.getTile(16, t.x, t.y);
  for (const h of b ? decodeTile(t.x, t.y, b) : []) inFile.add(h.id);
}
eq("every house is in the file", [...inFile].sort(), ["6GCRPQ22+22", "6GCRPQ22+23"]);

eq("a ward with no houses stops the build", problems(WARDS, { west: 3 }, 1000), [
  "No houses in east.",
]);
eq("so does a file too big to serve", problems(WARDS, { west: 1, east: 1 }, MAX_FILE_BYTES + 1), [
  "The file is 25.0 MiB, over the 25 MiB a static file may be.",
]);
eq("the counts file", countsFile(MAP_AREAS[0]!, found, "2026-10-12"), {
  area: "nairobi",
  source: "Google Open Buildings v3 (CC BY 4.0)",
  minConfidence: 0.65,
  built: "2026-10-12",
  total: 2,
  wards: { east: 1, west: 1 },
});
eq(
  "the map areas, by the key a campaign holds",
  [
    mapAreaFor("nairobi")?.id,
    mapAreaFor("nyeri/mathira")?.top,
    mapAreaFor("kenya"),
    mapAreaFor(null),
  ],
  ["nairobi", "constituency", null, null],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
