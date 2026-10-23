// The maps of a ward campaign, from the ward map it sits in and its polling centres:
// <id>-wards.json, the ward alone (the Voters map's area), and <id>-centres.json, the part of
// the ward nearest each placed centre (the ward demo's units, src/lib/stations/areas.ts).
//
//   npx tsx --tsconfig tsconfig.json scripts/geo/ward-map.ts <wards.json> <slug> <stations.csv> <positions.csv> <id>
//
// e.g. public/geo/nairobi-wards.json roysambu data/stations/nairobi.csv
// data/stations/nairobi-positions.csv roysambu. Writes into public/geo; a centre with no
// position has no area.

import { readFileSync, writeFileSync } from "node:fs";

import { wardShapes, type ShapeFile } from "@/lib/geo";
import { centreAreas } from "@/lib/stations/areas";

const [wardsFile, slug, stationsFile, positionsFile, id] = process.argv.slice(2);
if (!wardsFile || !slug || !stationsFile || !positionsFile || !id) {
  console.error("usage: ward-map.ts <wards.json> <slug> <stations.csv> <positions.csv> <id>");
  process.exit(2);
}

type Feature = ShapeFile["features"][number];
const geo = JSON.parse(readFileSync(wardsFile, "utf8")) as ShapeFile;
const feature = geo.features.find((f: Feature) => f.properties.slug === slug);
if (!feature) {
  console.error(`No ward ${slug} in ${wardsFile}`);
  process.exit(1);
}
const ward = wardShapes({ ...geo, features: [feature] })[0]!;

const rows = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","));
const at = new Map(
  rows(positionsFile).map(([code, lat, lng]) => [code!, [Number(lng), Number(lat)] as const]),
);
const titled = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
const centres = rows(stationsFile)
  .filter((r) => r[3] === slug)
  .map(([iebc, code, name]) => ({ iebc: iebc!, code: code!, name: titled(name!) }));
const placed = centres.flatMap((c) => {
  const p = at.get(c.iebc);
  return p ? [{ id: c.code, at: [p[0], p[1]] as [number, number] }] : [];
});
const areas = centreAreas(placed, ward);
const nameOf = new Map(centres.map((c) => [c.code, c.name]));

const round = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(round) : typeof x === "number" ? Math.round(x * 1e5) / 1e5 : x;

writeFileSync(
  `public/geo/${id}-wards.json`,
  JSON.stringify({ type: "FeatureCollection", features: [feature] }) + "\n",
);
writeFileSync(
  `public/geo/${id}-centres.json`,
  JSON.stringify({
    type: "FeatureCollection",
    features: areas
      .filter((a) => a.polygons.length)
      .map((a) => ({
        type: "Feature",
        properties: { slug: a.id.toLowerCase(), name: nameOf.get(a.id) ?? a.id },
        geometry: { type: "MultiPolygon", coordinates: round(a.polygons) },
      })),
  }) + "\n",
);
console.log(
  `${id}: ${centres.length} centres, ${placed.length} placed; wrote public/geo/${id}-wards.json and public/geo/${id}-centres.json`,
);
for (const c of centres) if (!at.has(c.iebc)) console.log(`  no position: ${c.code} ${c.name}`);
