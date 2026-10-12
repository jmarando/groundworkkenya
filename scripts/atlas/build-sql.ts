// Writes one migration from the atlas folders named on the command line, once
// their figures pass the checks. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts supabase/migrations/<stamp>_atlas_<name>.sql kenya nairobi nyeri
import { writeFileSync } from "node:fs";

import { checkAtlas } from "@/lib/atlas-files";
import { atlasSql } from "@/lib/atlas-sql";

import { readAtlas, wardMaps } from "./read";

const [out, ...folders] = process.argv.slice(2);
if (!out || !folders.length) {
  console.error("usage: build-sql.ts <migration.sql> <folder>...");
  process.exit(2);
}
const { files, problems } = readAtlas("data/atlas", folders);
const all = [...problems, ...checkAtlas(files, wardMaps())];
if (all.length) {
  console.error(all.join("\n"));
  process.exit(1);
}
writeFileSync(
  out,
  `-- The election atlas's figures for ${folders.join(", ")}, from data/atlas.\n` +
    "-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.\n\n" +
    atlasSql(files),
);
console.log(`wrote ${out}`);
