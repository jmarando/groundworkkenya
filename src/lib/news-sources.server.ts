// The free news sources, fetched (server only): every Kenyan outlet's own feed, and Google News's
// search feed for one keyword. Reading them is src/lib/news-feeds.ts. Each call is bounded and best
// effort: a feed that doesn't answer is counted, never fatal, and nothing here is paid for.

import {
  type FeedStory,
  googleNewsStories,
  type NewsHit,
  OUTLET_FEEDS,
  parseFeed,
} from "./news-feeds";

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

/** Google News's search for one keyword: Kenya's edition, the last seven days. */
export async function googleNewsSearch(query: string): Promise<NewsHit[]> {
  const q = new URLSearchParams({
    q: `${query} when:7d`.slice(0, 300),
    hl: "en-KE",
    gl: "KE",
    ceid: "KE:en",
  });
  return googleNewsStories(await getFeed(`https://news.google.com/rss/search?${q}`, 20_000));
}
