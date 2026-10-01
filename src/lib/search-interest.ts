// Search interest from Google Trends, read through SerpApi: how much the race's
// candidates and the week's top issues are searched for, 0 to 100 against the
// busiest day of any term in the set. Pure.

import type { Tone } from "@/lib/demo/types";
import { addDays } from "@/lib/diary";
import type { RaceRival, RivalMove } from "@/lib/race-data";

export type Geo = "KE-110" | "KE";
export const PLACE_NAMES: Record<Geo, string> = { "KE-110": "Nairobi", KE: "Kenya" };

/** One term's daily interest; `ref` ties it to a rival's id or an issue's key. */
export type TermPoints = {
  term: string;
  ref: string | null;
  points: { day: string; value: number }[];
};

export type SearchRead = {
  day: string;
  kind: "candidates" | "issues";
  geo: Geo;
  series: TermPoints[];
  /** When it was read. */
  at: string;
};

/** What people type when an issue is on their mind; issues not here aren't searched. */
export const ISSUE_SEARCH: Record<string, string> = {
  water: "water shortage",
  garbage: "garbage",
  floods: "floods",
  drainage: "drainage",
  roads: "roads",
  transport: "matatu",
  hawkers: "hawkers",
  security: "insecurity",
  jobs: "jobs",
  health: "hospital",
  housing: "housing",
  bursaries: "bursary",
  corruption: "corruption",
  land: "land",
  revenue: "county revenue",
  lighting: "street lights",
};

/** The name a candidate is searched by. */
export const searchName = (r: { name: string; searchAs?: string | null }): string =>
  r.searchAs?.trim() || r.name;

type O = Record<string, unknown>;
const obj = (v: unknown): O => (v && typeof v === "object" ? (v as O) : {});

/** Each term's daily points out of SerpApi's Google Trends answer; null when it has none. */
export function parseTrends(
  json: unknown,
  terms: string[],
): { term: string; points: { day: string; value: number }[] }[] | null {
  const timeline = obj(obj(json)["interest_over_time"])["timeline_data"];
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const out = terms.map((term) => ({ term, points: [] as { day: string; value: number }[] }));
  for (const raw of timeline) {
    const e = obj(raw);
    if (e["partial_data"] === true) continue;
    const seconds = Number(e["timestamp"]);
    if (!Number.isFinite(seconds)) continue;
    // Nairobi's day (UTC+3 all year).
    const day = new Date(seconds * 1000 + 3 * 3600_000).toISOString().slice(0, 10);
    const values = Array.isArray(e["values"]) ? e["values"] : [];
    values.forEach((rawValue, i) => {
      const v = obj(rawValue);
      const k = Number.isInteger(v["query_index"]) ? (v["query_index"] as number) : i;
      const n = Number(v["extracted_value"]);
      const t = out[k];
      if (t && Number.isFinite(n)) t.points.push({ day, value: Math.max(0, Math.min(100, n)) });
    });
  }
  return out;
}

