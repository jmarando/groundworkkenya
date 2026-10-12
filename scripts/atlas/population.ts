// WorldPop's 2020 age-and-sex estimate for every ward in a ward map, written as
// an atlas population.csv. Run from the repository root, for example:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts public/geo/nairobi-wards.json nairobi data/atlas/nairobi/population.csv
//   npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts public/geo/mathira-wards.json nyeri data/atlas/nyeri/population.csv mathira
// The optional last argument names the constituency for a map whose wards
// don't say. ATLAS_LIMIT=2 tries the first two wards only. A ward WorldPop
// can't answer for is left out and named at the end: missing stays missing.
import { readFileSync, writeFileSync } from "node:fs";

import { slugify } from "@/lib/atlas-files";
import {
  compactGeometry,
  fromPyramid,
  type Outline,
  type PyramidBand,
} from "@/lib/atlas-population";
import { toCSV } from "@/lib/csv";

const YEAR = 2020;
const SOURCE = "worldpop-2020-agesex";
const API = "https://api.worldpop.org/v1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Body = {
  status?: string;
  taskid?: string;
  error?: boolean;
  error_message?: string;
  data?: { agesexpyramid?: PyramidBand[] };
};

async function pyramid(geometry: Outline): Promise<PyramidBand[]> {
  const geojson = JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry }],
  });
  let body = (await (
    await fetch(
      `${API}/services/stats?dataset=wpgpas&year=${YEAR}&runasync=false&geojson=${encodeURIComponent(geojson)}`,
    )
  ).json()) as Body;
  for (let i = 0; body.taskid && body.status !== "finished" && !body.error && i < 90; i++) {
    await wait(2000);
    body = (await (await fetch(`${API}/tasks/${body.taskid}`)).json()) as Body;
  }
  if (body.error) throw new Error(body.error_message ?? "WorldPop refused the query");
  const bands = body.data?.agesexpyramid;
  if (!Array.isArray(bands))
    throw new Error(`no age-sex pyramid in ${JSON.stringify(body).slice(0, 300)}`);
  return bands;
}

const [geoFile, county, out, constituency] = process.argv.slice(2);
if (!geoFile || !county || !out) {
  console.error("usage: population.ts <ward map> <county key> <out.csv> [constituency key]");
  process.exit(2);
}
type Ward = { properties: { slug: string; constituency?: string }; geometry: Outline };
const wards = (JSON.parse(readFileSync(geoFile, "utf8")) as { features: Ward[] }).features.slice(
  0,
  Number(process.env["ATLAS_LIMIT"]) || undefined,
);
const rows: (string | number)[][] = [];
const failed: string[] = [];
for (const w of wards) {
  const key = `${county}/${constituency ?? slugify(w.properties.constituency ?? "")}/${w.properties.slug}`;
  try {
    const p = fromPyramid(await pyramid(compactGeometry(w.geometry, 0.0003)));
    rows.push([key, YEAR, p.total, p.adults, p.young_adults, SOURCE]);
    console.log(`${key}: ${p.total} people, ${p.adults} adults, ${p.young_adults} aged 18–34`);
  } catch (e) {
    failed.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await wait(1500);
}
writeFileSync(
  out,
  `${toCSV(["area", "year", "total", "adults", "young_adults", "source"], rows).replace(/\r\n/g, "\n")}\n`,
);
console.log(`wrote ${rows.length} wards to ${out}`);
if (failed.length) console.log(`not answered, left out:\n${failed.join("\n")}`);
