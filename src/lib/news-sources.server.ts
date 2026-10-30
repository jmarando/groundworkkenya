// The news sources, fetched (server only): every Kenyan outlet's own feed (free), and the keyword
// news search (Serper, SERPER_API_KEY: Google News's results through a licensed API, one prepaid
// credit a search). Reading them is src/lib/news-feeds.ts. Each call is bounded and best effort: a
// feed that doesn't answer is counted, never fatal.

import { type FeedStory, type NewsHit, OUTLET_FEEDS, parseFeed, serperStories } from "./news-feeds";

const AGENT = "Mozilla/5.0 (compatible; GroundworkListening/1.0; +https://groundwork.ke)";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*";

async function getFeed(url: string, ms: number): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": AGENT, Accept: ACCEPT },
  });
  if (!res.ok) throw new Error(`the feed answered ${res.status}`);
  return res.text();
}

export type OutletRead = {
  /** Every story of every feed that answered, a story in two feeds counted once. */
  stories: FeedStory[];
  /** The outlets with no feed that answered with stories. */
  failed: string[];
};

/** Every outlet feed, read side by side. */
export async function readOutletFeeds(): Promise<OutletRead> {
  const answers = await Promise.allSettled(
    OUTLET_FEEDS.map(async (f) => parseFeed(await getFeed(f.url, 15_000))),
  );
  const byUrl = new Map<string, FeedStory>();
  const answered = new Set<string>();
  const asked = new Set<string>();
  answers.forEach((a, i) => {
    const outlet = OUTLET_FEEDS[i]!.outlet;
    asked.add(outlet);
    if (a.status !== "fulfilled" || a.value.length === 0) return;
    answered.add(outlet);
    for (const s of a.value) if (!byUrl.has(s.url)) byUrl.set(s.url, s);
  });
  // An outlet counts as failed only when none of its feeds answered.
  return { stories: [...byUrl.values()], failed: [...asked].filter((o) => !answered.has(o)) };
}

/** Whether the keyword news search has its key. */
export const newsSearchConfigured = (): boolean => Boolean(process.env["SERPER_API_KEY"]);

/** The news search turned the request away: a wrong key, or its prepaid credits used up. */
export class NewsSearchRefused extends Error {}

/**
 * The news search for one keyword (Serper): Google News's results for Kenya, in English, from the
 * last seven days, each at the article's own address. One prepaid credit; Google News's own feed
 * refuses servers (503) and is for personal use only, so it is not asked.
 */
export async function newsSearch(query: string): Promise<NewsHit[]> {
  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "X-API-KEY": process.env["SERPER_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query.slice(0, 300), gl: "ke", hl: "en", tbs: "qdr:w", num: 10 }),
  });
  const body = await res.text();
  if (
    res.status === 401 ||
    res.status === 403 ||
    (!res.ok && /credit|unauthori[sz]ed|api key/i.test(body))
  )
    throw new NewsSearchRefused(
      `the news search was refused (${res.status}): ${body.slice(0, 120)}`,
    );
  if (!res.ok) throw new Error(`the news search answered ${res.status}`);
  try {
    return serperStories(JSON.parse(body));
  } catch {
    throw new Error("the news search's answer could not be read");
  }
}
