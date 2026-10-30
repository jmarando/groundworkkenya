// Kenyan outlets' own news feeds: free, no key, published for readers to follow. Each holds only
// the latest stories (Tuko's about two hours), so the hourly sweep reads every feed once and
// matches each story against every keyword the way a search reads it: every word of the search
// in the headline or summary (filler such as "news" or "county" left out; quoted phrases and OR
// as written), one of the keyword's extra words when it has any, and none of the words it leaves
// out. Pure: src/lib/listening.server.ts fetches.

import { plain, realLink } from "./alerts-feed";

/** The feeds read every hour; each answered with stories when checked on 30 October 2026. */
export const OUTLET_FEEDS: { outlet: string; url: string }[] = [
  { outlet: "The Standard", url: "https://www.standardmedia.co.ke/rss/headlines.php" },
  { outlet: "The Standard", url: "https://www.standardmedia.co.ke/rss/kenya.php" },
  { outlet: "The Standard", url: "https://www.standardmedia.co.ke/rss/politics.php" },
  { outlet: "Nation", url: "https://nation.africa/kenya/rss.xml" },
  { outlet: "Business Daily", url: "https://www.businessdailyafrica.com/bd/rss.xml" },
  { outlet: "Capital FM", url: "https://www.capitalfm.co.ke/news/feed/" },
  { outlet: "Capital FM", url: "https://www.capitalfm.co.ke/news/category/politics/feed/" },
  { outlet: "Kenyans.co.ke", url: "https://www.kenyans.co.ke/feeds/news" },
  { outlet: "Tuko", url: "https://www.tuko.co.ke/rss/all.rss" },
  { outlet: "Tuko", url: "https://www.tuko.co.ke/rss/politics.rss" },
  { outlet: "People Daily", url: "https://www.peopledaily.digital/rss" },
  { outlet: "Kenya News Agency", url: "https://www.kenyanews.go.ke/feed/" },
  { outlet: "Eastleigh Voice", url: "https://eastleighvoice.co.ke/feed" },
  { outlet: "Nairobi Leo", url: "https://nairobileo.co.ke/feed" },
  { outlet: "The Kenya Times", url: "https://thekenyatimes.com/feed/" },
];

export type FeedStory = {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
};

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What one element holds, CDATA unwrapped; null when the item has no such element. */
function element(body: string, name: string): string | null {
  const m = new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`).exec(body);
  if (!m) return null;
  return (m[1] ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
}

const when = (raw: string | null) => {
  const t = raw ? Date.parse(raw.trim()) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** The stories of an RSS or Atom feed, each at the article's own web address. */
export function parseFeed(xml: string): FeedStory[] {
  const out: FeedStory[] = [];
  for (const [body = ""] of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)) {
    const href =
      element(body, "link")?.trim() ||
      /<link[^>]*href="([^"]+)"/.exec(body)?.[1] ||
      element(body, "guid")?.trim() ||
      "";
    const url = href ? realLink(plain(href)) : null;
    if (!url) continue;
    const title = element(body, "title");
    const summary =
      element(body, "description") ?? element(body, "summary") ?? element(body, "content:encoded");
    out.push({
      url,
      title: title ? plain(title).slice(0, 300) || null : null,
      snippet: summary ? plain(summary).slice(0, 1200) || null : null,
      publishedAt: when(
        element(body, "pubDate") ??
          element(body, "dc:date") ??
          element(body, "published") ??
          element(body, "updated"),
      ),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- matching */

/**
 * A keyword's search, read once: groups that must all be in the story (any word of a group will
 * do), extra words of which one must be, and words that rule the story out.
 */
export type Search = { all: string[][]; any: string[]; none: string[] };

/** Words a search leaves out when it reads a headline: they say little about the story. */
const FILLER = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "constituency",
  "county",
  "for",
  "from",
  "government",
  "in",
  "latest",
  "new",
  "news",
  "of",
  "on",
  "the",
  "to",
  "today",
  "update",
  "updates",
  "ward",
  "with",
]);

/**
 * Lower case, accents and apostrophes gone, anything else that isn't a letter or digit a space. A
 * possessive reads as the name itself ("Sakaja's" as "sakaja"), so headlines about someone's
 * allies or plans still find them.
 */
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘`´]s(?![\p{L}\p{N}])/gu, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How a keyword reads: its search as written ("quoted phrases", OR, -left out), its extras and exclusions. */
export function searchFor(topic: {
  query?: string | null;
  label?: string | null;
  keywords?: string[] | null;
  exclude_terms?: string[] | null;
}): Search {
  const all: string[][] = [];
  const none: string[] = [];
  let or = false;
  let kept = false;
  for (const m of String(topic.query || topic.label || "").matchAll(/(-?)"([^"]*)"|(\S+)/g)) {
    const quoted = m[2] !== undefined;
    const word = m[3] ?? "";
    if (!quoted && word === "OR") {
      or = kept;
      continue;
    }
    const negative = m[1] === "-" || (!quoted && word.length > 1 && word.startsWith("-"));
    const term = fold(quoted ? (m[2] ?? "") : word.replace(/^-/, ""));
    if (!term || negative) {
      if (term) none.push(term);
      or = kept = false;
      continue;
    }
    if (!quoted && !or && FILLER.has(term)) {
      kept = false;
      continue;
    }
    if (or) all[all.length - 1]!.push(term);
    else all.push([term]);
    or = false;
    kept = true;
  }
  const words = (list: string[] | null | undefined) => (list ?? []).map(fold).filter(Boolean);
  return { all, any: words(topic.keywords), none: [...none, ...words(topic.exclude_terms)] };
}

