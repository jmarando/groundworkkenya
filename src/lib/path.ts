// The Path to State House engine: start from the 2022 presidential result,
// county by county, change a region's share or turnout, and see whether the
// two bars of Article 138 are cleared. Pure. The data is data/kenya (read by
// src/lib/kenya.ts); the plain-language readings are src/lib/path-lines.ts.
// docs/superpowers/plans/2026-10-17-path-to-state-house.md.
//
// Units: a `Move` is in percentage points (5 is five points). Every `share`
// and `turnout` in a result is a fraction (0.25 is 25%). `worth(...).points`
// is in percentage points.

import type { County, Kenya } from "@/lib/kenya";

/**
 * Article 138: a winner has more than half of the valid votes and at least 25%
 * of them in each of more than half of the 47 counties (24 or more). If nobody
 * does, the top two go to a runoff within 30 days.
 */
export const RULE = {
  counties: 47,
  countiesNeeded: 24,
  countyShare: 0.25,
  runoffDays: 30,
} as const;

/** The 2022 finalists' sides; the 2027 field is not set. */
export type Side = "ruto" | "raila";
export const SIDES: Record<Side, { bloc: string; candidate: string; rival: Side }> = {
  ruto: { bloc: "Kenya Kwanza", candidate: "William Ruto", rival: "raila" },
  raila: { bloc: "Azimio", candidate: "Raila Odinga", rival: "ruto" },
};

/** A change to every county of a region, in points: of the side's share, and of turnout. */
export type Move = { share: number; turnout: number };
/** Moves by region id; a region left out is unchanged. */
export type Scenario = Record<string, Move>;

export type CountyNow = {
  code: string;
  name: string;
  region: string;
  valid: number;
  yours: number;
  rival: number;
  others: number;
  /** Yours over valid; 0 where nobody voted. */
  share: number;
};
export type RegionNow = {
  id: string;
  name: string;
  counties: number;
  /** 2022, as declared. */
  valid: number;
  /** Its valid votes over all valid votes, the diaspora's included. */
  weight: number;
  /** Cast votes over registered voters. */
  turnout: number;
  /** The side's share of its valid votes. */
  share: number;
  /** The side's share in August 2017 and in 2022 (the 2017 side of Ruto is Uhuru Kenyatta's). */
  swing: { from: number; to: number };
  /** With the scenario. */
  now: { valid: number; yours: number; share: number; turnout: number };
  /** The side's votes now less its 2022 votes. */
  votesAdded: number;
};
export type Totals = {
  valid: number;
  yours: number;
  rival: number;
  others: number;
  /** Yours over valid. */
  share: number;
  /** Yours less the rival's. */
  margin: number;
  /** Votes still needed to be more than half of the valid votes; 0 once cleared. */
  toHalf: number;
  clearsHalf: boolean;
  /** Counties where yours is 25% or more of the valid votes. */
  counties: number;
  clearsCounties: boolean;
  won: boolean;
  /** Cast votes over registered voters, the diaspora's included. */
  turnout: number;
};
export type Path = { totals: Totals; regions: RegionNow[]; counties: CountyNow[] };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const NONE: Move = { share: 0, turnout: 0 };
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Whether a county is at the line: 25% or more of its valid votes (and somebody voted). */
export const atLine = (c: Pick<CountyNow, "valid" | "yours">): boolean =>
  c.valid > 0 && c.yours * 4 >= c.valid;

type Worked = CountyNow & { cast: number; registered: number; county: County };

/** One county with a region's move applied. A move of zero returns the declared numbers exactly. */
function work(c: County, side: Side, m: Move): Worked {
  const rival = SIDES[side].rival;
  const yours = c[side];
  const theirs = c[rival];
  const others = c.valid - yours - theirs;
  // Share first: yours moves, the rest is split as the rival and the others had it.
  const s = ratio(yours, c.valid);
  const y1 = m.share === 0 ? yours : clamp01(s + m.share / 100) * c.valid;
  const rest = c.valid - y1;
  const r1 = theirs + others > 0 ? (rest * theirs) / (theirs + others) : rest;
  const o1 = rest - r1;
  // Then turnout: every count scales, so the extra voters split like the county's own vote.
  const cast0 = c.valid + c.rejected;
  const t = cast0 / c.registered;
  const f = clamp01(t + m.turnout / 100) / t;
  const valid = c.valid * f;
  return {
    code: c.code,
    name: c.name,
    region: c.region,
    valid,
    yours: y1 * f,
    rival: r1 * f,
    others: o1 * f,
    share: f > 0 ? ratio(y1, c.valid) : 0,
    cast: cast0 * f,
    registered: c.registered,
    county: c,
  };
}

