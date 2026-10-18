// The Outlook 2027 engine: start from a county's 2022 governor race, constituency
// by constituency, name the candidates in the 2027 field, and say where each
// group of 2022 voters goes. Pure. The seat is read from the atlas by
// src/lib/seat.ts; the new registrations are placed by src/lib/outlook-youth.ts;
// the readings are src/lib/outlook-lines.ts.
// docs/superpowers/plans/2026-10-18-outlook-2027.md.
//
// A group is the 2022 voters of one of the two main candidates (`yours`,
// `rival`) in a place, the people on the 2022 register who cast no valid vote
// (`idle`), or the people newly on the register (`new`). A `Take` says how many
// of a group vote in 2027 (`back`, in points of 100) and, of those who
// vote, how many vote for each of up to four candidates (`goes`, in points of
// 100); the rest vote for someone outside the field. The other 2022 candidates'
// votes, which the atlas holds for the county only, stay with "everyone else".
// Nothing here is about any person or community: a group is a place's voters of a
// 2022 candidate. Every share and turnout in an `Outcome` is a fraction.

import type { Seat } from "@/lib/seat";

/** Candidates in the field, at most. */
export const SLOTS = 4;
export type PoolId = "yours" | "rival" | "idle" | "new";
export const POOLS: readonly PoolId[] = ["yours", "rival", "idle", "new"];
/** What a candidate is called until the team names them. */
export const DEFAULT_NAMES = ["Your candidate", "Main rival", "Second rival", "Third rival"];
/** Plans that differ by less than this are the same plan. */
const EPS = 1e-9;

/** `back`: points of the group who vote; `goes[i]`: points of those who vote for candidate i. */
export type Take = { back: number; goes: number[] };
/** The field (2 to 4 names; the first is the campaign's) and a take for each group. */
export type Plan = { names: string[]; takes: Record<PoolId, Take> };

/** Adults and young adults (18 to 34) in a place, from the atlas's population estimates, and who is not on the register. */
export type Youth = {
  buckets: Record<
    string,
    { adults: number; young: number; registered: number; unregistered: number }
  >;
  total: { adults: number; young: number; registered: number; unregistered: number };
  year: number;
  source: string;
};

export type Outlook = {
  seat: Seat;
  youth: Youth | null;
  /** The county's new registrations and where the figure comes from; null when not on file. */
  registration: { count: number; period: string; source: string } | null;
  /** New registrations placed in each bucket; null when not on file or not placeable. */
  fresh: Record<string, number> | null;
};

export type BucketOutcome = {
  key: string;
  name: string;
  seats: number;
  together: boolean;
  /** 2022's register here. */
  registered: number;
  /** New registrations placed here. */
  fresh: number;
  /** The registered who cast no valid vote in 2022, here. */
  idle: number;
  votes: number[];
  /** The slot, other than the first, with the most votes here; the lowest slot on a tie. */
  rival: number;
  /** The first candidate's votes less the best of the others'. */
  margin: number;
  /** The candidate with more votes than any other, to the whole vote; null when level. */
  leader: number | null;
};

export type Outcome = {
  names: string[];
  votes: number[];
  /** Valid votes for candidates outside the field, the other 2022 candidates' included. */
  everyone: number;
  valid: number;
  shares: number[];
  /** The slot, other than the first, with the most votes; the lowest slot on a tie. */
  rival: number;
  /** The first candidate's votes less the rival's. */
  margin: number;
  /** More votes than the rival and than everyone else, to the whole vote. */
  leads: boolean;
  /** The candidate with more votes than any other, to the whole vote; null when level. */
  top: number | null;
  /** Votes that would have to change sides to change who leads: half the margin, and one. */
  toTurn: number;
  /** County votes for each candidate that come from each group. */
  from: Record<PoolId, number[]>;
  /** 2022's register with the new registrations added. */
  registered: number;
  /** Valid votes over that register. */
  turnout: number;
  buckets: BucketOutcome[];
};

// -------------------------------------------------------------------- small things

/** `x` held between `lo` and `hi`; not a number is `lo`. */
const clamp = (x: number, lo: number, hi: number) =>
  Number.isNaN(x) ? lo : Math.min(hi, Math.max(lo, x));
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const zeros = (n: number) => Array.from({ length: n }, () => 0);

