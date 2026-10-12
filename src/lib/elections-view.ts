// The Elections section's rules: what the address holds (area, race, year,
// shade), the campaign's home area, the breadcrumb, and cleaning what the
// candidate or manager saves (home area, sides, notes). Pure.

import { RACES, YEARS, type Race } from "@/lib/atlas";
import { ATLAS_ELECTIONS, slugify } from "@/lib/atlas-files";

export type Shade = "todo" | "lean" | "turnout" | "swing";
export const SHADES: Shade[] = ["todo", "lean", "turnout", "swing"];

export type AreaRef = { key: string; level: string; name: string; parent: string | null };

export type ElectionsSearch = { area?: string; race?: Race; year?: number; shade?: Shade };
export type ElectionsChanges = { [K in keyof ElectionsSearch]?: ElectionsSearch[K] | undefined };

const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+){0,2}$/;

/** The address's search, anything unknown dropped (an unknown but well-formed area is kept). */
export function validateElectionsSearch(raw: Record<string, unknown>): ElectionsSearch {
  const out: ElectionsSearch = {};
  const area = raw["area"];
  if (typeof area === "string" && KEY.test(area)) out.area = area;
  if (RACES.includes(raw["race"] as Race)) out.race = raw["race"] as Race;
  const year = Number(raw["year"]);
  if ((YEARS as readonly number[]).includes(year)) out.year = year;
  if (SHADES.includes(raw["shade"] as Shade)) out.shade = raw["shade"] as Shade;
  return out;
}

/** The address with `changes` applied; an undefined change removes its key. */
export function nextElectionsSearch(
  prev: ElectionsSearch,
  changes: ElectionsChanges,
): ElectionsSearch {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return validateElectionsSearch(out);
}

/** The race a campaign looks at first: its own. */
export const defaultRace = (level: string | null | undefined): Race =>
  level === "mp" ? "mp" : level === "president" ? "president" : "governor";

/** The campaign's home area: what it set, else its seat ("MP · Mathira", "Governor · Nairobi"), else Kenya. */
export function homeAreaFor(
  campaign: { level: string; seat: string } | null,
  set: string | null,
  areas: AreaRef[],
): string {
  if (set && areas.some((a) => a.key === set)) return set;
  if (!campaign || campaign.level === "president") return "kenya";
  const place = slugify(campaign.seat.split("·").pop() ?? "");
  const level = campaign.level === "mp" ? "constituency" : "county";
  return (
    areas.find(
      (a) => a.level === level && (slugify(a.name) === place || a.key.split("/").pop() === place),
    )?.key ?? "kenya"
  );
}

/** Kenya › Nairobi › Westlands › Kangemi, for the areas the atlas holds. */
export function crumbsTo(areas: AreaRef[], key: string): AreaRef[] {
  const byKey = new Map(areas.map((a) => [a.key, a]));
  const out: AreaRef[] = [];
  for (let a = byKey.get(key); a; a = a.parent ? byKey.get(a.parent) : undefined) out.unshift(a);
  return out;
}

/** The county an area sits in; null for Kenya. */
export const countyOf = (key: string): string | null =>
  key === "kenya" ? null : (key.split("/")[0] ?? null);

/** A note as the candidate or manager saves it. */
export function cleanNote(input: { area?: unknown; body?: unknown }): {
  area: string;
  body: string;
} {
  const area = String(input?.area ?? "");
  const body = String(input?.body ?? "").trim();
  if (!KEY.test(area)) throw new Error("Which place?");
  if (!body) throw new Error("Write the note first.");
  if (body.length > 2000) throw new Error("Keep a note to 2,000 characters.");
  return { area, body };
}

/** Our side in one election; an empty one clears it. */
export function cleanSide(input: { election?: unknown; bloc?: unknown }): {
  election: string;
  bloc: string | null;
} {
  const election = String(input?.election ?? "");
  if (!ATLAS_ELECTIONS.includes(election)) throw new Error("Which election?");
  const bloc = typeof input?.bloc === "string" ? input.bloc.trim() : "";
  if (bloc.length > 60) throw new Error("That side's name is too long.");
  return { election, bloc: bloc || null };
}

export function cleanHome(input: { area?: unknown }): { area: string } {
  const area = String(input?.area ?? "");
  if (!KEY.test(area)) throw new Error("Which place?");
  return { area };
}
