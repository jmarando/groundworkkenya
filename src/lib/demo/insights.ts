// The arithmetic behind the briefing: who leads where, what it takes to win,
// what a turnout swing is worth. Pure, so it is tested without a browser.

import type { AreaModel } from "@/lib/demo/types";

/** Kenya's general election: the second Tuesday of August 2027. */
export const ELECTION_DAY = "2027-08-10";

/** Share of cast votes rejected as spoilt, from recent elections. */
const REJECTED = 0.006;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Valid votes we expect from an area; `turnoutDelta` in points of turnout. */
export function expectedVotes(a: AreaModel, turnoutDelta = 0): number {
  return a.registered * clamp(a.turnout + turnoutDelta / 100, 0, 1) * (1 - REJECTED);
}

/**
 * Vote shares across areas, weighted by the votes each area casts. Keys not
 * listed, and any share an area leaves unassigned, count as "others".
 */
export function weightedShares(
  areas: AreaModel[],
  keys: string[],
  votesOf: (a: AreaModel) => number = (a) => expectedVotes(a),
): Record<string, number> {
  const total = areas.reduce((s, a) => s + votesOf(a), 0);
  const out: Record<string, number> = {};
  let named = 0;
  for (const k of keys) {
    const v = areas.reduce((s, a) => s + votesOf(a) * (a.shares[k] ?? 0), 0);
    out[k] = total ? v / total : 0;
    named += out[k] ?? 0;
  }
  out["others"] = Math.max(0, 100 - named);
  return out;
}

/** How many areas give a contender at least `pct` percent. */
export function countAtLeast(areas: AreaModel[], key: string, pct: number): number {
  return areas.filter((a) => (a.shares[key] ?? 0) >= pct).length;
}

/** Our lead over the strongest rival in an area, in points (negative when behind). */
export function areaMargin(a: AreaModel, usKey: string): { margin: number; rival: string | null } {
  let rival: string | null = null;
  let best = -1;
  for (const [k, v] of Object.entries(a.shares)) {
    if (k !== usKey && v > best) {
      best = v;
      rival = k;
    }
  }
  return { margin: (a.shares[usKey] ?? 0) - Math.max(best, 0), rival };
}

/**
 * What a turnout swing in our strongholds is worth: raise turnout by
 * `deltaPts` wherever our share is at least `strongholdMin`.
 */
export function turnoutWhatIf(
  areas: AreaModel[],
  keys: string[],
  usKey: string,
  deltaPts: number,
  strongholdMin = 50,
): { before: Record<string, number>; after: Record<string, number>; extraVotes: number } {
  const lifted = (a: AreaModel) => ((a.shares[usKey] ?? 0) >= strongholdMin ? deltaPts : 0);
  const before = weightedShares(areas, keys);
  const after = weightedShares(areas, keys, (a) => expectedVotes(a, lifted(a)));
  const extraVotes = areas.reduce(
    (s, a) => s + ((expectedVotes(a, lifted(a)) - expectedVotes(a)) * (a.shares[usKey] ?? 0)) / 100,
    0,
  );
  return { before, after, extraVotes };
}

/** Whole days from one calendar date to another (YYYY-MM-DD). */
export function daysBetween(fromIso: string, toIso: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(toIso) - d(fromIso)) / 86_400_000);
}

/** Today's date in Nairobi as YYYY-MM-DD. */
export function nairobiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A seeded pseudo-random stream (mulberry32): the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A stable number from a string, for seeding per area. */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