/** The names of a field of 2 to 4, with a default for any missing. */
function field(names: string[]): string[] {
  const n = clamp(names.length, 2, SLOTS);
  return Array.from({ length: n }, (_, i) => names[i] ?? DEFAULT_NAMES[i]!);
}

/** The slot with more votes than any other, to the whole vote; null when the top is level. */
function unique(votes: number[]): number | null {
  let best = 0;
  for (let i = 1; i < votes.length; i++) if (votes[i]! > votes[best]!) best = i;
  const second = Math.max(...votes.filter((_, i) => i !== best));
  return Math.round(votes[best]! - second) > 0 ? best : null;
}

/** A take as fractions: held to 0 to 100, nothing for a candidate outside the field, scaled down if it asks for more than 100. */
function shape(take: Take, n: number): { back: number; goes: number[]; rest: number } {
  let goes = Array.from({ length: SLOTS }, (_, i) =>
    i < n ? clamp(take.goes[i] ?? 0, 0, 100) : 0,
  );
  const total = sum(goes);
  if (total > 100) goes = goes.map((g) => (g * 100) / total);
  return {
    back: clamp(take.back, 0, 100) / 100,
    goes: goes.map((g) => g / 100),
    rest: Math.max(0, 1 - sum(goes) / 100),
  };
}

/** The 2022 county's shares of the valid votes for the first two slots: how new voters split if nothing says otherwise. */
function neutral(seat: Seat): number[] {
  const v = seat.total.valid;
  return v > 0 ? [(100 * seat.total.yours) / v, (100 * seat.total.rival) / v, 0, 0] : zeros(SLOTS);
}

/** 2022's register in the seat. */
const register = (seat: Seat) => sum(seat.buckets.map((b) => b.registered));

/**
 * The people on the 2022 register who cast no valid vote, in each place: its
 * register less the two main candidates' votes and its share of the other
 * candidates' (the atlas holds those for the county only, so they are scaled by
 * the two main candidates' votes), never below nothing. Together they are the
 * register less the valid votes.
 */
export function idleOf(seat: Seat): Record<string, number> {
  const two = sum(seat.buckets.map((b) => b.yours + b.rival));
  return Object.fromEntries(
    seat.buckets.map((b) => {
      const others = two > 0 ? (seat.others * (b.yours + b.rival)) / two : 0;
      return [b.key, Math.max(0, b.registered - b.yours - b.rival - others)];
    }),
  );
}

// -------------------------------------------------------------------- the plan

/** 2022 again: each group votes again for its own candidate; new registrations do not vote (and, if they did, would split as the county did). */
export function baselinePlan(seat: Seat, names: string[] = []): Plan {
  const n = clamp(names.length, 2, SLOTS);
  return {
    names: Array.from({ length: n }, (_, i) => names[i]?.trim() || DEFAULT_NAMES[i]!),
    takes: {
      yours: { back: 100, goes: [100, 0, 0, 0] },
      rival: { back: 100, goes: [0, 100, 0, 0] },
      idle: { back: 0, goes: neutral(seat) },
      new: { back: 0, goes: neutral(seat) },
    },
  };
}

/** Is `plan` 2022 again? Names do not count; a candidate added does. */
export function isBaseline(plan: Plan, seat: Seat): boolean {
  if (plan.names.length !== 2) return false;
  const base = baselinePlan(seat).takes;
  return POOLS.every((p) => {
    const t = plan.takes[p];
    return (
      Math.abs(t.back - base[p].back) < EPS &&
      t.goes.length === SLOTS &&
      base[p].goes.every((g, i) => Math.abs(t.goes[i]! - g) < EPS)
    );
  });
}

/** Problems that would make the plan meaningless, one sentence each; none for a plan the sliders made. */
export function validatePlan(plan: Plan): string[] {
  const n = plan.names.length;
  if (n < 2 || n > SLOTS) return ["The field needs 2 to 4 candidates"];
  const problems: string[] = [];
  plan.names.forEach((name, i) => {
    if (!name.trim()) problems.push(`Candidate ${i + 1} has no name`);
  });
  for (const p of POOLS) {
    const t = plan.takes[p];
    if (!(t.back >= 0 && t.back <= 100)) problems.push(`${p}: back is not between 0 and 100`);
    if (t.goes.length !== SLOTS) {
      problems.push(`${p}: needs ${SLOTS} shares`);
      continue;
    }
    t.goes.forEach((g, i) => {
      if (!(g >= 0 && g <= 100))
        problems.push(`${p}: the share for candidate ${i + 1} is not between 0 and 100`);
    });
    if (sum(t.goes) > 100 + EPS) problems.push(`${p}: the shares add to more than 100`);
    t.goes.forEach((g, i) => {
      if (i >= n && g > 0)
        problems.push(`${p}: votes go to candidate ${i + 1}, who is not in the field`);
    });
  }
  return problems;
}

