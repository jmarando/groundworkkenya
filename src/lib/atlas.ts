// The election atlas's arithmetic: turnout, shares, margins, swing, register
// growth, the estimate of adults not yet registered, what to do in an area and
// why, and the votes within reach. Pure: the screens hand it an area's count
// and show what comes back.

export type Race = "president" | "governor" | "mp";
export const RACES: Race[] = ["president", "governor", "mp"];
export const YEARS = [2013, 2017, 2022] as const;

export const electionId = (year: number, race: Race) => `${year}-${race}`;

/** One area's count in one election. */
export type AreaCount = {
  year: number;
  /** Who stood, with their bloc and their votes here. */
  candidates: { name: string; party: string | null; bloc: string; votes: number }[];
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
};

export type BlocShare = { bloc: string; votes: number; share: number };

/** Votes cast ÷ registered; null when either is missing or nobody was registered. */
export function turnout(c: AreaCount): number | null {
  return c.cast !== null && c.registered ? c.cast / c.registered : null;
}

/** The document's valid votes, else the candidates' votes added up. */
export const validVotes = (c: AreaCount): number =>
  c.valid ?? c.candidates.reduce((t, x) => t + x.votes, 0);

/** Each bloc's votes and share of the valid votes, largest first. */
export function blocShares(c: AreaCount): BlocShare[] {
  const valid = validVotes(c);
  const by = new Map<string, number>();
  for (const x of c.candidates) by.set(x.bloc, (by.get(x.bloc) ?? 0) + x.votes);
  return [...by.entries()]
    .map(([bloc, votes]) => ({ bloc, votes, share: valid ? votes / valid : 0 }))
    .sort((a, b) => b.votes - a.votes || a.bloc.localeCompare(b.bloc));
}

/** Our side's share: null without a side or votes; 0 when our side had nobody standing here. */
export function ourShare(c: AreaCount, side: string | null): number | null {
  if (!side || !validVotes(c)) return null;
  return blocShares(c).find((b) => b.bloc === side)?.share ?? 0;
}

/** Our share minus the strongest other bloc's. */
export function margin(c: AreaCount, side: string | null): number | null {
  const ours = ourShare(c, side);
  if (ours === null) return null;
  const other = blocShares(c).find((b) => b.bloc !== side);
  return ours - (other?.share ?? 0);
}

/** Our share now minus at the election before, each with that election's side (0.05 is 5 points). */
export function swing(
  now: AreaCount | null,
  sideNow: string | null,
  before: AreaCount | null,
  sideBefore: string | null,
): number | null {
  if (!now || !before) return null;
  const a = ourShare(now, sideNow);
  const b = ourShare(before, sideBefore);
  return a === null || b === null ? null : a - b;
}

export function registerGrowth(
  now: number | null,
  before: number | null,
): { change: number; rate: number | null } | null {
  if (now === null || before === null) return null;
  return { change: now - before, rate: before ? (now - before) / before : null };
}

/** Adults not on the register (an estimate, never below zero) and the share of adults aged 18–34. */
export function notRegistered(
  pop: { adults: number; young_adults: number } | null,
  registered: number | null,
): { adults: number; youngShare: number | null } | null {
  if (!pop || registered === null) return null;
  return {
    adults: Math.max(pop.adults - registered, 0),
    youngShare: pop.adults ? pop.young_adults / pop.adults : null,
  };
}

/** An estimated quarter or more of the adults aren't registered. */
export const registerFlag = (gap: { adults: number } | null, adults: number | null): boolean =>
  Boolean(gap && adults && gap.adults / adults >= 0.25);

/** The 75th percentile by nearest rank (a value in the list); null for no values. */
export function topQuarter(values: number[]): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  return xs[Math.ceil(0.75 * xs.length) - 1]!;
}

/** Votes within reach, in two parts and their sum. */
export type Reach = {
  /** Null when it can't be worked out: then `total` is the persuasion part alone. */
  turnout: number | null;
  persuasion: number;
  total: number;
  partial: boolean;
};

/**
 * The votes within reach here: lifting turnout to the top quarter of the
 * area's siblings (itself among them) at our share, and a 5-point swing of the
 * valid votes.
 */
