// A county's governor race as a seat to plan on: the two main candidates' votes
// in each constituency, the register, and the county's totals, read from the
// atlas's rows. Pure. The sums are src/lib/seat-path.ts; the screen is the
// Strategy page's Path to City Hall.
// docs/superpowers/plans/2026-10-17-path-to-city-hall.md.

import type { AtlasData } from "@/lib/atlas-view";

export type Contender = { name: string; bloc: string };

/** A constituency, or the constituencies the figures don't separate. */
export type SeatBucket = {
  /** The constituency's atlas key, or `<county>#together`. */
  key: string;
  name: string;
  /** How many constituencies it stands for. */
  seats: number;
  /** True for the seats the figures don't separate: the county's total less the others. */
  together: boolean;
  yours: number;
  rival: number;
  registered: number;
};

export type Seat = {
  county: string;
  countyName: string;
  election: string;
  yours: Contender;
  rival: Contender;
  /** No bloc was given, or none matched: the county's winner is "yours". */
  defaulted: boolean;
  /** Every other candidate, county-wide. */
  others: number;
  /** The biggest of them. */
  topOther: number;
  total: { yours: number; rival: number; valid: number };
  buckets: SeatBucket[];
  /** The presidential candidates of the same two blocs, in the county; null when not on file. */
  president: { yours: number; rival: number } | null;
  /** Where the figures come from, as "publisher: title". */
  source: { constituencies: string; county: string };
};

export type SeatResult = { ok: true; seat: Seat } | { ok: false; why: string };

/** "Embakasi Central, East, North and South"; names that share no first word are joined in full. */
export function togetherName(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  const first = (n: string) => n.split(" ")[0] ?? "";
  const same = names.every((n) => n.includes(" ") && first(n) === first(names[0]!));
  const parts = same ? names.map((n, i) => (i === 0 ? n : n.slice(first(n).length + 1))) : names;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The seat as the other side sees it: their votes are "yours". */
export function flipSeat(s: Seat): Seat {
  return {
    ...s,
    yours: s.rival,
    rival: s.yours,
    defaulted: false,
    total: { ...s.total, yours: s.total.rival, rival: s.total.yours },
    buckets: s.buckets.map((b) => ({ ...b, yours: b.rival, rival: b.yours })),
    president: s.president && { yours: s.president.rival, rival: s.president.yours },
  };
}

/**
 * A county's governor race in `year` by constituency, from the atlas. `bloc` is
 * the campaign's side in that race; without one that matches, the county's
 * winner is "yours" and `defaulted` says so. Not ok, with a sentence for the
 * screen, when the atlas has no such result, has it for the county only, or
 * has figures that cannot be put together.
 */
export function seatFromAtlas(
  d: AtlasData,
  county: string,
  bloc: string | null,
  year = 2022,
): SeatResult {
  const election = `${year}-governor`;
  const countyName = d.areas.find((a) => a.key === county)?.name ?? county;
  const label = (id: string | undefined) => {
    const s = d.sources.find((x) => x.id === id);
    return s ? `${s.publisher}: ${s.title}` : (id ?? "");
  };
  const votesAt = (candidate: string, area: string) =>
    d.results.find((r) => r.candidate === candidate && r.area === area);

  const field = d.candidates
    .filter((c) => c.election === election && c.seat === county)
    .flatMap((c) => {
      const r = votesAt(c.id, county);
      return r ? [{ c, votes: r.votes, source: r.source }] : [];
    })
    .sort((a, b) => b.votes - a.votes);
  if (field.length < 2)
    return { ok: false, why: `The ${year} governor result isn't on file for ${countyName}.` };

  const named = bloc ? field.find((x) => x.c.bloc === bloc) : undefined;
  const mine = named ?? field[0]!;
  const theirs = field.find((x) => x !== mine)!;
  const valid = field.reduce((t, x) => t + x.votes, 0);
  const others = field.filter((x) => x !== mine && x !== theirs);

  const registered = (area: string): number | null => {
    const own = d.register.find((r) => r.year === year && r.area === area);
    if (own) return own.registered;
    const kids = d.areas.filter((a) => a.parent === area);
    const rows = kids.flatMap((k) => d.register.filter((r) => r.year === year && r.area === k.key));
    return rows.length ? rows.reduce((t, r) => t + r.registered, 0) : null;
  };

  const seats = d.areas.filter((a) => a.level === "constituency" && a.parent === county);
  const reported = seats.flatMap((a) => {
    const y = votesAt(mine.c.id, a.key);
    const r = votesAt(theirs.c.id, a.key);
    return y && r ? [{ a, y, r }] : [];
  });
  if (!reported.length)
    return {
      ok: false,
      why: `${countyName}'s ${year} governor result is on file for the county as a whole, not by constituency.`,
    };
  const regs = new Map(seats.map((a) => [a.key, registered(a.key)]));
  if (seats.some((a) => regs.get(a.key) === null))
    return {
      ok: false,
      why: `The ${year} register by constituency isn't on file for ${countyName}.`,
    };

  const buckets: SeatBucket[] = reported.map(({ a, y, r }) => ({
    key: a.key,
    name: a.name,
    seats: 1,
    together: false,
    yours: y.votes,
    rival: r.votes,
    registered: regs.get(a.key)!,
  }));
  const left = seats.filter((a) => !reported.some((x) => x.a === a));
  if (left.length) {
    const yours = mine.votes - buckets.reduce((t, b) => t + b.yours, 0);
    const rival = theirs.votes - buckets.reduce((t, b) => t + b.rival, 0);
    if (yours < 0 || rival < 0)
      return { ok: false, why: "The constituency figures add up to more than the county's total." };
    buckets.push({
      key: `${county}#together`,
      name: togetherName(left.map((a) => a.name)),
      seats: left.length,
      together: true,
      yours,
      rival,
      registered: left.reduce((t, a) => t + regs.get(a.key)!, 0),
    });
  }

  const ticket = (b: string) => {
    for (const c of d.candidates) {
      if (c.election !== `${year}-president` || c.bloc !== b) continue;
      const r = votesAt(c.id, county);
      if (r) return r.votes;
    }
    return null;
  };
  const py = ticket(mine.c.bloc);
  const pr = ticket(theirs.c.bloc);

  return {
    ok: true,
    seat: {
      county,
      countyName,
      election,
      yours: { name: mine.c.name, bloc: mine.c.bloc },
      rival: { name: theirs.c.name, bloc: theirs.c.bloc },
      defaulted: !named,
      others: others.reduce((t, x) => t + x.votes, 0),
      topOther: others.length ? Math.max(...others.map((x) => x.votes)) : 0,
      total: { yours: mine.votes, rival: theirs.votes, valid },
      buckets,
      president: py !== null && pr !== null ? { yours: py, rival: pr } : null,
      source: {
        constituencies: [...new Set(reported.map((x) => label(x.y.source)))].join("; "),
        county: label(mine.source),
      },
    },
  };
}