// -------------------------------------------------------------------- the sliders

/**
 * `goes` with `slot` set to `value` (held to 0 to 100). If the row then adds past
 * 100, what "everyone else" holds gives way first and then the other candidates
 * in proportion to what they hold. Lowering leaves the rest to "everyone else".
 * A slot that is not there changes nothing. Never changes `goes`.
 */
export function fitSplit(goes: number[], slot: number, value: number): number[] {
  if (!Number.isInteger(slot) || slot < 0 || slot >= goes.length) return [...goes];
  const v = clamp(value, 0, 100);
  const others = goes.map((g, i) => (i === slot ? 0 : clamp(g, 0, 100)));
  const held = sum(others);
  const room = 100 - v;
  const scale = held > room ? room / held : 1;
  return goes.map((_, i) => (i === slot ? v : others[i]! * scale));
}

/**
 * `fitSplit` for a group that starts with a candidate of its own (`home`): the
 * votes a slot gains come from that candidate first, and go back to it when the
 * slot is lowered. The home slot itself, and a home that is not a slot, follow
 * the plain rule. Never changes `goes`.
 */
export function shiftSplit(goes: number[], home: number, slot: number, value: number): number[] {
  const there = (i: number) => Number.isInteger(i) && i >= 0 && i < goes.length;
  if (!there(slot) || !there(home) || slot === home) return fitSplit(goes, slot, value);
  const v = clamp(value, 0, 100);
  const out = goes.map((g) => clamp(g, 0, 100));
  const cur = out[slot]!;
  if (v <= cur) {
    out[slot] = v;
    out[home] = out[home]! + (cur - v);
    return out;
  }
  const take = Math.min(out[home]!, v - cur);
  out[home] = out[home]! - take;
  return fitSplit(out, slot, v);
}

const homeOf = (pool: PoolId) => (pool === "yours" ? 0 : pool === "rival" ? 1 : -1);

/** `plan` with candidate `slot`'s share of a group set (see `shiftSplit`); a slot outside the field changes nothing. */
export function withGoes(plan: Plan, pool: PoolId, slot: number, value: number): Plan {
  if (!Number.isInteger(slot) || slot < 0 || slot >= plan.names.length) return plan;
  const goes = shiftSplit(plan.takes[pool].goes, homeOf(pool), slot, value);
  return { ...plan, takes: { ...plan.takes, [pool]: { ...plan.takes[pool], goes } } };
}

/** `plan` with the points of a group who vote set (held to 0 to 100). */
export function withBack(plan: Plan, pool: PoolId, value: number): Plan {
  const take = { ...plan.takes[pool], back: clamp(value, 0, 100) };
  return { ...plan, takes: { ...plan.takes, [pool]: take } };
}

/** A candidate added to the field, up to four; a blank name is the next default. */
export function addCandidate(plan: Plan, name = ""): Plan {
  if (plan.names.length >= SLOTS) return plan;
  return { ...plan, names: [...plan.names, name.trim() || DEFAULT_NAMES[plan.names.length]!] };
}

/** The third or fourth candidate removed, the later one moving up; the first two cannot go. */
export function dropCandidate(plan: Plan, slot: number): Plan {
  if (!Number.isInteger(slot) || slot < 2 || slot >= plan.names.length) return plan;
  const takes = Object.fromEntries(
    POOLS.map((p) => [
      p,
      {
        ...plan.takes[p],
        goes: [...plan.takes[p].goes.slice(0, slot), ...plan.takes[p].goes.slice(slot + 1), 0],
      },
    ]),
  ) as Record<PoolId, Take>;
  return { ...plan, names: plan.names.filter((_, i) => i !== slot), takes };
}

/**
 * One side's voters shared equally between its candidate and a candidate added
 * to the field (the third, or the existing third if the field has one).
 */
export function splitPool(plan: Plan, pool: "yours" | "rival"): Plan {
  const grown = plan.names.length >= 3 ? plan : addCandidate(plan);
  const goes = zeros(SLOTS);
  goes[homeOf(pool)] = 50;
  goes[2] = 50;
  return { ...grown, takes: { ...grown.takes, [pool]: { ...grown.takes[pool], goes } } };
}

