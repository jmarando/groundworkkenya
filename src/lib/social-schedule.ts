// When the social keyword search runs: TikTok, Reddit and YouTube through ScrapeCreators, which costs
// a credit a search from a daily budget. The sweep itself is hourly, because the free news feeds
// and the news search are cheap; this paid lane runs every six hours, four times a day, each run
// with a share of the day's budget, so the credits last the whole day instead of the first few
// hours after midnight. Pure.

const HOUR = 3_600_000;

/** Credits one keyword costs: a TikTok, a Reddit and a YouTube search. */
export const CREDITS_PER_KEYWORD = 3;
export const SOCIAL_RUNS_PER_DAY = 4;

/**
 * Just under six hours, so an hourly sweep that starts a little late still lands on the
 * six-hour rhythm instead of slipping to seven.
 */
export const SOCIAL_EVERY_MS = 6 * HOUR - 15 * 60_000;

export type SocialPlan = {
  /** The paid search runs in this sweep. */
  due: boolean;
  /** How many of the sweep's keywords it searches. */
  topics: number;
  /** When it will next be due, when it is not due now. */
  nextAt: string | null;
};

export function socialPlan(o: {
  /** When the paid search last ran; null when it never has. */
  lastRunAt: string | null;
  now: number;
  /** Today's budget for it, in credits. */
  dailyCredits: number;
  /** Keywords this sweep covers. */
  topics: number;
  /** "Sweep now": a person asked, so there is no wait. */
  force?: boolean;
}): SocialPlan {
  // One run's share of the day: four runs, three credits a keyword. A small budget still buys one
  // keyword a run; one that cannot buy a single search buys none.
  const share =
    o.dailyCredits < CREDITS_PER_KEYWORD
      ? 0
      : Math.max(1, Math.floor(o.dailyCredits / SOCIAL_RUNS_PER_DAY / CREDITS_PER_KEYWORD));
  if (share === 0) return { due: false, topics: 0, nextAt: null };

  const last = o.lastRunAt ? Date.parse(o.lastRunAt) : NaN;
  const elapsed = o.now - last;
  // A record that cannot be read, or that is in the future, never holds the search off.
  const due =
    o.force === true || Number.isNaN(elapsed) || elapsed < 0 || elapsed >= SOCIAL_EVERY_MS;
  if (!due)
    return { due: false, topics: 0, nextAt: new Date(last + SOCIAL_EVERY_MS).toISOString() };
  return {
    due: true,
    topics: o.force === true ? o.topics : Math.min(o.topics, share),
    nextAt: null,
  };
}
