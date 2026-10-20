// X (Twitter) keyword search. Two providers, whichever has a key:
// - ScrapeCreators (SCRAPECREATORS_API_KEY, already used for TikTok, YouTube, Reddit and rivals'
//   own posts): GET /v1/twitter/search/posts. It finds public posts through search-engine
//   discovery, so it is not X's own Latest feed, but it costs one ScrapeCreators credit a search.
// - TwitterAPI.io (TWITTERAPI_IO_KEY), when set, is used first: X's own Latest results.
// Every search is one call from the day's "x" budget (X_DAILY_SEARCHES, default 300), shared by
// all campaigns.

import { answerKeys, readScXSearch, readXSearch, type XHit } from "@/lib/x-read";

export const xProvider = (): "twitterapi" | "scrapecreators" | null =>
  process.env["TWITTERAPI_IO_KEY"]
    ? "twitterapi"
    : process.env["SCRAPECREATORS_API_KEY"]
      ? "scrapecreators"
      : null;
export const xConfigured = () => xProvider() !== null;

export class XCreditError extends Error {}

/** The latest posts on X for a query, without reposts. One call. */
export async function searchX(query: string, hours = 48): Promise<XHit[]> {
  const provider = xProvider();
  if (provider === "twitterapi") {
    const since = Math.floor((Date.now() - hours * 3600_000) / 1000);
    const q = `${query} -filter:retweets since_time:${since}`.slice(0, 480);
    const res = await fetch(
      `https://api.twitterapi.io/twitter/tweet/advanced_search?${new URLSearchParams({ query: q, queryType: "Latest" })}`,
      {
        headers: { "X-API-Key": process.env["TWITTERAPI_IO_KEY"]! },
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (res.status === 401 || res.status === 402 || res.status === 403)
      throw new XCreditError(`X search refused (${res.status}): check the key and its balance.`);
    if (!res.ok) throw new Error(`X search failed (${res.status}).`);
    return readXSearch(await res.json());
  }
  if (provider === "scrapecreators") {
    const res = await fetch(
      `https://api.scrapecreators.com/v1/twitter/search/posts?${new URLSearchParams({ query: query.slice(0, 200) })}`,
      {
        headers: { "x-api-key": process.env["SCRAPECREATORS_API_KEY"]! },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (res.status === 402 || res.status === 403)
      throw new XCreditError("ScrapeCreators is out of credits for X search.");
    if (!res.ok) throw new Error(`ScrapeCreators X search failed (${res.status}).`);
    const json: unknown = await res.json();
    const hits = readScXSearch(json);
    const cutoff = Date.now() - 7 * 86_400_000;
    // Search-engine discovery can return old posts: keep the last week's, or undated ones.
    const recent = hits.filter((h) => !h.publishedAt || Date.parse(h.publishedAt) >= cutoff);
    if (hits.length === 0 && JSON.stringify(json).length > 200)
      throw new Error(
        `ScrapeCreators X search answered in a shape not read (${answerKeys(json)}).`,
      );
    return recent;
  }
  throw new XCreditError("X search is not connected.");
}
