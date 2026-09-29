// Checks for Home: which sections are real, the Today list, the verdict line,
// and loading the real signals under the user's own access. Uses a stand-in
// database; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/home.test.ts

import { getScenario } from "@/lib/demo";
import type { Scenario } from "@/lib/demo/types";
import {
  greetingName,
  raceVerdict,
  realToday,
  sectionModes,
  todayItems,
  topIssue,
} from "@/lib/home";
import { loadHome } from "@/lib/home.functions";

import { fakeSupabase } from "./fake-supabase";

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

// ---------------------------------------------------------------- sections

eq("no data: both sample", sectionModes({ realPeople: 0, rivals: 0, polls: 0 }), {
  race: "sample",
  campaign: "sample",
});
eq(
  "a poll on record makes the race real",
  sectionModes({ realPeople: 0, rivals: 0, polls: 1 }).race,
  "real",
);
eq("a rival on record too", sectionModes({ realPeople: 0, rivals: 1, polls: 0 }).race, "real");
eq(
  "one real person makes the campaign real",
  sectionModes({ realPeople: 1, rivals: 0, polls: 0 }).campaign,
  "real",
);

// ---------------------------------------------------------------- today

{
  const items = realToday({
    pendingExpenses: 2,
    unread: 1,
    topIssue: { label: "Floods", count: 14, angry: 9 },
  });
  eq(
    "expenses to approve",
    [items[0]?.title, items[0]?.action],
    ["2 expenses to approve", { kind: "go", label: "Open Finance", to: "/finance" }],
  );
  eq(
    "one person waiting",
    [items[1]?.title, items[1]?.action],
    ["1 person waiting for a reply", { kind: "go", label: "Open the inbox", to: "/inbox" }],
  );
  eq(
    "the loudest issue",
    [items[2]?.title, items[2]?.detail, items[2]?.action],
    [
      "Floods is the loudest issue this week",
      "14 mentions in seven days, 9 of them angry.",
      { kind: "go", label: "See what's said", to: "/listening" },
    ],
  );
  eq(
    "real items are not samples",
    items.every((i) => !i.sample),
    true,
  );
  eq(
    "nothing waiting, nothing listed",
    realToday({ pendingExpenses: 0, unread: 0, topIssue: null }),
    [],
  );
  eq(
    "one expense, several people",
    realToday({ pendingExpenses: 1, unread: 3, topIssue: null }).map((i) => i.title),
    ["1 expense to approve", "3 people waiting for a reply"],
  );
}
{
  const sample: Scenario["today"] = getScenario("sakaja").today;
  const real = realToday({ pendingExpenses: 1, unread: 0, topIssue: null });
  const items = todayItems(real, sample);
  eq("at most three", items.length, 3);
  eq("real first", [items[0]?.title, items[0]?.sample], ["1 expense to approve", false]);
  eq("then samples, marked", [items[1]?.title, items[1]?.sample], [sample[0]?.title, true]);
  eq(
    "all sample when nothing is real",
    todayItems([], sample).every((i) => i.sample),
    true,
  );
  eq(
    "real items can fill it",
    todayItems(
      realToday({
        pendingExpenses: 1,
        unread: 2,
        topIssue: { label: "Water", count: 5, angry: 0 },
      }),
      sample,
    ).every((i) => !i.sample),
    true,
  );
}

// ---------------------------------------------------------------- issues

