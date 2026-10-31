// Checks for this morning's story: what the AI may say, the fallback to
// headlines, the team's own story, and reading a stored story. Pure; nothing
// leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story.test.ts

import {
  outletOf,
  rivalsLately,
  carriedLine,
  checkStory,
  cleanTeamStory,
  headlinesStory,
  isPost,
  kicker,
  leadItem,
  noStoryLine,
  storyFromRow,
  storyItems,
  type MentionRow,
} from "@/lib/morning-story";

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

const mention = (url: string, title: string | null, snippet: string | null = null): MentionRow => ({
  title,
  snippet,
  url,
  source: "news",
  domain: "nation.africa",
  published_at: "2026-09-30T04:00:00Z",
});
const ROWS = [
  mention(
    "https://nation.africa/rationing",
    "Rationing extended in 14 Eastlands wards",
    "Supply cut to 1.1 million residents.",
  ),
  mention("https://nation.africa/rationing", "The same story again"),
  mention("javascript:alert(1)", "Not a web link"),
  mention(
    "https://the-star.co.ke/drains",
    "Drains blocked on Jogoo Road",
    "Rains expected on Friday.",
  ),
  mention("https://kenyans.co.ke/no-title", null),
  mention("https://citizen.digital/hawkers", "Hawkers moved from the CBD"),
];
const ITEMS = storyItems(ROWS);
eq(
  "the morning's items: titled web links, each once, numbered",
  ITEMS.map((i) => [i.n, i.url]),
  [
    [1, "https://nation.africa/rationing"],
    [2, "https://the-star.co.ke/drains"],
    [3, "https://citizen.digital/hawkers"],
  ],
);

const ANSWER = {
  noStory: false,
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: "Water is the race's loudest issue.",
  rivals: "Babu Owino blames City Hall.",
  line: "Tankers to every ward this week.",
  figures: [
    { value: "14", label: "wards on rationing", item: 1 },
    { value: "1.1 million", label: "people affected", item: 2 },
    { value: "380k", label: "voters", item: 1 },
  ],
  items: [1, 9],
  also: [
    { item: 2, soWhat: "Floods next." },
    { item: 1, soWhat: "Already the lead." },
    { item: 7, soWhat: "No such item." },
    { item: 3, soWhat: "Traders are angry." },
  ],
};
const story = checkStory(ANSWER, ITEMS);
eq(
  "a story that holds up",
  [story?.kind, story?.headline, story?.sources.map((s) => s.url)],
  ["written", "Rationing hits Eastlands", ["https://nation.africa/rationing"]],
);
eq("a figure from another item is dropped, and one in no item", story?.figures, [
  { value: "14", label: "wards on rationing" },
]);
eq(
  "also this morning: real items other than the lead",
  story?.also.map((a) => [a.url, a.soWhat]),
  [
    ["https://the-star.co.ke/drains", "Floods next."],
    ["https://citizen.digital/hawkers", "Traders are angry."],
  ],
);
eq("the story says how much it was written from", [story?.from, story?.picks.length], [3, 3]);
eq("resting on no real item: no story", checkStory({ ...ANSWER, items: [8, 9] }, ITEMS), null);
eq("no headline: no story", checkStory({ ...ANSWER, headline: " " }, ITEMS), null);
eq("the AI says there's no story", checkStory({ ...ANSWER, noStory: true }, ITEMS), null);
eq("an answer that isn't one", checkStory("nonsense", ITEMS), null);

const top = headlinesStory(ITEMS);
eq(
  "no story: the lead, with its own words, and the morning's other links",
  [top.kind, top.headline, top.summary, top.sources.map((l) => l.url), top.also.length],
  [
    "headlines",
    "Rationing extended in 14 Eastlands wards",
    "Supply cut to 1.1 million residents.",
    ["https://nation.africa/rationing"],
    2,
  ],
);
eq(
  "the lead is not listed again among the others",
  top.also.some((a) => a.url === "https://nation.africa/rationing"),
  false,
);
eq(
  "no news at all: no lead, and nothing made up",
  (() => {
    const none = headlinesStory([]);
    return [none.headline, none.summary, none.sources.length, none.also.length, none.from];
  })(),
  [null, null, 0, 0, 0],
);

