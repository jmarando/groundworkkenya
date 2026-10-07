// Prints areas.csv rows for every ward in a ward map, under its constituency,
// to paste into data/atlas/<county>/areas.csv below the county's own row. Run
// from the repository root, for example:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/nairobi-wards.json nairobi
//   npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/mathira-wards.json nyeri mathira
// The last argument names the constituency for a map whose wards don't say.
import { readFileSync } from "node:fs";

import { slugify } from "@/lib/atlas-files";
import { toCSV } from "@/lib/csv";

const [geoFile, county, constituency] = process.argv.slice(2);
if (!geoFile || !county) {
  console.error("usage: areas.ts <ward map> <county key> [constituency key]");
  process.exit(2);
}
const titled = (slug: string) =>
  slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
type Ward = { properties: { slug: string; name: string; constituency?: string } };
const wards = (JSON.parse(readFileSync(geoFile, "utf8")) as { features: Ward[] }).features;
const rows = new Map<string, string[]>();
for (const w of wards) {
  const cName = w.properties.constituency ?? titled(constituency ?? "");
  const c = constituency ?? slugify(cName);
  rows.set(`${county}/${c}`, [`${county}/${c}`, "constituency", cName, county, ""]);
  rows.set(`${county}/${c}/${w.properties.slug}`, [
    `${county}/${c}/${w.properties.slug}`,
    "ward",
    w.properties.name,
    `${county}/${c}`,
    "",
  ]);
}
console.log(
  toCSV(
    ["key", "level", "name", "parent", "iebc_code"],
    [...rows.values()].sort((a, b) => a[0]!.localeCompare(b[0]!)),
  ).replace(/\r\n/g, "\n"),
);