/** Too little to show: under a week of days, or mostly zeros for every term. */
export function isThin(series: { points: { value: number }[] }[]): boolean {
  if (!series.length || series.every((s) => s.points.length < 7)) return true;
  return series.every((s) => s.points.filter((p) => p.value === 0).length > s.points.length / 2);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A term's average over the days after `from` up to and including `to`. */
export const averageBetween = (t: TermPoints, from: string, to: string): number =>
  mean(t.points.filter((p) => p.day > from && p.day <= to).map((p) => p.value));

/** Each issue's average interest over the last seven days, for top of mind. */
export function issueAverages(
  read: SearchRead | null,
  today: string,
): { issue: string; average: number }[] {
  if (!read || read.kind !== "issues") return [];
  return read.series.flatMap((t) =>
    t.ref ? [{ issue: t.ref, average: averageBetween(t, addDays(today, -7), today) }] : [],
  );
}

/** A rival searched at least twice as much this week as in the three weeks before. */
export function searchSpike(
  read: SearchRead | null,
  rivals: RaceRival[],
  today: string,
): RivalMove | null {
  if (!read || read.kind !== "candidates") return null;
  let best: { name: string; now: number; before: number; ratio: number } | null = null;
  for (const t of read.series) {
    const r = rivals.find((x) => x.id === t.ref);
    if (!r || r.isUs) continue;
    const now = averageBetween(t, addDays(today, -7), today);
    const before = averageBetween(t, addDays(today, -28), addDays(today, -7));
    if (before <= 0) continue;
    const ratio = now / before;
    if (ratio >= 2 && (!best || ratio > best.ratio)) best = { name: r.name, now, before, ratio };
  }
  if (!best) return null;
  const verb =
    best.ratio < 3 ? "doubled" : best.ratio < 4 ? "tripled" : `rose ${Math.floor(best.ratio)}-fold`;
  return {
    title: `Searches for ${best.name} ${verb} this week`,
    detail: `Google search interest in ${PLACE_NAMES[read.geo]} averaged ${Math.round(best.now)} this week, against ${Math.round(best.before)} over the three weeks before.`,
  };
}

/** "Babu Owino drew the most searches in Nairobi this month, then Johnson Sakaja." */
export function searchSummary(read: SearchRead | null, rivals: RaceRival[]): string {
  if (!read || read.kind !== "candidates") return "";
  const ranked = read.series
    .map((t) => ({
      name: rivals.find((r) => r.id === t.ref)?.name ?? t.term,
      avg: mean(t.points.map((p) => p.value)),
    }))
    .filter((x) => x.avg > 0)
    .sort((a, b) => b.avg - a.avg);
  const place = PLACE_NAMES[read.geo];
  if (!ranked[0]) return "";
  return ranked[1]
    ? `${ranked[0].name} drew the most searches in ${place} this month, then ${ranked[1].name}.`
    : `${ranked[0].name} drew searches in ${place} this month.`;
}

/** Each candidate's average over the read, most searched first, for the table under the chart. */
export function monthAverages(
  read: SearchRead | null,
  rivals: RaceRival[],
): { name: string; average: number }[] {
  if (!read || read.kind !== "candidates") return [];
  return read.series
    .map((t) => ({
      name: rivals.find((r) => r.id === t.ref)?.name ?? t.term,
      average: Math.round(mean(t.points.map((p) => p.value))),
    }))
    .sort((a, b) => b.average - a.average);
}

export type SearchChartModel = {
  days: string[];
  series: { key: string; label: string; tone: Tone; values: (number | null)[] }[];
};

/** A line per candidate, a point per day; null with under two days to draw. */
export function searchChart(read: SearchRead | null, rivals: RaceRival[]): SearchChartModel | null {
  if (!read || read.kind !== "candidates" || !read.series.length) return null;
  const days = [...new Set(read.series.flatMap((t) => t.points.map((p) => p.day)))].sort();
  if (days.length < 2) return null;
  return {
    days,
    series: read.series.map((t) => {
      const r = rivals.find((x) => x.id === t.ref);
      const byDay = new Map(t.points.map((p) => [p.day, p.value]));
      return {
        key: t.ref ?? t.term,
        label: r?.name ?? t.term,
        tone: r?.tone ?? "a",
        values: days.map((d) => byDay.get(d) ?? null),
      };
    }),
  };
}

/** A stored read, read with care: anything malformed is left out. */
export function searchFromRow(r: {
  day: string;
  kind: string;
  geo: string;
  series: unknown;
  created_at: string;
}): SearchRead | null {
  if (r.kind !== "candidates" && r.kind !== "issues") return null;
  if (r.geo !== "KE-110" && r.geo !== "KE") return null;
  const series = (Array.isArray(r.series) ? r.series : []).flatMap((raw): TermPoints[] => {
    const t = obj(raw);
    const term = typeof t["term"] === "string" ? t["term"] : "";
    if (!term) return [];
    const points = (Array.isArray(t["points"]) ? t["points"] : []).flatMap((rawPoint) => {
      const p = obj(rawPoint);
      const day = p["day"];
      const value = Number(p["value"]);
      return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(value)
        ? [{ day, value: Math.max(0, Math.min(100, value)) }]
        : [];
    });
    return [{ term, ref: typeof t["ref"] === "string" ? t["ref"] : null, points }];
  });
  return { day: r.day, kind: r.kind, geo: r.geo, series, at: r.created_at };
}
