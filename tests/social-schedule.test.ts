// Checks for when the social keyword search (TikTok, Reddit, YouTube through ScrapeCreators) runs:
// every six hours, not every hour, so the day's credits last the day, with a share of the day's
// budget for each run. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/social-schedule.test.ts

import { SOCIAL_EVERY_MS, socialPlan } from "@/lib/social-schedule";

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

const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-31T09:07:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const plan = (o: Partial<Parameters<typeof socialPlan>[0]> = {}) =>
  socialPlan({ lastRunAt: null, now: NOW, dailyCredits: 60, topics: 6, ...o });

// ---- the first search, and the next
eq("never searched: it is due", plan().due, true);
eq("an hour after a search: not due", plan({ lastRunAt: ago(HOUR) }).due, false);
eq("five hours after: not yet", plan({ lastRunAt: ago(5 * HOUR) }).due, false);
eq(
  "six hours after the hourly sweep that searched: due again",
  plan({ lastRunAt: ago(6 * HOUR) }).due,
  true,
);
eq(
  "a sweep a few minutes late still keeps the six-hour rhythm",
  plan({ lastRunAt: ago(6 * HOUR - 10 * 60_000) }).due,
  true,
);
eq(
  "the rhythm is just under six hours, so an hourly sweep never skips one",
  SOCIAL_EVERY_MS < 6 * HOUR,
  true,
);
eq("and not much under", SOCIAL_EVERY_MS > 5 * HOUR, true);
eq("a record that cannot be read: due", plan({ lastRunAt: "not a time" }).due, true);
eq(
  "a record from the future (a clock slip): due, not stuck",
  plan({ lastRunAt: ago(-3 * HOUR) }).due,
  true,
);

// ---- when it is next
eq(
  "not due says when it will be",
  plan({ lastRunAt: ago(2 * HOUR) }).nextAt,
  new Date(NOW - 2 * HOUR + SOCIAL_EVERY_MS).toISOString(),
);
eq("due says nothing of a next time", plan().nextAt, null);

// ---- the day's credits are shared among the day's four runs
eq("60 credits: five keywords a run (15 credits)", plan({ dailyCredits: 60, topics: 6 }).topics, 5);
eq("never more than the sweep has", plan({ dailyCredits: 60, topics: 3 }).topics, 3);
eq("25 credits: two keywords", plan({ dailyCredits: 25 }).topics, 2);
eq("a small budget still searches one keyword a run", plan({ dailyCredits: 5 }).topics, 1);
eq("a budget under one search buys nothing", plan({ dailyCredits: 2 }).topics, 0);
eq(
  "a budget of none: nothing, and not due either",
  [plan({ dailyCredits: 0 }).due, plan({ dailyCredits: 0 }).topics],
  [false, 0],
);
eq("not due: no keywords", plan({ lastRunAt: ago(HOUR) }).topics, 0);

// ---- "Sweep now"
eq(
  "a person pressing Sweep now is not made to wait, and gets every keyword the sweep has",
  [
    plan({ lastRunAt: ago(HOUR), force: true }).due,
    plan({ lastRunAt: ago(HOUR), force: true }).topics,
  ],
  [true, 6],
);
eq("though a budget of none still means none", plan({ dailyCredits: 0, force: true }).topics, 0);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