/** Whether a story's headline and summary answer the search. A search with no words matches nothing. */
export function matchesSearch(text: string, s: Search): boolean {
  return answers(` ${fold(text)} `, s);
}

/** As matchesSearch, for text already folded with a space at each end. */
function answers(hay: string, s: Search): boolean {
  if (!s.all.length && !s.any.length) return false;
  const has = (w: string) => hay.includes(` ${w} `);
  return !s.none.some(has) && s.all.every((g) => g.some(has)) && (!s.any.length || s.any.some(has));
}

/**
 * Every story folded once, then each keyword set against them all. The hourly pass sets every
 * story against every keyword; folding a story again for each keyword was most of its CPU, and
 * the host stops a sweep that uses too much (Cloudflare's error 1102, 30 October 2026).
 */
export function storyMatcher<T extends FeedStory>(stories: T[]) {
  const folded = stories.map((s) => ({
    s,
    hay: ` ${fold(`${s.title ?? ""} ${s.snippet ?? ""}`)} `,
  }));
  return (topic: Parameters<typeof searchFor>[0]): T[] => {
    const search = searchFor(topic);
    return folded.filter((f) => answers(f.hay, search)).map((f) => f.s);
  };
}

/** The stories that answer one keyword's search. */
export function storiesFor<T extends FeedStory>(
  topic: Parameters<typeof searchFor>[0],
  stories: T[],
): T[] {
  return storyMatcher(stories)(topic);
}

/** Stories published in the last `days` days, and any that carry no date. */
export const recent = <T extends { publishedAt: string | null }>(
  stories: T[],
  days: number,
  now = Date.now(),
): T[] =>
  stories.filter((s) => !s.publishedAt || Date.parse(s.publishedAt) >= now - days * 86_400_000);

/** The same story under two addresses reads the same here: its headline, folded and cut short. */
export const titleKey = (title: string | null): string => (title ? fold(title).slice(0, 120) : "");

/* ---------------------------------------------------------------- Google News */

/** A story from Google News's search feed: the headline without its " - Outlet" tail, and the outlet's own site. */
export type NewsHit = FeedStory & { outlet: string | null; domain: string | null };

/**
 * The stories of a Google News search feed. Its links are Google's own (they lead on to the
 * article) and it carries no summary; the outlet and its site come from `source`.
 */
export function googleNewsStories(xml: string): NewsHit[] {
  const out: NewsHit[] = [];
  for (const [body = ""] of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const link = element(body, "link")?.trim();
    const url = link ? realLink(plain(link)) : null;
    if (!url) continue;
    const outletRaw = element(body, "source");
    const outlet = outletRaw ? plain(outletRaw).slice(0, 80) || null : null;
    const site = /<source[^>]*\surl="([^"]+)"/.exec(body)?.[1];
    let domain: string | null = null;
    try {
      domain = site ? new URL(plain(site)).hostname.replace(/^www\./, "") : null;
    } catch {
      domain = null;
    }
    const titleRaw = element(body, "title");
    let title = titleRaw ? plain(titleRaw) : "";
    if (outlet && title.endsWith(` - ${outlet}`))
      title = title.slice(0, -(outlet.length + 3)).trim();
    out.push({
      url,
      title: title.slice(0, 300) || null,
      snippet: null,
      publishedAt: when(element(body, "pubDate")),
      outlet,
      domain,
    });
  }
  return out;
}
