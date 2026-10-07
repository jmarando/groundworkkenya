// What an area's results say: turnout, valid votes, each bloc's share, ours, the margin, which
// way it leans and how it swung. Pure. Every function answers null for a figure it cannot work
// out, so a missing number never reads as zero.

import type { BlocShare, Lean, Turnout, Vote } from "./types";

/** Floating point leaves 10.000000000000002 where the answer is 10; round before comparing. */
export const settle = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Turnout in percent: cast over registered. Missing when either is, or the register is empty. */
export function turnoutPct(t: Turnout | null | undefined): number | null {
  if (!t || t.registered === null || t.cast === null || t.registered <= 0) return null;
  return settle((t.cast / t.registered) * 100);
}

/** Valid votes: what the document gives, else the candidates' votes added up. */
export function validVotes(t: Turnout | null | undefined, votes: Vote[]): number | null {
  if (t && t.valid !== null) return t.valid;
  if (votes.length === 0) return null;
  return votes.reduce((sum, v) => sum + v.votes, 0);
}

/** Each bloc's votes and share of the valid votes, biggest first, ties by name. */
export function blocShares(votes: Vote[], valid: number | null): BlocShare[] {
  if (valid === null || valid <= 0) return [];
  const byBloc = new Map<string, number>();
  for (const v of votes) byBloc.set(v.bloc, (byBloc.get(v.bloc) ?? 0) + v.votes);
  return [...byBloc]
    .map(([bloc, n]) => ({ bloc, votes: n, share: settle((n / valid) * 100) }))
    .sort((a, b) => b.votes - a.votes || a.bloc.localeCompare(b.bloc));
}

/** The campaign's side's share in percent; 0 when it did not stand; null with no side or no shares. */
export function ourShare(shares: BlocShare[], ourBloc: string | null): number | null {
  if (ourBloc === null || shares.length === 0) return null;
  return shares.find((s) => s.bloc === ourBloc)?.share ?? 0;
}

/** Our share minus the strongest other bloc's, in points; the other is 0 when unopposed. */
export function margin(shares: BlocShare[], ourBloc: string | null): number | null {
  const ours = ourShare(shares, ourBloc);
  if (ours === null) return null;
  const others = shares.filter((s) => s.bloc !== ourBloc).map((s) => s.share);
  return settle(ours - (others.length ? Math.max(...others) : 0));
}

/** The margin read as a side: ahead leans ours, behind leans theirs. */
export function lean(m: number | null): Lean | null {
  if (m === null) return null;
  const p = settle(m);
  return { side: p > 0 ? "ours" : p < 0 ? "theirs" : "even", points: Math.abs(p) };
}

/** Our share now minus our share at the election before, in points. */
export function swing(now: number | null, before: number | null): number | null {
  return now === null || before === null ? null : settle(now - before);
}
