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
        source: "x",
      },
    ];
  });
}
