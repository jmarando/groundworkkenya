// Reads IEBC's register by polling station into data/stations/<area>.csv, one row per centre,
// once every ward's centres add up to the voters the atlas holds for it. Run from the
// repository root, on the text of the PDF from
// https://www.iebc.or.ke/docs/rov_per_polling_station.pdf:
//   pdftotext -tsv rov_per_polling_station.pdf /tmp/rov.tsv
//   npx tsx --tsconfig tsconfig.json scripts/stations/register.ts /tmp/rov.tsv
import { readFileSync, writeFileSync } from "node:fs";

import { toCSV } from "@/lib/csv";
import { checkRegistered, registerCentres, registerStreams } from "@/lib/stations/register";

import { areaShapes, atlasRegistered, STATION_AREAS } from "./areas";

const [tsvPath] = process.argv.slice(2);
if (!tsvPath) {
  console.error("usage: register.ts <rov.tsv>");
  process.exit(2);
}
const tsv = readFileSync(tsvPath, "utf8");
let failed = false;
for (const area of STATION_AREAS) {
  const ours = new Set(areaShapes(area).map((s) => s.slug));
  const streams = registerStreams(tsv, area.prefix);
  const { centres, problems } = registerCentres(streams, ours);
  const all = [...problems, ...checkRegistered(centres, atlasRegistered(area))];
  for (const p of all) console.error(`${area.id}: ${p}`);
  if (all.length) {
    failed = true;
    continue;
  }
  const out = `data/stations/${area.id}.csv`;
  writeFileSync(
    out,
    toCSV(
      ["iebc_code", "code", "name", "ward", "streams", "registered"],
      centres.map((c) => [c.iebcCode, c.code, c.name, c.ward, c.streams, c.registered]),
    ).replace(/\r\n/g, "\n") + "\n",
  );
  const voters = centres.reduce((t, c) => t + c.registered, 0);
  console.log(`${out}: ${centres.length} centres, ${streams.length} streams, ${voters} voters`);
}
process.exit(failed ? 1 : 0);
