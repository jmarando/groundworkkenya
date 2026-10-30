// Who is loud in the seat, the county and the country, how big they are, how their posts feel
// towards the campaign, and the move to suggest. Plain code over the posts Listening kept; no AI.
//
// Places, never people: a voice is a public account or an outlet, named from what it published.
// Nothing here records or guesses anyone's community, and an account too small to matter is never
// named (FLOOR). "Respond" means answer the claim, never the person.

import { OFF_TOPIC } from "@/lib/top-of-mind";
import { voiceOf, type VoicePost } from "@/lib/voices";

export type Level = "seat" | "county" | "country";
export type Move = "recruit" | "win-over" | "respond" | "press";

/** An account is named only with this many followers or this many views seen in the window. */
export const FLOOR = { followers: 2000, seen: 5000 } as const;

const DAY = 86_400_000;
const LEVELS: Level[] = ["seat", "county", "country"];
const MOODS = new Set(["positive", "neutral", "negative"]);
/** Issues that say nothing about what a post was about. */
export const NO_ISSUE = new Set(["general", "campaign", OFF_TOPIC]);
const POSTS_KEPT = 200;

export type BigVoice = {
  /** The same key voiceOf gives, so follower counts and approaches line up. */
  key: string;
  platform: string;
  name: string;
  url: string | null;
  kind: "account" | "outlet";
  followers: number | null;
  /** Posts in this column. */
  posts: number;
  /** Views summed over those posts, where the platform counts them; null when none did. */
  seen: number | null;
  topIssues: string[];
  /** Posts whose mood was read and that count towards it (not those found by a rival's keyword). */
  read: number;
  warm: number;
  angry: number;
  /** Shares of the read posts, 0 to 1; null when none was read. */
  towardsWarm: number | null;
  towardsAngry: number | null;
  move: Move;
  /** The most-seen angry post, the one to answer. */
  angryPostId: string | null;
  /** The voice's posts in the column, most seen first. */
  postIds: string[];
  last: string;
};

export type Column = {
  level: Level;
  label: string;
  accounts: BigVoice[];
  outlets: BigVoice[];
  /** Posts from accounts under the floor, which are never named. */
  smaller: number;
};

export type BigVoicesOpts = {
  now?: number;
  /** The window in days; 30 by default. */
  days?: number;
  /** Followers by voice key; a missing key or a null is unknown. */
  followers: Map<string, number | null>;
  /** Voice keys that belong to the candidates themselves; they are not voices. */
  rivalKeys: Set<string>;
  labels: Record<Level, string>;
  /** Most accounts and outlets kept per column; 10 and 5 by default. */
  accounts?: number;
  outlets?: number;
  /** False lists accounts under the floor too (for planning lookups); true by default. */
  floor?: boolean;
};

/** Which column a keyword's posts belong to; null for a candidate's own posts. */
export function levelOf(topicKind: string | null): Level | null {
  switch (topicKind) {
    case "campaign":
    case "rival":
    case "issue":
      return "seat";
    case "county":
      return "county";
    case "national":
      return "country";
    default:
      return null;
  }
}

/** The move to suggest, first match wins. Warm and angry are counts of the read posts. */
export function moveFor(v: {
  kind: "account" | "outlet";
  read: number;
  warm: number;
  angry: number;
}): Move {
  if (v.kind === "outlet") return "press";
  if (v.read >= 2 && v.angry * 2 >= v.read) return "respond";
  if (v.read >= 2 && v.warm * 2 >= v.read) return "recruit";
  return "win-over";
}

/** The voice keys of the candidates' own accounts, as voiceOf names them (lower case). */
export function rivalVoiceKeys(
  rivals: { x?: string | null; tiktok?: string | null; facebook?: string | null }[],
): Set<string> {
  const keys = new Set<string>();
  for (const r of rivals) {
    if (r.x) keys.add(`x:@${r.x.toLowerCase()}`);
    if (r.tiktok) keys.add(`tiktok:@${r.tiktok.toLowerCase()}`);
    if (r.facebook) keys.add(`facebook:${r.facebook.toLowerCase()}`);
  }
  return keys;
}

