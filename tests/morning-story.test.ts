// Checks for this morning's story: what the AI may say, the fallback to
// headlines, the team's own story, and reading a stored story. Pure; nothing
// leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story.test.ts

import {
  checkStory,
  cleanTeamStory,
  headlinesStory,
  kicker,
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
  "no story: the morning's top links",
  [top.kind, top.headline, top.also.length],
  ["headlines", null, 3],
);

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
    "No news about the race in the last day.",
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
