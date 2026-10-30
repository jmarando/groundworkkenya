// Looking up how many follow the accounts Listening names: which request asks a platform for an
// account, how its answer is read, and which accounts are worth a lookup this hour. Pure. The
// calls themselves are in src/lib/profiles.server.ts.
//
// Only public facts about public accounts; a count is not a profile.

import type { BigVoice, Column } from "@/lib/big-voices";

const WEEK = 7 * 86_400_000;
/** Per column: this many by views seen, and this many by posts among those with no views. */
const PER_COLUMN = 10;

export type ProfileRequest = { path: string; params: Record<string, string> };

/**
 * The request that asks ScrapeCreators about the account behind a voice key ("x:@name"), or null
 * when the key is an outlet, a platform with no profile endpoint, or not a handle we would send.
 * Only TikTok's path and parameter are confirmed against its documentation; check the others
 * before relying on them (see the design's note on the profile endpoints).
 */
export function profileRequest(voiceKey: string): ProfileRequest | null {
  const i = voiceKey.indexOf(":");
  if (i < 1) return null;
  const platform = voiceKey.slice(0, i);
  const name = voiceKey.slice(i + 1);
  const bare = name.replace(/^@/, "");
  switch (platform) {
    case "tiktok":
      return /^[\w.]{2,24}$/.test(bare)
        ? { path: "/v1/tiktok/profile", params: { handle: bare } }
        : null;
    case "x":
      return /^\w{1,15}$/.test(bare)
        ? { path: "/v1/twitter/profile", params: { handle: bare } }
        : null;
    case "instagram":
      return /^[\w.]{1,30}$/.test(bare)
        ? { path: "/v1/instagram/profile", params: { handle: bare } }
        : null;
    case "youtube":
      return /^@[\w.-]{3,60}$/.test(name)
        ? { path: "/v1/youtube/channel", params: { handle: name } }
        : null;
    case "facebook":
      return /^[\w.-]{2,100}$/.test(name)
        ? {
            path: "/v1/facebook/profile",
            params: { url: `https://www.facebook.com/${name}` },
          }
        : null;
    default:
      return null;
  }
}

// Where a profile answer keeps its follower or subscriber count, in the shapes the platforms use.
const WRAPPERS: string[][] = [
  [],
  ["data"],
  ["user"],
  ["profile"],
  ["channel"],
  ["result"],
  ["data", "user"],
];
const COUNTS: string[][] = [
  ["stats", "followerCount"],
  ["followerCount"],
  ["followers_count"],
  ["follower_count"],
  ["followersCount"],
  ["legacy", "followers_count"],
  ["followers"],
  ["subscriberCount"],
  ["statistics", "subscriberCount"],
  ["subscribers"],
  ["edge_followed_by", "count"],
];

const dig = (v: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    v,
  );

const asCount = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.round(v)
    : typeof v === "string" && /^\d+$/.test(v.trim())
      ? Number(v.trim())
      : null;

/** The follower (or subscriber) count in a profile answer, or null when it holds none. */
export function readFollowers(answer: unknown): number | null {
  for (const wrap of WRAPPERS)
    for (const path of COUNTS) {
      const n = asCount(dig(answer, [...wrap, ...path]));
      if (n !== null) return n;
    }
  return null;
}

/** What is already known about an account: its count and when it was looked up or failed. */
export type Known = { followers: number | null; checkedAt: string | null; failedAt: string | null };

/**
 * The voice keys worth a lookup now, most worth first: per column the top ten accounts by views
 * seen, then the top ten by posts among those whose platform gives no views. Skips outlets and
 * platforms with no endpoint, a count looked up under a week ago, and a failure under a week old.
 * `columns` come from bigVoices with the floor off and no limit on accounts.
 */
export function lookupCandidates(
  columns: Column[],
  known: Map<string, Known>,
  now: number,
  limit: number,
): string[] {
  const viewed: BigVoice[] = [];
  const unviewed: BigVoice[] = [];
  for (const c of columns) {
    viewed.push(
      ...c.accounts
        .filter((a) => a.seen !== null)
        .sort((a, b) => b.seen! - a.seen! || b.posts - a.posts || a.name.localeCompare(b.name))
        .slice(0, PER_COLUMN),
    );
    unviewed.push(
      ...c.accounts
        .filter((a) => a.seen === null)
        .sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name))
        .slice(0, PER_COLUMN),
    );
  }
  const worthIt = (v: BigVoice) => {
    if (profileRequest(v.key) === null) return false;
    const k = known.get(v.key);
    if (k?.followers != null && k.checkedAt && now - Date.parse(k.checkedAt) < WEEK) return false;
    if (k?.failedAt && now - Date.parse(k.failedAt) < WEEK) return false;
    return true;
  };
  const keys: string[] = [];
  for (const v of [
    ...viewed.sort((a, b) => b.seen! - a.seen!),
    ...unviewed.sort((a, b) => b.posts - a.posts),
  ])
    if (worthIt(v) && !keys.includes(v.key)) keys.push(v.key);
  return keys.slice(0, Math.max(0, limit));
}
