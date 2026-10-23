// An MP's (or MCA's) race as a seat to plan on: the two main candidates' votes in
// the seat, its register, and the register of each ward inside it, read from the
// atlas's rows. Results are declared for the seat as a whole, so nothing here is
// split by ward: a ward only says how many people are registered there, and so
// how many voters a turnout move there adds. Pure. The readings are
// src/lib/mp-path-lines.ts; the screen is the Strategy page's Path to Parliament.

import type { AtlasData } from "@/lib/atlas-view";

export type MpRace = "mp" | "mca";

export type MpCandidate = { name: string; bloc: string; votes: number };

/** A place inside the seat, by its register alone. */
export type MpPart = { key: string; name: string; registered: number };

export type MpSeat = {
  race: MpRace;
  /** The seat's atlas key and name. */
  key: string;
  name: string;
  year: number;
  yours: MpCandidate;
  rival: MpCandidate;
  /** No bloc was given, or none matched: the seat's winner is "yours". */
  defaulted: boolean;
  registered: number;
  /** The wards inside the seat, biggest register first; empty for a ward's own race. */
  parts: MpPart[];
  /** The race before, when the atlas has it: its winner, runner-up and valid votes. */
  before: {
    year: number;
    winner: MpCandidate;
    second: MpCandidate | null;
    valid: number | null;
  } | null;
  /** Where the figures come from, as "publisher: title". */
  source: { result: string; register: string; before: string | null };
};

export type MpSeatResult = { ok: true; seat: MpSeat } | { ok: false; why: string };

const NAMES: Record<MpRace, string> = { mp: "MP", mca: "MCA" };

/**
 * The seat's race in `year` from the atlas, with `bloc` as the campaign's side;
 * without one that matches, the winner is "yours" and `defaulted` says so. Not
 * ok, with a sentence for the screen, when the result or the register isn't on
 * file.
 */
export function mpSeatFromAtlas(
  d: AtlasData,
  race: MpRace,
  key: string,
  bloc: string | null,
  year = 2022,
): MpSeatResult {
  const name = d.areas.find((a) => a.key === key)?.name ?? key;
  const label = (id: string | undefined) => {
    const s = d.sources.find((x) => x.id === id);
    return s ? `${s.publisher}: ${s.title}` : (id ?? "");
  };
  const field = (y: number) =>
    d.candidates
      .filter((c) => c.election === `${y}-${race}` && c.seat === key)
      .flatMap((c) => {
        const r = d.results.find((x) => x.candidate === c.id && x.area === key);
        return r ? [{ c, votes: r.votes, source: r.source }] : [];
      })
      .sort((a, b) => b.votes - a.votes);

  const now = field(year);
  if (now.length < 2)
    return { ok: false, why: `The ${year} ${NAMES[race]} result isn't on file for ${name}.` };
  const register = d.register.find((r) => r.year === year && r.area === key);
  if (!register) return { ok: false, why: `The ${year} register isn't on file for ${name}.` };

  const named = bloc ? now.find((x) => x.c.bloc === bloc) : undefined;
  const mine = named ?? now[0]!;
  const theirs = now.find((x) => x !== mine)!;
  if (mine.votes + theirs.votes > register.registered)
    return { ok: false, why: `The ${year} register is smaller than the votes counted in ${name}.` };

  const parts = d.areas
    .filter((a) => a.parent === key)
    .flatMap((a) => {
      const r = d.register.find((x) => x.year === year && x.area === a.key);
      return r ? [{ key: a.key, name: a.name, registered: r.registered }] : [];
    })
    .sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name));

  const earlier = d.candidates
    .filter((c) => c.seat === key && c.election.endsWith(`-${race}`))
    .map((c) => Number(c.election.slice(0, 4)))
    .filter((y) => y < year)
    .sort((a, b) => b - a)[0];
  const then = earlier ? field(earlier) : [];
  const valid = earlier
    ? (d.turnout.find((t) => t.election === `${earlier}-${race}` && t.area === key)?.valid ?? null)
    : null;
  const cand = (x: (typeof now)[number]): MpCandidate => ({
    name: x.c.name,
    bloc: x.c.bloc,
    votes: x.votes,
  });

  return {
    ok: true,
    seat: {
      race,
      key,
      name,
      year,
      yours: cand(mine),
      rival: cand(theirs),
      defaulted: !named,
      registered: register.registered,
      parts,
      before:
        earlier && then.length
          ? { year: earlier, winner: cand(then[0]!), second: then[1] ? cand(then[1]) : null, valid }
          : null,
      source: {
        result: [...new Set([label(mine.source), label(theirs.source)])].join("; "),
        register: [
          ...new Set([
            register.source,
            ...d.register
              .filter((r) => r.year === year && parts.some((p) => p.key === r.area))
              .map((r) => r.source),
          ]),
        ]
          .map(label)
          .join("; "),
        before: earlier && then.length ? label(then[0]!.source) : null,
      },
    },
  };
}

