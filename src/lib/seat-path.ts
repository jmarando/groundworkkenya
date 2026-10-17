// The Path to City Hall engine: start from a county's 2022 governor result in
// each constituency, change a constituency's share or turnout, and see whether
// the side still has more votes than anyone else. Pure. The seat is read from
// the atlas by src/lib/seat.ts; the readings are src/lib/seat-lines.ts.
// docs/superpowers/plans/2026-10-17-path-to-city-hall.md.
//
// What a constituency holds is the two main candidates' votes and the register,
// so its share is the two-way share (yours over the two together) and its
// turnout is the two together over the register. Every other candidate is held
// as they were, county-wide. Units: a `Move` is in percentage points; every
// `share` and `turnout` in a result is a fraction.

import type { Move, Scenario } from "@/lib/path";
import type { Seat } from "@/lib/seat";

export type BucketNow = {
  key: string;
  name: string;
  seats: number;
  together: boolean;
  /** With the scenario. */
  yours: number;
  rival: number;
  margin: number;
  /** Yours over the two together. */
  share: number;
  /** The two together over the register. */
  turnout: number;
  registered: number;
  /** 2022, as the atlas has it. */
  was: { yours: number; rival: number; margin: number; share: number; turnout: number };
};

export type SeatTotals = {
  yours: number;
  rival: number;
  others: number;
  valid: number;
  share: number;
  margin: number;
  /** More votes than the rival and than the biggest other candidate. */
  leads: boolean;
  /** Votes that would have to change sides to change who is ahead: half the margin, and one. */
  toTurn: number;
  /** Constituencies reported separately that yours leads, out of `reported`. */
  carried: number;
  reported: number;
  /** The seats the figures don't separate, together; null when there are none. */
  together: { seats: number; margin: number } | null;
  /** The two main candidates together over the whole register. */
  turnout: number;
};

export type SeatRun = { totals: SeatTotals; buckets: BucketNow[] };

const NONE: Move = { share: 0, turnout: 0 };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** The seat with `sc` applied: the totals and each bucket. A move of zero returns the atlas's figures exactly. */
export function runSeat(seat: Seat, sc: Scenario = {}): SeatRun {
  const buckets = seat.buckets.map((b): BucketNow => {
    const m = sc[b.key] ?? NONE;
    const two = b.yours + b.rival;
    const share0 = ratio(b.yours, two);
    const turnout0 = ratio(two, b.registered);
    // Share first: the two main candidates' votes are shared out afresh.
    const y1 = m.share === 0 ? b.yours : clamp01(share0 + m.share / 100) * two;
    const r1 = two - y1;
    // Then turnout: both counts scale, so the extra voters split like the constituency's own.
    const f = two > 0 && b.registered > 0 ? clamp01(turnout0 + m.turnout / 100) / turnout0 : 1;
    const yours = y1 * f;
    const rival = r1 * f;
    return {
      key: b.key,
      name: b.name,
      seats: b.seats,
      together: b.together,
      yours,
      rival,
      margin: yours - rival,
      share: ratio(yours, yours + rival),
      turnout: ratio(yours + rival, b.registered),
      registered: b.registered,
      was: {
        yours: b.yours,
        rival: b.rival,
        margin: b.yours - b.rival,
        share: share0,
        turnout: turnout0,
      },
    };
  });

  const yours = buckets.reduce((t, b) => t + b.yours, 0);
  const rival = buckets.reduce((t, b) => t + b.rival, 0);
  const valid = yours + rival + seat.others;
  const margin = yours - rival;
  const single = buckets.filter((b) => !b.together);
  const together = buckets.find((b) => b.together);
  return {
    totals: {
      yours,
      rival,
      others: seat.others,
      valid,
      share: ratio(yours, valid),
      margin,
      leads: yours > rival && yours > seat.topOther,
      toTurn: Math.floor(Math.abs(margin) / 2) + 1,
      carried: single.filter((b) => b.margin > 0).length,
      reported: single.length,
      together: together ? { seats: together.seats, margin: together.margin } : null,
      turnout: ratio(
        yours + rival,
        buckets.reduce((t, b) => t + b.registered, 0),
      ),
    },
    buckets,
  };
}

/** What `points` of a constituency's share is worth on 2022's map: the votes yours gains, and the change in the margin. */
export function worthSeat(seat: Seat, key: string, points = 5): { votes: number; margin: number } {
  const base = runSeat(seat).totals;
  const t = runSeat(seat, { [key]: { share: points, turnout: 0 } }).totals;
  return { votes: t.yours - base.yours, margin: t.margin - base.margin };
}

/**
 * The bucket where the two main candidates took less of the register than
 * across the county and lifting that to the county's level adds the most to the
 * margin (which it does only where yours leads); null when there is none.
 */
export function seatTurnoutLever(seat: Seat): {
  key: string;
  name: string;
  turnout: number;
  county: number;
  extra: number;
  net: number;
} | null {
  const base = runSeat(seat);
  const county = base.totals.turnout;
  let best: ReturnType<typeof seatTurnoutLever> = null;
  for (const b of base.buckets) {
    if (b.turnout >= county) continue;
    const t = runSeat(seat, { [b.key]: { share: 0, turnout: (county - b.turnout) * 100 } }).totals;
    const net = t.margin - base.totals.margin;
    if (net > 0 && (!best || net > best.net))
      best = {
        key: b.key,
        name: b.name,
        turnout: b.turnout,
        county,
        extra: t.yours + t.rival - (base.totals.yours + base.totals.rival),
        net,
      };
  }
  return best;
}

/** The constituencies reported separately with the smallest margins either way, ties by name. */
export function closestSeats(seat: Seat, sc: Scenario = {}, n = 4): BucketNow[] {
  return runSeat(seat, sc)
    .buckets.filter((b) => !b.together)
    .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin) || a.name.localeCompare(b.name))
    .slice(0, n);
}
