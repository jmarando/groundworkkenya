// What is on people's minds this week: the issues raised in the news and on
// social media, in messages to the campaign, at the door, and in Google
// searches. Each source is counted on its own and the shares averaged, so no
// one source decides. Pure.

export type MindSource = "news" | "messages" | "door" | "searches";
export const MIND_SOURCES: MindSource[] = ["news", "messages", "door", "searches"];
export const SOURCE_NAMES: Record<MindSource, string> = {
  news: "News and social",
  messages: "Messages to us",
  door: "At the door",
  searches: "Searches",
};

/** A source counts in a week with at least this many items (searches: any interest). */
export const MIN_ITEMS = 5;

const NOT_ISSUES = new Set(["general", "campaign"]);
const SAME: Record<string, string> = {
  rubbish: "garbage",
  trash: "garbage",
  waste: "garbage",
  "garbage and cleanliness": "garbage",
  "water and sanitation": "water",
  sanitation: "water",
  sewer: "water",
  sewerage: "water",
  flooding: "floods",
  road: "roads",
  insecurity: "security",
  crime: "security",
  bursary: "bursaries",
  job: "jobs",
  unemployment: "jobs",
  hospital: "health",
  matatu: "transport",
  matatus: "transport",
  hawker: "hawkers",
  "street lights": "lighting",
  streetlights: "lighting",
};

/** One name per issue, in lower case; null for "no issue". */
export function issueKey(raw: string | null | undefined): string | null {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!k || NOT_ISSUES.has(k)) return null;
  return SAME[k] ?? k;
}

export const issueLabel = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

export type MindInputs = {
  /** Listening's mentions, newest first, rivals' own posts aside. */
  news: { issue: string | null; title: string | null; url: string | null }[];
  messages: (string | null)[];
  door: (string | null)[];
  /** Each issue's average search interest this week. */
  searches: { issue: string; average: number }[];
};

export type MindLine = {
  key: string;
  label: string;
  /** The average share across the sources that count, 0 to 1. */
  score: number;
  /** Each source's share for this issue; null where the source doesn't count this week. */
  shares: Record<MindSource, number | null>;
  examples: { text: string; url: string | null }[];
};

export type TopOfMind = {
  lines: MindLine[];
  /** What each source had this week (searches: issues with any interest). */
  sizes: Record<MindSource, number>;
};

function tally(keys: (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** The week's top issues across the four sources. */
export function topOfMind(inp: MindInputs, max = 5): TopOfMind {
  const counts: Record<MindSource, Map<string, number>> = {
    news: tally(inp.news.map((r) => issueKey(r.issue))),
    messages: tally(inp.messages.map(issueKey)),
    door: tally(inp.door.map(issueKey)),
    searches: new Map(),
  };
  for (const s of inp.searches) {
    const k = issueKey(s.issue);
    if (k && s.average > 0) counts.searches.set(k, (counts.searches.get(k) ?? 0) + s.average);
  }
  const sizes: Record<MindSource, number> = {
    news: sum(counts.news),
    messages: sum(counts.messages),
    door: sum(counts.door),
    searches: counts.searches.size,
  };
  const counting = MIND_SOURCES.filter((s) =>
    s === "searches" ? sizes.searches > 0 : sizes[s] >= MIN_ITEMS,
  );
  const keys = new Set(counting.flatMap((s) => [...counts[s].keys()]));
  const lines = [...keys].map((key): MindLine => {
    const shares = Object.fromEntries(
      MIND_SOURCES.map((s) => [
        s,
        counting.includes(s) ? (counts[s].get(key) ?? 0) / sum(counts[s]) : null,
      ]),
    ) as Record<MindSource, number | null>;
    const got = counting.map((s) => shares[s] ?? 0);
    return {
      key,
      label: issueLabel(key),
      score: got.reduce((a, b) => a + b, 0) / got.length,
      shares,
      examples: inp.news
        .filter((r) => issueKey(r.issue) === key && r.title)
        .slice(0, 2)
        .map((r) => ({ text: r.title!, url: r.url })),
    };
  });
  lines.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return { lines: lines.slice(0, max), sizes };
}

/** "31%". */
export const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** "a", "a and b", "a, b and c". */
export const listOf = (parts: string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const nf = new Intl.NumberFormat("en-KE");

/** What this week's ranking rests on, in a line. */
export function mindBasis(m: TopOfMind): string {
  const parts = [
    m.sizes.news >= MIN_ITEMS ? `${nf.format(m.sizes.news)} news and social items` : null,
    m.sizes.messages >= MIN_ITEMS ? `${nf.format(m.sizes.messages)} messages` : null,
    m.sizes.door >= MIN_ITEMS ? `${nf.format(m.sizes.door)} door conversations` : null,
    m.sizes.searches > 0 ? "Google searches" : null,
  ].filter((p): p is string => p !== null);
  return parts.length
    ? `Across ${listOf(parts)}, the last 7 days.`
    : "Not enough raised this week to say yet.";
}

/** The sources an issue's score rests on, in words. */
export const sourcesOf = (l: MindLine): string =>
  listOf(
    MIND_SOURCES.filter((s) => l.shares[s] !== null).map((s) => SOURCE_NAMES[s].toLowerCase()),
  );
