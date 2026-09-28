// The Overview's arithmetic: the campaign's targets shared out by area, the
// pace to polling day, polling-day readiness, money runway and the one-line
// verdict. Pure, so it is tested without a browser.
//
// Only the campaign totals are hand-written (scenario.ops). Every per-area
// figure is derived from the scenario's areas with the seeded generator, so
// 47 counties and 85 wards need no hand-written rows, and the areas always
// add up to the totals exactly.

import { ours } from "@/lib/demo";
import {
  countAtLeast,
  daysBetween,
  ELECTION_DAY,
  expectedVotes,
  hashOf,
  seeded,
  weightedShares,
} from "@/lib/demo/insights";
import type { OpsConfig, Scenario } from "@/lib/demo/types";

/** Voters per polling stream, for counting streams (IEBC caps a stream at 700). */
const VOTERS_PER_STREAM = 600;

/** Fictional coordinators, one per area, chosen by the area's hash. */
const COORDINATORS = [
  "Achieng",
  "Wanjiru",
  "Kiprono",
  "Mwende",
  "Otieno",
  "Nasimiyu",
  "Kamau",
  "Chebet",
  "Mutua",
  "Akinyi",
  "Njoroge",
  "Wairimu",
  "Barasa",
  "Nekesa",
  "Omondi",
  "Jeptoo",
  "Halima",
  "Lokwang",
  "Nyaboke",
  "Kariuki",
];

/** Surname initials common in Kenya, for the coordinators' names. */
const INITIALS = "ABCGJKLMNOPRSTW";

export type OpsArea = {
  slug: string;
  name: string;
  group: string;
  registered: number;
  /** Supporters we need from this area. */
  target: number;
  /** Supporters found so far. */
  found: number;
  /** Found in the last seven days. */
  lastWeek: number;
  /** Doors knocked in the last seven days. */
  doors: number;
  coordinator: string;
  /** Polling streams, and the agents recruited, trained and confirmed for them. */
  streams: number;
  recruited: number;
  trained: number;
  confirmed: number;
};

export type Week = { week: string; found: number; total: number };

export type Pace = {
  target: number;
  found: number;
  weeksLeft: number;
  /** Average of the last four weeks' finds. */
  recentRate: number;
  /** Finds per week needed to reach the target on polling day. */
  needed: number;
  /** Where the recent rate gets us by polling day. */
  projected: number;
  /** Target minus projection; 0 when on pace. */
  shortfall: number;
  onPace: boolean;
};

export type Verdict = { headline: string; detail: string };

const nf = new Intl.NumberFormat("en-KE");
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Share a whole number out by weights, in whole numbers that add up to it
 * exactly: floors first, then the largest remainders get the rest.
 */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  const left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; k < left; k++) out[order[k % order.length]!.i]! += 1;
  return out;
}

/** The supporter target and count: the president's list, else the win number. */
export function listTotals(s: Scenario): { target: number; found: number } {
  return s.ops.list ?? s.winNumber ?? { target: 0, found: 0 };
}

/** Random draws for one area that do not depend on the order of the areas. */
function draws(s: Scenario, slug: string, n: number): number[] {
  const next = seeded((s.ops.seed ^ hashOf(slug)) >>> 0);
  return Array.from({ length: n }, () => next());
}

/** Every area's share of the campaign's machine. */
export function opsAreas(s: Scenario): OpsArea[] {
  const us = ours(s).key;
  const { target, found } = listTotals(s);
  const r = s.areas.map((a) => draws(s, a.slug, 6));

  // The votes we need from each area follow the votes we expect it to give us.
  const targets = apportion(
    target,
    s.areas.map((a) => expectedVotes(a) * Math.max(a.shares[us] ?? 0, 5)),
  );
  const ratio = target ? found / target : 0;
  const finds = apportion(
    found,
    s.areas.map((_, i) => targets[i]! * ratio * (0.72 + 0.56 * r[i]![0]!)),
  );
  const lastWeek = apportion(
    s.ops.foundLastWeek,
    s.areas.map((_, i) => targets[i]! * (0.55 + 0.9 * r[i]![1]!)),
  );
  const doors = apportion(
    s.ops.doors.lastWeek,
    s.areas.map((a, i) => a.registered * (0.5 + r[i]![2]!)),
  );

  const { agents } = s.ops;
  return s.areas.map((a, i) => {
    const d = r[i]!;
    const streams = Math.ceil(a.registered / VOTERS_PER_STREAM);
    const recruited = Math.round(streams * clamp(agents.recruited * (0.75 + 0.5 * d[3]!), 0, 1));
    const trained = Math.round(recruited * clamp(agents.trained * (0.8 + 0.4 * d[4]!), 0, 1));
    const confirmed = Math.round(trained * clamp(agents.confirmed * (0.8 + 0.4 * d[5]!), 0, 1));
    const h = hashOf(a.slug);
    return {
      slug: a.slug,
      name: a.name,
      group: a.group,
      registered: a.registered,
      target: targets[i]!,
      found: finds[i]!,
      lastWeek: lastWeek[i]!,
      doors: doors[i]!,
      coordinator: `${COORDINATORS[h % COORDINATORS.length]} ${INITIALS[(h >>> 8) % INITIALS.length]}.`,
      streams,
      recruited,
      trained,
      confirmed,
    };
  });
}

function weekLabel(today: string, weeksAgo: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7 * weeksAgo);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Twelve weeks of finds, oldest first, ending with last week's and today's
 * total. Earlier weeks are slower: campaigns ramp up.
 */
