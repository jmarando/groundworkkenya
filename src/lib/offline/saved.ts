// The page data kept on the phone for no signal: which queries, what of each
// is kept (never the voter file, the contacts feed, today's ward list or recent visits),
// how long, and for whom. Pure. The one exception is the walk lists out with the person: a list
// opened once with signal is kept whole, names and full numbers at its doors included, because
// an agent at a door with no signal needs them (agreed 14 October 2026). It is forgotten when
// the list ends (listsToForget), after 14 days, and at sign-out.

import type { CanvassData, VotersData } from "@/lib/console.functions";

/** Saved data in another format is deleted rather than read. */
export const SAVED_VERSION = 1;
/** Nothing older than this is kept. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type SavedEntry = { id: string; key: readonly unknown[]; data: unknown; updatedAt: number };
/** Whose saved data it is. */
export type Who = { userId: string; campaignId: string | null; version: number };

const same = (data: unknown) => data;

/** Each saved query, by the first part of its key, and what of it is kept. */
const KEEP: Record<string, (data: unknown) => unknown> = {
  "my-access": same,
  home: same,
  diary: same,
  atlas: same,
  findings: same,
  "area-doors": same,
  "map-config": same,
  "my-walk-lists": same,
  "walk-list-doors": same,
  voters: (data) => {
    const v = data as Partial<VotersData>;
    return { wards: v.wards ?? [], totals: v.totals, feed: [], people: [] };
  },
  canvassing: (data) => {
    const c = data as Partial<CanvassData>;
    return {
      totals: c.totals,
      wards: c.wards ?? [],
      issues: c.issues ?? [],
      unplaced: c.unplaced,
      walkList: [],
      recent: [],
    };
  },
};

export const isSaved = (key: readonly unknown[]): boolean =>
  typeof key[0] === "string" && Object.hasOwn(KEEP, key[0]);

export const idOf = (key: readonly unknown[]): string => JSON.stringify(key);

/** What of a query's data is kept; undefined for a query that isn't saved. */
export function keptForm(key: readonly unknown[], data: unknown): unknown {
  const keep = typeof key[0] === "string" && Object.hasOwn(KEEP, key[0]) ? KEEP[key[0]] : undefined;
  return keep && data !== undefined ? keep(data) : undefined;
}

/**
 * The saved copies of walk lists that are no longer out with the person: the ids of the saved
 * `walk-list-doors` entries whose list (the second part of the key) isn't among `active`.
 */
export function listsToForget(entries: SavedEntry[], active: string[]): string[] {
  return entries
    .filter((e) => e.key[0] === "walk-list-doors" && !active.includes(String(e.key[1])))
    .map((e) => e.id);
}

/** The saved entries still young enough, and the ids of the rest. */
export function restorable(
  entries: SavedEntry[],
  now: number,
): { keep: SavedEntry[]; drop: string[] } {
  const keep: SavedEntry[] = [];
  const drop: string[] = [];
  for (const e of entries) {
    if (isSaved(e.key) && now - e.updatedAt <= MAX_AGE_MS) keep.push(e);
    else drop.push(e.id);
  }
  return { keep, drop };
}

/** The campaign a saved access record belongs to. */
export const campaignOf = (access: unknown): string | null =>
  (access as { campaign?: { id?: unknown } | null } | null)?.campaign?.id?.toString() ?? null;
