// ScrapeCreators credits are shared by every campaign, because the key is.
// Each request comes out of a daily budget: "rivals" for the daily rival sweep,
// "keywords" for the hourly keyword search. "trends" counts SerpApi's Google
// Trends searches: 8 a day keeps a month under the free plan's 250. The
// database keeps the count.

type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type Budget = "rivals" | "keywords" | "trends";
export const DEFAULT_DAILY_CREDITS = 60;

const ENV: Record<Budget, string> = {
  rivals: "SCRAPECREATORS_DAILY_CREDITS",
  keywords: "SCRAPECREATORS_KEYWORD_DAILY_CREDITS",
  trends: "SERPAPI_DAILY_SEARCHES",
};

const DEFAULTS: Record<Budget, number> = {
  rivals: DEFAULT_DAILY_CREDITS,
  keywords: DEFAULT_DAILY_CREDITS,
  trends: 8,
};

/** The day's limit for a budget, from its environment variable, else its default. */
export function dailyCredits(budget: Budget): number {
  const raw = process.env[ENV[budget]];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n >= 0
    ? n
    : DEFAULTS[budget];
}

/** Take n credits from today's budget; false past the limit or when the count can't be kept. */
export async function takeCredits(sb: Rpc, budget: Budget, n: number): Promise<boolean> {
  const { data, error } = await sb.rpc("take_social_credits", {
    _budget: budget,
    _n: n,
    _cap: dailyCredits(budget),
  });
  return !error && data === true;
}