/** The seat as the other side sees it: their votes are "yours". */
export function flipMpSeat(s: MpSeat): MpSeat {
  return { ...s, yours: s.rival, rival: s.yours, defaulted: false };
}

/**
 * A scenario: `share` moves your side's share of the two main candidates' votes
 * by that many points, seat-wide; `turnout` moves the turnout of a ward (by its
 * key) by that many points of its register, the extra voters splitting as the
 * seat does after the share move.
 */
export type MpScenario = { share: number; turnout: Record<string, number> };

export const NO_MP_MOVE: MpScenario = { share: 0, turnout: {} };

export const isMpBaseline = (sc: MpScenario) =>
  sc.share === 0 && Object.values(sc.turnout).every((t) => t === 0);

export type MpRun = {
  yours: number;
  rival: number;
  margin: number;
  /** Your side's share of the two together, 0 to 1. */
  share: number;
  /** The two together over the register, 0 to 1. */
  turnout: number;
  leads: boolean;
  /** Votes that would have to change sides to turn it: half the margin, and one. */
  toTurn: number;
  /** Each ward's extra voters under the scenario. */
  added: Record<string, number>;
};

export function runMp(seat: MpSeat, sc: MpScenario = NO_MP_MOVE): MpRun {
  const two = seat.yours.votes + seat.rival.votes;
  const share = Math.min(1, Math.max(0, seat.yours.votes / two + sc.share / 100));
  const added: Record<string, number> = {};
  let extra = 0;
  for (const p of seat.parts) {
    const t = sc.turnout[p.key] ?? 0;
    // The seat's turnout is all the figures give a ward, so a ward can't lose more
    // voters than that would give it, or gain more than its register leaves.
    const had = (two * p.registered) / seat.registered;
    const n = Math.max(-had, Math.min(p.registered - had, (p.registered * t) / 100));
    added[p.key] = n;
    extra += n;
  }
  const total = two + extra;
  const yours = total * share;
  const rival = total - yours;
  const margin = yours - rival;
  return {
    yours,
    rival,
    margin,
    share,
    turnout: total / seat.registered,
    leads: margin > 0,
    toTurn: margin > 0 ? Math.floor(Math.round(margin) / 2) + 1 : 0,
    added,
  };
}

/** What one point of share is worth on the margin, on the seat's own votes. */
export const pointWorth = (seat: MpSeat) => ((seat.yours.votes + seat.rival.votes) * 2) / 100;

/** What `points` more turnout in a ward adds: the voters, and the margin at the seat's split. */
export function turnoutWorth(seat: MpSeat, part: MpPart, points: number) {
  const two = seat.yours.votes + seat.rival.votes;
  const voters = (part.registered * points) / 100;
  return { voters, net: voters * ((seat.yours.votes - seat.rival.votes) / two) };
}
