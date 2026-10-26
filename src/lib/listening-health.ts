// What Listening says when sweeping has stopped or a service can't be read. The sweeps record the
// service's own words ("Web search stopped (402): {…}"); this reads them and says what is wrong and
// what to do. The recorded text is left as it is: the hourly job reads its status code to decide
// when to try again. Pure.

export type Problem = {
  key: string;
  title: string;
  /** What is wrong, in a sentence. */
  why: string;
  /** What to do about it. */
  fix: string;
  /** The service's own words, for whoever has to look into it. */
  detail: string | null;
  /** Whether Restart is the way out (a paused sweep), rather than the next sweep carrying on. */
  restart: boolean;
};

type Job = { status: string; pausedReason: string | null; detail: string | null };

const OUT_OF_CREDITS = /scrapecreators is out of credits/i;

function stopped(reason: string | null): Problem {
  const base = { title: "Sweeping has stopped", detail: reason, restart: true };
  const code = /\((\d{3})\)/.exec(reason ?? "")?.[1];
  if (code === "402" || /payment_required|not enough credits/i.test(reason ?? ""))
    return {
      ...base,
      key: "search-credits",
      why: "The web search service says its credits have run out, so nothing new is coming in.",
      fix: "Add credits to it, then restart sweeping.",
    };
  if (code === "403")
    return {
      ...base,
      key: "search-refused",
      why: "The web search service refused the request, so nothing new is coming in.",
      fix: "Check that its connection is still switched on, then restart sweeping.",
    };
  if (code === "429")
    return {
      ...base,
      key: "search-limited",
      why: "The web search service is limiting how often it can be asked.",
      fix: "Wait a little, then restart sweeping.",
    };
  if (/not connected/i.test(reason ?? ""))
    return {
      ...base,
      key: "search-unconnected",
      why: "Web search isn't connected, so nothing new is coming in.",
      fix: "Connect it, then restart sweeping.",
    };
  return {
    ...base,
    key: "search-stopped",
    why: "Something went wrong with web search, so nothing new is coming in.",
    fix: "Fix the cause, then restart sweeping.",
  };
}

/** What needs attention before the page can be trusted, the stopped sweep first. Empty when well. */
export function sweepProblems(input: {
  job: Job | null;
  rivalJob: { detail: string | null } | null;
}): Problem[] {
  const out: Problem[] = [];
  if (input.job?.status === "paused") out.push(stopped(input.job.pausedReason));
  // Running out of ScrapeCreators credits pauses nothing: the next sweep carries on once they are back.
  if (OUT_OF_CREDITS.test(`${input.job?.detail ?? ""} ${input.rivalJob?.detail ?? ""}`))
    out.push({
      key: "social-credits",
      title: "Social posts can't be read",
      why: "ScrapeCreators, which reads TikTok, YouTube, Reddit, X and the candidates' own accounts, is out of credits.",
      fix: "Add credits there. The next hourly sweep carries on by itself.",
      detail: null,
      restart: false,
    });
  return out;
}
