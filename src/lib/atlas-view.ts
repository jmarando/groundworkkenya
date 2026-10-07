// What the Elections section shows, from the atlas's rows: an area's count in
// one election, its figures in a race and year, the ranking of its parts, its
// results tables, the blocs to pick a side from, and the map's colours. Pure.

import {
  figureTag,
  margin,
  notRegistered,
  ourShare,
  registerGrowth,
  swing,
  turnout,
  validVotes,
  votesWithinReach,
  whatToDo,
  TODO_NAMES,
  YEARS,
  type AreaCount,
  type Race,
  type Todo,
} from "@/lib/atlas";

export type Level = "country" | "county" | "constituency" | "ward";
export type AtlasArea = { key: string; level: Level; name: string; parent: string | null };
export type AtlasCandidate = {
  id: string;
  election: string;
  seat: string;
  name: string;
  party: string | null;
  bloc: string;
};
export type AtlasResult = { candidate: string; area: string; votes: number; source: string };
export type AtlasTurnout = {
  election: string;
  area: string;
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
  source: string;
};
export type AtlasRegister = { year: number; area: string; registered: number; source: string };
export type AtlasPopulation = {
  area: string;
  year: number;
  total: number;
  adults: number;
  youngAdults: number;
  source: string;
};
export type AtlasSource = {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  note: string | null;
};
export type AtlasNote = { body: string; updatedAt: string };
export type AtlasData = {
  areas: AtlasArea[];
  candidates: AtlasCandidate[];
  results: AtlasResult[];
  turnout: AtlasTurnout[];
  register: AtlasRegister[];
  population: AtlasPopulation[];
  sources: AtlasSource[];
  /** The campaign's own: its home area, its side in each election, its notes by area. */
  homeArea: string | null;
  sides: Record<string, string>;
  notes: Record<string, AtlasNote>;
};

export const electionOf = (race: Race, year: number) => `${year}-${race}`;

export const RACE_NAMES: Record<Race, string> = {
  president: "President",
  governor: "Governor",
  mp: "MP",
};
/** A race inside a sentence: "governor", "president", but "MP". */
export const raceInText = (race: Race) => (race === "mp" ? "MP" : RACE_NAMES[race].toLowerCase());

export const share1 = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
export const whole = (x: number) => `${Math.round(x * 100)}%`;
export const votes = (n: number) => new Intl.NumberFormat("en-KE").format(n);
/** "+5.2 points", "−12 points", "0 points". */
export function signedPoints(x: number): string {
  const p = Math.round(Math.abs(x) * 1000) / 10;
  return `${p === 0 ? "" : x > 0 ? "+" : "−"}${p} points`;
}

/** One area's count in one election, from the rows; null when nothing was found. */
export function countAt(d: AtlasData, election: string, area: string): AreaCount | null {
  const byId = new Map(d.candidates.filter((c) => c.election === election).map((c) => [c.id, c]));
  const rows = d.results.filter((r) => r.area === area && byId.has(r.candidate));
  const t = d.turnout.find((x) => x.election === election && x.area === area);
  if (!rows.length && !t) return null;
  return {
    year: Number(election.slice(0, 4)),
    candidates: rows
      .map((r) => {
        const c = byId.get(r.candidate)!;
        return { name: c.name, party: c.party, bloc: c.bloc, votes: r.votes };
      })
      .sort((a, b) => b.votes - a.votes),
    registered: t?.registered ?? null,
    cast: t?.cast ?? null,
    rejected: t?.rejected ?? null,
    valid: t?.valid ?? null,
  };
}

/** The document behind an area's figures in one election. */
export function sourceAt(d: AtlasData, election: string, area: string): AtlasSource | null {
  const ids = new Set(d.candidates.filter((c) => c.election === election).map((c) => c.id));
  const id =
    d.results.find((r) => r.area === area && ids.has(r.candidate))?.source ??
    d.turnout.find((t) => t.election === election && t.area === area)?.source;
  return d.sources.find((s) => s.id === id) ?? null;
}

export type AreaFigures = {
  key: string;
  name: string;
  level: Level;
  count: AreaCount | null;
  /** The document gave no valid total: shares are of the candidates listed. */
  listedOnly: boolean;
  turnout: number | null;
  ourShare: number | null;
  margin: number | null;
  /** Against `yearBefore`, the latest earlier election with a count here. */
  swing: number | null;
  yearBefore: number | null;
  todo: { todo: Todo; reason: string } | null;
  reach: { turnout: number; persuasion: number; total: number } | null;
  /** The latest register: 2022's, else the election's own. */
  registered: number | null;
  growth: { change: number; rate: number | null } | null;
  population: AtlasPopulation | null;
  /** How many parts' estimates were added up for `population`; null when it is the area's own. */
  populationParts: number | null;
  /** Null where there's no estimate, or where it's below the register. */
  notRegistered: { adults: number; youngShare: number | null } | null;
  estimateBelowRegister: boolean;
  tag: string | null;
};

