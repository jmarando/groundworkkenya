// Who shapes the conversation about a seat, platform by platform, and what is spreading. Pure;
// read from the posts Listening kept. A voice is a public account or an outlet, named from the
// post itself: the author the platform gave, else the account in the post's address (a Facebook
// page, an X or TikTok handle), else the news site. Places, never people: nothing here records or
// guesses anyone's community, and a voice is only what it published.

import type { Post } from "@/lib/listening-read";
import { sourceName } from "@/lib/listening-read";

export type VoicePost = Post & { url: string; author: string | null; shares?: number | null };

export type Voice = {
  key: string;
  platform: string;
  name: string;
  /** The account's or outlet's own page, when the address gives one. */
  url: string | null;
  posts: number;
  /** Views summed, where the platform counts them; null when none did. */
  reach: number | null;
  positive: number;
  neutral: number;
  negative: number;
  /** Posts found by your own keywords, and by rivals'. */
  aboutYou: number;
  aboutRivals: number;
  topIssue: string | null;
  last: string;
  /** -1 (all angry) to 1 (all warm), over the posts whose mood was read; null when none was. */
  mood: number | null;
};

/** Account names in addresses that are not accounts. */
const NOT_ACCOUNTS = new Set([
  "watch",
  "story.php",
  "permalink.php",
  "photo.php",
  "photo",
  "photos",
  "groups",
  "share",
  "reel",
  "reels",
  "p",
  "i",
  "hashtag",
  "search",
  "video",
  "videos",
  "events",
  "people",
  "profile.php",
  "explore",
  "status",
  "home",
  "intent",
  "r",
  "shorts",
  "channel",
  "c",
  "results",
  "tv",
  "stories",
]);

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^(www|m|mobile|web)\./, "");
  } catch {
    return null;
  }
};
const path = (url: string) => {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
};

/** The voice behind a post, or null when neither the post nor its address names one. */
export function voiceOf(p: Pick<VoicePost, "source" | "url" | "author" | "domain">): {
  key: string;
  name: string;
  url: string | null;
} | null {
  const parts = path(p.url);
  const first = parts[0] ?? "";
  const h = host(p.url);
  const account = (name: string, url: string | null) => ({
    key: `${p.source}:${name.toLowerCase()}`,
    name,
    url,
  });
  if (p.author?.trim()) {
    const a = p.author.trim();
    const handle = a.replace(/^@/, "");
    const url =
      p.source === "tiktok" && a.startsWith("@")
        ? `https://www.tiktok.com/${a}`
        : p.source === "x"
          ? `https://x.com/${handle}`
          : p.source === "reddit" && a.startsWith("u/")
            ? `https://www.reddit.com/${a}`
            : null;
    return account(a, url);
  }
  switch (p.source) {
    case "x":
    case "facebook":
    case "instagram":
      if (first && !NOT_ACCOUNTS.has(first.toLowerCase()) && /^[\w.]{2,60}$/.test(first))
        return account(
          p.source === "x" ? `@${first}` : first,
          `https://${p.source === "x" ? "x.com" : `www.${p.source}.com`}/${first}`,
        );
      return null;
    case "tiktok":
      if (first.startsWith("@") && first.length > 1)
        return account(first, `https://www.tiktok.com/${first}`);
      return null;
    case "youtube":
      if (first.startsWith("@")) return account(first, `https://www.youtube.com/${first}`);
      return null;
    case "reddit":
      if (first === "r" && parts[1])
        return account(`r/${parts[1]}`, `https://www.reddit.com/r/${parts[1]}`);
      return null;
    default: {
      const site = p.domain ?? h;
      return site ? { key: `site:${site}`, name: site, url: `https://${site}` } : null;
    }
  }
}

const time = (p: Post) => new Date(p.publishedAt ?? p.foundAt).getTime();
const DAY = 86_400_000;

function most(values: (string | null)[]): string | null {
  const n = new Map<string, number>();
  for (const v of values)
    if (v && v !== "general" && v !== "campaign") n.set(v, (n.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, c] of n) if (!best || c > (n.get(best) ?? 0)) best = k;
  return best;
}

