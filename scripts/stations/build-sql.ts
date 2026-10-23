// Writes the migration that loads data/stations (schema 27, part 2), or a later one for the areas
// that name it (scripts/stations/areas.ts), once the data test's checks pass. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json scripts/stations/build-sql.ts supabase/migrations/20261015090100_polling_centres_data.sql
//   npx tsx --tsconfig tsconfig.json scripts/stations/build-sql.ts supabase/migrations/20261019090300_polling_centres_githunguri_athwana.sql
import { writeFileSync } from "node:fs";
import { basename } from "node:path";

import { checkRegistered } from "@/lib/stations/register";
import { stationsAddition, stationsMigration } from "@/lib/stations/sql";

import { atlasRegistered, STATION_AREAS } from "./areas";
import { readCentres, stationAreasData } from "./read";

const [out] = process.argv.slice(2);
if (!out) {
  console.error("usage: build-sql.ts <migration.sql>");
  process.exit(2);
}
const problems = STATION_AREAS.flatMap((a) =>
  checkRegistered(readCentres(a), atlasRegistered(a)).map((p) => `${a.id}: ${p}`),
);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const name = basename(out);
const later = STATION_AREAS.some((a) => a.migration === name);
writeFileSync(
  out,
  later ? stationsAddition(stationAreasData(name)) : stationsMigration(stationAreasData()),
);
console.log(`wrote ${out}`);
