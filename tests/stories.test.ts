// Checks for following a story: which posts are about the same thing, the views curve from the
// readings, whether it is still climbing, who carried it, and the "so what" line. Plain code; no
// AI. Invented posts and accounts only; nothing here describes a real person or outlet.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/stories.test.ts

import type { Mention } from "@/lib/listening-mention";
import {
  amplifiers,
  groupStories,
  linksOf,
  pickups,
  placeOf,
  platformSplit,
  sameStory,
  soWhat,
  storyMood,
  trendOf,
  viewsCurve,
  wordsOf,
  type Reading,
  type StoryPost,
} from "@/lib/stories";

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
const T0 = Date.parse("2026-10-27T14:05:00Z");
const at = (hours: number) => new Date(T0 + hours * HOUR).toISOString();
let n = 0;
const sp = (o: Partial<StoryPost> = {}): StoryPost => ({
  id: `p${++n}`,
  url: `https://x.com/acct${n}/status/${1000 + n}`,
  source: "x",
  voiceKey: `x:@acct${n}`,
  title: null,
  snippet: null,
  publishedAt: at(0),
  foundAt: at(0),
  refersTo: null,
  storyId: null,
  reach: null,
  sentiment: null,
  issue: null,
  topicKind: "campaign",
  rivalId: null,
  ...o,
});
const text = (s: string, o: Partial<StoryPost> = {}) => sp({ title: s, snippet: s, ...o });

// ---- words
eq(
  "words: lower case, no links or handles, no stop words, three letters or more",
  [
    ...wordsOf("The water in Githunguri is gone! #TapsDry https://t.co/x @someone OK 2026 na"),
  ].sort(),
  ["#tapsdry", "githunguri", "gone", "water"],
);
eq("words keep Swahili content words", wordsOf("Maji hayapo Kiambu").has("maji"), true);
eq("words: nothing in, nothing out", wordsOf("").size, 0);

// ---- links
eq(
  "links: its own address, tidied",
  linksOf({
    url: "https://www.example-news.test/story/12/?utm_source=x&fbclid=abc#top",
    title: null,
    snippet: null,
  }),
  ["example-news.test/story/12"],
);
eq(
  "links: those in the text too, without a shortener or a front page",
  linksOf({
    url: "https://x.com/a/status/1",
    title:
      "see https://t.co/abc and https://paper.example.test/a/b. also https://paper.example.test/ done",
    snippet: null,
  }).sort(),
  ["paper.example.test/a/b", "x.com/a/status/1"],
);
eq(
  "links: twitter and x are one place",
  linksOf({ url: "https://twitter.com/a/status/1", title: null, snippet: null }),
  ["x.com/a/status/1"],
);

