// Checks for Listening's voices: who is behind a post, voices and platforms counted, the
// contrast between platforms, and what is spreading.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/voices.test.ts

import {
  platformContrast,
  platforms,
  spreading,
  voiceOf,
  voices,
  type VoicePost,
} from "@/lib/voices";

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

const now = Date.parse("2026-10-20T12:00:00Z");
let n = 0;
const post = (o: Partial<VoicePost>): VoicePost => ({
  id: `p${++n}`,
  topicId: "t1",
  topic: "Githunguri",
  topicKind: "campaign",
  rivalId: null,
  rival: null,
  rivalIsUs: false,
  source: "facebook",
  domain: null,
  issue: null,
  sentiment: null,
  status: "new",
  publishedAt: "2026-10-19T10:00:00Z",
  foundAt: "2026-10-19T11:00:00Z",
  reach: null,
  commentsRead: null,
  commentsNegative: null,
  url: "https://www.facebook.com/KiambuNews/posts/1",
  author: null,
  ...o,
});

eq("facebook page from the address", voiceOf(post({}))?.name, "KiambuNews");
eq(
  "a facebook story link names nobody",
  voiceOf(post({ url: "https://m.facebook.com/story.php?id=1" })),
  null,
);
eq(
  "x handle",
  voiceOf(post({ source: "x", url: "https://x.com/kenyanpundit/status/9" }))?.name,
  "@kenyanpundit",
);
eq(
  "tiktok author wins",
  voiceOf(
    post({
      source: "tiktok",
      author: "@githunguri_life",
      url: "https://www.tiktok.com/@-/video/1",
    }),
  )?.url,
  "https://www.tiktok.com/@githunguri_life",
);
eq(
  "news site",
  voiceOf(post({ source: "news", domain: "nation.africa", url: "https://nation.africa/x" }))?.key,
  "site:nation.africa",
);
eq(
  "reddit community",
  voiceOf(post({ source: "reddit", url: "https://www.reddit.com/r/Kenya/comments/1/x" }))?.name,
  "r/Kenya",
);

const rows = [
  post({ sentiment: "negative" }),
  post({ sentiment: "negative" }),
  post({ sentiment: "positive", url: "https://www.facebook.com/KiambuNews/posts/2" }),
  post({
    source: "tiktok",
    author: "@clip",
    reach: 12000,
    sentiment: "positive",
    url: "https://www.tiktok.com/@clip/video/1",
  }),
  post({
    source: "tiktok",
    author: "@clip",
    reach: 3000,
    sentiment: "positive",
    url: "https://www.tiktok.com/@clip/video/2",
    status: "actioned",
  }),
  post({
    source: "tiktok",
    author: "@old",
    reach: 90000,
    publishedAt: "2026-08-01T00:00:00Z",
    url: "https://www.tiktok.com/@old/video/3",
  }),
  post({
    rivalId: "r1",
    rival: "Kago",
    source: "facebook",
    url: "https://www.facebook.com/kagowalydia/posts/3",
    reach: 500,
  }),
];
const v = voices(rows, { now, days: 30 });
eq(
  "most seen first; old and rivals' own left out",
  v.map((x) => [x.name, x.posts, x.reach]),
  [
    ["@clip", 2, 15000],
    ["KiambuNews", 3, null],
  ],
);
eq("mood towards you", v[1]!.mood, -1 / 3);
const p = platforms(rows, { now, days: 30 });
eq(
  "platforms by posts",
  p.map((x) => [x.platform, x.posts, x.angry]),
  [
    ["facebook", 3, 2 / 3],
    ["tiktok", 2, 0],
  ],
);
eq("too few rated posts: no contrast", platformContrast(p), null);
eq(
  "spreading: unhandled first, over the bar, last two days",
  spreading(rows, 2000, now).map((x) => x.reach),
  [12000, 3000],
);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