export function weeklyHistory(s: Scenario, today: string): Week[] {
  const { found } = listTotals(s);
  const next = seeded((s.ops.seed ^ 0x5eed) >>> 0);
  const finds = Array.from({ length: 12 }, (_, k) =>
    k === 11
      ? s.ops.foundLastWeek
      : Math.round(s.ops.foundLastWeek * (0.62 + (0.38 * k) / 11) * (0.9 + 0.2 * next())),
  );
  const totals: number[] = Array.from({ length: 12 }, () => 0);
  totals[11] = found;
  for (let k = 10; k >= 0; k--) totals[k] = Math.max(0, totals[k + 1]! - finds[k + 1]!);
  return finds.map((f, k) => ({ week: weekLabel(today, 11 - k), found: f, total: totals[k]! }));
}

/** Where the campaign's supporter count is heading, and what it needs. */
export function pace(s: Scenario, today: string): Pace {
  const { target, found } = listTotals(s);
  const weeksLeft = Math.max(0, daysBetween(today, ELECTION_DAY)) / 7;
  const recentRate =
    weeklyHistory(s, today)
      .slice(-4)
      .reduce((a, w) => a + w.found, 0) / 4;
  const remaining = Math.max(0, target - found);
  const needed = weeksLeft > 0 ? remaining / weeksLeft : remaining;
  const projected = found + recentRate * weeksLeft;
  const shortfall = Math.max(0, target - projected);
  return {
    target,
    found,
    weeksLeft,
    recentRate,
    needed,
    projected,
    shortfall,
    onPace: shortfall === 0,
  };
}

/** An area is on pace when last week's rate, kept up, reaches its target. */
export function areaOnPace(a: OpsArea, weeksLeft: number): boolean {
  return a.found + a.lastWeek * weeksLeft >= a.target;
}

/** How far short of its target an area ends up at last week's rate. */
export function areaShortfall(a: OpsArea, weeksLeft: number): number {
  return Math.max(0, a.target - a.found - a.lastWeek * weeksLeft);
}

/** Streams, and agents recruited, trained and confirmed for them. */
export function readiness(areas: OpsArea[]): {
  streams: number;
  recruited: number;
  trained: number;
  confirmed: number;
} {
  return areas.reduce(
    (t, a) => ({
      streams: t.streams + a.streams,
      recruited: t.recruited + a.recruited,
      trained: t.trained + a.trained,
      confirmed: t.confirmed + a.confirmed,
    }),
    { streams: 0, recruited: 0, trained: 0, confirmed: 0 },
  );
}

/** Weeks the cash lasts at this burn. */
export function runway(money: OpsConfig["money"]): number {
  return money.burnPerWeek > 0 ? money.cash / money.burnPerWeek : Infinity;
}

/** Round for reading: tens, hundreds or thousands, by size. */
export function roundNice(n: number): number {
  const step = n >= 1_000_000 ? 1000 : n >= 100_000 ? 100 : 10;
  return Math.round(n / step) * step;
}

/** The one line the campaign manager reads first. */
export function verdict(s: Scenario, today: string): Verdict {
  const p = pace(s, today);
  const areas = opsAreas(s);
  const behind = areas.filter((a) => !areaOnPace(a, p.weeksLeft));
  const worst = [...areas].sort(
    (a, b) => areaShortfall(b, p.weeksLeft) - areaShortfall(a, p.weeksLeft),
  )[0];
  const perWeek = `${nf.format(roundNice(p.recentRate))} a week`;
  const rate = p.onPace
    ? `At the last four weeks' rate of ${perWeek} you pass ${nf.format(p.target)} before polling day.`
    : `At the last four weeks' rate of ${perWeek} you reach ${nf.format(roundNice(p.projected))} by polling day, ${nf.format(roundNice(p.shortfall))} short: it takes ${nf.format(Math.ceil(p.needed))} a week.`;

  if (s.office === "president") {
    const us = ours(s).key;
    const share =
      weightedShares(
        s.areas,
        s.contenders.map((c) => c.key),
      )[us] ?? 0;
    const counties = countAtLeast(s.areas, us, 25);
    const byRegion = new Map<string, number>();
    for (const a of areas) {
      byRegion.set(a.group, (byRegion.get(a.group) ?? 0) + areaShortfall(a, p.weeksLeft));
    }
    const region = [...byRegion.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      headline:
        share >= 50
          ? `Over 50%+1, at ${share.toFixed(1)}%.`
          : `Short of 50%+1 by ${(50 - share).toFixed(1)} points.`,
      detail:
        `${share.toFixed(1)}% modelled nationally, with 25% or more in ${counties} counties (24 needed). ` +
        `Supporter list at ${nf.format(p.found)} of ${nf.format(p.target)}. ${rate}` +
        (region && region[1] > 0 ? ` ${region[0]} is the biggest gap.` : ""),
    };
  }

  if (p.onPace) {
    return {
      headline: `On pace: ${nf.format(p.found)} of ${nf.format(p.target)} found.`,
      detail:
        `${rate} But ${behind.length} of ${areas.length} ${s.geo.units} are behind their own targets` +
        (worst && behind.length ? `; ${worst.name} is furthest behind.` : "."),
    };
  }
  return {
    headline: `Behind pace by ${nf.format(roundNice(p.shortfall))} supporters.`,
    detail:
      `${nf.format(p.found)} of ${nf.format(p.target)} supporters found. ${rate}` +
      (worst ? ` ${worst.name} is the biggest gap.` : ""),
  };
}
