// Checks for what Listening says when sweeping has stopped or a service can't be read: the raw
// reasons the sweeps record, said as what is wrong and what to do.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening-health.test.ts

import { sweepProblems } from "@/lib/listening-health";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const keys = (input: Parameters<typeof sweepProblems>[0]) => sweepProblems(input).map((p) => p.key);
const paused = (pausedReason: string | null) => ({
  job: { status: "paused", pausedReason, detail: null },
  rivalJob: null,
});

eq("nothing recorded, nothing said", sweepProblems({ job: null, rivalJob: null }), []);
eq(
  "a healthy sweep says nothing",
  sweepProblems({
    job: { status: "idle", pausedReason: null, detail: "2 keywords could not be searched." },
    rivalJob: { detail: "Read 6 accounts." },
  }),
  [],
);

// The words recorded on the live site when search credits ran out.
const live =
  'Web search stopped (402): {"status":402,"type":"payment_required","title":"Not enough credits","message":"Not enough credits","details":"","props":{"source":"connectors_gateway"},"request_id":"8e92e6816aab7';
const credits = sweepProblems(paused(live));
eq(
  "out of credits",
  credits.map((p) => p.key),
  ["search-credits"],
);
eq(
  "it says what is wrong, and what to do",
  [credits[0]!.title, credits[0]!.why, credits[0]!.fix],
  [
    "Sweeping has stopped",
    "The web search service says its credits have run out, so nothing new is coming in.",
    "Add credits to it, then restart sweeping.",
  ],
);
eq("the service's own words are kept for whoever looks into it", credits[0]!.detail, live);
eq("a stopped sweep can be restarted", credits[0]!.restart, true);
eq("credits, by words alone", keys(paused("Search said: Not enough credits")), ["search-credits"]);

eq("refused", keys(paused("Web search stopped (403): forbidden")), ["search-refused"]);
eq("limited", keys(paused("Web search stopped (429): slow down")), ["search-limited"]);
eq("not connected", keys(paused("Web search is not connected.")), ["search-unconnected"]);
eq("any other reason", keys(paused("Something odd")), ["search-stopped"]);
eq("no reason recorded", keys(paused(null)), ["search-stopped"]);
eq("no reason: no detail to show", sweepProblems(paused(null))[0]!.detail, null);

// The AI is what stops a sweep now: a limit reached, a key turned away, or no key at all.
eq(
  "the AI's limit or spending cap",
  keys(paused("AI stopped (429): RESOURCE_EXHAUSTED: Quota exceeded.")),
  ["ai-limited"],
);
eq(
  "a key the AI turns away",
  keys(paused("AI stopped (400): INVALID_ARGUMENT: API key not valid.")),
  ["ai-refused"],
);
eq(
  "permission refused",
  keys(paused("AI stopped (403): PERMISSION_DENIED: Billing is not enabled.")),
  ["ai-refused"],
);
eq("no key", keys(paused("AI is not configured.")), ["ai-unconnected"]);
eq("any other AI stop", keys(paused("AI stopped (500): upstream")), ["ai-stopped"]);
const noKey = sweepProblems(paused("AI is not configured."))[0]!;
eq(
  "it says what to do about the key",
  [noKey.why, noKey.fix, noKey.restart, noKey.detail],
  [
    "The AI isn't connected, so new posts can't be read.",
    "Add the Gemini key (GEMINI_API_KEY) to Groundwork's secrets in Lovable, then restart sweeping.",
    true,
    "AI is not configured.",
  ],
);

// ScrapeCreators running out is not a pause: the next sweep carries on once credits are back.
const social = (job: string | null, rival: string | null) => ({
  job: { status: "idle", pausedReason: null, detail: job },
  rivalJob: { detail: rival },
});
const s = sweepProblems(social("Social search skipped — ScrapeCreators is out of credits.", null));
eq(
  "social credits, seen in the sweep's notes",
  s.map((p) => p.key),
  ["social-credits"],
);
eq("no restart for it", s[0]!.restart, false);
eq(
  "said plainly",
  [s[0]!.title, s[0]!.fix],
  ["Social posts can't be read", "Add credits there. The next hourly sweep carries on by itself."],
);
eq(
  "social credits, seen in the candidates' own read",
  keys(social(null, "ScrapeCreators is out of credits.")),
  ["social-credits"],
);
eq(
  "seen in both, said once",
  keys(
    social(
      "Social search skipped — ScrapeCreators is out of credits.",
      "ScrapeCreators is out of credits.",
    ),
  ),
  ["social-credits"],
);

// Both at once: the stopped sweep first.
eq(
  "both",
  keys({
    job: { status: "paused", pausedReason: live, detail: "ScrapeCreators is out of credits." },
    rivalJob: null,
  }),
  ["search-credits", "social-credits"],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