// The lead: local first, but never local only, and never a bare link while a sentence exists.
{
  const item = (n: number, scope: "seat" | "county" | "rival" | "national", text: string) => ({
    n,
    title: `Title ${n}`,
    url: `https://example.test/${n}`,
    source: "news",
    publishedAt: null,
    scope,
    text: `Title ${n} ${text}`.trim(),
  });
  const body = "A full sentence of what happened, with detail.";
  eq(
    "the seat's own, when it says something",
    leadItem([item(1, "national", body), item(2, "seat", body)])?.n,
    2,
  );
  eq(
    "a quiet seat leads with the county, not a bare local link",
    leadItem([item(1, "seat", ""), item(2, "county", body), item(3, "national", body)])?.n,
    2,
  );
  eq(
    "and with the nation when the county has nothing either",
    leadItem([item(1, "seat", ""), item(2, "national", body)])?.n,
    2,
  );
  eq(
    "with no sentence anywhere, the first there is",
    leadItem([item(1, "seat", ""), item(2, "county", "")])?.n,
    1,
  );
  eq("no items, no lead", leadItem([]), null);

  // An outlet's report before a post on a platform: a post is what people say, not what happened.
  const tweet = (n: number, scope: "seat" | "county" | "rival" | "national", text: string) => ({
    ...item(n, scope, text),
    url: `https://x.com/someone/status/${n}`,
    source: "x.com",
  });
  eq(
    "a platform's posts are told from an outlet's reports",
    [
      "https://x.com/a/status/1",
      "https://twitter.com/a/status/1",
      "https://www.facebook.com/p/1",
      "https://m.facebook.com/p/1",
      "https://www.reddit.com/r/Kenya/comments/1",
      "https://www.youtube.com/watch?v=1",
      "https://www.tiktok.com/@a/video/1",
      "https://www.instagram.com/p/1",
      "https://www.the-star.co.ke/story",
      "https://nation.africa/story",
      "not a link",
    ].map((url) => isPost({ url })),
    [true, true, true, true, true, true, true, true, false, false, false],
  );
  eq(
    "the seat's own tweet does not lead while the county has a report",
    leadItem([tweet(1, "seat", body), item(2, "county", body)])?.n,
    2,
  );
  eq(
    "a bare headline from an outlet leads before a tweet with a sentence",
    leadItem([tweet(1, "seat", body), item(2, "national", "")])?.n,
    2,
  );
  eq(
    "with only posts, the seat's own still leads: never empty",
    leadItem([tweet(1, "national", body), tweet(2, "seat", body)])?.n,
    2,
  );
  const mixed = headlinesStory([
    tweet(1, "seat", body),
    item(2, "county", body),
    tweet(3, "county", body),
    item(4, "seat", ""),
    item(5, "national", body),
  ]);
  eq(
    "headlines: a report leads, and the other reports come before any post",
    [mixed.sources.map((l) => l.url), mixed.also.map((a) => a.url)],
    [
      ["https://example.test/2"],
      [
        "https://example.test/4",
        "https://example.test/5",
        "https://x.com/someone/status/1",
        "https://x.com/someone/status/3",
      ],
    ],
  );
  // Trust before place: an outlet we know leads before a site we do not, the seat's own among equals.
  const known = (n: number, scope: "seat" | "county" | "rival" | "national", text: string) => ({
    ...item(n, scope, text),
    url: `https://www.standardmedia.co.ke/story-${n}`,
    source: "standardmedia.co.ke",
  });
  eq(
    "an outlet we know leads before the seat's own from a site we do not",
    leadItem([item(1, "seat", body), known(2, "county", body)])?.n,
    2,
  );
  eq(
    "among outlets we know, the seat's own comes first",
    leadItem([known(1, "national", body), known(2, "seat", body), item(3, "seat", body)])?.n,
    2,
  );
  eq(
    "with no outlet we know, the seat's own site leads as before",
    leadItem([item(1, "county", body), item(2, "seat", body)])?.n,
    2,
  );
  eq(
    "in one place: an outlet we know, then another site, then a post",
    storyItems([
      mention("https://x.com/a/status/9", "A tweet found a minute ago"),
      mention("https://some-blog.example/post", "A blog found ten minutes ago"),
      mention("https://www.the-star.co.ke/report", "A report found an hour ago"),
    ]).map((i) => i.url),
    [
      "https://www.the-star.co.ke/report",
      "https://some-blog.example/post",
      "https://x.com/a/status/9",
    ],
  );
  eq(
    "the outlets the sweep reads are named",
    [
      "https://eastleighvoice.co.ke/a",
      "https://nairobileo.co.ke/a",
      "https://thekenyatimes.com/a",
    ].map((url) => outletOf({ url, source: "web" })),
    ["Eastleigh Voice", "Nairobi Leo", "The Kenya Times"],
  );
  eq(
    "the morning's items put a report ahead of a newer tweet in the same place",
    storyItems([
      mention("https://x.com/a/status/9", "A tweet found a minute ago"),
      mention("https://the-star.co.ke/report", "A report found an hour ago"),
    ]).map((i) => [i.n, i.url]),
    [
      [1, "https://the-star.co.ke/report"],
      [2, "https://x.com/a/status/9"],
    ],
  );

  const two = headlinesStory([
    item(1, "seat", "Supply cut to 1.1 million residents. Rains are due Friday. A third line."),
  ]);
  eq(
    "the summary is the lead's first two sentences, and a decimal does not end one",
    two.summary,
    "Supply cut to 1.1 million residents. Rains are due Friday.",
  );
  const long = headlinesStory([item(1, "seat", `${"word ".repeat(120)}end.`)]);
  eq(
    "a long one is cut at a word",
    [long.summary!.endsWith("…"), long.summary!.length <= 321, /word…$/.test(long.summary!)],
    [true, true, true],
  );
  const stored = storyFromRow(
    {
      day: "2026-09-30",
      story: two,
      written_by: "groundwork",
      created_at: "2026-09-30T03:04:00Z",
      edited_at: null,
    },
    null,
  );
  eq(
    "a headlines story with a lead survives being stored and read back",
    [stored?.story.kind, stored?.story.headline, stored?.story.sources[0]?.url],
    ["headlines", "Title 1", "https://example.test/1"],
  );
}