// ---- same story?
const article = "https://paper.example.test/water/taps-dry-nine-days";
eq(
  "a shared article, 5 hours apart",
  sameStory(
    text(`Taps dry ${article}`, { publishedAt: at(0) }),
    sp({ url: article, publishedAt: at(5), source: "news" }),
  ),
  true,
);
eq(
  "the same link 80 hours apart is not one story",
  sameStory(
    text(`Taps dry ${article}`, { publishedAt: at(0) }),
    sp({ url: article, publishedAt: at(80), source: "news" }),
  ),
  false,
);
eq(
  "only a front page in common is not a story",
  sameStory(text("one https://paper.example.test/"), text("two https://paper.example.test/")),
  false,
);
eq(
  "only a shortener in common is not a story",
  sameStory(text("one https://t.co/abc"), text("two https://t.co/abc")),
  false,
);
eq(
  "enough of the same words",
  sameStory(
    text("Githunguri taps dry nine days water company silent residents angry"),
    text("Residents angry: Githunguri taps dry for nine days, water company silent"),
  ),
  true,
);
eq(
  "three shared words are too few",
  sameStory(
    text("Githunguri water taps dry again"),
    text("Githunguri water taps flowing, market busy, farmers selling milk"),
  ),
  false,
);
eq(
  "three shared words are too few even when they are nearly all the words",
  sameStory(text("Githunguri water taps dry"), text("Githunguri water taps")),
  false,
);
{
  // Four shared words need to be a fair share of all the words, not four among dozens.
  const unique = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${prefix}${String.fromCharCode(97 + i).repeat(2)}`).join(
      " ",
    );
  const core = "alpha bravo charlie delta";
  eq(
    "four shared words among dozens are not a story",
    sameStory(text(`${core} ${unique("p", 14)}`), text(`${core} ${unique("q", 14)}`)),
    false,
  );
  eq(
    "four shared words and a few others are",
    sameStory(text(`${core} ${unique("p", 2)}`), text(`${core} ${unique("q", 2)}`)),
    true,
  );
}
eq(
  "common words in a different story do not join it",
  sameStory(
    text("Kiambu county news today: county government announces new tender for market stalls"),
    text("Kiambu county news today: county assembly debates budget for health and roads"),
  ),
  false,
);
eq(
  "an X reply joins the post it answers, even with other words",
  sameStory(
    sp({ url: "https://x.com/a/status/111", title: "first" }),
    sp({
      url: "https://x.com/b/status/222",
      title: "unrelated words entirely",
      refersTo: "https://x.com/i/status/111",
    }),
  ),
  true,
);
eq(
  "but not 80 hours later",
  sameStory(
    sp({ url: "https://x.com/a/status/111", publishedAt: at(0) }),
    sp({
      url: "https://x.com/b/status/222",
      publishedAt: at(80),
      refersTo: "https://x.com/i/status/111",
    }),
  ),
  false,
);

// ---- groups
{
  const a = text(`Taps dry ${article}`, { id: "a", publishedAt: at(0), voiceKey: "x:@a" });
  const b = sp({
    id: "b",
    url: article,
    source: "news",
    publishedAt: at(50),
    voiceKey: "site:paper.example.test",
  });
  const c = text(`More on this https://paper.example.test/water/taps-dry-nine-days`, {
    id: "c",
    publishedAt: at(100),
    voiceKey: "tiktok:@c",
  });
  const lone = text("something else entirely about football fixtures and referees", {
    id: "lone",
    voiceKey: "x:@lone",
  });
  const g = groupStories([lone, c, b, a], []);
  // a and c are 100 hours apart, so only b, 50 hours from each, joins them.
  eq(
    "a chain joins through its middle",
    g.map((x) => [...x.postIds].sort()),
    [["a", "b", "c"]],
  );
  eq("the first post is the earliest", g[0]!.firstId, "a");
  eq("no saved story, no id", g[0]!.savedId, null);

  const oneVoice = groupStories(
    [
      text("Taps dry in Githunguri for nine days now", { id: "s1", voiceKey: "x:@same" }),
      text("Taps dry in Githunguri for nine days now", { id: "s2", voiceKey: "x:@same" }),
    ],
    [],
  );
  eq("two posts from one voice are not a story", oneVoice, []);

  const anon = groupStories(
    [
      text("Taps dry in Githunguri for nine days now", { id: "n1", voiceKey: null }),
      text("Taps dry in Githunguri for nine days now", { id: "n2", voiceKey: null }),
    ],
    [],
  );
  eq("two posts from voices we cannot name are two voices", anon.length, 1);

  eq(
    "a saved story keeps its id",
    groupStories(
      [a, b, c],
      [{ id: "story-1", createdAt: "2026-10-27T10:00:00Z", postIds: ["a", "b"] }],
    )[0]!.savedId,
    "story-1",
  );
  eq(
    "the oldest saved story wins when two meet",
    groupStories(
      [a, b, c],
      [
        { id: "newer", createdAt: "2026-10-28T10:00:00Z", postIds: ["c"] },
        { id: "older", createdAt: "2026-10-27T10:00:00Z", postIds: ["a"] },
      ],
    )[0]!.savedId,
    "older",
  );
  const split = groupStories(
    [
      text("Taps dry nine days Githunguri water company silent", {
        id: "x1",
        voiceKey: "x:@1",
        publishedAt: at(0),
      }),
      text("Githunguri taps dry nine days, water company silent", {
        id: "x2",
        voiceKey: "x:@2",
        publishedAt: at(1),
      }),
      text("Football fixtures referees stadium tickets match weekend", {
        id: "y1",
        voiceKey: "x:@3",
        publishedAt: at(0),
      }),
      text("Stadium tickets match weekend football fixtures referees", {
        id: "y2",
        voiceKey: "x:@4",
        publishedAt: at(1),
      }),
    ],
    [{ id: "was-one", createdAt: "2026-10-27T10:00:00Z", postIds: ["x1", "x2", "y1", "y2"] }],
  );
  eq(
    "a saved story that split into two stories is kept by only one of them",
    split.map((x) => x.savedId).filter(Boolean),
    ["was-one"],
  );
}

