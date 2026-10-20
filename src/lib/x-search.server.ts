// X (Twitter) keyword search through TwitterAPI.io's advanced search: X's own latest results, not
// what a search engine happened to index, with each post's views, reposts and author. The key is
// TWITTERAPI_IO_KEY; without it X is read only through web search, as before. Every call is
// counted against the day's "x" budget (X_DAILY_SEARCHES, default 300), shared by all campaigns.

import { readXSearch, type XHit } from "@/lib/x-read";

const BASE = "https://api.twitterapi.io/twitter/tweet/advanced_search";

export const xConfigured = () => Boolean(process.env["TWITTERAPI_IO_KEY"]);

export class XCreditError extends Error {}

/** The latest posts on X for a query from the last `hours`, without reposts. One call. */
export async function searchX(query: string, hours = 48): Promise<XHit[]> {
  const key = process.env["TWITTERAPI_IO_KEY"];
  if (!key) throw new XCreditError("X search is not connected.");
  const since = Math.floor((Date.now() - hours * 3600_000) / 1000);
  const q = `${query} -filter:retweets since_time:${since}`.slice(0, 480);
  const res = await fetch(`${BASE}?${new URLSearchParams({ query: q, queryType: "Latest" })}`, {
    headers: { "X-API-Key": key },
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401 || res.status === 402 || res.status === 403)
    throw new XCreditError(`X search refused (${res.status}): check the key and its balance.`);
  if (!res.ok) throw new Error(`X search failed (${res.status}).`);
  return readXSearch(await res.json());
}