/** The 2022 map with `sc` applied, for one side: the national totals, each region and each county. */
export function runPath(k: Kenya, side: Side, sc: Scenario = {}): Path {
  const rival = SIDES[side].rival;
  const w = k.counties.map((c) => work(c, side, sc[c.region] ?? NONE));
  const yours = sum(w, (c) => c.yours) + k.outside[side];
  const theirs = sum(w, (c) => c.rival) + k.outside[rival];
  const valid = sum(w, (c) => c.valid) + k.outside.valid;
  const cast = sum(w, (c) => c.cast) + k.outside.valid + k.outside.rejected;
  const registered = sum(w, (c) => c.registered) + k.outside.registered;
  const atQuarter = w.filter(atLine).length;
  const toHalf = Math.max(0, Math.floor(valid / 2 - yours) + 1);
  const clearsCounties = atQuarter >= RULE.countiesNeeded;
  const base = k.counties;
  const side17 = (c: County) => (side === "ruto" ? c.uhuru2017 : c.raila2017);

  const regions = k.regions.map((g): RegionNow => {
    const inside = w.filter((c) => c.region === g.id);
    const declared = base.filter((c) => c.region === g.id);
    const valid0 = sum(declared, (c) => c.valid);
    const yours0 = sum(declared, (c) => c[side]);
    const yours1 = sum(inside, (c) => c.yours);
    const registeredHere = sum(declared, (c) => c.registered);
    const share0 = ratio(yours0, valid0);
    return {
      id: g.id,
      name: g.name,
      counties: declared.length,
      valid: valid0,
      weight: valid0 / (sum(base, (c) => c.valid) + k.outside.valid),
      turnout: sum(declared, (c) => c.valid + c.rejected) / registeredHere,
      share: share0,
      swing: {
        from: ratio(
          sum(declared, side17),
          sum(declared, (c) => c.valid2017),
        ),
        to: share0,
      },
      now: {
        valid: sum(inside, (c) => c.valid),
        yours: yours1,
        share: ratio(
          yours1,
          sum(inside, (c) => c.valid),
        ),
        turnout: sum(inside, (c) => c.cast) / registeredHere,
      },
      votesAdded: yours1 - yours0,
    };
  });

  return {
    totals: {
      valid,
      yours,
      rival: theirs,
      others: valid - yours - theirs,
      share: ratio(yours, valid),
      margin: yours - theirs,
      toHalf,
      clearsHalf: toHalf === 0,
      counties: atQuarter,
      clearsCounties,
      won: toHalf === 0 && clearsCounties,
      turnout: ratio(cast, registered),
    },
    regions,
    counties: w.map(({ code, name, region, valid, yours: y, rival: r, others, share }) => ({
      code,
      name,
      region,
      valid,
      yours: y,
      rival: r,
      others,
      share,
    })),
  };
}

/** Whether a scenario changes nothing. */
export const isBaseline = (sc: Scenario): boolean =>
  Object.values(sc).every((m) => m.share === 0 && m.turnout === 0);

/**
 * What `points` of the side's share in one region is worth on 2022's map: the
 * votes gained, and the national share gained in percentage points.
 */
export function worth(
  k: Kenya,
  side: Side,
  region: string,
  points = 5,
): { votes: number; points: number } {
  const base = runPath(k, side).totals;
  const t = runPath(k, side, { [region]: { share: points, turnout: 0 } }).totals;
  return { votes: t.yours - base.yours, points: (t.share - base.share) * 100 };
}

/**
 * The region where bringing turnout up to the national level adds the most net
 * votes (yours less the rival's) for the side on 2022's map; null when no region
 * below the national turnout leans the side's way.
 */
export function turnoutLever(
  k: Kenya,
  side: Side,
): {
  region: string;
  name: string;
  turnout: number;
  national: number;
  extra: number;
  net: number;
} | null {
  const base = runPath(k, side);
  const national = base.totals.turnout;
  let best: ReturnType<typeof turnoutLever> = null;
  for (const g of base.regions) {
    if (g.turnout >= national) continue;
    const t = runPath(k, side, {
      [g.id]: { share: 0, turnout: (national - g.turnout) * 100 },
    }).totals;
    const net = t.margin - base.totals.margin;
    if (net > 0 && (!best || net > best.net))
      best = {
        region: g.id,
        name: g.name,
        turnout: g.turnout,
        national,
        extra: t.valid - base.totals.valid,
        net,
      };
  }
  return best;
}

/**
 * The counties under the 25% line by no more than `band` (a fraction, 0.05 is
 * five points), closest first, ties by name. A county already at the line is not listed.
 */
export function nearLine(k: Kenya, side: Side, sc: Scenario = {}, band = 0.05): CountyNow[] {
  const gap = (c: CountyNow) => RULE.countyShare - c.share;
  return runPath(k, side, sc)
    .counties.filter((c) => c.yours * 4 < c.valid && gap(c) <= band)
    .sort((a, b) => gap(a) - gap(b) || a.name.localeCompare(b.name));
}
