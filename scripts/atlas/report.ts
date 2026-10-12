// Writes data/atlas/REPORT.md: what is loaded for each county, what is
// missing, and every source. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts
import { writeFileSync } from "node:fs";

import { atlasReport } from "@/lib/atlas-files";

import { atlasFolders, readAtlas } from "./read";

const { files, problems } = readAtlas("data/atlas", atlasFolders("data/atlas"));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync("data/atlas/REPORT.md", atlasReport(files));
console.log("wrote data/atlas/REPORT.md");