// ---- views curve
{
  const r = (mentionId: string, hours: number, reach: number | null): Reading => ({
    mentionId,
    at: at(hours),
    reach,
  });
  eq(
    "the sum of every post's latest reading, at each reading",
    viewsCurve(
      [r("a", 0, 900), r("b", 5, 20_000), r("a", 6, 1_200), r("b", 12, 30_000)],
      ["a", "b"],
    ).map((p) => p.views),
    [900, 20_900, 21_200, 31_200],
  );
  eq(
    "never falling: a lower later reading does not lower the post's count",
    viewsCurve([r("a", 0, 900), r("a", 6, 400), r("b", 7, 100)], ["a", "b"]).map((p) => p.views),
    [900, 900, 1_000],
  );
  eq(
    "a post with no count adds nothing",
    viewsCurve([r("a", 0, 900), r("b", 5, null)], ["a", "b"]).map((p) => p.views),
    [900],
  );
  eq(
    "posts outside the story are left out",
    viewsCurve([r("a", 0, 900), r("z", 1, 5_000)], ["a"]).map((p) => p.views),
    [900],
  );
  eq("no readings, no curve", viewsCurve([], ["a"]), []);
  eq(
    "two readings at one instant are one point",
    viewsCurve([r("a", 0, 100), r("b", 0, 50)], ["a", "b"]).map((p) => p.views),
    [150],
  );
}

// ---- trend
{
  const c = (...v: [number, number][]) => v.map(([h, views]) => ({ at: at(h), views }));
  const now = (h: number) => T0 + h * HOUR;
  eq(
    "10% growth, the latest 2 hours old: climbing",
    trendOf(c([0, 1000], [10, 1100]), now(12)).kind,
    "climbing",
  );
  eq("5% growth: settled", trendOf(c([0, 1000], [10, 1050]), now(12)).kind, "settled");
  eq("no growth: settled", trendOf(c([0, 1000], [10, 1000]), now(12)).kind, "settled");
  eq(
    "the latest 13 hours old: not checked, and since when",
    trendOf(c([0, 1000], [10, 1500]), now(23)),
    { kind: "unchecked", since: at(10) },
  );
  eq("one fresh reading: settled", trendOf(c([10, 1000]), now(12)).kind, "settled");
  eq("none: not checked", trendOf([], now(12)), { kind: "unchecked", since: null });
  eq("growth from nothing counts", trendOf(c([0, 0], [10, 50]), now(11)).kind, "climbing");
}

// ---- split
eq(
  "the share of views by platform",
  platformSplit([
    { source: "x", reach: 380 },
    { source: "tiktok", reach: 550 },
    { source: "news", reach: 70 },
    { source: "x", reach: 0 },
  ]),
  [
    { source: "tiktok", share: 0.55 },
    { source: "x", share: 0.38 },
    { source: "news", share: 0.07 },
  ],
);
eq("no views anywhere: no split", platformSplit([{ source: "news", reach: null }]), []);

