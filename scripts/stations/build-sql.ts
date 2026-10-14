// Writes the migration that loads data/stations (schema 27, part 2), once the data test's
// checks pass. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/stations/build-sql.ts supabase/migrations/20261015090100_polling_centres_data.sql
import { writeFileSync } from "node:fs";

import { checkRegistered } from "@/lib/stations/register";
import { stationsMigration } from "@/lib/stations/sql";

import { areaShapes, atlasRegistered, STATION_AREAS } from "./areas";
import { stationAreasData } from "./read";

const [out] = process.argv.slice(2);
if (!out) {
  console.error("usage: build-sql.ts <migration.sql>");
  process.exit(2);
}
const areas = stationAreasData();
const problems = STATION_AREAS.flatMap((a, i) =>
  checkRegistered(areas[i]!.centres, atlasRegistered(a)).map((p) => `${a.id}: ${p}`),
);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync(out, stationsMigration(stationAreasData()));
console.log(`wrote ${out}`);
