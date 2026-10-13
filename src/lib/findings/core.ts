// The findings engine's shared parts: what a finding is, the rules in the
// order the screens show them, the thresholds, how findings are ordered and
// filtered by place, and the check that every number in a line is one of its
// figures. Pure. See docs/superpowers/specs/2026-10-13-findings-engine-design.md.

import type { Race } from "@/lib/atlas";
import type { AtlasData } from "@/lib/atlas-view";
import type { DiaryEntry } from "@/lib/diary";
import { validateElectionsSearch } from "@/lib/elections-view";
import type { WardDoors } from "@/lib/houses";
import type { RacePoll, RaceRival } from "@/lib/race-data";
import type { Area } from "@/lib/voters-view";

/** Who reads findings: the whole team but field agents. */
export const FINDINGS_READERS: readonly string[] = ["super", "candidate", "manager", "organiser"];

export type Decision = "time" | "message" | "field" | "rivals";
export const DECISIONS: Decision[] = ["time", "message", "field", "rivals"];
export const DECISION_NAMES: Record<Decision, string> = {
  time: "Candidate's time",
  message: "What to say where",
  field: "Field work and money",
  rivals: "Rivals and polls",
};

/** Every rule, in the order the screens show them. */
export const RULES = [
  { id: "not-visited", decision: "time" },
  { id: "time-in-safe-seats", decision: "time" },
  { id: "ward-top-issue", decision: "message" },
  { id: "issue-rising", decision: "message" },
  { id: "one-seat-different-places", decision: "message" },
  { id: "votes-within-reach", decision: "field" },
  { id: "doors-behind", decision: "field" },
  { id: "short-of-target", decision: "field" },
  { id: "unregistered-adults", decision: "field" },
  { id: "spend-out-of-line", decision: "field" },
  { id: "poll-move", decision: "rivals" },
  { id: "rival-in-news", decision: "rivals" },
] as const satisfies readonly { id: string; decision: Decision }[];
export type RuleId = (typeof RULES)[number]["id"];

/** Every threshold the rules use, in one place. Shares are 0 to 1. */
export const LIMITS = {
  /** Not visited: the diary looked at, back and ahead, in days. */
  daysBack: 60,
  daysAhead: 14,
  /** Time in safe seats: stops in the last 30 days and the next 14. */
  safeDaysBack: 30,
  safeMinStops: 6,
  safeStopShare: 0.5,
  safeReachShare: 0.25,
  /** Top issue in a ward: issues raised in 30 days, and the top issue's share. */
  wardIssuesMin: 10,
  wardIssueShare: 0.3,
  /** Issue rising: a source counts with this many this week, or over the previous four. */
  risingWeekMin: 5,
  risingBeforeMin: 20,
  risingPoints: 0.1,
  risingRaisedMin: 10,
  /** One seat, different places: the densest ward over the least dense. */
  densityRatio: 3,
  /** Doors behind: below this many houses knocked, one campaign finding instead. */
  doorsCampaignMin: 100,
  /** Unregistered adults: either is enough. */
  unregisteredMin: 5000,
  unregisteredShare: 0.2,
  /** Spend out of line: the campaign's stipends in 30 days, and the ward's share against its voters'. */
  spendMinKes: 10000,
  spendOfVoterShare: 0.5,
  /** Rival in the news: mentions this week, and the rise in share. */
  rivalMentionsMin: 20,
  rivalPoints: 0.1,
} as const;

/** Shares are floats: a share of exactly a threshold must not miss it by rounding. */
export const EPS = 1e-9;

export type Figure = {
  label: string;
  value: number;
  /** Exactly as the line prints it. */
  text: string;
  source: string;
  period: string;
};
export type Next = { label: string; to: string; search?: Record<string, string>; hash?: string };
export type Finding = {
  /** Stable: the rule and the place (or what it is about). Part 3 cites findings by it. */
  id: string;
  rule: RuleId;
  decision: Decision;
  /** An atlas key, or null for the whole campaign. */
  place: string | null;
  line: string;
  figures: Figure[];
  next: Next;
  /** The rule's own measure: findings of one rule are ordered by it, largest first. */
  weight: number;
};