const own = cleanTeamStory(
  {
    headline: " Our water plan ",
    summary: "Tankers go out today.",
    links: ["https://ours.test/plan"],
  },
  story,
);
eq(
  "the team's story, with its own link",
  [own.headline, own.sources.map((s) => s.url), own.figures, own.also.length],
  ["Our water plan", ["https://ours.test/plan"], [], 2],
);
eq(
  "an edit without links keeps the story's sources and figures",
  [
    cleanTeamStory({ headline: "Rationing, again", summary: "Still 14 wards." }, story).sources
      .length,
    cleanTeamStory({ headline: "Rationing, again", summary: "Still 14 wards." }, story).figures
      .length,
  ],
  [1, 1],
);
refuses(
  "links must be https",
  () =>
    cleanTeamStory({ headline: "Our plan", summary: "Soon.", links: ["http://ours.test"] }, null),
  "Links must start with https://.",
);
refuses(
  "a headline is needed",
  () => cleanTeamStory({ headline: "", summary: "Soon." }, null),
  "Give the story a headline.",
);
refuses(
  "and a summary",
  () => cleanTeamStory({ headline: "Our plan", summary: "" }, null),
  "Say what happened in a line or two.",
);

const stored = {
  day: "2026-09-30",
  story: {
    ...story,
    sources: [
      ...(story?.sources ?? []),
      { title: "Bad", url: "javascript:alert(1)", source: "x", publishedAt: null },
    ],
  },
  written_by: "groundwork",
  created_at: "2026-09-30T03:04:00Z",
  edited_at: null,
};
const view = storyFromRow(stored, null);
eq("a stored link that isn't the web is left out", view?.story.sources.length, 1);
eq("Groundwork's story", kicker(view!), "Written by Groundwork at 06:04 from 3 sources");
eq(
  "the team's edit",
  kicker(
    storyFromRow(
      { ...stored, written_by: "team", edited_at: "2026-09-30T04:10:00Z" },
      "Njeri Kamau",
    )!,
  ),
  "Edited by Njeri Kamau at 07:10",
);
eq(
  "the morning's headlines",
  kicker(storyFromRow({ ...stored, story: top }, null)!),
  "This morning's top stories, gathered at 06:04",
);
eq(
  "a malformed story is not shown",
  storyFromRow({ ...stored, story: { kind: "poem" } }, null),
  null,
);

