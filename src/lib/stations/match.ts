// Where a polling centre is, from OpenStreetMap's schools: most centres are schools, and a
// school on the map with the centre's name, in the centre's ward or within 2 km of it, is
// where the centre is. Pure. The rules (docs/superpowers/specs/2026-10-14-polling-centres-
// and-walk-lists-design.md):
// - names match without words like "primary school", in any order;
// - a name one word off (one word more, less or different, at least two the same) is a close
//   name, kept as a hollow pin until someone confirms it;
// - a primary school is never a secondary school's centre, nor the other way round;
// - of several, the one inside the ward first, then the same kind, then a school drawn as an
//   area (its campus) over a point, then the nearest; when the same name sits more than
//   500 m apart, the match is only close.

import { distanceM, distanceOutsideM, type LngLat, type Ring } from "@/lib/geo";

/** A school on OpenStreetMap: its id (node/123, way/456), name and where it is. */
export type School = { id: string; name: string; at: LngLat; area: boolean };

export type Placed = { at: LngLat; placedBy: "osm" | "osm-close"; osmId: string; osmName: string };

/** How far outside the centre's ward a school can be. */
const NEAR_WARD_M = 2000;
/** The same name further apart than this isn't one school drawn twice. */
const SAME_PLACE_M = 500;

/** Words that say what kind of school, not which. */
const GENERIC = new Set([
  "primary",
  "pri",
  "prim",
  "secondary",
  "sec",
  "sch",
  "school",
  "schools",
  "high",
  "day",
  "mixed",
  "boarding",
  "comprehensive",
  "and",
  "the",
  "of",
]);

/**
 * A name's words: lower case, no accents or apostrophes, letters and digits only. The register
 * prints an apostrophe as a gap ("ST MARY S"), so a lone "s" joins the word before it.
 */
export function nameWords(name: string): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words)
    if (w === "s" && out.length) out[out.length - 1] += "s";
    else out.push(w);
  return out;
}

/** The words that say which school: the name without its kind. */
export const coreWords = (name: string): string[] => nameWords(name).filter((w) => !GENERIC.has(w));

export function schoolKind(name: string): "primary" | "secondary" | null {
  const w = new Set(nameWords(name));
  if (w.has("primary") || w.has("pri") || w.has("prim")) return "primary";
  if (w.has("secondary") || w.has("sec") || w.has("high")) return "secondary";
  return null;
}

/** "exact" when the core words are the same in any order, "close" when one word off, else null. */
export function nameMatch(centre: string, school: string): "exact" | "close" | null {
  const a = coreWords(centre);
  const b = coreWords(school);
  if (!a.length || !b.length) return null;
  if ([...a].sort().join(" ") === [...b].sort().join(" ")) return "exact";
  const sa = new Set(a);
  const sb = new Set(b);
  const shared = [...sa].filter((w) => sb.has(w)).length;
  const differ = sa.size + sb.size - 2 * shared;
  return shared >= 2 && (differ === 1 || (differ === 2 && sa.size === sb.size)) ? "close" : null;
}

/** Where a centre is, from the schools: null when none matches inside its ward or near it. */
export function placeCentre(name: string, ward: Ring[][], schools: School[]): Placed | null {
  const kind = schoolKind(name);
  const found: { s: School; how: "exact" | "close"; outside: number; sameKind: boolean }[] = [];
  for (const s of schools) {
    const other = schoolKind(s.name);
    if (kind && other && kind !== other) continue;
    const how = nameMatch(name, s.name);
    if (!how) continue;
    const outside = distanceOutsideM(s.at, ward);
    if (outside > NEAR_WARD_M) continue;
    found.push({ s, how, outside, sameKind: Boolean(kind && other === kind) });
  }
  if (!found.length) return null;
  found.sort(
    (a, b) =>
      Number(a.outside > 0) - Number(b.outside > 0) ||
      Number(a.how === "close") - Number(b.how === "close") ||
      Number(b.sameKind) - Number(a.sameKind) ||
      Number(b.s.area) - Number(a.s.area) ||
      a.outside - b.outside ||
      a.s.id.localeCompare(b.s.id),
  );
  const best = found[0]!;
  // The same name elsewhere on the same side of the ward's edge: not certain which.
  const elsewhere = found.some(
    (f) =>
      f !== best &&
      f.how === "exact" &&
      f.outside > 0 === best.outside > 0 &&
      distanceM(f.s.at, best.s.at) > SAME_PLACE_M,
  );
  return {
    at: best.s.at,
    placedBy: best.how === "exact" && !elsewhere ? "osm" : "osm-close",
    osmId: best.s.id,
    osmName: best.s.name,
  };
}

/** The schools in an Overpass reply (`out center tags`): named ones, with a point for each. */
export function overpassSchools(json: unknown): School[] {
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const out: School[] = [];
  for (const e of elements as Record<string, unknown>[]) {
    const tags = e["tags"] as Record<string, unknown> | undefined;
    const name = typeof tags?.["name"] === "string" ? tags["name"].trim() : "";
    const centre = (e["center"] as { lon?: unknown; lat?: unknown } | undefined) ?? e;
    const lng = centre["lon"];
    const lat = centre["lat"];
    if (!name || typeof lng !== "number" || typeof lat !== "number") continue;
    out.push({
      id: `${String(e["type"])}/${String(e["id"])}`,
      name,
      at: [lng, lat],
      area: e["type"] !== "node",
    });
  }
  return out;
}