eq(
  "counts by issue, ignoring case and blanks",
  topIssue([
    { issue: "Floods", sentiment: "negative" },
    { issue: "floods", sentiment: "neutral" },
    { issue: " FLOODS ", sentiment: "negative" },
    { issue: "Water", sentiment: "negative" },
    { issue: null, sentiment: "negative" },
    { issue: "", sentiment: "negative" },
  ]),
  { label: "Floods", count: 3, angry: 2 },
);
eq(
  "below three mentions, nothing",
  topIssue([
    { issue: "Water", sentiment: null },
    { issue: "Water", sentiment: null },
  ]),
  null,
);
// The listening classifier files what it cannot place as "general", and news
// about the campaign itself as "campaign": neither is an issue voters raise.
eq(
  "the classifier's catch-alls are not issues",
  topIssue([
    ...Array.from({ length: 5 }, () => ({ issue: "general", sentiment: "negative" })),
    ...Array.from({ length: 4 }, () => ({ issue: "campaign", sentiment: null })),
    { issue: "water", sentiment: "negative" },
    { issue: "water", sentiment: null },
    { issue: "water", sentiment: null },
  ]),
  { label: "Water", count: 3, angry: 1 },
);
eq(
  "only catch-alls, nothing",
  topIssue(Array.from({ length: 6 }, () => ({ issue: "General", sentiment: null }))),
  null,
);

// ---------------------------------------------------------------- names

eq("first name", greetingName("Njeri Kamau", "Johnson"), "Njeri");
eq("blank falls back", greetingName("  ", "Johnson"), "Johnson");
eq("missing falls back", greetingName(null, "Johnson"), "Johnson");

// ---------------------------------------------------------------- verdict

eq("leading", raceVerdict(getScenario("sakaja")), "Leading Challenger A by 3.0 points.");
{
  const s = structuredClone(getScenario("mathira"));
  s.polls.average.push({ week: "2 Oct", shares: { us: 30, a: 34.5, b: 9, undecided: 26.5 } });
  eq("second", raceVerdict(s), "Second, 4.5 points behind Challenger A.");
  s.polls.average.push({ week: "9 Oct", shares: { us: 8, a: 34, b: 30 } });
  eq("third", raceVerdict(s), "Third, 26.0 points behind Challenger A.");
  s.polls.average = [];
  eq("no polls, no verdict", raceVerdict(s), "");
}

// ---------------------------------------------------------------- loading

const ME = "user-1";
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 864e5).toISOString();

function db(extra: Record<string, Record<string, unknown>[]> = {}) {
  return fakeSupabase({
    profiles: [{ user_id: ME, full_name: "Njeri Kamau" }],
    people: [
      { id: "p1", phone: "+254711000001", tags: ["sample"] },
      { id: "p2", phone: "+254711000002", tags: [] },
      { id: "p3", phone: "+254711000003", tags: ["Volunteer", "sample"] },
    ],
    expenses: [
      { id: "e1", status: "pending" },
      { id: "e2", status: "approved" },
      { id: "e3", status: "pending" },
    ],
    conversations: [
      { id: "c1", unread: true },
      { id: "c2", unread: false },
    ],
    listening_mentions: [
      { id: "m1", issue: "Floods", sentiment: "negative", found_at: daysAgo(1) },
      { id: "m2", issue: "Floods", sentiment: "neutral", found_at: daysAgo(2) },
      { id: "m3", issue: "Floods", sentiment: "negative", found_at: daysAgo(3) },
      { id: "m4", issue: "Floods", sentiment: "negative", found_at: daysAgo(9) },
      { id: "m5", issue: "Water", sentiment: "negative", found_at: daysAgo(1) },
    ],
    ...extra,
  });
}

async function main() {
  {
    const h = await loadHome(db() as never, ME, "manager");
    eq("the signed-in person's name", h.firstName, "Njeri Kamau");
    eq("sample people are not counted as real", h.facts.realPeople, 1);
    eq("race data comes with part 2", [h.facts.rivals, h.facts.polls], [0, 0]);
    eq("a manager sees expenses to approve", h.signals.pendingExpenses, 2);
    eq("unread conversations", h.signals.unread, 1);
    eq("the week's loudest issue, older mentions ignored", h.signals.topIssue, {
      label: "Floods",
      count: 3,
      angry: 2,
    });
  }
  {
    const h = await loadHome(db() as never, ME, "organiser");
    eq("an organiser cannot approve, so is not asked", h.signals.pendingExpenses, 0);
  }
  {
    const h = await loadHome(db({ profiles: [] }) as never, ME, "candidate");
    eq("no profile, no name", h.firstName, null);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
