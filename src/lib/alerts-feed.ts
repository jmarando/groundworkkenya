// Google Alerts has no API, but each alert can be delivered as an Atom feed. A
// keyword may carry its feed link, and the hourly sweep reads it beside the web
// search. Only Google's own feed links are accepted, here and in the database.

/** https://www.google.com/alerts/feeds/<user>/<alert>, nothing more. */
export const ALERT_FEED =
  /^https:\/\/www\.google\.com\/alerts\/feeds\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export function cleanAlertFeed(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!ALERT_FEED.test(v))
    throw new Error(
      "Paste the feed link from Google Alerts: it starts with https://www.google.com/alerts/feeds/.",
    );
  return v;
}

export type AlertEntry = {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const code =
        e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text from the feed's HTML: entities decoded (twice, as Google nests them) and tags dropped. */
const plain = (html: string) =>
  decode(decode(html).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** The article behind Google's redirect link; null when it is not a web link. */
export function realLink(href: string): string | null {
  try {
    const u = new URL(href);
    const target =
      u.hostname === "www.google.com" && u.pathname === "/url" ? u.searchParams.get("url") : href;
    if (!target) return null;
    const t = new URL(target);
    return t.protocol === "https:" || t.protocol === "http:" ? t.toString() : null;
  } catch {
    return null;
  }
}

/** The entries of a Google Alerts feed, as mentions to store. */
export function parseAlertFeed(xml: string): AlertEntry[] {
  const out: AlertEntry[] = [];
  for (const [, body = ""] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const href = /<link[^>]*href="([^"]+)"/.exec(body)?.[1];
    const url = href ? realLink(decode(href)) : null;
    if (!url) continue;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1];
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(body)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(body)?.[1];
    out.push({
      url,
      title: title ? plain(title).slice(0, 300) || null : null,
      snippet: content ? plain(content).slice(0, 1200) || null : null,
      publishedAt:
        published && !Number.isNaN(Date.parse(published))
          ? new Date(published).toISOString()
          : null,
    });
  }
  return out;
}
