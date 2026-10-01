// Checks for Home: which sections are real, the Today list, the verdict line,
// and loading the real signals under the user's own access. Uses a stand-in
// database; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/home.test.ts

import { nairobiToday } from "@/lib/demo/insights";
import { addDays } from "@/lib/diary";
import {
  greetingName,
  mindItem,
  nextStopItem,
  realToday,
  sectionModes,
  todayItems,
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

/** The week's top issue, as top of mind gives it. */
const MIND_LINE = {
  key: "floods",
  label: "Floods",
  score: 0.31,
  shares: { news: 0.4, messages: 0.22, door: null, searches: null },
  examples: [],
};

// ---------------------------------------------------------------- sections

eq("no data: both empty", sectionModes({ realPeople: 0, rivals: 0, polls: 0 }), {
  race: "empty",
  campaign: "empty",
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
    mind: MIND_LINE,
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
    "the week's top issue",
    [items[2]?.title, items[2]?.detail, items[2]?.action],
    [
      "Floods is top of mind this week",
      "31% of what was raised across news and social and messages to us.",
      { kind: "issue", label: "See what's said", issue: "floods" },
    ],
  );
  eq(
    "nothing waiting, nothing listed",
    realToday({ pendingExpenses: 0, unread: 0, mind: null }),
    [],
  );
  eq(
    "one expense, several people",
    realToday({ pendingExpenses: 1, unread: 3, mind: null }).map((i) => i.title),
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
  },
);
{
  const four = [1, 2, 3, 4].map((n) => ({
    title: `Item ${n}`,
    detail: "",
    action: { kind: "go" as const, label: "Open", to: "/inbox" as const },
  }));
  eq(
    "Today: at most three, all real",
    todayItems(four).map((i) => i.title),
    ["Item 1", "Item 2", "Item 3"],
  );
}
{
  const items = realToday({
    pendingExpenses: 0,
    unread: 0,
    mind: null,
    rivalMove: {
      title: "James Gakuya up 3.8 points in Mizani Africa's latest poll",
      detail: "From 11.2% in Jul 2026 to 15% in Aug 2026.",
    },
  });
  eq(
    "a rival's move, with a jump to the race",
    [items[0]?.title, items[0]?.action],
    [
      "James Gakuya up 3.8 points in Mizani Africa's latest poll",
      { kind: "jump", label: "See the race", to: "#race" },
    ],
  );
}

// ---------------------------------------------------------------- issues

eq("the week's top issue on Today", mindItem(MIND_LINE).title, "Floods is top of mind this week");

// ---------------------------------------------------------------- names

eq("first name", greetingName("Njeri Kamau", "Johnson"), "Njeri");
eq("blank falls back", greetingName("  ", "Johnson"), "Johnson");
eq("missing falls back", greetingName(null, "Johnson"), "Johnson");

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
    eq("too little this week to name a top issue", h.signals.mind, null);
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
    const today = nairobiToday();
    const h = await loadHome(
      db({
        morning_stories: [
          {
            id: "s1",
            campaign_id: "c2",
            day: today,
            story: {
              kind: "written",
              headline: "Rationing extended",
              summary: "Water rationing now covers 14 wards.",
              sources: [
                {
                  title: "Nation",
                  url: "https://nation.africa/x",
                  source: "nation.africa",
                  publishedAt: null,
                },
              ],
              figures: [],
              also: [],
              picks: [],
              from: 12,
            },
            written_by: "team",
            edited_by: ME,
            edited_at: `${today}T04:10:00Z`,
            created_at: `${today}T03:04:00Z`,
          },
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq(
      "this morning's story, and who edited it",
      [h.story?.story.headline, h.story?.writtenBy, h.story?.editedBy],
      ["Rationing extended", "team", "Njeri Kamau"],
    );
  }
  {
    const h = await loadHome(db() as never, ME, "manager");
    eq("no story yet", h.story, null);
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
    eq("rivals' own posts are not counted as what people raise", h.mind.sizes.news, 3);

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
    const h = await loadHome(
      db({
        listening_mentions: Array.from({ length: 6 }, (_, i) => ({
          id: `w${i}`,
          issue: i < 4 ? "water" : "floods",
          sentiment: null,
          title: `Story ${i}`,
          url: `https://n.test/${i}`,
          found_at: daysAgo(1),
        })),
        conversations: [
          ...Array.from({ length: 3 }, (_, i) => ({
            id: `cw${i}`,
            issue: "water",
            last_message_at: daysAgo(1),
            unread: false,
          })),
          ...Array.from({ length: 2 }, (_, i) => ({
            id: `cg${i}`,
            issue: "garbage",
            last_message_at: daysAgo(1),
            unread: false,
          })),
        ],
        person_events: Array.from({ length: 5 }, (_, i) => ({
          id: `e${i}`,
          kind: "door_spoke",
          detail: "Water",
          created_at: daysAgo(2),
        })),
      }) as never,
      ME,
      "manager",
    );
    eq(
      "the week's top of mind, across news, messages and the door",
      h.mind.lines.map((l) => l.key),
      ["water", "garbage", "floods"],
    );
    eq("and it is on Today", h.signals.mind?.key, "water");
  }
  {
    const today = nairobiToday();
    const points = (before: number, week: number) =>
      Array.from({ length: 28 }, (_, i) => ({
        day: addDays(today, i - 27),
        value: i >= 21 ? week : before,
      }));
    const h = await loadHome(
      db({
        race_rivals: [
          {
            id: "s",
            name: "Johnson Sakaja",
            party: null,
            office: null,
            is_us: true,
            tone: "us",
            sort: 0,
            facebook: null,
            x: null,
            tiktok: null,
            search_as: "Sakaja",
          },
          {
            id: "b",
            name: "Babu Owino",
            party: null,
            office: null,
            is_us: false,
            tone: "a",
            sort: 1,
            facebook: null,
            x: null,
            tiktok: null,
            search_as: null,
          },
        ],
        search_interest: [
          {
            id: "c",
            campaign_id: "c2",
            day: today,
            kind: "candidates",
            geo: "KE-110",
            created_at: `${today}T03:05:00Z`,
            series: [
              { term: "Sakaja", ref: "s", points: points(10, 10) },
              { term: "Babu Owino", ref: "b", points: points(12, 30) },
            ],
          },
          {
            id: "i",
            campaign_id: "c2",
            day: today,
            kind: "issues",
            geo: "KE",
            created_at: `${today}T03:05:00Z`,
            series: [{ term: "water shortage", ref: "water", points: points(5, 40) }],
          },
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq(
      "the latest read of search interest",
      [h.search?.geo, h.search?.series.length],
      ["KE-110", 2],
    );
    eq(
      "a rival searched twice as much is the rival's move, with no post or poll to beat it",
      h.signals.rivalMove?.title,
      "Searches for Babu Owino doubled this week",
    );
    eq("the week's issue searches count toward top of mind", h.mind.sizes.searches, 1);
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
      "no race tables yet: an empty race, not an error",
      [h.facts.rivals, h.facts.polls, h.race.rivals.length],
      [0, 0, 0],
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