/** The database counts the engine reads, by the function that returns them. */
export type Count =
  | "house_doors"
  | "ward_issues"
  | "issue_weeks"
  | "rival_mention_weeks"
  | "ward_spend"
  | "ward_supporters";

export type IssueSource = "door" | "messages" | "news";
export const ISSUE_SOURCES: IssueSource[] = ["door", "messages", "news"];

/** A campaign ward, with its place in the atlas (null when the atlas doesn't hold it). */
export type FindingsWard = {
  id: string;
  name: string;
  slug: string;
  constituency: string;
  key: string | null;
  targetVotes: number | null;
};
export type WardIssue = { wardId: string; source: IssueSource; issue: string; n: number };
/** Week 0 is the last 7 days; week 1 the 7 before, and so on. */
export type IssueWeek = { week: number; source: IssueSource; issue: string; n: number };
/** A null rival is every news and social mention that week. */
export type RivalWeek = { week: number; rivalId: string | null; n: number };

/** Everything the rules read. A null count couldn't be read (its function isn't in yet). */
export type FindingsInput = {
  /** YYYY-MM-DD, Nairobi's. */
  today: string;
  home: string;
  race: Race;
  atlas: AtlasData;
  wards: FindingsWard[];
  /** Houses per ward slug, from the campaign's house file; null without one. */
  houses: Record<string, number> | null;
  doors: WardDoors[] | null;
  supporters: { wardId: string; supporters: number }[] | null;
  spend: { wardId: string; kes: number }[] | null;
  issues: WardIssue[] | null;
  issueWeeks: IssueWeek[] | null;
  rivalWeeks: RivalWeek[] | null;
  /** The diary from 60 days back to 14 ahead. */
  diary: DiaryEntry[];
  rivals: RaceRival[];
  polls: RacePoll[];
};

export type FindingsResult = {
  asOf: string;
  findings: Finding[];
  /** Counts that couldn't be read: their rules stay quiet. */
  waiting: Count[];
  /** Whether the campaign's side in its 2022 race is set. */
  sideSet: boolean;
  /** Each campaign ward's place in the atlas, by ward id. */
  wardKeys: Record<string, string>;
};

const ORDER = new Map<RuleId, number>(RULES.map((r, n) => [r.id, n]));
const DECISION_OF = new Map<RuleId, Decision>(RULES.map((r) => [r.id, r.decision]));

export function finding(
  rule: RuleId,
  place: string | null,
  line: string,
  figures: Figure[],
  next: Next,
  weight: number,
  about: string | null = place,
): Finding {
  return {
    id: `${rule}:${about ?? "campaign"}`,
    rule,
    decision: DECISION_OF.get(rule)!,
    place,
    line,
    figures,
    next,
    weight,
  };
}

/** Grouped by decision, then in the rules' order, then by weight, largest first; ties by id. */
export function orderFindings(fs: Finding[]): Finding[] {
  return [...fs].sort(
    (a, b) =>
      DECISIONS.indexOf(a.decision) - DECISIONS.indexOf(b.decision) ||
      ORDER.get(a.rule)! - ORDER.get(b.rule)! ||
      b.weight - a.weight ||
      a.id.localeCompare(b.id),
  );
}

/** `key` is `place` or inside it; Kenya holds everything. */
export const within = (place: string, key: string): boolean =>
  place === "kenya" || key === place || key.startsWith(`${place}/`);

/** The findings about `place` and the places inside it, and, unless left out, the campaign-wide ones. */
export function forPlace(fs: Finding[], place: string | null, campaignWide = true): Finding[] {
  if (place === null) return fs;
  return fs.filter((f) => (f.place === null ? campaignWide : within(place, f.place)));
}

/** The first finding of each decision, in the decisions' order. */
export function firstOfEach(fs: Finding[]): Finding[] {
  return DECISIONS.flatMap((d) => fs.find((f) => f.decision === d) ?? []);
}

