// Reads the atlas's folders from disk for the scripts and the data test.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  emptyFiles,
  FILE_NAMES,
  readTable,
  type AtlasFiles,
  type TableName,
} from "@/lib/atlas-files";

/** Every table of the named folders under root, merged; a missing file is an empty table. */
export function readAtlas(
  root: string,
  folders: string[],
): { files: AtlasFiles; problems: string[] } {
  const files = emptyFiles();
  const problems: string[] = [];
  for (const folder of folders)
    for (const table of Object.keys(FILE_NAMES) as TableName[]) {
      const path = join(root, folder, FILE_NAMES[table]);
      if (existsSync(path))
        problems.push(...readTable(table, readFileSync(path, "utf8"), path, files));
    }
  return { files, problems };
}

/** The folders under root, alphabetically. */
export const atlasFolders = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

/** The ward slugs each county's ward map knows. Nyeri's map holds Mathira's wards only. */
export function wardSlugs(): Record<string, string[]> {
  const slugs = (file: string) =>
    (
      JSON.parse(readFileSync(file, "utf8")) as { features: { properties: { slug: string } }[] }
    ).features.map((f) => f.properties.slug);
  return {
    nairobi: slugs("public/geo/nairobi-wards.json"),
    nyeri: slugs("public/geo/mathira-wards.json"),
  };
}
