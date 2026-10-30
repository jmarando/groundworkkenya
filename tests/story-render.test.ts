// Checks for what the story screen says: the name, the first post we found, every pick-up in order,
// a curve of views over time (or the list alone when nothing counted views), who carried it, the
// so-what line with its caveat, and the buttons only for who may use them. Invented posts and
// accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/story-render.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StoryView } from "@/components/gw/listening/StoryView";
import type { Mention } from "@/lib/listening-mention";
import type { StoryData } from "@/lib/stories.functions";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, markup = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${markup ? `\n  in ${markup.slice(0, 900)}` : ""}`);
  }
}

const HOUR = 3_600_000;
const T0 = Date.parse("2026-10-27T14:05:00Z");
const at = (h: number) => new Date(T0 + h * HOUR).toISOString();
let n = 0;
const mention = (o: Partial<Mention> = {}): Mention => ({
  id: `m${++n}`,
  topicId: "t1",
  topic: "Githunguri water",
  source: "x",
  domain: null,
  title: "Taps dry for nine days",
  url: `https://x.com/h${n}/status/${n}`,
  snippet: null,
  publishedAt: at(0),
  foundAt: at(0),
  sentiment: "negative",
  sentimentScore: -0.6,
  issue: "water",
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
  storyId: "s1",
  ...o,
});

const posts = [
  mention({ id: "first", author: "@githunguri_updates", publishedAt: at(0), reach: 11_000 }),
  mention({
    id: "tt",
    source: "tiktok",
    author: "@mtaani_reels",
    url: "https://www.tiktok.com/@mtaani_reels/video/1",
    publishedAt: at(5),
    reach: 34_000,
  }),
  mention({
    id: "paper",
    source: "news",
    domain: "paper.example.test",
    url: "https://paper.example.test/a",
    author: null,
    publishedAt: at(19),
    reach: null,
    sentiment: null,
  }),
  mention({
    id: "paper2",
    source: "news",
    domain: "highlands.example.test",
    url: "https://highlands.example.test/a",
    author: null,
    publishedAt: at(27),
    reach: null,
    sentiment: null,
  }),
];
const reading = (mentionId: string, h: number, reach: number) => ({ mentionId, at: at(h), reach });
const readings = [
  reading("first", 0, 900),
  reading("tt", 5, 12_000),
  reading("first", 6, 4_000),
  reading("first", 24, 11_000),
  reading("tt", 30, 34_000),
];
const story = (o: Partial<StoryData["story"]> = {}): StoryData["story"] => ({
  id: "s1",
  title: "Taps dry for nine days in Githunguri",
  issue: "water",
  status: "new",
  firstSeenAt: at(0),
  lastPostAt: at(27),
  posts: 4,
  voices: 4,
  handledAt: null,
  ...o,
});
const data = (o: Partial<StoryData> = {}): StoryData => ({
  story: story(),
  posts,
  readings,
  canAct: true,
  ...o,
});
const now = T0 + 32 * HOUR;
const render = (d: StoryData, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(StoryView, { data: d, now, back: () => undefined, ...props }));
const idx = (m: string, s: string) => m.indexOf(s);

// ---- the whole story
{
  const m = render(data());
  ok("the name", m.includes("Taps dry for nine days in Githunguri"), m);
  ok("the issue", m.includes("water"), m);
  ok("the first post we found", m.includes("First seen") && m.includes("@githunguri_updates"), m);
  ok(
    "the pick-ups are numbered in time order",
    idx(m, "@githunguri_updates") < idx(m, "@mtaani_reels") &&
      idx(m, "@mtaani_reels") < idx(m, "paper.example.test") &&
      idx(m, "paper.example.test") < idx(m, "highlands.example.test"),
    m,
  );
  ok(
    "with a number each",
    ["1 ·", "2 ·", "3 ·", "4 ·"].every((t) => m.includes(t)),
    m,
  );
  ok("the views at first reading are said for the first", m.includes("900 views at first"), m);
  ok("a curve is drawn", m.includes("<svg") && (m.includes("<polyline") || m.includes("<path")), m);
  ok("with the marks on it", (m.match(/class="sv-mark"/g) ?? []).length === 4, m);
  ok("the share by platform", /TikTok 76%/.test(m) && /X 24%/.test(m), m);
  ok("the top amplifier", m.includes("@mtaani_reels") && /34k/.test(m), m);
  ok(
    "the so-what line, with its caveat",
    m.includes("First seen means the first post we found, not proof of who started it."),
    m,
  );
  ok("two outlets are counted", m.includes("2 outlets have run it"), m);
  ok("the mood and the place", /Angry, local/.test(m), m);
  ok("still climbing", /still climbing/.test(m), m);
  ok("the total is in the line", m.includes("45,000 views"), m);
  ok("no broken values", !/NaN|undefined|Infinity/.test(m), m);
}

// ---- no counts at all: the list stands alone
{
  const m = render(data({ posts: posts.map((p) => ({ ...p, reach: null })), readings: [] }));
  ok(
    "no curve when nothing counted views",
    !m.includes("<svg") && m.includes("No view counts for these posts"),
    m,
  );
  ok("the list is still there", m.includes("First seen") && m.includes("@mtaani_reels"), m);
  ok("and nothing broken", !/NaN|undefined|Infinity/.test(m), m);
}

// ---- one post
{
  const m = render(
    data({
      posts: [posts[0]!],
      readings: [reading("first", 0, 900)],
      story: story({ posts: 1, voices: 1 }),
    }),
  );
  ok("one post still reads", m.includes("First seen") && !/NaN|undefined|Infinity/.test(m), m);
}

// ---- a candidate's own post
{
  const own = mention({
    id: "own",
    rivalId: "r1",
    rival: "Test Rival",
    author: "Test Rival",
    publishedAt: at(2),
    reach: 5_000,
  });
  const m = render(data({ posts: [posts[0]!, own], readings: [] }));
  ok(
    "labelled as theirs",
    m.includes("Test Rival&#x27;s own post") || m.includes("Test Rival's own post"),
    m,
  );
}

// ---- trend
{
  const stale = render(data(), { now: T0 + 60 * HOUR });
  ok(
    "an old last reading is said not to be checked",
    /not checked lately/.test(stale) && !/still climbing/.test(stale),
    stale,
  );
}

// ---- the buttons
{
  const plain = render(data());
  ok(
    "no buttons when none are given",
    !/React/.test(plain) && !/Mark handled/.test(plain) && !/Brief voices/.test(plain),
    plain,
  );
  const all = render(data(), {
    react: () => undefined,
    brief: () => undefined,
    handle: () => undefined,
  });
  ok(
    "react, brief and handle",
    /React/.test(all) && /Brief voices/.test(all) && /Mark handled/.test(all),
    all,
  );
  const handled = render(data({ story: story({ status: "handled", handledAt: at(30) }) }), {
    handle: () => undefined,
  });
  ok(
    "a handled story says so, and offers no second marking",
    /Handled/.test(handled) && !/Mark handled/.test(handled),
    handled,
  );
  const cannot = render(data({ canAct: false }), {
    react: () => undefined,
    brief: () => undefined,
    handle: () => undefined,
  });
  ok(
    "someone who cannot act sees no buttons",
    !/React/.test(cannot) && !/Mark handled/.test(cannot) && !/Brief voices/.test(cannot),
    cannot,
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
