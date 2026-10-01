// Google Trends through SerpApi (server only): interest over the past 30 days
// for up to five terms. Each request is one search on the SerpApi plan; the
// caller takes it from the day's "trends" budget first.

import type { Geo } from "@/lib/search-interest";

export class SerpApiError extends Error {}

const SERP = "https://serpapi.com/search.json";

export const serpConfigured = (): boolean => Boolean(process.env["SERPAPI_API_KEY"]);

/** SerpApi's Google Trends answer for `terms` in `geo`, by Nairobi's days. */
export async function trendsAnswer(terms: string[], geo: Geo): Promise<unknown> {
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) throw new SerpApiError("SerpApi is not connected.");
  const params = new URLSearchParams({
    engine: "google_trends",
    // Terms are comma-separated, so a comma inside one becomes a space.
    q: terms
      .slice(0, 5)
      .map((t) => t.replace(/,/g, " ").trim())
      .join(","),
    geo,
    date: "today 1-m",
    data_type: "TIMESERIES",
    tz: "-180",
    api_key: key,
  });
  const res = await fetch(`${SERP}?${params}`);
  const body: unknown = await res.json().catch(() => null);
  const error =
    body && typeof body === "object" ? (body as Record<string, unknown>)["error"] : null;
  if (!res.ok || !body || error) {
    throw new SerpApiError(
      typeof error === "string" ? error.slice(0, 160) : `SerpApi answered ${res.status}.`,
    );
  }
  return body;
}