const latestBefore = (d: AtlasData, race: Race, year: number, key: string): number | null =>
  [...YEARS]
    .reverse()
    .find((y) => y < year && countAt(d, electionOf(race, y), key)?.candidates.length) ?? null;

/**
 * An area's population estimate: its own, else the sum of its parts' when every
 * part has one, from the same year and source. A sum with a part missing stays
 * missing. WorldPop's figures are sums of grid squares, so adding wards is exact.
 */
function populationOf(
  d: AtlasData,
  key: string,
): { estimate: AtlasPopulation; parts: number | null } | null {
  const own = d.population.filter((p) => p.area === key).sort((a, b) => b.year - a.year)[0];
  if (own) return { estimate: own, parts: null };
  const kids = d.areas.filter((a) => a.parent === key);
  const sums = kids.map((k) => populationOf(d, k.key)?.estimate ?? null);
  const first = sums[0];
  if (!first || sums.some((s) => !s || s.year !== first.year || s.source !== first.source))
    return null;
  const add = (pick: (p: AtlasPopulation) => number) =>
    sums.reduce((n, s) => n + pick(s as AtlasPopulation), 0);
  return {
    estimate: {
      area: key,
      year: first.year,
      total: add((p) => p.total),
      adults: add((p) => p.adults),
      youngAdults: add((p) => p.youngAdults),
      source: first.source,
    },
    parts: kids.length,
  };
}

/** One area's figures in a race and year. */
export function figuresFor(d: AtlasData, key: string, race: Race, year: number): AreaFigures {
  const byKey = new Map(d.areas.map((a) => [a.key, a]));
  const area = byKey.get(key);
  const election = electionOf(race, year);
  const count = countAt(d, election, key);
  const side = d.sides[election] ?? null;
  const prev = latestBefore(d, race, year, key);
  const before =
    prev === null
      ? null
      : {
          year: prev,
          count: countAt(d, electionOf(race, prev), key)!,
          side: d.sides[electionOf(race, prev)] ?? null,
        };
  const parent = area?.parent ? byKey.get(area.parent) : undefined;
  const parentCount = parent ? countAt(d, election, parent.key) : null;
  const siblingTurnouts = d.areas
    .filter((a) => a.parent === area?.parent && a.level === area?.level)
    .map((a) => countAt(d, election, a.key))
    .map((c) => (c ? turnout(c) : null))
    .filter((t): t is number => t !== null);
  const reg = (y: number) =>
    d.register.find((r) => r.year === y && r.area === key)?.registered ?? null;
  // Every race on one election day uses the same register, so another race's count gives it.
  const sameDay = (y: number) =>
    d.turnout.find((t) => t.area === key && t.election.startsWith(`${y}-`) && t.registered !== null)
      ?.registered ?? null;
  const registered = reg(2022) ?? sameDay(2022) ?? count?.registered ?? null;
  const people = populationOf(d, key);
  const population = people?.estimate ?? null;
  const below = Boolean(population && registered !== null && registered > population.adults);
  const source = sourceAt(d, election, key);
  const counted = Boolean(count?.candidates.length);
  return {
    key,
    name: area?.name ?? key,
    level: area?.level ?? "ward",
    count,
    listedOnly: Boolean(count && counted && count.valid === null),
    turnout: count ? turnout(count) : null,
    ourShare: count ? ourShare(count, side) : null,
    margin: count ? margin(count, side) : null,
    swing: count && before ? swing(count, side, before.count, before.side) : null,
    yearBefore: prev,
    todo:
      count && counted
        ? whatToDo({
            year,
            count,
            side,
            parentTurnout: parentCount ? turnout(parentCount) : null,
            parentName: parent?.name ?? null,
            before,
          })
        : null,
    reach: count && counted ? votesWithinReach(count, side, siblingTurnouts) : null,
    registered,
    growth: registerGrowth(reg(2022) ?? sameDay(2022), reg(2017) ?? sameDay(2017)),
    population,
    populationParts: people?.parts ?? null,
    notRegistered:
      population && !below
        ? notRegistered(
            { adults: population.adults, young_adults: population.youngAdults },
            registered,
          )
        : null,
    estimateBelowRegister: below,
    tag: source && area ? figureTag(source.publisher, area.level, year) : null,
  };
}

/** An area's parts, most votes within reach first; those without a count last, by name. */
export function rankChildren(d: AtlasData, key: string, race: Race, year: number): AreaFigures[] {
  return d.areas
    .filter((a) => a.parent === key)
    .map((a) => figuresFor(d, a.key, race, year))
    .sort(
      (a, b) => (b.reach?.total ?? -1) - (a.reach?.total ?? -1) || a.name.localeCompare(b.name),
    );
}

export type ResultBlock = {
  race: Race;
  year: number;
  rows: { name: string; party: string | null; bloc: string; votes: number; share: number }[];
  listedOnly: boolean;
  turnout: number | null;
  registered: number | null;
  tag: string | null;
  source: AtlasSource | null;
};