// With no story to show: still loading, before six, or a morning without news.
eq(
  "what the story block says without a story",
  [noStoryLine(true, "09:00"), noStoryLine(false, "05:30"), noStoryLine(false, "09:00")],
  [
    "Reading this morning's story…",
    "This morning's story is written at 6:00 from the news Listening finds.",
    "No news about the race in the last week.",
  ],
);

{
  const v = {
    day: "2026-10-17",
    story: headlinesStory([]),
    writtenBy: "groundwork" as const,
    at: "2026-10-17T03:00:00Z",
    editedBy: null,
  };
  eq(
    "an earlier day's story says so",
    carriedLine(v, "2026-10-19"),
    "Today's story is not in yet. This is Saturday 17 October's, until it is.",
  );
  eq("today's says nothing", carriedLine({ ...v, day: "2026-10-19" }, "2026-10-19"), null);
}

{
  const row = (url: string, title: string, kind: string | null, extra = {}) => ({
    url,
    title,
    snippet: null,
    source: "web",
    domain: null,
    published_at: null,
    kind,
    label: kind === "rival" ? "Charles Thiong'o" : null,
    ...extra,
  });
  const national = Array.from({ length: 12 }, (_, k) =>
    row(`https://n.test/${k}`, `National story number ${k}`, "national"),
  );
  const got = storyItems(
    [
      ...national,
      row("https://s.test/1", "Githunguri dairy farmers paid late", "issue"),
      row("https://c.test/1", "Kiambu assembly passes the budget", "county"),
      row("https://r.test/1", "Thiong'o tours Komothai", "rival"),
      row("https://x.com/citizentvkenya/status/1", "#AD", "county"),
      row("https://a.test/1", "Sponsored: plots in Ruiru", "seat"),
      row("https://o.test/1", "Mombasa girl relocating to Kisumu", "issue", { issue: "off-topic" }),
      row("https://s.test/2", "Githunguri dairy farmers paid late!", "issue"),
    ],
    10,
  );
  eq(
    "the seat first, then the county and the rivals, national to its share; no adverts or repeats",
    got.map((i) => [i.n, i.scope, i.title]),
    [
      [1, "seat", "Githunguri dairy farmers paid late"],
      [2, "county", "Kiambu assembly passes the budget"],
      [3, "rival", "Thiong'o tours Komothai"],
      [4, "national", "National story number 0"],
      [5, "national", "National story number 1"],
      [6, "national", "National story number 2"],
      [7, "national", "National story number 3"],
      [8, "national", "National story number 4"],
      [9, "national", "National story number 5"],
      [10, "national", "National story number 6"],
    ],
  );
  eq("a rival's item says whose", got[2]?.about, "Charles Thiong'o");

  const answer = {
    headline: "Dairy payments late",
    summary: "Farmers say payments are late.",
    items: [1],
    rivals: "Rivals haven't spoken on it.",
    rivalItems: [3],
  };
  const st = checkStory(answer, got)!;
  eq("no line on the rivals is left out, not printed", [st.rivals, st.rivalSources], [null, []]);
  const st2 = checkStory(
    { ...answer, rivals: "Thiong'o toured Komothai on dairy.", rivalItems: [3, 99] },
    got,
  )!;
  eq(
    "a rivals' line keeps the items it rests on",
    st2.rivalSources.map((l) => l.url),
    ["https://r.test/1"],
  );
  eq(
    "rivals lately: their own posts, then items about them",
    rivalsLately(
      [{ title: "Own", url: "https://x.com/thiongo/status/9", source: "x", publishedAt: null }],
      got,
    ).map((l) => l.url),
    ["https://x.com/thiongo/status/9", "https://r.test/1"],
  );
}
eq(
  "outlets in words",
  [
    "https://www.the-star.co.ke/news/x",
    "https://x.com/TheStarKenya/status/1",
    "https://www.facebook.com/100044345233644/posts/1",
    "https://www.tiktok.com/@wamuchomba/video/1",
    "https://example.org/a",
  ].map((url) => outletOf({ url, source: "web" })),
  ["The Star", "@TheStarKenya on X", "Facebook", "@wamuchomba on TikTok", "example.org"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
