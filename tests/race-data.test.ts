// Checks for the real race: cleaning what the editor sends, polls over time,
// the verdict line and the rivals' moves. Pure; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/race-data.test.ts

import {
  byRecency,
  cleanPoll,
  cleanRival,
  fieldworkLabel,
  handleOf,
  labelTicks,
  landedLine,
  pollChart,
  pollFromRow,
  pollLabel,
  postDay,
  postFromRow,
  postSpike,
  realVerdict,
  rivalFromRow,
  rivalMove,
  shareOf,
  type RacePoll,
  type RaceRival,
  type RivalPost,
} from "@/lib/race-data";

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

function refuses(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

// Sakaja's race: the figures migration 17 records.
const rival = (
  id: string,
  name: string,
  tone: RaceRival["tone"],
  sort: number,
  isUs = false,
): RaceRival => ({
  id,
  name,
  party: null,
  office: null,
  isUs,
  tone,
  sort,
  facebook: null,
  x: null,
  tiktok: null,
});
const RIVALS: RaceRival[] = [
  rival("s", "Johnson Sakaja", "us", 0, true),
  rival("b", "Babu Owino", "a", 1),
  rival("k", "Agnes Kagure", "b", 2),
  rival("g", "James Gakuya", "c", 3),
  rival("r", "Ronald Karauri", "d", 4),
];
const poll = (
  id: string,
  pollster: string,
  from: string | null,
  to: string | null,
  published: string,
  shares: [string, number, string?][],
  undecided: number | null = null,
): RacePoll => ({
  id,
  pollster,
  fieldworkFrom: from,
  fieldworkTo: to,
  publishedOn: published,
  sampleSize: null,
  margin: null,
  sourceUrl: `https://example.test/${id}`,
  shares: shares.map(([name, share, rivalId]) => ({ name, share, rivalId: rivalId ?? null })),
  undecided,
  approval: null,
  disapproval: null,
});
const ISS = poll("iss", "ISS Africa", null, null, "2025-09-17", [
  ["Babu Owino", 28.1, "b"],
  ["Irungu Nyakera", 19.2],
  ["Johnson Sakaja", 16.4, "s"],
  ["James Gakuya", 11.2, "g"],
]);
const CAP = poll(
  "cap",
  "Centre for African Progress",
  "2026-04-14",
  "2026-04-19",
  "2026-04-21",
  [
    ["Babu Owino", 37, "b"],
    ["Agnes Kagure", 34, "k"],
    ["Johnson Sakaja", 10, "s"],
    ["James Gakuya", 7, "g"],
    ["Irungu Nyakera", 1],
    ["Ronald Karauri", 1, "r"],
  ],
  9,
);
const MIZ_JUL = poll(
  "mj",
  "Mizani Africa",
  null,
  null,
  "2026-07-01",
  [
    ["Babu Owino", 27.1, "b"],
    ["Agnes Kagure", 23.7, "k"],
    ["Johnson Sakaja", 19.9, "s"],
    ["James Gakuya", 11.2, "g"],
    ["Dennis Waweru", 1.5],
    ["George Aladwa", 1.4],
  ],
  13.3,
);
const MIZ_AUG = poll(
  "ma",
  "Mizani Africa",
  "2026-08-21",
  "2026-08-28",
  "2026-09-10",
  [
    ["Babu Owino", 28.4, "b"],
    ["Agnes Kagure", 27.2, "k"],
    ["Johnson Sakaja", 17, "s"],
    ["James Gakuya", 15, "g"],
  ],
  8.1,
);
const POLLS = [CAP, MIZ_AUG, ISS, MIZ_JUL];

// ---------------------------------------------------------------- rows

eq(
  "a rival row",
  rivalFromRow({
    id: "b",
    name: "Babu Owino",
    party: "The Mwananchi Party",
    office: "Embakasi East MP",
    is_us: false,
    tone: "a",
    sort: 1,
    facebook: null,
    x: "HEBabuOwino",
    tiktok: null,
  }),
  {
    id: "b",
    name: "Babu Owino",
    party: "The Mwananchi Party",
    office: "Embakasi East MP",
    isUs: false,
    tone: "a",
    sort: 1,
    facebook: null,
    x: "HEBabuOwino",
    tiktok: null,
  },
);
eq(
  "an unknown colour falls back",
  rivalFromRow({
    id: "z",
    name: "Z Name",
    party: null,
    office: null,
    is_us: false,
    tone: "purple",
    sort: 0,
    facebook: null,
    x: null,
    tiktok: null,
  }).tone,
  "a",
);
eq(
  "a poll row, with malformed shares dropped",
  pollFromRow({
    id: "p",
    pollster: "Mizani Africa",
    fieldwork_from: "2026-08-21",
    fieldwork_to: "2026-08-28",
    published_on: "2026-09-10",
    sample_size: 1820,
    margin: "2.30",
    source_url: "https://example.test/p",
    shares: [
      { name: "Babu Owino", share: 28.4, rival_id: "b" },
      { name: "Nobody" },
      { share: 3 },
      { name: "Other Name", share: "1.5" },
    ],
    undecided: "8.1",
    approval: null,
    disapproval: null,
  }),
  {
    id: "p",
    pollster: "Mizani Africa",
    fieldworkFrom: "2026-08-21",
    fieldworkTo: "2026-08-28",
    publishedOn: "2026-09-10",
    sampleSize: 1820,
    margin: 2.3,
    sourceUrl: "https://example.test/p",
    shares: [
      { name: "Babu Owino", share: 28.4, rivalId: "b" },
      { name: "Other Name", share: 1.5, rivalId: null },
    ],
    undecided: 8.1,
    approval: null,
    disapproval: null,
  },
);

// ---------------------------------------------------------------- handles

eq("an @handle", handleOf("x", "@HEBabuOwino"), "HEBabuOwino");
eq("an X link", handleOf("x", "https://x.com/HEBabuOwino"), "HEBabuOwino");
eq("an old Twitter link", handleOf("x", "https://twitter.com/SakajaJohnson/"), "SakajaJohnson");
eq("a TikTok link", handleOf("tiktok", "https://www.tiktok.com/@babuowino?lang=en"), "babuowino");
eq(
  "a Facebook page link",
  handleOf("facebook", "https://www.facebook.com/SakajaJohnson/"),
  "SakajaJohnson",
);
eq(
  "a Facebook profile id",
  handleOf("facebook", "https://www.facebook.com/profile.php?id=100064526"),
  "100064526",
);
eq("blank is none", handleOf("tiktok", "  "), null);
refuses(
  "a link to another site",
  () => handleOf("x", "https://example.com/HEBabuOwino"),
  "That X handle link doesn't look right.",
);
refuses(
  "a handle with a space",
  () => handleOf("x", "Babu Owino"),
  "That X handle doesn't look right.",
);

// ---------------------------------------------------------------- rivals

eq(
  "a rival, tidied",
  cleanRival({
    name: "  Babu   Owino ",
    party: " The Mwananchi Party ",
    office: "",
    tone: "a",
    sort: "3",
    x: "@HEBabuOwino",
  }),
  {
    id: null,
    name: "Babu Owino",
    party: "The Mwananchi Party",
    office: null,
    isUs: false,
    tone: "a",
    sort: 3,
    facebook: null,
    x: "HEBabuOwino",
    tiktok: null,
  },
);
eq(
  "ours wears our colour",
  cleanRival({ name: "Johnson Sakaja", isUs: true, tone: "b" }).tone,
  "us",
);
refuses(
  "a rival in our colour",
  () => cleanRival({ name: "Babu Owino", tone: "us" }),
  "Pick a colour for them.",
);
refuses("no name", () => cleanRival({ name: " B ", tone: "a" }), "Give the candidate's name.");
eq("the order is kept in range", cleanRival({ name: "Babu Owino", tone: "a", sort: 250 }).sort, 99);

// ---------------------------------------------------------------- polls

const input = {
  pollster: " Mizani Africa ",
  fieldworkFrom: "2026-08-21",
  fieldworkTo: "2026-08-28",
  publishedOn: "2026-09-10",
  sampleSize: "1,820",
  margin: "±2.3",
  sourceUrl: "https://nairobinews.co.ke/poll",
  shares: [
    { rivalId: "b", name: "Babu Owino", share: "28.4" },
    { rivalId: "k", name: "Agnes Kagure", share: 27.2 },
    { rivalId: "s", name: "Johnson Sakaja", share: "17" },
    { rivalId: "g", name: "James Gakuya", share: "15.04" },
    { rivalId: "r", name: "Ronald Karauri", share: "" },
    { name: "  ", share: "" },
    { name: "Dennis Waweru", share: "1.5" },
  ],
  undecided: "8.1",
};
eq("a poll, cleaned", cleanPoll(input, RIVALS, "2026-09-29"), {
  id: null,
  pollster: "Mizani Africa",
  fieldworkFrom: "2026-08-21",
  fieldworkTo: "2026-08-28",
  publishedOn: "2026-09-10",
  sampleSize: 1820,
  margin: 2.3,
  sourceUrl: "https://nairobinews.co.ke/poll",
  shares: [
    { name: "Babu Owino", share: 28.4, rivalId: "b" },
    { name: "Agnes Kagure", share: 27.2, rivalId: "k" },
    { name: "Johnson Sakaja", share: 17, rivalId: "s" },
    { name: "James Gakuya", share: 15, rivalId: "g" },
    { name: "Dennis Waweru", share: 1.5, rivalId: null },
  ],
  undecided: 8.1,
  approval: null,
  disapproval: null,
});
eq(
  "a typed name finds its rival",
  cleanPoll({ ...input, shares: [{ name: "babu owino", share: 30 }] }, RIVALS, "2026-09-29").shares,
  [{ name: "Babu Owino", share: 30, rivalId: "b" }],
);
refuses(
  "published tomorrow",
  () => cleanPoll({ ...input, publishedOn: "2026-09-30" }, RIVALS, "2026-09-29"),
  "The publication date is in the future.",
);
refuses(
  "fieldwork after publication",
  () => cleanPoll({ ...input, fieldworkTo: "2026-09-12" }, RIVALS, "2026-09-29"),
  "Fieldwork ends after the poll was published.",
);
refuses(
  "fieldwork backwards",
  () => cleanPoll({ ...input, fieldworkFrom: "2026-08-29" }, RIVALS, "2026-09-29"),
  "Fieldwork ends before it starts.",
);
refuses(
  "not a date",
  () => cleanPoll({ ...input, publishedOn: "2026-02-30" }, RIVALS, "2026-09-29"),
  "The publication date isn't a date.",
);
refuses(
  "a plain http link",
  () => cleanPoll({ ...input, sourceUrl: "http://nairobinews.co.ke/poll" }, RIVALS, "2026-09-29"),
  "Add the link to where the poll was published (https://…).",
);
refuses(
  "no pollster",
  () => cleanPoll({ ...input, pollster: " " }, RIVALS, "2026-09-29"),
  "Who ran the poll?",
);
refuses(
  "a name twice",
  () =>
    cleanPoll(
      {
        ...input,
        shares: [
          { name: "Dennis Waweru", share: 1 },
          { name: "dennis waweru", share: 2 },
        ],
      },
      RIVALS,
      "2026-09-29",
    ),
  "Dennis Waweru is listed twice.",
);
refuses(
  "another name with no share",
  () =>
    cleanPoll({ ...input, shares: [{ name: "Dennis Waweru", share: "" }] }, RIVALS, "2026-09-29"),
  "What did Dennis Waweru get?",
);
refuses(
  "over 100 in all",
  () => cleanPoll({ ...input, undecided: 20 }, RIVALS, "2026-09-29"),
  "The shares add up to 109.1%, more than 100.",
);
refuses(
  "no shares",
  () => cleanPoll({ ...input, shares: [] }, RIVALS, "2026-09-29"),
  "Add at least one candidate's share.",
);
refuses(
  "a share over 100",
  () =>
    cleanPoll({ ...input, shares: [{ name: "Dennis Waweru", share: 120 }] }, RIVALS, "2026-09-29"),
  "Dennis Waweru's share must be between 0 and 100.",
);
refuses(
  "a sample that is not a number",
  () => cleanPoll({ ...input, sampleSize: "many" }, RIVALS, "2026-09-29"),
  "The sample size should be a number of people, like 1820.",
);
refuses(
  "a margin that is not a margin",
  () => cleanPoll({ ...input, margin: "30" }, RIVALS, "2026-09-29"),
  "The margin of error should be a few points, like 2.3.",
);

// ---------------------------------------------------------------- reading polls

eq(
  "newest first",
  [...POLLS].sort(byRecency).map((p) => p.id),
  ["ma", "mj", "cap", "iss"],
);
{
  const sameDay = poll("x", "Another Pollster", null, "2026-08-28", "2026-09-12", [
    ["Babu Owino", 30, "b"],
  ]);
  eq(
    "the same fieldwork: the later publication first",
    [MIZ_AUG, sameDay].sort(byRecency).map((p) => p.id),
    ["x", "ma"],
  );
}
eq("a poll's name", pollLabel(MIZ_AUG), "Mizani Africa, Aug 2026");
eq("fieldwork in one month", fieldworkLabel(MIZ_AUG), "21–28 Aug 2026");
eq("no fieldwork dates", fieldworkLabel(ISS), "published 17 Sep 2025");
eq(
  "fieldwork across months",
  fieldworkLabel({ ...MIZ_AUG, fieldworkTo: "2026-09-03" }),
  "21 Aug – 3 Sep 2026",
);
eq(
  "fieldwork across years",
  fieldworkLabel({ ...MIZ_AUG, fieldworkFrom: "2025-12-28", fieldworkTo: "2026-01-03" }),
  "28 Dec 2025 – 3 Jan 2026",
);
eq("only an end date", fieldworkLabel({ ...MIZ_AUG, fieldworkFrom: null }), "to 28 Aug 2026");
eq("a share by rival", shareOf(MIZ_AUG, RIVALS[1]!), 28.4);
eq("not in this poll", shareOf(ISS, RIVALS[2]!), null);
eq(
  "a renamed rival keeps their polls",
  shareOf(MIZ_AUG, { ...RIVALS[1]!, name: "Paul Ongili Babu Owino" }),
  28.4,
);
eq(
  "a share by name, before they were tracked",
  shareOf(poll("n", "P Name", null, null, "2026-01-01", [["Agnes Kagure", 20]]), RIVALS[2]!),
  20,
);

// ---------------------------------------------------------------- the verdict

eq(
  "third in the latest poll",
  realVerdict(RIVALS, POLLS),
  "Third, behind Babu Owino and Agnes Kagure (Mizani Africa, Aug 2026).",
);
eq(
  "leading",
  realVerdict(RIVALS, [
    poll("l", "Poll Co", null, null, "2026-09-01", [
      ["Johnson Sakaja", 41, "s"],
      ["Babu Owino", 38.5, "b"],
    ]),
  ]),
  "Leading Babu Owino by 2.5 points (Poll Co, Sep 2026).",
);
eq(
  "second",
  realVerdict(RIVALS, [
    poll("l", "Poll Co", null, null, "2026-09-01", [
      ["Babu Owino", 38.5, "b"],
      ["Johnson Sakaja", 36, "s"],
    ]),
  ]),
  "Second, 2.5 points behind Babu Owino (Poll Co, Sep 2026).",
);
eq(
  "level",
  realVerdict(RIVALS, [
    poll("l", "Poll Co", null, null, "2026-09-01", [
      ["Babu Owino", 30, "b"],
      ["Johnson Sakaja", 30, "s"],
    ]),
  ]),
  "Level with Babu Owino on 30% (Poll Co, Sep 2026).",
);
eq(
  "falls back to the latest poll that names us",
  realVerdict(RIVALS, [
    ...POLLS,
    poll("z", "Newer Co", null, null, "2026-09-20", [["Babu Owino", 30, "b"]]),
  ]),
  "Third, behind Babu Owino and Agnes Kagure (Mizani Africa, Aug 2026).",
);
eq(
  "names come from the rival, as renamed",
  realVerdict([RIVALS[0]!, { ...RIVALS[1]!, name: "Paul Babu Owino" }], [MIZ_AUG]),
  "Third, behind Paul Babu Owino and Agnes Kagure (Mizani Africa, Aug 2026).",
);
eq("no candidate of ours, no verdict", realVerdict(RIVALS.slice(1), POLLS), "");
eq("no polls, no verdict", realVerdict(RIVALS, []), "");

// ---------------------------------------------------------------- rival moves

eq("the biggest recent move", rivalMove(RIVALS, POLLS, "2026-09-29"), {
  title: "James Gakuya up 3.8 points in Mizani Africa's latest poll",
  detail: "From 11.2% in Jul 2026 to 15% in Aug 2026.",
});
eq("too long ago", rivalMove(RIVALS, POLLS, "2026-11-01"), null);
eq("a small change is not a move", rivalMove(RIVALS, POLLS, "2026-09-29", 4), null);
{
  const before = poll("o", "Poll Co", null, null, "2026-08-01", [
    ["Johnson Sakaja", 30, "s"],
    ["Babu Owino", 30, "b"],
  ]);
  const after = poll("n", "Poll Co", null, null, "2026-09-20", [
    ["Johnson Sakaja", 22, "s"],
    ["Babu Owino", 27.5, "b"],
  ]);
  eq("our own drop is not a rival's move", rivalMove(RIVALS, [before, after], "2026-09-29"), {
    title: "Babu Owino down 2.5 points in Poll Co's latest poll",
    detail: "From 30% in Aug 2026 to 27.5% in Sep 2026.",
  });
}
eq("one poll per pollster, no move", rivalMove(RIVALS, [ISS, CAP], "2026-09-29"), null);

// ---------------------------------------------------------------- the chart

{
  const m = pollChart(RIVALS, POLLS);
  eq(
    "polls oldest first",
    m.polls.map((p) => p.id),
    ["iss", "cap", "mj", "ma"],
  );
  eq(
    "placed by date",
    m.xs.map((x) => Math.round(x * 100) / 100),
    [0, 0.62, 0.83, 1],
  );
  eq("month labels", m.labels, ["Sep 2025", "Apr 2026", "Jul 2026", "Aug 2026"]);
  eq(
    "ours first, then rivals in order, then undecided",
    m.series.map((s) => s.key),
    ["s", "b", "k", "g", "r", "undecided"],
  );
  eq("a gap where a poll left them out", m.series.find((s) => s.key === "k")?.values, [
    null,
    34,
    23.7,
    27.2,
  ]);
  eq("room above the top line", m.max, 40);
}
{
  const m = pollChart([...RIVALS, rival("q", "Never Polled", "d", 9)], [MIZ_AUG]);
  eq(
    "a rival in no poll is not a series",
    m.series.some((s) => s.key === "q"),
    false,
  );
  eq("one poll sits in the middle", m.xs, [0.5]);
}
{
  const m = pollChart(
    RIVALS.filter((r) => r.id !== "g"),
    [MIZ_AUG],
  );
  eq(
    "a removed rival is not a series",
    m.series.map((s) => s.key),
    ["s", "b", "k", "undecided"],
  );
}

// Month labels under the chart: the latest poll's always shows, and a label
// that would crowd the one after it is left out.
eq("Sakaja's polls: July gives way to August", labelTicks([30, 302, 393, 468], 96), [0, 1, 3]);
eq("two close together: the latest wins", labelTicks([30, 50], 96), [1]);
eq("well spread: all of them", labelTicks([30, 200, 400], 96), [0, 1, 2]);
eq("one poll", labelTicks([219], 96), [0]);
eq("none", labelTicks([], 96), []);

// Rivals' own posts: the newest with how it landed, and one drawing far more
// response than their others.
const post = (
  rivalId: string,
  daysAgo: number,
  reach: number,
  extra: Partial<RivalPost> = {},
): RivalPost => ({
  rivalId,
  platform: "tiktok",
  url: `https://www.tiktok.com/@x/video/${rivalId}${daysAgo}`,
  text: "Post",
  publishedAt: new Date(Date.UTC(2026, 8, 29) - daysAgo * 864e5).toISOString(),
  reach,
  landed: null,
  ...extra,
});
const SEEN = new Date(Date.UTC(2026, 8, 29, 12));
const usual = (id: string) => [post(id, 5, 8000), post(id, 9, 7900), post(id, 14, 7000)];
eq(
  "a post drawing twice the usual",
  postSpike(RIVALS, [post("b", 0.5, 18400), ...usual("b")], SEEN),
  {
    title: "Babu Owino's TikTok post is drawing 2.3 times the usual response",
    detail: "18,400 reactions, comments and shares, against about 7,900 usually.",
  },
);
eq(
  "no baseline, no spike",
  postSpike(RIVALS, [post("b", 0.5, 18400), post("b", 5, 8000)], SEEN),
  null,
);
eq("an old post is not news", postSpike(RIVALS, [post("b", 3, 18400), ...usual("b")], SEEN), null);
eq(
  "our own post is not a rival's move",
  postSpike(RIVALS, [post("s", 0.5, 18400), ...usual("s")], SEEN),
  null,
);
eq(
  "a usual response is not a spike",
  postSpike(RIVALS, [post("b", 0.5, 9000), ...usual("b")], SEEN),
  null,
);
eq(
  "the bigger of two spikes",
  postSpike(
    RIVALS,
    [post("b", 0.5, 18400), ...usual("b"), post("k", 1, 30000), ...usual("k")],
    SEEN,
  )?.title,
  "Agnes Kagure's TikTok post is drawing 3.8 times the usual response",
);
eq(
  "how it landed, in words",
  landedLine(
    post("b", 1, 13200, { landed: { read: 50, positive: 12, negative: 31, issue: "water" } }),
  ),
  "13,200 reactions, comments and shares. Of 50 comments read, 31 negative and 12 positive; mostly about water.",
);
eq("reach only", landedLine(post("b", 1, 13200)), "13,200 reactions, comments and shares.");
eq(
  "the day a post went up, in Nairobi",
  [postDay("2026-09-28T09:30:00Z"), postDay("2026-09-28T22:30:00Z"), postDay("not a date")],
  ["28 Sep", "29 Sep", ""],
);
eq(
  "no comments under it",
  landedLine(
    post("b", 1, 13200, { landed: { read: 0, positive: null, negative: null, issue: null } }),
  ),
  "13,200 reactions, comments and shares.",
);
const ROW = {
  rival_id: "b",
  source: "x",
  url: "https://x.com/a/status/1",
  title: "Hi",
  published_at: "2026-09-28T09:30:00Z",
  reach: 2020,
  comments_read: null,
  comments_positive: null,
  comments_negative: null,
  comments_issue: null,
};
eq("a post row", postFromRow(ROW), {
  rivalId: "b",
  platform: "x",
  url: "https://x.com/a/status/1",
  text: "Hi",
  publishedAt: "2026-09-28T09:30:00Z",
  reach: 2020,
  landed: null,
});
eq(
  "a read post row",
  postFromRow({
    ...ROW,
    source: "tiktok",
    comments_read: 40,
    comments_positive: 10,
    comments_negative: 20,
    comments_issue: "roads",
  })?.landed,
  { read: 40, positive: 10, negative: 20, issue: "roads" },
);
eq("not a rival's post", postFromRow({ ...ROW, rival_id: null, source: "news" }), null);
eq("a rival's row from an unknown place", postFromRow({ ...ROW, source: "web" }), null);
eq("a link that is not the web", postFromRow({ ...ROW, url: "javascript:alert(1)" }), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