/**
 * A Voters area's place in the atlas: a ward's key, a constituency's (from
 * any of its wards'), null for the whole map; undefined when the atlas
 * doesn't hold it, so nothing is shown rather than everything.
 */
export function votersPlace(
  area: Area,
  wards: { id: string; slug: string; constituency: string }[],
  wardKeys: Record<string, string>,
): string | null | undefined {
  if (area.level === "county") return null;
  if (area.level === "ward") {
    const w = wards.find((x) => x.slug === area.slug);
    return (w && wardKeys[w.id]) || undefined;
  }
  const key = wards
    .filter((x) => x.constituency === area.name)
    .map((x) => wardKeys[x.id])
    .find(Boolean);
  return key ? key.split("/").slice(0, 2).join("/") : undefined;
}

/** A place the address names, when it is well formed; anything else is no place. */
export const placeParam = (raw: unknown): string | null =>
  validateElectionsSearch({ area: raw }).area ?? null;

/**
 * The place a page shows: a well-formed one the atlas holds (any well-formed
 * one until the atlas loads); otherwise none, so every finding shows. The
 * router passes the raw address through, so a page can't rely on its own
 * search check to drop a bad one.
 */
export function knownPlace(raw: unknown, areas: { key: string }[] | undefined): string | null {
  const place = placeParam(raw);
  return place && (!areas || areas.some((a) => a.key === place)) ? place : null;
}

/** The digits in a line that no figure accounts for: each figure's text is taken out, longest first. */
export function unaccounted(f: Pick<Finding, "line" | "figures">): string[] {
  let rest = f.line;
  for (const fig of [...f.figures].sort((a, b) => b.text.length - a.text.length))
    rest = rest.split(fig.text).join(" ");
  return rest.match(/[0-9][0-9,.]*/g) ?? [];
}

/** "8,830". */
export const count = (n: number): string => new Intl.NumberFormat("en-KE").format(n);
/** "38%"; a share too small to round up reads "under 1%". */
export const percent = (x: number): string =>
  x > 0 && x < 0.005 ? "under 1%" : `${Math.round(x * 100)}%`;

/**
 * The first part of `xs` by `by`, largest first: "top quarter" is 0.25 and
 * rounds up, so there is always at least one. Ties go by `id`.
 */
export function topPart<T>(xs: T[], by: (x: T) => number, part: number, id: (x: T) => string): T[] {
  return [...xs]
    .sort((a, b) => by(b) - by(a) || id(a).localeCompare(id(b)))
    .slice(0, Math.ceil(xs.length * part));
}

/** The home area's level in the atlas. */
export const levelOf = (i: Pick<FindingsInput, "atlas" | "home">): string | undefined =>
  i.atlas.areas.find((a) => a.key === i.home)?.level;

/**
 * The places votes are weighed in, as Home's Moves card did: an MP's
 * constituency itself; otherwise the home area's parts (a county's
 * constituencies, Kenya's counties).
 */
export function seatsOf(i: Pick<FindingsInput, "atlas" | "home">): string[] {
  return levelOf(i) === "constituency"
    ? [i.home]
    : i.atlas.areas.filter((a) => a.parent === i.home).map((a) => a.key);
}

/** What an empty group says instead. */
export function emptyLine(d: Decision, r: Pick<FindingsResult, "waiting" | "sideSet">): string {
  if (d === "time")
    return r.sideSet
      ? "Nothing stands out in the diary right now."
      : "Set your side in Elections first: the diary is weighed against where the votes are.";
  if (d === "message")
    return r.waiting.includes("ward_issues")
      ? "Waiting for the database update: the issues raised by ward come with it."
      : "Not enough raised yet to say what stands out.";
  if (d === "field")
    return r.sideSet
      ? "Nothing stands out in the field figures right now."
      : "Set your side in Elections first, and the places where votes can move show here.";
  return "No poll moves or rivals rising in the news in the last 30 days.";
}
