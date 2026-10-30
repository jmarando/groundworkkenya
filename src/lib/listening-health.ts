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

/** The AI is what stops a sweep now ("AI stopped (429): …", "AI is not configured."). */
function aiStopped(reason: string, code: string | undefined): Problem {
  const base = { title: "Sweeping has stopped", detail: reason, restart: true };
  if (/not configured/i.test(reason))
    return {
      ...base,
      key: "ai-unconnected",
      why: "The AI isn't connected, so new posts can't be read.",
      fix: "Add the Gemini key (GEMINI_API_KEY) to Groundwork's secrets in Lovable, then restart sweeping.",
    };
  if (code === "429" || code === "402")
    return {
      ...base,
      key: "ai-limited",
      why: "The AI service's limit, or this month's spending cap, has been reached, so new posts can't be read.",
      fix: "Check the usage and the cap in Google AI Studio, then restart sweeping.",
    };
  if (code === "400" || code === "401" || code === "403")
    return {
      ...base,
      key: "ai-refused",
      why: "Google's AI service turned the request down: the key may be wrong, expired or switched off.",
      fix: "Check GEMINI_API_KEY in Groundwork's secrets in Lovable, then restart sweeping.",
    };
  return {
    ...base,
    key: "ai-stopped",
    why: "Something went wrong with the AI, so new posts can't be read.",
    fix: "Fix the cause, then restart sweeping.",
  };
}

function stopped(reason: string | null): Problem {
  const base = { title: "Sweeping has stopped", detail: reason, restart: true };
  const code = /\((\d{3})\)/.exec(reason ?? "")?.[1];
  if (/^AI (stopped|is not configured)/i.test(reason ?? "")) return aiStopped(reason ?? "", code);
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
