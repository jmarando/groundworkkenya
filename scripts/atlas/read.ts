// Reads the atlas's folders from disk for the scripts and the data test.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  emptyFiles,
  FILE_NAMES,
  readTable,
  ROOT_TABLES,
  slugify,
  type AtlasFiles,
  type TableName,
} from "@/lib/atlas-files";

/**
 * Every table of the named folders under root, merged, with the tables kept in root itself
 * (the coalition file); a missing file is an empty table.
 */
export function readAtlas(
  root: string,
  folders: string[],
): { files: AtlasFiles; problems: string[] } {
  const files = emptyFiles();
  const problems: string[] = [];
  const read = (table: TableName, path: string) => {
    if (existsSync(path))
      problems.push(...readTable(table, readFileSync(path, "utf8"), path, files));
  };
  for (const folder of folders)
    for (const table of Object.keys(FILE_NAMES) as TableName[])
      if (!ROOT_TABLES.includes(table)) read(table, join(root, folder, FILE_NAMES[table]));
  for (const table of ROOT_TABLES) read(table, join(root, FILE_NAMES[table]));
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

/**
 * The wards each county's ward map knows, by slug, with the constituency the map puts each in
 * (null where it names none: Mathira's doesn't). Nyeri's map holds Mathira's wards only.
 */
export function wardMaps(): Record<string, Map<string, string | null>> {
  const wards = (file: string) =>
    new Map(
      (
        JSON.parse(readFileSync(file, "utf8")) as {
          features: { properties: { slug: string; constituency?: string } }[];
        }
      ).features.map((f) => [
        f.properties.slug,
        f.properties.constituency ? slugify(f.properties.constituency) : null,
      ]),
    );
  return {
    nairobi: wards("public/geo/nairobi-wards.json"),
    nyeri: wards("public/geo/mathira-wards.json"),
  };
}
