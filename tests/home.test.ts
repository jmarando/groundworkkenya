// Checks for Home: which sections are real, the Today list, the verdict line,
// and loading the real signals under the user's own access. Uses a stand-in
// database; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/home.test.ts

import { getScenario } from "@/lib/demo";
import { nairobiToday } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";
import { addDays } from "@/lib/diary";
import {
  greetingName,
  issueBoard,
  nextStopItem,
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
      { kind: "issue", label: "See what's said", issue: "floods" },
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
eq(
  "the next stop leads Today",
  nextStopItem({
    id: "d1",
    day: "2026-10-05",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: "w1",
    wardName: "Kayole North",
    note: null,
  }),
  {
    title: "Next: Kayole water point, 10:30",
    detail: "Visit · Kayole North",
    action: { kind: "go", label: "Open the diary", to: "/diary" },
    sample: false,
  },
);
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
{
  const items = realToday({
    pendingExpenses: 0,
    unread: 0,
    topIssue: null,
    rivalMove: {
      title: "James Gakuya up 3.8 points in Mizani Africa's latest poll",
      detail: "From 11.2% in Jul 2026 to 15% in Aug 2026.",
    },
  });
  eq(
    "a rival's move, with a jump to the race",
    [items[0]?.title, items[0]?.action, items[0]?.sample],
    [
      "James Gakuya up 3.8 points in Mizani Africa's latest poll",
      { kind: "jump", label: "See the race", to: "#race" },
      false,
    ],
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
{
  const at = (d: number) => new Date(Date.UTC(2026, 8, 29 - d)).toISOString();
  const board = issueBoard([
    {
      issue: "water",
      sentiment: "negative",
      title: "Taps dry in Kayole",
      url: "https://a.test/1",
      found_at: at(1),
    },
    {
      issue: "Water",
      sentiment: null,
      title: "Bowser timetable out",
      url: "https://a.test/2",
      found_at: at(3),
    },
    {
      issue: "water",
      sentiment: "negative",
      title: " Rationing extended in 14 wards ",
      url: null,
      found_at: at(0),
    },
    {
      issue: "floods",
      sentiment: "negative",
      title: "Drains blocked on Jogoo Road",
      url: "https://a.test/4",
      found_at: at(2),
    },
    {
      issue: "general",
      sentiment: null,
      title: "Weekend roundup",
      url: "https://a.test/5",
      found_at: at(1),
    },
    {
      issue: "campaign",
      sentiment: null,
      title: "Rally on Saturday",
      url: "https://a.test/6",
      found_at: at(1),
    },
    { issue: "floods", sentiment: null, title: null, url: "https://a.test/7", found_at: at(4) },
  ]);
  eq(
    "issues by volume, catch-alls left out",
    board.map((b) => [b.key, b.label, b.count, b.angry]),
    [
      ["water", "Water", 3, 2],
      ["floods", "Floods", 2, 1],
    ],
  );
  eq("the latest two lines, trimmed", board[0]?.examples, [
    { text: "Rationing extended in 14 wards", url: null },
    { text: "Taps dry in Kayole", url: "https://a.test/1" },
  ]);
  eq(
    "at most five",
    issueBoard(
      ["a1", "b1", "c1", "d1", "e1", "f1"].map((i) => ({
        issue: i,
        sentiment: null,
        title: null,
        url: null,
        found_at: at(0),
      })),
    ).length,
    5,
  );
}

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

// Babu Owino's own posts, as the rival sweep keeps them: mood and issue from
// the classifier, and for the video how its comments landed.
const babuPost = (n: number, source: string, days: number, reach: number) => ({
  rival_id: "b",
  source,
  url: `https://www.tiktok.com/@he.babuowino/video/${n}`,
  title: `Post ${n}`,
  published_at: daysAgo(days),
  found_at: daysAgo(days),
  reach,
  issue: "water",
  sentiment: "negative",
  comments_read: null,
  comments_positive: null,
  comments_negative: null,
  comments_issue: null,
});
const BABU_POSTS = [
  { ...babuPost(1, "x", 1, 2020), url: "https://x.com/HEBabuOwino/status/1" },
  {
    ...babuPost(2, "tiktok", 2, 13200),
    comments_read: 50,
    comments_positive: 12,
    comments_negative: 31,
    comments_issue: "water",
  },
];

async function main() {
  {
    const h = await loadHome(db() as never, ME, "manager");
    eq("the signed-in person's name", h.firstName, "Njeri Kamau");
    eq("sample people are not counted as real", h.facts.realPeople, 1);
    eq("no race on record, no race facts", [h.facts.rivals, h.facts.polls], [0, 0]);
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
  {
    const today = nairobiToday();
    const diaryRow = (id: string, day: string, kind = "visit") => ({
      id,
      campaign_id: "c2",
      day,
      starts_at: "10:30:00",
      title: id,
      kind,
      ward_id: null,
      note: null,
    });
    const h = await loadHome(
      db({
        diary_entries: [
          diaryRow("today", today),
          diaryRow("in-two-days", addDays(today, 2), "watch"),
          diaryRow("too-far", addDays(today, 5)),
          diaryRow("yesterday", addDays(today, -1)),
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq(
      "the diary from today through the next two days",
      h.diary.map((e) => e.id),
      ["today", "in-two-days"],
    );
  }
  {
    const rival = (id: string, name: string, tone: string, sort: number, isUs = false) => ({
      id,
      name,
      party: null,
      office: null,
      is_us: isUs,
      tone,
      sort,
      facebook: null,
      x: null,
      tiktok: null,
    });
    const race = {
      race_rivals: [
        rival("s", "Johnson Sakaja", "us", 0, true),
        rival("g", "James Gakuya", "c", 3),
        rival("b", "Babu Owino", "a", 1),
      ],
      race_polls: [
        {
          id: "mj",
          pollster: "Mizani Africa",
          fieldwork_from: null,
          fieldwork_to: null,
          published_on: "2026-07-01",
          sample_size: null,
          margin: null,
          source_url: "https://a.test/mj",
          shares: [
            { name: "Babu Owino", share: 27.1, rival_id: "b" },
            { name: "Johnson Sakaja", share: 19.9, rival_id: "s" },
            { name: "James Gakuya", share: 11.2, rival_id: "g" },
          ],
          undecided: 13.3,
          approval: null,
          disapproval: null,
        },
        {
          id: "ma",
          pollster: "Mizani Africa",
          fieldwork_from: "2026-08-21",
          fieldwork_to: "2026-08-28",
          published_on: "2026-09-10",
          sample_size: 1820,
          margin: 2.3,
          source_url: "https://a.test/ma",
          shares: [
            { name: "Babu Owino", share: 28.4, rival_id: "b" },
            { name: "Johnson Sakaja", share: 17, rival_id: "s" },
            { name: "James Gakuya", share: 15, rival_id: "g" },
          ],
          undecided: 8.1,
          approval: null,
          disapproval: null,
        },
      ],
    };
    const h = await loadHome(
      db({
        listening_mentions: [
          {
            issue: "water",
            sentiment: "negative",
            title: "Taps dry",
            url: "https://a.test/1",
            found_at: daysAgo(2),
          },
          {
            issue: "water",
            sentiment: "negative",
            title: "Rationing",
            url: "https://a.test/2",
            found_at: daysAgo(3),
          },
          {
            issue: "water",
            sentiment: null,
            title: "Bowsers",
            url: "https://a.test/3",
            found_at: daysAgo(5),
          },
          {
            issue: "floods",
            sentiment: null,
            title: "Drains",
            url: "https://a.test/4",
            found_at: daysAgo(20),
          },
          {
            issue: "floods",
            sentiment: null,
            title: "Too old",
            url: "https://a.test/5",
            found_at: daysAgo(40),
          },
          ...BABU_POSTS,
        ],
        ...race,
      }) as never,
      ME,
      "organiser",
      "2026-09-29",
    );
    eq("race facts", [h.facts.rivals, h.facts.polls], [3, 2]);
    eq(
      "the race, ours first then in order",
      h.race.rivals.map((r) => r.id),
      ["s", "b", "g"],
    );
    eq(
      "polls newest first",
      h.race.polls.map((p) => p.id),
      ["ma", "mj"],
    );
    eq(
      "the rival's move",
      h.signals.rivalMove?.title,
      "James Gakuya up 3.8 points in Mizani Africa's latest poll",
    );
    eq(
      "rivals' own posts, newest first",
      h.race.posts.map((p) => [p.platform, p.rivalId, p.reach]),
      [
        ["x", "b", 2020],
        ["tiktok", "b", 13200],
      ],
    );
    eq("how the video landed", h.race.posts[1]?.landed, {
      read: 50,
      positive: 12,
      negative: 31,
      issue: "water",
    });
    eq("this week's loudest issue", h.signals.topIssue, { label: "Water", count: 3, angry: 2 });
    eq(
      "thirty days of what people say, rivals' own posts apart",
      h.race.issues.map((i) => [i.key, i.count]),
      [
        ["water", 3],
        ["floods", 1],
      ],
    );

    const spiking = await loadHome(
      db({
        listening_mentions: [
          babuPost(3, "tiktok", 0.5, 18400),
          babuPost(4, "tiktok", 5, 8000),
          babuPost(5, "tiktok", 9, 7900),
          babuPost(6, "tiktok", 14, 7000),
        ],
        ...race,
      }) as never,
      ME,
      "organiser",
      "2026-09-29",
    );
    eq(
      "a post drawing far more than usual beats a poll change",
      spiking.signals.rivalMove?.title,
      "Babu Owino's TikTok post is drawing 2.3 times the usual response",
    );
  }
  {
    const sb = db();
    const broken = {
      ...sb,
      from: (t: string) =>
        t === "race_rivals" || t === "race_polls"
          ? {
              select: async () => ({
                data: null,
                error: { message: 'relation "race_rivals" does not exist' },
              }),
            }
          : sb.from(t),
    };
    const h = await loadHome(broken as never, ME, "manager", "2026-09-29");
    eq(
      "no race tables yet: the sample, not an error",
      [h.facts.rivals, h.facts.polls, h.race.rivals.length],
      [0, 0, 0],
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