const when = (p: VoicePost) => new Date(p.publishedAt ?? p.foundAt).getTime();
const byViews = (a: VoicePost, b: VoicePost) =>
  (b.reach ?? 0) - (a.reach ?? 0) || when(b) - when(a);

function topIssues(rows: VoicePost[]): string[] {
  const n = new Map<string, number>();
  for (const r of rows)
    if (r.issue && !NO_ISSUE.has(r.issue)) n.set(r.issue, (n.get(r.issue) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([issue]) => issue);
}

type Acc = { key: string; name: string; url: string | null; rows: VoicePost[] };

function build(acc: Acc, followers: Map<string, number | null>): BigVoice {
  const { rows } = acc;
  const kind = acc.key.startsWith("site:") ? "outlet" : "account";
  const counted = rows.filter((r) => r.reach !== null);
  // How a post feels about you is least reliable for a post found by a rival's name.
  const mood = rows.filter((r) => r.topicKind !== "rival" && r.sentiment && MOODS.has(r.sentiment));
  const warm = mood.filter((r) => r.sentiment === "positive").length;
  const angry = mood.filter((r) => r.sentiment === "negative").length;
  const read = mood.length;
  return {
    key: acc.key,
    platform: rows[0]!.source,
    name: acc.name,
    url: acc.url,
    kind,
    followers: followers.get(acc.key) ?? null,
    posts: rows.length,
    seen: counted.length ? counted.reduce((t, r) => t + (r.reach ?? 0), 0) : null,
    topIssues: topIssues(rows),
    read,
    warm,
    angry,
    towardsWarm: read ? warm / read : null,
    towardsAngry: read ? angry / read : null,
    move: moveFor({ kind, read, warm, angry }),
    angryPostId: mood.filter((r) => r.sentiment === "negative").sort(byViews)[0]?.id ?? null,
    postIds: [...rows]
      .sort(byViews)
      .slice(0, POSTS_KEPT)
      .map((r) => r.id),
    last: new Date(Math.max(...rows.map(when))).toISOString(),
  };
}

/** Views seen, else followers: what an account is ranked by. */
const weight = (v: BigVoice) => v.seen ?? v.followers ?? 0;
const named = (v: BigVoice) => (v.followers ?? 0) >= FLOOR.followers || (v.seen ?? 0) >= FLOOR.seen;

/** The columns that have posts, seat then county then country. */
export function bigVoices(posts: VoicePost[], opts: BigVoicesOpts): Column[] {
  const since = (opts.now ?? Date.now()) - (opts.days ?? 30) * DAY;
  const floor = opts.floor ?? true;
  const cols: Record<Level, Map<string, Acc>> = {
    seat: new Map(),
    county: new Map(),
    country: new Map(),
  };

  for (const p of posts) {
    if (p.rivalId || when(p) < since) continue;
    const level = levelOf(p.topicKind);
    if (!level) continue;
    const v = voiceOf(p);
    if (!v || opts.rivalKeys.has(v.key)) continue;
    const acc = cols[level].get(v.key) ?? { ...v, rows: [] };
    acc.rows.push(p);
    cols[level].set(v.key, acc);
  }

  const out: Column[] = [];
  for (const level of LEVELS) {
    if (!cols[level].size) continue;
    const all = [...cols[level].values()].map((a) => build(a, opts.followers));
    const accounts = all.filter((v) => v.kind === "account");
    out.push({
      level,
      label: opts.labels[level],
      accounts: accounts
        .filter((v) => !floor || named(v))
        .sort((a, b) => weight(b) - weight(a) || b.posts - a.posts || a.name.localeCompare(b.name))
        .slice(0, opts.accounts ?? 10),
      outlets: all
        .filter((v) => v.kind === "outlet")
        .sort(
          (a, b) =>
            b.posts - a.posts || (b.seen ?? 0) - (a.seen ?? 0) || a.name.localeCompare(b.name),
        )
        .slice(0, opts.outlets ?? 5),
      smaller: floor ? accounts.filter((v) => !named(v)).reduce((t, v) => t + v.posts, 0) : 0,
    });
  }
  return out;
}