/** New registrations voting as the 2022 register did: the share of it that cast a valid vote, split as the county's valid votes were. */
export function likeBefore(plan: Plan, seat: Seat): Plan {
  const reg = register(seat);
  const back = reg > 0 ? (100 * seat.total.valid) / reg : 0;
  return { ...plan, takes: { ...plan.takes, new: { back, goes: neutral(seat) } } };
}

// -------------------------------------------------------------------- placing a total

/**
 * A whole number `total` shared out in proportion to `weights`, by largest
 * remainders (a tie by key), adding up to `total` exactly. A weight that is
 * negative or not a number counts as nothing. Null when `total` is not a whole
 * number of at least nothing, or every weight is nothing.
 */
export function allocate(
  total: number,
  weights: Record<string, number>,
): Record<string, number> | null {
  const keys = Object.keys(weights);
  const w = keys.map((k) => (Number.isFinite(weights[k]!) && weights[k]! > 0 ? weights[k]! : 0));
  const all = sum(w);
  if (!Number.isInteger(total) || total < 0 || !(all > 0)) return null;
  const exact = w.map((x) => (total * x) / all);
  const out = exact.map(Math.floor);
  let left = total - sum(out);
  const order = keys
    .map((k, i) => i)
    .sort(
      (a, b) =>
        exact[b]! - Math.floor(exact[b]!) - (exact[a]! - Math.floor(exact[a]!)) ||
        (keys[a]! < keys[b]! ? -1 : 1),
    );
  for (const i of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return Object.fromEntries(keys.map((k, i) => [k, out[i]!]));
}

// -------------------------------------------------------------------- the sum

/** Each candidate's votes in the county and in each constituency under `plan`. */
export function simulate(o: Outlook, plan: Plan): Outcome {
  const names = field(plan.names);
  const n = names.length;
  const shapes = Object.fromEntries(POOLS.map((p) => [p, shape(plan.takes[p], n)])) as Record<
    PoolId,
    ReturnType<typeof shape>
  >;
  const votes = zeros(n);
  const from: Record<PoolId, number[]> = {
    yours: zeros(n),
    rival: zeros(n),
    idle: zeros(n),
    new: zeros(n),
  };
  const idle = idleOf(o.seat);
  let everyone = o.seat.others;
  let fresh = 0;

  const buckets = o.seat.buckets.map((b): BucketOutcome => {
    const placed = o.fresh?.[b.key] ?? 0;
    const here = Number.isFinite(placed) ? Math.max(0, placed) : 0;
    fresh += here;
    const size: Record<PoolId, number> = {
      yours: b.yours,
      rival: b.rival,
      idle: idle[b.key] ?? 0,
      new: here,
    };
    const bv = zeros(n);
    for (const p of POOLS) {
      const s = shapes[p];
      const voting = size[p] * s.back;
      for (let c = 0; c < n; c++) {
        const v = voting * s.goes[c]!;
        bv[c]! += v;
        votes[c]! += v;
        from[p][c]! += v;
      }
      everyone += voting * s.rest;
    }
    let near = 1;
    for (let c = 2; c < n; c++) if (bv[c]! > bv[near]!) near = c;
    const best = bv[near]!;
    return {
      key: b.key,
      name: b.name,
      seats: b.seats,
      together: b.together,
      registered: b.registered,
      fresh: here,
      idle: size.idle,
      votes: bv,
      rival: near,
      margin: bv[0]! - best,
      leader: unique(bv),
    };
  });

  const valid = sum(votes) + everyone;
  let rival = 1;
  for (let c = 2; c < n; c++) if (votes[c]! > votes[rival]!) rival = c;
  const margin = votes[0]! - votes[rival]!;
  const registered = register(o.seat) + fresh;
  return {
    names,
    votes,
    everyone,
    valid,
    shares: votes.map((v) => (valid > 0 ? v / valid : 0)),
    rival,
    margin,
    leads: Math.round(margin) > 0 && Math.round(votes[0]! - everyone) > 0,
    top: unique(votes),
    toTurn: Math.floor(Math.abs(margin) / 2) + 1,
    from,
    registered,
    turnout: registered > 0 ? valid / registered : 0,
    buckets,
  };
}
