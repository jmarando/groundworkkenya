// Builds the house files: every house in each campaign map area
// (src/lib/map-areas.ts), from Google Open Buildings v3 (CC BY 4.0), as one
// PMTiles file per area and the number of houses in each ward.
//
//   npx tsx --tsconfig tsconfig.json scripts/geo/house-tiles.ts <183_buildings.csv.gz> [id …]
//
// With ids (roysambu, mathira …), only those areas are built: the S2 cell must cover them.
// <183_buildings.csv.gz> is the S2 cell covering Nairobi and Nyeri (1.76 GB):
//   https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/183_buildings.csv.gz
// Writes public/tiles/houses-<id>.pmtiles and public/tiles/houses-<id>.json,
// and nothing at all if a ward has no houses or a file is over 25 MiB.

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";

import { inBox, wardShapes, type Box } from "@/lib/geo";
import {
  collect,
  countsFile,
  CSV_HEADER,
  emptyCollected,
  MIN_CONFIDENCE,
  parseRow,
  problems,
  quickPosition,
  SOURCE,
  tilesFor,
} from "@/lib/house-build";
import { HOUSE_ZOOM, LAYER } from "@/lib/house-tiles";
import { MAP_AREAS } from "@/lib/map-areas";
import { writeArchive } from "@/lib/pmtiles";

const src = process.argv[2];
if (!src) {
  console.error(
    "Usage: npx tsx --tsconfig tsconfig.json scripts/geo/house-tiles.ts <183_buildings.csv.gz>",
  );
  process.exit(1);
}

const only = process.argv.slice(3);
const unknown = only.filter((id) => !MAP_AREAS.some((a) => a.id === id));
if (unknown.length) {
  console.error(`No map area with id ${unknown.join(", ")}`);
  process.exit(1);
}
const areas = MAP_AREAS.filter((a) => !only.length || only.includes(a.id)).map((area) => {
  const [west, south, east, north] = area.bounds;
  const box: Box = { west, south, east, north };
  const wards = wardShapes(JSON.parse(readFileSync(`public${area.wards}`, "utf8")));
  return { area, box, wards, found: emptyCollected() };
});

const lines = createInterface({
  input: createReadStream(src).pipe(createGunzip()),
  crlfDelay: Infinity,
});
let header = true;
let rows = 0;
for await (const line of lines) {
  if (header) {
    header = false;
    if (line.trim() !== CSV_HEADER) {
      console.error(`These aren't Open Buildings v3 columns: ${line}`);
      process.exit(1);
    }
    continue;
  }
  rows += 1;
  if (rows % 5_000_000 === 0) console.log(`${rows / 1_000_000} million rows read…`);
  const p = quickPosition(line);
  if (!p) continue;
  for (const a of areas) {
    if (!inBox(p, a.box)) continue;
    const row = parseRow(line);
    if (row) collect(a.wards, a.box, row, a.found);
  }
}

const built = new Date().toISOString().slice(0, 10);
const gz = (b: Uint8Array) => new Uint8Array(gzipSync(b, { level: 9 }));
const fmt = (n: number) => n.toLocaleString("en-KE");
let stop = false;
const outputs: { path: string; file: Uint8Array; countsPath: string; counts: string }[] = [];
for (const a of areas) {
  const tiles = tilesFor(a.found.houses);
  const [w, s, e, n] = a.area.bounds;
  const file = writeArchive(
    tiles,
    {
      minZoom: HOUSE_ZOOM,
      maxZoom: HOUSE_ZOOM,
      bounds: a.area.bounds,
      center: [(w + e) / 2, (s + n) / 2, HOUSE_ZOOM],
      metadata: {
        name: `Houses: ${a.area.name}`,
        attribution: SOURCE,
        vector_layers: [
          { id: LAYER, fields: { pc: "String" }, minzoom: HOUSE_ZOOM, maxzoom: HOUSE_ZOOM },
        ],
      },
    },
    gz,
  );
  const counts = countsFile(a.area, a.found, built);
  console.log(
    `\n${a.area.name}: ${fmt(counts.total)} houses in ${fmt(tiles.length)} tiles, ` +
      `${(file.length / 1024 / 1024).toFixed(1)} MiB; ${fmt(a.found.lowConfidence)} below confidence ${MIN_CONFIDENCE}`,
  );
  for (const [slug, count] of Object.entries(counts.wards).sort((x, y) => y[1] - x[1]))
    console.log(`  ${slug.padEnd(32)} ${fmt(count)}`);
  for (const p of problems(a.wards, a.found.perWard, file.length)) {
    console.error(`PROBLEM ${a.area.name}: ${p}`);
    stop = true;
  }
  outputs.push({
    path: `public${a.area.houses}`,
    file,
    countsPath: `public${a.area.counts}`,
    counts: JSON.stringify(counts, null, 2) + "\n",
  });
}
if (stop) process.exit(1);
mkdirSync("public/tiles", { recursive: true });
for (const o of outputs) {
  writeFileSync(o.path, o.file);
  writeFileSync(o.countsPath, o.counts);
  console.log(`Wrote ${o.path} and ${o.countsPath}`);
}