// ---- who carried it
const mention = (o: Partial<Mention> = {}): Mention => ({
  id: `m${++n}`,
  topicId: "t1",
  topic: "Githunguri",
  source: "x",
  domain: null,
  title: null,
  url: `https://x.com/h${n}/status/${n}`,
  snippet: null,
  publishedAt: at(0),
  foundAt: at(0),
  sentiment: null,
  sentimentScore: null,
  issue: null,
  status: "new",
  topicKind: "campaign",
  rivalId: null,
  rival: null,
  rivalIsUs: false,
  author: null,
  reach: null,
  shares: null,
  commentsRead: null,
  commentsPositive: null,
  commentsNegative: null,
  ...o,
});
{
  const posts = [
    mention({
      id: "late",
      author: "@late_one",
      publishedAt: at(9),
      reach: 20_000,
      sentiment: "negative",
    }),
    mention({
      id: "first",
      author: "@first_one",
      publishedAt: at(0),
      reach: 900,
      sentiment: "negative",
    }),
    mention({
      id: "paper",
      source: "news",
      domain: "paper.example.test",
      url: "https://paper.example.test/a",
      author: null,
      publishedAt: at(5),
      reach: null,
    }),
    mention({
      id: "own",
      source: "x",
      author: "@candidate",
      rivalId: "r1",
      rival: "Test Rival",
      publishedAt: at(7),
      reach: 5_000,
    }),
  ];
  const list = pickups(posts);
  eq(
    "pick-ups in time order, the first flagged",
    list.map((p) => [p.id, p.first]),
    [
      ["first", true],
      ["paper", false],
      ["own", false],
      ["late", false],
    ],
  );
  eq("an outlet is an outlet", list.find((p) => p.id === "paper")!.outlet, true);
  eq(
    "a candidate's own post is labelled as theirs",
    list.find((p) => p.id === "own")!.name,
    "Test Rival's own post",
  );
  eq(
    "views carry through",
    list.map((p) => p.views),
    [900, null, 5_000, 20_000],
  );

  const amps = amplifiers(posts, 3);
  eq(
    "the top amplifiers by views",
    amps.map((a) => [a.name, a.views]),
    [
      ["@late_one", 20_000],
      ["Test Rival's own post", 5_000],
      ["@first_one", 900],
    ],
  );
  eq(
    "with their mood, null when unread",
    amps.map((a) => a.mood),
    ["angry", null, "angry"],
  );
}

// ---- mood and place
eq(
  "mostly angry",
  storyMood([
    mention({ sentiment: "negative" }),
    mention({ sentiment: "negative" }),
    mention({ sentiment: "positive" }),
  ]),
  "angry",
);
eq(
  "mostly warm",
  storyMood([
    mention({ sentiment: "positive" }),
    mention({ sentiment: "positive" }),
    mention({ sentiment: "negative" }),
  ]),
  "warm",
);
eq(
  "split down the middle is mixed",
  storyMood([mention({ sentiment: "positive" }), mention({ sentiment: "negative" })]),
  "mixed",
);
eq("none read", storyMood([mention({})]), "unread");
eq(
  "a rival-keyword post does not decide the mood",
  storyMood([
    mention({ sentiment: "negative", topicKind: "rival" }),
    mention({ sentiment: "negative", topicKind: "rival" }),
    mention({ sentiment: "positive" }),
  ]),
  "warm",
);
eq(
  "place: seat keywords are local",
  placeOf([
    mention({ topicKind: "campaign" }),
    mention({ topicKind: "issue" }),
    mention({ topicKind: "national" }),
  ]),
  "local",
);
eq(
  "place: mostly county",
  placeOf([
    mention({ topicKind: "county" }),
    mention({ topicKind: "county" }),
    mention({ topicKind: "national" }),
  ]),
  "county",
);
eq(
  "place: mostly national",
  placeOf([
    mention({ topicKind: "national" }),
    mention({ topicKind: "national" }),
    mention({ topicKind: "campaign" }),
  ]),
  "national",
);
eq(
  "place: a tie goes to the nearest",
  placeOf([mention({ topicKind: "county" }), mention({ topicKind: "national" })]),
  "county",
);

// ---- the line
{
  const line = soWhat({
    mood: "angry",
    place: "local",
    trend: "climbing",
    views: 61_000,
    days: 2,
    outlets: 2,
  });
  eq(
    "the so-what line",
    line,
    "Angry, local, still climbing: 61,000 views in 2 days, 2 outlets have run it. First seen means the first post we found, not proof of who started it.",
  );
  eq(
    "one outlet, under a day",
    soWhat({ mood: "warm", place: "county", trend: "settled", views: 900, days: 0, outlets: 1 }),
    "Warm, county, settled: 900 views in under a day, 1 outlet has run it. First seen means the first post we found, not proof of who started it.",
  );
  eq(
    "no outlet",
    soWhat({
      mood: "mixed",
      place: "national",
      trend: "unchecked",
      views: 0,
      days: 3,
      outlets: 0,
    }).includes("no outlet has run it"),
    true,
  );
  eq(
    "unread mood is said",
    soWhat({
      mood: "unread",
      place: "local",
      trend: "settled",
      views: 1,
      days: 1,
      outlets: 0,
    }).startsWith("Mood not read, local"),
    true,
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
