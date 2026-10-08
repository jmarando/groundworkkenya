// The atlas across the app: where a campaign's ward or a Voters area sits in
// the atlas, the last count of the campaign's race there, the one-line brief
// on a diary stop, Home's places where votes can move, 2022 turnout beside
// the war room's, and turnout at the stations reported so far. Pure.

import { blocShares, RACES, TODO_NAMES, YEARS, type Race, type Todo } from "@/lib/atlas";
import { slugify } from "@/lib/atlas-files";
import {
  countAt,
  electionOf,
  figuresFor,
  rankChildren,
  share1,
  whole,
  type AreaFigures,
  type AtlasData,
} from "@/lib/atlas-view";

type Areas = Pick<AtlasData, "areas">;

/** A campaign ward's place in the atlas: the ward, else its constituency; null when neither is loaded. */
export function wardKey(d: Areas, constituency: string | null, slug: string | null): string | null {
  const c = constituency ? slugify(constituency) : "";
  if (!c) return null;
  const ward = slug
    ? d.areas.find((a) => a.level === "ward" && a.key.endsWith(`/${c}/${slug}`))
    : undefined;
  return (
    ward?.key ??
    d.areas.find((a) => a.level === "constituency" && a.key.endsWith(`/${c}`))?.key ??
    null
  );
}

export type VotersPlace =
  { level: "county" } | { level: "constituency"; name: string } | { level: "ward"; slug: string };

/** Where a Voters area sits in the atlas; Voters' top level is the campaign's home area. */
export function votersKey(
  d: Areas,
  place: VotersPlace,
  wards: { slug: string; constituency: string }[],
  home: string,
): string | null {
  if (place.level === "county") return home;
  if (place.level === "constituency") return wardKey(d, place.name, null);
  const w = wards.find((x) => x.slug === place.slug);
  return w ? wardKey(d, w.constituency, w.slug) : null;
}

/** The latest year with a count of the race at the area; null when none. */
export function latestYear(d: AtlasData, key: string, race: Race): number | null {
  return (
    [...YEARS].reverse().find((y) => countAt(d, electionOf(race, y), key)?.candidates.length) ??
    null
  );
}

export type LastHere = {
  /** Where the figures are from: the place, or a ward's constituency. */
  at: string;
  year: number;
  f: AreaFigures;
  /** "48.0% to us" with a side set, else the leading bloc's share. */
  share: string;
  todo: Todo | null;
  /** A ward showing its constituency's figures. */
  constituencyFigure: boolean;
};

/** The last count of the campaign's race at a place: its own, or a ward's constituency's. */
export function lastHere(d: AtlasData, key: string, race: Race): LastHere | null {
  const area = d.areas.find((a) => a.key === key);
  if (!area) return null;
  const at = area.level === "ward" && area.parent ? area.parent : key;
  const year = latestYear(d, at, race);
  if (year === null) return null;
  const f = figuresFor(d, at, race, year);
  const top = f.count ? blocShares(f.count)[0] : undefined;
  const sided = f.ourShare !== null && f.todo?.todo !== "no-side";
  return {
    at,
    year,
    f,
    share: sided ? `${share1(f.ourShare!)} to us` : top ? `${top.bloc} ${share1(top.share)}` : "—",
    todo: f.todo?.todo ?? null,
    constituencyFigure: at !== key,
  };
}

/** A diary stop's line: "Persuade: 48.0% to us in 2022, turnout 51% (Westlands)". */
export function briefLine(d: AtlasData, key: string | null, race: Race): string | null {
  const l = key ? lastHere(d, key, race) : null;
  if (!l) return null;
  const head = l.todo && l.todo !== "no-side" ? `${TODO_NAMES[l.todo]}: ` : "";
  const turnout = l.f.turnout === null ? "" : `, turnout ${whole(l.f.turnout)}`;
  const where = l.constituencyFigure
    ? ` (${d.areas.find((a) => a.key === l.at)?.name ?? "its constituency"})`
    : "";
  return `${head}${l.share} in ${l.year}${turnout}${where}`;
}

/**
 * Home's places where votes can move: the home area's parts with the most within reach, a side
 * set. A constituency's wards have no results of their own until station data, so an MP's home
 * is the constituency itself.
 */
export function topMoves(d: AtlasData, home: string, race: Race, n = 3): AreaFigures[] {
  const level = d.areas.find((a) => a.key === home)?.level;
  const places =
    level === "constituency"
      ? [figuresFor(d, home, race, 2022)]
      : rankChildren(d, home, race, 2022);
  return places.filter((f) => f.reach && f.todo && f.todo.todo !== "no-side").slice(0, n);
}

/** 2022 turnout at a place: the campaign's race, else the same day's other races (one register). */
export function turnout2022(
  d: AtlasData,
  key: string | null,
  race: Race,
): { turnout: number; race: Race } | null {
  if (!key) return null;
  for (const r of [race, ...RACES.filter((x) => x !== race)]) {
    const t = figuresFor(d, key, r, 2022).turnout;
    if (t !== null) return { turnout: t, race: r };
  }
  return null;
}

/** Turnout at the stations that have reported: votes cast there over their register; null before any. */
export function reportedTurnout(
  stations: { registered: number; cast: number; reported: boolean }[],
): number | null {
  let registered = 0;
  let cast = 0;
  for (const s of stations)
    if (s.reported && s.registered > 0) {
      registered += s.registered;
      cast += s.cast;
    }
  return registered ? cast / registered : null;
}