/** Every race and year with candidates counted here, in the races' order, newest first. */
export function resultBlocks(
  d: AtlasData,
  key: string,
  races: Race[] = ["mp", "governor", "president"],
): ResultBlock[] {
  const level = d.areas.find((a) => a.key === key)?.level ?? "ward";
  const out: ResultBlock[] = [];
  for (const race of races)
    for (const year of [...YEARS].reverse()) {
      const election = electionOf(race, year);
      const count = countAt(d, election, key);
      if (!count?.candidates.length) continue;
      const valid = validVotes(count);
      const source = sourceAt(d, election, key);
      out.push({
        race,
        year,
        rows: count.candidates.map((c) => ({ ...c, share: valid ? c.votes / valid : 0 })),
        listedOnly: count.valid === null,
        turnout: turnout(count),
        registered: count.registered,
        tag: source ? figureTag(source.publisher, level, year) : null,
        source,
      });
    }
  return out;
}

/** The blocs in one election, most votes in the atlas first: what a side is picked from. */
export function blocsIn(d: AtlasData, election: string): string[] {
  const bloc = new Map(
    d.candidates.filter((c) => c.election === election).map((c) => [c.id, c.bloc]),
  );
  const total = new Map<string, number>();
  for (const b of bloc.values()) total.set(b, total.get(b) ?? 0);
  for (const r of d.results) {
    const b = bloc.get(r.candidate);
    if (b) total.set(b, (total.get(b) ?? 0) + r.votes);
  }
  return [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([b]) => b);
}

export const TODO_COLOURS: Record<Todo, string> = {
  mobilise: "hsl(32 90% 50%)",
  hold: "hsl(142 55% 36%)",
  persuade: "hsl(205 75% 46%)",
  cut: "hsl(0 70% 50%)",
  "lean-ours": "hsl(142 40% 62%)",
  "lean-theirs": "hsl(0 45% 66%)",
  "no-side": "hsl(0 0% 76%)",
};

type Hsl = [number, number, number];
/** A colour between stops at x (clamped), mixed in HSL. */
function ramp(x: number, stops: [number, Hsl][]): string {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  let c: Hsl = x <= first[0] ? first[1] : last[1];
  for (let i = 1; i < stops.length; i++) {
    const [x0, a] = stops[i - 1]!;
    const [x1, b] = stops[i]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return `hsl(${Math.round(c[0])} ${Math.round(c[1])}% ${Math.round(c[2])}%)`;
}
const RED: Hsl = [0, 70, 52];
const AMBER: Hsl = [40, 90, 52];
const GREEN: Hsl = [142, 60, 38];
const LEAN: [number, Hsl][] = [
  [0.3, RED],
  [0.5, AMBER],
  [0.7, GREEN],
];
const TURNOUT: [number, Hsl][] = [
  [0.3, [210, 30, 86]],
  [0.75, [210, 80, 34]],
];
const SWING: [number, Hsl][] = [
  [-0.15, RED],
  [0, [0, 0, 80]],
  [0.15, GREEN],
];

/** How the map shades an area by the chosen measure; null where there's nothing to show. */
export function shadeOf(
  f: AreaFigures,
  shade: "todo" | "lean" | "turnout" | "swing",
): { colour: string; label: string } | null {
  if (shade === "todo")
    return f.todo ? { colour: TODO_COLOURS[f.todo.todo], label: TODO_NAMES[f.todo.todo] } : null;
  if (shade === "lean")
    return f.ourShare === null
      ? null
      : {
          colour: ramp(f.ourShare, LEAN),
          label: `${share1(f.ourShare)} to us`,
        };
  if (shade === "turnout")
    return f.turnout === null
      ? null
      : {
          colour: ramp(f.turnout, TURNOUT),
          label: `${whole(f.turnout)} turnout`,
        };
  return f.swing === null
    ? null
    : {
        colour: ramp(f.swing, SWING),
        label: signedPoints(f.swing),
      };
}

/** The key under a map shaded by `shade`, in the same colours. */
export function shadeLegend(
  shade: "todo" | "lean" | "turnout" | "swing",
): { label: string; colour: string }[] {
  if (shade === "todo")
    return (["mobilise", "hold", "persuade", "cut", "lean-ours", "lean-theirs"] as Todo[]).map(
      (t) => ({ label: TODO_NAMES[t], colour: TODO_COLOURS[t] }),
    );
  const key = (stops: [number, Hsl][], labels: string[]) =>
    stops.map(([x], i) => ({ label: labels[i]!, colour: ramp(x, stops) }));
  if (shade === "lean") return key(LEAN, ["30% or less to us", "Even", "70% or more to us"]);
  if (shade === "turnout") return key(TURNOUT, ["30% turnout", "75% turnout"]);
  return key(SWING, ["15 points or more away", "No change", "15 points or more our way"]);
}