/** The posts' voices, the most influential first: views where counted, else how often heard. */
export function voices(posts: VoicePost[], opts: { now?: number; days?: number } = {}): Voice[] {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 30) * DAY;
  const by = new Map<string, { v: NonNullable<ReturnType<typeof voiceOf>>; rows: VoicePost[] }>();
  for (const p of posts) {
    if (time(p) < since || p.rivalId) continue; // candidates' own accounts are rivals, not voices
    const v = voiceOf(p);
    if (!v) continue;
    const e = by.get(v.key) ?? { v, rows: [] };
    e.rows.push(p);
    by.set(v.key, e);
  }
  const out: Voice[] = [...by.values()].map(({ v, rows }) => {
    const positive = rows.filter((r) => r.sentiment === "positive").length;
    const neutral = rows.filter((r) => r.sentiment === "neutral").length;
    const negative = rows.filter((r) => r.sentiment === "negative").length;
    const rated = positive + neutral + negative;
    const counted = rows.filter((r) => r.reach !== null);
    return {
      key: v.key,
      platform: rows[0]!.source,
      name: v.name,
      url: v.url,
      posts: rows.length,
      reach: counted.length ? counted.reduce((t, r) => t + (r.reach ?? 0), 0) : null,
      positive,
      neutral,
      negative,
      aboutYou: rows.filter((r) => r.topicKind === "campaign").length,
      aboutRivals: rows.filter((r) => r.topicKind === "rival").length,
      topIssue: most(rows.map((r) => r.issue)),
      last: new Date(Math.max(...rows.map(time))).toISOString(),
      mood: rated ? (positive - negative) / rated : null,
    };
  });
  return out.sort(
    (a, b) => (b.reach ?? 0) - (a.reach ?? 0) || b.posts - a.posts || a.name.localeCompare(b.name),
  );
}

export type PlatformRead = {
  platform: string;
  name: string;
  posts: number;
  positive: number;
  neutral: number;
  negative: number;
  /** Share of the rated posts that are angry, 0 to 1; null when none was rated. */
  angry: number | null;
  warm: number | null;
  reach: number | null;
  topIssue: string | null;
  voices: Voice[];
};

/** Each platform's conversation side by side: how much, how it feels, about what, and who leads it. */
export function platforms(
  posts: VoicePost[],
  opts: { now?: number; days?: number } = {},
): PlatformRead[] {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 30) * DAY;
  const recent = posts.filter((p) => time(p) >= since && !p.rivalId);
  const all = voices(recent, { now, days: opts.days ?? 30 });
  const names = [...new Set(recent.map((p) => p.source))];
  return names
    .map((platform) => {
      const rows = recent.filter((p) => p.source === platform);
      const positive = rows.filter((r) => r.sentiment === "positive").length;
      const neutral = rows.filter((r) => r.sentiment === "neutral").length;
      const negative = rows.filter((r) => r.sentiment === "negative").length;
      const rated = positive + neutral + negative;
      const counted = rows.filter((r) => r.reach !== null);
      return {
        platform,
        name: sourceName(platform),
        posts: rows.length,
        positive,
        neutral,
        negative,
        angry: rated ? negative / rated : null,
        warm: rated ? positive / rated : null,
        reach: counted.length ? counted.reduce((t, r) => t + (r.reach ?? 0), 0) : null,
        topIssue: most(rows.map((r) => r.issue)),
        voices: all.filter((v) => v.platform === platform).slice(0, 3),
      };
    })
    .sort((a, b) => b.posts - a.posts);
}

/** One sentence on how the platforms differ, from the counts; null when there is too little. */
export function platformContrast(reads: PlatformRead[]): string | null {
  const rated = reads.filter((r) => r.angry !== null && r.positive + r.neutral + r.negative >= 5);
  if (rated.length < 2) return null;
  const angriest = [...rated].sort((a, b) => b.angry! - a.angry!)[0]!;
  const warmest = [...rated].sort((a, b) => b.warm! - a.warm!)[0]!;
  if (angriest.platform === warmest.platform) return null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `${angriest.name} is the angriest place (${pct(angriest.angry!)} of ${angriest.positive + angriest.neutral + angriest.negative} read posts angry); ${warmest.name} the warmest (${pct(warmest.warm!)} warm).`;
}

/** The default bar for "spreading": posts seen at least this many times. */
export const SPREAD_DEFAULT = 5000;

/** Posts of the last two days seen at least `threshold` times, not yet handled first, then most seen. */
export function spreading<T extends VoicePost>(
  posts: T[],
  threshold: number,
  now = Date.now(),
): T[] {
  return posts
    .filter((p) => (p.reach ?? 0) >= threshold && now - time(p) <= 2 * DAY)
    .sort(
      (a, b) =>
        Number(b.status === "new") - Number(a.status === "new") || (b.reach ?? 0) - (a.reach ?? 0),
    );
}
