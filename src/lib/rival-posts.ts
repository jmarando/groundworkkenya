// Rivals' posts from ScrapeCreators' answers, and how their comments landed.
// Pure; only the words of a comment are read here, never who wrote it.

export type Platform = "tiktok" | "x" | "facebook";

export type SocialPost = {
  platform: Platform;
  url: string;
  text: string;
  publishedAt: string | null;
  /** Reactions, comments and shares (and quotes on X). */
  reach: number;
};

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

/** A TikTok profile's videos (GET /v3/tiktok/profile/videos). */
export function tiktokPosts(json: unknown, handle: string): SocialPost[] {
  return arr(obj(json)["aweme_list"]).flatMap((raw): SocialPost[] => {
    const v = obj(raw);
    const id = str(v["aweme_id"]);
    if (!id) return [];
    const s = obj(v["statistics"]);
    return [
      {
        platform: "tiktok",
        url: `https://www.tiktok.com/@${handle}/video/${id}`,
        text: str(v["desc"]),
        publishedAt: iso(num(v["create_time"]) * 1000),
        reach: num(s["digg_count"]) + num(s["comment_count"]) + num(s["share_count"]),
      },
    ];
  });
}

/** An X account's tweets (GET /v1/twitter/user-tweets). */
export function xPosts(json: unknown, handle: string): SocialPost[] {
  return arr(obj(json)["tweets"]).flatMap((raw): SocialPost[] => {
    const t = obj(raw);
    const id = str(t["rest_id"]);
    if (!id) return [];
    const l = obj(t["legacy"]);
    return [
      {
        platform: "x",
        url: `https://x.com/${handle}/status/${id}`,
        text: str(l["full_text"]),
        publishedAt: iso(Date.parse(str(l["created_at"]))),
        reach:
          num(l["favorite_count"]) +
          num(l["reply_count"]) +
          num(l["retweet_count"]) +
          num(l["quote_count"]),
      },
    ];
  });
}

/** A Facebook page's posts (GET /v1/facebook/profile/posts). */
export function facebookPosts(json: unknown): SocialPost[] {
  return arr(obj(json)["posts"]).flatMap((raw): SocialPost[] => {
    const p = obj(raw);
    const url = str(p["url"]) || str(p["permalink"]);
    if (!/^https:\/\//.test(url)) return [];
    return [
      {
        platform: "facebook",
        url,
        text: str(p["text"]),
        publishedAt: iso(num(p["publishTime"]) * 1000),
        reach: num(p["reactionCount"]) + num(p["commentCount"]) + num(p["shareCount"]),
      },
    ];
  });
}

/** The words of each comment on a page of comments; nothing about who wrote it. */
export function commentTexts(json: unknown): string[] {
  return arr(obj(json)["comments"])
    .map((c) => str(obj(c)["text"]).trim())
    .filter(Boolean);
}

const NOT_ISSUES = new Set(["general", "campaign"]);

/** Positive and negative counts, and the issue raised most (catch-alls aside). */
export function tally(verdicts: { sentiment: string; issue: string }[]): {
  positive: number;
  negative: number;
  issue: string | null;
} {
  const issues = new Map<string, number>();
  let positive = 0;
  let negative = 0;
  for (const v of verdicts) {
    if (v.sentiment === "positive") positive++;
    if (v.sentiment === "negative") negative++;
    const k = v.issue.trim().toLowerCase();
    if (k && !NOT_ISSUES.has(k)) issues.set(k, (issues.get(k) ?? 0) + 1);
  }
  const top = [...issues].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { positive, negative, issue: top ? top[0].slice(0, 40) : null };
}
