// Building figures for one map area's wards, from its house file
// (public/tiles/houses-<id>.pmtiles: Google Open Buildings v3, CC BY 4.0):
// each ward's size from its map, and the count, density, median size and
// shares of small and large buildings; each constituency from all its wards
// when all are mapped. Writes data/atlas/<county>/indicators.csv. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/buildings.ts <map area: nairobi | nyeri/mathira>
import { readFileSync, writeFileSync } from "node:fs";

import { wardShapes } from "@/lib/area-map";
import { HEADERS } from "@/lib/atlas-files";
import { areaKm2, indicatorRows, makeLocator, withConstituencies } from "@/lib/building-stats";
import { decodeTile, HOUSE_ZOOM, toTileSpace } from "@/lib/house-tiles";
import { mapAreaFor, type HouseCounts } from "@/lib/map-areas";
import { gunzip, openArchive } from "@/lib/pmtiles";

import { readAtlas } from "./read";

const area = mapAreaFor(process.argv[2]);
if (!area) {
  console.error("usage: buildings.ts <map area: nairobi | nyeri/mathira>");
  process.exit(2);
}
const county = area.key.split("/")[0]!;

const { files } = readAtlas("data/atlas", [county]);
const wardKey = new Map(
  files.areas.filter((a) => a.level === "ward").map((a) => [a.key.split("/")[2] ?? "", a.key]),
);
const shapes = wardShapes(JSON.parse(readFileSync(`public${area.wards}`, "utf8")))
  .filter((s) => wardKey.has(s.slug))
  .map((s) => ({ key: wardKey.get(s.slug)!, polygons: s.polygons }));
const unmapped = [...wardKey.values()].filter((k) => !shapes.some((s) => s.key === k));
if (unmapped.length) console.error(`no ward map for: ${unmapped.join(", ")}`);

// Every zoom-16 tile over the area; a house on a tile edge is in both, so each plus code counts once.
const file = new Uint8Array(readFileSync(`public${area.houses}`));
const archive = await openArchive(async (o, l) => file.subarray(o, o + l), gunzip);
const [west, south, east, north] = area.bounds;
const [x0, y0] = toTileSpace([west, north]).map(Math.floor) as [number, number];
const [x1, y1] = toTileSpace([east, south]).map(Math.floor) as [number, number];
const locate = makeLocator(shapes);
const sizes = new Map(shapes.map((s) => [s.key, [] as number[]]));
const seen = new Set<string>();
let outside = 0;
for (let x = x0; x <= x1; x++)
  for (let y = y0; y <= y1; y++) {
    const bytes = await archive.getTile(HOUSE_ZOOM, x, y);
    if (!bytes) continue;
    for (const h of decodeTile(x, y, bytes)) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      const key = locate(h.centre[0], h.centre[1]);
      if (key) sizes.get(key)!.push(h.area);
      else outside++;
    }
  }

const areas = withConstituencies(
  shapes.map((s) => ({ key: s.key, km2: areaKm2(s.polygons), sizes: sizes.get(s.key)! })),
  files.areas
    .filter((a) => a.level === "constituency")
    .map((c) => ({
      key: c.key,
      wards: files.areas.filter((a) => a.parent === c.key).map((a) => a.key),
    })),
);
const rows = indicatorRows(areas, {
  area: "geoboundaries-ken-adm3",
  areaYear: 2020,
  buildings: "google-open-buildings-v3",
  buildingsYear: 2023,
});
const out = `data/atlas/${county}/indicators.csv`;
writeFileSync(
  out,
  [
    HEADERS.indicators.join(","),
    ...rows.map((r) => [r.area, r.indicator, r.year, r.value, r.source].join(",")),
  ].join("\n") + "\n",
);

// The house file's own count per ward, made from Google's centre points: the
// outlines' centres can fall the other side of a ward's edge, so a few differ.
const counts = JSON.parse(readFileSync(`public${area.counts}`, "utf8")) as HouseCounts;
const differ = shapes.flatMap((s) => {
  const slug = s.key.split("/")[2]!;
  const d = sizes.get(s.key)!.length - (counts.wards[slug] ?? 0);
  return d ? [`${slug} ${d > 0 ? "+" : ""}${d}`] : [];
});
console.log(
  `${seen.size} houses read (the house file counts ${counts.total}); ${outside} outside every ward; wrote ${rows.length} rows to ${out}`,
);
console.log(
  differ.length
    ? `  against the house file's ward counts: ${differ.join(", ")}`
    : "  every ward's count matches the house file's",
);
for (const [k, v] of sizes) console.log(`  ${k}: ${v.length} buildings`);
