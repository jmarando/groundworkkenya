// TwitterAPI.io's advanced-search answer read into posts, without trust: a post with no id or
// author is dropped, links are built from the id, counts are numbers or nothing. Pure.

export type XHit = {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
  author: string | null;
  /** Views. */
  reach: number | null;
  /** Reposts and quotes. */
  shares: number | null;
  /** How many follow the author, when the answer says. */
  followers: number | null;
  source: "x";
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

export function readXSearch(raw: unknown): XHit[] {
  const tweets = (raw as { tweets?: unknown } | null)?.tweets;
  if (!Array.isArray(tweets)) return [];
  return tweets.flatMap((t): XHit[] => {
    const o = (t ?? {}) as Record<string, unknown>;
    const id = typeof o["id"] === "string" && /^\d{1,25}$/.test(o["id"]) ? o["id"] : null;
    const author = (o["author"] ?? {}) as Record<string, unknown>;
    const user =
      typeof author["userName"] === "string" && /^\w{1,30}$/.test(author["userName"])
        ? author["userName"]
        : null;
    if (!id || !user) return [];
    const text = typeof o["text"] === "string" ? o["text"].trim() : "";
    const at = typeof o["createdAt"] === "string" ? Date.parse(o["createdAt"]) : NaN;
    const reposts = num(o["retweetCount"]);
    const quotes = num(o["quoteCount"]);
    return [
      {
        url: `https://x.com/${user}/status/${id}`,
        title: text.split("\n")[0]!.slice(0, 300) || null,
        snippet: text.slice(0, 1200) || null,
        publishedAt: Number.isNaN(at) ? null : new Date(at).toISOString(),
        author: `@${user}`,
        reach: num(o["viewCount"]),
        shares: reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0),
        followers: num(author["followers"]),
        source: "x",
      },
    ];
  });
}

const o = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** A count given as a number or as digits ("8660"); null otherwise. */
const count = (v: unknown): number | null =>
  typeof v === "number"
    ? num(v)
    : typeof v === "string" && /^\d+$/.test(v.trim())
      ? Number(v.trim())
      : null;
const HANDLE = /^\w{1,30}$/;
const STATUS = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,30})\/status\/(\d{1,25})/;

/**
 * ScrapeCreators' X search (GET /v1/twitter/search/posts) read into posts. Its answer isn't
 * documented, so every shape its other X endpoints use is read: X's own GraphQL tweets (rest_id,
 * legacy, core.user_results), flat tweets (id, text, view_count, author), and found links
 * (url, title, description). Anything without a post link and a handle is dropped.
 */
export function readScXSearch(raw: unknown): XHit[] {
  const r = o(raw);
  const list = [r["tweets"], r["posts"], r["results"], r["data"], o(r["data"])["tweets"]].find(
    Array.isArray,
  ) as unknown[] | undefined;
  if (!list) return [];
  const seen = new Set<string>();
  return list.flatMap((item): XHit[] => {
    const t = o(o(item)["tweet"] ?? item);
    const legacy = o(t["legacy"]);
    const userLegacy = o(o(o(o(t["core"])["user_results"])["result"])["legacy"]);
    const userCore = o(o(o(o(t["core"])["user_results"])["result"])["core"]);
    const author = o(t["author"] ?? t["user"]);
    const link = s(t["url"]) || s(t["link"]);
    const fromLink = STATUS.exec(link);
    const id =
      [s(t["rest_id"]), s(t["id_str"]), s(t["id"]), s(t["tweet_id"]), fromLink?.[2] ?? ""].find(
        (x) => /^\d{1,25}$/.test(x),
      ) ?? null;
    const handle =
      [
        s(userLegacy["screen_name"]),
        s(userCore["screen_name"]),
        s(author["screen_name"]),
        s(author["username"]),
        s(author["userName"]),
        s(t["screen_name"]),
        s(t["username"]),
        fromLink?.[1] ?? "",
      ].find((x) => HANDLE.test(x)) ?? null;
    if (!id || !handle || seen.has(id)) return [];
    seen.add(id);
    const text =
      s(legacy["full_text"]) ||
      s(t["full_text"]) ||
      s(t["text"]) ||
      s(t["description"]) ||
      s(t["snippet"]) ||
      s(t["title"]);
    const when = Date.parse(
      s(legacy["created_at"]) || s(t["created_at"]) || s(t["createdAt"]) || s(t["date"]),
    );
    const reposts = count(legacy["retweet_count"] ?? t["retweet_count"] ?? t["retweets"]);
    const quotes = count(legacy["quote_count"] ?? t["quote_count"] ?? t["quotes"]);
    return [
      {
        url: `https://x.com/${handle}/status/${id}`,
        title: text.split("\n")[0]!.slice(0, 300) || null,
        snippet: text.slice(0, 1200) || null,
        publishedAt: Number.isNaN(when) ? null : new Date(when).toISOString(),
        author: `@${handle}`,
        reach: count(o(t["views"])["count"] ?? t["view_count"] ?? t["views"] ?? t["viewCount"]),
        shares: reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0),
        followers: count(
          userLegacy["followers_count"] ?? author["followers_count"] ?? author["followers"],
        ),
        source: "x",
      },
    ];
  });
}

/** The top-level keys of an answer, for a note when it holds posts in a shape not read. */
export const answerKeys = (raw: unknown) => Object.keys(o(raw)).slice(0, 8).join(", ");
