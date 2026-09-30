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