export function votesWithinReach(
  c: AreaCount,
  side: string | null,
  siblingTurnouts: number[],
): Reach | null {
  const share = ourShare(c, side);
  if (share === null) return null;
  const t = turnout(c);
  // The top quarter needs at least four places with a turnout (the area itself among them).
  const target = siblingTurnouts.length >= 4 ? topQuarter(siblingTurnouts) : null;
  const fromTurnout =
    t === null || target === null || !c.registered
      ? null
      : target > t
        ? Math.round((target - t) * c.registered * share)
        : 0;
  const persuasion = Math.round(0.05 * validVotes(c));
  return {
    turnout: fromTurnout,
    persuasion,
    total: (fromTurnout ?? 0) + persuasion,
    partial: fromTurnout === null,
  };
}

export type Todo = "mobilise" | "hold" | "cut" | "persuade" | "lean-ours" | "no-side";

export const TODO_NAMES: Record<Todo, string> = {
  mobilise: "Mobilise",
  hold: "Hold",
  cut: "Cut the gap",
  persuade: "Persuade",
  "lean-ours": "Lean ours",
  "no-side": "Set your side first",
};

const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => `${Math.round(Math.abs(x) * 1000) / 10}`;

export type TodoInput = {
  year: number;
  count: AreaCount;
  side: string | null;
  /** Turnout in the area around this one (the county for a constituency), same election. */
  parentTurnout: number | null;
  parentName: string | null;
  /** The same area at the election before, with our side then. */
  before: { year: number; count: AreaCount; side: string | null } | null;
};

/** Shares are floats: a gap of exactly 3 or 10 points must not tip over a line by rounding. */
const EPS = 1e-9;

/**
 * What to do here and why; the first rule that matches wins. The rules follow
 * who is ahead, not the share alone: behind within 10 points is Persuade, behind
 * by more is Cut the gap, ahead by more than 10 (short of Hold) is Lean ours.
 */
export function whatToDo(i: TodoInput): { todo: Todo; reason: string } {
  const share = ourShare(i.count, i.side);
  if (share === null) return { todo: "no-side", reason: `Set your side in ${i.year} first.` };
  const t = turnout(i.count);
  const m = margin(i.count, i.side) ?? 0;
  const leader = blocShares(i.count).find((b) => b.bloc !== i.side);
  const sw = i.before ? swing(i.count, i.side, i.before.count, i.before.side) : null;
  if (
    share >= 0.5 - EPS &&
    t !== null &&
    i.parentTurnout !== null &&
    i.parentTurnout - t > 0.03 + EPS
  )
    return {
      todo: "mobilise",
      reason: `We took ${pct1(share)} here in ${i.year}, but turnout was ${pct0(t)}, ${points(i.parentTurnout - t)} points below ${i.parentName ?? "the area around it"}.`,
    };
  if (share >= 0.6 - EPS)
    return { todo: "hold", reason: `We took ${pct1(share)} here in ${i.year}.` };
  if (m < -0.1 - EPS)
    return {
      todo: "cut",
      reason: `We trail ${leader?.bloc ?? "the leader"} by ${points(m)} points here in ${i.year}: ${pct1(share)} to ${pct1(leader?.share ?? 0)}.`,
    };
  if (Math.abs(m) <= 0.1 + EPS)
    return {
      todo: "persuade",
      reason: `${i.year} was close: ${pct1(share)} to us against ${pct1(leader?.share ?? 0)} for ${leader?.bloc ?? "the rest"}.`,
    };
  if (sw !== null && i.before && Math.abs(sw) >= 0.1 - EPS)
    return {
      todo: "persuade",
      reason: `Our share moved ${points(sw)} points ${sw > 0 ? "up" : "down"} between ${i.before.year} and ${i.year}.`,
    };
  return {
    todo: "lean-ours",
    reason: `We took ${pct1(share)} here in ${i.year}, a ${points(m)}-point lead.`,
  };
}

const LEVEL_TOTAL: Record<string, string> = {
  country: "national total",
  county: "county total",
  constituency: "constituency total",
  ward: "ward total",
};

/** The tag every figure carries: "IEBC · constituency total · 2022", "WorldPop estimate · 2020". */
export function figureTag(
  publisher: string,
  level: string,
  year: number,
  estimate = false,
): string {
  return estimate
    ? `${publisher} estimate · ${year}`
    : `${publisher} · ${LEVEL_TOTAL[level] ?? level} · ${year}`;
}
