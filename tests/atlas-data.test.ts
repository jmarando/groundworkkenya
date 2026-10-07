// Checks every county's figures in data/atlas before they become a migration:
// the sums, the shares, the areas and the sources. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts

import { checkAtlas } from "@/lib/atlas-files";

import { atlasFolders, readAtlas, wardSlugs } from "../scripts/atlas/read";

const folders = atlasFolders("data/atlas");
const { files, problems } = readAtlas("data/atlas", folders);
const all = [...problems, ...checkAtlas(files, wardSlugs())];
for (const p of all) console.log(`FAIL ${p}`);
console.log(`${folders.length} folders, ${files.results.length} results, ${all.length} problems`);
process.exit(all.length ? 1 : 0);
